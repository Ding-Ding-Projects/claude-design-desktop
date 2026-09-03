/**
 * Secret storage is deliberately an adapter. The production desktop supplies an
 * operating-system credential-vault adapter; the memory adapter exists for tests
 * and short-lived browser sessions only. Neither adapter serializes secrets.
 */
export interface SecretVault {
  put(ref: string, value: string): Promise<void>;
  get(ref: string): Promise<string | undefined>;
  delete(ref: string): Promise<void>;
  has(ref: string): Promise<boolean>;
}

export type VaultStatus = { available: true } | { available: false; reason: string };

export interface OperatingSystemVaultBackend {
  put(ref: string, value: string): Promise<void>;
  get(ref: string): Promise<string | undefined>;
  delete(ref: string): Promise<void>;
  has(ref: string): Promise<boolean>;
}

export class OperatingSystemSecretVault implements SecretVault {
  constructor(private readonly backend: OperatingSystemVaultBackend | undefined) {}

  status(): VaultStatus {
    return this.backend ? { available: true } : { available: false, reason: "The operating-system credential vault is unavailable" };
  }

  async put(ref: string, value: string): Promise<void> { return this.requireBackend().put(ref, value); }
  async get(ref: string): Promise<string | undefined> { return this.requireBackend().get(ref); }
  async delete(ref: string): Promise<void> { return this.requireBackend().delete(ref); }
  async has(ref: string): Promise<boolean> { return this.requireBackend().has(ref); }

  private requireBackend(): OperatingSystemVaultBackend {
    if (!this.backend) throw new Error("Credential vault unavailable; no secret was persisted");
    return this.backend;
  }
}

export class UnavailableSecretVault implements SecretVault {
  constructor(private readonly reason = "The operating-system credential vault is unavailable") {}
  async put(): Promise<void> { throw new Error(this.reason); }
  async get(): Promise<undefined> { return undefined; }
  async delete(): Promise<void> { throw new Error(this.reason); }
  async has(): Promise<boolean> { return false; }
}

export class MemorySecretVault implements SecretVault {
  private readonly values = new Map<string, string>();

  async put(ref: string, value: string): Promise<void> {
    this.values.set(ref, value);
  }

  async get(ref: string): Promise<string | undefined> {
    return this.values.get(ref);
  }

  async delete(ref: string): Promise<void> {
    this.values.delete(ref);
  }

  async has(ref: string): Promise<boolean> {
    return this.values.has(ref);
  }
}

export function randomId(prefix = "id"): string {
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) throw new Error("Secure randomness is unavailable");
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function digestText(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifySecret(vault: SecretVault, ref: string, candidate: string): Promise<boolean> {
  const stored = await vault.get(ref);
  if (stored === undefined) {
    return false;
  }
  let record: PasswordRecord;
  try {
    record = JSON.parse(stored) as PasswordRecord;
  } catch {
    return false;
  }
  if (record.version === 2 && record.algorithm === "memory-sha256") {
    const computed = await legacyMemoryDigest(candidate, hexToBytes(record.salt), record.memoryBytes, record.rounds);
    if (!fixedTimeEqual(computed, hexToBytes(record.hash))) return false;
    await storeHashedSecret(vault, ref, candidate);
    return true;
  }
  if (record.version !== 3 || record.algorithm !== "pbkdf2-sha256" || typeof record.salt !== "string" || typeof record.hash !== "string") return false;
  const computed = await bundledKdf(candidate, hexToBytes(record.salt), record.iterations);
  return fixedTimeEqual(computed, hexToBytes(record.hash));
}

export async function storeHashedSecret(vault: SecretVault, ref: string, secret: string): Promise<void> {
  if (!secret) throw new Error("Secret must not be empty");
  const salt = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) throw new Error("Secure randomness is unavailable");
  globalThis.crypto.getRandomValues(salt);
  const iterations = 310_000;
  const hash = await bundledKdf(secret, salt, iterations);
  const record: PasswordRecord = { version: 3, algorithm: "pbkdf2-sha256", salt: bytesToHex(salt), iterations, hash: bytesToHex(hash) };
  await vault.put(ref, JSON.stringify(record));
}

type PasswordRecord =
  | { version: 2; algorithm: "memory-sha256"; salt: string; memoryBytes: number; rounds: number; hash: string }
  | { version: 3; algorithm: "pbkdf2-sha256"; salt: string; iterations: number; hash: string };

async function bundledKdf(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) throw new Error("KDF iterations are out of bounds");
  const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secret) as unknown as BufferSource, "PBKDF2", false, ["deriveBits"]);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

async function legacyMemoryDigest(secret: string, salt: Uint8Array, memoryBytes: number, rounds: number): Promise<Uint8Array> {
  if (!Number.isInteger(memoryBytes) || memoryBytes < 16 * 1024 || memoryBytes > 256 * 1024 || !Number.isInteger(rounds) || rounds < 1 || rounds > 8) throw new Error("Password verifier parameters are out of bounds");
  const memory = new Uint8Array(memoryBytes);
  const encodedSecret = new TextEncoder().encode(secret);
  for (let offset = 0; offset < memory.length; offset += 32) {
    const seed = new Uint8Array(encodedSecret.length + salt.length + 4);
    seed.set(encodedSecret);
    seed.set(salt, encodedSecret.length);
    new DataView(seed.buffer).setUint32(encodedSecret.length + salt.length, offset, false);
    memory.set(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", seed)).slice(0, Math.min(32, memory.length - offset)), offset);
  }
  for (let round = 0; round < rounds; round += 1) {
    const mixed = new Uint8Array(memory.length + salt.length + 4);
    mixed.set(memory);
    mixed.set(salt, memory.length);
    new DataView(mixed.buffer).setUint32(memory.length + salt.length, round, false);
    memory.set(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", mixed)).slice(0, memory.length), 0);
  }
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", memory));
}

function fixedTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return new Uint8Array();
  return new Uint8Array(value.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
}

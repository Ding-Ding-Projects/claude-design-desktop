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
  globalThis.crypto?.getRandomValues(bytes);
  if (bytes.every((byte) => byte === 0)) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
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
  return (await digestText(candidate)) === stored;
}

export async function storeHashedSecret(vault: SecretVault, ref: string, secret: string): Promise<void> {
  await vault.put(ref, await digestText(secret));
}

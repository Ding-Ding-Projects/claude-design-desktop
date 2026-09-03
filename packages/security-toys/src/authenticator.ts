import { parseOtpAuthUri, totpCode, verifyTotpCode, type TotpUri } from "./totp";
import type { RedactedTotpEntry, TotpEntry } from "./types";
import { randomId, SecretVault } from "./vault";

export type AuthenticatorInput = TotpUri & { source: "uri" | "qr-image" | "clipboard" | "camera" | "manual" };
export const MAX_QR_INPUT_BYTES = 1_048_576;
export interface LocalQrInputAdapters {
  decodeImage(bytes: Uint8Array): string;
  readClipboard(): string | undefined;
  scanCamera(): string | undefined;
}

export class AuthenticatorManager {
  private readonly entries = new Map<string, TotpEntry>();
  private readonly vault: SecretVault;
  private readonly now: () => number;

  constructor(vault: SecretVault, now: () => number = () => Date.now()) {
    this.vault = vault;
    this.now = now;
  }

  async add(input: AuthenticatorInput): Promise<RedactedTotpEntry> {
    validateAuthenticatorInput(input);
    const id = randomId("totp");
    const secretRef = randomId("totp-secret");
    await this.vault.put(secretRef, input.secret);
    const entry: TotpEntry = {
      id,
      issuer: input.issuer,
      account: input.account,
      algorithm: input.algorithm,
      digits: input.digits,
      period: input.period,
      secretRef,
      createdAt: this.now()
    };
    this.entries.set(id, entry);
    return redact(entry);
  }

  async importUri(uri: string, source: AuthenticatorInput["source"] = "uri"): Promise<RedactedTotpEntry> {
    return this.add({ ...parseOtpAuthUri(uri), source });
  }

  async addManual(input: Omit<AuthenticatorInput, "source">): Promise<RedactedTotpEntry> {
    return this.add({ ...input, source: "manual" });
  }

  async addFromClipboard(uri: string): Promise<RedactedTotpEntry> {
    return this.importUri(uri, "clipboard");
  }

  async addFromQrImage(uri: string): Promise<RedactedTotpEntry> {
    return this.importUri(uri, "qr-image");
  }

  async importFromImage(bytes: Uint8Array, decoder: (bytes: Uint8Array) => string): Promise<RedactedTotpEntry> {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_QR_INPUT_BYTES) throw new Error("QR image input is empty or exceeds the local size limit");
    return this.importUri(decoder(bytes), "qr-image");
  }

  async importFromClipboard(read: () => string | undefined): Promise<RedactedTotpEntry> {
    const value = read();
    if (!value) throw new Error("Clipboard has no authenticator URI");
    return this.importUri(value, "clipboard");
  }

  async importFromCamera(scan: () => string | undefined): Promise<RedactedTotpEntry> {
    const value = scan();
    if (!value) throw new Error("Camera returned no authenticator URI");
    return this.importUri(value, "camera");
  }

  async addFromCamera(uri: string): Promise<RedactedTotpEntry> {
    return this.importUri(uri, "camera");
  }

  async importQrText(qrText: string, source: "qr-image" | "clipboard" | "camera"): Promise<RedactedTotpEntry> {
    return this.importUri(qrText, source);
  }

  list(): RedactedTotpEntry[] {
    return Array.from(this.entries.values(), redact);
  }

  search(query: string): RedactedTotpEntry[] {
    const normalized = query.trim().toLocaleLowerCase();
    return this.list().filter((entry) => `${entry.issuer} ${entry.account}`.toLocaleLowerCase().includes(normalized));
  }

  async code(id: string, timestamp = this.now()): Promise<{ code: string; secondsRemaining: number; nextCode: string }> {
    const entry = this.require(id);
    const secret = await this.secret(entry);
    const seconds = Math.floor(timestamp / 1000);
    const elapsed = seconds % entry.period;
    return {
      code: await totpCode(secret, { ...entry, timestamp }),
      secondsRemaining: entry.period - elapsed,
      nextCode: await totpCode(secret, { ...entry, timestamp: timestamp + entry.period * 1000 })
    };
  }

  async verify(id: string, candidate: string, timestamp = this.now()): Promise<boolean> {
    const entry = this.require(id);
    return verifyTotpCode(await this.secret(entry), candidate, { ...entry, timestamp });
  }

  async remove(id: string): Promise<void> {
    const entry = this.require(id);
    await this.vault.delete(entry.secretRef);
    this.entries.delete(id);
  }

  exportRedacted(): string {
    return JSON.stringify({ version: 1, secretsOmitted: true, entries: this.list() }, null, 2);
  }

  private async secret(entry: TotpEntry): Promise<string> {
    const secret = await this.vault.get(entry.secretRef);
    if (!secret) throw new Error("Authenticator secret is unavailable in the credential vault");
    return secret;
  }

  private require(id: string): TotpEntry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown authenticator entry: ${id}`);
    return entry;
  }
}

function validateAuthenticatorInput(input: AuthenticatorInput): void {
  if (!input.issuer.trim() || !input.account.trim()) throw new Error("Issuer and account are required");
  if (!input.secret.trim()) throw new Error("Authenticator secret is required");
  if (!Number.isInteger(input.period) || input.period < 1 || input.period > 86_400) throw new Error("Period is out of bounds");
  if (![6, 7, 8].includes(input.digits)) throw new Error("Digits must be 6, 7, or 8");
  if (!( ["SHA-1", "SHA-256", "SHA-512"] as readonly string[]).includes(input.algorithm)) throw new Error("Algorithm is unsupported");
}

function redact(entry: TotpEntry): RedactedTotpEntry {
  const { secretRef: _secretRef, ...safe } = entry;
  return { ...safe, secretStored: true };
}

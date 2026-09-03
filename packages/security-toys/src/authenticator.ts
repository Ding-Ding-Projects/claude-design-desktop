import { normalizeBase32, parseOtpAuthUri, totpCodeAt, verifyTotpCode, type TotpUri } from "./totp";
import type { RedactedTotpEntry, TotpEntry } from "./types";
import { randomId, SecretVault } from "./vault";
import { MainProcessPairingService, type PairingDisplay } from "./pairing-service";

export type AuthenticatorInput = TotpUri & { source: "uri" | "qr-image" | "clipboard" | "camera" | "manual" };
export const MAX_QR_INPUT_BYTES = 1_048_576;
export interface LocalQrInputAdapters {
  decodeImage(bytes: Uint8Array): string;
  readClipboard(): string | undefined;
  scanCamera(): string | undefined;
}

export type AuthenticatorGroup = { id: string; name: string; order: number };

export interface AuthenticatorMetadataStore {
  listEntries(): RedactedTotpEntry[];
  saveEntry(entry: RedactedTotpEntry): void;
  removeEntry(id: string): void;
  listGroups(): AuthenticatorGroup[];
  saveGroup(group: AuthenticatorGroup): void;
}

export interface AuthenticatorSecretReferenceStore {
  get(id: string): string | undefined;
  set(id: string, secretRef: string): void;
  delete(id: string): void;
}

export class MemoryAuthenticatorMetadataStore implements AuthenticatorMetadataStore {
  private readonly entries = new Map<string, RedactedTotpEntry>();
  private readonly groups = new Map<string, AuthenticatorGroup>();
  listEntries(): RedactedTotpEntry[] { return Array.from(this.entries.values(), (entry) => ({ ...entry })); }
  saveEntry(entry: RedactedTotpEntry): void { this.entries.set(entry.id, { ...entry }); }
  removeEntry(id: string): void { this.entries.delete(id); }
  listGroups(): AuthenticatorGroup[] { return Array.from(this.groups.values(), (group) => ({ ...group })); }
  saveGroup(group: AuthenticatorGroup): void { this.groups.set(group.id, { ...group }); }
}

export class MemoryAuthenticatorSecretReferenceStore implements AuthenticatorSecretReferenceStore {
  private readonly refs = new Map<string, string>();
  get(id: string): string | undefined { return this.refs.get(id); }
  set(id: string, secretRef: string): void { this.refs.set(id, secretRef); }
  delete(id: string): void { this.refs.delete(id); }
}

export class AuthenticatorManager {
  private readonly entries = new Map<string, TotpEntry>();
  private readonly vault: SecretVault;
  private readonly now: () => number;
  private readonly metadata: AuthenticatorMetadataStore;
  private readonly secretRefs: AuthenticatorSecretReferenceStore;
  private readonly pairing: MainProcessPairingService;

  constructor(vault: SecretVault, now: () => number = () => Date.now(), metadata: AuthenticatorMetadataStore = new MemoryAuthenticatorMetadataStore(), secretRefs: AuthenticatorSecretReferenceStore = new MemoryAuthenticatorSecretReferenceStore(), pairing = new MainProcessPairingService(vault, now)) {
    this.vault = vault;
    this.now = now;
    this.metadata = metadata;
    this.secretRefs = secretRefs;
    this.pairing = pairing;
    for (const entry of metadata.listEntries()) this.entries.set(entry.id, { ...entry, secretRef: secretRefs.get(entry.id) ?? "" });
  }

  async add(input: AuthenticatorInput): Promise<RedactedTotpEntry> {
    validateAuthenticatorInput(input);
    const normalizedSecret = normalizeBase32(input.secret);
    const id = randomId("totp");
    const secretRef = randomId("totp-secret");
    await this.vault.put(secretRef, normalizedSecret);
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
    this.secretRefs.set(id, secretRef);
    this.metadata.saveEntry(redact(entry));
    return redact(entry);
  }

  async importUri(uri: string, source: AuthenticatorInput["source"] = "uri"): Promise<RedactedTotpEntry> {
    return this.add({ ...parseOtpAuthUri(uri), source });
  }

  async addManual(input: Omit<AuthenticatorInput, "source">): Promise<RedactedTotpEntry> {
    return this.add({ ...input, source: "manual" });
  }

  startPairing(issuer: string, account: string, options: Parameters<MainProcessPairingService["start"]>[2] = {}): PairingDisplay {
    return this.pairing.start(issuer, account, options);
  }

  async confirmPairing(pairingId: string, code: string): Promise<RedactedTotpEntry | undefined> {
    const handoff = await this.pairing.confirm(pairingId, code);
    if (!handoff) return undefined;
    const entry: TotpEntry = { id: randomId("totp"), issuer: handoff.issuer, account: handoff.account, algorithm: handoff.algorithm, digits: handoff.digits, period: handoff.period, secretRef: handoff.secretRef, createdAt: this.now() };
    this.entries.set(entry.id, entry);
    this.secretRefs.set(entry.id, entry.secretRef);
    this.metadata.saveEntry(redact(entry));
    return redact(entry);
  }

  cancelPairing(pairingId: string): void { this.pairing.cancel(pairingId); }

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

  async code(id: string): Promise<{ code: string; secondsRemaining: number; nextCode: string }> {
    const entry = this.require(id);
    const secret = await this.secret(entry);
    const timestamp = this.now();
    const seconds = Math.floor(timestamp / 1000);
    const elapsed = seconds % entry.period;
    return {
      code: await totpCodeAt(secret, timestamp, { ...entry }),
      secondsRemaining: entry.period - elapsed,
      nextCode: await totpCodeAt(secret, timestamp + entry.period * 1000, { ...entry })
    };
  }

  async verify(id: string, candidate: string): Promise<boolean> {
    const entry = this.require(id);
    return verifyTotpCode(await this.secret(entry), candidate, { ...entry });
  }

  async remove(id: string): Promise<void> {
    const entry = this.require(id);
    await this.vault.delete(entry.secretRef);
    this.entries.delete(id);
    this.secretRefs.delete(id);
    this.metadata.removeEntry(id);
  }

  groups(): AuthenticatorGroup[] { return this.metadata.listGroups().sort((left, right) => left.order - right.order); }

  createGroup(name: string): AuthenticatorGroup {
    if (!name.trim() || name.length > 120) throw new Error("Authenticator group name is required and bounded");
    const group = { id: randomId("totp-group"), name: name.trim(), order: this.groups().length };
    this.metadata.saveGroup(group);
    return { ...group };
  }

  moveToGroup(id: string, groupId: string | undefined): RedactedTotpEntry {
    const entry = this.require(id);
    if (groupId && !this.groups().some((group) => group.id === groupId)) throw new Error("Unknown authenticator group");
    entry.groupId = groupId;
    this.metadata.saveEntry(redact(entry));
    return redact(entry);
  }

  reorder(ids: string[]): RedactedTotpEntry[] {
    const current = this.list();
    const expected = new Set(current.map((entry) => entry.id));
    if (ids.length !== expected.size || new Set(ids).size !== ids.length || ids.some((id) => !expected.has(id))) throw new Error("Authenticator reorder must name each entry exactly once");
    ids.forEach((id, order) => { const entry = this.require(id); entry.order = order; this.metadata.saveEntry(redact(entry)); });
    return this.list().sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  }

  async bulkRemove(ids: string[], authorize: () => Promise<boolean>): Promise<number> {
    const unique = [...new Set(ids)];
    unique.forEach((id) => this.require(id));
    if (!await authorize()) throw new Error("Bulk removal was not authorized");
    for (const id of unique) await this.remove(id);
    return unique.length;
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
  normalizeBase32(input.secret);
  if (!Number.isInteger(input.period) || input.period < 1 || input.period > 86_400) throw new Error("Period is out of bounds");
  if (![6, 7, 8].includes(input.digits)) throw new Error("Digits must be 6, 7, or 8");
  if (!( ["SHA-1", "SHA-256", "SHA-512"] as readonly string[]).includes(input.algorithm)) throw new Error("Algorithm is unsupported");
}

function redact(entry: TotpEntry): RedactedTotpEntry {
  const { secretRef: _secretRef, ...safe } = entry;
  return { ...safe, secretStored: true };
}

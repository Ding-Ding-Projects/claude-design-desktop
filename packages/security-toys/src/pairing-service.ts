import { buildOtpAuthUri, encodeBase32, verifyTotpCodeAt, type TotpUri } from "./totp";
import type { AuthenticatorAlgorithm } from "./types";
import { randomId, SecretVault } from "./vault";
import QRCode from "qrcode";

export type PairingDisplay = {
  pairingId: string;
  statusPixels: Uint8Array;
  textAlternative: string;
  networkRequired: false;
  expiresAt: number;
};

export type PairingHandoff = {
  pairingId: string;
  issuer: string;
  account: string;
  algorithm: AuthenticatorAlgorithm;
  digits: 6 | 7 | 8;
  period: number;
  secretRef: string;
};

type PendingPairing = TotpUri & { pairingId: string; secretRef: string; expiresAt: number };

/** Main-process-only pairing service. URI and secret never cross its boundary. */
export class MainProcessPairingService {
  private readonly pending = new Map<string, PendingPairing>();
  private readonly expiredIds = new Set<string>();
  private readonly vault: SecretVault;
  private readonly now: () => number;

  constructor(vault: SecretVault, now: () => number = () => Date.now(), private readonly randomBytes: () => Uint8Array = secureRandomBytes) {
    this.vault = vault;
    this.now = now;
  }

  start(issuer: string, account: string, options: { algorithm?: AuthenticatorAlgorithm; digits?: 6 | 7 | 8; period?: number; expiresInMs?: number } = {}): PairingDisplay {
    if (!issuer.trim() || !account.trim() || issuer.length > 256 || account.length > 256) throw new Error("Pairing labels are required and bounded");
    const expiresInMs = options.expiresInMs ?? 120_000;
    if (!Number.isInteger(expiresInMs) || expiresInMs < 1_000 || expiresInMs > 300_000) throw new Error("Pairing expiry is out of bounds");
    const bytes = this.randomBytes();
    if (bytes.byteLength !== 20) throw new Error("Pairing secret must be exactly 160 bits");
    const pairingId = randomId("pairing");
    const pending: PendingPairing = { pairingId, issuer, account, secret: encodeBase32(bytes), algorithm: options.algorithm ?? "SHA-1", digits: options.digits ?? 6, period: options.period ?? 30, secretRef: randomId("pairing-secret"), expiresAt: this.now() + expiresInMs };
    this.pending.set(pairingId, pending);
    const uri = buildOtpAuthUri(pending);
    this.renderQrMatrix(uri);
    return { pairingId, statusPixels: this.renderQrStatus(pairingId), textAlternative: `Authenticator pairing for ${issuer}, ${account}. The QR is rendered locally in the protected pairing surface.`, networkRequired: false, expiresAt: pending.expiresAt };
  }

  async confirm(pairingId: string, code: string): Promise<PairingHandoff | undefined> {
    const pending = this.pending.get(pairingId);
    if (!pending || this.now() >= pending.expiresAt) { if (pending) this.expiredIds.add(pairingId); this.cancel(pairingId); return undefined; }
    const valid = await verifyTotpCodeAt(pending.secret, code, this.now(), { algorithm: pending.algorithm, digits: pending.digits, period: pending.period, skewSteps: 0 });
    if (!valid) return undefined;
    try {
      await this.vault.put(pending.secretRef, pending.secret);
    } catch (error) {
      await this.vault.delete(pending.secretRef).catch(() => undefined);
      this.cancel(pairingId);
      throw error;
    }
    this.pending.delete(pairingId);
    return { pairingId, issuer: pending.issuer, account: pending.account, algorithm: pending.algorithm, digits: pending.digits, period: pending.period, secretRef: pending.secretRef };
  }

  cancel(pairingId: string): void { this.pending.delete(pairingId); }
  status(pairingId: string): { pairingId: string; pending: boolean; expired: boolean } { const pending = this.pending.get(pairingId); return { pairingId, pending: Boolean(pending), expired: Boolean(this.expiredIds.has(pairingId) || (pending && this.now() >= pending.expiresAt)) }; }

  private renderQrMatrix(uri: string): Uint8Array {
    // The URI enters and is rendered only in this main-process method. The renderer receives status pixels, never these QR modules.
    if (!uri.startsWith("otpauth://totp/")) throw new Error("Pairing URI construction failed");
    const qr = QRCode.create(uri, { errorCorrectionLevel: "M" });
    return new Uint8Array(qr.modules.data);
  }

  private renderQrStatus(pairingId: string): Uint8Array {
    const pixels = new Uint8Array(32);
    for (let index = 0; index < pairingId.length; index += 1) pixels[index % pixels.length] ^= pairingId.charCodeAt(index);
    return pixels;
  }
}

function secureRandomBytes(): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Secure randomness is unavailable");
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

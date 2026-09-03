import type { AuthenticatorAlgorithm } from "./types";

export type TotpOptions = {
  algorithm?: AuthenticatorAlgorithm;
  digits?: 6 | 7 | 8;
  period?: number;
  skewSteps?: number;
};

export type TotpUri = {
  issuer: string;
  account: string;
  secret: string;
  algorithm: AuthenticatorAlgorithm;
  digits: 6 | 7 | 8;
  period: number;
};

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function normalizeBase32(value: string): string {
  if (value.length > 4096) throw new Error("TOTP secret is too large");
  const compact = value.replace(/\s/g, "");
  if (!/^[A-Za-z2-7]+=*$/.test(compact)) throw new Error("TOTP secret must be base32 text");
  const normalized = compact.replace(/=+$/, "").toUpperCase();
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) {
    throw new Error("TOTP secret must be base32 text");
  }
  return normalized;
}

export function decodeBase32(value: string): Uint8Array {
  const normalized = normalizeBase32(value);
  let buffer = 0;
  let bits = 0;
  const output: number[] = [];
  for (const character of normalized) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 0xff);
    }
  }
  if (bits >= 5 || (buffer & ((1 << bits) - 1)) !== 0) {
    throw new Error("TOTP secret has invalid base32 padding");
  }
  return new Uint8Array(output);
}

export function encodeBase32(value: Uint8Array): string {
  let buffer = 0;
  let bits = 0;
  let output = "";
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

export async function hotpCode(secret: string, counter: number, options: TotpOptions = {}): Promise<string> {
  const algorithm = options.algorithm ?? "SHA-1";
  const digits = options.digits ?? 6;
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error("HOTP counter must be a non-negative safe integer");
  if (![6, 7, 8].includes(digits)) throw new Error("HOTP digits must be 6, 7, or 8");
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    decodeBase32(secret) as unknown as BufferSource,
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"]
  );
  const message = new Uint8Array(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  const mac = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, message));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, "0");
}

export async function totpCode(secret: string, options: TotpOptions = {}): Promise<string> {
  return totpCodeAt(secret, Date.now(), options);
}

/** Deterministic clock seam for tests and server-owned clock adapters. */
export async function totpCodeAt(secret: string, timestamp: number, options: TotpOptions = {}): Promise<string> {
  const period = options.period ?? 30;
  if (!Number.isInteger(period) || period < 1 || period > 86_400) throw new Error("TOTP period is out of bounds");
  if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error("TOTP timestamp is out of bounds");
  return hotpCode(secret, Math.floor(timestamp / 1000 / period), options);
}

export async function verifyTotpCode(secret: string, candidate: string, options: TotpOptions = {}): Promise<boolean> {
  return verifyTotpCodeAt(secret, candidate, Date.now(), options);
}

export async function verifyTotpCodeAt(secret: string, candidate: string, timestamp: number, options: TotpOptions = {}): Promise<boolean> {
  const digits = options.digits ?? 6;
  if (![6, 7, 8].includes(digits)) return false;
  if (!new RegExp(`^\\d{${digits}}$`).test(candidate)) return false;
  const period = options.period ?? 30;
  const skewSteps = options.skewSteps ?? 1;
  if (!Number.isInteger(period) || period < 1 || period > 86_400) return false;
  if (!Number.isInteger(skewSteps) || skewSteps < 0 || skewSteps > 2 || !Number.isFinite(timestamp) || timestamp < 0) return false;
  const counter = Math.floor(timestamp / 1000 / period);
  for (let offset = -skewSteps; offset <= skewSteps; offset += 1) {
    if (counter + offset >= 0 && await hotpCode(secret, counter + offset, options) === candidate) return true;
  }
  return false;
}

export function buildOtpAuthUri(input: TotpUri): string {
  if (input.issuer.length > 256 || input.account.length > 256) throw new Error("Authenticator labels are too large");
  const algorithm = input.algorithm.replace("-", "");
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.account)}`;
  const params = new URLSearchParams({
    secret: normalizeBase32(input.secret),
    issuer: input.issuer,
    algorithm,
    digits: String(input.digits),
    period: String(input.period)
  });
  const uri = `otpauth://totp/${label}?${params.toString()}`;
  if (uri.length > 4096) throw new Error("Authenticator URI is too large");
  return uri;
}

export function parseOtpAuthUri(value: string): TotpUri {
  if (value.length > 4096) throw new Error("Authenticator URI is too large");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Authenticator input is not a valid otpauth URI");
  }
  if (url.protocol !== "otpauth:" || url.hostname !== "totp") throw new Error("Only otpauth://totp URIs are supported");
  const secret = normalizeBase32(uniqueQueryParam(url, "secret") ?? "");
  let label: string;
  try {
    label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    throw new Error("Authenticator URI label is malformed");
  }
  const separator = label.indexOf(":");
  const account = separator >= 0 ? label.slice(separator + 1) : label;
  const issuerParam = uniqueQueryParam(url, "issuer");
  const labelIssuer = separator >= 0 ? label.slice(0, separator) : "";
  if (issuerParam && labelIssuer && issuerParam !== labelIssuer) throw new Error("Authenticator issuer does not match its URI label");
  const issuer = issuerParam ?? labelIssuer;
  if (!issuer || !account) throw new Error("Authenticator URI must include issuer and account");
  const algorithm = normalizeAlgorithm(uniqueQueryParam(url, "algorithm") ?? "SHA1");
  const digits = Number(uniqueQueryParam(url, "digits") ?? "6");
  const period = Number(uniqueQueryParam(url, "period") ?? "30");
  if (![6, 7, 8].includes(digits) || !Number.isInteger(digits)) throw new Error("Authenticator digits must be 6, 7, or 8");
  if (!Number.isInteger(period) || period < 1 || period > 86_400) throw new Error("Authenticator period is out of bounds");
  return { issuer, account, secret, algorithm, digits: digits as 6 | 7 | 8, period };
}

function normalizeAlgorithm(value: string): AuthenticatorAlgorithm {
  const normalized = value.toUpperCase().replace("-", "");
  if (normalized === "SHA1") return "SHA-1";
  if (normalized === "SHA256") return "SHA-256";
  if (normalized === "SHA512") return "SHA-512";
  throw new Error("Authenticator algorithm must be SHA-1, SHA-256, or SHA-512");
}

function uniqueQueryParam(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) throw new Error(`Authenticator URI repeats ${name}`);
  return values[0];
}

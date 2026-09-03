import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PIPE_AUTH_EXPIRY_MS = 10_000;

export function requestDigest(raw: string): string { return createHash("sha256").update(raw, "utf8").digest("hex"); }
export function challengeNonce(): string { return randomBytes(24).toString("base64url"); }
export function proofMac(capability: string, nonce: string, role: string, version: 1, digest: string): string { return createHmac("sha256", capability).update(`${nonce}\n${role}\n${version}\n${digest}`, "utf8").digest("hex"); }
export function equalMac(actual: string, expected: string): boolean { const a = Buffer.from(actual, "hex"); const b = Buffer.from(expected, "hex"); return a.length === b.length && a.length === 32 && timingSafeEqual(a, b); }

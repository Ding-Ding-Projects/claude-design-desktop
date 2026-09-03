import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";

export const CODEX_PACKAGE_VERSION = "0.152.1";
export const CLIENT_NAME = "claude_design_desktop";
export const CLIENT_TITLE = "Claude Design Desktop";
export const CODEX_AUTH_KEYRING_SERVICE = "Codex Auth";
export const MAX_LABEL_LENGTH = 80;
export const MAX_PROTOCOL_LINE_BYTES = 4 * 1024 * 1024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const LOGIN_TIMEOUT_MS = 10 * 60_000;
export type AccountHostErrorCode = "invalid_input" | "unauthenticated" | "busy" | "request_timeout" | "transport_unavailable" | "unsafe_input" | "operation_failed";
export class AccountHostError extends Error { constructor(readonly code: AccountHostErrorCode, message: string) { super(message); this.name = "AccountHostError"; } }

export function validateSlotId(slotId: string): string {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(slotId)) throw new Error("Invalid account slot id");
  return slotId;
}
export function validateLabel(label: string): string {
  const value = label.trim();
  if (value.length === 0 || value.length > MAX_LABEL_LENGTH) throw new Error(`Account label must be 1-${MAX_LABEL_LENGTH} characters`);
  return value;
}
export function resolveSlotHome(accountsRoot: string, slotId: string): string {
  validateSlotId(slotId);
  if (!isAbsolute(accountsRoot)) throw new Error("Accounts root must be absolute");
  const root = resolve(accountsRoot);
  const home = resolve(root, slotId, "codex-home");
  if (home !== root && !home.startsWith(`${root}${sep}`)) throw new Error("Account home escaped the accounts root");
  return home;
}
export function deriveKeyringAccountKey(codexHome: string): string {
  if (!isAbsolute(codexHome)) throw new Error("CODEX_HOME must be absolute");
  return `cli|${createHash("sha256").update(resolve(codexHome), "utf8").digest("hex").slice(0, 16)}`;
}
export async function ensureCodexHome(home: string): Promise<void> {
  if (!isAbsolute(home)) throw new Error("CODEX_HOME must be absolute");
  await mkdir(home, { recursive: true });
  await writeFile(join(home, "config.toml"), 'cli_auth_credentials_store = "keyring"\nforced_login_method = "chatgpt"\n', { encoding: "utf8", mode: 0o600 });
}
export async function readSafeConfig(home: string): Promise<string> { return readFile(join(home, "config.toml"), "utf8"); }
export function sanitizeError(error: unknown): AccountHostError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const code: AccountHostErrorCode = lower.includes("timed out") ? "request_timeout" : lower.includes("not authenticated") || lower.includes("no active authenticated") ? "unauthenticated" : lower.includes("queue is full") || lower.includes("already in progress") || lower.includes("must complete") ? "busy" : lower.includes("unsafe") || lower.includes("escaped") || lower.includes("redacted") ? "unsafe_input" : lower.includes("invalid") || lower.includes("unsupported") ? "invalid_input" : lower.includes("unavailable") || lower.includes("exited") || lower.includes("transport") ? "transport_unavailable" : "operation_failed";
  const safeMessage: Record<AccountHostErrorCode, string> = { invalid_input: "The supplied value is invalid.", unauthenticated: "The selected account is not authenticated.", busy: "The account is busy with another operation.", request_timeout: "The account service did not respond in time.", transport_unavailable: "The account service is unavailable.", unsafe_input: "The supplied value was refused.", operation_failed: "The account operation could not be completed." };
  return new AccountHostError(code, safeMessage[code]);
}
export function isAllowedAuthUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "chatgpt.com" || url.hostname.endsWith(".chatgpt.com") || url.hostname === "auth.openai.com" || url.hostname.endsWith(".openai.com")); } catch { return false; }
}
export function sanitizeLoginId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f-]{16,128}$/i.test(value)) throw new Error("App-server returned an invalid login id");
  return value;
}
export function sanitizeDeviceCode(value: unknown): string {
  if (typeof value !== "string" || value.length < 4 || value.length > 64 || !/^[A-Za-z0-9 -]+$/.test(value)) throw new Error("App-server returned an invalid device code");
  return value;
}

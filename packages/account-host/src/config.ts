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
export function sanitizeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(message.replace(/https?:\/\/[^\s)]+/gi, "[url redacted]").replace(/(?:access|refresh|id|api)[-_ ]?token\s*[:=]\s*[^\s,}]+/gi, "[redacted]").slice(0, 500));
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

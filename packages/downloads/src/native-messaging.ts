import { normalizeDownloadRequest, type DownloadRecord, type DownloadStartRequest, type NormalizedDownloadRequest } from "./download-state-machine.js";

export const NATIVE_PROTOCOL_VERSION = 1;
export const NATIVE_HOST_NAME = "com.claude.design.downloads";

export type NativeProposalMessage = { type: "propose-download"; protocolVersion: 1; requestId: string; request: DownloadStartRequest };
export type NativeConfirmMessage = { type: "confirm-download"; protocolVersion: 1; requestId: string; proposalId: string; confirmation: { keyOne: true; keyTwo: true; slider: 1 } };
export type NativeControlMessage = { type: "download-control"; protocolVersion: 1; requestId: string; downloadId: string; action: "pause" | "resume" | "cancel" };
export type NativeHostMessage = NativeProposalMessage | NativeConfirmMessage | NativeControlMessage;
export type NativeHostResponse =
  | { type: "proposal-ready"; protocolVersion: 1; requestId: string; proposalId: string; request: NormalizedDownloadRequest; preflight: { destinationPath: string; collision: boolean; freeBytes: number; minimumFreeBytes: number } }
  | { type: "queued"; protocolVersion: 1; requestId: string; record: DownloadRecord }
  | { type: "download-event"; protocolVersion: 1; requestId: string; event: "queued" | "downloading" | "paused" | "resumed" | "cancelled" | "failed" | "completed"; record: DownloadRecord }
  | { type: "rejected"; protocolVersion: 1; requestId: string; error: string };

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]{1,500}$/u;

export function parseNativeMessage(raw: string): NativeHostMessage {
  if (typeof raw !== "string" || utf8ByteLength(raw) > 64 * 1024) throw new RangeError("Native message exceeds the bounded protocol size");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new TypeError("Native message must be valid JSON"); }
  if (!isRecord(value) || value.protocolVersion !== NATIVE_PROTOCOL_VERSION || typeof value.type !== "string") throw new TypeError("Unsupported native message envelope");
  if (value.type === "propose-download") {
    requireExactKeys(value, ["protocolVersion", "request", "requestId", "type"]);
    if (!isSafeId(value.requestId) || !isRecord(value.request)) throw new TypeError("Invalid propose-download envelope");
    return { type: value.type, protocolVersion: 1, requestId: value.requestId, request: value.request as DownloadStartRequest };
  }
  if (value.type === "confirm-download") {
    requireExactKeys(value, ["confirmation", "proposalId", "protocolVersion", "requestId", "type"]);
    if (!isSafeId(value.requestId) || !isSafeId(value.proposalId)) throw new TypeError("Invalid confirm-download ids");
    if (!isRecord(value.confirmation) || value.confirmation.keyOne !== true || value.confirmation.keyTwo !== true || value.confirmation.slider !== 1) throw new TypeError("Both confirmation keys and the full slider are required");
    return { type: value.type, protocolVersion: 1, requestId: value.requestId, proposalId: value.proposalId, confirmation: { keyOne: true, keyTwo: true, slider: 1 } };
  }
  if (value.type === "download-control") {
    requireExactKeys(value, ["action", "downloadId", "protocolVersion", "requestId", "type"]);
    if (!isSafeId(value.requestId) || !isSafeId(value.downloadId)) throw new TypeError("Invalid download-control ids");
    if (value.action !== "pause" && value.action !== "resume" && value.action !== "cancel") throw new TypeError("Unsupported download-control action");
    return { type: value.type, protocolVersion: 1, requestId: value.requestId, downloadId: value.downloadId, action: value.action };
  }
  throw new TypeError("Unsupported native message type");
}

export function validateNativeHostResponse(message: NativeHostResponse): NativeHostResponse {
  if (!isRecord(message) || message.protocolVersion !== 1 || typeof message.type !== "string") throw new TypeError("Invalid native response");
  if (message.type === "proposal-ready") {
    requireExactKeys(message, ["preflight", "protocolVersion", "proposalId", "request", "requestId", "type"]);
    if (!isSafeId(message.requestId) || !isSafeId(message.proposalId)) throw new TypeError("Invalid proposal response ids");
    return { ...message, request: normalizeDownloadRequest(message.request as unknown as DownloadStartRequest) };
  }
  if (message.type === "rejected") {
    requireExactKeys(message, ["error", "protocolVersion", "requestId", "type"]);
    if (!isSafeId(message.requestId) || typeof message.error !== "string" || !SAFE_TEXT.test(message.error)) throw new TypeError("Invalid rejected response");
    return message;
  }
  if (message.type === "queued" || message.type === "download-event") {
    requireExactKeys(message, ["protocolVersion", "record", "requestId", "type", ...(message.type === "download-event" ? ["event"] : [])]);
    if (!isSafeId(message.requestId) || !isRecord(message.record)) throw new TypeError("Invalid transfer response");
    return message;
  }
  throw new TypeError("Unsupported native response type");
}

export function nativeHostManifest(extensionId: string, executablePathTemplate = "{{INSTALL_DIR}}\\claude-design-download-host.exe"): Record<string, unknown> {
  if (!/^[a-p]{32}$/u.test(extensionId)) throw new TypeError("extensionId must be an owner-selected Chrome extension id");
  if (!/^\{\{INSTALL_DIR\}\}\\[^:*?"<>|]+$/u.test(executablePathTemplate)) throw new TypeError("executablePathTemplate must remain machine-neutral");
  return { allowed_origins: [`chrome-extension://${extensionId}/`], description: "Claude Design local download companion", name: NATIVE_HOST_NAME, path: executablePathTemplate, type: "stdio" };
}

function requireExactKeys(value: Record<string, unknown>, keys: string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError("Native message contains unknown or missing fields");
}
function isSafeId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function utf8ByteLength(value: string): number { return encodeURIComponent(value).replace(/%[0-9A-F]{2}/gu, "x").length; }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }

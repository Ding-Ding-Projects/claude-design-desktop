import { normalizeDownloadRequest, type DownloadStartRequest, type NormalizedDownloadRequest, type DownloadRecord } from "./download-state-machine";

export const NATIVE_PROTOCOL_VERSION = 1;
export const NATIVE_HOST_NAME = "com.claude.design.downloads";
export const MAX_NATIVE_MESSAGE_BYTES = 64 * 1024;

export type NativeStartMessage = {
  type: "start-download";
  protocolVersion: 1;
  requestId: string;
  request: NormalizedDownloadRequest;
};

export type NativeControlMessage = {
  type: "download-control";
  protocolVersion: 1;
  requestId: string;
  downloadId: string;
  action: "pause" | "resume" | "cancel";
};

export type NativeProgressWindowMessage = {
  type: "open-progress-window";
  protocolVersion: 1;
  requestId: string;
  downloadId: string;
  title: string;
};

export type NativeDownloadEventMessage = {
  type: "download-event";
  protocolVersion: 1;
  requestId: string;
  event: "queued" | "downloading" | "paused" | "resumed" | "cancelled" | "failed" | "completed";
  record: DownloadRecord;
};

export type NativeMessage = NativeStartMessage | NativeControlMessage | NativeProgressWindowMessage;

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SAFE_TITLE = /^[^\u0000-\u001f\u007f]{1,160}$/u;

export function parseNativeMessage(raw: string): NativeMessage {
  if (typeof raw !== "string" || utf8ByteLength(raw) > MAX_NATIVE_MESSAGE_BYTES) {
    throw new RangeError("Native message exceeds the bounded protocol size");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new TypeError("Native message must be valid JSON");
  }
  if (!isRecord(value) || value.protocolVersion !== NATIVE_PROTOCOL_VERSION || typeof value.type !== "string") {
    throw new TypeError("Unsupported native message envelope");
  }
  if (value.type === "start-download") {
    requireExactKeys(value, ["protocolVersion", "requestId", "request", "type"]);
    if (!isSafeId(value.requestId) || !isRecord(value.request)) throw new TypeError("Invalid start-download envelope");
    const request = normalizeDownloadRequest(value.request as DownloadStartRequest);
    return { type: value.type, protocolVersion: 1, requestId: value.requestId, request };
  }
  if (value.type === "download-control") {
    requireExactKeys(value, ["action", "downloadId", "protocolVersion", "requestId", "type"]);
    if (!isSafeId(value.requestId) || !isSafeId(value.downloadId)) throw new TypeError("Invalid download-control ids");
    if (value.action !== "pause" && value.action !== "resume" && value.action !== "cancel") {
      throw new TypeError("Unsupported download-control action");
    }
    return { type: value.type, protocolVersion: 1, requestId: value.requestId, downloadId: value.downloadId, action: value.action };
  }
  if (value.type === "open-progress-window") {
    requireExactKeys(value, ["downloadId", "protocolVersion", "requestId", "title", "type"]);
    if (!isSafeId(value.requestId) || !isSafeId(value.downloadId) || typeof value.title !== "string" || !SAFE_TITLE.test(value.title)) {
      throw new TypeError("Invalid progress-window request");
    }
    return { type: value.type, protocolVersion: 1, requestId: value.requestId, downloadId: value.downloadId, title: value.title };
  }
  throw new TypeError("Unsupported native message type");
}

export function encodeNativeEvent(message: NativeDownloadEventMessage): string {
  requireExactKeys(message as unknown as Record<string, unknown>, ["event", "protocolVersion", "record", "requestId", "type"]);
  const encoded = JSON.stringify(message);
  if (utf8ByteLength(encoded) > MAX_NATIVE_MESSAGE_BYTES) throw new RangeError("Native event exceeds the bounded protocol size");
  return encoded;
}

export function nativeHostManifest(extensionId: string, executablePathTemplate = "{{INSTALL_DIR}}\\claude-design-download-host.exe"): Record<string, unknown> {
  if (!/^[a-p]{32}$/u.test(extensionId)) throw new TypeError("extensionId must be a Chrome extension id");
  if (!isTemplatePath(executablePathTemplate)) throw new TypeError("executablePathTemplate must be a placeholder path");
  return {
    allowed_origins: [`chrome-extension://${extensionId}/`],
    description: "Claude Design local download companion",
    name: NATIVE_HOST_NAME,
    path: executablePathTemplate,
    type: "stdio"
  };
}

function isSafeId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }

function isTemplatePath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 260 && /^\{\{INSTALL_DIR\}\}[\\/][^:*?"<>|]+$/u.test(value);
}

function requireExactKeys(value: Record<string, unknown>, keys: string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError("Native message contains unknown or missing fields");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8ByteLength(value: string): number {
  return encodeURIComponent(value).replace(/%[0-9A-F]{2}/gu, "x").length;
}

import { MAX_PROTOCOL_LINE_BYTES } from "./config.js";

export const APP_SERVER_SCHEMA_ADAPTER = Object.freeze({ packageVersion: "0.152.1", protocol: "stdio-jsonl", adapterVersion: "1" });
export const MAX_PENDING_REQUESTS = 64;
export const MAX_VALUE_DEPTH = 32;
const MAX_STRING_LENGTH = 1_000_000;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

const REQUEST_FIELDS: Record<string, readonly string[]> = {
  initialize: ["clientInfo", "capabilities"],
  "account/read": ["refreshToken"],
  "account/login/start": ["type", "useHostedLoginSuccessPage", "appBrand"],
  "account/login/cancel": ["loginId"],
  "account/logout": [],
  "account/rateLimits/read": [],
  "model/list": ["includeHidden"],
  "thread/start": ["model"],
  "thread/resume": ["threadId", "model"],
  "thread/read": ["threadId", "includeTurns"],
  "thread/inject_items": ["threadId", "items"],
  "turn/start": ["threadId", "input", "model", "effort"],
  "turn/interrupt": ["threadId", "turnId"],
};

export function validateRequestParams(method: string, params: Record<string, unknown> | undefined): void {
  const allowed = REQUEST_FIELDS[method];
  if (!allowed) throw new Error(`Unsupported app-server method: ${method}`);
  if (params === undefined) { if (allowed.length > 0) throw new Error(`Missing parameters for ${method}`); return; }
  assertValue(params, 0);
  for (const key of Object.keys(params)) if (!allowed.includes(key)) throw new Error(`Unsupported field for ${method}`);
  if (method === "account/login/start") {
    if (params.type !== "chatgpt" && params.type !== "chatgptDeviceCode") throw new Error("Only managed ChatGPT login is supported");
    if (params.type === "chatgptDeviceCode" && Object.keys(params).some((key) => key !== "type")) throw new Error("Device login accepts no browser fields");
  }
  if (method === "initialize" && (!isRecord(params.clientInfo) || typeof params.clientInfo.name !== "string" || typeof params.clientInfo.version !== "string")) throw new Error("Invalid initialize client info");
  if (method === "account/read" && params.refreshToken !== undefined && typeof params.refreshToken !== "boolean") throw new Error("Invalid account refresh flag");
  if (method === "model/list" && params.includeHidden !== undefined && typeof params.includeHidden !== "boolean") throw new Error("Invalid hidden-model flag");
  if (method === "thread/read" && params.includeTurns !== undefined && typeof params.includeTurns !== "boolean") throw new Error("Invalid thread-history flag");
  if ((method === "thread/start" || method === "thread/resume" || method === "turn/start") && params.model !== undefined && (typeof params.model !== "string" || !MODEL_PATTERN.test(params.model))) throw new Error("Invalid model identifier");
  if (method === "turn/start" && params.effort !== undefined && (typeof params.effort !== "string" || !EFFORTS.has(params.effort))) throw new Error("Invalid turn effort");
  for (const id of ["threadId", "turnId", "loginId"]) if (params[id] !== undefined) assertIdentifier(params[id]);
  if (params.input !== undefined && (!Array.isArray(params.input) || params.input.length > 100)) throw new Error("Invalid turn input");
  if (params.items !== undefined && (!Array.isArray(params.items) || params.items.length > 10_000)) throw new Error("Invalid injected items");
  if (Array.isArray(params.input)) for (const item of params.input) validateTurnInputItem(item);
  if (Array.isArray(params.items)) for (const item of params.items) validateInjectedItem(item);
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function validateTurnInputItem(value: unknown): void {
  if (!isRecord(value) || typeof value.type !== "string") throw new Error("Invalid turn input item");
  const allowed = value.type === "text" ? ["type", "text"] : value.type === "image" ? ["type", "url"] : value.type === "localImage" ? ["type", "path"] : [];
  if (allowed.length === 0 || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("Unsupported turn input item");
  const field = value.type === "text" ? value.text : value.type === "image" ? value.url : value.path;
  if (typeof field !== "string" || field.length === 0 || field.length > 1_000_000 || /[\r\n]/.test(field) && value.type !== "text") throw new Error("Invalid turn input item value");
  if (value.type === "image") { let parsed: URL; try { parsed = new URL(field); } catch { throw new Error("Invalid image URL"); } if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Image URL must use HTTPS without embedded credentials"); }
  if (value.type === "localImage" && !/^(?:[A-Za-z]:[\\/]|\\\\)/.test(field)) throw new Error("Local image path must be absolute");
}
function validateInjectedItem(value: unknown): void {
  if (!isRecord(value) || typeof value.type !== "string") throw new Error("Invalid injected item");
  if (value.type === "message") { if (!isRecord(value) || !["type", "role", "content"].every((key) => key in value) || !["user", "assistant", "developer"].includes(String(value.role)) || !Array.isArray(value.content) || Object.keys(value).some((key) => !["type", "role", "content"].includes(key))) throw new Error("Invalid injected message"); for (const part of value.content) { if (!isRecord(part) || Object.keys(part).some((key) => !["type", "text"].includes(key)) || (part.type !== "input_text" && part.type !== "output_text") || typeof part.text !== "string" || part.text.length > 1_000_000) throw new Error("Invalid injected message content"); } return; }
  if (value.type === "functionCallOutput") { if (Object.keys(value).some((key) => !["type", "id", "name", "output"].includes(key)) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.output !== "string") throw new Error("Invalid injected function output"); return; }
  throw new Error("Unsupported injected item");
}

export function validateResponseEnvelope(value: unknown): asserts value is { id?: number; result?: unknown; error?: { code?: number; message?: string } } {
  assertValue(value, 0);
  const message = value as Record<string, unknown>;
  const hasMethod = typeof message.method === "string";
  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  const hasResult = Object.prototype.hasOwnProperty.call(message, "result");
  const hasError = Object.prototype.hasOwnProperty.call(message, "error");
  if (!hasMethod && !hasId) throw new Error("JSON-RPC message is missing id or method");
  if (hasMethod && (hasResult || hasError)) throw new Error("JSON-RPC notification cannot carry result or error");
  if (!hasMethod && hasResult === hasError) throw new Error("JSON-RPC response must carry exactly one result or error");
  if (message.id !== undefined && (typeof message.id !== "number" || !Number.isSafeInteger(message.id) || message.id < 0)) throw new Error("Invalid JSON-RPC id");
  if (message.method !== undefined && (typeof message.method !== "string" || message.method.length > 200)) throw new Error("Invalid app-server notification method");
  if (message.params !== undefined && (!message.params || typeof message.params !== "object" || Array.isArray(message.params))) throw new Error("Invalid notification params");
  if (message.error !== undefined) {
    const error = message.error;
    if (!error || typeof error !== "object" || Array.isArray(error)) throw new Error("Invalid JSON-RPC error");
    const record = error as Record<string, unknown>;
    if (typeof record.code !== "number" || !Number.isSafeInteger(record.code)) throw new Error("Invalid JSON-RPC error code");
    if (typeof record.message !== "string" || record.message.length === 0 || record.message.length > 2000) throw new Error("Invalid JSON-RPC error message");
    if (Object.keys(record).some((key) => !["code", "message", "data"].includes(key))) throw new Error("Invalid JSON-RPC error fields");
  }
}

export function assertIdentifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || /[\r\n]/.test(value)) throw new Error("Invalid identifier");
}

function assertValue(value: unknown, depth: number): void {
  if (depth > MAX_VALUE_DEPTH) throw new Error("App-server response nesting exceeded the limit");
  if (typeof value === "string") { if (value.length > MAX_STRING_LENGTH) throw new Error("App-server response string exceeded the limit"); return; }
  if (Array.isArray(value)) { if (value.length > 10_000) throw new Error("App-server response array exceeded the limit"); for (const item of value) assertValue(item, depth + 1); return; }
  if (value && typeof value === "object") { const entries = Object.entries(value); if (entries.length > 10_000) throw new Error("App-server response object exceeded the limit"); for (const [key, item] of entries) { if (key.length > 256) throw new Error("App-server response key exceeded the limit"); assertValue(item, depth + 1); } }
}

export function assertProtocolLineSize(line: string): void { if (Buffer.byteLength(line, "utf8") + 1 > MAX_PROTOCOL_LINE_BYTES) throw new Error("App-server protocol line exceeded the size limit"); }

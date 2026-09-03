import { randomUUID } from "node:crypto";

const MAX_PROJECT_ID_BYTES = 96;
const MAX_ACCOUNT_ID_BYTES = 96;
const MAX_ROLE_BYTES = 48;
const MAX_HTML_BYTES = 1_048_576;
const MAX_ASSETS = 64;
const MAX_ASSET_BYTES = 524_288;
const MAX_TOTAL_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_ASSET_NAME_BYTES = 160;
const MAX_IMAGE_PIXELS = 16_777_216;
const MAX_ACTIVE_HANDLES = 16;
const DEFAULT_WATCHDOG_MS = 5_000;
const MIN_WATCHDOG_MS = 50;
const MAX_WATCHDOG_MS = 30_000;

const CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src data:",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src data:",
  "media-src data:",
  "object-src 'none'",
  "script-src data:",
  "style-src 'unsafe-inline' data:",
  "worker-src 'none'"
].join("; ");

const ALL_URLS_FILTER = "<all_urls>";
const URL_ATTRIBUTES = new Set(["src", "href", "action", "formaction", "poster", "cite", "background"]);
const BLOCKED_TAGS = new Set(["base", "embed", "frame", "frameset", "iframe", "object", "portal"]);
const IMAGE_TYPES = new Set(["image/gif", "image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
const SCRIPT_TYPES = new Set(["application/javascript", "text/javascript"]);
const STYLE_TYPES = new Set(["text/css"]);
const FONT_TYPES = new Set(["font/woff", "font/woff2"]);
const SAFE_DATA_URL = /^data:(?:image\/(?:gif|jpeg|png|webp|svg\+xml)|font\/(?:woff|woff2));base64,[a-z0-9+/=]+$/iu;
const SCHEME_URL = /^[a-z][a-z0-9+.-]*:/iu;
const EXTERNAL_CSS_SCHEME = /^(?:https?|file|ftp|ws|wss|data|blob|filesystem|about|chrome|devtools):/iu;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type PreviewState = "creating" | "ready" | "reloading" | "closed" | "failed";

export type PreviewHandle = Readonly<{
  projectId: string;
  handleId: string;
  generation: number;
}>;

export type PreviewActor = Readonly<{
  accountId: string;
  role: string;
}>;

export type PreviewAsset = Readonly<{
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}>;

export type PreviewContent = Readonly<{
  html: string;
  assets?: readonly PreviewAsset[];
}>;

export type PreviewOperation = "create" | "reload" | "show" | "close";

export type PreviewAuthorizationRequest = Readonly<{
  actor: PreviewActor;
  generation: number;
  handleId?: string;
  operation: PreviewOperation;
  projectId: string;
}>;

export type PreviewAuthorizer = (request: PreviewAuthorizationRequest) => boolean | Promise<boolean>;

export type PreviewErrorCode =
  | "invalid_request"
  | "content_rejected"
  | "capacity_exceeded"
  | "authorization_failed"
  | "cross_project"
  | "stale_handle"
  | "closed_handle"
  | "adapter_failure"
  | "lifecycle_failure"
  | "cleanup_failed";

export type PreviewStateEvent = Readonly<{
  type: "state";
  handle: PreviewHandle;
  state: PreviewState;
}>;

export type PreviewErrorEvent = Readonly<{
  type: "error";
  handle: PreviewHandle;
  code: PreviewErrorCode;
}>;

export type PreviewEvent = PreviewStateEvent | PreviewErrorEvent;

export class PreviewHostError extends Error {
  readonly code: PreviewErrorCode;

  constructor(code: PreviewErrorCode) {
    super(code);
    this.name = "PreviewHostError";
    this.code = code;
  }
}

type PreventableEvent = { preventDefault?: () => void };
type Listener = (...args: any[]) => void;

export type PreviewSession = {
  readonly partition: string;
  webRequest: {
    onBeforeRequest: (filter: { urls: string[] }, listener: (details: { url: string }, callback: (result: { cancel: boolean }) => void) => void) => void;
  };
  on: (event: "will-download", listener: (event: PreventableEvent) => void) => void;
  setPermissionRequestHandler: (listener: (webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void) => void;
  setPermissionCheckHandler: (listener: (webContents: unknown, permission: string, requestingOrigin: string) => boolean) => void;
  clearStorageData: (options: { storages: string[] }) => Promise<void>;
  clearCache: () => Promise<void>;
  flushStorageData?: () => Promise<void>;
};

export type PreviewWebContents = {
  readonly id?: number;
  on: (event: string, listener: Listener) => void;
  setWindowOpenHandler: (listener: (details: { url: string }) => { action: "deny" }) => void;
  closeDevTools?: () => void;
};

export type PreviewWindow = {
  readonly webContents: PreviewWebContents;
  loadURL: (url: string) => Promise<void>;
  show: () => void;
  destroy: () => void;
  isDestroyed?: () => boolean;
};

export type PreviewWindowOptions = Readonly<{
  show: false;
  webPreferences: Readonly<{
    session: PreviewSession;
    nodeIntegration: false;
    contextIsolation: true;
    sandbox: true;
    webSecurity: true;
    devTools: false;
    allowRunningInsecureContent: false;
    webviewTag: false;
  }>;
}>;

export type PreviewHostAdapters = Readonly<{
  createSession: (partition: string) => PreviewSession;
  createWindow: (options: PreviewWindowOptions) => PreviewWindow;
}>;

export type ElectronSessionModule = Readonly<{
  fromPartition: (partition: string, options?: { cache?: boolean }) => PreviewSession;
}>;

export type ElectronBrowserWindowConstructor = new (options: PreviewWindowOptions) => PreviewWindow;

export function createElectronPreviewAdapters(electron: Readonly<{
  BrowserWindow: ElectronBrowserWindowConstructor;
  session: ElectronSessionModule;
}>): PreviewHostAdapters {
  return {
    createSession: (partition) => electron.session.fromPartition(partition, { cache: false }),
    createWindow: (options) => new electron.BrowserWindow(options)
  };
}

type Edit = Readonly<{ end: number; start: number; value: string }>;
type ParsedAttribute = Readonly<{ name: string; value: string; valueEnd: number; valueStart: number }>;
type ParsedTag = Readonly<{ attributes: readonly ParsedAttribute[]; closing: boolean; end: number; name: string; start: number }>;

type PreviewRecord = {
  cleaned: boolean;
  dataUrl: string;
  handle: PreviewHandle;
  ownerAccountId: string;
  session: PreviewSession;
  state: PreviewState;
  window: PreviewWindow;
};

function bytesOf(value: string): Uint8Array { return new TextEncoder().encode(value); }
function byteLength(value: string): number { return bytesOf(value).byteLength; }
function fixed(code: PreviewErrorCode): PreviewHostError { return new PreviewHostError(code); }

function assertString(value: unknown, maximum: number, code: PreviewErrorCode): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || byteLength(value) > maximum) throw fixed(code);
}

function assertProjectId(value: unknown): asserts value is string {
  assertString(value, MAX_PROJECT_ID_BYTES, "invalid_request");
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(value) || value.includes("..")) throw fixed("invalid_request");
}

function assertActor(actor: unknown): asserts actor is PreviewActor {
  if (!actor || typeof actor !== "object") throw fixed("invalid_request");
  const candidate = actor as Record<string, unknown>;
  assertString(candidate.accountId, MAX_ACCOUNT_ID_BYTES, "invalid_request");
  assertString(candidate.role, MAX_ROLE_BYTES, "invalid_request");
  if (!/^[a-z0-9][a-z0-9._:-]*$/iu.test(candidate.accountId) || !/^[a-z0-9][a-z0-9._:-]*$/iu.test(candidate.role)) throw fixed("invalid_request");
}

function normalizeAssetName(value: unknown): string {
  assertString(value, MAX_ASSET_NAME_BYTES, "content_rejected");
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("//") || !/^[a-z0-9][a-z0-9._@/-]*$/iu.test(normalized)) throw fixed("content_rejected");
  return normalized;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function assertPixels(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS) throw fixed("content_rejected");
}

function hasBytes(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function validatePng(bytes: Uint8Array): void {
  if (bytes.length < 24 || !hasBytes(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) throw fixed("content_rejected");
  assertPixels(readU32(bytes, 16), readU32(bytes, 20));
  for (let index = 8; index + 12 <= bytes.length;) {
    const length = readU32(bytes, index);
    if (length > bytes.length - index - 12) throw fixed("content_rejected");
    if (hasBytes(bytes, [97, 99, 84, 76], index + 4) && readU32(bytes, index + 8) > 1) throw fixed("content_rejected");
    index += 12 + length;
  }
}

function validateGif(bytes: Uint8Array): void {
  if (bytes.length < 10 || !(hasBytes(bytes, [71, 73, 70, 56, 55, 97]) || hasBytes(bytes, [71, 73, 70, 56, 57, 97]))) throw fixed("content_rejected");
  assertPixels(bytes[6] | (bytes[7] << 8), bytes[8] | (bytes[9] << 8));
  let frames = 0;
  for (const value of bytes) if (value === 0x2c) frames += 1;
  if (frames > 1) throw fixed("content_rejected");
}

function validateJpeg(bytes: Uint8Array): void {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw fixed("content_rejected");
  for (let index = 2; index + 9 < bytes.length;) {
    if (bytes[index] !== 0xff) { index += 1; continue; }
    const marker = bytes[index + 1];
    if (marker === 0xd8 || marker === 0xd9) { index += 2; continue; }
    const length = (bytes[index + 2] << 8) | bytes[index + 3];
    if (length < 2 || index + length + 2 > bytes.length) throw fixed("content_rejected");
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      assertPixels((bytes[index + 7] << 8) | bytes[index + 8], (bytes[index + 5] << 8) | bytes[index + 6]);
      return;
    }
    index += length + 2;
  }
  throw fixed("content_rejected");
}

function validateWebp(bytes: Uint8Array): void {
  if (bytes.length < 30 || !hasBytes(bytes, [82, 73, 70, 70]) || !hasBytes(bytes, [87, 69, 66, 80], 8) || !hasBytes(bytes, [86, 80, 56, 88], 12)) throw fixed("content_rejected");
  assertPixels(1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16));
  let frames = 0;
  for (let index = 12; index + 4 <= bytes.length; index += 1) if (hasBytes(bytes, [65, 78, 77, 70], index)) frames += 1;
  if (frames > 1) throw fixed("content_rejected");
}

function decodeUtf8(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw fixed("content_rejected"); }
}

function validateSvg(bytes: Uint8Array): void {
  const text = decodeUtf8(bytes);
  if (!/<svg(?:\s|>)/iu.test(text) || /<(?:script|foreignObject)(?:\s|>)/iu.test(text) || /<!doctype|<!entity|@import|url\s*\(/iu.test(text)) throw fixed("content_rejected");
  const withoutNamespaces = text
    .replaceAll("http://www.w3.org/2000/svg", "")
    .replaceAll("http://www.w3.org/1999/xlink", "")
    .replace(/\b(?:xmlns|[a-z][a-z0-9._-]*):[a-z][a-z0-9._-]*/giu, "");
  if (/[a-z][a-z0-9+.-]*:|\/\//iu.test(withoutNamespaces)) throw fixed("content_rejected");
  const viewBox = text.match(/\bviewBox\s*=\s*["']\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*["']/iu);
  if (viewBox) assertPixels(Number(viewBox[1]), Number(viewBox[2]));
}

function validateAsset(asset: PreviewAsset): PreviewAsset {
  if (!asset || typeof asset !== "object") throw fixed("content_rejected");
  const name = normalizeAssetName(asset.name);
  assertString(asset.mimeType, 96, "content_rejected");
  const mimeType = asset.mimeType.toLowerCase();
  if (!(asset.bytes instanceof Uint8Array) || asset.bytes.byteLength === 0 || asset.bytes.byteLength > MAX_ASSET_BYTES) throw fixed("content_rejected");
  if (!IMAGE_TYPES.has(mimeType) && !SCRIPT_TYPES.has(mimeType) && !STYLE_TYPES.has(mimeType) && !FONT_TYPES.has(mimeType) && mimeType !== "application/json" && mimeType !== "text/plain") throw fixed("content_rejected");
  const bytes = new Uint8Array(asset.bytes);
  if (mimeType === "image/png") validatePng(bytes);
  else if (mimeType === "image/gif") validateGif(bytes);
  else if (mimeType === "image/jpeg") validateJpeg(bytes);
  else if (mimeType === "image/webp") validateWebp(bytes);
  else if (mimeType === "image/svg+xml") validateSvg(bytes);
  else if (mimeType === "font/woff" && !hasBytes(bytes, [119, 79, 70, 70])) throw fixed("content_rejected");
  else if (mimeType === "font/woff2" && !hasBytes(bytes, [119, 79, 70, 50])) throw fixed("content_rejected");
  else if (SCRIPT_TYPES.has(mimeType) || STYLE_TYPES.has(mimeType) || mimeType === "application/json" || mimeType === "text/plain") decodeUtf8(bytes);
  if (mimeType === "application/json") { try { JSON.parse(decodeUtf8(bytes)); } catch { throw fixed("content_rejected"); } }
  return Object.freeze({ name, mimeType, bytes });
}

function assetMap(content: PreviewContent): ReadonlyMap<string, PreviewAsset> {
  if (!content || typeof content !== "object" || !Array.isArray(content.assets ?? [])) throw fixed("content_rejected");
  const assets = new Map<string, PreviewAsset>();
  let total = 0;
  const sourceAssets = content.assets ?? [];
  if (sourceAssets.length > MAX_ASSETS) throw fixed("content_rejected");
  for (const source of sourceAssets) {
    const asset = validateAsset(source);
    if (assets.has(asset.name)) throw fixed("content_rejected");
    total += asset.bytes.byteLength;
    if (total > MAX_TOTAL_ASSET_BYTES) throw fixed("content_rejected");
    assets.set(asset.name, asset);
  }
  return assets;
}

function base64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function assetDataUrl(asset: PreviewAsset): string {
  return `data:${asset.mimeType};base64,${base64(asset.bytes)}`;
}

function localAssetReference(value: string, assets: ReadonlyMap<string, PreviewAsset>): string | undefined {
  const hashIndex = value.indexOf("#");
  const queryIndex = value.indexOf("?");
  if (queryIndex >= 0) throw fixed("content_rejected");
  const path = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  if (path.includes("..")) throw fixed("content_rejected");
  const candidates = [path, path.replace(/^\.\//u, ""), path.replace(/^\//u, "")];
  for (const candidate of candidates) {
    const asset = assets.get(candidate);
    if (asset) return `${assetDataUrl(asset)}${hash}`;
  }
  return undefined;
}

function validateUrlReference(value: string, assets: ReadonlyMap<string, PreviewAsset>): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#")) return trimmed;
  if (SAFE_DATA_URL.test(trimmed)) return trimmed;
  if (SCHEME_URL.test(trimmed) || trimmed.startsWith("//")) throw fixed("content_rejected");
  const embedded = localAssetReference(trimmed, assets);
  if (embedded) return embedded;
  throw fixed("content_rejected");
}

function replaceEdits(source: string, edits: readonly Edit[]): string {
  const sorted = [...edits].sort((left, right) => right.start - left.start);
  let result = source;
  let previousStart = source.length + 1;
  for (const edit of sorted) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length || edit.end > previousStart) throw fixed("content_rejected");
    result = `${result.slice(0, edit.start)}${edit.value}${result.slice(edit.end)}`;
    previousStart = edit.start;
  }
  return result;
}

function readCssString(source: string, start: number): { end: number; value: string; valueStart: number; valueEnd: number } {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") { index += 2; continue; }
    if (source[index] === quote) return { end: index + 1, value: source.slice(start + 1, index), valueStart: start + 1, valueEnd: index };
    if (source[index] === "\n" || source[index] === "\r") throw fixed("content_rejected");
    index += 1;
  }
  throw fixed("content_rejected");
}

function readCssUrl(source: string, openParen: number): { end: number; value: string; valueStart: number; valueEnd: number } {
  let index = openParen + 1;
  while (/\s/u.test(source[index] ?? "")) index += 1;
  if (source[index] === "\"" || source[index] === "'") {
    const parsed = readCssString(source, index);
    index = parsed.end;
    while (/\s/u.test(source[index] ?? "")) index += 1;
    if (source[index] !== ")") throw fixed("content_rejected");
    return { ...parsed, end: index + 1 };
  }
  const valueStart = index;
  while (index < source.length && source[index] !== ")") index += 1;
  if (index >= source.length) throw fixed("content_rejected");
  const raw = source.slice(valueStart, index);
  const value = raw.trim();
  const leading = raw.length - raw.trimStart().length;
  return { end: index + 1, value, valueStart: valueStart + leading, valueEnd: valueStart + leading + value.length };
}

function sanitizeCss(source: string, assets: ReadonlyMap<string, PreviewAsset>): string {
  const edits: Edit[] = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) throw fixed("content_rejected");
      index = end + 2;
      continue;
    }
    if (source[index] === "\"" || source[index] === "'") {
      const parsed = readCssString(source, index);
      if (SCHEME_URL.test(parsed.value) || parsed.value.includes("//") || /\burl\s*\(/iu.test(parsed.value)) throw fixed("content_rejected");
      index = parsed.end;
      continue;
    }
    const urlMatch = source.slice(index).match(/^url\s*\(/iu);
    if (urlMatch) {
      const parsed = readCssUrl(source, index + urlMatch[0].length - 1);
      edits.push({ start: parsed.valueStart, end: parsed.valueEnd, value: validateUrlReference(parsed.value, assets) });
      index = parsed.end;
      continue;
    }
    const importMatch = source.slice(index).match(/^@import\b/iu);
    if (importMatch) {
      let next = index + importMatch[0].length;
      while (/\s/u.test(source[next] ?? "")) next += 1;
      if (source[next] === "\"" || source[next] === "'") {
        const parsed = readCssString(source, next);
        edits.push({ start: parsed.valueStart, end: parsed.valueEnd, value: validateUrlReference(parsed.value, assets) });
        index = parsed.end;
        continue;
      }
      if (/^url\s*\(/iu.test(source.slice(next))) { index = next; continue; }
      throw fixed("content_rejected");
    }
    if (EXTERNAL_CSS_SCHEME.test(source.slice(index)) || source.startsWith("//", index)) throw fixed("content_rejected");
    index += 1;
  }
  return replaceEdits(source, edits);
}

function parseTag(source: string, start: number): ParsedTag {
  let index = start + 1;
  const closing = source[index] === "/";
  if (closing) index += 1;
  const nameStart = index;
  while (/[a-z0-9:_-]/iu.test(source[index] ?? "")) index += 1;
  if (index === nameStart) throw fixed("content_rejected");
  const name = source.slice(nameStart, index).toLowerCase();
  const attributes: ParsedAttribute[] = [];
  if (closing) {
    while (/\s/u.test(source[index] ?? "")) index += 1;
    if (source[index] !== ">") throw fixed("content_rejected");
    return { attributes, closing, end: index + 1, name, start };
  }
  while (index < source.length) {
    while (/\s/u.test(source[index] ?? "")) index += 1;
    if (source[index] === ">") return { attributes, closing, end: index + 1, name, start };
    if (source[index] === "/" && source[index + 1] === ">") return { attributes, closing, end: index + 2, name, start };
    const attrStart = index;
    while (/[a-z0-9:_.-]/iu.test(source[index] ?? "")) index += 1;
    if (index === attrStart) throw fixed("content_rejected");
    const attrName = source.slice(attrStart, index).toLowerCase();
    while (/\s/u.test(source[index] ?? "")) index += 1;
    if (source[index] !== "=") { attributes.push({ name: attrName, value: "", valueStart: index, valueEnd: index }); continue; }
    index += 1;
    while (/\s/u.test(source[index] ?? "")) index += 1;
    const rawStart = index;
    let valueEnd = index;
    let value: string;
    if (source[index] === "\"" || source[index] === "'") {
      const quote = source[index];
      index += 1;
      const actualStart = index;
      while (index < source.length && source[index] !== quote) index += 1;
      if (index >= source.length) throw fixed("content_rejected");
      valueEnd = index;
      value = source.slice(actualStart, index);
      attributes.push({ name: attrName, value, valueStart: actualStart, valueEnd });
      index += 1;
      continue;
    }
    while (index < source.length && !/[\s>]/u.test(source[index])) index += 1;
    valueEnd = index;
    value = source.slice(rawStart, valueEnd);
    attributes.push({ name: attrName, value, valueStart: rawStart, valueEnd });
  }
  throw fixed("content_rejected");
}

function findClosingTag(source: string, from: number, name: string): ParsedTag {
  let index = from;
  while (index < source.length) {
    const found = source.indexOf("<", index);
    if (found < 0) throw fixed("content_rejected");
    const tag = parseTag(source, found);
    if (tag.closing && tag.name === name) return tag;
    index = tag.end;
  }
  throw fixed("content_rejected");
}

function srcset(value: string, assets: ReadonlyMap<string, PreviewAsset>): string {
  if (value.includes("data:")) throw fixed("content_rejected");
  const edits: Edit[] = [];
  let offset = 0;
  for (const candidate of value.split(",")) {
    const leading = candidate.search(/\S/u);
    if (leading < 0) throw fixed("content_rejected");
    const raw = candidate.slice(leading);
    const space = raw.search(/\s/u);
    const reference = space < 0 ? raw : raw.slice(0, space);
    const replacement = validateUrlReference(reference, assets);
    const start = offset + leading;
    edits.push({ start, end: start + reference.length, value: replacement });
    offset += candidate.length + 1;
  }
  return replaceEdits(value, edits);
}

function sanitizeHtml(source: string, assets: ReadonlyMap<string, PreviewAsset>): string {
  const edits: Edit[] = [];
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open < 0) break;
    if (source.startsWith("<!--", open)) {
      const end = source.indexOf("-->", open + 4);
      if (end < 0) throw fixed("content_rejected");
      index = end + 3;
      continue;
    }
    if (/^<!doctype\b/iu.test(source.slice(open))) {
      const end = source.indexOf(">", open + 2);
      if (end < 0) throw fixed("content_rejected");
      index = end + 1;
      continue;
    }
    const tag = parseTag(source, open);
    if (!tag.closing) {
      if (BLOCKED_TAGS.has(tag.name)) throw fixed("content_rejected");
      const attributes = new Map(tag.attributes.map((attribute) => [attribute.name, attribute]));
      if ([...attributes.keys()].some((name) => name.startsWith("on"))) throw fixed("content_rejected");
      if (tag.name === "meta" && attributes.get("http-equiv")?.value.toLowerCase() === "refresh") throw fixed("content_rejected");
      for (const attribute of tag.attributes) {
        if (attribute.name === "srcset") edits.push({ start: attribute.valueStart, end: attribute.valueEnd, value: srcset(attribute.value, assets) });
        else if (URL_ATTRIBUTES.has(attribute.name)) edits.push({ start: attribute.valueStart, end: attribute.valueEnd, value: validateUrlReference(attribute.value, assets) });
        else if (attribute.name === "style") edits.push({ start: attribute.valueStart, end: attribute.valueEnd, value: sanitizeCss(attribute.value, assets) });
        else if (SCHEME_URL.test(attribute.value) || attribute.value.includes("//") || /\burl\s*\(/iu.test(attribute.value)) throw fixed("content_rejected");
      }
      if (tag.name === "script") {
        const src = attributes.get("src");
        if (!src) throw fixed("content_rejected");
        const asset = localAssetReference(src.value, assets);
        if (!asset || !/^data:(?:application\/javascript|text\/javascript);base64,/iu.test(asset)) throw fixed("content_rejected");
        const close = findClosingTag(source, tag.end, "script");
        if (source.slice(tag.end, close.start).trim()) throw fixed("content_rejected");
        index = close.end;
        continue;
      }
      if (tag.name === "style") {
        const close = findClosingTag(source, tag.end, "style");
        edits.push({ start: tag.end, end: close.start, value: sanitizeCss(source.slice(tag.end, close.start), assets) });
        index = close.end;
        continue;
      }
    }
    index = tag.end;
  }
  const csp = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
  const head = source.match(/<head(?:\s[^>]*)?>/iu);
  const insertion = head ? head.index! + head[0].length : 0;
  const withCsp = head ? `${source.slice(0, insertion)}${csp}${source.slice(insertion)}` : `${csp}${source}`;
  const shifted = edits.map((edit) => (edit.start >= insertion ? { ...edit, start: edit.start + csp.length, end: edit.end + csp.length } : edit));
  return replaceEdits(withCsp, shifted);
}

export function previewDataUrl(content: PreviewContent): string {
  if (!content || typeof content !== "object" || typeof content.html !== "string" || content.html.length === 0 || byteLength(content.html) > MAX_HTML_BYTES) throw fixed("content_rejected");
  if (/<base(?:\s|>)/iu.test(content.html)) throw fixed("content_rejected");
  const html = sanitizeHtml(content.html, assetMap(content));
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function publicHandle(projectId: string, handleId: string, generation: number): PreviewHandle {
  return Object.freeze({ projectId, handleId, generation });
}

function partitionFor(projectId: string, handleId: string): string { return `preview-${projectId}-${handleId}`; }

function fixedFromUnknown(error: unknown, fallback: PreviewErrorCode): PreviewHostError { return error instanceof PreviewHostError ? error : fixed(fallback); }

function withWatchdog<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) reject(fixed("lifecycle_failure")); }, timeoutMs);
    operation().then((value) => { settled = true; clearTimeout(timer); resolve(value); }, (error) => { settled = true; clearTimeout(timer); reject(error); });
  });
}

export class PreviewHostController {
  private readonly records = new Map<string, PreviewRecord>();
  private readonly listeners = new Set<(event: PreviewEvent) => void>();
  private readonly adapters: PreviewHostAdapters;
  private readonly authorize: PreviewAuthorizer;
  private readonly maxActiveHandles: number;
  private readonly watchdogMs: number;

  constructor(adapters: PreviewHostAdapters, options: Readonly<{ authorize: PreviewAuthorizer; maxActiveHandles?: number; watchdogMs?: number }>) {
    this.adapters = adapters;
    this.authorize = options.authorize;
    this.maxActiveHandles = options.maxActiveHandles ?? MAX_ACTIVE_HANDLES;
    this.watchdogMs = options.watchdogMs ?? DEFAULT_WATCHDOG_MS;
    if (typeof this.authorize !== "function" || !Number.isInteger(this.maxActiveHandles) || this.maxActiveHandles < 1 || this.maxActiveHandles > MAX_ACTIVE_HANDLES || !Number.isInteger(this.watchdogMs) || this.watchdogMs < MIN_WATCHDOG_MS || this.watchdogMs > MAX_WATCHDOG_MS) throw fixed("invalid_request");
  }

  onEvent(listener: (event: PreviewEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async create(actor: PreviewActor, projectId: string, content: PreviewContent): Promise<PreviewHandle> {
    assertActor(actor);
    assertProjectId(projectId);
    await this.ensureAuthorized(actor, "create", projectId, 1);
    if (this.records.size >= this.maxActiveHandles) throw fixed("capacity_exceeded");
    const handle = publicHandle(projectId, randomUUID(), 1);
    let session: PreviewSession | undefined;
    let record: PreviewRecord | undefined;
    try {
      const dataUrl = previewDataUrl(content);
      const partition = partitionFor(projectId, handle.handleId);
      session = this.adapters.createSession(partition);
      if (!session || session.partition !== partition) throw fixed("adapter_failure");
      const window = this.adapters.createWindow({ show: false, webPreferences: { session, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, devTools: false, allowRunningInsecureContent: false, webviewTag: false } });
      if (!window) throw fixed("adapter_failure");
      record = { cleaned: false, dataUrl, handle, ownerAccountId: actor.accountId, session, state: "creating", window };
      this.records.set(this.key(handle), record);
      this.configurePolicies(record);
      this.emitState(record);
      await withWatchdog(() => window.loadURL(dataUrl), this.watchdogMs);
      record.state = "ready";
      this.emitState(record);
      return record.handle;
    } catch (error) {
      const normalized = fixedFromUnknown(error, error instanceof PreviewHostError && error.code === "content_rejected" ? "content_rejected" : "adapter_failure");
      if (record) {
        record.state = "failed";
        this.emitError(record, normalized.code);
        try { await this.cleanupRecord(record); } catch { /* record removal below is mandatory */ }
        this.records.delete(this.key(record.handle));
      } else if (session) await this.cleanupSession(session);
      throw normalized;
    }
  }

  async reload(actor: PreviewActor, projectId: string, handle: PreviewHandle, content: PreviewContent): Promise<PreviewHandle> {
    assertActor(actor);
    const record = this.assertCurrent(projectId, handle);
    await this.ensureAuthorized(actor, "reload", projectId, handle.generation, handle.handleId);
    if (record.ownerAccountId !== actor.accountId) throw fixed("authorization_failed");
    const dataUrl = previewDataUrl(content);
    const nextHandle = publicHandle(projectId, handle.handleId, handle.generation + 1);
    this.records.delete(this.key(handle));
    record.handle = nextHandle;
    record.dataUrl = dataUrl;
    record.state = "reloading";
    this.records.set(this.key(nextHandle), record);
    this.emitState(record);
    try {
      await withWatchdog(() => record.window.loadURL(dataUrl), this.watchdogMs);
      record.state = "ready";
      this.emitState(record);
      return record.handle;
    } catch (error) {
      const normalized = fixedFromUnknown(error, "lifecycle_failure");
      record.state = "failed";
      this.emitError(record, normalized.code);
      try { await this.cleanupRecord(record); } catch { /* removal is still required */ }
      this.records.delete(this.key(record.handle));
      throw normalized;
    }
  }

  async show(actor: PreviewActor, projectId: string, handle: PreviewHandle): Promise<void> {
    assertActor(actor);
    const record = this.assertCurrent(projectId, handle);
    await this.ensureAuthorized(actor, "show", projectId, handle.generation, handle.handleId);
    if (record.ownerAccountId !== actor.accountId || record.state !== "ready") throw fixed("authorization_failed");
    try { record.window.show(); } catch { throw fixed("adapter_failure"); }
  }

  async close(actor: PreviewActor, projectId: string, handle: PreviewHandle): Promise<void> {
    assertActor(actor);
    const record = this.assertCurrent(projectId, handle);
    await this.ensureAuthorized(actor, "close", projectId, handle.generation, handle.handleId);
    if (record.ownerAccountId !== actor.accountId) throw fixed("authorization_failed");
    record.state = "closed";
    this.emitState(record);
    let failure: PreviewHostError | undefined;
    try { await this.cleanupRecord(record); } catch { failure = fixed("cleanup_failed"); }
    finally { this.records.delete(this.key(record.handle)); }
    if (failure) { this.emitError(record, failure.code); throw failure; }
  }

  private key(handle: Pick<PreviewHandle, "projectId" | "handleId" | "generation">): string { return `${handle.projectId}\u0000${handle.handleId}\u0000${handle.generation}`; }

  private assertCurrent(projectId: string, handle: PreviewHandle): PreviewRecord {
    assertProjectId(projectId);
    if (!handle || typeof handle !== "object" || Object.keys(handle).sort().join(",") !== "generation,handleId,projectId" || handle.projectId !== projectId || !UUID.test(handle.handleId) || !Number.isSafeInteger(handle.generation) || handle.generation < 1) {
      if (handle && typeof handle === "object" && "projectId" in handle && (handle as PreviewHandle).projectId !== projectId) throw fixed("cross_project");
      throw fixed("invalid_request");
    }
    const record = this.records.get(this.key(handle));
    if (record) {
      if (record.state === "closed") throw fixed("closed_handle");
      return record;
    }
    const same = [...this.records.values()].some((candidate) => candidate.handle.projectId === projectId && candidate.handle.handleId === handle.handleId);
    throw fixed(same ? "stale_handle" : "closed_handle");
  }

  private async ensureAuthorized(actor: PreviewActor, operation: PreviewOperation, projectId: string, generation: number, handleId?: string): Promise<void> {
    let allowed = false;
    try { allowed = await this.authorize({ actor: Object.freeze({ accountId: actor.accountId, role: actor.role }), generation, ...(handleId ? { handleId } : {}), operation, projectId }); } catch { throw fixed("authorization_failed"); }
    if (!allowed) throw fixed("authorization_failed");
  }

  private configurePolicies(record: PreviewRecord): void {
    record.session.webRequest.onBeforeRequest({ urls: [ALL_URLS_FILTER] }, (_details, callback) => callback({ cancel: true }));
    record.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    record.session.setPermissionCheckHandler(() => false);
    record.session.on("will-download", (event) => event.preventDefault?.());
    record.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    record.window.webContents.on("will-navigate", (event: PreventableEvent) => event.preventDefault?.());
    record.window.webContents.on("will-redirect", (event: PreventableEvent) => event.preventDefault?.());
    record.window.webContents.on("ipc-message", (event: PreventableEvent) => event.preventDefault?.());
    record.window.webContents.on("devtools-opened", () => record.window.webContents.closeDevTools?.());
    record.window.webContents.on("destroyed", () => { void this.destroyed(record); });
  }

  private async destroyed(record: PreviewRecord): Promise<void> {
    if (record.cleaned) return;
    record.state = "closed";
    this.emitState(record);
    try { await this.cleanupRecord(record); } catch { this.emitError(record, "cleanup_failed"); }
    finally { this.records.delete(this.key(record.handle)); }
  }

  private async cleanupSession(session: PreviewSession): Promise<void> {
    try { await session.clearStorageData({ storages: ["serviceworkers", "caches", "localstorage", "indexdb", "websql", "cookies"] }); } catch { /* continue cleanup phases */ }
    try { await session.clearCache(); } catch { /* continue cleanup phases */ }
    try { await session.flushStorageData?.(); } catch { /* continue cleanup phases */ }
  }

  private async cleanupRecord(record: PreviewRecord): Promise<void> {
    if (record.cleaned) return;
    record.cleaned = true;
    let failed = false;
    try { await record.session.clearStorageData({ storages: ["serviceworkers", "caches", "localstorage", "indexdb", "websql", "cookies"] }); } catch { failed = true; }
    try { await record.session.clearCache(); } catch { failed = true; }
    try { await record.session.flushStorageData?.(); } catch { failed = true; }
    try { if (!(record.window.isDestroyed?.() ?? false)) record.window.destroy(); } catch { failed = true; }
    if (failed) throw fixed("cleanup_failed");
  }

  private emitState(record: PreviewRecord): void {
    const event: PreviewStateEvent = Object.freeze({ type: "state", handle: record.handle, state: record.state });
    for (const listener of this.listeners) { try { listener(event); } catch { /* listeners cannot affect lifecycle */ } }
  }

  private emitError(record: PreviewRecord, code: PreviewErrorCode): void {
    const event: PreviewErrorEvent = Object.freeze({ type: "error", handle: record.handle, code });
    for (const listener of this.listeners) { try { listener(event); } catch { /* listeners cannot affect lifecycle */ } }
  }
}

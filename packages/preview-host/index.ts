import { randomUUID } from "node:crypto";

const MAX_PROJECT_ID_BYTES = 96;
const MAX_HTML_BYTES = 1_048_576;
const MAX_ASSETS = 64;
const MAX_ASSET_BYTES = 524_288;
const MAX_TOTAL_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_ASSET_NAME_BYTES = 160;
const MAX_REASON_BYTES = 200;

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
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "worker-src 'none'"
].join("; ");

const URL_ATTRIBUTES = /\b(?:src|href|action|formaction|poster|cite|background)\s*=\s*(["'])(.*?)\1/giu;
const CSS_URLS = /url\(\s*(["']?)(.*?)\1\s*\)/giu;
const UNSAFE_URL = /^(?:https?:|file:|javascript:|vbscript:|ws:|wss:|data:|blob:|filesystem:|chrome:|devtools:|\/\/)/iu;
const SAFE_DATA_URL = /^data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|font\/(?:woff|woff2));base64,[a-z0-9+/=]+$/iu;
const ALLOWED_ASSET_TYPES = new Set([
  "application/json",
  "audio/mpeg",
  "font/woff",
  "font/woff2",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "text/css",
  "text/plain"
]);

export type PreviewState = "creating" | "ready" | "reloading" | "closed" | "failed";

export type PreviewHandle = Readonly<{
  projectId: string;
  handleId: string;
  generation: number;
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

export type PreviewStateEvent = Readonly<{
  type: "state";
  handle: PreviewHandle;
  state: PreviewState;
  reason?: string;
}>;

export class PreviewHandleError extends Error {
  readonly code: "invalid_handle" | "stale_handle" | "cross_project" | "closed_handle";

  constructor(code: PreviewHandleError["code"], message: string) {
    super(message);
    this.name = "PreviewHandleError";
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

type PreviewRecord = {
  content: PreviewContent;
  dataUrl: string;
  handle: PreviewHandle;
  session: PreviewSession;
  state: PreviewState;
  window: PreviewWindow;
};

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertBoundedString(value: unknown, label: string, maximum: number): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || byteLength(value) > maximum) {
    throw new RangeError(`${label} must be a non-empty string of at most ${maximum} bytes.`);
  }
}

function assertProjectId(projectId: unknown): asserts projectId is string {
  assertBoundedString(projectId, "projectId", MAX_PROJECT_ID_BYTES);
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(projectId) || projectId.includes("..")) {
    throw new RangeError("projectId contains unsupported characters.");
  }
}

function normalizeAssetName(name: unknown): string {
  assertBoundedString(name, "asset name", MAX_ASSET_NAME_BYTES);
  const normalized = name.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("//") || !/^[a-z0-9][a-z0-9._/-]*$/iu.test(normalized)) {
    throw new RangeError("asset name must be a relative local name without traversal.");
  }
  return normalized;
}

function normalizeAsset(asset: PreviewAsset): PreviewAsset {
  const name = normalizeAssetName(asset.name);
  assertBoundedString(asset.mimeType, "asset mimeType", 96);
  const mimeType = asset.mimeType.toLowerCase();
  if (!ALLOWED_ASSET_TYPES.has(mimeType)) {
    throw new RangeError(`asset type is not allowed: ${mimeType}`);
  }
  if (!(asset.bytes instanceof Uint8Array) || asset.bytes.byteLength > MAX_ASSET_BYTES) {
    throw new RangeError(`asset ${name} exceeds the ${MAX_ASSET_BYTES}-byte limit.`);
  }
  return Object.freeze({ name, mimeType, bytes: new Uint8Array(asset.bytes) });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function assetDataUrl(asset: PreviewAsset): string {
  return `data:${asset.mimeType};base64,${toBase64(asset.bytes)}`;
}

function isLocalReference(reference: string): boolean {
  return reference.startsWith("#") || reference.startsWith("./") || reference.startsWith("../") || reference.startsWith("/") || /^[a-z0-9._/-]+$/iu.test(reference);
}

function assetReference(reference: string, assets: ReadonlyMap<string, PreviewAsset>): string | undefined {
  if (!isLocalReference(reference)) return undefined;
  const candidates = [reference, reference.replace(/^\.\//u, ""), reference.replace(/^\//u, "")];
  for (const candidate of candidates) {
    const asset = assets.get(candidate);
    if (asset) return assetDataUrl(asset);
  }
  return undefined;
}

function validateReference(reference: string, assets: ReadonlyMap<string, PreviewAsset>): string {
  const value = reference.trim();
  if (!value || value.startsWith("#")) return value;
  if (SAFE_DATA_URL.test(value)) return value;
  if (UNSAFE_URL.test(value)) {
    throw new Error(`preview content contains a blocked resource reference: ${value.slice(0, 80)}`);
  }
  const embedded = assetReference(value, assets);
  if (embedded) return embedded;
  if (isLocalReference(value)) throw new Error(`preview asset is not registered: ${value.slice(0, 80)}`);
  throw new Error("preview content contains a non-local resource reference.");
}

export function sanitizePreviewHtml(content: PreviewContent): string {
  assertBoundedString(content.html, "html", MAX_HTML_BYTES);
  if (/<base(?:\s|>)/iu.test(content.html)) {
    throw new Error("preview content must not contain a base element.");
  }
  const sourceAssets = content.assets ?? [];
  if (!Array.isArray(sourceAssets) || sourceAssets.length > MAX_ASSETS) {
    throw new RangeError(`preview content supports at most ${MAX_ASSETS} assets.`);
  }
  const assets = new Map<string, PreviewAsset>();
  let totalBytes = 0;
  for (const sourceAsset of sourceAssets) {
    const asset = normalizeAsset(sourceAsset);
    if (assets.has(asset.name)) throw new Error(`duplicate preview asset: ${asset.name}`);
    totalBytes += asset.bytes.byteLength;
    if (totalBytes > MAX_TOTAL_ASSET_BYTES) throw new RangeError("preview assets exceed the total byte limit.");
    assets.set(asset.name, asset);
  }

  let sanitized = content.html.replace(URL_ATTRIBUTES, (full, quote: string, reference: string) => {
    const replacement = validateReference(reference, assets);
    return full.replace(reference, replacement);
  });
  sanitized = sanitized.replace(CSS_URLS, (full, quote: string, reference: string) => {
    const replacement = validateReference(reference, assets);
    return full.replace(reference, replacement);
  });
  if (/<(?:iframe|object|embed|portal)(?:\s|>)/iu.test(sanitized)) {
    throw new Error("preview content cannot embed secondary browsing contexts.");
  }
  const csp = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
  const head = /<head(?:\s[^>]*)?>/iu;
  sanitized = head.test(sanitized) ? sanitized.replace(head, (tag) => `${tag}${csp}`) : `${csp}${sanitized}`;
  return sanitized;
}

export function previewDataUrl(content: PreviewContent): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(sanitizePreviewHtml(content))}`;
}

function publicHandle(projectId: string, handleId: string, generation: number): PreviewHandle {
  return Object.freeze({ projectId, handleId, generation });
}

function partitionFor(projectId: string, handleId: string): string {
  return `preview-${projectId}-${handleId}`;
}

function safeReason(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : String(reason);
  return text.replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, MAX_REASON_BYTES);
}

export class PreviewHostController {
  private readonly records = new Map<string, PreviewRecord>();
  private readonly listeners = new Set<(event: PreviewStateEvent) => void>();
  private readonly adapters: PreviewHostAdapters;

  constructor(adapters: PreviewHostAdapters) {
    this.adapters = adapters;
  }

  onState(listener: (event: PreviewStateEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async create(projectId: string, content: PreviewContent): Promise<PreviewHandle> {
    assertProjectId(projectId);
    const handleId = randomUUID();
    const handle = publicHandle(projectId, handleId, 1);
    const session = this.adapters.createSession(partitionFor(projectId, handleId));
    if (session.partition !== partitionFor(projectId, handleId)) throw new Error("session partition does not match the preview handle.");
    const record: PreviewRecord = {
      content,
      dataUrl: previewDataUrl(content),
      handle,
      session,
      state: "creating",
      window: this.adapters.createWindow({
        show: false,
        webPreferences: {
          session,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          devTools: false,
          allowRunningInsecureContent: false,
          webviewTag: false
        }
      })
    };
    const key = this.key(handle);
    this.records.set(key, record);
    this.configurePolicies(record);
    this.emit(record);
    try {
      await record.window.loadURL(record.dataUrl);
      if (record.state !== "closed") {
        record.state = "ready";
        this.emit(record);
      }
      return record.handle;
    } catch (error) {
      record.state = "failed";
      this.emit(record, safeReason(error));
      throw error;
    }
  }

  async reload(projectId: string, handle: PreviewHandle, content?: PreviewContent): Promise<PreviewHandle> {
    const record = this.assertCurrent(projectId, handle);
    if (content) {
      record.content = content;
      record.dataUrl = previewDataUrl(content);
    }
    record.handle = publicHandle(projectId, handle.handleId, handle.generation + 1);
    record.state = "reloading";
    this.records.delete(this.key(handle));
    this.records.set(this.key(record.handle), record);
    this.emit(record);
    try {
      await record.window.loadURL(record.dataUrl);
      record.state = "ready";
      this.emit(record);
      return record.handle;
    } catch (error) {
      record.state = "failed";
      this.emit(record, safeReason(error));
      throw error;
    }
  }

  async close(projectId: string, handle: PreviewHandle): Promise<void> {
    const record = this.assertCurrent(projectId, handle);
    record.state = "closed";
    this.emit(record);
    await record.session.clearStorageData({ storages: ["serviceworkers", "caches", "localstorage", "indexdb", "websql", "cookies"] });
    await record.session.clearCache();
    if (!(record.window.isDestroyed?.() ?? false)) record.window.destroy();
    this.records.delete(this.key(record.handle));
  }

  private key(handle: Pick<PreviewHandle, "projectId" | "handleId" | "generation">): string {
    return `${handle.projectId}\u0000${handle.handleId}\u0000${handle.generation}`;
  }

  private assertCurrent(projectId: string, handle: PreviewHandle): PreviewRecord {
    assertProjectId(projectId);
    if (!handle || typeof handle !== "object" || typeof handle.handleId !== "string" || typeof handle.generation !== "number") {
      throw new PreviewHandleError("invalid_handle", "preview handle is invalid.");
    }
    if (handle.projectId !== projectId) throw new PreviewHandleError("cross_project", "preview handle belongs to another project.");
    const record = this.records.get(this.key(handle));
    if (!record) {
      const sameHandle = [...this.records.values()].find((candidate) => candidate.handle.handleId === handle.handleId && candidate.handle.projectId === projectId);
      throw new PreviewHandleError(sameHandle ? "stale_handle" : "closed_handle", sameHandle ? "preview handle generation is stale." : "preview handle is closed or unknown.");
    }
    if (record.state === "closed") throw new PreviewHandleError("closed_handle", "preview handle is closed.");
    return record;
  }

  private configurePolicies(record: PreviewRecord): void {
    record.session.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (_details, callback) => callback({ cancel: true }));
    record.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    record.session.setPermissionCheckHandler(() => false);
    record.session.on("will-download", (event) => event.preventDefault?.());
    record.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    record.window.webContents.on("will-navigate", (event: PreventableEvent) => event.preventDefault?.());
    record.window.webContents.on("will-redirect", (event: PreventableEvent) => event.preventDefault?.());
    record.window.webContents.on("ipc-message", (event: PreventableEvent) => event.preventDefault?.());
    record.window.webContents.on("devtools-opened", () => record.window.webContents.closeDevTools?.());
    record.window.webContents.on("destroyed", () => {
      if (record.state !== "closed") {
        record.state = "closed";
        this.emit(record, "preview window was destroyed");
      }
    });
  }

  private emit(record: PreviewRecord, reason?: string): void {
    const event: PreviewStateEvent = Object.freeze({ type: "state", handle: record.handle, state: record.state, ...(reason ? { reason: safeReason(reason) } : {}) });
    for (const listener of this.listeners) listener(event);
  }
}

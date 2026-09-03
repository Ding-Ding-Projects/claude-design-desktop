import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import path from "node:path";

export const MAX_FEED_BYTES = 256 * 1024;
export const MAX_PACKAGE_BYTES = 2_000_000_000;
export const MIN_SCHEDULE_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_SCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_TRANSPORT_TIMEOUT_MS = 30_000;

export type UpdateStateName = "idle" | "checking" | "available" | "downloading" | "paused" | "ready" | "deferred" |
  "offline" | "invalid-feed" | "corrupt-package" | "hash-mismatch" | "rollback-rejected" | "failed";
export type PackageDescriptor = { architecture: "x64"; platform: "win32"; sha256: string; sizeBytes: number; url: string };
export type UpdateMetadata = { package: PackageDescriptor; releaseNotesUrl: string; schemaVersion: 1; updatedAt: string; version: string };
export type Body = Uint8Array | AsyncIterable<Uint8Array>;
export type FeedResponse = { body: Body; headers?: Record<string, string>; status: number };
export type FeedTransport = (url: string, signal: AbortSignal) => Promise<FeedResponse>;
export type PackageTransport = (descriptor: PackageDescriptor, signal: AbortSignal) => Promise<Body>;
export type StageResult = { fileName?: string; handleId?: string; sha256: string; sizeBytes: number };
export type PersistedUpdaterState = {
  available?: UpdateMetadata; lastCheckedAt?: string; productId?: string; stagedFileName?: string;
  stagedSha256?: string; stagedSizeBytes?: number; state: UpdateStateName; stateReason?: string;
};
export type UpdaterStore = {
  load(): PersistedUpdaterState | undefined;
  save(state: PersistedUpdaterState): void;
  stage(metadata: UpdateMetadata, body: Body, signal?: AbortSignal): Promise<StageResult> | StageResult;
  discardStaged?(handle: StageResult): Promise<void> | void;
  rehydrate?(signal?: AbortSignal): Promise<PersistedUpdaterState | undefined>;
};
export type UpdateBanner = { actions: readonly ["restart-to-install", "later"]; releaseNotesUrl: string; unsignedWarning: string; version: string };
export type UpdateState = PersistedUpdaterState & { banner?: UpdateBanner };
export type RestartResult = { ok: true } | { ok: false; reason: "no-ready-update" | "unsaved-work" | "restart-refused" };
export type TransportSecurity = { allowedHosts: readonly string[]; resolveHost?: (host: string) => Promise<readonly string[]>; timeoutMs: number };
export type UpdaterOptions = {
  allowedHosts: readonly string[]; currentVersion: string; feedUrl: string; fetchFeed: FeedTransport; downloadPackage: PackageTransport;
  now?: () => Date; onStateChange?: (state: UpdateState) => void; productId?: string; restart?: () => Promise<void> | void;
  store: UpdaterStore; scheduleIntervalMs?: number;
};

const UPDATE_STATES = new Set<UpdateStateName>([
  "idle", "checking", "available", "downloading", "paused", "ready", "deferred", "offline",
  "invalid-feed", "corrupt-package", "hash-mismatch", "rollback-rejected", "failed"
]);
let tempCounter = 0;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseSemanticVersion(value: unknown): [number, number, number, string[]] {
  if (typeof value !== "string") throw new Error("Update version must be a string.");
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match) throw new Error("Update version is not a semantic version.");
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ? match[4].split(".") : []];
}

export function compareSemanticVersions(left: string, right: string): number {
  const a = parseSemanticVersion(left);
  const b = parseSemanticVersion(right);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  if (!a[3].length && b[3].length) return 1;
  if (a[3].length && !b[3].length) return -1;
  for (let index = 0; index < Math.max(a[3].length, b[3].length); index += 1) {
    if (a[3][index] === undefined) return -1;
    if (b[3][index] === undefined) return 1;
    if (a[3][index] === b[3][index]) continue;
    const an = /^\d+$/.test(a[3][index]);
    const bn = /^\d+$/.test(b[3][index]);
    if (an && bn) return Number(a[3][index]) > Number(b[3][index]) ? 1 : -1;
    if (an) return -1;
    if (bn) return 1;
    return a[3][index] > b[3][index] ? 1 : -1;
  }
  return 0;
}

export function clampScheduleInterval(value: number | undefined): number {
  if (!Number.isFinite(value)) return MIN_SCHEDULE_INTERVAL_MS;
  return Math.min(MAX_SCHEDULE_INTERVAL_MS, Math.max(MIN_SCHEDULE_INTERVAL_MS, Math.trunc(value as number)));
}

export function validateHttpsAllowlistedUrl(value: unknown, allowedHosts: readonly string[], label: string): string {
  if (typeof value !== "string" || value.length > 2048) throw new Error(label + " must be a bounded URL.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(label + " is not a valid URL."); }
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !allowed.has(url.hostname.toLowerCase())) {
    throw new Error(label + " must use HTTPS, contain no credentials, and target an allowlisted host.");
  }
  return url.toString();
}

function isUnsafeAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (isIP(lower) === 4) {
    const octets = lower.split(".").map(Number);
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = octets;
    return a === 0 || a === 10 || (a === 100 && b >= 64 && b <= 127) || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || b === 2)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0) || a >= 224;
  }
  if (isIP(lower) !== 6) return true;
  if (lower === "::" || lower === "::1" || lower.startsWith("::ffff:") || lower.startsWith("fc") ||
    lower.startsWith("fd") || lower.startsWith("fe80:") || lower.startsWith("ff")) return true;
  const first = Number.parseInt(lower.split(":")[0] || "0", 16);
  return (first & 0xe000) !== 0x2000;
}

type ResolvedTransportTarget = { address: string; family: 4 | 6; url: string };
async function resolveSafeTransportTarget(urlValue: string, security: TransportSecurity, label: string): Promise<ResolvedTransportTarget> {
  const url = validateHttpsAllowlistedUrl(urlValue, security.allowedHosts, label);
  if (!Number.isSafeInteger(security.timeoutMs) || security.timeoutMs < 1000 || security.timeoutMs > 120_000) throw new Error("Transport timeout is outside its supported bound.");
  const resolve = security.resolveHost || (async (host: string) => (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address));
  const addresses = await resolve(new URL(url).hostname);
  if (!addresses.length || addresses.some(isUnsafeAddress)) throw new Error(label + " resolved to an unsafe, reserved, or unavailable address.");
  return { address: addresses[0], family: isIP(addresses[0]) as 4 | 6, url };
}

export async function assertSafeTransportTarget(urlValue: string, security: TransportSecurity, label: string): Promise<string> {
  return (await resolveSafeTransportTarget(urlValue, security, label)).url;
}

function deadlineSignal(parent: AbortSignal, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Update transport timed out.")), timeoutMs);
  const abort = () => controller.abort(parent.reason);
  if (parent.aborted) abort(); else parent.addEventListener("abort", abort, { once: true });
  return { signal: controller.signal, dispose: () => { clearTimeout(timer); parent.removeEventListener("abort", abort); } };
}

async function* bodyChunks(body: Body): AsyncIterable<Uint8Array> {
  if (body instanceof Uint8Array) { yield body; return; }
  for await (const chunk of body) yield chunk;
}

async function readBoundedBody(body: Body, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of bodyChunks(body)) {
    if (signal.aborted) throw signal.reason || new Error("Operation cancelled.");
    total += chunk.byteLength;
    if (total > limit) throw new Error("Response exceeds its bounded size of " + limit + " bytes.");
    chunks.push(chunk);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

type BoundResponse = { body: AsyncIterable<Uint8Array>; headers: Record<string, string>; status: number };
async function requestBoundHttps(target: ResolvedTransportTarget, signal: AbortSignal, timeoutMs: number, accept: string): Promise<BoundResponse> {
  const deadline = deadlineSignal(signal, timeoutMs);
  return new Promise((resolve, reject) => {
    const url = new URL(target.url);
    const request = httpsRequest({
      host: url.hostname,
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
      path: url.pathname + url.search,
      port: 443,
      servername: url.hostname,
      signal: deadline.signal,
      headers: { accept }
    }, (response) => {
      const incoming = response as unknown as AsyncIterable<Uint8Array>;
      async function* body(): AsyncIterable<Uint8Array> {
        try {
          for await (const chunk of incoming) {
            if (deadline.signal.aborted) throw deadline.signal.reason || new Error("Update transport timed out.");
            yield chunk;
          }
        } finally { deadline.dispose(); }
      }
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : String(value || "")]));
      resolve({ body: body(), headers, status: response.statusCode || 0 });
    });
    request.once("error", (error) => { deadline.dispose(); reject(error); });
    request.end();
  });
}

export async function fetchHttpsFeed(urlValue: string, signal: AbortSignal, security: TransportSecurity): Promise<FeedResponse> {
  const target = await resolveSafeTransportTarget(urlValue, security, "Update feed URL");
  const response = await requestBoundHttps(target, signal, security.timeoutMs, "application/json");
  const body = await readBoundedBody(response.body, MAX_FEED_BYTES, signal);
  return { body, headers: response.headers, status: response.status };
}

export async function downloadHttpsPackage(descriptor: PackageDescriptor, signal: AbortSignal, security: TransportSecurity): Promise<Body> {
  if (descriptor.platform !== "win32" || descriptor.architecture !== "x64") throw new Error("Only win32/x64 update packages are supported.");
  const target = await resolveSafeTransportTarget(descriptor.url, security, "Update package URL");
  const response = await requestBoundHttps(target, signal, security.timeoutMs, "application/octet-stream");
  if (response.status < 200 || response.status >= 300) throw new Error("Update package returned HTTP " + response.status + ".");
  const contentLength = response.headers["content-length"];
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_PACKAGE_BYTES)) throw new Error("Update package Content-Length is outside the supported bound.");
  let total = 0;
  async function* bounded(): AsyncIterable<Uint8Array> {
    for await (const chunk of response.body) {
      if (signal.aborted) throw signal.reason || new Error("Operation cancelled.");
      total += chunk.byteLength;
      if (total > MAX_PACKAGE_BYTES) throw new Error("Update package exceeds its bounded size.");
      yield chunk;
    }
  }
  return bounded();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireOnlyKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new Error(label + " contains an unsupported field: " + key + ".");
}

export function validateUpdateMetadata(payload: unknown, options: Pick<UpdaterOptions, "allowedHosts" | "currentVersion" | "feedUrl">): UpdateMetadata {
  if (!isRecord(payload)) throw new Error("Update feed must contain an object.");
  requireOnlyKeys(payload, ["schemaVersion", "version", "updatedAt", "releaseNotesUrl", "package"], "Update feed");
  if (payload.schemaVersion !== 1) throw new Error("Update feed schema version is unsupported.");
  parseSemanticVersion(payload.version);
  if (typeof payload.updatedAt !== "string" || !Number.isFinite(Date.parse(payload.updatedAt))) throw new Error("Update feed updatedAt is invalid.");
  const releaseNotesUrl = validateHttpsAllowlistedUrl(payload.releaseNotesUrl, options.allowedHosts, "Release notes URL");
  if (!isRecord(payload.package)) throw new Error("Update feed package is missing.");
  requireOnlyKeys(payload.package, ["url", "sha256", "sizeBytes", "platform", "architecture"], "Update package");
  const pkg = payload.package;
  const packageUrl = validateHttpsAllowlistedUrl(pkg.url, options.allowedHosts, "Package URL");
  if (pkg.platform !== "win32" || pkg.architecture !== "x64") throw new Error("Update package platform or architecture is unsupported.");
  if (typeof pkg.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(pkg.sha256)) throw new Error("Update package sha256 is invalid.");
  if (typeof pkg.sizeBytes !== "number" || !Number.isSafeInteger(pkg.sizeBytes) || pkg.sizeBytes <= 0 || pkg.sizeBytes > MAX_PACKAGE_BYTES) throw new Error("Update package size is outside the supported bound.");
  const feedUrl = validateHttpsAllowlistedUrl(options.feedUrl, options.allowedHosts, "Update feed URL");
  if (new URL(packageUrl).hostname !== new URL(feedUrl).hostname) throw new Error("Update package host must match the feed host.");
  return { package: { architecture: "x64", platform: "win32", sha256: pkg.sha256, sizeBytes: pkg.sizeBytes, url: packageUrl }, releaseNotesUrl, schemaVersion: 1, updatedAt: payload.updatedAt, version: payload.version as string };
}

export class AtomicUpdaterStore implements UpdaterStore {
  private readonly rootDir: string;
  private readonly stageDir: string;
  private readonly productId: string;
  private readonly context: Pick<UpdaterOptions, "allowedHosts" | "currentVersion" | "feedUrl">;
  private readonly statePath: string;

  public constructor(rootDir: string, productId: string, context: Pick<UpdaterOptions, "allowedHosts" | "currentVersion" | "feedUrl">) {
    if (!productId || !/^[A-Za-z0-9._-]{1,64}$/.test(productId)) throw new Error("Product identity is invalid.");
    this.rootDir = rootDir;
    this.stageDir = path.join(rootDir, "updates");
    this.productId = productId;
    this.context = context;
    this.statePath = path.join(rootDir, productId + "-update-state.json");
    mkdirSync(this.stageDir, { recursive: true });
  }
  public load(): PersistedUpdaterState | undefined {
    if (!existsSync(this.statePath)) return undefined;
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, "utf8")) as PersistedUpdaterState;
      if (parsed.productId !== this.productId || !UPDATE_STATES.has(parsed.state)) return undefined;
      if (parsed.available) parsed.available = validateUpdateMetadata(parsed.available, this.context);
      return parsed;
    } catch { return undefined; }
  }
  public async rehydrate(signal?: AbortSignal): Promise<PersistedUpdaterState | undefined> {
    const state = this.load();
    if (!state?.available) return state;
    if (state.state === "ready" || state.state === "deferred") {
      if (!state.stagedFileName || !state.stagedSha256 || !state.stagedSizeBytes) {
        const corrupt = { productId: this.productId, state: "corrupt-package" as const, stateReason: "Ready update is missing staged-byte provenance." };
        this.save(corrupt);
        return corrupt;
      }
    } else if (!state.stagedFileName || !state.stagedSha256 || !state.stagedSizeBytes) return state;
    const corrupt = { productId: this.productId, state: "corrupt-package" as const, stateReason: "Staged update bytes failed revalidation." };
    let result: StageResult;
    try { result = await hashFile(this.safeStagePath(state.stagedFileName), signal); }
    catch { this.save(corrupt); return corrupt; }
    if (result.sha256 !== state.stagedSha256 || result.sizeBytes !== state.stagedSizeBytes || result.sha256 !== state.available.package.sha256 || result.sizeBytes !== state.available.package.sizeBytes) {
      this.save(corrupt);
      return corrupt;
    }
    return state;
  }
  public save(state: PersistedUpdaterState): void {
    if (state.productId && state.productId !== this.productId) throw new Error("Update state product identity mismatch.");
    const temp = path.join(this.rootDir, this.productId + "-update-state." + process.pid + "." + ++tempCounter + ".tmp");
    writeFileSync(temp, JSON.stringify({ ...state, productId: this.productId }), { encoding: "utf8", flag: "wx" });
    renameSyncWithRetry(temp, this.statePath);
  }
  public async stage(metadata: UpdateMetadata, body: Body, signal?: AbortSignal): Promise<StageResult> {
    const handleId = randomUUID();
    const fileName = this.productId + "-" + metadata.version.replace(/[^A-Za-z0-9.-]/g, "_") + "-" + metadata.package.sha256 + "-" + handleId + ".exe";
    const target = this.safeStagePath(fileName);
    const temp = target + "." + process.pid + "." + ++tempCounter + ".part";
    const handle = await open(temp, "wx");
    const hash = createHash("sha256");
    let size = 0;
    try {
      for await (const chunk of bodyChunks(body)) {
        if (signal?.aborted) throw signal.reason || new Error("Operation cancelled.");
        size += chunk.byteLength;
        if (size > MAX_PACKAGE_BYTES || size > metadata.package.sizeBytes) throw new Error("Update package exceeds its declared bound.");
        hash.update(chunk);
        await handle.write(chunk);
      }
      const sha256 = hash.digest("hex");
      if (size !== metadata.package.sizeBytes) throw new Error("Downloaded package size " + size + " does not match expected size " + metadata.package.sizeBytes + ".");
      if (sha256 !== metadata.package.sha256) throw new Error("Downloaded package SHA-256 does not match feed metadata.");
      await handle.sync();
      await handle.close();
      await renameWithRetry(temp, target);
      return { fileName, handleId, sha256, sizeBytes: size };
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }
  public async discardStaged(handle: StageResult): Promise<void> {
    if (!handle.fileName || !handle.handleId || !handle.fileName.includes(handle.handleId)) return;
    await rm(this.safeStagePath(handle.fileName), { force: true });
  }
  public stagedPath(fileName: string): string { return this.safeStagePath(fileName); }
  private safeStagePath(fileName: string): string {
    if (!/^[A-Za-z0-9._-]{1,260}$/.test(fileName) || fileName.includes("..")) throw new Error("Staged file name is invalid.");
    return path.join(this.stageDir, fileName);
  }
}

async function hashFile(filePath: string, signal?: AbortSignal): Promise<StageResult> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(filePath)) {
    if (signal?.aborted) throw signal.reason || new Error("Operation cancelled.");
    const bytes = chunk as Buffer;
    size += bytes.byteLength;
    if (size > MAX_PACKAGE_BYTES) throw new Error("Staged update exceeds its bounded size.");
    hash.update(bytes);
  }
  return { sha256: hash.digest("hex"), sizeBytes: size };
}

async function renameWithRetry(source: string, target: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try { await rename(source, target); return; } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw lastError;
}

function renameSyncWithRetry(source: string, target: string): void {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try { renameSync(source, target); return; } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw error;
      const wait = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(wait), 0, 0, 50 * (attempt + 1));
    }
  }
  throw lastError;
}

type Operation = { controller: AbortController; generation: number };
export class UpdaterStateMachine {
  private readonly options: UpdaterOptions;
  private readonly now: () => Date;
  private stateValue: UpdateState;
  private operation: Operation | undefined;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stageHandle: StageResult | undefined;
  public constructor(options: UpdaterOptions) {
    this.options = options;
    this.now = options.now || (() => new Date());
    const persisted = options.store.load();
    this.stateValue = { state: persisted?.state || "idle", ...persisted };
  }
  public get state(): UpdateState { return { ...this.stateValue, banner: this.getBanner() }; }
  public async rehydrate(): Promise<UpdateState> {
    if (!this.options.store.rehydrate) return this.state;
    const state = await this.options.store.rehydrate();
    if (state) this.setState(state);
    return this.state;
  }
  public async startupCheck(): Promise<UpdateState> { return this.checkForUpdates(); }
  public startSchedule(): void { this.stopSchedule(); this.timer = setInterval(() => { void this.checkForUpdates(); }, clampScheduleInterval(this.options.scheduleIntervalMs)); }
  public stopSchedule(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  public async checkForUpdates(): Promise<UpdateState> {
    const operation = this.beginOperation("checking");
    try {
      const feedUrl = validateHttpsAllowlistedUrl(this.options.feedUrl, this.options.allowedHosts, "Update feed URL");
      const response = await this.options.fetchFeed(feedUrl, operation.controller.signal);
      if (!this.isCurrent(operation)) return this.state;
      if (response.status < 200 || response.status >= 300) throw new Error("Update feed returned HTTP " + response.status + ".");
      const raw = await readBoundedBody(response.body, MAX_FEED_BYTES, operation.controller.signal);
      if (!this.isCurrent(operation)) return this.state;
      const metadata = validateUpdateMetadata(JSON.parse(new TextDecoder().decode(raw)), this.options);
      const comparison = compareSemanticVersions(metadata.version, this.options.currentVersion);
      if (!this.isCurrent(operation)) return this.state;
      if (comparison < 0) this.setState({ available: metadata, lastCheckedAt: this.now().toISOString(), state: "rollback-rejected", stateReason: "The feed version is older than the running version." });
      else if (comparison === 0) this.setState({ available: undefined, lastCheckedAt: this.now().toISOString(), state: "idle", stateReason: "The feed has no newer version." });
      else this.setState({ available: metadata, lastCheckedAt: this.now().toISOString(), state: "available", stateReason: undefined });
    } catch (error) {
      if (!this.isCurrent(operation) || operation.controller.signal.aborted) return this.state;
      const reason = error instanceof Error ? error.message : "Update check failed.";
      this.setState({ lastCheckedAt: this.now().toISOString(), state: /network|fetch|offline|timed out|ECONN|unsafe address/i.test(reason) ? "offline" : "invalid-feed", stateReason: reason });
    } finally { this.finishOperation(operation); }
    return this.state;
  }
  public async download(): Promise<UpdateState> {
    const metadata = this.stateValue.available;
    if (!metadata || !["available", "deferred", "paused"].includes(this.stateValue.state)) return this.state;
    const operation = this.beginOperation("downloading");
    try {
      const body = await this.options.downloadPackage(metadata.package, operation.controller.signal);
      if (!this.isCurrent(operation)) return this.state;
      const staged = await this.options.store.stage(metadata, body, operation.controller.signal);
      if (!this.isCurrent(operation) || operation.controller.signal.aborted) {
        await this.options.store.discardStaged?.(staged);
        return this.state;
      }
      this.stageHandle = staged;
      this.setState({ stagedFileName: staged.fileName, stagedSha256: staged.sha256, stagedSizeBytes: staged.sizeBytes, state: "ready", stateReason: undefined });
    } catch (error) {
      if (!this.isCurrent(operation) || operation.controller.signal.aborted) return this.state;
      const reason = error instanceof Error ? error.message : "Update download failed.";
      this.setState({ state: /network|fetch|offline|timed out|ECONN/i.test(reason) ? "offline" : /SHA-256/i.test(reason) ? "hash-mismatch" : "corrupt-package", stateReason: reason });
    } finally { this.finishOperation(operation); }
    return this.state;
  }
  public pauseDownload(): UpdateState {
    if (this.stateValue.state === "downloading" && this.operation) {
      this.operation.controller.abort(new Error("Download paused by the user."));
      this.setState({ state: "paused", stateReason: "Download paused by the user." });
    }
    return this.state;
  }
  public cancelDownload(): UpdateState {
    if (this.stateValue.state === "downloading" || this.stateValue.state === "paused") {
      const operation = this.operation;
      const stageHandle = this.stageHandle;
      this.generation += 1;
      operation?.controller.abort(new Error("Download cancelled by the user."));
      this.operation = undefined;
      this.stageHandle = undefined;
      this.setState({ state: "available", stateReason: "Download cancelled by the user.", stagedFileName: undefined, stagedSha256: undefined, stagedSizeBytes: undefined });
      if (stageHandle) void this.options.store.discardStaged?.(stageHandle);
    }
    return this.state;
  }
  public later(): UpdateState {
    if (this.stateValue.available && (this.stateValue.state === "ready" || this.stateValue.state === "available")) this.setState({ state: "deferred", stateReason: "Installation deferred by the user." });
    return this.state;
  }
  public async restartToInstall(isUnsavedWork: () => boolean): Promise<RestartResult> {
    if (this.stateValue.state !== "ready" || !this.stateValue.available) return { ok: false, reason: "no-ready-update" };
    if (isUnsavedWork()) return { ok: false, reason: "unsaved-work" };
    if (!this.options.restart) return { ok: false, reason: "restart-refused" };
    try { await this.options.restart(); return { ok: true }; } catch { return { ok: false, reason: "restart-refused" }; }
  }
  public getBanner(): UpdateBanner | undefined {
    const metadata = this.stateValue.available;
    if (!metadata || !["ready", "deferred"].includes(this.stateValue.state)) return undefined;
    return { actions: ["restart-to-install", "later"], releaseNotesUrl: metadata.releaseNotesUrl, unsignedWarning: "This update is unsigned and may trigger an unknown-publisher warning.", version: metadata.version };
  }
  private beginOperation(state: UpdateStateName): Operation {
    this.operation?.controller.abort(new Error("A newer update operation superseded this operation."));
    const operation = { controller: new AbortController(), generation: ++this.generation };
    this.operation = operation;
    this.setState({ state, stateReason: undefined });
    return operation;
  }
  private isCurrent(operation: Operation): boolean { return this.operation === operation && operation.generation === this.generation; }
  private finishOperation(operation: Operation): void { if (this.isCurrent(operation)) this.operation = undefined; }
  private setState(next: Partial<UpdateState>): void {
    this.stateValue = { ...this.stateValue, ...next };
    delete this.stateValue.banner;
    this.options.store.save(this.stateValue);
    this.options.onStateChange?.(this.state);
  }
}

export type SquirrelHandoff = { architecture: "x64"; packageFileName: string; platform: "win32"; unsigned: true; version: string };
export function createSquirrelWindowsHandoff(metadata: UpdateMetadata, stagedFileName: string, currentVersion: string): SquirrelHandoff {
  if (metadata.package.platform !== "win32" || metadata.package.architecture !== "x64") throw new Error("Squirrel.Windows handoff supports only win32/x64.");
  if (compareSemanticVersions(metadata.version, currentVersion) <= 0) throw new Error("Squirrel.Windows handoff refuses rollback or equal versions.");
  if (!/^[A-Za-z0-9._-]{1,260}\.exe$/.test(stagedFileName)) throw new Error("Squirrel.Windows staged file name is invalid.");
  return { architecture: "x64", packageFileName: stagedFileName, platform: "win32", unsigned: true, version: metadata.version };
}
export function createSquirrelRollbackPlan(previousVersion: string, stagedFileName: string): { stagedFileName: string; version: string } {
  parseSemanticVersion(previousVersion);
  if (!/^[A-Za-z0-9._-]{1,260}\.exe$/.test(stagedFileName)) throw new Error("Squirrel.Windows rollback file name is invalid.");
  return { stagedFileName, version: previousVersion };
}

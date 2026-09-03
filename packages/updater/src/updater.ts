import { createHash } from "node:crypto";

export const MAX_FEED_BYTES = 256 * 1024;
export const MAX_PACKAGE_BYTES = 2_000_000_000;
export const MIN_SCHEDULE_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_SCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type UpdateStateName =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "paused"
  | "ready"
  | "deferred"
  | "offline"
  | "invalid-feed"
  | "corrupt-package"
  | "hash-mismatch"
  | "rollback-rejected"
  | "failed";

export type PackageDescriptor = {
  architecture: "x64" | "arm64" | "ia32";
  platform: "win32";
  sha256: string;
  sizeBytes: number;
  url: string;
};

export type UpdateMetadata = {
  package: PackageDescriptor;
  releaseNotesUrl: string;
  schemaVersion: 1;
  updatedAt: string;
  version: string;
};

export type FeedResponse = {
  body: Uint8Array;
  headers?: Record<string, string>;
  status: number;
};

export type FeedTransport = (url: string, signal: AbortSignal) => Promise<FeedResponse>;
export type PackageTransport = (descriptor: PackageDescriptor, signal: AbortSignal) => Promise<Uint8Array>;

export type UpdaterStore = {
  load(): PersistedUpdaterState | undefined;
  save(state: PersistedUpdaterState): void;
  stage(metadata: UpdateMetadata, packageBytes: Uint8Array): Promise<void> | void;
};

export type PersistedUpdaterState = {
  available?: UpdateMetadata;
  lastCheckedAt?: string;
  state: UpdateStateName;
  stateReason?: string;
};

export type UpdateState = PersistedUpdaterState & {
  banner?: UpdateBanner;
};

export type UpdateBanner = {
  actions: readonly ["restart-to-install", "later"];
  releaseNotesUrl: string;
  unsignedWarning: string;
  version: string;
};

export type RestartResult =
  | { ok: true }
  | { ok: false; reason: "no-ready-update" | "unsaved-work" | "restart-refused" };

export type UpdaterOptions = {
  allowedHosts: readonly string[];
  currentVersion: string;
  feedUrl: string;
  fetchFeed: FeedTransport;
  downloadPackage: PackageTransport;
  now?: () => Date;
  onStateChange?: (state: UpdateState) => void;
  restart?: () => Promise<void> | void;
  store: UpdaterStore;
  scheduleIntervalMs?: number;
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseSemanticVersion(value: unknown): [number, number, number, string[]] {
  if (typeof value !== "string") {
    throw new Error("Update version must be a string.");
  }
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match) {
    throw new Error("Update version is not a semantic version.");
  }
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ? match[4].split(".") : []];
}

export function compareSemanticVersions(left: string, right: string): number {
  const a = parseSemanticVersion(left);
  const b = parseSemanticVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] > b[index] ? 1 : -1;
    }
  }
  const aPre = a[3];
  const bPre = b[3];
  if (!aPre.length && !bPre.length) return 0;
  if (!aPre.length) return 1;
  if (!bPre.length) return -1;
  for (let index = 0; index < Math.max(aPre.length, bPre.length); index += 1) {
    if (aPre[index] === undefined) return -1;
    if (bPre[index] === undefined) return 1;
    if (aPre[index] === bPre[index]) continue;
    const aNumeric = /^\d+$/.test(aPre[index]);
    const bNumeric = /^\d+$/.test(bPre[index]);
    if (aNumeric && bNumeric) return Number(aPre[index]) > Number(bPre[index]) ? 1 : -1;
    if (aNumeric) return -1;
    if (bNumeric) return 1;
    return aPre[index] > bPre[index] ? 1 : -1;
  }
  return 0;
}

export function clampScheduleInterval(value: number | undefined): number {
  if (!Number.isFinite(value)) return MIN_SCHEDULE_INTERVAL_MS;
  return Math.min(MAX_SCHEDULE_INTERVAL_MS, Math.max(MIN_SCHEDULE_INTERVAL_MS, Math.trunc(value as number)));
}

export function validateHttpsAllowlistedUrl(value: unknown, allowedHosts: readonly string[], label: string): string {
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error(`${label} must be a bounded URL.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !allowed.has(url.hostname.toLowerCase())) {
    throw new Error(`${label} must use HTTPS, contain no credentials, and target an allowlisted host.`);
  }
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireOnlyKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${label} contains an unsupported field: ${key}.`);
  }
}

export function validateUpdateMetadata(payload: unknown, options: Pick<UpdaterOptions, "allowedHosts" | "currentVersion" | "feedUrl">): UpdateMetadata {
  if (!isRecord(payload)) throw new Error("Update feed must contain an object.");
  requireOnlyKeys(payload, ["schemaVersion", "version", "updatedAt", "releaseNotesUrl", "package"], "Update feed");
  if (payload.schemaVersion !== 1) throw new Error("Update feed schema version is unsupported.");
  const version = payload.version;
  parseSemanticVersion(version);
  const updatedAt = payload.updatedAt;
  if (typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) throw new Error("Update feed updatedAt is invalid.");
  const releaseNotesUrl = validateHttpsAllowlistedUrl(payload.releaseNotesUrl, options.allowedHosts, "Release notes URL");
  if (!isRecord(payload.package)) throw new Error("Update feed package is missing.");
  requireOnlyKeys(payload.package, ["url", "sha256", "sizeBytes", "platform", "architecture"], "Update package");
  const pkg = payload.package;
  const packageUrl = validateHttpsAllowlistedUrl(pkg.url, options.allowedHosts, "Package URL");
  if (pkg.platform !== "win32" || (pkg.architecture !== "x64" && pkg.architecture !== "arm64" && pkg.architecture !== "ia32")) {
    throw new Error("Update package platform or architecture is unsupported.");
  }
  if (typeof pkg.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(pkg.sha256)) throw new Error("Update package sha256 is invalid.");
  if (typeof pkg.sizeBytes !== "number" || !Number.isSafeInteger(pkg.sizeBytes) || pkg.sizeBytes <= 0 || pkg.sizeBytes > MAX_PACKAGE_BYTES) {
    throw new Error("Update package size is outside the supported bound.");
  }
  const feedUrl = validateHttpsAllowlistedUrl(options.feedUrl, options.allowedHosts, "Update feed URL");
  if (new URL(packageUrl).hostname !== new URL(feedUrl).hostname) throw new Error("Update package host must match the feed host.");
  return {
    package: { architecture: pkg.architecture, platform: pkg.platform, sha256: pkg.sha256, sizeBytes: pkg.sizeBytes, url: packageUrl },
    releaseNotesUrl,
    schemaVersion: 1,
    updatedAt,
    version: version as string
  };
}

export async function fetchHttpsFeed(url: string, signal: AbortSignal): Promise<FeedResponse> {
  const response = await fetch(url, { redirect: "error", signal, headers: { accept: "application/json" } });
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > MAX_FEED_BYTES) throw new Error("Update feed exceeds its bounded metadata size.");
  return { body, headers: Object.fromEntries(response.headers.entries()), status: response.status };
}

export async function downloadHttpsPackage(descriptor: PackageDescriptor, signal: AbortSignal): Promise<Uint8Array> {
  const url = new URL(descriptor.url);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Update package URL must use HTTPS without credentials.");
  }
  const response = await fetch(url, { redirect: "error", signal, headers: { accept: "application/octet-stream" } });
  const contentLength = response.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_PACKAGE_BYTES)) {
    throw new Error("Update package Content-Length is outside the supported bound.");
  }
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > MAX_PACKAGE_BYTES) throw new Error("Update package exceeds its bounded size.");
  return body;
}

export class UpdaterStateMachine {
  private readonly options: UpdaterOptions;
  private readonly now: () => Date;
  private timer: ReturnType<typeof setInterval> | undefined;
  private operation: AbortController | undefined;
  private stateValue: UpdateState;

  public constructor(options: UpdaterOptions) {
    this.options = options;
    this.now = options.now || (() => new Date());
    const persisted = options.store.load();
    this.stateValue = { state: persisted?.state || "idle", available: persisted?.available, lastCheckedAt: persisted?.lastCheckedAt, stateReason: persisted?.stateReason };
  }

  public get state(): UpdateState {
    return { ...this.stateValue, banner: this.getBanner() };
  }

  public async startupCheck(): Promise<UpdateState> {
    return this.checkForUpdates();
  }

  public startSchedule(): void {
    this.stopSchedule();
    const interval = clampScheduleInterval(this.options.scheduleIntervalMs);
    this.timer = setInterval(() => { void this.checkForUpdates(); }, interval);
  }

  public stopSchedule(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  public async checkForUpdates(): Promise<UpdateState> {
    if (this.stateValue.state === "downloading") return this.state;
    this.setState({ state: "checking", stateReason: undefined });
    this.operation?.abort();
    this.operation = new AbortController();
    try {
      const feedUrl = validateHttpsAllowlistedUrl(this.options.feedUrl, this.options.allowedHosts, "Update feed URL");
      const response = await this.options.fetchFeed(feedUrl, this.operation.signal);
      if (response.status < 200 || response.status >= 300) throw new Error(`Update feed returned HTTP ${response.status}.`);
      if (response.body.byteLength > MAX_FEED_BYTES) throw new Error("Update feed exceeds its bounded metadata size.");
      const metadata = validateUpdateMetadata(JSON.parse(new TextDecoder().decode(response.body)), this.options);
      const comparison = compareSemanticVersions(metadata.version, this.options.currentVersion);
      if (comparison < 0) {
        this.setState({ available: metadata, lastCheckedAt: this.now().toISOString(), state: "rollback-rejected", stateReason: "The feed version is older than the running version." });
      } else if (comparison === 0) {
        this.setState({ available: undefined, lastCheckedAt: this.now().toISOString(), state: "idle", stateReason: "The feed has no newer version." });
      } else {
        this.setState({ available: metadata, lastCheckedAt: this.now().toISOString(), state: "available", stateReason: undefined });
      }
    } catch (error) {
      if (this.operation?.signal.aborted) return this.state;
      const reason = error instanceof Error ? error.message : "Update check failed.";
      this.setState({ lastCheckedAt: this.now().toISOString(), state: /network|fetch|offline|timed out|ECONN/i.test(reason) ? "offline" : "invalid-feed", stateReason: reason });
    } finally {
      this.operation = undefined;
    }
    return this.state;
  }

  public async download(): Promise<UpdateState> {
    const metadata = this.stateValue.available;
    if (!metadata || (this.stateValue.state !== "available" && this.stateValue.state !== "deferred" && this.stateValue.state !== "paused")) return this.state;
    this.operation?.abort();
    this.operation = new AbortController();
    this.setState({ state: "downloading", stateReason: undefined });
    try {
      const bytes = await this.options.downloadPackage(metadata.package, this.operation.signal);
      if (bytes.byteLength !== metadata.package.sizeBytes) {
        this.setState({ state: "corrupt-package", stateReason: `Downloaded package size ${bytes.byteLength} does not match expected size ${metadata.package.sizeBytes}.` });
        return this.state;
      }
      if (sha256Hex(bytes) !== metadata.package.sha256) {
        this.setState({ state: "hash-mismatch", stateReason: "Downloaded package SHA-256 does not match feed metadata." });
        return this.state;
      }
      await this.options.store.stage(metadata, bytes);
      this.setState({ state: "ready", stateReason: undefined });
    } catch (error) {
      if (this.stateValue.state === "paused") return this.state;
      if (this.operation?.signal.aborted) return this.state;
      const reason = error instanceof Error ? error.message : "Update download failed.";
      this.setState({ state: /network|fetch|offline|timed out|ECONN/i.test(reason) ? "offline" : "failed", stateReason: reason });
    } finally {
      this.operation = undefined;
    }
    return this.state;
  }

  public pauseDownload(): UpdateState {
    if (this.stateValue.state === "downloading") {
      this.operation?.abort();
      this.setState({ state: "paused", stateReason: "Download paused by the user." });
    }
    return this.state;
  }

  public cancelDownload(): UpdateState {
    if (this.stateValue.state === "downloading" || this.stateValue.state === "paused") {
      this.operation?.abort();
      this.setState({ state: "available", stateReason: "Download cancelled by the user." });
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
    try {
      await this.options.restart();
      return { ok: true };
    } catch {
      return { ok: false, reason: "restart-refused" };
    }
  }

  public getBanner(): UpdateBanner | undefined {
    const metadata = this.stateValue.available;
    if (!metadata || (this.stateValue.state !== "ready" && this.stateValue.state !== "deferred")) return undefined;
    return {
      actions: ["restart-to-install", "later"],
      releaseNotesUrl: metadata.releaseNotesUrl,
      unsignedWarning: "This update is unsigned and may trigger an unknown-publisher warning.",
      version: metadata.version
    };
  }

  private setState(next: Partial<UpdateState>): void {
    this.stateValue = { ...this.stateValue, ...next };
    delete this.stateValue.banner;
    this.options.store.save({ available: this.stateValue.available, lastCheckedAt: this.stateValue.lastCheckedAt, state: this.stateValue.state, stateReason: this.stateValue.stateReason });
    this.options.onStateChange?.(this.state);
  }
}

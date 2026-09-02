import { basename, isAbsolute, normalize } from "node:path";

export const LIMITS = Object.freeze({
  responseBytes: 4 * 1024 * 1024,
  catalogPages: 10_000,
  catalogModels: 100_000,
  promptChars: 256_000,
  historyChars: 2_000_000,
  attachmentBytes: 25 * 1024 * 1024,
  queueConcurrency: 8,
  ndjsonLineBytes: 512 * 1024,
  harnessArgs: 128,
  harnessArgChars: 16_384,
});

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class OllamaProtocolError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "OllamaProtocolError";
  }
}

function assertBoundedText(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || value.length > max) {
    throw new OllamaProtocolError(`${name} must be a string of at most ${max} characters`);
  }
  return value;
}

export function validateLoopbackBaseUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new OllamaProtocolError("Ollama endpoint must be a valid URL");
  }
  const host = url.hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new OllamaProtocolError("Ollama endpoint must resolve to loopback");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new OllamaProtocolError("Ollama endpoint must use HTTP or HTTPS");
  }
  if (url.username || url.password || url.hash) {
    throw new OllamaProtocolError("Ollama endpoint cannot contain credentials or a fragment");
  }
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return url;
}

function endpointUrl(base: URL, endpoint: string, query?: Record<string, string>): URL {
  if (!endpoint.startsWith("/") || endpoint.includes("..") || endpoint.includes("\\")) {
    throw new OllamaProtocolError("API endpoint must be an absolute local path");
  }
  const url = new URL(endpoint, base);
  if (url.origin !== base.origin) throw new OllamaProtocolError("API endpoint escaped the local origin");
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url;
}

async function boundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared && Number.isSafeInteger(Number(declared)) && Number(declared) > maxBytes) {
    throw new OllamaProtocolError(`Response exceeds the ${maxBytes}-byte limit`, response.status);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new OllamaProtocolError(`Response exceeds the ${maxBytes}-byte limit`, response.status);
  return bytes;
}

async function jsonResponse(response: Response, maxBytes: number): Promise<Record<string, unknown>> {
  const bytes = await boundedBody(response, maxBytes);
  const text = new TextDecoder().decode(bytes);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new OllamaProtocolError("Ollama returned malformed JSON", response.status); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new OllamaProtocolError("Ollama returned a JSON object", response.status);
  return parsed as Record<string, unknown>;
}

async function* ndjsonResponse(response: Response, maxBytes: number): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) {
    const bytes = await boundedBody(response, maxBytes);
    yield* parseNdjson(new TextDecoder().decode(bytes));
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) throw new OllamaProtocolError(`Response exceeds the ${maxBytes}-byte limit`, response.status);
      buffer += decoder.decode(part.value, { stream: true });
      if (buffer.length > LIMITS.ndjsonLineBytes && !buffer.includes("\n")) throw new OllamaProtocolError("NDJSON line exceeds its bound", response.status);
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield parseNdjsonLine(line);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield parseNdjsonLine(buffer.trim());
  } finally { reader.releaseLock(); }
}

function parseNdjsonLine(line: string): Record<string, unknown> {
  if (new TextEncoder().encode(line).byteLength > LIMITS.ndjsonLineBytes) throw new OllamaProtocolError("NDJSON line exceeds its bound");
  let value: unknown;
  try { value = JSON.parse(line); } catch { throw new OllamaProtocolError("Ollama returned malformed NDJSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OllamaProtocolError("Ollama NDJSON records must be objects");
  return value as Record<string, unknown>;
}

function* parseNdjson(text: string): Generator<Record<string, unknown>> {
  for (const line of text.split(/\r?\n/)) if (line.trim()) yield parseNdjsonLine(line.trim());
}

export interface HealthState { healthy: boolean; version?: string; status: number; detail?: string; }
export interface ModelTag { name: string; sizeBytes?: number; digest?: string; modifiedAt?: string; details?: Record<string, unknown>; }
export interface RunningModel extends ModelTag { expiresAt?: string; sizeVramBytes?: number; }
export interface ModelCapabilities { attachmentMimeTypes?: string[]; supportsVision?: boolean; supportsTools?: boolean; }
export interface CatalogVariant {
  name: string;
  tag: string;
  sizeBytes?: number;
  parameterCount?: number;
  quantization?: string;
  contextWindow?: number;
  requiredMemoryBytes?: number;
  requiredVramBytes?: number;
  capabilities?: ModelCapabilities;
}
export interface CatalogPage { variants: CatalogVariant[]; next?: string; revision?: string; }
export interface CatalogState {
  variants: CatalogVariant[];
  installed: ModelTag[];
  running: RunningModel[];
  refreshedAt: string;
  sourceRevision?: string;
  pageCount: number;
  complete: boolean;
  stale: boolean;
  offline: boolean;
  error?: string;
}

export class OllamaClient {
  readonly baseUrl: URL;
  constructor(
    baseUrl = "http://127.0.0.1:11434",
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
    private readonly timeoutMs = 15_000,
    private readonly maxResponseBytes = LIMITS.responseBytes,
  ) { this.baseUrl = validateLoopbackBaseUrl(baseUrl); }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    if (init.signal) {
      if (init.signal.aborted) controller.abort();
      else init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    try {
      const headers = new Headers(init.headers);
      headers.set("accept", "application/json");
      const response = await this.fetchImpl(endpointUrl(this.baseUrl, path), { ...init, headers, redirect: "error", signal: controller.signal });
      if (!response.ok) throw new OllamaProtocolError(`Ollama HTTP ${response.status}`, response.status);
      return response;
    } catch (error) {
      if (error instanceof OllamaProtocolError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new OllamaProtocolError("Ollama request timed out");
      throw new OllamaProtocolError(`Ollama request failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally { clearTimeout(timer); }
  }

  async health(): Promise<HealthState> {
    try {
      const response = await this.request("/api/version");
      const body = await jsonResponse(response, this.maxResponseBytes);
      return { healthy: true, version: typeof body.version === "string" ? body.version : undefined, status: response.status };
    } catch (error) {
      return { healthy: false, status: error instanceof OllamaProtocolError && error.status ? error.status : 0, detail: error instanceof Error ? error.message : "Ollama is unavailable" };
    }
  }

  async version(): Promise<string | undefined> { return (await this.health()).version; }

  async installedModels(): Promise<ModelTag[]> {
    const response = await this.request("/api/tags");
    const body = await jsonResponse(response, this.maxResponseBytes);
    return parseModelArray(body.models, "installed models");
  }

  async runningModels(): Promise<RunningModel[]> {
    const response = await this.request("/api/ps");
    const body = await jsonResponse(response, this.maxResponseBytes);
    return parseModelArray(body.models, "running models") as RunningModel[];
  }

  async refreshCatalog(path: string, previous?: CatalogState, maxPages: number = LIMITS.catalogPages): Promise<CatalogState> {
    const variants: CatalogVariant[] = [];
    const seen = new Set<string>();
    let next: string | undefined = undefined;
    let pageCount = 0;
    let sourceRevision: string | undefined;
    try {
      do {
        if (++pageCount > maxPages) throw new OllamaProtocolError("Catalog exceeded its page bound");
        const response = await this.request(path, { method: "GET" });
        const body = await jsonResponse(response, this.maxResponseBytes);
        const page = parseCatalogPage(body);
        sourceRevision ??= page.revision ?? response.headers.get("etag") ?? undefined;
        for (const variant of page.variants) {
          const key = `${variant.name}:${variant.tag}`;
          if (seen.has(key)) throw new OllamaProtocolError(`Catalog repeated variant ${key}`);
          seen.add(key); variants.push(variant);
          if (variants.length > LIMITS.catalogModels) throw new OllamaProtocolError("Catalog exceeded its variant bound");
        }
        next = page.next;
        if (next) {
          if (!next.startsWith("/") || next.includes("..") || next.includes("\\")) throw new OllamaProtocolError("Catalog pagination escaped the local API path");
          path = next;
        }
      } while (next);
      const [installed, running] = await Promise.all([this.installedModels(), this.runningModels()]);
      return { variants, installed, running, refreshedAt: new Date().toISOString(), sourceRevision, pageCount, complete: true, stale: false, offline: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Catalog refresh failed";
      return { ...(previous ?? { variants: [], installed: [], running: [], refreshedAt: "", pageCount: 0, complete: false, stale: true, offline: true }), refreshedAt: previous?.refreshedAt ?? "", pageCount, complete: false, stale: true, offline: true, error: message };
    }
  }

  async *chat(input: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    const request = validateChatRequest(input);
    assertAttachmentCapabilities(request.attachments, request.capabilities);
    const response = await this.request("/api/chat", { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ model: request.model, messages: request.messages, stream: true, options: request.options, ...(request.attachments?.length ? { images: request.attachments.map((a) => a.base64) } : {}) }), signal: signal ?? undefined });
    for await (const record of ndjsonResponse(response, this.maxResponseBytes)) {
      if (typeof record.error === "string") throw new OllamaProtocolError(record.error);
      yield { message: typeof record.message === "object" && record.message ? record.message as { role?: string; content?: string } : undefined, done: record.done === true, totalDurationNs: typeof record.total_duration === "number" ? record.total_duration : undefined };
    }
  }

  async pull(tag: string, onProgress?: (progress: PullProgress) => void, signal?: AbortSignal): Promise<void> {
    assertBoundedText(tag, "model tag", 512);
    if (!/^[^\s/:]+(?:[:][^\s]+)?$/.test(tag)) throw new OllamaProtocolError("Model tag is not valid");
    const response = await this.request("/api/pull", { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ name: tag, stream: true }), signal: signal ?? undefined });
    for await (const record of ndjsonResponse(response, this.maxResponseBytes)) {
      if (typeof record.error === "string") throw new OllamaProtocolError(record.error);
      const progress: PullProgress = { status: typeof record.status === "string" ? record.status : "working", completedBytes: typeof record.completed === "number" ? record.completed : undefined, totalBytes: typeof record.total === "number" ? record.total : undefined };
      onProgress?.(progress);
    }
  }
}

function parseModelArray(value: unknown, label: string): ModelTag[] {
  if (!Array.isArray(value)) throw new OllamaProtocolError(`Ollama returned no ${label} array`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || typeof (item as { name?: unknown }).name !== "string") throw new OllamaProtocolError(`Invalid ${label} entry ${index}`);
    const source = item as Record<string, unknown>;
    return { name: source.name as string, sizeBytes: typeof source.size === "number" ? source.size : undefined, digest: typeof source.digest === "string" ? source.digest : undefined, modifiedAt: typeof source.modified_at === "string" ? source.modified_at : undefined, details: source.details && typeof source.details === "object" ? source.details as Record<string, unknown> : undefined };
  });
}

function parseCatalogPage(value: Record<string, unknown>): CatalogPage {
  const raw = value.variants ?? value.models ?? value.data;
  if (!Array.isArray(raw)) throw new OllamaProtocolError("Catalog page has no variant array");
  const variants = raw.map((item, index) => {
    if (!item || typeof item !== "object") throw new OllamaProtocolError(`Invalid catalog variant ${index}`);
    const source = item as Record<string, unknown>;
    if (typeof source.name !== "string" || typeof source.tag !== "string") throw new OllamaProtocolError(`Catalog variant ${index} needs name and tag`);
    return { name: source.name, tag: source.tag, sizeBytes: numberOrUndefined(source.sizeBytes ?? source.size), parameterCount: numberOrUndefined(source.parameterCount ?? source.parameters), quantization: typeof source.quantization === "string" ? source.quantization : undefined, contextWindow: numberOrUndefined(source.contextWindow ?? source.context_length), requiredMemoryBytes: numberOrUndefined(source.requiredMemoryBytes), requiredVramBytes: numberOrUndefined(source.requiredVramBytes), capabilities: source.capabilities && typeof source.capabilities === "object" ? source.capabilities as ModelCapabilities : undefined };
  });
  const next = typeof value.next === "string" ? value.next : typeof value.next_page === "string" ? value.next_page : undefined;
  return { variants, next, revision: typeof value.revision === "string" ? value.revision : undefined };
}

function numberOrUndefined(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined; }

export interface HardwareSnapshot { capturedAt: string; ramBytes?: number; gpuModel?: string; vramBytes?: number; driver?: string; freeDiskBytes?: number; architecture?: string; }
export type FitVerdict = "Runs well" | "Runs with limits" | "Unlikely" | "Unknown";
export interface FitEvidence { verdict: FitVerdict; capturedAt: string; reasons: string[]; assumptions: string[]; }

export function assessHardwareFit(variant: CatalogVariant, hardware: HardwareSnapshot): FitEvidence {
  const reasons: string[] = [];
  const assumptions: string[] = [];
  const capturedAt = hardware.capturedAt;
  if (!variant.sizeBytes || !variant.requiredMemoryBytes || !hardware.ramBytes || hardware.freeDiskBytes === undefined) return { verdict: "Unknown", capturedAt, reasons: ["Exact blob size, required memory, RAM, and free disk are required"], assumptions };
  const requiredDisk = Math.ceil(variant.sizeBytes * 1.2);
  if (hardware.freeDiskBytes < requiredDisk) return { verdict: "Unlikely", capturedAt, reasons: [`Free disk ${hardware.freeDiskBytes} is below conservative requirement ${requiredDisk}`], assumptions };
  if (hardware.ramBytes < variant.requiredMemoryBytes) return { verdict: "Unlikely", capturedAt, reasons: [`RAM ${hardware.ramBytes} is below required memory ${variant.requiredMemoryBytes}`], assumptions };
  if (variant.requiredVramBytes !== undefined) {
    if (hardware.vramBytes === undefined) return { verdict: "Unknown", capturedAt, reasons: ["Variant declares VRAM requirement but usable VRAM was not detected"], assumptions };
    if (hardware.vramBytes < variant.requiredVramBytes) return { verdict: "Unlikely", capturedAt, reasons: [`VRAM ${hardware.vramBytes} is below requirement ${variant.requiredVramBytes}`], assumptions };
  }
  if (hardware.ramBytes < variant.requiredMemoryBytes * 1.25) { reasons.push("RAM is close to the declared requirement"); return { verdict: "Runs with limits", capturedAt, reasons, assumptions }; }
  if (variant.requiredVramBytes !== undefined && hardware.vramBytes !== undefined && hardware.vramBytes < variant.requiredVramBytes * 1.25) { reasons.push("VRAM is close to the declared requirement"); return { verdict: "Runs with limits", capturedAt, reasons, assumptions }; }
  reasons.push("RAM, storage, and declared accelerator requirements have conservative headroom");
  assumptions.push("Verdict uses published metadata and detected hardware only; it does not infer capability from the model name");
  return { verdict: "Runs well", capturedAt, reasons, assumptions };
}

export function reconcileCatalog(state: CatalogState): Array<CatalogVariant & { installed: boolean; running: boolean }> {
  const installed = new Set(state.installed.map((item) => item.name));
  const running = new Set(state.running.map((item) => item.name));
  return state.variants.map((variant) => ({ ...variant, installed: installed.has(`${variant.name}:${variant.tag}`) || installed.has(variant.tag), running: running.has(`${variant.name}:${variant.tag}`) || running.has(variant.tag) }));
}

export interface PullProgress { status: string; completedBytes?: number; totalBytes?: number; }
export type PullStatus = "queued" | "running" | "pulled" | "skipped" | "cancelled" | "failed";
export interface PullRecord { id: string; tag: string; status: PullStatus; progress?: PullProgress; error?: string; updatedAt: string; }
export interface PullStateStore { read(): Promise<PullRecord[]>; write(records: PullRecord[]): Promise<void>; }
export class MemoryPullStateStore implements PullStateStore {
  private records: PullRecord[] = [];
  async read(): Promise<PullRecord[]> { return this.records.map((record) => ({ ...record, progress: record.progress && { ...record.progress } })); }
  async write(records: PullRecord[]): Promise<void> { this.records = records.map((record) => ({ ...record, progress: record.progress && { ...record.progress } })); }
}

export class SerializedPullStateStore implements PullStateStore {
  constructor(
    private readonly readText: () => Promise<string>,
    private readonly writeText: (text: string) => Promise<void>,
    private readonly maxBytes = LIMITS.responseBytes,
  ) {}
  async read(): Promise<PullRecord[]> {
    const text = await this.readText();
    if (new TextEncoder().encode(text).byteLength > this.maxBytes) throw new OllamaProtocolError("Pull state exceeds its byte bound");
    if (!text.trim()) return [];
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new OllamaProtocolError("Pull state is malformed JSON"); }
    if (!Array.isArray(value)) throw new OllamaProtocolError("Pull state must be an array");
    return value.map((item, index) => {
      if (!item || typeof item !== "object") throw new OllamaProtocolError(`Invalid pull state entry ${index}`);
      const record = item as Record<string, unknown>;
      const statuses: PullStatus[] = ["queued", "running", "pulled", "skipped", "cancelled", "failed"];
      if (typeof record.id !== "string" || typeof record.tag !== "string" || !statuses.includes(record.status as PullStatus) || typeof record.updatedAt !== "string") throw new OllamaProtocolError(`Invalid pull state entry ${index}`);
      return { id: record.id, tag: record.tag, status: record.status as PullStatus, updatedAt: record.updatedAt, ...(record.progress && typeof record.progress === "object" ? { progress: record.progress as PullProgress } : {}), ...(typeof record.error === "string" ? { error: record.error } : {}) };
    });
  }
  async write(records: PullRecord[]): Promise<void> {
    const text = JSON.stringify(records);
    if (new TextEncoder().encode(text).byteLength > this.maxBytes) throw new OllamaProtocolError("Pull state exceeds its byte bound");
    await this.writeText(text);
  }
}

export class PullQueue {
  private readonly active = new Map<string, AbortController>();
  constructor(private readonly client: OllamaClient, private readonly store: PullStateStore, private readonly concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > LIMITS.queueConcurrency) throw new OllamaProtocolError("Pull concurrency is outside its bound");
  }
  async enqueue(tags: string[]): Promise<PullRecord[]> {
    const records = await this.store.read();
    const existing = new Set(records.map((record) => record.tag));
    const now = new Date().toISOString();
    for (const tag of tags) { assertBoundedText(tag, "model tag", 512); if (!existing.has(tag)) { records.push({ id: crypto.randomUUID(), tag, status: "queued", updatedAt: now }); existing.add(tag); } }
    await this.store.write(records); return records;
  }
  cancel(id: string): void { this.active.get(id)?.abort(); }
  async run(): Promise<PullRecord[]> {
    const records = await this.store.read();
    const candidates = records.filter((record) => record.status === "queued" || record.status === "failed");
    let cursor = 0;
    const worker = async () => {
      while (cursor < candidates.length) {
        const record = candidates[cursor++];
        const controller = new AbortController(); this.active.set(record.id, controller); record.status = "running"; record.error = undefined; record.updatedAt = new Date().toISOString(); await this.store.write(records);
        try { await this.client.pull(record.tag, (progress) => { record.progress = progress; record.updatedAt = new Date().toISOString(); void this.store.write(records); }, controller.signal); record.status = "pulled"; }
        catch (error) { record.status = controller.signal.aborted ? "cancelled" : "failed"; record.error = error instanceof Error ? error.message : "Pull failed"; }
        finally { record.updatedAt = new Date().toISOString(); this.active.delete(record.id); await this.store.write(records); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, candidates.length) }, () => worker()));
    return this.store.read();
  }
}

export interface ChatMessage { role: "system" | "user" | "assistant" | "tool"; content: string; }
export interface ChatAttachment { mimeType: string; base64: string; bytes: number; }
export interface ChatRequest { model: string; messages: ChatMessage[]; options?: Record<string, number | string | boolean>; attachments?: ChatAttachment[]; capabilities?: ModelCapabilities; }
export interface ChatEvent { message?: { role?: string; content?: string }; done: boolean; totalDurationNs?: number; }
function validateChatRequest(input: ChatRequest): ChatRequest {
  assertBoundedText(input.model, "model", 512);
  if (!Array.isArray(input.messages) || input.messages.length === 0) throw new OllamaProtocolError("Chat needs at least one message");
  const messages = input.messages.map((message) => ({ role: message.role, content: assertBoundedText(message.content, "message content", LIMITS.promptChars) }));
  if (messages.reduce((sum, message) => sum + message.content.length, 0) > LIMITS.historyChars) throw new OllamaProtocolError("Chat history exceeds its bound");
  return { ...input, messages };
}
export function assertAttachmentCapabilities(attachments: ChatAttachment[] | undefined, capabilities: ModelCapabilities | undefined): void {
  if (!attachments?.length) return;
  if (!capabilities) throw new OllamaProtocolError("Attachment capability metadata is unavailable");
  for (const attachment of attachments) {
    if (!Number.isSafeInteger(attachment.bytes) || attachment.bytes < 0 || attachment.bytes > LIMITS.attachmentBytes) throw new OllamaProtocolError("Attachment exceeds its byte bound");
    if (!capabilities.attachmentMimeTypes?.includes(attachment.mimeType)) throw new OllamaProtocolError(`Model does not support attachment type ${attachment.mimeType}`);
    if (typeof attachment.base64 !== "string" || attachment.base64.length > Math.ceil(attachment.bytes * 1.4) + 16) throw new OllamaProtocolError("Attachment payload is inconsistent with its declared size");
  }
}

export interface HarnessProfile { id: string; label: string; executablePath: string; args: string[]; workingDirectory: string; environmentKeys: string[]; modelTag: string; }
export interface HarnessPreview { profileId: string; executablePath: string; args: string[]; workingDirectory: string; environmentKeys: string[]; modelTag: string; blockers: string[]; }
export interface HarnessHandle { id: string; processId?: number; }
export interface HarnessLauncher { launch(profile: HarnessProfile, environment: Record<string, string>, signal: AbortSignal): Promise<HarnessHandle>; health(handle: HarnessHandle, signal: AbortSignal): Promise<boolean>; terminate(handle: HarnessHandle): Promise<void>; }
export interface HarnessSnapshot { id: string; profile: HarnessProfile; createdAt: string; }
export interface SnapshotStore { save(snapshot: HarnessSnapshot): Promise<void>; latest(profileId: string): Promise<HarnessSnapshot | undefined>; }

export function validateHarnessProfile(profile: HarnessProfile): HarnessProfile {
  assertBoundedText(profile.id, "profile id", 128); assertBoundedText(profile.label, "profile label", 256); assertBoundedText(profile.modelTag, "model tag", 512);
  if (!isAbsolute(profile.executablePath) || !isAbsolute(profile.workingDirectory)) throw new OllamaProtocolError("Harness executable and working directory must be absolute paths");
  const executableName = basename(profile.executablePath).toLowerCase();
  if (!/\.(?:exe|com)$/i.test(profile.executablePath) || ["cmd.exe", "powershell.exe", "pwsh.exe", "wscript.exe", "cscript.exe"].includes(executableName)) throw new OllamaProtocolError("Harness executable must be an executable file, not a shell command");
  if (!Array.isArray(profile.args) || profile.args.length > LIMITS.harnessArgs) throw new OllamaProtocolError("Harness arguments exceed their bound");
  for (const arg of profile.args) { assertBoundedText(arg, "harness argument", LIMITS.harnessArgChars); if (/[\r\n;&|`$<>]/.test(arg)) throw new OllamaProtocolError("Harness arguments cannot contain shell syntax"); }
  if (!Array.isArray(profile.environmentKeys) || profile.environmentKeys.some((key) => !/^[A-Z_][A-Z0-9_]{0,31}$/.test(key))) throw new OllamaProtocolError("Harness environment keys are invalid");
  return { ...profile, executablePath: normalize(profile.executablePath), workingDirectory: normalize(profile.workingDirectory), args: [...profile.args], environmentKeys: [...profile.environmentKeys] };
}

function redactedArgs(args: string[]): string[] { const result: string[] = []; let redactNext = false; for (const arg of args) { if (redactNext) { result.push("[redacted]"); redactNext = false; continue; } result.push(/^(?:--?)(?:token|password|secret|key)$/i.test(arg) ? (redactNext = true, arg) : arg); } return result; }
export function createHarnessPreview(profile: HarnessProfile): HarnessPreview { const valid = validateHarnessProfile(profile); return { profileId: valid.id, executablePath: valid.executablePath, args: redactedArgs(valid.args), workingDirectory: valid.workingDirectory, environmentKeys: [...valid.environmentKeys], modelTag: valid.modelTag, blockers: [] }; }

export class HarnessManager {
  private readonly profiles = new Map<string, HarnessProfile>();
  constructor(private readonly launcher: HarnessLauncher, private readonly snapshots: SnapshotStore, private readonly environment: (keys: string[]) => Promise<Record<string, string>>) {}
  register(profile: HarnessProfile): HarnessPreview { const valid = validateHarnessProfile(profile); this.profiles.set(valid.id, valid); return createHarnessPreview(valid); }
  preview(id: string): HarnessPreview { const profile = this.profiles.get(id); if (!profile) throw new OllamaProtocolError("Harness profile is not registered"); return createHarnessPreview(profile); }
  async launch(id: string): Promise<HarnessHandle> {
    const profile = this.profiles.get(id); if (!profile) throw new OllamaProtocolError("Harness profile is not registered");
    const prior = await this.snapshots.latest(id);
    const snapshot: HarnessSnapshot = { id: crypto.randomUUID(), profile: structuredClone(profile), createdAt: new Date().toISOString() }; await this.snapshots.save(snapshot);
    const controller = new AbortController(); const env = await this.environment(profile.environmentKeys); const handle = await this.launcher.launch(profile, env, controller.signal);
    if (await this.launcher.health(handle, controller.signal)) return handle;
    await this.launcher.terminate(handle);
    if (prior) this.profiles.set(id, structuredClone(prior.profile));
    throw new OllamaProtocolError("Harness health check failed; the profile was rolled back");
  }
}

export const __test = { parseCatalogPage, parseNdjsonLine, redactedArgs };

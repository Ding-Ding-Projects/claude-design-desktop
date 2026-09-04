import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { homedir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { DownloadStateMachine, normalizeDownloadRequest, type DownloadRecord, type DownloadStartRequest } from "./download-state-machine.js";
import { NATIVE_HOST_NAME, parseNativeMessage, type NativeHostMessage, type NativeHostResponse } from "./native-messaging.js";
import { encodeNativeFrame, NativeFrameDecoder } from "./native-messaging-codec.js";

export type ProgressWindowOptions = {
  frame: false;
  alwaysOnTop: true;
  customTitleBar: true;
  title: "Downloading";
  downloadId: string;
  filename: string;
};

export type ProgressWindowController = {
  open(options: ProgressWindowOptions): Promise<void> | void;
  update(record: DownloadRecord): Promise<void> | void;
  close(downloadId: string): Promise<void> | void;
};

export type WindowsNativeHostOptions = {
  dataDirectory: string;
  downloadsDirectory: string;
  fetchImpl?: typeof fetch;
  lookupImpl?: typeof lookup;
  statfsImpl?: typeof statfs;
  progressWindow: ProgressWindowController;
  openStartDialog: (record: DownloadRecord, preflight: Preflight) => Promise<void> | void;
  notify: (title: string, message: string) => Promise<void> | void;
};

type PersistedState = { version: 1; records: DownloadRecord[] };
type ActiveTransfer = { abort: AbortController; paused: boolean; wake?: () => void };
type Preflight = { destinationPath: string; collision: boolean; freeBytes: number; minimumFreeBytes: number };

export class WindowsNativeDownloadHost {
  readonly hostName = NATIVE_HOST_NAME;
  private readonly machine: DownloadStateMachine;
  private readonly proposals = new Map<string, DownloadRecord>();
  private readonly preflights = new Map<string, Preflight>();
  private readonly active = new Map<string, ActiveTransfer>();
  private readonly backgroundTransfers = new Set<Promise<void>>();
  private readonly fetchImpl: typeof fetch;
  private readonly lookupImpl: typeof lookup;
  private readonly statfsImpl: typeof statfs;
  private persistence: Promise<void> = Promise.resolve();
  private recovered = false;

  constructor(private readonly options: WindowsNativeHostOptions) {
    this.fetchImpl = options.fetchImpl || fetch;
    this.lookupImpl = options.lookupImpl || lookup;
    this.statfsImpl = options.statfsImpl || statfs;
    this.machine = new DownloadStateMachine();
  }

  async recover(): Promise<void> {
    if (this.recovered) return;
    this.recovered = true;
    await mkdir(this.options.dataDirectory, { recursive: true });
    const state = await this.readState();
    for (const record of state.records) {
      if (record.phase === "awaiting-confirmation") this.proposals.set(record.id, record);
      if (record.phase === "queued" || record.phase === "downloading" || record.phase === "paused") {
        const restored = record.phase === "downloading" ? { ...record, phase: "queued" as const } : record;
        this.proposals.set(restored.id, restored);
      }
    }
    await this.persist();
    for (const record of this.proposals.values()) {
      if (record.phase === "queued") this.trackTransfer(record);
    }
  }

  async handle(raw: string): Promise<NativeHostResponse> {
    await this.recover();
    let message: NativeHostMessage;
    try { message = parseNativeMessage(raw); } catch (error) {
      return { type: "rejected", protocolVersion: 1, requestId: "rejected", error: safeError(error) };
    }
    try {
      if (message.type === "propose-download") return await this.propose(message.requestId, message.request);
      if (message.type === "confirm-download") return await this.confirm(message.requestId, message.proposalId, message.confirmation);
      return await this.control(message.requestId, message.downloadId, message.action);
    } catch (error) {
      return { type: "rejected", protocolVersion: 1, requestId: message.requestId, error: safeError(error) };
    }
  }

  private async propose(requestId: string, input: DownloadStartRequest): Promise<NativeHostResponse> {
    const normalized = normalizeDownloadRequest(input);
    this.pruneTerminalRecords();
    if (this.proposals.size >= 256) throw new Error("The durable download queue is full");
    await assertPublicHttpSource(normalized.sourceUrl, this.lookupImpl);
    const record = this.makeRecord(normalized);
    const preflight = await this.destinationPreflight(normalized);
    this.proposals.set(record.id, record);
    this.preflights.set(record.id, preflight);
    await this.persist();
    await this.options.openStartDialog(record, preflight);
    return { type: "proposal-ready", protocolVersion: 1, requestId, proposalId: record.id, request: normalized, preflight };
  }

  private async confirm(requestId: string, proposalId: string, confirmation: { keyOne: true; keyTwo: true; slider: 1 }): Promise<NativeHostResponse> {
    if (confirmation.keyOne !== true || confirmation.keyTwo !== true || confirmation.slider !== 1) throw new Error("Both confirmation keys and the full slider are required");
    const record = this.proposals.get(proposalId);
    if (!record || record.phase !== "awaiting-confirmation") throw new Error("Download proposal is no longer available");
    record.phase = "queued";
    record.progressWindow.visible = true;
    await this.persist();
    this.trackTransfer(record);
    return { type: "queued", protocolVersion: 1, requestId, record: clone(record) };
  }

  async waitForIdle(): Promise<void> {
    await Promise.all([...this.backgroundTransfers]);
  }

  private async control(requestId: string, downloadId: string, action: "pause" | "resume" | "cancel"): Promise<NativeHostResponse> {
    const record = this.proposals.get(downloadId);
    if (!record) throw new Error("Unknown download id");
    const transfer = this.active.get(downloadId);
    if (action === "pause") {
      if (record.phase !== "downloading") throw new Error("Only an active download can be paused");
      record.phase = "paused";
      if (transfer) transfer.paused = true;
    } else if (action === "resume") {
      if (record.phase !== "paused") throw new Error("Only a paused download can be resumed");
      record.phase = "downloading";
      if (transfer) { transfer.paused = false; transfer.wake?.(); transfer.wake = undefined; }
    } else {
      if (record.phase === "completed" || record.phase === "failed" || record.phase === "cancelled") throw new Error("Download is already terminal");
      record.phase = "cancelled";
      transfer?.abort.abort();
      transfer?.wake?.();
      await this.finishTerminal(record, "cancelled");
    }
    await this.persist();
    await this.safeUi(() => this.options.progressWindow.update(clone(record)));
    return { type: "download-event", protocolVersion: 1, requestId, event: action === "cancel" ? "cancelled" : record.phase, record: clone(record) };
  }

  private async startTransfer(record: DownloadRecord): Promise<void> {
    const transfer: ActiveTransfer = { abort: new AbortController(), paused: false };
    this.active.set(record.id, transfer);
    await this.options.progressWindow.open({ frame: false, alwaysOnTop: true, customTitleBar: true, title: "Downloading", downloadId: record.id, filename: record.request.filename });
    record.phase = "downloading";
    await this.persist();
    await this.options.progressWindow.update(clone(record));
    const temporary = path.join(this.options.downloadsDirectory, `.${record.id}.${record.request.filename}.part`);
    try {
      await mkdir(this.options.downloadsDirectory, { recursive: true });
      await assertPublicHttpSource(record.request.sourceUrl, this.lookupImpl);
      const partialBytes = await stat(temporary).then((info: { size: number }) => info.size).catch(() => 0);
      const response = await this.fetchImpl(record.request.sourceUrl, { signal: transfer.abort.signal, redirect: "manual", headers: partialBytes > 0 ? { Range: `bytes=${partialBytes}-` } : undefined });
      if (response.status >= 300 && response.status < 400) throw new Error("Redirects are not permitted for downloads");
      if (!response.ok || !response.body) throw new Error(`Download source returned HTTP ${response.status}`);
      const resumed = partialBytes > 0 && response.status === 206;
      if (partialBytes > 0 && !resumed) await rm(temporary, { force: true });
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > 5_000_000_000) throw new Error("Download exceeds the byte limit");
      const writer = createWriteStream(temporary, { flags: resumed ? "a" : "w" });
      const reader = response.body.getReader();
      let bytes = resumed ? partialBytes : 0;
      const startedAt = Date.now();
      while (true) {
        if (transfer.paused) await new Promise<void>((resolve) => { transfer.wake = resolve; });
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 5_000_000_000) throw new Error("Download exceeds the byte limit");
        if (!writer.write(Buffer.from(next.value))) await once(writer, "drain");
        record.bytesReceived = bytes;
        record.totalBytes = declared || undefined;
        record.rateBytesPerSecond = Math.round(bytes / Math.max(1, (Date.now() - startedAt) / 1_000));
        record.etaSeconds = record.totalBytes && record.rateBytesPerSecond > 0 ? Math.ceil((record.totalBytes - bytes) / record.rateBytesPerSecond) : undefined;
        await this.persist();
        await this.safeUi(() => this.options.progressWindow.update(clone(record)));
      }
      await new Promise<void>((resolve, reject) => { writer.once("finish", resolve); writer.once("error", reject); writer.end(); });
      await atomicRenameWithRetry(temporary, path.join(this.options.downloadsDirectory, record.request.filename));
      record.phase = "completed";
      record.etaSeconds = 0;
      await this.finishTerminal(record, "completed");
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if ((record as DownloadRecord).phase !== "cancelled") {
        record.phase = "failed";
        record.error = safeError(error);
        await this.finishTerminal(record, "failed");
      }
    } finally {
      this.active.delete(record.id);
      await this.persist();
    }
  }

  private trackTransfer(record: DownloadRecord): void {
    const task = this.startTransfer(record);
    this.backgroundTransfers.add(task);
    void task.finally(() => this.backgroundTransfers.delete(task));
  }

  private async destinationPreflight(request: ReturnType<typeof normalizeDownloadRequest>): Promise<Preflight> {
    if (request.destination !== "downloads") throw new Error("The native host only permits its Downloads destination");
    await mkdir(this.options.downloadsDirectory, { recursive: true });
    const destinationPath = path.join(this.options.downloadsDirectory, request.filename);
    const collision = await stat(destinationPath).then(() => true).catch(() => false);
    const fsInfo = await this.statfsImpl(this.options.downloadsDirectory).catch(() => undefined);
    const freeBytes = fsInfo ? Number(fsInfo.bavail) * Number(fsInfo.bsize) : 0;
    const minimumFreeBytes = 16 * 1024 * 1024;
    if (!Number.isSafeInteger(freeBytes) || freeBytes < minimumFreeBytes) throw new Error("The destination does not have enough free storage");
    return { destinationPath, collision, freeBytes, minimumFreeBytes };
  }

  private pruneTerminalRecords(): void {
    for (const [id, record] of this.proposals) {
      if (this.proposals.size < 256) break;
      if (record.phase === "completed" || record.phase === "failed" || record.phase === "cancelled") this.proposals.delete(id);
    }
  }

  private async finishTerminal(record: DownloadRecord, outcome: "cancelled" | "completed" | "failed"): Promise<void> {
    record.progressWindow.visible = false;
    await this.persist();
    await this.safeUi(() => this.options.progressWindow.update(clone(record)));
    await this.safeUi(() => this.options.progressWindow.close(record.id));
    await this.safeUi(() => this.options.notify(outcome === "completed" ? "Download complete" : outcome === "cancelled" ? "Download cancelled" : "Download failed", record.error || record.request.filename));
  }

  private async safeUi(action: () => Promise<void> | void): Promise<void> {
    try { await action(); } catch { /* UI failures never rewrite a completed transfer outcome */ }
  }

  private makeRecord(request: ReturnType<typeof normalizeDownloadRequest>): DownloadRecord {
    const id = `download-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return { id, request, phase: "awaiting-confirmation", bytesReceived: 0, rateBytesPerSecond: 0, progressWindow: { alwaysOnTop: true, accessibleName: `Download progress for ${request.filename}`, windowId: `progress-${id}`, visible: false } };
  }

  private async readState(): Promise<PersistedState> {
    try {
      const parsed: unknown = JSON.parse(await readFile(path.join(this.options.dataDirectory, "queue.json"), "utf8"));
      if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.records)) throw new Error("Invalid queue state");
      return { version: 1, records: parsed.records.filter(isDownloadRecord) };
    } catch (error) {
      if (errorCode(error) === "ENOENT") return { version: 1, records: [] };
      throw new Error(`Cannot recover download queue: ${safeError(error)}`);
    }
  }

  private persist(): Promise<void> {
    const operation = this.persistence.catch(() => undefined).then(async () => {
      const records = [...this.proposals.values()].filter((record) => record.phase !== "cancelled");
      const target = path.join(this.options.dataDirectory, "queue.json");
      const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 1, records }, null, 2), "utf8");
      await atomicRenameWithRetry(temporary, target);
    });
    this.persistence = operation.catch(() => undefined);
    return operation;
  }
}

export function defaultWindowsNativeHostOptions(overrides: Omit<WindowsNativeHostOptions, "dataDirectory" | "downloadsDirectory">): WindowsNativeHostOptions {
  const localData = process.env.LOCALAPPDATA;
  const profile = process.env.USERPROFILE || homedir();
  if (!localData || !profile) throw new Error("The Windows application-data location is unavailable");
  return { ...overrides, dataDirectory: path.join(localData, "Claude Design Download Companion", "downloads"), downloadsDirectory: path.join(profile, "Downloads") };
}

export async function runWindowsNativeHost(host: WindowsNativeDownloadHost): Promise<void> {
  const decoder = new NativeFrameDecoder();
  let writes = Promise.resolve();
  const send = (message: NativeHostResponse) => {
    const frame = encodeNativeFrame(JSON.stringify(message));
    writes = writes.then(() => new Promise<void>((resolve, reject) => process.stdout.write(Buffer.from(frame), (error: any) => error ? reject(error) : resolve())));
    return writes;
  };
  process.stdin.on("data", (chunk: any) => {
    try {
      for (const raw of decoder.push(chunk)) void host.handle(raw).then(send);
    } catch (error) {
      void send({ type: "rejected", protocolVersion: 1, requestId: "decoder", error: safeError(error) });
    }
  });
  await once(process.stdin, "end");
  decoder.assertComplete();
  await writes;
}

export async function runWindowsNativeHostClient(client: { request(raw: string): Promise<string> }): Promise<void> {
  const decoder = new NativeFrameDecoder();
  let writes = Promise.resolve();
  const send = (raw: string) => {
    const frame = encodeNativeFrame(raw);
    writes = writes.then(() => new Promise<void>((resolve, reject) => process.stdout.write(Buffer.from(frame), (error: any) => error ? reject(error) : resolve())));
    return writes;
  };
  process.stdin.on("data", (chunk: any) => {
    try { for (const raw of decoder.push(chunk)) void client.request(raw).then(send).catch((error) => send(JSON.stringify({ type: "rejected", protocolVersion: 1, requestId: "client", error: safeError(error) }))); }
    catch (error) { void send(JSON.stringify({ type: "rejected", protocolVersion: 1, requestId: "decoder", error: safeError(error) })); }
  });
  await once(process.stdin, "end");
  decoder.assertComplete();
  await writes;
}

async function atomicRenameWithRetry(source: string, target: string): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try { await rename(source, target); return; }
    catch (error) {
      last = error;
      const code = errorCode(error);
      if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw last;
}

function isDownloadRecord(value: unknown): value is DownloadRecord {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.request) || typeof value.request.sourceUrl !== "string" || typeof value.request.filename !== "string") return false;
  try { normalizeDownloadRequest({ sourceUrl: value.request.sourceUrl, suggestedFilename: value.request.filename, destination: value.request.destination, sourceLabel: value.request.sourceLabel }); return true; } catch { return false; }
}
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function clone(record: DownloadRecord): DownloadRecord { return { ...record, request: { ...record.request }, progressWindow: { ...record.progressWindow } }; }
function safeError(error: unknown): string { return (error instanceof Error ? error.message : "Download operation failed").replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 500); }
function errorCode(error: unknown): string | undefined { return isRecord(error) && typeof error.code === "string" ? error.code : undefined; }

async function assertPublicHttpSource(source: string, lookupImpl: typeof lookup): Promise<void> {
  const parsed = new URL(source);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Only HTTP and HTTPS sources are supported");
  if (parsed.username || parsed.password) throw new Error("Source URL cannot contain embedded credentials");
  const addresses = await lookupImpl(parsed.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }: { address: string }) => isPrivateAddress(address))) throw new Error("Source resolves to a private or local address");
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 169 && octets[1] === 254);
}

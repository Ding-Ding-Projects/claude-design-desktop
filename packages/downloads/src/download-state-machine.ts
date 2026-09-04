/**
 * Bounded download state machine shared by the desktop bridge and the browser
 * companion. It deliberately separates the start decision from queue mutation:
 * cancelling the Start download dialog removes only the proposal.
 */

export const DOWNLOAD_LIMITS = Object.freeze({
  maxDestinationLength: 1_024,
  maxFilenameLength: 240,
  maxQueuedItems: 256,
  maxTotalBytes: 5_000_000_000,
  maxUrlLength: 2_048,
  progressWindowTitleLength: 160
});

export type DownloadPhase =
  | "awaiting-confirmation"
  | "queued"
  | "downloading"
  | "paused"
  | "cancelled"
  | "failed"
  | "completed";

export type DownloadStartRequest = {
  sourceUrl: string;
  suggestedFilename: string;
  destination?: string;
  sourceLabel?: string;
};

export type NormalizedDownloadRequest = {
  sourceUrl: string;
  filename: string;
  destination: string;
  sourceLabel: string;
};

export type ProgressWindowModel = {
  alwaysOnTop: true;
  accessibleName: string;
  windowId: string;
  visible: boolean;
};

export type DownloadRecord = {
  id: string;
  request: NormalizedDownloadRequest;
  phase: DownloadPhase;
  bytesReceived: number;
  totalBytes?: number;
  rateBytesPerSecond: number;
  etaSeconds?: number;
  error?: string;
  progressWindow: ProgressWindowModel;
};

export type DownloadEvent =
  | { type: "proposal-created"; record: DownloadRecord }
  | { type: "queued"; record: DownloadRecord }
  | { type: "progress"; record: DownloadRecord }
  | { type: "paused"; record: DownloadRecord }
  | { type: "resumed"; record: DownloadRecord }
  | { type: "cancelled"; record: DownloadRecord }
  | { type: "failed"; record: DownloadRecord }
  | { type: "completed"; record: DownloadRecord };

type ProgressSample = { at: number; bytes: number };
type TransferStarter = (record: DownloadRecord) => void | Promise<void>;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]|^\\\\/u;

export function normalizeDownloadRequest(input: DownloadStartRequest): NormalizedDownloadRequest {
  if (!isRecord(input)) {
    throw new TypeError("Download request must be an object");
  }
  const unknownKeys = Object.keys(input).filter((key) => !["destination", "sourceLabel", "sourceUrl", "suggestedFilename"].includes(key));
  if (unknownKeys.length > 0) throw new TypeError("Download request contains unknown fields");
  const sourceUrl = boundedString(input.sourceUrl, DOWNLOAD_LIMITS.maxUrlLength, "sourceUrl");
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new TypeError("sourceUrl must be an absolute URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError("sourceUrl must use HTTP or HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new TypeError("sourceUrl cannot contain embedded credentials");
  }

  const filename = boundedString(input.suggestedFilename, DOWNLOAD_LIMITS.maxFilenameLength, "suggestedFilename");
  if (!filename || filename === "." || filename === ".." || CONTROL_CHARACTERS.test(filename)) {
    throw new TypeError("suggestedFilename is not safe");
  }
  if (/[\\/]/u.test(filename) || filename.endsWith(".") || filename.endsWith(" ")) {
    throw new TypeError("suggestedFilename must be a single file name");
  }

  const destination = input.destination === undefined
    ? "downloads"
    : boundedString(input.destination, DOWNLOAD_LIMITS.maxDestinationLength, "destination");
  if (CONTROL_CHARACTERS.test(destination) || destination.includes("..")) {
    throw new TypeError("destination contains an unsafe path segment");
  }
  if (destination && !WINDOWS_ABSOLUTE_PATH.test(destination) && /^(?:[a-zA-Z]:)?[\\/]/u.test(destination)) {
    throw new TypeError("destination must be an absolute path or a relative downloads folder");
  }

  const sourceLabel = input.sourceLabel === undefined
    ? parsed.hostname
    : boundedString(input.sourceLabel, DOWNLOAD_LIMITS.progressWindowTitleLength, "sourceLabel");
  return Object.freeze({ sourceUrl: parsed.toString(), filename, destination, sourceLabel });
}

export class DownloadStateMachine {
  private readonly records = new Map<string, DownloadRecord>();
  private readonly queue: string[] = [];
  private readonly samples = new Map<string, ProgressSample>();
  private readonly listeners = new Set<(event: DownloadEvent) => void>();
  private sequence = 0;

  constructor(private readonly transferStarter?: TransferStarter) {}

  subscribe(listener: (event: DownloadEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  prepareStart(input: DownloadStartRequest): DownloadRecord {
    if (this.activeCount() >= DOWNLOAD_LIMITS.maxQueuedItems) {
      throw new Error("The download queue is full");
    }
    const id = `download-${++this.sequence}`;
    const record: DownloadRecord = {
      id,
      request: normalizeDownloadRequest(input),
      phase: "awaiting-confirmation",
      bytesReceived: 0,
      rateBytesPerSecond: 0,
      progressWindow: {
        alwaysOnTop: true,
        accessibleName: `Download progress for ${input.suggestedFilename}`,
        windowId: `progress-${id}`,
        visible: false
      }
    };
    this.records.set(id, record);
    this.emit({ type: "proposal-created", record: cloneRecord(record) });
    return cloneRecord(record);
  }

  cancelProposal(id: string): void {
    const record = this.require(id);
    if (record.phase !== "awaiting-confirmation") {
      throw new Error("Only an unconfirmed proposal can be cancelled without changing the queue");
    }
    this.records.delete(id);
    this.samples.delete(id);
  }

  confirmStart(id: string): DownloadRecord {
    const record = this.require(id);
    if (record.phase !== "awaiting-confirmation") {
      throw new Error("Download proposal is no longer awaiting confirmation");
    }
    if (this.activeCount() >= DOWNLOAD_LIMITS.maxQueuedItems) {
      throw new Error("The download queue is full");
    }
    record.phase = "queued";
    record.progressWindow.visible = true;
    this.queue.push(id);
    this.emit({ type: "queued", record: cloneRecord(record) });
    return cloneRecord(record);
  }

  async startNext(): Promise<DownloadRecord | undefined> {
    const id = this.queue.shift();
    if (!id) return undefined;
    const record = this.require(id);
    if (record.phase !== "queued") {
      return cloneRecord(record);
    }
    record.phase = "downloading";
    this.samples.set(id, { at: Date.now(), bytes: 0 });
    this.emit({ type: "progress", record: cloneRecord(record) });
    if (this.transferStarter) {
      try {
        await this.transferStarter(cloneRecord(record));
      } catch (error) {
        this.fail(id, error instanceof Error ? error.message : "The transfer starter failed");
      }
    }
    return cloneRecord(record);
  }

  pause(id: string): DownloadRecord {
    const record = this.require(id);
    if (record.phase !== "downloading") throw new Error("Only an active download can be paused");
    record.phase = "paused";
    this.emit({ type: "paused", record: cloneRecord(record) });
    return cloneRecord(record);
  }

  resume(id: string): DownloadRecord {
    const record = this.require(id);
    if (record.phase !== "paused") throw new Error("Only a paused download can be resumed");
    record.phase = "downloading";
    this.emit({ type: "resumed", record: cloneRecord(record) });
    return cloneRecord(record);
  }

  cancel(id: string): DownloadRecord {
    const record = this.require(id);
    if (record.phase === "completed" || record.phase === "failed" || record.phase === "cancelled") {
      throw new Error("Download is already terminal");
    }
    const queueIndex = this.queue.indexOf(id);
    if (queueIndex >= 0) this.queue.splice(queueIndex, 1);
    record.phase = "cancelled";
    record.progressWindow.visible = false;
    this.samples.delete(id);
    this.emit({ type: "cancelled", record: cloneRecord(record) });
    return cloneRecord(record);
  }

  reportProgress(id: string, bytesReceived: number, totalBytes?: number, at = Date.now()): DownloadRecord {
    const record = this.require(id);
    if (record.phase !== "downloading" && record.phase !== "paused") {
      throw new Error("Progress is valid only for an active or paused download");
    }
    if (!Number.isSafeInteger(at) || at < 0 || !Number.isSafeInteger(bytesReceived) || bytesReceived < record.bytesReceived || bytesReceived > DOWNLOAD_LIMITS.maxTotalBytes) {
      throw new RangeError("bytesReceived is outside the allowed range");
    }
    if (totalBytes !== undefined && (!Number.isSafeInteger(totalBytes) || totalBytes < bytesReceived || totalBytes > DOWNLOAD_LIMITS.maxTotalBytes)) {
      throw new RangeError("totalBytes is outside the allowed range");
    }
    const previous = this.samples.get(id);
    if (previous && at > previous.at && bytesReceived >= previous.bytes) {
      record.rateBytesPerSecond = Math.round((bytesReceived - previous.bytes) / ((at - previous.at) / 1_000));
    }
    record.bytesReceived = bytesReceived;
    record.totalBytes = totalBytes;
    record.etaSeconds = totalBytes && record.rateBytesPerSecond > 0
      ? Math.ceil((totalBytes - bytesReceived) / record.rateBytesPerSecond)
      : undefined;
    this.samples.set(id, { at, bytes: bytesReceived });
    this.emit({ type: "progress", record: cloneRecord(record) });
    return cloneRecord(record);
  }

  complete(id: string, totalBytes?: number): DownloadRecord {
    const record = this.require(id);
    if (record.phase !== "downloading" && record.phase !== "paused") throw new Error("Download is not active");
    if (totalBytes !== undefined) this.reportProgress(id, totalBytes, totalBytes);
    record.phase = "completed";
    record.progressWindow.visible = false;
    record.etaSeconds = 0;
    this.samples.delete(id);
    this.emit({ type: "completed", record: cloneRecord(record) });
    return cloneRecord(record);
  }

  fail(id: string, error: string): DownloadRecord {
    const record = this.require(id);
    if (!error || error.length > 500 || CONTROL_CHARACTERS.test(error)) throw new TypeError("error is not safe");
    if (record.phase === "completed" || record.phase === "cancelled") throw new Error("Download is already terminal");
    record.phase = "failed";
    record.error = error;
    record.progressWindow.visible = false;
    this.samples.delete(id);
    this.emit({ type: "failed", record: cloneRecord(record) });
    return cloneRecord(record);
  }

  get(id: string): DownloadRecord | undefined {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : undefined;
  }

  queueLength(): number { return this.queue.length; }

  private activeCount(): number {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.phase === "awaiting-confirmation" || record.phase === "queued" || record.phase === "downloading" || record.phase === "paused") count++;
    }
    return count;
  }

  private require(id: string): DownloadRecord {
    const record = this.records.get(id);
    if (!record) throw new Error("Unknown download id");
    return record;
  }

  private emit(event: DownloadEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function boundedString(value: unknown, limit: number, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > limit) {
    throw new TypeError(`${field} must be a non-empty string of at most ${limit} characters`);
  }
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} must be a non-empty string of at most ${limit} characters`);
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneRecord(record: DownloadRecord): DownloadRecord {
  return {
    ...record,
    request: { ...record.request },
    progressWindow: { ...record.progressWindow }
  };
}

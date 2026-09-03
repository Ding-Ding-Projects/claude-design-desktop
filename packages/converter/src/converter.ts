import { mkdir, opendir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, resolve, sep } from "node:path";

export const CONVERTER_CATEGORIES = [
  "Documents/PDF",
  "Images",
  "Audio",
  "Video",
  "Archives",
  "Structured Data/Spreadsheets",
  "Code/Text",
  "Binary Encodings"
] as const;

export type ConverterCategory = (typeof CONVERTER_CATEGORIES)[number];

export const DEFAULT_RESOURCE_LIMITS = {
  maxInputBytes: 256 * 1024 * 1024,
  maxOutputBytes: 512 * 1024 * 1024,
  maxCpuMs: 60_000,
  maxMemoryBytes: 512 * 1024 * 1024,
  maxItems: 100_000,
  maxRecursionDepth: 64,
  maxTemporaryBytes: 512 * 1024 * 1024
} as const;

export type ResourceLimits = {
  maxInputBytes: number;
  maxOutputBytes: number;
  maxCpuMs: number;
  maxMemoryBytes: number;
  maxItems: number;
  maxRecursionDepth: number;
  maxTemporaryBytes: number;
};

export type ByteSignature = {
  format: string;
  bytes: Uint8Array;
  offset?: number;
  mask?: Uint8Array;
};

export type LossinessDisclosure = {
  mode: "lossless" | "lossy";
  changes: readonly string[];
  requiresConfirmation: boolean;
};

export type PackagedProof = {
  artifactPath: string;
  sha256: string;
};

export type OutputValidation = {
  valid: boolean;
  format?: string;
  bytes?: number;
  reason?: string;
};

export type Adapter = {
  id: string;
  displayName: string;
  category: ConverterCategory;
  sourceFormats: readonly string[];
  targetFormats: readonly string[];
  sourceSignatures: readonly ByteSignature[];
  bundled: boolean;
  packagedProof?: PackagedProof;
  unavailableReason?: string;
  metadataBehavior: "preserve" | "preserve-when-supported" | "discard";
  encodingBehavior: "preserve" | "normalize" | "transcode";
  lossiness: LossinessDisclosure;
  resourceLimits: ResourceLimits;
  sandbox: SandboxContract;
  validateOutput: (output: Uint8Array, targetFormat: string) => OutputValidation;
};

export type SandboxContract = {
  isolatedProcess: boolean;
  networkAccess: "none";
  allowedExecutable?: string;
  allowedArguments: readonly string[];
  allowedEnvironmentKeys: readonly string[];
  maxInputBytes: number;
  maxOutputBytes: number;
  maxCpuMs: number;
  maxMemoryBytes: number;
  maxTemporaryBytes: number;
};

const SHA256 = /^[0-9a-f]{64}$/i;

function validPackagedProof(proof: PackagedProof | undefined): proof is PackagedProof {
  return Boolean(proof && proof.artifactPath.trim() && SHA256.test(proof.sha256));
}

export function adapterAvailability(adapter: Adapter): { enabled: boolean; reason?: string } {
  if (!adapter.bundled) {
    return { enabled: false, reason: adapter.unavailableReason || "Adapter is not bundled in the installed application." };
  }
  if (!validPackagedProof(adapter.packagedProof)) {
    return { enabled: false, reason: "Adapter is bundled without packaged-artifact proof." };
  }
  if (!adapter.sandbox.isolatedProcess || adapter.sandbox.networkAccess !== "none") {
    return { enabled: false, reason: "Adapter does not satisfy the isolated offline runner contract." };
  }
  return { enabled: true };
}

export type AdapterCatalogEntry = Adapter & {
  enabled: boolean;
  availabilityReason?: string;
};

export class AdapterRegistry {
  private readonly adapters = new Map<string, Adapter>();

  constructor(adapters: readonly Adapter[] = []) {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(adapter: Adapter): void {
    if (!adapter.id.trim()) {
      throw new Error("Adapter id is required.");
    }
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter id is already registered: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): Adapter | undefined {
    return this.adapters.get(id);
  }

  catalog(): AdapterCatalogEntry[] {
    return [...this.adapters.values()].map((adapter) => {
      const availability = adapterAvailability(adapter);
      return {
        ...adapter,
        enabled: availability.enabled,
        availabilityReason: availability.reason
      };
    });
  }

  enabledFor(sourceFormat: string, targetFormat?: string): AdapterCatalogEntry[] {
    return this.catalog().filter((adapter) =>
      adapter.enabled &&
      adapter.sourceFormats.includes(sourceFormat) &&
      (!targetFormat || adapter.targetFormats.includes(targetFormat))
    );
  }
}

export function validateAdapterRegistry(registry: AdapterRegistry): string[] {
  const issues: string[] = [];
  const catalog = registry.catalog();
  for (const category of CONVERTER_CATEGORIES) {
    if (!catalog.some((adapter) => adapter.category === category)) {
      issues.push(`Missing required converter category: ${category}`);
    }
  }
  for (const adapter of catalog) {
    const availability = adapterAvailability(adapter);
    if (adapter.enabled !== availability.enabled) {
      issues.push(`Adapter availability drift: ${adapter.id}`);
    }
    if (adapter.enabled && !validPackagedProof(adapter.packagedProof)) {
      issues.push(`Enabled adapter has no packaged proof: ${adapter.id}`);
    }
    if (adapter.sandbox.networkAccess !== "none") {
      issues.push(`Adapter has ambient network access: ${adapter.id}`);
    }
  }
  return issues;
}

const signatures = {
  pdf: [{ format: "pdf", bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]) }],
  png: [{ format: "png", bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }],
  jpeg: [{ format: "jpeg", bytes: Uint8Array.from([0xff, 0xd8, 0xff]) }],
  webp: [{ format: "webp", bytes: Uint8Array.from([0x52, 0x49, 0x46, 0x46]), offset: 0 }],
  mp3: [{ format: "mp3", bytes: Uint8Array.from([0x49, 0x44, 0x33]) }],
  wav: [{ format: "wav", bytes: Uint8Array.from([0x52, 0x49, 0x46, 0x46]) }],
  mp4: [{ format: "mp4", bytes: Uint8Array.from([0x66, 0x74, 0x79, 0x70]), offset: 4 }],
  zip: [{ format: "zip", bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]) }],
  gzip: [{ format: "gzip", bytes: Uint8Array.from([0x1f, 0x8b]) }],
  json: [{ format: "json", bytes: Uint8Array.from([0x7b]) }],
  xml: [{ format: "xml", bytes: Uint8Array.from([0x3c, 0x3f, 0x78, 0x6d, 0x6c]) }],
  utf8: [{ format: "utf8", bytes: new Uint8Array(0) }]
} satisfies Record<string, readonly ByteSignature[]>;

const unavailableSandbox: SandboxContract = {
  isolatedProcess: true,
  networkAccess: "none",
  allowedArguments: [],
  allowedEnvironmentKeys: [],
  maxInputBytes: DEFAULT_RESOURCE_LIMITS.maxInputBytes,
  maxOutputBytes: DEFAULT_RESOURCE_LIMITS.maxOutputBytes,
  maxCpuMs: DEFAULT_RESOURCE_LIMITS.maxCpuMs,
  maxMemoryBytes: DEFAULT_RESOURCE_LIMITS.maxMemoryBytes,
  maxTemporaryBytes: DEFAULT_RESOURCE_LIMITS.maxTemporaryBytes
};

function unavailableAdapter(
  id: string,
  displayName: string,
  category: ConverterCategory,
  sourceFormats: readonly string[],
  targetFormats: readonly string[],
  sourceSignatures: readonly ByteSignature[],
  lossiness: LossinessDisclosure = { mode: "lossless", changes: [], requiresConfirmation: false }
): Adapter {
  return {
    id,
    displayName,
    category,
    sourceFormats,
    targetFormats,
    sourceSignatures,
    bundled: false,
    unavailableReason: "No bundled adapter and packaged-artifact proof are configured.",
    metadataBehavior: "preserve-when-supported",
    encodingBehavior: "preserve",
    lossiness,
    resourceLimits: DEFAULT_RESOURCE_LIMITS,
    sandbox: unavailableSandbox,
    validateOutput: (output, targetFormat) => ({
      valid: output.byteLength > 0,
      format: targetFormat,
      bytes: output.byteLength,
      reason: output.byteLength > 0 ? undefined : "Output is empty."
    })
  };
}

export function createDefaultAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry([
    unavailableAdapter("pdf-offline", "PDF operations", "Documents/PDF", ["pdf"], ["pdf"], signatures.pdf),
    unavailableAdapter("image-offline", "Image conversion", "Images", ["png", "jpeg", "webp"], ["png", "jpeg", "webp"], [
      ...signatures.png,
      ...signatures.jpeg,
      ...signatures.webp
    ], { mode: "lossy", changes: ["layers", "animation", "colour profile or transparency may change"], requiresConfirmation: true }),
    unavailableAdapter("audio-offline", "Audio conversion", "Audio", ["mp3", "wav"], ["mp3", "wav"], [...signatures.mp3, ...signatures.wav], {
      mode: "lossy", changes: ["codec, bitrate, and metadata may change"], requiresConfirmation: true
    }),
    unavailableAdapter("video-offline", "Video conversion", "Video", ["mp4", "webm"], ["mp4", "webm"], signatures.mp4, {
      mode: "lossy", changes: ["codec, frames, subtitles, and metadata may change"], requiresConfirmation: true
    }),
    unavailableAdapter("archive-offline", "Archive conversion", "Archives", ["zip", "gzip"], ["zip", "gzip"], [...signatures.zip, ...signatures.gzip]),
    unavailableAdapter("structured-offline", "Structured data conversion", "Structured Data/Spreadsheets", ["json", "csv", "xml"], ["json", "csv", "xml"], [...signatures.json, ...signatures.xml], {
      mode: "lossy", changes: ["types, formulas, comments, or formatting may not survive"], requiresConfirmation: true
    }),
    unavailableAdapter("text-offline", "Code and text conversion", "Code/Text", ["utf8", "json", "xml"], ["utf8", "json", "xml"], [...signatures.json, ...signatures.xml, ...signatures.utf8]),
    unavailableAdapter("binary-offline", "Binary encoding conversion", "Binary Encodings", ["base64", "hex", "binary"], ["base64", "hex", "binary"], [], {
      mode: "lossless", changes: [], requiresConfirmation: false
    })
  ]);
}

export function matchesSignature(prefix: Uint8Array, signature: ByteSignature): boolean {
  const offset = signature.offset || 0;
  if (signature.bytes.byteLength === 0) {
    return true;
  }
  if (prefix.byteLength < offset + signature.bytes.byteLength) {
    return false;
  }
  for (let index = 0; index < signature.bytes.byteLength; index += 1) {
    const mask = signature.mask?.[index] ?? 0xff;
    if ((prefix[offset + index] & mask) !== (signature.bytes[index] & mask)) {
      return false;
    }
  }
  return true;
}

export async function readBoundedPrefix(
  source: Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
  maxBytes = 64 * 1024
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("Prefix bound must be a positive safe integer.");
  }
  if (source instanceof Uint8Array) {
    return source.slice(0, maxBytes);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of source) {
    if (!(chunk instanceof Uint8Array)) {
      throw new Error("Source chunks must be Uint8Array values.");
    }
    if (total >= maxBytes) {
      break;
    }
    const allowed = Math.min(chunk.byteLength, maxBytes - total);
    if (allowed > 0) {
      chunks.push(chunk.slice(0, allowed));
      total += allowed;
    }
  }
  const prefix = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    prefix.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return prefix;
}

export async function detectSourceFormats(
  source: Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
  registry: AdapterRegistry,
  maxBytes = 64 * 1024
): Promise<{ formats: string[]; inspectedBytes: number }> {
  const prefix = await readBoundedPrefix(source, maxBytes);
  const formats = new Set<string>();
  for (const adapter of registry.catalog()) {
    for (const signature of adapter.sourceSignatures) {
      if (signature.bytes.byteLength > 0 && matchesSignature(prefix, signature)) {
        formats.add(signature.format);
      }
    }
  }
  if (formats.size === 0 && prefix.byteLength > 0) {
    const utf8Adapter = registry.catalog().some((adapter) => adapter.sourceFormats.includes("utf8"));
    if (utf8Adapter) {
      formats.add("utf8");
    }
  }
  return { formats: [...formats], inspectedBytes: prefix.byteLength };
}

export function assertResourceBounds(inputBytes: number, limits: ResourceLimits): void {
  if (!Number.isSafeInteger(inputBytes) || inputBytes < 0) {
    throw new Error("Input byte count must be a non-negative safe integer.");
  }
  const numericLimits = Object.values(limits);
  if (numericLimits.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error("Resource limits must be positive safe integers.");
  }
  if (inputBytes > limits.maxInputBytes) {
    throw new Error(`Input exceeds the adapter limit of ${limits.maxInputBytes} bytes.`);
  }
}

export function requireLossyConfirmation(adapter: Adapter, confirmed: boolean): void {
  if (adapter.lossiness.mode === "lossy" && adapter.lossiness.requiresConfirmation && !confirmed) {
    throw new Error(`Explicit confirmation is required because this conversion may change: ${adapter.lossiness.changes.join(", ")}.`);
  }
}

export type RunnerRequest = {
  adapter: Adapter;
  inputPath: string;
  outputPath: string;
  targetFormat: string;
  inputBytes: number;
  arguments?: readonly string[];
  environment?: Readonly<Record<string, string>>;
};

export type RunnerResult = {
  output: Uint8Array;
  elapsedMs: number;
};

export type IsolatedRunner = {
  run: (request: RunnerRequest, signal: AbortSignal) => Promise<RunnerResult>;
};

export function validateRunnerRequest(request: RunnerRequest): void {
  const availability = adapterAvailability(request.adapter);
  if (!availability.enabled) {
    throw new Error(`Adapter is unavailable: ${availability.reason}`);
  }
  assertResourceBounds(request.inputBytes, request.adapter.resourceLimits);
  if (request.adapter.sandbox.networkAccess !== "none" || !request.adapter.sandbox.isolatedProcess) {
    throw new Error("Runner must be isolated and offline.");
  }
  const args = request.arguments || [];
  if (args.some((argument) => !request.adapter.sandbox.allowedArguments.includes(argument))) {
    throw new Error("Runner arguments are not allowlisted.");
  }
  const environmentKeys = Object.keys(request.environment || {});
  if (environmentKeys.some((key) => !request.adapter.sandbox.allowedEnvironmentKeys.includes(key))) {
    throw new Error("Runner environment keys are not allowlisted.");
  }
}

export async function convertWithIsolatedRunner(
  request: RunnerRequest,
  runner: IsolatedRunner,
  options: { confirmedLossiness?: boolean; signal?: AbortSignal } = {}
): Promise<Uint8Array> {
  validateRunnerRequest(request);
  requireLossyConfirmation(request.adapter, options.confirmedLossiness === true);
  const result = await runner.run(request, options.signal || new AbortController().signal);
  if (!Number.isFinite(result.elapsedMs) || result.elapsedMs > request.adapter.resourceLimits.maxCpuMs) {
    throw new Error("Conversion exceeded the CPU-time limit.");
  }
  if (result.output.byteLength > request.adapter.resourceLimits.maxOutputBytes) {
    throw new Error("Conversion exceeded the output-byte limit.");
  }
  const validation = request.adapter.validateOutput(result.output, request.targetFormat);
  if (!validation.valid) {
    throw new Error(validation.reason || "Adapter output validation failed.");
  }
  return result.output;
}

export type DestinationPreflight = {
  requiredBytes: number;
  freeBytes: number;
  safetyReserveBytes?: number;
};

export function preflightDestinationStorage(input: DestinationPreflight): { accepted: boolean; availableAfterReserve: number; reason?: string } {
  const reserve = input.safetyReserveBytes || 0;
  if (![input.requiredBytes, input.freeBytes, reserve].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("Storage values must be non-negative safe integers.");
  }
  const availableAfterReserve = input.freeBytes - reserve;
  if (input.requiredBytes > availableAfterReserve) {
    return {
      accepted: false,
      availableAfterReserve,
      reason: `Destination has ${availableAfterReserve} bytes after reserve, but ${input.requiredBytes} bytes are required.`
    };
  }
  return { accepted: true, availableAfterReserve };
}

export type AtomicFileSystem = {
  mkdir: typeof mkdir;
  writeFile: typeof writeFile;
  readFile: typeof readFile;
  rename: typeof rename;
  rm: typeof rm;
};

const defaultFileSystem: AtomicFileSystem = { mkdir, writeFile, readFile, rename, rm };

export async function writeValidatedOutput(
  destination: string,
  output: Uint8Array,
  validator: (bytes: Uint8Array) => OutputValidation,
  fileSystem: AtomicFileSystem = defaultFileSystem
): Promise<OutputValidation> {
  if (!isAbsolute(destination)) {
    throw new Error("Destination must be an absolute path.");
  }
  const initialValidation = validator(output);
  if (!initialValidation.valid) {
    throw new Error(initialValidation.reason || "Output validation failed before write.");
  }
  const parent = dirname(destination);
  await fileSystem.mkdir(parent, { recursive: true });
  const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fileSystem.writeFile(temporaryPath, output, { flag: "wx" });
    const written = new Uint8Array(await fileSystem.readFile(temporaryPath));
    const writtenValidation = validator(written);
    if (!writtenValidation.valid || written.byteLength !== output.byteLength) {
      throw new Error(writtenValidation.reason || "Written output failed validation.");
    }
    await fileSystem.rename(temporaryPath, destination);
    return writtenValidation;
  } catch (error) {
    await fileSystem.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export type PdfDocumentState = {
  pageCount: number;
  pageOrder: readonly number[];
  rotations: readonly number[];
  metadata: Readonly<Record<string, string>>;
  encrypted?: boolean;
  signed?: boolean;
};

export type PdfOperation =
  | { kind: "inspect" }
  | { kind: "split"; pages: readonly number[] }
  | { kind: "merge"; documents: readonly PdfDocumentState[] }
  | { kind: "extract"; pages: readonly number[] }
  | { kind: "reorder"; pageOrder: readonly number[] }
  | { kind: "rotate"; pages: readonly number[]; degrees: 90 | 180 | 270 }
  | { kind: "metadata"; values: Readonly<Record<string, string>> };

export type PdfOperationPlan = {
  operation: PdfOperation;
  writesOutput: boolean;
  expectedPageCount?: number;
  expectedPageOrder?: readonly number[];
  expectedRotations?: readonly number[];
  expectedMetadata?: Readonly<Record<string, string>>;
};

function assertPdfPages(pages: readonly number[], pageCount: number): void {
  if (pages.length === 0 || pages.some((page) => !Number.isSafeInteger(page) || page < 1 || page > pageCount)) {
    throw new Error("PDF page selection is outside the document bounds.");
  }
}

export function createPdfOperationPlan(document: PdfDocumentState, operation: PdfOperation): PdfOperationPlan {
  if (!Number.isSafeInteger(document.pageCount) || document.pageCount < 1 || document.pageOrder.length !== document.pageCount || document.rotations.length !== document.pageCount) {
    throw new Error("PDF document state is inconsistent.");
  }
  if (document.encrypted || document.signed) {
    throw new Error("Encrypted or signed PDF capabilities are opaque and require an adapter that explicitly supports them.");
  }
  switch (operation.kind) {
    case "inspect":
      return { operation, writesOutput: false };
    case "split":
    case "extract":
      assertPdfPages(operation.pages, document.pageCount);
      return { operation, writesOutput: true, expectedPageCount: operation.pages.length, expectedPageOrder: operation.pages };
    case "merge": {
      if (operation.documents.length < 2 || operation.documents.some((item) => item.encrypted || item.signed)) {
        throw new Error("PDF merge requires at least two supported, unsigned documents.");
      }
      const pageCount = operation.documents.reduce((total, item) => total + item.pageCount, 0);
      return { operation, writesOutput: true, expectedPageCount: pageCount };
    }
    case "reorder":
      if (operation.pageOrder.length !== document.pageCount || new Set(operation.pageOrder).size !== document.pageCount || operation.pageOrder.some((page) => page < 1 || page > document.pageCount)) {
        throw new Error("PDF reorder must include each page exactly once.");
      }
      return { operation, writesOutput: true, expectedPageCount: document.pageCount, expectedPageOrder: operation.pageOrder };
    case "rotate": {
      assertPdfPages(operation.pages, document.pageCount);
      const expectedRotations = [...document.rotations];
      for (const page of operation.pages) {
        const index = page - 1;
        expectedRotations[index] = (expectedRotations[index] + operation.degrees) % 360;
      }
      return { operation, writesOutput: true, expectedPageCount: document.pageCount, expectedRotations };
    }
    case "metadata":
      return { operation, writesOutput: true, expectedPageCount: document.pageCount, expectedMetadata: operation.values };
  }
}

export function validatePdfPostWrite(plan: PdfOperationPlan, output: PdfDocumentState): OutputValidation {
  if (!plan.writesOutput) {
    return { valid: true, format: "pdf" };
  }
  if (plan.expectedPageCount !== undefined && output.pageCount !== plan.expectedPageCount) {
    return { valid: false, format: "pdf", reason: "PDF page count does not match the requested operation." };
  }
  if (plan.expectedPageOrder && output.pageOrder.join(",") !== plan.expectedPageOrder.join(",")) {
    return { valid: false, format: "pdf", reason: "PDF page order does not match the requested operation." };
  }
  if (plan.expectedRotations && output.rotations.join(",") !== plan.expectedRotations.join(",")) {
    return { valid: false, format: "pdf", reason: "PDF rotations do not match the requested operation." };
  }
  if (plan.expectedMetadata && JSON.stringify(output.metadata) !== JSON.stringify(plan.expectedMetadata)) {
    return { valid: false, format: "pdf", reason: "PDF metadata does not match the requested operation." };
  }
  return { valid: true, format: "pdf" };
}

export type QueueState = "queued" | "processing" | "completed" | "skipped" | "cancelled" | "failed";

export type ConversionJob = {
  id: string;
  sourcePath: string;
  destinationPath: string;
  adapterId: string;
  targetFormat: string;
  sourceBytes: number;
  state: QueueState;
  attempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type QueuePage = { items: ConversionJob[]; nextCursor?: string };

export type DurableQueueStore = {
  append: (job: ConversionJob) => Promise<void>;
  claimNext: () => Promise<ConversionJob | undefined>;
  update: (id: string, update: Partial<ConversionJob>) => Promise<void>;
  listPage: (cursor: string | undefined, limit: number) => Promise<QueuePage>;
  recoverProcessing: () => Promise<number>;
};

export class InMemoryDurableQueueStore implements DurableQueueStore {
  private readonly jobs = new Map<string, ConversionJob>();

  async append(job: ConversionJob): Promise<void> {
    this.jobs.set(job.id, { ...job });
  }

  async claimNext(): Promise<ConversionJob | undefined> {
    const next = [...this.jobs.values()].find((job) => job.state === "queued");
    if (!next) {
      return undefined;
    }
    const claimed = { ...next, state: "processing" as const, attempts: next.attempts + 1, updatedAt: new Date().toISOString() };
    this.jobs.set(next.id, claimed);
    return claimed;
  }

  async update(id: string, update: Partial<ConversionJob>): Promise<void> {
    const existing = this.jobs.get(id);
    if (!existing) {
      throw new Error(`Unknown queue item: ${id}`);
    }
    this.jobs.set(id, { ...existing, ...update, updatedAt: new Date().toISOString() });
  }

  async listPage(cursor: string | undefined, limit: number): Promise<QueuePage> {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1_000) {
      throw new Error("Queue page size must be between 1 and 1000.");
    }
    const ordered = [...this.jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const start = cursor ? Math.max(0, ordered.findIndex((job) => job.id === cursor) + 1) : 0;
    const items = ordered.slice(start, start + limit).map((job) => ({ ...job }));
    const hasMore = start + items.length < ordered.length;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined };
  }

  async recoverProcessing(): Promise<number> {
    let recovered = 0;
    for (const job of this.jobs.values()) {
      if (job.state === "processing") {
        this.jobs.set(job.id, { ...job, state: "queued", updatedAt: new Date().toISOString() });
        recovered += 1;
      }
    }
    return recovered;
  }
}

/**
 * A file-backed store keeps one bounded JSON record per queue item. It scans
 * directory entries lazily, reads only the candidate record being inspected,
 * and replaces one record atomically on every state transition. Queue length
 * is therefore not coupled to one giant JSON document or an in-memory array.
 */
export class FileDurableQueueStore implements DurableQueueStore {
  private claimChain: Promise<void> = Promise.resolve();
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
    if (!isAbsolute(directory)) {
      throw new Error("Queue directory must be an absolute path.");
    }
  }

  async append(job: ConversionJob): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.recordPath(job.id), JSON.stringify(job), { encoding: "utf8", flag: "wx" });
  }

  async claimNext(): Promise<ConversionJob | undefined> {
    let claimed: ConversionJob | undefined;
    await this.withClaimLock(async () => {
      const directory = await this.openDirectory();
      if (!directory) {
        return;
      }
      try {
        for await (const entry of directory) {
          if (!entry.isFile() || !entry.name.endsWith(".json")) {
            continue;
          }
          const job = await this.readRecord(entry.name);
          if (!job || job.state !== "queued") {
            continue;
          }
          claimed = { ...job, state: "processing", attempts: job.attempts + 1, updatedAt: new Date().toISOString() };
          await this.writeRecord(claimed);
          break;
        }
      } finally {
        await directory.close().catch(() => undefined);
      }
    });
    return claimed;
  }

  async update(id: string, update: Partial<ConversionJob>): Promise<void> {
    const existing = await this.readRecord(`${id}.json`);
    if (!existing) {
      throw new Error(`Unknown queue item: ${id}`);
    }
    await this.writeRecord({ ...existing, ...update, updatedAt: new Date().toISOString() });
  }

  async listPage(cursor: string | undefined, limit: number): Promise<QueuePage> {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1_000) {
      throw new Error("Queue page size must be between 1 and 1000.");
    }
    const items: ConversionJob[] = [];
    let foundCursor = cursor === undefined;
    let nextCursor: string | undefined;
    const directory = await this.openDirectory();
    if (!directory) {
      return { items };
    }
    try {
      for await (const entry of directory) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }
        const job = await this.readRecord(entry.name);
        if (!job) {
          continue;
        }
        if (!foundCursor) {
          foundCursor = job.id === cursor;
          continue;
        }
        if (items.length < limit) {
          items.push(job);
        } else {
          nextCursor = items[items.length - 1]?.id;
          break;
        }
      }
    } finally {
      await directory.close().catch(() => undefined);
    }
    return { items, nextCursor };
  }

  async recoverProcessing(): Promise<number> {
    let recovered = 0;
    const directory = await this.openDirectory();
    if (!directory) {
      return recovered;
    }
    try {
      for await (const entry of directory) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }
        const job = await this.readRecord(entry.name);
        if (job?.state === "processing") {
          await this.writeRecord({ ...job, state: "queued", updatedAt: new Date().toISOString() });
          recovered += 1;
        }
      }
    } finally {
      await directory.close().catch(() => undefined);
    }
    return recovered;
  }

  private recordPath(id: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new Error("Queue item id is invalid.");
    }
    return resolve(this.directory, `${id}.json`);
  }

  private async openDirectory() {
    try {
      return await opendir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  private async readRecord(fileName: string): Promise<ConversionJob | undefined> {
    try {
      const text = await readFile(resolve(this.directory, fileName), "utf8");
      const record = JSON.parse(text) as ConversionJob;
      return record && typeof record.id === "string" ? record : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw new Error(`Queue record is invalid: ${fileName}`);
    }
  }

  private async writeRecord(job: ConversionJob): Promise<void> {
    const destination = this.recordPath(job.id);
    const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(job), { encoding: "utf8", flag: "wx" });
    try {
      await rename(temporaryPath, destination);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async withClaimLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.claimChain;
    let release!: () => void;
    this.claimChain = new Promise<void>((resolveRelease) => {
      release = resolveRelease;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export type ConversionProcessor = (job: ConversionJob, signal: AbortSignal) => Promise<"completed" | "skipped">;

export class DurableConversionQueue {
  private paused = false;
  private cancelled = false;
  private readonly running = new Map<string, AbortController>();
  private readonly store: DurableQueueStore;
  private readonly concurrency: number;

  constructor(store: DurableQueueStore, concurrency = 2) {
    this.store = store;
    this.concurrency = concurrency;
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) {
      throw new Error("Queue concurrency must be between 1 and 32.");
    }
  }

  async enqueue(input: Omit<ConversionJob, "id" | "state" | "attempts" | "createdAt" | "updatedAt">): Promise<string> {
    assertPathPair(input.sourcePath, input.destinationPath);
    if (!Number.isSafeInteger(input.sourceBytes) || input.sourceBytes < 0) {
      throw new Error("Queue source byte count must be a non-negative safe integer.");
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    await this.store.append({ ...input, id, state: "queued", attempts: 0, createdAt: now, updatedAt: now });
    return id;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.cancelled = false;
  }

  async cancelQueued(): Promise<void> {
    this.cancelled = true;
    for (const controller of this.running.values()) {
      controller.abort();
    }
    let cursor: string | undefined;
    do {
      const page = await this.store.listPage(cursor, 200);
      for (const item of page.items) {
        if (item.state === "queued") {
          await this.store.update(item.id, { state: "cancelled" });
        }
      }
      cursor = page.nextCursor;
    } while (cursor);
  }

  async recoverAfterCrash(): Promise<number> {
    return this.store.recoverProcessing();
  }

  async page(cursor: string | undefined, limit = 100): Promise<QueuePage> {
    return this.store.listPage(cursor, limit);
  }

  async process(processor: ConversionProcessor): Promise<void> {
    const workers = Array.from({ length: this.concurrency }, () => this.worker(processor));
    await Promise.all(workers);
  }

  private async worker(processor: ConversionProcessor): Promise<void> {
    while (!this.cancelled) {
      if (this.paused) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 10));
        continue;
      }
      // Yield between claims so a fast processor cannot monopolize the queue.
      await new Promise<void>((resolveWait) => setTimeout(resolveWait, 0));
      const job = await this.store.claimNext();
      if (!job) {
        return;
      }
      const controller = new AbortController();
      this.running.set(job.id, controller);
      try {
        const outcome = await processor(job, controller.signal);
        await this.store.update(job.id, { state: controller.signal.aborted || this.cancelled ? "cancelled" : outcome });
      } catch (error) {
        const state: QueueState = controller.signal.aborted || this.cancelled ? "cancelled" : "failed";
        await this.store.update(job.id, { state, error: error instanceof Error ? error.message : String(error) });
      } finally {
        this.running.delete(job.id);
      }
    }
  }
}

function assertPathPair(sourcePath: string, destinationPath: string): void {
  if (!isAbsolute(sourcePath) || !isAbsolute(destinationPath)) {
    throw new Error("Queue paths must be absolute.");
  }
  const source = resolve(sourcePath);
  const destination = resolve(destinationPath);
  if (!source || !destination || source === sep || destination === sep) {
    throw new Error("Queue paths are not valid file paths.");
  }
}

export async function inspectDestinationDirectory(destination: string): Promise<{ exists: boolean; freeBytes?: number }> {
  if (!isAbsolute(destination)) {
    throw new Error("Destination directory must be absolute.");
  }
  try {
    const information = await stat(destination);
    if (!information.isDirectory()) {
      throw new Error("Destination is not a directory.");
    }
    return { exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false };
    }
    throw error;
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

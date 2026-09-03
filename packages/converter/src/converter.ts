import { lstat, mkdir, opendir, open, readFile, realpath, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

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
  container?: { offset: number; bytes: Uint8Array };
};

export type LossinessDisclosure = {
  mode: "lossless" | "lossy";
  changes: readonly string[];
  requiresConfirmation: boolean;
};

export type PackagedProof = {
  artifactPath: string;
  sha256: string;
  identity: string;
  kind: "native-executable" | "native-library" | "data";
};

export type ExecutableDescriptor = {
  adapterId: string;
  executableId: string;
  absolutePath: string;
  sha256: string;
  kind: "native-executable" | "script-host";
  allowedArguments: readonly string[];
  allowedEnvironmentKeys: readonly string[];
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
  executable?: ExecutableDescriptor;
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
const MAX_PACKAGED_PROOF_BYTES = 256 * 1024 * 1024;

function validPackagedProof(proof: PackagedProof | undefined): proof is PackagedProof {
  return Boolean(
    proof &&
    proof.artifactPath.trim() &&
    SHA256.test(proof.sha256) &&
    proof.identity.trim() &&
    ["native-executable", "native-library", "data"].includes(proof.kind)
  );
}

export function adapterAvailability(adapter: Adapter): { enabled: boolean; reason?: string } {
  if (!adapter.bundled) {
    return { enabled: false, reason: adapter.unavailableReason || "Adapter is not bundled in the installed application." };
  }
  if (!validPackagedProof(adapter.packagedProof)) {
    return { enabled: false, reason: "Adapter is bundled without packaged-artifact proof." };
  }
  return { enabled: false, reason: "Packaged proof requires asynchronous file, hash, type, and identity verification." };
}

export type AdapterCatalogEntry = Adapter & {
  enabled: boolean;
  availabilityReason?: string;
};

export class AdapterRegistry {
  private readonly adapters = new Map<string, Adapter>();
  readonly packagedRoot: string;

  constructor(adapters: readonly Adapter[] = [], packagedRoot = process.cwd()) {
    this.packagedRoot = resolve(packagedRoot);
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

  async verifiedCatalog(): Promise<AdapterCatalogEntry[]> {
    const entries: AdapterCatalogEntry[] = [];
    for (const adapter of this.adapters.values()) {
      const verification = await verifyPackagedAdapter(adapter, this.packagedRoot);
      entries.push({
        ...adapter,
        enabled: verification.enabled,
        availabilityReason: verification.reason
      });
    }
    return entries;
  }

  executableFor(adapterId: string): ExecutableDescriptor | undefined {
    return this.adapters.get(adapterId)?.executable;
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
    if (adapter.enabled) {
      issues.push(`Adapter is marked enabled before packaged verification: ${adapter.id}`);
    }
    if (validPackagedProof(adapter.packagedProof) && adapter.packagedProof.identity !== adapter.id) {
      issues.push(`Packaged proof identity does not match adapter id: ${adapter.id}`);
    }
    if (adapter.sandbox.networkAccess !== "none") {
      issues.push(`Adapter has ambient network access: ${adapter.id}`);
    }
  }
  return issues;
}

export type PackagedVerification = { enabled: boolean; reason?: string; resolvedPath?: string; sha256?: string };

export async function verifyPackagedAdapter(adapter: Adapter, packagedRoot: string): Promise<PackagedVerification> {
  const structural = adapterAvailability({ ...adapter, bundled: adapter.bundled });
  if (adapter.bundled === false) {
    return structural;
  }
  const proof = adapter.packagedProof;
  if (!validPackagedProof(proof)) {
    return { enabled: false, reason: "Adapter is bundled without complete packaged proof." };
  }
  if (proof.identity !== adapter.id) {
    return { enabled: false, reason: "Packaged proof identity does not match adapter identity." };
  }
  const resolvedPath = isAbsolute(proof.artifactPath) ? resolve(proof.artifactPath) : resolve(packagedRoot, proof.artifactPath);
  if (!pathWithinRoots(resolvedPath, [packagedRoot])) {
    return { enabled: false, reason: "Packaged proof path escapes the product package root.", resolvedPath };
  }
  let actualHash: string;
  let head: Uint8Array;
  try {
    const information = await stat(resolvedPath);
    if (!information.isFile()) {
      return { enabled: false, reason: "Packaged proof path is not a regular file.", resolvedPath };
    }
    if (information.size > MAX_PACKAGED_PROOF_BYTES) {
      return { enabled: false, reason: "Packaged proof file exceeds the bounded verification size.", resolvedPath };
    }
    ({ hash: actualHash, head } = await hashPackagedFile(resolvedPath));
  } catch {
    return { enabled: false, reason: "Packaged proof file is missing or unreadable.", resolvedPath };
  }
  if (actualHash.toLowerCase() !== proof.sha256.toLowerCase()) {
    return { enabled: false, reason: "Packaged proof SHA-256 does not match the file.", resolvedPath, sha256: actualHash };
  }
  if (proof.kind === "native-executable" && !looksLikeNativeExecutable(head)) {
    return { enabled: false, reason: "Packaged proof file is not a recognized native executable.", resolvedPath, sha256: actualHash };
  }
  if (adapter.executable) {
    if (adapter.executable.adapterId !== adapter.id || adapter.executable.executableId !== proof.identity) {
      return { enabled: false, reason: "Executable registry identity does not match the adapter proof.", resolvedPath, sha256: actualHash };
    }
    if (resolve(adapter.executable.absolutePath) !== resolvedPath || adapter.executable.sha256.toLowerCase() !== actualHash.toLowerCase() || adapter.executable.kind !== "native-executable") {
      return { enabled: false, reason: "Executable registry path, hash, or type does not match packaged proof.", resolvedPath, sha256: actualHash };
    }
  }
  return { enabled: true, resolvedPath, sha256: actualHash };
}

async function hashPackagedFile(filePath: string): Promise<{ hash: string; head: Uint8Array }> {
  const digest = createHash("sha256");
  const headParts: Uint8Array[] = [];
  let headLength = 0;
  const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
  for await (const chunk of stream) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBuffer);
    digest.update(bytes);
    if (headLength < 64) {
      const part = bytes.slice(0, Math.min(bytes.byteLength, 64 - headLength));
      headParts.push(part);
      headLength += part.byteLength;
    }
  }
  const head = new Uint8Array(headLength);
  let offset = 0;
  for (const part of headParts) {
    head.set(part, offset);
    offset += part.byteLength;
  }
  return { hash: digest.digest("hex"), head };
}

function looksLikeNativeExecutable(bytes: Uint8Array): boolean {
  const windowsPe = bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a;
  const elf = bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46;
  const macho = bytes.length >= 4 && ((bytes[0] === 0xfe && bytes[1] === 0xed && bytes[2] === 0xfa) || (bytes[0] === 0xcf && bytes[1] === 0xfa && bytes[2] === 0xed));
  return windowsPe || elf || macho;
}

const signatures = {
  pdf: [{ format: "pdf", bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]) }],
  png: [{ format: "png", bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }],
  jpeg: [{ format: "jpeg", bytes: Uint8Array.from([0xff, 0xd8, 0xff]) }],
  webp: [{ format: "webp", bytes: Uint8Array.from([0x52, 0x49, 0x46, 0x46]), offset: 0, container: { offset: 8, bytes: Uint8Array.from([0x57, 0x45, 0x42, 0x50]) } }],
  mp3: [{ format: "mp3", bytes: Uint8Array.from([0x49, 0x44, 0x33]) }],
  wav: [{ format: "wav", bytes: Uint8Array.from([0x52, 0x49, 0x46, 0x46]), container: { offset: 8, bytes: Uint8Array.from([0x57, 0x41, 0x56, 0x45]) } }],
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
  if (signature.container) {
    const container = signature.container;
    if (prefix.byteLength < container.offset + container.bytes.byteLength) {
      return false;
    }
    for (let index = 0; index < container.bytes.byteLength; index += 1) {
      if (prefix[container.offset + index] !== container.bytes[index]) {
        return false;
      }
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
    if (utf8Adapter && isStrictUtf8(prefix)) {
      formats.add("utf8");
    }
  }
  return { formats: [...formats], inspectedBytes: prefix.byteLength };
}

function isStrictUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
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
  estimatedOutputBytes: number;
  allowedRoots: readonly string[];
  temporaryDirectory: string;
  publishPath: string;
  arguments?: readonly string[];
  environment?: Readonly<Record<string, string>>;
};

export type RunnerResult = {
  output: Uint8Array;
  elapsedMs: number;
};

export type ProductProcess = {
  once: (event: "error" | "exit", listener: (...args: any[]) => void) => ProductProcess;
  kill: () => boolean;
};

export type ProductProcessFactory = (executable: string, args: readonly string[], options: { cwd: string; env: Readonly<Record<string, string>> }) => ProductProcess;

export function validateRunnerRequest(request: RunnerRequest): void {
  assertResourceBounds(request.inputBytes, request.adapter.resourceLimits);
  assertResourceBounds(request.estimatedOutputBytes, { ...request.adapter.resourceLimits, maxInputBytes: request.adapter.resourceLimits.maxOutputBytes });
  validateConversionPath(request.inputPath);
  validateConversionPath(request.outputPath);
  validateConversionPath(request.temporaryDirectory);
  validateConversionPath(request.publishPath);
  if (request.allowedRoots.length === 0 || request.allowedRoots.some((root) => !isAbsolute(root))) {
    throw new Error("Runner requires at least one absolute containment root.");
  }
  if (!pathWithinRoots(request.inputPath, request.allowedRoots) || !pathWithinRoots(request.outputPath, request.allowedRoots)) {
    throw new Error("Input and output paths must remain inside the configured containment roots.");
  }
  if (!pathWithinRoots(request.temporaryDirectory, request.allowedRoots) || !pathWithinRoots(request.publishPath, request.allowedRoots) || !pathWithinRoots(request.outputPath, [request.temporaryDirectory])) {
    throw new Error("Child output and publication paths violate product containment.");
  }
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

export class ProductOwnedIsolatedRunner {
  private readonly registry: AdapterRegistry;
  private readonly tempRoot: string;
  private readonly processFactory: ProductProcessFactory;

  constructor(registry: AdapterRegistry, tempRoot = resolve(registry.packagedRoot, ".converter-temp"), processFactory: ProductProcessFactory = (executable, args, options) => spawn(executable, [...args], { ...options, shell: false, stdio: "ignore", windowsHide: true })) {
    this.registry = registry;
    this.tempRoot = resolve(tempRoot);
    this.processFactory = processFactory;
  }

  async run(request: RunnerRequest, signal: AbortSignal): Promise<RunnerResult> {
    validateRunnerRequest(request);
    const verification = await verifyPackagedAdapter(request.adapter, this.registry.packagedRoot);
    if (!verification.enabled || !verification.resolvedPath) {
      throw new Error(`Adapter is unavailable: ${verification.reason || "packaged proof verification failed"}`);
    }
    await mkdir(this.tempRoot, { recursive: true });
    if (!pathWithinRoots(request.temporaryDirectory, [this.tempRoot])) {
      throw new Error("Temporary directory is not product-owned.");
    }
    await mkdir(request.temporaryDirectory, { recursive: true });
    await assertCanonicalContainment(request.inputPath, request.outputPath, request.allowedRoots);
    const canonicalTempRoot = await realpath(this.tempRoot);
    const canonicalTempDirectory = await realpath(request.temporaryDirectory);
    if (!pathWithinRoots(canonicalTempDirectory, [canonicalTempRoot]) || !pathWithinRoots(request.outputPath, [canonicalTempDirectory])) {
      throw new Error("Child output path is outside the canonical product-owned temporary directory.");
    }
    const executable = this.registry.executableFor(request.adapter.id);
    if (!executable || executable.kind !== "native-executable") {
      throw new Error("No product-owned native executable is registered for this adapter.");
    }
    if (resolve(executable.absolutePath) !== verification.resolvedPath || executable.sha256.toLowerCase() !== verification.sha256?.toLowerCase()) {
      throw new Error("Product-owned executable registry does not match the verified packaged file.");
    }
    const args = request.arguments || [];
    if (args.some((argument) => !executable.allowedArguments.includes(argument))) {
      throw new Error("Runner arguments are not in the product-owned executable registry.");
    }
    if (args.some((argument) => ["-e", "--eval", "-r", "--require", "-c", "--command"].includes(argument))) {
      throw new Error("Script-host and command-evaluation arguments are not allowed.");
    }
    const environment = request.environment || {};
    if (Object.keys(environment).some((key) => !executable.allowedEnvironmentKeys.includes(key))) {
      throw new Error("Runner environment keys are not in the product-owned executable registry.");
    }
    if (signal.aborted) {
      throw new Error("Conversion was cancelled before process start.");
    }
    const startedAt = Date.now();
    const child = this.processFactory(executable.absolutePath, args, { cwd: canonicalTempDirectory, env: environment });
    return new Promise<RunnerResult>((resolveResult, rejectResult) => {
      let settled = false;
      const timer = setTimeout(() => {
        child.kill();
        settleReject(new Error("Conversion exceeded the CPU-time limit."));
      }, request.adapter.resourceLimits.maxCpuMs);
      const cancel = () => {
        child.kill();
        settleReject(new Error("Conversion was cancelled."));
      };
      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        rejectResult(error);
      };
      signal.addEventListener("abort", cancel, { once: true });
      child.once("error", (error) => settleReject(error));
      child.once("exit", async (code) => {
        if (code !== 0) {
          settleReject(new Error(`Adapter process exited with code ${code ?? "unknown"}.`));
          return;
        }
        try {
          const outputInformation = await stat(request.outputPath);
          if (!outputInformation.isFile() || outputInformation.size > request.adapter.resourceLimits.maxOutputBytes) {
            throw new Error("Adapter output is missing or exceeds the output-byte limit.");
          }
          const output = new Uint8Array(await readFile(request.outputPath));
          const outputValidation = request.adapter.validateOutput(output, request.targetFormat);
          if (!outputValidation.valid) throw new Error(outputValidation.reason || "Adapter output validation failed.");
          await writeValidatedOutput(request.publishPath, output, (bytes) => request.adapter.validateOutput(bytes, request.targetFormat));
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", cancel);
          resolveResult({ output, elapsedMs: Date.now() - startedAt });
        } catch (error) {
          settleReject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }
}

export async function convertWithIsolatedRunner(
  request: RunnerRequest,
  runner: ProductOwnedIsolatedRunner,
  options: { confirmedLossiness?: boolean; signal?: AbortSignal } = {}
): Promise<Uint8Array> {
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

export async function measureDestinationFreeBytes(directory: string): Promise<number> {
  validateConversionPath(resolve(directory, "capacity.probe"));
  const information = await statfs(directory);
  const freeBytes = Number(information.bavail) * Number(information.bsize);
  if (!Number.isSafeInteger(freeBytes) || freeBytes < 0) {
    throw new Error("Volume capacity could not be measured safely.");
  }
  return freeBytes;
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
  validateConversionPath(destination);
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
    await renameWithRetry(fileSystem.rename, temporaryPath, destination);
    const reopened = new Uint8Array(await fileSystem.readFile(destination));
    const reopenedValidation = validator(reopened);
    if (!reopenedValidation.valid || reopened.byteLength !== output.byteLength) {
      throw new Error(reopenedValidation.reason || "Reopened output failed validation.");
    }
    return reopenedValidation;
  } catch (error) {
    await fileSystem.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function renameWithRetry(
  renameFile: AtomicFileSystem["rename"],
  source: string,
  destination: string,
  attempts = 5
): Promise<void> {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new Error("Rename retry attempts must be between 1 and 10.");
  }
  const transient = new Set(["EPERM", "EACCES", "EBUSY"]);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await renameFile(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !transient.has(code) || attempt === attempts - 1) {
        throw error;
      }
      await new Promise<void>((resolveWait) => setTimeout(resolveWait, 25 * (attempt + 1)));
    }
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
  if (pages.length === 0 || new Set(pages).size !== pages.length || pages.some((page) => !Number.isSafeInteger(page) || page < 1 || page > pageCount)) {
    throw new Error("PDF page selection is outside the document bounds.");
  }
}

export function createPdfOperationPlan(document: PdfDocumentState, operation: PdfOperation): PdfOperationPlan {
  assertValidPdfDocument(document);
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
      operation.documents.forEach(assertValidPdfDocument);
      const pageCount = operation.documents.reduce((total, item) => total + item.pageCount, 0);
      return { operation, writesOutput: true, expectedPageCount: pageCount, expectedMetadata: operation.documents[0]?.metadata };
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
  if (plan.expectedMetadata && !sameStringRecord(output.metadata, plan.expectedMetadata)) {
    return { valid: false, format: "pdf", reason: "PDF metadata does not match the requested operation." };
  }
  return { valid: true, format: "pdf" };
}

function sameStringRecord(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

export type PdfReader = {
  read: (input: Uint8Array, limits: ResourceLimits) => Promise<PdfDocumentState>;
};

export type PdfWriter = {
  write: (plan: PdfOperationPlan, limits: ResourceLimits) => Promise<Uint8Array>;
};

/**
 * Product-owned PDF boundary. The reader and writer are the only format
 * specific seams. Every source is parsed before planning, and the generated
 * bytes are parsed again before they can be returned to the caller.
 */
export class ProductOwnedPdfAdapter {
  private readonly reader: PdfReader;
  private readonly writer: PdfWriter;
  private readonly limits: ResourceLimits;

  constructor(reader: PdfReader, writer: PdfWriter, limits: ResourceLimits = DEFAULT_RESOURCE_LIMITS) {
    this.reader = reader;
    this.writer = writer;
    this.limits = limits;
  }

  async execute(inputs: readonly Uint8Array[], operation: PdfOperation): Promise<{ output?: Uint8Array; state: PdfDocumentState }> {
    if (inputs.length < 1 || inputs.length > this.limits.maxItems) {
      throw new Error("PDF input count exceeds the adapter limit.");
    }
    const documents: PdfDocumentState[] = [];
    for (const input of inputs) {
      assertResourceBounds(input.byteLength, this.limits);
      const document = await this.reader.read(input, this.limits);
      assertValidPdfDocument(document);
      documents.push(document);
    }
    const actualOperation: PdfOperation = operation.kind === "merge"
      ? { kind: "merge", documents }
      : operation;
    const plan = createPdfOperationPlan(documents[0], actualOperation);
    if (!plan.writesOutput) return { state: documents[0] };
    const output = await this.writer.write(plan, this.limits);
    assertResourceBounds(output.byteLength, { ...this.limits, maxInputBytes: this.limits.maxOutputBytes });
    const reopened = await this.reader.read(output, this.limits);
    assertValidPdfDocument(reopened);
    const validation = validatePdfPostWrite(plan, reopened);
    if (!validation.valid) throw new Error(validation.reason || "Reopened PDF output failed validation.");
    return { output, state: reopened };
  }
}

function assertValidPdfDocument(document: PdfDocumentState): void {
  if (!Number.isSafeInteger(document.pageCount) || document.pageCount < 1 || document.pageCount > DEFAULT_RESOURCE_LIMITS.maxItems) {
    throw new Error("PDF page count is outside the supported bounds.");
  }
  if (document.pageOrder.length !== document.pageCount || new Set(document.pageOrder).size !== document.pageCount || document.pageOrder.some((page) => page < 1 || page > document.pageCount)) {
    throw new Error("PDF page order is invalid.");
  }
  if (document.rotations.length !== document.pageCount || document.rotations.some((rotation) => ![0, 90, 180, 270].includes(rotation))) {
    throw new Error("PDF rotation metadata is invalid.");
  }
  if (Object.entries(document.metadata).some(([key, value]) => key.length > 256 || value.length > 4_096)) {
    throw new Error("PDF metadata exceeds the supported bounds.");
  }
}

export type QueueState = "queued" | "processing" | "completed" | "skipped" | "cancelled" | "failed";

export type ConversionJob = {
  id: string;
  sourcePath: string;
  destinationPath: string;
  adapterId: string;
  targetFormat: string;
  sourceBytes: number;
  estimatedOutputBytes: number;
  destinationFreeBytes: number;
  destinationReserveBytes: number;
  freeSpaceCheckedAt: string;
  state: QueueState;
  attempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  leaseOwner?: string;
  leaseNonce?: string;
  leaseExpiresAt?: string;
};

export type QueueLease = { owner: string; nonce: string };

export type QueuePage = { items: ConversionJob[]; nextCursor?: string };

export type DurableQueueStore = {
  append: (job: ConversionJob) => Promise<void>;
  claimNext: () => Promise<ConversionJob | undefined>;
  update: (id: string, update: Partial<ConversionJob>, lease?: QueueLease) => Promise<void>;
  heartbeat: (id: string, lease: QueueLease) => Promise<void>;
  listPage: (cursor: string | undefined, limit: number) => Promise<QueuePage>;
  recoverProcessing: () => Promise<number>;
  loadControl: () => Promise<QueueControl>;
  saveControl: (control: QueueControl) => Promise<void>;
};

export type QueueControl = { paused: boolean; cancelled: boolean; updatedAt: string };

export class InMemoryDurableQueueStore implements DurableQueueStore {
  private readonly jobs = new Map<string, ConversionJob>();
  private control: QueueControl = { paused: false, cancelled: false, updatedAt: new Date().toISOString() };
  private readonly owner = randomUUID();

  async append(job: ConversionJob): Promise<void> {
    if (!isValidQueueJob(job)) throw new Error("Queue record does not satisfy the runtime schema.");
    this.jobs.set(job.id, { ...job });
  }

  async claimNext(): Promise<ConversionJob | undefined> {
    const next = [...this.jobs.values()].find((job) => job.state === "queued");
    if (!next) {
      return undefined;
    }
    const claimed: ConversionJob = { ...next, state: "processing", attempts: next.attempts + 1, updatedAt: new Date().toISOString() };
    claimed.leaseOwner = this.owner;
    claimed.leaseNonce = randomUUID();
    claimed.leaseExpiresAt = new Date(Date.now() + 30_000).toISOString();
    this.jobs.set(next.id, claimed);
    return claimed;
  }

  async update(id: string, update: Partial<ConversionJob>, lease?: QueueLease): Promise<void> {
    const existing = this.jobs.get(id);
    if (!existing) {
      throw new Error(`Unknown queue item: ${id}`);
    }
    assertLease(existing, lease);
    const next = { ...existing, ...update, updatedAt: new Date().toISOString() };
    if (next.state !== "processing") {
      delete next.leaseOwner;
      delete next.leaseNonce;
      delete next.leaseExpiresAt;
    }
    if (!isValidQueueJob(next)) throw new Error("Queue update does not satisfy the runtime schema.");
    this.jobs.set(id, next);
  }

  async heartbeat(id: string, lease: QueueLease): Promise<void> {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error(`Unknown queue item: ${id}`);
    assertLease(existing, lease);
    this.jobs.set(id, { ...existing, leaseExpiresAt: new Date(Date.now() + 30_000).toISOString(), updatedAt: new Date().toISOString() });
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
        if (isLeaseExpired(job)) {
          this.jobs.set(job.id, { ...job, state: "queued", leaseOwner: undefined, leaseNonce: undefined, leaseExpiresAt: undefined, updatedAt: new Date().toISOString() });
          recovered += 1;
        }
      }
    }
    return recovered;
  }

  async loadControl(): Promise<QueueControl> { return { ...this.control }; }
  async saveControl(control: QueueControl): Promise<void> { this.control = { ...control, updatedAt: new Date().toISOString() }; }
}

/**
 * A file-backed store keeps one bounded JSON record per queue item. It scans
 * directory entries lazily, reads only the candidate record being inspected,
 * and replaces one record atomically on every state transition. Queue length
 * is therefore not coupled to one giant JSON document or an in-memory array.
 */
export class FileDurableQueueStore implements DurableQueueStore {
  private readonly directory: string;
  private readonly indexPath: string;
  private readonly controlPath: string;
  private readonly owner = randomUUID();
  private readonly leaseDurationMs: number;

  constructor(directory: string, leaseDurationMs = 30_000) {
    this.directory = directory;
    this.indexPath = resolve(directory, "queue.index");
    this.controlPath = resolve(directory, "queue.control.json");
    this.leaseDurationMs = leaseDurationMs;
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 100 || leaseDurationMs > 86_400_000) {
      throw new Error("Queue lease duration is outside the supported bounds.");
    }
    if (!isAbsolute(directory)) {
      throw new Error("Queue directory must be an absolute path.");
    }
  }

  async append(job: ConversionJob): Promise<void> {
    if (!isValidQueueJob(job)) throw new Error("Queue record does not satisfy the runtime schema.");
    await mkdir(this.directory, { recursive: true });
    await withFileLock(this.directory, async () => {
      await writeFile(this.recordPath(job.id), JSON.stringify(job), { encoding: "utf8", flag: "wx" });
      await writeFile(this.indexPath, `${job.id}\n`, { encoding: "utf8", flag: "a" });
    });
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
          claimed = { ...job, state: "processing", attempts: job.attempts + 1, updatedAt: new Date().toISOString(), leaseOwner: this.owner, leaseNonce: randomUUID(), leaseExpiresAt: new Date(Date.now() + this.leaseDurationMs).toISOString() };
          await this.writeRecord(claimed);
          break;
        }
      } finally {
        await directory.close().catch(() => undefined);
      }
    });
    return claimed;
  }

  async update(id: string, update: Partial<ConversionJob>, lease?: QueueLease): Promise<void> {
    await withFileLock(this.directory, async () => {
      const existing = await this.readRecord(`${id}.json`);
      if (!existing) {
        throw new Error(`Unknown queue item: ${id}`);
      }
      assertLease(existing, lease);
      const next = { ...existing, ...update, updatedAt: new Date().toISOString() };
      if (next.state !== "processing") {
        delete next.leaseOwner;
        delete next.leaseNonce;
        delete next.leaseExpiresAt;
      }
      if (!isValidQueueJob(next)) throw new Error("Queue update does not satisfy the runtime schema.");
      await this.writeRecord(next);
    });
  }

  async heartbeat(id: string, lease: QueueLease): Promise<void> {
    return withFileLock(this.directory, async () => {
      const existing = await this.readRecord(`${id}.json`);
      if (!existing) throw new Error(`Unknown queue item: ${id}`);
      assertLease(existing, lease);
      await this.writeRecord({ ...existing, leaseExpiresAt: new Date(Date.now() + this.leaseDurationMs).toISOString(), updatedAt: new Date().toISOString() });
    });
  }

  async listPage(cursor: string | undefined, limit: number): Promise<QueuePage> {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1_000) {
      throw new Error("Queue page size must be between 1 and 1000.");
    }
    const items: ConversionJob[] = [];
    let foundCursor = cursor === undefined;
    let nextCursor: string | undefined;
    let indexStream;
    try {
      indexStream = createInterface({ input: createReadStream(this.indexPath, { encoding: "utf8" }), crlfDelay: Infinity });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { items };
      throw error;
    }
    try {
      for await (const line of indexStream) {
        const id = String(line).trim();
        if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
        const job = await this.readRecord(`${id}.json`);
        if (!job) continue;
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
      indexStream.close();
    }
    return { items, nextCursor };
  }

  async recoverProcessing(): Promise<number> {
    return withFileLock(this.directory, async () => {
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
          if (job?.state === "processing" && isLeaseExpired(job)) {
            await this.writeRecord({ ...job, state: "queued", leaseOwner: undefined, leaseNonce: undefined, leaseExpiresAt: undefined, updatedAt: new Date().toISOString() });
            recovered += 1;
          }
        }
      } finally {
        await directory.close().catch(() => undefined);
      }
      return recovered;
    });
  }

  async loadControl(): Promise<QueueControl> {
    try {
      const value = JSON.parse(await readFile(this.controlPath, "utf8")) as QueueControl;
      if (!isValidQueueControl(value)) throw new Error("invalid control");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { paused: false, cancelled: false, updatedAt: new Date().toISOString() };
      throw new Error("Queue control record is invalid.");
    }
  }

  async saveControl(control: QueueControl): Promise<void> {
    if (!isValidQueueControl(control)) throw new Error("Queue control record is invalid.");
    await mkdir(this.directory, { recursive: true });
    await withFileLock(this.directory, async () => {
      const temporaryPath = `${this.controlPath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, JSON.stringify({ ...control, updatedAt: new Date().toISOString() }), { encoding: "utf8", flag: "wx" });
      try {
        await renameWithRetry(rename, temporaryPath, this.controlPath);
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
      }
    });
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
      const expectedId = fileName.slice(0, -5);
      if (!isValidQueueJob(record) || record.id !== expectedId) {
        throw new Error("record schema mismatch");
      }
      return record;
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
      await renameWithRetry(rename, temporaryPath, destination);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async withClaimLock<T>(operation: () => Promise<T>): Promise<T> {
    return withFileLock(this.directory, operation);
  }
}

async function withFileLock<T>(directory: string, operation: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true });
  const lockPath = resolve(directory, ".queue.lock");
  let handle;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      handle = await open(lockPath, "wx");
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" || attempt === 39) throw error;
      try {
        const lockInformation = await stat(lockPath);
        if (Date.now() - lockInformation.mtimeMs > 10_000) {
          await rm(lockPath, { force: true });
          continue;
        }
      } catch {
        // Another process may have released the lease between stat and rm.
      }
      await new Promise<void>((resolveWait) => setTimeout(resolveWait, 10));
    }
  }
  if (!handle) throw new Error("Queue lock could not be acquired.");
  try {
    return await operation();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true }).catch(() => undefined);
  }
}

export type ConversionProcessor = (job: ConversionJob, signal: AbortSignal) => Promise<"completed" | "skipped">;

export class DurableConversionQueue {
  private paused = false;
  private cancelled = false;
  private readonly running = new Map<string, AbortController>();
  private readonly store: DurableQueueStore;
  private readonly concurrency: number;
  private readonly freeSpaceProbe: (directory: string) => Promise<number>;

  constructor(store: DurableQueueStore, concurrency = 2, freeSpaceProbe?: (directory: string) => Promise<number>) {
    this.store = store;
    this.concurrency = concurrency;
    this.freeSpaceProbe = freeSpaceProbe || measureDestinationFreeBytes;
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) {
      throw new Error("Queue concurrency must be between 1 and 32.");
    }
  }

  async enqueue(input: Omit<ConversionJob, "id" | "state" | "attempts" | "createdAt" | "updatedAt" | "destinationFreeBytes" | "freeSpaceCheckedAt">): Promise<string> {
    assertPathPair(input.sourcePath, input.destinationPath);
    validateConversionPath(input.sourcePath);
    validateConversionPath(input.destinationPath);
    await assertNoReparsePath(input.sourcePath);
    await assertNoReparsePath(input.destinationPath);
    if (!Number.isSafeInteger(input.sourceBytes) || input.sourceBytes < 0) {
      throw new Error("Queue source byte count must be a non-negative safe integer.");
    }
    const measuredFreeBytes = await this.freeSpaceProbe(dirname(input.destinationPath));
    const storage = preflightDestinationStorage({
      requiredBytes: input.estimatedOutputBytes,
      freeBytes: measuredFreeBytes,
      safetyReserveBytes: input.destinationReserveBytes
    });
    if (!storage.accepted) throw new Error(storage.reason || "Destination storage preflight failed.");
    const now = new Date().toISOString();
    const id = randomUUID();
    await this.store.append({ ...input, destinationFreeBytes: measuredFreeBytes, freeSpaceCheckedAt: now, id, state: "queued", attempts: 0, createdAt: now, updatedAt: now });
    return id;
  }

  async pause(): Promise<void> {
    this.paused = true;
    await this.store.saveControl({ paused: true, cancelled: this.cancelled, updatedAt: new Date().toISOString() });
  }

  async resume(): Promise<void> {
    this.paused = false;
    this.cancelled = false;
    await this.store.saveControl({ paused: false, cancelled: false, updatedAt: new Date().toISOString() });
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
    await this.store.saveControl({ paused: this.paused, cancelled: true, updatedAt: new Date().toISOString() });
  }

  async recoverAfterCrash(): Promise<number> {
    return this.store.recoverProcessing();
  }

  async page(cursor: string | undefined, limit = 100): Promise<QueuePage> {
    return this.store.listPage(cursor, limit);
  }

  async process(processor: ConversionProcessor): Promise<void> {
    const control = await this.store.loadControl();
    this.paused = control.paused;
    this.cancelled = control.cancelled;
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
      const lease = job.leaseOwner && job.leaseNonce ? { owner: job.leaseOwner, nonce: job.leaseNonce } : undefined;
      const heartbeat = lease ? setInterval(() => {
        void this.store.heartbeat(job.id, lease).catch(() => controller.abort());
      }, 1_000) : undefined;
      try {
        const freeBytes = await this.freeSpaceProbe(dirname(job.destinationPath));
        const storage = preflightDestinationStorage({
          requiredBytes: job.estimatedOutputBytes,
          freeBytes,
          safetyReserveBytes: job.destinationReserveBytes
        });
        if (!storage.accepted) {
          await this.store.update(job.id, { state: "failed", error: storage.reason || "Destination storage preflight failed." }, lease);
          continue;
        }
        const outcome = await processor(job, controller.signal);
        await this.store.update(job.id, { state: controller.signal.aborted || this.cancelled ? "cancelled" : outcome }, lease);
      } catch (error) {
        const state: QueueState = controller.signal.aborted || this.cancelled ? "cancelled" : "failed";
        await this.store.update(job.id, { state, error: error instanceof Error ? error.message : String(error) }, lease);
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        this.running.delete(job.id);
      }
    }
  }
}

const QUEUE_JOB_KEYS = new Set([
  "id", "sourcePath", "destinationPath", "adapterId", "targetFormat", "sourceBytes",
  "estimatedOutputBytes", "destinationFreeBytes", "destinationReserveBytes", "freeSpaceCheckedAt",
  "state", "attempts", "error", "createdAt", "updatedAt", "leaseOwner", "leaseNonce", "leaseExpiresAt"
]);

function isValidQueueJob(value: unknown): value is ConversionJob {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !QUEUE_JOB_KEYS.has(key))) return false;
  const requiredStrings = ["id", "sourcePath", "destinationPath", "adapterId", "targetFormat", "freeSpaceCheckedAt", "createdAt", "updatedAt"];
  if (requiredStrings.some((key) => typeof record[key] !== "string")) return false;
  if (!/^[0-9a-f-]{36}$/i.test(record.id as string)) return false;
  if (!isAbsolute(record.sourcePath as string) || !isAbsolute(record.destinationPath as string)) return false;
  try {
    validateConversionPath(record.sourcePath as string);
    validateConversionPath(record.destinationPath as string);
  } catch {
    return false;
  }
  if (!["queued", "processing", "completed", "skipped", "cancelled", "failed"].includes(record.state as string)) return false;
  if (record.error !== undefined && typeof record.error !== "string") return false;
  if (record.leaseOwner !== undefined && typeof record.leaseOwner !== "string") return false;
  if (record.leaseNonce !== undefined && typeof record.leaseNonce !== "string") return false;
  if (record.leaseExpiresAt !== undefined && typeof record.leaseExpiresAt !== "string") return false;
  return ["sourceBytes", "estimatedOutputBytes", "destinationFreeBytes", "destinationReserveBytes", "attempts"].every((key) => Number.isSafeInteger(record[key]) && (record[key] as number) >= 0);
}

function assertLease(job: ConversionJob, lease: QueueLease | undefined): void {
  if (job.state !== "processing") return;
  if (!lease || lease.owner !== job.leaseOwner || lease.nonce !== job.leaseNonce || isLeaseExpired(job)) {
    throw new Error("Queue lease is missing, expired, or owned by another process.");
  }
}

function isLeaseExpired(job: ConversionJob): boolean {
  return typeof job.leaseExpiresAt !== "string" || Date.parse(job.leaseExpiresAt) <= Date.now();
}

function isValidQueueControl(value: unknown): value is QueueControl {
  return Boolean(value && typeof value === "object" && typeof (value as QueueControl).paused === "boolean" && typeof (value as QueueControl).cancelled === "boolean" && typeof (value as QueueControl).updatedAt === "string");
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

export function validateConversionPath(filePath: string): void {
  if (!isAbsolute(filePath) || !filePath.trim()) {
    throw new Error("Conversion paths must be absolute.");
  }
  const normalized = filePath.replaceAll("/", "\\");
  if (/^(?:\\\\|\\\\[?.]|\\\\\.\\)/.test(normalized) || /^\\\\device\\/i.test(normalized)) {
    throw new Error("Device and UNC paths are not allowed.");
  }
  const afterDrive = /^[A-Za-z]:/.test(normalized) ? normalized.slice(2) : normalized;
  if (afterDrive.includes(":")) {
    throw new Error("Alternate data stream paths are not allowed.");
  }
  const leaf = normalized.split("\\").at(-1) || "";
  const stem = leaf.split(".")[0]?.toUpperCase() || "";
  if (["CON", "PRN", "AUX", "NUL", "CLOCK$", ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`), ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`)].includes(stem)) {
    throw new Error("Reserved device names are not allowed.");
  }
  if (/[. ]$/.test(leaf) || /[<>"|?*]/.test(leaf)) {
    throw new Error("Conversion path contains an unsupported filename form.");
  }
}

export async function assertNoReparsePath(filePath: string): Promise<void> {
  validateConversionPath(filePath);
  const absolute = resolve(filePath);
  const root = parse(absolute).root;
  const parts = relative(root, absolute).split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    try {
      const information = await lstat(current);
      if (information.isSymbolicLink()) {
        throw new Error("Symlink or reparse path components are not allowed.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
}

export function pathWithinRoots(filePath: string, roots: readonly string[]): boolean {
  const candidate = resolve(filePath);
  return roots.some((root) => {
    const normalizedRoot = resolve(root);
    const remainder = relative(normalizedRoot, candidate);
    return remainder === "" || (remainder !== ".." && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder));
  });
}

async function assertCanonicalContainment(inputPath: string, outputPath: string, roots: readonly string[]): Promise<void> {
  const canonicalRoots = await Promise.all(roots.map((root) => realpath(root)));
  const canonicalInput = await realpath(inputPath);
  let canonicalOutput: string;
  try {
    canonicalOutput = await realpath(outputPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    canonicalOutput = resolve(await realpath(dirname(outputPath)), basename(outputPath));
  }
  if (!pathWithinRoots(canonicalInput, canonicalRoots) || !pathWithinRoots(canonicalOutput, canonicalRoots)) {
    throw new Error("Canonical input and output paths must remain inside the configured containment roots.");
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

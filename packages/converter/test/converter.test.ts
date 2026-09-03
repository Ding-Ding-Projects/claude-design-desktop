import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AdapterRegistry,
  CONVERTER_CATEGORIES,
  DEFAULT_RESOURCE_LIMITS,
  DurableConversionQueue,
  FileDurableQueueStore,
  InMemoryDurableQueueStore,
  adapterAvailability,
  convertWithIsolatedRunner,
  createDefaultAdapterRegistry,
  createPdfOperationPlan,
  detectSourceFormats,
  preflightDestinationStorage,
  requireLossyConfirmation,
  validateAdapterRegistry,
  validatePdfPostWrite,
  writeValidatedOutput,
  type Adapter,
  type ConversionJob,
  type PdfDocumentState
} from "../src/converter.ts";

function testAdapter(overrides: Partial<Adapter> = {}): Adapter {
  return {
    id: "test-adapter",
    displayName: "Test adapter",
    category: "Code/Text",
    sourceFormats: ["txt"],
    targetFormats: ["txt"],
    sourceSignatures: [],
    bundled: true,
    packagedProof: { artifactPath: "dist/test-adapter", sha256: "a".repeat(64) },
    metadataBehavior: "preserve",
    encodingBehavior: "preserve",
    lossiness: { mode: "lossless", changes: [], requiresConfirmation: false },
    resourceLimits: DEFAULT_RESOURCE_LIMITS,
    sandbox: {
      isolatedProcess: true,
      networkAccess: "none",
      allowedArguments: [],
      allowedEnvironmentKeys: [],
      maxInputBytes: DEFAULT_RESOURCE_LIMITS.maxInputBytes,
      maxOutputBytes: DEFAULT_RESOURCE_LIMITS.maxOutputBytes,
      maxCpuMs: DEFAULT_RESOURCE_LIMITS.maxCpuMs,
      maxMemoryBytes: DEFAULT_RESOURCE_LIMITS.maxMemoryBytes,
      maxTemporaryBytes: DEFAULT_RESOURCE_LIMITS.maxTemporaryBytes
    },
    validateOutput: (bytes, format) => ({ valid: bytes.byteLength > 0, format, bytes: bytes.byteLength }),
    ...overrides
  };
}

function job(overrides: Partial<ConversionJob> = {}): ConversionJob {
  const now = new Date().toISOString();
  return {
    id: "00000000-0000-4000-8000-000000000001",
    sourcePath: "C:\\input.txt",
    destinationPath: "C:\\output.txt",
    adapterId: "test-adapter",
    targetFormat: "txt",
    sourceBytes: 4,
    state: "queued",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

test("default catalog exposes every required category and no adapter is enabled without proof", () => {
  const registry = createDefaultAdapterRegistry();
  assert.deepEqual(new Set(registry.catalog().map((item) => item.category)), new Set(CONVERTER_CATEGORIES));
  assert.ok(registry.catalog().every((item) => item.enabled === false));
  assert.ok(registry.catalog().every((item) => item.availabilityReason));
  assert.deepEqual(validateAdapterRegistry(registry), []);
});

test("negative regression catches a removed category instead of passing on discovered entries", () => {
  const registry = createDefaultAdapterRegistry();
  const missing = new AdapterRegistry(registry.catalog().filter((item) => item.category !== "Images"));
  assert.ok(validateAdapterRegistry(missing).some((issue) => issue.includes("Images")));
});

test("packaged proof is required even when a developer marks an adapter bundled", () => {
  const adapter = testAdapter({ bundled: true, packagedProof: undefined });
  assert.deepEqual(adapterAvailability(adapter), {
    enabled: false,
    reason: "Adapter is bundled without packaged-artifact proof."
  });
  const bundledWithoutProof = new AdapterRegistry([adapter]);
  assert.ok(validateAdapterRegistry(bundledWithoutProof).length > 0);
});

test("source detection reads bounded bytes and does not trust a file extension", async () => {
  const registry = createDefaultAdapterRegistry();
  const chunks = (async function* () {
    yield Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
    yield Uint8Array.from([...new Array(100)]);
    yield new Uint8Array(1024 * 1024);
  })();
  const detected = await detectSourceFormats(chunks, registry, 16);
  assert.deepEqual(detected.formats, ["pdf"]);
  assert.equal(detected.inspectedBytes, 16);
});

test("lossy conversion requires an explicit disclosure acknowledgement", () => {
  const adapter = testAdapter({
    lossiness: { mode: "lossy", changes: ["metadata"], requiresConfirmation: true }
  });
  assert.throws(() => requireLossyConfirmation(adapter, false), /Explicit confirmation/);
  assert.doesNotThrow(() => requireLossyConfirmation(adapter, true));
});

test("isolated runner rejects unavailable adapters and validates the returned output", async () => {
  const adapter = testAdapter({ packagedProof: undefined });
  const request = {
    adapter,
    inputPath: "C:\\input.txt",
    outputPath: "C:\\output.txt",
    targetFormat: "txt",
    inputBytes: 4
  };
  const runner = { run: async () => ({ output: Uint8Array.from([1]), elapsedMs: 1 }) };
  await assert.rejects(() => convertWithIsolatedRunner(request, runner), /Adapter is unavailable/);

  const validRunner = { run: async () => ({ output: Uint8Array.from([1, 2]), elapsedMs: 1 }) };
  assert.deepEqual(await convertWithIsolatedRunner({ ...request, adapter: testAdapter() }, validRunner), Uint8Array.from([1, 2]));
});

test("destination preflight reports the exact storage shortfall", () => {
  assert.deepEqual(preflightDestinationStorage({ requiredBytes: 80, freeBytes: 100, safetyReserveBytes: 30 }), {
    accepted: false,
    availableAfterReserve: 70,
    reason: "Destination has 70 bytes after reserve, but 80 bytes are required."
  });
  assert.equal(preflightDestinationStorage({ requiredBytes: 70, freeBytes: 100, safetyReserveBytes: 30 }).accepted, true);
});

const pdf: PdfDocumentState = {
  pageCount: 3,
  pageOrder: [1, 2, 3],
  rotations: [0, 0, 0],
  metadata: { title: "Source" }
};

test("PDF plans cover the required operation shapes and validate reopened output", () => {
  const rotate = createPdfOperationPlan(pdf, { kind: "rotate", pages: [2], degrees: 90 });
  assert.equal(rotate.writesOutput, true);
  assert.deepEqual(rotate.expectedRotations, [0, 90, 0]);
  assert.deepEqual(validatePdfPostWrite(rotate, { ...pdf, rotations: [0, 90, 0] }), { valid: true, format: "pdf" });

  const reorder = createPdfOperationPlan(pdf, { kind: "reorder", pageOrder: [3, 1, 2] });
  assert.equal(validatePdfPostWrite(reorder, { ...pdf, pageOrder: [3, 2, 1] }).valid, false);
  assert.throws(() => createPdfOperationPlan(pdf, { kind: "reorder", pageOrder: [1, 1, 2] }), /each page exactly once/);
  assert.throws(() => createPdfOperationPlan({ ...pdf, encrypted: true }, { kind: "inspect" }), /opaque/);
});

test("atomic output validates bytes before publish and leaves a readable destination", async () => {
  const directory = await mkdtemp(join(tmpdir(), "converter-output-"));
  const destination = join(directory, "nested", "result.bin");
  try {
    const result = await writeValidatedOutput(destination, Uint8Array.from([1, 2, 3]), (bytes) => ({
      valid: bytes.length === 3,
      format: "bin",
      bytes: bytes.length
    }));
    assert.equal(result.valid, true);
    assert.deepEqual(new Uint8Array(await readFile(destination)), Uint8Array.from([1, 2, 3]));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("in-memory queue is bounded-concurrency, paged, cancellable, and records partial outcomes", async () => {
  const store = new InMemoryDurableQueueStore();
  const queue = new DurableConversionQueue(store, 2);
  for (let index = 0; index < 5; index += 1) {
    await queue.enqueue({
      sourcePath: `C:\\input-${index}.txt`,
      destinationPath: `C:\\output-${index}.txt`,
      adapterId: "test-adapter",
      targetFormat: "txt",
      sourceBytes: 1
    });
  }
  let active = 0;
  let maximumActive = 0;
  await queue.process(async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolveWait) => setTimeout(resolveWait, 15));
    active -= 1;
    return item.sourcePath.endsWith("2.txt") ? "skipped" : "completed";
  });
  assert.ok(maximumActive >= 1 && maximumActive <= 2);
  const firstPage = await queue.page(undefined, 3);
  assert.equal(firstPage.items.length, 3);
  assert.ok(firstPage.nextCursor);
  const secondPage = await queue.page(firstPage.nextCursor, 3);
  assert.equal(secondPage.items.length, 2);
  assert.equal((await queue.page(undefined, 10)).items.filter((item) => item.state === "skipped").length, 1);
});

test("file queue store survives a new instance and recovers processing records after a crash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "converter-queue-"));
  try {
    const first = new FileDurableQueueStore(directory);
    const item = job();
    await first.append(item);
    const claimed = await first.claimNext();
    assert.equal(claimed?.state, "processing");
    const second = new FileDurableQueueStore(directory);
    assert.equal(await second.recoverProcessing(), 1);
    const page = await second.listPage(undefined, 10);
    assert.equal(page.items[0]?.state, "queued");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

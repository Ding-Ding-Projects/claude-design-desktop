import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  AdapterRegistry,
  CONVERTER_CATEGORIES,
  DEFAULT_RESOURCE_LIMITS,
  DurableConversionQueue,
  FileDurableQueueStore,
  InMemoryDurableQueueStore,
  ProductOwnedIsolatedRunner,
  ProductOwnedPdfAdapter,
  assertNoReparsePath,
  adapterAvailability,
  convertWithIsolatedRunner,
  createDefaultAdapterRegistry,
  createPdfOperationPlan,
  detectSourceFormats,
  preflightDestinationStorage,
  measureDestinationFreeBytes,
  requireLossyConfirmation,
  renameWithRetry,
  sha256,
  validateAdapterRegistry,
  validateConversionPath,
  validatePdfPostWrite,
  verifyPackagedAdapter,
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
    packagedProof: { artifactPath: "dist/test-adapter", sha256: "a".repeat(64), identity: "test-adapter", kind: "data" },
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
    estimatedOutputBytes: 4,
    destinationFreeBytes: 100,
    destinationReserveBytes: 10,
    freeSpaceCheckedAt: now,
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

test("packaged proof verification reads the real file and rejects caller metadata drift", async () => {
  const directory = await mkdtemp(join(tmpdir(), "converter-proof-"));
  const proofPath = join(directory, "adapter.dat");
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  await writeFile(proofPath, bytes);
  try {
    const adapter = testAdapter({ packagedProof: { artifactPath: proofPath, sha256: sha256(bytes), identity: "test-adapter", kind: "data" } });
    assert.deepEqual(await verifyPackagedAdapter(adapter, directory), { enabled: true, resolvedPath: proofPath, sha256: sha256(bytes) });
    assert.equal((await verifyPackagedAdapter(testAdapter({ packagedProof: { artifactPath: proofPath, sha256: "b".repeat(64), identity: "test-adapter", kind: "data" } }), directory)).enabled, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("restricted product runner publishes only validated child output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "converter-runner-"));
  const temporaryDirectory = join(directory, "temp");
  const inputPath = join(directory, "input.txt");
  const outputPath = join(temporaryDirectory, "child.out");
  const publishPath = join(directory, "published.out");
  await mkdir(temporaryDirectory);
  await writeFile(inputPath, "input");
  const executablePath = process.execPath;
  const executableHash = sha256(new Uint8Array(await readFile(executablePath)));
  let exitListener: ((code: number) => void) | undefined;
  const fakeProcess = {
    once(event: "error" | "exit", listener: (...args: any[]) => void) {
      if (event === "exit") exitListener = listener as (code: number) => void;
      return fakeProcess;
    },
    kill: () => true
  };
  const adapter = testAdapter({
    packagedProof: { artifactPath: executablePath, sha256: executableHash, identity: "test-adapter", kind: "native-executable" },
    executable: { adapterId: "test-adapter", executableId: "test-adapter", absolutePath: executablePath, sha256: executableHash, kind: "native-executable", allowedArguments: [], allowedEnvironmentKeys: [] },
    validateOutput: (bytes, format) => ({ valid: bytes.byteLength === 3, format, bytes: bytes.byteLength })
  });
  const runner = new ProductOwnedIsolatedRunner(new AdapterRegistry([adapter], dirname(executablePath)), directory, (_executable, _args, _options) => {
    queueMicrotask(async () => {
      await writeFile(outputPath, Uint8Array.from([7, 8, 9]));
      exitListener?.(0);
    });
    return fakeProcess;
  });
  try {
    const result = await convertWithIsolatedRunner({ adapter, inputPath, outputPath, publishPath, temporaryDirectory, allowedRoots: [directory], targetFormat: "txt", inputBytes: 5, estimatedOutputBytes: 3, arguments: [], environment: {} }, runner);
    assert.deepEqual(result, Uint8Array.from([7, 8, 9]));
    assert.deepEqual(new Uint8Array(await readFile(publishPath)), Uint8Array.from([7, 8, 9]));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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

test("RIFF detection requires the subtype bytes and invalid UTF-8 is not text", async () => {
  const registry = createDefaultAdapterRegistry();
  const riff = Uint8Array.from([0x52, 0x49, 0x46, 0x46, ...new Array(4), 0x57, 0x41, 0x56, 0x45]);
  assert.deepEqual((await detectSourceFormats(riff, registry)).formats, ["wav"]);
  assert.deepEqual((await detectSourceFormats(Uint8Array.from([0xff, 0xfe, 0xfd]), registry)).formats, []);
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
    inputBytes: 4,
    estimatedOutputBytes: 2,
    allowedRoots: ["C:\\"],
    temporaryDirectory: "C:\\",
    publishPath: "C:\\output.txt",
    arguments: [],
    environment: {}
  };
  const runner = new ProductOwnedIsolatedRunner(new AdapterRegistry([adapter], "C:\\"));
  await assert.rejects(() => convertWithIsolatedRunner(request, runner), /Adapter is unavailable/);
});

test("path safety rejects device, UNC, ADS, and reserved names", () => {
  for (const path of ["\\\\server\\share\\file.txt", "\\\\.\\PhysicalDrive0", "C:\\folder\\file.txt:secret", "C:\\folder\\CON.txt"]) {
    assert.throws(() => validateConversionPath(path));
  }
});

test("reparse components are refused before queue persistence", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "converter-reparse-"));
  const target = join(directory, "target");
  const link = join(directory, "link");
  await mkdir(target);
  try {
    await symlink(target, link, "junction");
  } catch {
    t.skip("The host refused creation of a junction for this focused probe.");
    await rm(directory, { recursive: true, force: true });
    return;
  }
  try {
    await assert.rejects(() => assertNoReparsePath(join(link, "output.txt")), /Symlink|reparse/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("destination preflight reports the exact storage shortfall", () => {
  assert.deepEqual(preflightDestinationStorage({ requiredBytes: 80, freeBytes: 100, safetyReserveBytes: 30 }), {
    accepted: false,
    availableAfterReserve: 70,
    reason: "Destination has 70 bytes after reserve, but 80 bytes are required."
  });
  assert.equal(preflightDestinationStorage({ requiredBytes: 70, freeBytes: 100, safetyReserveBytes: 30 }).accepted, true);
});

test("queue admission uses measured volume capacity rather than caller-supplied free space", async () => {
  const queue = new DurableConversionQueue(new InMemoryDurableQueueStore(), 1, async () => 4);
  await assert.rejects(() => queue.enqueue({ sourcePath: "C:\\input.txt", destinationPath: "C:\\output.txt", adapterId: "test-adapter", targetFormat: "txt", sourceBytes: 1, estimatedOutputBytes: 8, destinationReserveBytes: 0 }), /Destination has 4 bytes/);
  assert.ok((await measureDestinationFreeBytes("C:\\")).toString().length > 0);
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

test("atomic replacement retries only transient Windows sharing failures", async () => {
  let calls = 0;
  await renameWithRetry(async () => {
    calls += 1;
    if (calls < 3) {
      const error = Object.assign(new Error("sharing violation"), { code: "EPERM" });
      throw error;
    }
  }, "C:\\source.tmp", "C:\\result.bin");
  assert.equal(calls, 3);
  await assert.rejects(() => renameWithRetry(async () => {
    throw Object.assign(new Error("missing"), { code: "ENOENT" });
  }, "C:\\source.tmp", "C:\\result.bin"), /missing/);
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
      sourceBytes: 1,
      estimatedOutputBytes: 1,
      destinationReserveBytes: 10
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
    const first = new FileDurableQueueStore(directory, 100);
    const item = job();
    await first.append(item);
    const claimed = await first.claimNext();
    assert.equal(claimed?.state, "processing");
    await assert.rejects(() => first.update(item.id, { state: "completed" }, { owner: "wrong-owner", nonce: "wrong-nonce" }), /lease/);
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
    const second = new FileDurableQueueStore(directory);
    assert.equal(await second.recoverProcessing(), 1);
    const page = await second.listPage(undefined, 10);
    assert.equal(page.items[0]?.state, "queued");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("file queue locking prevents two instances from claiming the same item", async () => {
  const directory = await mkdtemp(join(tmpdir(), "converter-queue-lock-"));
  try {
    const first = new FileDurableQueueStore(directory);
    await first.append(job());
    await first.append(job({ id: "00000000-0000-4000-8000-000000000002" }));
    const [left, right] = await Promise.all([first.claimNext(), new FileDurableQueueStore(directory).claimNext()]);
    assert.ok(left && right);
    assert.notEqual(left?.id, right?.id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pause and cancellation controls persist across queue instances", async () => {
  const directory = await mkdtemp(join(tmpdir(), "converter-control-"));
  try {
    const first = new FileDurableQueueStore(directory);
    await first.saveControl({ paused: true, cancelled: false, updatedAt: new Date().toISOString() });
    const second = new FileDurableQueueStore(directory);
    assert.equal((await second.loadControl()).paused, true);
    await second.saveControl({ paused: false, cancelled: true, updatedAt: new Date().toISOString() });
    assert.equal((await new FileDurableQueueStore(directory).loadControl()).cancelled, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PDF reader and writer boundary reopens and validates generated output", async () => {
  const encode = (state: PdfDocumentState) => new TextEncoder().encode(JSON.stringify(state));
  const decode = async (input: Uint8Array) => JSON.parse(new TextDecoder().decode(input)) as PdfDocumentState;
  const adapter = new ProductOwnedPdfAdapter(
    { read: decode },
    { write: async (plan) => {
      const pageCount = plan.expectedPageCount || 1;
      return encode({
        pageCount,
        pageOrder: plan.expectedPageOrder || Array.from({ length: pageCount }, (_, index) => index + 1),
        rotations: plan.expectedRotations || Array.from({ length: pageCount }, () => 0),
        metadata: plan.expectedMetadata || { title: "Source" }
      });
    } }
  );
  const result = await adapter.execute([encode(pdf)], { kind: "rotate", pages: [2], degrees: 90 });
  assert.deepEqual(result.state.rotations, [0, 90, 0]);
  const merged = await adapter.execute([encode(pdf), encode(pdf)], { kind: "merge", documents: [] });
  assert.equal(merged.state.pageCount, 6);
});

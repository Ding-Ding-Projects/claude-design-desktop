import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AtomicUpdaterStore, UpdaterStateMachine, assertSafeTransportTarget, compareSemanticVersions,
  createSquirrelWindowsHandoff, validateUpdateMetadata, type Body, type PersistedUpdaterState, type StageResult, type UpdateMetadata, type UpdaterStore
} from "../src/updater.ts";

const feedUrl = "https://updates.example.test/claude-design.json";
const optionsBase = { allowedHosts: ["updates.example.test"], currentVersion: "1.2.3", feedUrl } as const;
const packageBytes = new TextEncoder().encode("valid installer bytes");
const hash = createHash("sha256").update(packageBytes).digest("hex");

function metadata(overrides: Partial<UpdateMetadata> = {}): UpdateMetadata {
  return {
    package: { architecture: "x64", platform: "win32", sha256: hash, sizeBytes: packageBytes.byteLength, url: "https://updates.example.test/claude-design-1.2.4.exe" },
    releaseNotesUrl: "https://updates.example.test/releases/1.2.4", schemaVersion: 1, updatedAt: "2026-09-02T15:00:00Z", version: "1.2.4", ...overrides
  };
}
function memoryStore(): UpdaterStore & { saved: PersistedUpdaterState[]; staged?: Uint8Array } {
  const value: UpdaterStore & { saved: PersistedUpdaterState[]; staged?: Uint8Array } = {
    saved: [], load: () => value.saved.at(-1),
    save: (state) => value.saved.push(state),
    stage: async (_metadata, body) => {
      const chunks: Uint8Array[] = [];
      if (body instanceof Uint8Array) chunks.push(body);
      else for await (const chunk of body) chunks.push(chunk);
      const bytes = body instanceof Uint8Array ? body : new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
      if (!(body instanceof Uint8Array)) {
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== _metadata.package.sizeBytes) throw new Error("Downloaded package size mismatch.");
      if (sha256 !== _metadata.package.sha256) throw new Error("Downloaded package SHA-256 does not match feed metadata.");
      value.staged = bytes;
      return { sha256, sizeBytes: bytes.byteLength } as StageResult;
    }
  };
  return value;
}
function feedFor(value: UpdateMetadata): Promise<{ body: Uint8Array; status: number }> {
  return Promise.resolve({ body: new TextEncoder().encode(JSON.stringify(value)), status: 200 });
}

test("semantic versions are monotonic and prereleases sort before stable", () => {
  assert.equal(compareSemanticVersions("1.2.4", "1.2.3"), 1);
  assert.equal(compareSemanticVersions("1.2.3-beta.2", "1.2.3-beta.10"), -1);
  assert.equal(compareSemanticVersions("1.2.3", "1.2.3-rc.1"), 1);
  assert.equal(compareSemanticVersions("1.2.3-400", "1.2.3-401"), -1);
  assert.equal(compareSemanticVersions("1.2.3-401", "1.2.3-400"), 1);
  assert.equal(compareSemanticVersions("1." + "9".repeat(1024) + ".0", "1.0.0"), 1);
  assert.throws(() => compareSemanticVersions("1.2.3-01", "1.2.3"), /leading-zero/);
});
test("transport rejects credentials, unsafe address classes, non-HTTPS, and non-allowlisted hosts", async () => {
  const security = { allowedHosts: ["updates.example.test"], timeoutMs: 5_000, resolveHost: async () => ["93.184.216.34"] };
  await assert.rejects(() => assertSafeTransportTarget("https://user:pass@updates.example.test/a", security, "Feed"), /HTTPS/);
  for (const address of ["0.0.0.0", "127.0.0.1", "100.64.0.1", "169.254.169.254", "192.0.0.1", "192.0.2.1", "198.18.0.1", "224.0.0.1", "::", "::1", "::ffff:93.184.216.34", "fc00::1", "fe80::1", "ff02::1"]) {
    await assert.rejects(() => assertSafeTransportTarget("https://updates.example.test/a", { ...security, resolveHost: async () => [address] }, "Feed"), /unsafe|reserved/);
  }
  await assert.rejects(() => assertSafeTransportTarget("http://updates.example.test/a", security, "Feed"), /HTTPS/);
  await assert.rejects(() => assertSafeTransportTarget("https://other.example.test/a", security, "Feed"), /allowlisted/);
});
test("startup check and staged download produce a persistent ready banner", async () => {
  const store = memoryStore();
  const machine = new UpdaterStateMachine({ ...optionsBase, downloadPackage: async () => packageBytes, fetchFeed: async () => feedFor(metadata()), restart: () => undefined, store });
  assert.equal((await machine.startupCheck()).state, "available");
  assert.equal((await machine.download()).state, "ready");
  assert.deepEqual(machine.state.banner?.actions, ["restart-to-install", "later"]);
  assert.equal(machine.state.banner?.unsignedWarning.includes("unsigned"), true);
  assert.deepEqual(store.staged, packageBytes);
});
test("same-size hash mutation is refused and never staged", async () => {
  const store = memoryStore();
  const machine = new UpdaterStateMachine({ ...optionsBase, downloadPackage: async () => new TextEncoder().encode("valid installer bytfs"), fetchFeed: async () => feedFor(metadata()), store });
  await machine.startupCheck();
  assert.equal((await machine.download()).state, "hash-mismatch");
  assert.equal(store.staged, undefined);
});
test("rollback is rejected and unsaved work blocks explicit restart", async () => {
  const store = memoryStore();
  const machine = new UpdaterStateMachine({ ...optionsBase, downloadPackage: async () => packageBytes, fetchFeed: async () => feedFor(metadata({ version: "1.2.2" })), store });
  assert.equal((await machine.startupCheck()).state, "rollback-rejected");
  const readyStore = memoryStore();
  const readyMachine = new UpdaterStateMachine({ ...optionsBase, downloadPackage: async () => packageBytes, fetchFeed: async () => feedFor(metadata()), restart: () => undefined, store: readyStore });
  await readyMachine.startupCheck(); await readyMachine.download();
  assert.deepEqual(await readyMachine.restartToInstall(() => true), { ok: false, reason: "unsaved-work" });
  assert.equal(readyMachine.later().state, "deferred");
});
test("cancel during staging invalidates the operation and removes the partial", async () => {
  const store = memoryStore();
  let release: (() => void) | undefined;
  const machine = new UpdaterStateMachine({
    ...optionsBase, fetchFeed: async () => feedFor(metadata()),
    downloadPackage: async () => new Promise<Body>((resolve) => { release = () => resolve((async function* () { yield packageBytes; })()); }),
    store
  });
  await machine.startupCheck();
  const download = machine.download();
  machine.cancelDownload();
  release?.();
  await download;
  assert.notEqual(machine.state.state, "ready");
  assert.equal(store.staged, undefined);
});
test("overlapping checks keep the newest generation", async () => {
  const store = memoryStore();
  let firstRelease: (() => void) | undefined;
  let count = 0;
  const machine = new UpdaterStateMachine({
    ...optionsBase, downloadPackage: async () => packageBytes,
    fetchFeed: async (_url, signal) => count++ === 0 ? new Promise((resolve, reject) => { firstRelease = () => resolve({ body: new TextEncoder().encode(JSON.stringify(metadata({ version: "9.9.9" }))), status: 200 }); signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); }) : feedFor(metadata()),
    store
  });
  const first = machine.checkForUpdates();
  const second = machine.checkForUpdates();
  firstRelease?.();
  await Promise.all([first, second]);
  assert.equal(machine.state.available?.version, "1.2.4");
});
test("atomic store stages, rehydrates, binds product identity, and rejects corruption", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "updater-store-"));
  try {
    const context = { allowedHosts: ["updates.example.test"], currentVersion: "1.2.3", feedUrl };
    const store = new AtomicUpdaterStore(root, "claude-design", context);
    const result = await store.stage(metadata(), packageBytes);
    store.save({ available: metadata(), productId: "claude-design", stagedFileName: result.fileName, stagedSha256: result.sha256, stagedSizeBytes: result.sizeBytes, state: "ready" });
    assert.equal((await store.rehydrate())?.state, "ready");
    const stageFile = readdirSync(path.join(root, "updates"))[0];
    readFileSync(path.join(root, "updates", stageFile));
    const restored = new AtomicUpdaterStore(root, "claude-design", context);
    assert.equal((await restored.rehydrate())?.stagedSha256, hash);
    assert.throws(() => store.save({ state: "idle", productId: "other" }), /identity/);
    const corruptBytes = Buffer.from(readFileSync(path.join(root, "updates", stageFile)));
    corruptBytes[0] ^= 1;
    writeFileSync(path.join(root, "updates", stageFile), corruptBytes);
    assert.equal((await restored.rehydrate())?.state, "corrupt-package");
    assert.equal(restored.load()?.state, "corrupt-package");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("A-cancel/B-stage/A-cleanup cannot remove B's stage handle", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "updater-race-"));
  try {
    const context = { allowedHosts: ["updates.example.test"], currentVersion: "1.2.3", feedUrl };
    const store = new AtomicUpdaterStore(root, "claude-design", context);
    const first = await store.stage(metadata(), packageBytes);
    const second = await store.stage(metadata(), packageBytes);
    await store.discardStaged(first);
    assert.equal(existsSync(store.stagedPath(second.fileName as string)), true);
    await store.discardStaged(second);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("Squirrel handoff is restricted to newer unsigned win32/x64 updates", () => {
  const handoff = createSquirrelWindowsHandoff(metadata(), "claude-design-1.2.4.exe", "1.2.3");
  assert.deepEqual(handoff, { architecture: "x64", packageFileName: "claude-design-1.2.4.exe", platform: "win32", unsigned: true, version: "1.2.4" });
  assert.throws(() => createSquirrelWindowsHandoff(metadata({ version: "1.2.2" }), "old.exe", "1.2.3"), /rollback/);
});
test("negative regression: stalled and oversized streams cannot reach ready", async () => {
  const store = memoryStore();
  const machine = new UpdaterStateMachine({ ...optionsBase, fetchFeed: async () => feedFor(metadata()), downloadPackage: async () => (async function* () { yield new Uint8Array(MAX_BYTES + 1); })(), store });
  await machine.startupCheck();
  assert.equal((await machine.download()).state, "corrupt-package");
  assert.notEqual(machine.state.state, "ready");
});

const MAX_BYTES = 2_000_001;

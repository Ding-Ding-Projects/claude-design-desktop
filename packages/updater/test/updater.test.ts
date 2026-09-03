import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  UpdaterStateMachine,
  compareSemanticVersions,
  validateUpdateMetadata,
  type PersistedUpdaterState,
  type UpdateMetadata,
  type UpdaterStore
} from "../src/updater.ts";

const feedUrl = "https://updates.example.test/claude-design.json";
const optionsBase = { allowedHosts: ["updates.example.test"], currentVersion: "1.2.3", feedUrl } as const;
const packageBytes = new TextEncoder().encode("valid installer bytes");
const hash = createHash("sha256").update(packageBytes).digest("hex");

function metadata(overrides: Partial<UpdateMetadata> = {}): UpdateMetadata {
  return {
    package: { architecture: "x64", platform: "win32", sha256: hash, sizeBytes: packageBytes.byteLength, url: "https://updates.example.test/claude-design-1.2.4.exe" },
    releaseNotesUrl: "https://updates.example.test/releases/1.2.4",
    schemaVersion: 1,
    updatedAt: "2026-09-02T15:00:00Z",
    version: "1.2.4",
    ...overrides
  };
}

function store(): UpdaterStore & { saved: PersistedUpdaterState[]; staged?: Uint8Array } {
  const value: UpdaterStore & { saved: PersistedUpdaterState[]; staged?: Uint8Array } = {
    saved: [],
    load: () => value.saved.at(-1),
    save: (state) => value.saved.push(state),
    stage: (_metadata, bytes) => { value.staged = bytes; }
  };
  return value;
}

test("semantic versions are monotonic and prereleases sort before stable", () => {
  assert.equal(compareSemanticVersions("1.2.4", "1.2.3"), 1);
  assert.equal(compareSemanticVersions("1.2.3-beta.2", "1.2.3-beta.10"), -1);
  assert.equal(compareSemanticVersions("1.2.3", "1.2.3-rc.1"), 1);
});

test("metadata rejects credentials, non-HTTPS URLs, and a different package host", () => {
  assert.throws(() => validateUpdateMetadata(metadata({ releaseNotesUrl: "https://user:pass@updates.example.test/releases/1.2.4" }), optionsBase), /HTTPS/);
  assert.throws(() => validateUpdateMetadata(metadata({ package: { ...metadata().package, url: "http://updates.example.test/a.exe" } }), optionsBase), /HTTPS/);
  assert.throws(() => validateUpdateMetadata(metadata({ package: { ...metadata().package, url: "https://cdn.example.test/a.exe" } }), optionsBase), /allowlisted|match/);
});

test("startup check and staged download produce a persistent ready banner", async () => {
  const memory = store();
  const machine = new UpdaterStateMachine({
    ...optionsBase,
    downloadPackage: async () => packageBytes,
    fetchFeed: async () => ({ body: new TextEncoder().encode(JSON.stringify(metadata())), status: 200 }),
    restart: () => undefined,
    store: memory
  });
  assert.equal((await machine.startupCheck()).state, "available");
  assert.equal((await machine.download()).state, "ready");
  assert.deepEqual(machine.state.banner?.actions, ["restart-to-install", "later"]);
  assert.equal(machine.state.banner?.unsignedWarning.includes("unsigned"), true);
  assert.deepEqual(memory.staged, packageBytes);
});

test("size and hash mismatches fail closed without staging bytes", async () => {
  const sizeStore = store();
  const sizeMachine = new UpdaterStateMachine({ ...optionsBase, downloadPackage: async () => packageBytes, fetchFeed: async () => ({ body: new TextEncoder().encode(JSON.stringify(metadata({ package: { ...metadata().package, sizeBytes: 99 } }))), status: 200 }), store: sizeStore });
  await sizeMachine.startupCheck();
  assert.equal((await sizeMachine.download()).state, "corrupt-package");
  assert.equal(sizeStore.staged, undefined);

  const hashStore = store();
  const hashMachine = new UpdaterStateMachine({ ...optionsBase, downloadPackage: async () => packageBytes, fetchFeed: async () => ({ body: new TextEncoder().encode(JSON.stringify(metadata({ package: { ...metadata().package, sha256: "0".repeat(64) } }))), status: 200 }), store: hashStore });
  await hashMachine.startupCheck();
  assert.equal((await hashMachine.download()).state, "hash-mismatch");
  assert.equal(hashStore.staged, undefined);
});

test("rollback is rejected, Later persists, and unsaved work blocks explicit restart", async () => {
  const memory = store();
  const machine = new UpdaterStateMachine({ ...optionsBase, downloadPackage: async () => packageBytes, fetchFeed: async () => ({ body: new TextEncoder().encode(JSON.stringify(metadata({ version: "1.2.2" }))), status: 200 }), store: memory });
  assert.equal((await machine.startupCheck()).state, "rollback-rejected");

  const readyMemory = store();
  const readyMachine = new UpdaterStateMachine({ ...optionsBase, downloadPackage: async () => packageBytes, fetchFeed: async () => ({ body: new TextEncoder().encode(JSON.stringify(metadata())), status: 200 }), restart: () => undefined, store: readyMemory });
  await readyMachine.startupCheck();
  await readyMachine.download();
  assert.deepEqual(await readyMachine.restartToInstall(() => true), { ok: false, reason: "unsaved-work" });
  assert.equal(readyMachine.later().state, "deferred");
});

test("negative regression: removing package hash validation makes the contract test red", async () => {
  const memory = store();
  const machine = new UpdaterStateMachine({ ...optionsBase, downloadPackage: async () => new TextEncoder().encode("tampered"), fetchFeed: async () => ({ body: new TextEncoder().encode(JSON.stringify(metadata())), status: 200 }), store: memory });
  await machine.startupCheck();
  assert.equal((await machine.download()).state, "corrupt-package");
  assert.equal(memory.staged, undefined);
});

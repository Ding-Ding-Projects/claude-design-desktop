import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createDefaultPreferences,
  createNarrationQueue,
  createPreferencesStore,
  emptyVocabularyState,
  parseAndCachePersonalVocabulary,
  parsePersonalVocabulary,
  createPreferenceHistory,
  createMainProcessGitHistoryAdapter,
  previewBulkAction,
  prepareExport,
  createScheduleRefreshController,
  decodeAndConvertLogo,
  resolveSchedule,
  validateLogoSource,
  type SpeechDriver,
  type SpeechUtterance
} from "../src/index.js";

const execFileAsync = promisify(execFile);

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("language, independent funny levels, emoji setting, and School mode are persisted with immediate suppression", async () => {
  const storage = new MemoryStorage();
  const historyCommits: unknown[] = [];
  const history = createPreferenceHistory(createMainProcessGitHistoryAdapter({ writeSnapshot: async () => undefined, runGit: async (args) => { historyCommits.push(args); return String(historyCommits.length); } }));
  const store = createPreferencesStore({ storage, defaults: createDefaultPreferences(), history });
  store.updateLanguage({ mode: "cantonese", englishFunnyLevel: 2, cantoneseFunnyLevel: 4, showDialogEmojis: false });
  store.updateSchool({ enabled: true, displayName: "Quiet study" });
  assert.deepEqual(store.getEffectiveLanguage(), { mode: "english", englishFunnyLevel: 1, cantoneseFunnyLevel: 1, showDialogEmojis: false });
  assert.deepEqual(store.featureAvailability(), { cantonese: false, bilingual: false, funnyLevels: false, vocabulary: false, dimSum: false, dialogEmojis: true });
  const restored = createPreferencesStore({ storage, defaults: createDefaultPreferences() });
  assert.equal(restored.getState().school.displayName, "Quiet study");
  assert.equal(restored.getState().displayName.stableDataDirectoryKey, "claude-design-desktop");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(historyCommits.length >= 2);
  store.close();
  restored.close();
});

test("personal vocabulary is bounded, local, complete, and rejects duplicate and unsafe keys", () => {
  const valid = parsePersonalVocabulary(JSON.stringify({ schemaVersion: 1, entries: [{ key: "greeting", replacement: "hello" }] }));
  assert.equal(valid.ok, true);
  assert.equal(parsePersonalVocabulary('{"schemaVersion":1,"schemaVersion":1,"entries":[]}').ok, false);
  assert.equal(parsePersonalVocabulary(JSON.stringify({ schemaVersion: 1, entries: [{ key: "__proto__", replacement: "x" }] })).ok, false);
  const storage = new MemoryStorage();
  const state = parseAndCachePersonalVocabulary(JSON.stringify({ schemaVersion: 1, entries: [] }), storage);
  assert.equal(state.status, "loaded");
  assert.notEqual(storage.getItem("claude-design.personal-vocabulary.v1"), null);
  assert.deepEqual(emptyVocabularyState(), { status: "empty", schemaVersion: null, entryCount: 0, cache: null, errorCode: null });
});

test("store-owned vocabulary load, replace, and clear are atomic and resettable", () => {
  const storage = new MemoryStorage();
  const store = createPreferencesStore({ storage, broadcast: false });
  assert.equal(store.loadVocabulary(JSON.stringify({ schemaVersion: 1, entries: [{ key: "one", replacement: "uno" }] })).status, "loaded");
  assert.equal(store.getState().vocabulary.entryCount, 1);
  assert.equal(store.loadVocabulary('{"schemaVersion":1,"entries":[{"key":"one"}]}').status, "invalid");
  assert.equal(store.getState().vocabulary.entryCount, 1);
  store.clearVocabulary();
  assert.equal(store.getState().vocabulary.status, "empty");
  store.close();
});

test("schedule precedence and cross-midnight windows are deterministic", () => {
  const base = { theme: "light" as const };
  const overnight = { id: "overnight", label: "Night", enabled: true, priority: 1, startDate: null, endDate: null, startTime: { hour: 23, minute: 0 }, endTime: { hour: 1, minute: 0 }, weekdays: [1], everyDay: false, timezone: "UTC", values: { theme: "dark" as const }, source: { kind: "local" as const } };
  const higher = { ...overnight, id: "higher", priority: 2, weekdays: [2], startTime: { hour: 0, minute: 0 }, endTime: { hour: 2, minute: 0 }, values: { density: "compact" as const } };
  const resolved = resolveSchedule([overnight, higher], { now: new Date("2026-09-01T00:30:00Z") }, base);
  assert.equal(resolved.ruleId, "higher");
  assert.equal(resolved.values.density, "compact");
});

test("schedule treats 24:00 as a valid end-of-day boundary", () => {
  const rule = { id: "day-end", label: "Day end", enabled: true, priority: 1, startDate: null, endDate: null, startTime: { hour: 23, minute: 0 }, endTime: { hour: 24, minute: 0 }, weekdays: [2], everyDay: false, timezone: "UTC", values: { density: "compact" as const }, source: { kind: "local" as const } };
  const result = resolveSchedule([rule], { now: new Date("2026-09-01T23:30:00Z") }, {});
  assert.equal(result.ruleId, "day-end");
  assert.equal(resolveSchedule([rule], { now: new Date("2026-09-02T00:00:00Z") }, {}).ruleId, null);
});

test("schedule transport uses the privileged boundary, vault lookup, deadline, and incremental size bound", async () => {
  let request: { url: string; headers: Record<string, string>; redirect: "error" } | undefined;
  const controller = createScheduleRefreshController({
    resolveHost: async () => ["8.8.8.8"],
    request: async (input) => { request = { url: input.url, headers: input.headers, redirect: input.redirect }; return input.url.includes("/settings") ? { status: 500, text: async () => "{}" } : { status: 200, headers: { "content-length": "16" }, text: async () => "{\"state\":\"off\"}" }; }
  }, { getCredential: async (key) => key === "vault-ha" ? "vault-value-never-returned" : null });
  const result = await controller.refresh({ kind: "home-assistant", baseUrl: "https://ha.example.test", entityId: "input_boolean.focus", credentialKey: "vault-ha" });
  assert.equal(result.active, false);
  assert.equal(request?.redirect, "error");
  assert.equal(request?.headers.authorization, "Bearer vault-value-never-returned");
  await assert.rejects(() => controller.refresh({ kind: "api", url: "http://192.168.1.5/settings", schemaVersion: 1 }), /https-required/);
  await assert.rejects(() => controller.refresh({ kind: "api", url: "https://public.example.test/settings", schemaVersion: 1 }), /schedule-source-http/);
  const mixed = createScheduleRefreshController({ resolveHost: async () => ["8.8.8.8", "169.254.169.254"], request: async () => ({ status: 200, text: async () => "{}" }) });
  await assert.rejects(() => mixed.refresh({ kind: "api", url: "https://public.example.test/settings", schemaVersion: 1 }), /unsafe-resolved-address/);
  const unbound = createScheduleRefreshController({ request: async () => ({ status: 200, text: async () => "{}" }) });
  await assert.rejects(() => unbound.refresh({ kind: "api", url: "https://public.example.test/settings", schemaVersion: 1 }), /dns-resolution-required/);
  const hanging = createScheduleRefreshController({ resolveHost: async () => ["8.8.8.8"], request: async () => new Promise(() => undefined) }, { getCredential: async () => null }, { deadlineMs: 250 });
  await assert.rejects(() => hanging.refresh({ kind: "api", url: "https://public.example.test/settings", schemaVersion: 1 }), /schedule-source-timeout/);
});

test("School state strips credential keys on load and never persists them", () => {
  const storage = new MemoryStorage();
  storage.setItem("claude-design.school-mode.v1", JSON.stringify({ enabled: true, displayName: "Quiet", unlockMethod: "password", credentialKey: "vault-secret-key" }));
  const store = createPreferencesStore({ storage, broadcast: false });
  assert.equal(store.getState().school.credentialKey, null);
  store.updateSchool({ credentialKey: "attempted-secret-key" });
  assert.equal(store.getState().school.credentialKey, null);
  assert.equal(JSON.parse(storage.getItem("claude-design.preferences.v1") ?? "{}").school.credentialKey, null);
  store.close();
});

test("preference history uses a main-process Git adapter and fails non-fatally", async () => {
  const calls: string[][] = [];
  const adapter = createMainProcessGitHistoryAdapter({ writeSnapshot: async () => undefined, runGit: async (args) => { calls.push(args); return "abc123"; } });
  const history = createPreferenceHistory(adapter);
  const appended = await history.append("updated-theme", ["appearance.theme"]);
  assert.equal(appended.persisted, true);
  assert.equal(calls.some((args) => args[0] === "add"), true);
  assert.equal(calls.some((args) => args[0] === "commit"), true);
  let failure: Error | undefined;
  const failing = createPreferenceHistory(createMainProcessGitHistoryAdapter({ writeSnapshot: async () => { throw new Error("disk-unavailable"); }, runGit: async () => "unused" }), { onWriteFailure: (error) => { failure = error; } });
  const result = await failing.append("updated-density", ["appearance.density"]);
  assert.equal(result.persisted, false);
  assert.equal(failure?.message, "disk-unavailable");
});

test("temporary Git history proves A, B, restore A, final tree, and restore B", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-preferences-history-"));
  const runGit = async (args: string[]) => (await execFileAsync("git", args, { cwd: root, windowsHide: true })).stdout;
  try {
    await runGit(["init", "-q"]);
    await runGit(["config", "user.name", "Claude Fable 5.1"]);
    await runGit(["config", "user.email", "noreply@anthropic.com"]);
    const adapter = createMainProcessGitHistoryAdapter({ writeSnapshot: async (snapshot) => writeFile(join(root, "preferences.snapshot"), snapshot, "utf8"), runGit });
    const history = createPreferenceHistory(adapter);
    const a = await history.append("snapshot-a", ["appearance.theme"], "A");
    const b = await history.append("snapshot-b", ["appearance.theme"], "B");
    assert.equal(await readFile(join(root, "preferences.snapshot"), "utf8"), "B");
    const restoredA = await history.restore(a.revision ?? "");
    assert.equal(restoredA.persisted, true);
    assert.equal(await readFile(join(root, "preferences.snapshot"), "utf8"), "A");
    const restoredB = await history.restore(b.revision ?? "");
    assert.equal(restoredB.persisted, true);
    assert.equal(await readFile(join(root, "preferences.snapshot"), "utf8"), "B");
    const log = await runGit(["log", "--format=%s"]);
    assert.match(log, /Preference restore/);
    assert.equal((await runGit(["status", "--porcelain"])).trim(), "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("narration enumerates voices late and serializes bilingual speech without overlap", async () => {
  const spoken: SpeechUtterance[] = [];
  let voiceListener: (() => void) | undefined;
  const driver: SpeechDriver = {
    speak: async (utterance) => { spoken.push(utterance); await new Promise((resolve) => setTimeout(resolve, 1)); },
    cancel: () => undefined,
    listVoices: () => voiceListener ? [{ id: "en-1", name: "English", language: "en-US", localService: true, networkBacked: false }, { id: "yue-1", name: "Cantonese", language: "yue-HK", localService: true, networkBacked: false }] : [],
    onVoicesChanged: (listener) => { voiceListener = listener; return () => { voiceListener = undefined; }; }
  };
  const queue = createNarrationQueue(driver, {}, { debounceMs: 1, categoryCooldownMs: 0 });
  assert.equal(queue.getVoices("en").length, 0);
  voiceListener?.();
  assert.equal(queue.getVoices("yue").length, 1);
  queue.enqueue({ english: "One", cantonese: "Two" }, { enabled: true, language: "both", englishVoiceId: "en-1", cantoneseVoiceId: "yue-1", rate: 1, pitch: 1, reducedSound: false, quietHours: false }, { category: "first" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(spoken.map((item) => item.text), ["One", "Two"]);
  assert.equal(spoken[0]?.voice?.id, "en-1");
  queue.dispose();
});


test("narration applies debounce and per-category cooldown", async () => {
  const spoken: string[] = [];
  const queue = createNarrationQueue({ speak: async (item) => { spoken.push(item.text); }, cancel: () => undefined, listVoices: () => [], onVoicesChanged: () => () => undefined }, {}, { debounceMs: 3, categoryCooldownMs: 100 });
  const preferences = { enabled: true, language: "en" as const, englishVoiceId: null, cantoneseVoiceId: null, rate: 1, pitch: 1, reducedSound: false, quietHours: false };
  queue.enqueue({ english: "first" }, preferences, { category: "status" });
  queue.enqueue({ english: "suppressed" }, preferences, { category: "status" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(spoken, ["first"]);
  queue.dispose();
});

test("logo validation rejects spoofed, animated, and oversized input", () => {
  assert.equal(validateLogoSource({ name: "x.png", claimedMime: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }).ok, false);
  const svg = new TextEncoder().encode('<svg><script>alert(1)</script></svg>');
  assert.equal(validateLogoSource({ name: "x.svg", claimedMime: "image/svg+xml", bytes: svg }).ok, false);
});

test("logo conversion decodes, converts, round-trips, and does not retain source names", async () => {
  const source = { name: "private-source.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 32, 0, 0, 0, 32]) };
  const decoder = {
    decode: async (bytes: Uint8Array) => ({ width: bytes.length === source.bytes.length ? 32 : 64, height: bytes.length === source.bytes.length ? 32 : 64, image: {} }),
    encode: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 64, 0, 0, 0, 64, 1])
  };
  const result = await decodeAndConvertLogo(source, { mime: "image/png", sizes: [64], fit: "contain", crop: null, focalPoint: { x: 0.5, y: 0.5 }, background: { kind: "transparent", color: "#fff" }, safeArea: { x: 0, y: 0, width: 1, height: 1 } }, decoder);
  assert.equal(result.outputs[0]?.size, 64);
});

test("nested export redaction removes sensitive descendants", () => {
  const output = prepareExport({ format: "json", includeSensitive: false, note: "redacted", records: [{ id: "1", nested: { token: "hidden", visible: "kept" }, values: [{ password: "hidden" }] }] });
  assert.match(output, /\[omitted\]/);
  assert.doesNotMatch(output, /hidden/);
  assert.match(output, /kept/);
});

test("bulk preview reports exact selected, affected, and excluded counts", () => {
  const preview = previewBulkAction({ action: "delete", scope: "page", items: [{ id: "a", label: "A", selected: true }, { id: "b", label: "B", selected: true, pinned: true }, { id: "c", label: "C", selected: false }] });
  assert.equal(preview.selectedCount, 2);
  assert.equal(preview.affectedCount, 1);
  assert.equal(preview.excludedCount, 1);
  assert.equal(preview.items[1]?.reason, "pinned");
});

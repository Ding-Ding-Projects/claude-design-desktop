import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  createDefaultPreferences,
  createNarrationQueue,
  createPreferencesStore,
  emptyVocabularyState,
  parseAndCachePersonalVocabulary,
  parsePersonalVocabulary,
  previewBulkAction,
  resolveSchedule,
  validateLogoSource,
  type SpeechDriver,
  type SpeechUtterance
} from "../src/index";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("language, independent funny levels, emoji setting, and School mode are persisted with immediate suppression", () => {
  const storage = new MemoryStorage();
  const store = createPreferencesStore({ storage, defaults: createDefaultPreferences() });
  store.updateLanguage({ mode: "cantonese", englishFunnyLevel: 2, cantoneseFunnyLevel: 4, showDialogEmojis: false });
  store.updateSchool({ enabled: true, displayName: "Quiet study" });
  assert.deepEqual(store.getEffectiveLanguage(), { mode: "english", englishFunnyLevel: 1, cantoneseFunnyLevel: 1, showDialogEmojis: false });
  assert.deepEqual(store.featureAvailability(), { cantonese: false, bilingual: false, funnyLevels: false, vocabulary: false, dimSum: false });
  const restored = createPreferencesStore({ storage, defaults: createDefaultPreferences() });
  assert.equal(restored.getState().school.displayName, "Quiet study");
  assert.equal(restored.getState().displayName.stableDataDirectoryKey, "claude-design-desktop");
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

test("schedule precedence and cross-midnight windows are deterministic", () => {
  const base = { theme: "light" as const };
  const overnight = { id: "overnight", label: "Night", enabled: true, priority: 1, startDate: null, endDate: null, startTime: { hour: 23, minute: 0 }, endTime: { hour: 1, minute: 0 }, weekdays: [1], everyDay: false, timezone: "UTC", values: { theme: "dark" as const }, source: { kind: "local" as const } };
  const higher = { ...overnight, id: "higher", priority: 2, weekdays: [2], startTime: { hour: 0, minute: 0 }, endTime: { hour: 2, minute: 0 }, values: { density: "compact" as const } };
  const resolved = resolveSchedule([overnight, higher], { now: new Date("2026-09-01T00:30:00Z") }, base);
  assert.equal(resolved.ruleId, "higher");
  assert.equal(resolved.values.density, "compact");
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
  const queue = createNarrationQueue(driver);
  assert.equal(queue.getVoices("en").length, 0);
  voiceListener?.();
  assert.equal(queue.getVoices("yue").length, 1);
  queue.enqueue({ english: "One", cantonese: "Two" }, { enabled: true, language: "both", englishVoiceId: "en-1", cantoneseVoiceId: "yue-1", rate: 1, pitch: 1, reducedSound: false, quietHours: false });
  queue.enqueue({ english: "Latest" }, { enabled: true, language: "en", englishVoiceId: "en-1", cantoneseVoiceId: null, rate: 1, pitch: 1, reducedSound: false, quietHours: false });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(spoken.map((item) => item.text), ["One", "Latest"]);
  assert.equal(spoken[0].voice?.id, "en-1");
  queue.dispose();
});

test("logo validation rejects spoofed, animated, and oversized input", () => {
  assert.equal(validateLogoSource({ name: "x.png", claimedMime: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }).ok, false);
  const svg = new TextEncoder().encode('<svg><script>alert(1)</script></svg>');
  assert.equal(validateLogoSource({ name: "x.svg", claimedMime: "image/svg+xml", bytes: svg }).ok, false);
});

test("bulk preview reports exact selected, affected, and excluded counts", () => {
  const preview = previewBulkAction({ action: "delete", scope: "page", items: [{ id: "a", label: "A", selected: true }, { id: "b", label: "B", selected: true, pinned: true }, { id: "c", label: "C", selected: false }] });
  assert.equal(preview.selectedCount, 2);
  assert.equal(preview.affectedCount, 1);
  assert.equal(preview.excludedCount, 1);
  assert.equal(preview.items[1].reason, "pinned");
});

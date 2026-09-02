import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_FEATURE_IDS, FEATURE_INVENTORY, assertCompleteInventory, negativeRegression, localize, DEFAULT_LOCALE_SETTINGS, updateLocaleSettings, effectiveLanguage, suppressedFeatureIds, DEFAULT_SCHOOL_MODE, validatePersonalVocabulary, TabStore, regexWorkbench, CommandPalette, RAINBOW_SENTINEL, isRainbow, LockRegistry, LOCK_POLICIES, ladderStartView, pairingMetadata, converterCategories, adapterCapability, unknownFit, harnessCapability, validateProvenance, formatProvenance, StatusHubProjection, DownloadStateMachine, colorTranslationCapability, HistoryProjection } from "../dist/index.js";

test("inventory has 60 explicit rows, existing implementation paths, and pending evidence", () => {
  assert.equal(CANONICAL_FEATURE_IDS.length, 30);
  assert.equal(FEATURE_INVENTORY.length, 60);
  assert.doesNotThrow(() => assertCompleteInventory(FEATURE_INVENTORY));
  const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  for (const row of FEATURE_INVENTORY) { assert.equal(row.status, "pending"); assert.equal(row.interactionEvidence, "pending"); assert.equal(row.captureEvidence, "pending"); assert.equal(existsSync(resolve(packageRoot, row.implementation)), true); }
  assert.equal(negativeRegression(FEATURE_INVENTORY, "status-hub", "desktop"), true);
  const pathExists = path => existsSync(resolve(packageRoot, path));
  assert.doesNotThrow(() => assertCompleteInventory(FEATURE_INVENTORY, CANONICAL_FEATURE_IDS, { pathExists }));
  assert.throws(() => assertCompleteInventory(FEATURE_INVENTORY.map(row => row.id === "status-hub" && row.surface === "desktop" ? { ...row, implementation: "src/missing.ts" } : row), CANONICAL_FEATURE_IDS, { pathExists }));
  assert.throws(() => assertCompleteInventory(FEATURE_INVENTORY.map(row => row.id === "status-hub" && row.surface === "desktop" ? { ...row, status: "verified", route: "/status" } : row)));
});

test("localization, independent funny levels, emojis and School mode", () => {
  const changed = updateLocaleSettings(DEFAULT_LOCALE_SETTINGS, { mode: "bilingual", englishFunnyLevel: 1, cantoneseFunnyLevel: 5, showDialogEmojis: false });
  const value = localize({ en: "Saved", yue: "已儲存" }, changed); assert.match(value, /Saved/); assert.match(value, /已儲存/); assert.doesNotMatch(value, /snacks/);
  assert.equal(effectiveLanguage("yue", { ...DEFAULT_SCHOOL_MODE, enabled: true }), "en"); assert.equal(suppressedFeatureIds({ ...DEFAULT_SCHOOL_MODE, enabled: true }).has("dialog-emoji-toggle"), false);
});

test("personal vocabulary validates bounds without partial application", () => {
  const vocabulary = validatePersonalVocabulary(JSON.stringify({ schemaVersion: 1, entries: { Hello: "你好" } })); assert.equal(vocabulary.entries.Hello, "你好");
  assert.throws(() => validatePersonalVocabulary(JSON.stringify({ schemaVersion: 2, entries: {} }))); assert.throws(() => validatePersonalVocabulary('{"schemaVersion":1,"entries":{"a":"x","a":"y"}}'));
});

test("tabs and regex preserve independent search state", () => {
  const tabs = new TabStore(); tabs.addGroup({ id: "g", name: "Work", color: "#123456", collapsed: false, pinned: false }); tabs.add({ id: "a", title: "Alpha", groupId: "g", pinned: false, locked: false, closable: true }); tabs.add({ id: "b", title: "Beta", pinned: true, locked: false, closable: true }); tabs.setDock("bottom");
  assert.equal(tabs.search({ query: "alp", regex: false, pattern: "", flags: "" }, "group", "g").length, 1); assert.equal(tabs.search({ query: "^A", regex: true, pattern: "^A", flags: "" }, "master").length, 1); assert.equal(tabs.search({ query: "A", regex: true, pattern: "A", flags: "g" }, "master").length, 1); assert.throws(() => tabs.closeByText(""));
  assert.equal(regexWorkbench.capabilities.lookbehind, true); assert.equal(regexWorkbench.capabilities.conditionals, false);
});

test("palette, appearance, locks and authenticator metadata do not claim host work", () => {
  const palette = new CommandPalette(); let value = false; palette.register({ id: "toggle", label: "Toggle feature", shortcut: "Ctrl+Shift+F", run: () => { value = !value; }, control: { kind: "switch", value, set: next => { value = Boolean(next); } } }); palette.activate("toggle"); assert.equal(value, true); assert.equal(palette.search("feature").length, 1); assert.equal(isRainbow({ kind: "rainbow", value: RAINBOW_SENTINEL }), true); assert.equal(colorTranslationCapability("hex", "rgb").supported, false);
  assert.equal(LOCK_POLICIES.length, 6); const locks = new LockRegistry(); locks.add({ id: "l", targetId: "button", policy: "password+totp", lockedOnLaunch: true }); assert.equal(locks.getForTarget("button")?.policy, "password+totp"); assert.equal(pairingMetadata({ issuer: "Issuer", account: "account", algorithm: "SHA-1", digits: 6, period: 30 }).confirmed, false); assert.equal(ladderStartView(true).rung, "sums");
});

test("converter, model fit and harness contracts fail closed", () => {
  assert.equal(converterCategories.length, 8); assert.equal(adapterCapability({ id: "no", category: "video", sourceSignatures: ["avi"], targetFormat: "mp4", bundled: false, packageProof: false, reason: "adapter not bundled", lossy: true }).enabled, false); assert.equal(unknownFit({ ramBytes: null, vramBytes: null, diskBytes: null, driver: null }).verdict, "Unknown"); assert.equal(harnessCapability({ id: "x", executable: "tool", args: [], workingDirectory: ".", allowlistedByHost: false }).enabled, false);
});

test("status cannot be marked verified without concrete evidence", () => {
  const hub = new StatusHubProjection("desktop"); assert.equal(hub.update("waiting", ["not verified"]).state, "waiting"); assert.throws(() => hub.markVerified({ commit: "not-a-sha", runUrl: "not-a-url", verdict: "verified" })); assert.throws(() => hub.markVerified({ commit: "1234567", runUrl: "https://example.test/run", verdict: "not-verified" })); assert.equal(hub.markVerified({ commit: "1234567", runUrl: "https://example.test/run", verdict: "verified" }).state, "verified");
  const provenance = { version: "0.1.0", updatedAt: "2026-09-02T12:00:00Z", timezone: "UTC", source: "build" }; assert.equal(validateProvenance(provenance), true); assert.match(formatProvenance(provenance), /0.1.0/); const history = new HistoryProjection(); history.record("updated", "x", "Redacted change"); assert.equal(history.list().length, 1);
});

test("download transitions are bounded and honest", () => {
  const machine = new DownloadStateMachine({ id: "d", filename: "x.zip", source: "https://example.test/x.zip", destination: "x.zip", state: "idle", receivedBytes: 0, totalBytes: 2, rateBytesPerSecond: null }); machine.transition("awaiting-confirmation"); machine.transition("downloading"); machine.progress(1, 2, 1); assert.equal(machine.read().receivedBytes, 1); machine.transition("complete"); assert.throws(() => machine.transition("downloading"));
});

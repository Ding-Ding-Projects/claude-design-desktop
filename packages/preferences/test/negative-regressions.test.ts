import { test } from "node:test";
import { strict as assert } from "node:assert";
import { compileBoundedSearch, createSearchRegistry, parsePersonalVocabulary, previewBulkAction, registerPreferenceSearchSurfaces, validateLogoSource } from "../src/index.js";

test("negative regression turns red for duplicate vocabulary keys", () => {
  const brokenParser = (payload: string) => JSON.parse(payload);
  const duplicate = '{"schemaVersion":1,"schemaVersion":2,"entries":[]}';
  assert.equal((brokenParser(duplicate) as { schemaVersion: number }).schemaVersion, 2);
  assert.equal(parsePersonalVocabulary(duplicate).ok, false);
});
test("negative regression keeps pinned destructive items excluded by default", () => {
  const preview = previewBulkAction({ action: "delete", scope: "all-matches", items: [{ id: "p", label: "Pinned", selected: true, pinned: true }] });
  assert.equal(preview.affectedCount, 0);
  assert.equal(preview.excludedCount, 1);
});

test("negative regression rejects a declared image MIME when bytes disagree", () => {
  const result = validateLogoSource({ name: "not-an-image", claimedMime: "image/png", bytes: new TextEncoder().encode("plain text") });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("unsupported-signature"));
});

test("negative regression rejects remote SVG CSS and imports", () => {
  const result = validateLogoSource({ name: "remote.svg", claimedMime: "image/svg+xml", bytes: new TextEncoder().encode('<svg><style>@import url("https://example.test/x.css");</style></svg>') });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("unsafe-svg"));
});

test("negative regression requires anchored bounded regex workbenches for each preference surface", () => {
  const registry = createSearchRegistry();
  registerPreferenceSearchSurfaces(registry);
  assert.deepEqual(registry.list().map((surface) => surface.id), ["settings", "voice-picker", "schedule-source-picker", "menu"]);
  assert.equal(compileBoundedSearch("English", false)?.test("English voice"), true);
  assert.throws(() => compileBoundedSearch("x", true, "z"), /unsupported-regex-flags/);
});

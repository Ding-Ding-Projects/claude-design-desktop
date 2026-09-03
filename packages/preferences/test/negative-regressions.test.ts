import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parsePersonalVocabulary, previewBulkAction, validateLogoSource } from "../src/index";

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

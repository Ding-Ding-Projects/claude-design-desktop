import assert from "node:assert/strict";
import test from "node:test";
import { ProductStatusProjector, createProductStatusProjection, createStatusHubProjectProjection } from "../src/product-status.ts";

const provenance = { buildRecordedAt: "2026-09-02T15:00:00-04:00", commit: "0123456789abcdef0123456789abcdef01234567", version: "1.2.4" };

test("projection carries exact provenance and derives verified evidence", () => {
  const projection = createProductStatusProjection({ appId: "claude-design", enrolled: true, provenance, evidence: [{ detail: "local built artifact opened", state: "verified", subject: "runtime" }] });
  assert.equal(projection.version, provenance.version);
  assert.equal(projection.commit, provenance.commit);
  assert.equal(projection.updatedAt, provenance.buildRecordedAt);
  assert.equal(projection.verification, "verified");
  assert.equal(projection.enrollment, "enrolled");
});

test("missing provenance and enrollment are explicit, never fabricated", async () => {
  const projector = new ProductStatusProjector({ appId: "claude-design", enrolled: false });
  assert.equal(projector.current.version, null);
  assert.equal(projector.current.updatedAt, null);
  assert.equal(projector.current.commit, null);
  assert.equal(projector.current.enrollment, "enrollment-unavailable");
  const result = await projector.publish();
  assert.equal(result.delivery, "enrollment-unavailable");
  assert.match(result.reason, /no delivery/);
});

test("project projection keeps the app projection and enrollment state together", () => {
  const projection = createStatusHubProjectProjection({ app: { appId: "claude-design", enrolled: false }, defaultRef: "main", projectId: "claude-design-desktop" });
  assert.equal(projection.projectId, "claude-design-desktop");
  assert.equal(projection.defaultRef, "main");
  assert.equal(projection.app.version, null);
  assert.equal(projection.enrollment, "enrollment-unavailable");
});

test("transport failures remain failed and do not become delivered", async () => {
  let calls = 0;
  const projector = new ProductStatusProjector({ appId: "claude-design", enrolled: true, provenance, transport: { publish: async () => { calls += 1; throw new Error("HTTP 503"); } } });
  const result = await projector.publish();
  assert.equal(calls, 1);
  assert.equal(result.delivery, "failed");
  assert.match(result.reason, /HTTP 503/);
});

test("negative regression: an unverified evidence row keeps the projection unrun", () => {
  const projection = createProductStatusProjection({ appId: "claude-design", enrolled: true, provenance, evidence: [{ detail: "not executed", state: "unrun", subject: "built artifact" }] });
  assert.equal(projection.verification, "unrun");
  assert.notEqual(projection.verification, "verified");
});

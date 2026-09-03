import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { ProductStatusProjector, createProductStatusProjection, createStatusHubProjectProjection, projectionSha256, type ProductProvenance, type StatusEvidence } from "../src/product-status.ts";

const provenance: ProductProvenance = {
  buildRecordedAt: "2026-09-02T15:00:00-04:00",
  commit: "0123456789abcdef0123456789abcdef01234567",
  manifestSha256: "a".repeat(64),
  packageSha256: "b".repeat(64),
  version: "1.2.4"
};
const evidence: StatusEvidence = {
  captureId: "capture-built-home-001", checkId: "check-ui-smoke-001", commit: provenance.commit,
  detail: "local built artifact opened", packageSha256: provenance.packageSha256, state: "verified", subject: "runtime"
};

test("projection carries exact package-bound provenance and verified evidence", () => {
  const projection = createProductStatusProjection({ appId: "claude-design", enrolled: true, provenance, evidence: [evidence] });
  assert.equal(projection.version, provenance.version);
  assert.equal(projection.commit, provenance.commit);
  assert.equal(projection.packageSha256, provenance.packageSha256);
  assert.equal(projection.verification, "verified");
});
test("evidence with a different commit or package hash is refused", () => {
  assert.throws(() => createProductStatusProjection({ appId: "claude-design", enrolled: true, provenance, evidence: [{ ...evidence, commit: "f".repeat(40) }] }), /bound/);
  assert.throws(() => createProductStatusProjection({ appId: "claude-design", enrolled: true, provenance, evidence: [{ ...evidence, packageSha256: "f".repeat(64) }] }), /bound/);
});
test("missing provenance and enrollment are explicit, never fabricated", async () => {
  const projector = new ProductStatusProjector({ appId: "claude-design", enrolled: false });
  assert.equal(projector.current.version, null);
  assert.equal(projector.current.updatedAt, null);
  assert.equal(projector.current.commit, null);
  const result = await projector.publish();
  assert.equal(result.delivery, "enrollment-unavailable");
  assert.match(result.reason, /no delivery/);
});
test("project projection keeps app state and default ref together", () => {
  const projection = createStatusHubProjectProjection({ app: { appId: "claude-design", enrolled: false }, defaultRef: "main", projectId: "claude-design-desktop" });
  assert.equal(projection.projectId, "claude-design-desktop");
  assert.equal(projection.defaultRef, "main");
  assert.equal(projection.enrollment, "enrollment-unavailable");
});
test("delivery requires a typed receipt and exact read-back", async () => {
  let published = false;
  const projector = new ProductStatusProjector({
    appId: "claude-design", enrolled: true, provenance, evidence: [evidence],
    transport: {
      publish: async (projection) => { published = true; return { acceptedAt: "2026-09-02T15:01:00Z", projectionSha256: projectionSha256(projection), receiptId: "receipt-1" }; },
      readBack: async () => projector.current
    }
  });
  const result = await projector.publish();
  assert.equal(published, true);
  assert.equal(result.delivery, "delivered");
  if (result.delivery === "delivered") assert.equal(result.receipt.receiptId, "receipt-1");
});
test("mismatched read-back stays failed and never becomes delivered", async () => {
  const projector = new ProductStatusProjector({
    appId: "claude-design", enrolled: true, provenance, evidence: [evidence],
    transport: {
      publish: async (projection) => ({ acceptedAt: "2026-09-02T15:01:00Z", projectionSha256: projectionSha256(projection), receiptId: "receipt-2" }),
      readBack: async () => ({ ...projector.current, version: "9.9.9" })
    }
  });
  const result = await projector.publish();
  assert.equal(result.delivery, "failed");
  assert.match(result.reason, /read-back/);
});
test("negative regression: unrun evidence never reports verified", () => {
  const projection = createProductStatusProjection({ appId: "claude-design", enrolled: true, provenance, evidence: [{ ...evidence, state: "unrun" }] });
  assert.equal(projection.verification, "unrun");
  assert.notEqual(projection.verification, "verified");
});

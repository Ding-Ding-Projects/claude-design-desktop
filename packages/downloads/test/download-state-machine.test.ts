import assert from "node:assert/strict";
import test from "node:test";
import { DownloadStateMachine, DOWNLOAD_LIMITS, normalizeDownloadRequest } from "../src/download-state-machine";

const request = { sourceUrl: "https://example.test/files/report.pdf", suggestedFilename: "report.pdf", sourceLabel: "Example" };

test("proposal does not enter the queue until Start is confirmed", () => {
  const machine = new DownloadStateMachine();
  const proposal = machine.prepareStart(request);
  assert.equal(proposal.phase, "awaiting-confirmation");
  assert.equal(machine.queueLength(), 0);
  machine.confirmStart(proposal.id);
  assert.equal(machine.queueLength(), 1);
});

test("cancelling Start leaves the queue unchanged", () => {
  const machine = new DownloadStateMachine();
  const proposal = machine.prepareStart(request);
  machine.cancelProposal(proposal.id);
  assert.equal(machine.queueLength(), 0);
  assert.equal(machine.get(proposal.id), undefined);
});

test("confirmed item exposes a separate always-on-top progress window model", () => {
  const machine = new DownloadStateMachine();
  const proposal = machine.prepareStart(request);
  const queued = machine.confirmStart(proposal.id);
  assert.deepEqual(queued.progressWindow, {
    alwaysOnTop: true,
    accessibleName: "Download progress for report.pdf",
    windowId: "progress-download-1",
    visible: true
  });
});

test("progress computes rate and ETA and supports pause, resume, cancel", async () => {
  const machine = new DownloadStateMachine();
  const proposal = machine.prepareStart(request);
  machine.confirmStart(proposal.id);
  const started = await machine.startNext();
  assert.equal(started?.phase, "downloading");
  machine.reportProgress(proposal.id, 500, 2_000, 1_000);
  const progress = machine.reportProgress(proposal.id, 1_000, 2_000, 2_000);
  assert.equal(progress.rateBytesPerSecond, 500);
  assert.equal(progress.etaSeconds, 2);
  assert.equal(machine.pause(proposal.id).phase, "paused");
  assert.equal(machine.resume(proposal.id).phase, "downloading");
  assert.equal(machine.cancel(proposal.id).phase, "cancelled");
});

test("completion and failure are terminal and observable", async () => {
  const events: string[] = [];
  const machine = new DownloadStateMachine();
  machine.subscribe((event) => events.push(event.type));
  const proposal = machine.prepareStart(request);
  machine.confirmStart(proposal.id);
  await machine.startNext();
  assert.equal(machine.complete(proposal.id, 120).phase, "completed");
  assert.throws(() => machine.fail(proposal.id, "too late"), /terminal/);
  assert.deepEqual(events, ["proposal-created", "queued", "progress", "progress", "completed"]);
});

test("negative regression: unsafe URL, filename and destination are refused", () => {
  assert.throws(() => normalizeDownloadRequest({ ...request, extra: true } as any), /unknown fields/);
  assert.throws(() => normalizeDownloadRequest({ ...request, sourceUrl: "file:///secret" }), /HTTP or HTTPS/);
  assert.throws(() => normalizeDownloadRequest({ ...request, sourceUrl: "https://user:pass@example.test/a" }), /credentials/);
  assert.throws(() => normalizeDownloadRequest({ ...request, suggestedFilename: "../report.pdf" }), /single file name/);
  assert.throws(() => normalizeDownloadRequest({ ...request, destination: "../outside" }), /unsafe path/);
  assert.throws(() => normalizeDownloadRequest({ ...request, sourceUrl: `https://example.test/${"a".repeat(DOWNLOAD_LIMITS.maxUrlLength)}` }), /at most/);
});

test("negative regression: proposal limit applies before queue insertion", () => {
  const machine = new DownloadStateMachine();
  for (let index = 0; index < DOWNLOAD_LIMITS.maxQueuedItems; index++) {
    machine.prepareStart({ ...request, suggestedFilename: `report-${index}.pdf` });
  }
  assert.throws(() => machine.prepareStart({ ...request, suggestedFilename: "overflow.pdf" }), /queue is full/);
});

test("a transfer starter failure becomes an observable failed state", async () => {
  const machine = new DownloadStateMachine(() => { throw new Error("network adapter unavailable"); });
  const proposal = machine.prepareStart(request);
  machine.confirmStart(proposal.id);
  const result = await machine.startNext();
  assert.equal(result?.phase, "failed");
  assert.equal(result?.error, "network adapter unavailable");
});

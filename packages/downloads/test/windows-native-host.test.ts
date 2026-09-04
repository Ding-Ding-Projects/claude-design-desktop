import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WindowsNativeDownloadHost, type ProgressWindowOptions } from "../src/windows-native-host.js";

test("native host owns proposal, confirmation, queue persistence, transfer, and terminal close", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "download-host-"));
  const windows: string[] = [];
  const notifications: string[] = [];
  const closed: string[] = [];
  const host = new WindowsNativeDownloadHost({
    dataDirectory: path.join(root, "state"),
    downloadsDirectory: path.join(root, "Downloads"),
    fetchImpl: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("payload")); controller.close(); } }), { status: 200, headers: { "content-length": "7" } }),
    lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
    openStartDialog: () => undefined,
    progressWindow: { open: (options: ProgressWindowOptions) => { windows.push(`${options.title}:${options.frame}:${options.alwaysOnTop}:${options.customTitleBar}`); }, update: () => undefined, close: (id: string) => { closed.push(id); } },
    notify: (title: string) => { notifications.push(title); }
  });
  try {
    const proposal = await host.handle(JSON.stringify({ type: "propose-download", protocolVersion: 1, requestId: "request-1", request: { sourceUrl: "https://example.test/file.txt", suggestedFilename: "file.txt" } }));
    assert.equal(proposal.type, "proposal-ready");
    if (proposal.type !== "proposal-ready") return;
    const queue = await host.handle(JSON.stringify({ type: "confirm-download", protocolVersion: 1, requestId: "request-2", proposalId: proposal.proposalId, confirmation: { keyOne: true, keyTwo: true, slider: 1 } }));
    assert.equal(queue.type, "queued");
    await waitFor(() => closed.length === 1);
    await host.waitForIdle();
    assert.equal(await readFile(path.join(root, "Downloads", "file.txt"), "utf8"), "payload");
    assert.deepEqual(windows, ["Downloading:false:true:true"]);
    assert.deepEqual(notifications, ["Download complete"]);
    const persisted = JSON.parse(await readFile(path.join(root, "state", "queue.json"), "utf8"));
    assert.equal(persisted.version, 1);
    assert.equal(persisted.records[0].phase, "completed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native host recovery requeues an interrupted active record without losing it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "download-host-recovery-"));
  try {
    const state = { version: 1, records: [{ id: "download-restored", request: { sourceUrl: "https://example.test/file.txt", filename: "file.txt", destination: "downloads", sourceLabel: "example.test" }, phase: "downloading", bytesReceived: 2, rateBytesPerSecond: 1, progressWindow: { alwaysOnTop: true, accessibleName: "Download progress", windowId: "progress-download-restored", visible: true } }] };
    await mkdir(path.join(root, "state"), { recursive: true });
    await writeFile(path.join(root, "state", "queue.json"), JSON.stringify(state));
    const host = new WindowsNativeDownloadHost({ dataDirectory: path.join(root, "state"), downloadsDirectory: path.join(root, "Downloads"), fetchImpl: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("ok")); controller.close(); } }), { status: 200 }), lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }], progressWindow: { open: () => undefined, update: () => undefined, close: () => undefined }, openStartDialog: () => undefined, notify: () => undefined });
    await host.recover();
    await waitFor(async () => { try { await stat(path.join(root, "Downloads", "file.txt")); return true; } catch { return false; } });
    await host.waitForIdle();
    const persisted = JSON.parse(await readFile(path.join(root, "state", "queue.json"), "utf8"));
    assert.equal(persisted.records[0].phase, "completed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native host exposes collisions and requires the complete super confirmation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "download-host-collision-"));
  try {
    await mkdir(path.join(root, "Downloads"), { recursive: true });
    await writeFile(path.join(root, "Downloads", "file.txt"), "existing");
    const host = new WindowsNativeDownloadHost({ dataDirectory: path.join(root, "state"), downloadsDirectory: path.join(root, "Downloads"), lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }], statfsImpl: async () => ({ bavail: 10_000, bsize: 4_096 } as any), progressWindow: { open: () => undefined, update: () => undefined, close: () => undefined }, openStartDialog: () => undefined, notify: () => undefined });
    const proposal = await host.handle(JSON.stringify({ type: "propose-download", protocolVersion: 1, requestId: "request-1", request: { sourceUrl: "https://example.test/file.txt", suggestedFilename: "file.txt" } }));
    assert.equal(proposal.type, "proposal-ready");
    if (proposal.type !== "proposal-ready") return;
    assert.equal(proposal.preflight.collision, true);
    const rejected = await host.handle(JSON.stringify({ type: "confirm-download", protocolVersion: 1, requestId: "request-2", proposalId: proposal.proposalId, confirmation: { keyOne: true, keyTwo: false, slider: 0 } }));
    assert.equal(rejected.type, "rejected");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("native host refuses redirects and private DNS answers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "download-host-policy-"));
  try {
    const base = { dataDirectory: path.join(root, "state"), downloadsDirectory: path.join(root, "Downloads"), statfsImpl: async () => ({ bavail: 10_000, bsize: 4_096 } as any), progressWindow: { open: () => undefined, update: () => undefined, close: () => undefined }, openStartDialog: () => undefined, notify: () => undefined };
    const redirectHost = new WindowsNativeDownloadHost({ ...base, lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.test/file.txt" } }) });
    const p = await redirectHost.handle(JSON.stringify({ type: "propose-download", protocolVersion: 1, requestId: "r1", request: { sourceUrl: "https://example.test/file.txt", suggestedFilename: "file.txt" } }));
    if (p.type !== "proposal-ready") return;
    await redirectHost.handle(JSON.stringify({ type: "confirm-download", protocolVersion: 1, requestId: "r2", proposalId: p.proposalId, confirmation: { keyOne: true, keyTwo: true, slider: 1 } }));
    await redirectHost.waitForIdle();
    const privateHost = new WindowsNativeDownloadHost({ ...base, lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }] });
    const privateProposal = await privateHost.handle(JSON.stringify({ type: "propose-download", protocolVersion: 1, requestId: "r3", request: { sourceUrl: "https://example.test/file.txt", suggestedFilename: "file.txt" } }));
    assert.equal(privateProposal.type, "rejected");
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function waitFor(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!(await predicate()) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await predicate(), true, "timed out waiting for native transfer");
}

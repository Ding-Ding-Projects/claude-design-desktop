import test from "node:test";
import assert from "node:assert/strict";
import { OllamaClient, OllamaProtocolError, MemoryPullStateStore, SerializedPullStateStore, PullQueue, assessHardwareFit, assertAttachmentCapabilities, createHarnessPreview, validateLoopbackBaseUrl, validateHarnessProfile, HarnessManager, __test } from "../src/index.js";

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response { return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }); }

test("loopback transport rejects credentials and non-local endpoints", () => {
  assert.throws(() => validateLoopbackBaseUrl("https://user:pass@example.test"), OllamaProtocolError);
  assert.throws(() => validateLoopbackBaseUrl("http://192.168.1.5:11434"), OllamaProtocolError);
  assert.equal(validateLoopbackBaseUrl("http://127.0.0.1:11434").hostname, "127.0.0.1");
});

test("health, version, installed, and running models use documented local paths", async () => {
  const paths: string[] = [];
  const client = new OllamaClient("http://127.0.0.1:11434", async (input) => { const path = new URL(input).pathname; paths.push(path); if (path === "/api/version") return response({ version: "0.1.0" }); if (path === "/api/tags") return response({ models: [{ name: "mistral:latest", size: 10 }] }); return response({ models: [{ name: "mistral:latest", size: 10 }] }); });
  assert.deepEqual(await client.health(), { healthy: true, version: "0.1.0", status: 200 });
  assert.equal((await client.installedModels())[0].name, "mistral:latest");
  assert.equal((await client.runningModels())[0].name, "mistral:latest");
  assert.deepEqual(paths, ["/api/version", "/api/tags", "/api/ps"]);
});

test("catalog refresh follows every page and preserves honest metadata", async () => {
  const client = new OllamaClient("http://127.0.0.1:11434", async (input) => { const url = new URL(input); if (url.pathname === "/api/tags") return response({ models: [{ name: "a:latest" }] }); if (url.pathname === "/api/ps") return response({ models: [] }); if (url.searchParams.get("cursor") === "two") return response({ variants: [{ name: "b", tag: "latest" }], revision: "r2" }); return response({ variants: [{ name: "a", tag: "latest" }], next: "/catalog?cursor=two", revision: "r1" }); });
  const state = await client.refreshCatalog("/catalog");
  assert.equal(state.complete, true); assert.equal(state.pageCount, 2); assert.equal(state.sourceRevision, "r1");
  assert.deepEqual(state.variants.map((v) => v.tag), ["latest", "latest"]);
});

test("catalog repetition is a negative regression and falls back offline", async () => {
  const client = new OllamaClient("http://127.0.0.1:11434", async () => response({ variants: [{ name: "a", tag: "latest" }], next: "/next" }));
  const previous = { variants: [], installed: [], running: [], refreshedAt: "2026-01-01T00:00:00Z", pageCount: 1, complete: true, stale: false, offline: false };
  const state = await client.refreshCatalog("/catalog", previous, 2);
  assert.equal(state.complete, false); assert.equal(state.offline, true); assert.equal(state.stale, true); assert.equal(state.refreshedAt, previous.refreshedAt);
});

test("catalog pagination cannot escape the local endpoint", async () => {
  const client = new OllamaClient("http://127.0.0.1:11434", async () => response({ variants: [], next: "https://example.test/catalog" }));
  const state = await client.refreshCatalog("/catalog");
  assert.equal(state.offline, true); assert.match(state.error ?? "", /escaped the local API path/);
});

test("hardware fit is conservative and never guesses from a name", () => {
  const unknown = assessHardwareFit({ name: "x", tag: "latest" }, { capturedAt: "2026-01-01T00:00:00Z", ramBytes: 1e9, freeDiskBytes: 1e9 });
  assert.equal(unknown.verdict, "Unknown");
  const well = assessHardwareFit({ name: "x", tag: "latest", sizeBytes: 100, requiredMemoryBytes: 100, requiredVramBytes: 10 }, { capturedAt: "2026-01-01T00:00:00Z", ramBytes: 1_000, vramBytes: 1_000, freeDiskBytes: 1_000 });
  assert.equal(well.verdict, "Runs well");
});

test("attachments remain visible to callers but unsupported types are refused", () => {
  assert.throws(() => assertAttachmentCapabilities([{ mimeType: "image/png", base64: "AA==", bytes: 1 }], { attachmentMimeTypes: ["text/plain"] }), OllamaProtocolError);
  assert.doesNotThrow(() => assertAttachmentCapabilities([{ mimeType: "image/png", base64: "AA==", bytes: 1 }], { attachmentMimeTypes: ["image/png"] }));
});

test("chat consumes a local streamed response and rejects oversized history", async () => {
  const client = new OllamaClient("http://127.0.0.1:11434", async (input, init) => {
    assert.equal(new URL(input).pathname, "/api/chat");
    assert.equal((JSON.parse(String(init?.body)) as { stream: boolean }).stream, true);
    return new Response('{"message":{"role":"assistant","content":"hello"}}\n{"done":true}\n', { headers: { "content-type": "application/x-ndjson" } });
  });
  const events = [];
  for await (const event of client.chat({ model: "m:latest", messages: [{ role: "user", content: "hi" }] })) events.push(event);
  assert.equal(events[0].message?.content, "hello"); assert.equal(events[1].done, true);
  assert.throws(() => assertAttachmentCapabilities([{ mimeType: "image/png", base64: "AA==", bytes: 25 * 1024 * 1024 + 1 }], { attachmentMimeTypes: ["image/png"] }), OllamaProtocolError);
});

test("pull queue has bounded concurrency and partial outcomes", async () => {
  let active = 0; let peak = 0;
  const client = new OllamaClient("http://127.0.0.1:11434", async () => response(""));
  (client as unknown as { pull: OllamaClient["pull"] }).pull = async (tag, onProgress) => { active++; peak = Math.max(peak, active); onProgress?.({ status: "success", completedBytes: 1, totalBytes: 1 }); await new Promise((resolve) => setTimeout(resolve, 2)); active--; if (tag === "bad:latest") throw new Error("simulated pull failure"); };
  const store = new MemoryPullStateStore(); const queue = new PullQueue(client, store, 2); await queue.enqueue(["one:latest", "bad:latest", "two:latest"]); const records = await queue.run();
  assert.equal(peak, 2); assert.equal(records.find((r) => r.tag === "bad:latest")?.status, "failed"); assert.equal(records.filter((r) => r.status === "pulled").length, 2);
});

test("serialized pull state validates and persists bounded queue metadata", async () => {
  let saved = "";
  const store = new SerializedPullStateStore(async () => saved, async (text) => { saved = text; });
  const source = [{ id: "1", tag: "m:latest", status: "queued" as const, updatedAt: "2026-01-01T00:00:00Z" }];
  await store.write(source); assert.deepEqual(await store.read(), source);
  saved = "{}"; await assert.rejects(() => store.read(), /must be an array/);
});

test("harness profiles reject arbitrary shell syntax and redact secrets in previews", () => {
  const base = { id: "local", label: "Local harness", executablePath: "C:\\Tools\\runner.exe", args: ["--token", "secret-value"], workingDirectory: "C:\\Project", environmentKeys: ["OLLAMA_HOST"], modelTag: "m:latest" };
  assert.equal(createHarnessPreview(base).args[1], "[redacted]");
  assert.throws(() => validateHarnessProfile({ ...base, executablePath: "C:\\Windows\\System32\\cmd.exe", args: ["/c", "echo ok"] }), OllamaProtocolError);
  assert.throws(() => validateHarnessProfile({ ...base, args: ["--ok; echo bad"] }), OllamaProtocolError);
});

test("failed harness health checks terminate and restore the saved profile", async () => {
  const profile = { id: "local", label: "Local harness", executablePath: "C:\\Tools\\runner.exe", args: [], workingDirectory: "C:\\Project", environmentKeys: [], modelTag: "m:latest" };
  const oldProfile = { ...profile, executablePath: "C:\\Tools\\old-runner.exe" };
  const snapshots = [{ id: "old-snapshot", profile: oldProfile, createdAt: "2026-01-01T00:00:00Z" }];
  const snapshotStore = { save: async (snapshot: typeof snapshots[number]) => { snapshots.push(snapshot); }, latest: async (_id: string) => snapshots[0] };
  let terminated = 0;
  const launcher = { launch: async () => ({ id: "process" }), health: async () => false, terminate: async () => { terminated++; } };
  const manager = new HarnessManager(launcher, snapshotStore, async () => ({}));
  manager.register(profile);
  await assert.rejects(() => manager.launch("local"), /rolled back/);
  assert.equal(terminated, 1); assert.equal(manager.preview("local").executablePath, oldProfile.executablePath);
});

test("malformed NDJSON is a negative regression", () => { assert.throws(() => __test.parseNdjsonLine("not-json"), OllamaProtocolError); });

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { OllamaClient, OllamaProtocolError, MemoryPullStateStore, PullQueue, assessHardwareFit, assertAttachmentCapabilities, decodeAttachments, createHarnessPreview, resolveAndPinLoopbackUrl, validateLoopbackBaseUrl, validateHarnessProfile, createProductHarnessRegistry, HarnessManager, LocalHardwareDetector, reconcileCatalog, InstalledModelSource, UnavailableCatalogSource, createWindowsHardwareProbe, __test } from "../src/index.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response { return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }); }
async function listen(server: any): Promise<number> { await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); return server.address().port; }

test("numeric loopback pinning rejects DNS rebinding and mixed answers", async () => {
  assert.throws(() => validateLoopbackBaseUrl("http://localhost:11434"), OllamaProtocolError);
  assert.equal((await resolveAndPinLoopbackUrl("http://ollama.local:11434", async () => ["127.0.0.1"])).hostname, "127.0.0.1");
  await assert.rejects(() => resolveAndPinLoopbackUrl("http://ollama.local:11434", async () => ["127.0.0.1", "::1"]), /exactly one/);
  await assert.rejects(() => resolveAndPinLoopbackUrl("http://ollama.local:11434", async () => ["192.168.0.2"]), /exactly one/);
});

test("fake local HTTP server sees exact official pull and chat payloads", async () => {
  const seen: Array<{ path: string; accept: string | null; body: any }> = [];
  const server = createServer((request: any, response: any) => { const chunks: any[] = []; request.on("data", (chunk: any) => chunks.push(chunk)); request.on("end", () => { const body = Buffer.concat(chunks).toString("utf8"); seen.push({ path: request.url, accept: request.headers.accept ?? null, body: body ? JSON.parse(body) : undefined }); response.writeHead(200, { "content-type": "application/x-ndjson" }); response.end('{"status":"success"}\n'); }); });
  const port = await listen(server); const client = new OllamaClient(`http://127.0.0.1:${port}`);
  await client.pull("llama3:latest");
  const chat = client.chat({ model: "llama3:latest", messages: [{ role: "user", content: "describe" }], attachments: [{ mimeType: "image/png", base64: PNG, bytes: atob(PNG).length }], capabilities: { attachmentMimeTypes: ["image/png"] } });
  for await (const _event of chat) { /* consume the stream */ }
  server.close();
  assert.equal(seen[0].path, "/api/pull"); assert.deepEqual(seen[0].body, { model: "llama3:latest", stream: true }); assert.equal(seen[0].accept, "application/x-ndjson");
  assert.equal(seen[1].path, "/api/chat"); assert.deepEqual(seen[1].body.messages[0].images, [PNG]); assert.equal(seen[1].body.stream, true); assert.equal(seen[1].accept, "application/x-ndjson");
});

test("response limits and deadlines apply during full streamed body consumption", async () => {
  let delayedClosed = false; const delayed = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"models":')); setTimeout(() => { if (!delayedClosed) controller.enqueue(new TextEncoder().encode("[]}")); }, 40); }, cancel() { delayedClosed = true; } });
  const client = new OllamaClient("http://127.0.0.1:11434", async () => new Response(delayed, { headers: { "content-type": "application/json" } }), 10, 100);
  await assert.rejects(() => client.installedModels(), /deadline|failed|abort|malformed/i);
  const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(101)); controller.close(); } });
  const bounded = new OllamaClient("http://127.0.0.1:11434", async () => new Response(oversized), 100, 100);
  await assert.rejects(() => bounded.installedModels(), /exceeds/);
});

test("catalog delivery stays honestly unavailable and local tags reconcile exactly", async () => {
  const client = new OllamaClient("http://127.0.0.1:11434", async (input) => new URL(input).pathname === "/api/tags" ? json({ models: [{ name: "llama3:latest" }] }) : json({ models: [{ name: "llama3:latest" }] }));
  const local = await new InstalledModelSource(client).refresh();
  const state = { variants: [{ name: "llama3", tag: "latest" }, { name: "qwen", tag: "7b" }], ...local, refreshedAt: "2026-01-01T00:00:00Z", pageCount: 0, complete: false, stale: true, offline: true };
  const matched = reconcileCatalog(state); assert.equal(matched[0].installed, true); assert.equal(matched[0].running, true); assert.equal(matched[1].installed, false);
  let cached: any = state; let saves = 0; const unavailable = new UnavailableCatalogSource({ load: async () => cached, save: async () => { saves++; } }); const fallback = await unavailable.refresh(); assert.equal(fallback.complete, false); assert.match(fallback.error ?? "", /No documented official exhaustive catalog source/); assert.equal(saves, 0);
});

test("hardware detector records actual probe values and fit stays conservative", async () => {
  const detector = new LocalHardwareDetector({ ramBytes: async () => 8_000, gpuModel: async () => "GPU", vramBytes: async () => 4_000, driver: async () => "driver", freeDiskBytes: async () => 8_000, architecture: async () => "x64", contextOverheadBytes: async () => 100 });
  const hardware = await detector.detect(); assert.equal(hardware.gpuModel, "GPU");
  const fit = assessHardwareFit({ name: "model", tag: "q4", sizeBytes: 100, requiredMemoryBytes: 100, requiredVramBytes: 100 }, hardware); assert.equal(fit.verdict, "Runs well"); assert.match(fit.assumptions[0], /published metadata/);
  assert.equal(assessHardwareFit({ name: "model", tag: "unknown" }, hardware).verdict, "Unknown");
});

test("pull queue recovers interrupted work, supports pause/resume, and avoids duplicate tags", async () => {
  let calls = 0; const client = { pull: async (_tag: string, onProgress: any, signal: AbortSignal) => { calls++; await onProgress({ status: "working", completedBytes: 1, totalBytes: 2 }); await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, 5); signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }, { once: true }); }); } } as unknown as OllamaClient;
  const store = new MemoryPullStateStore(); await store.writeAtomic([{ id: "recover", tag: "m:latest", status: "running", updatedAt: "2026-01-01T00:00:00Z" }]); const queue = new PullQueue(client, store, 1); await queue.enqueue(["m:latest"]); const recovered = await queue.run(); assert.equal(recovered.filter((record) => record.tag === "m:latest").length, 1); assert.equal(recovered[0].status, "pulled");
  await queue.enqueue(["pause:latest"]); const running = queue.run(); await new Promise((resolve) => setTimeout(resolve, 1)); const pauseRecord = (await store.read()).find((record) => record.tag === "pause:latest"); if (pauseRecord) await queue.pause(pauseRecord.id); await running; const paused = (await store.read()).find((record) => record.id === pauseRecord?.id); assert.equal(paused?.status, "paused"); if (paused) await queue.resume(paused.id); await queue.run(); assert.ok(calls >= 2);
});

test("reviewed product harness registry rejects unregistered hosts and filters environment", async () => {
  const profile = { id: "local", label: "Local harness", executablePath: "C:\\Tools\\runner.exe", args: ["--token=secret", "--password", "secret2"], workingDirectory: "C:\\Project", environmentKeys: ["OLLAMA_HOST"], modelTag: "m:latest", reviewed: true as const };
  const registry = createProductHarnessRegistry([profile]); const preview = createHarnessPreview(profile, registry); assert.deepEqual(preview.args, ["--token=[redacted]", "--password", "[redacted]"]);
  assert.throws(() => validateHarnessProfile({ ...profile, executablePath: "C:\\Tools\\runner.ps1" }), OllamaProtocolError); assert.throws(() => createHarnessPreview({ ...profile, args: ["--new-host.exe"] }, registry), OllamaProtocolError);
  const snapshots: any[] = [{ id: "old", profile, createdAt: "2026-01-01T00:00:00Z" }]; let supplied: Record<string, string> = {}; let terminated = 0;
  const manager = new HarnessManager({ launch: async (_p, env) => { supplied = env; return { id: "p" }; }, health: async () => false, terminate: async () => { terminated++; } }, { save: async (value) => { snapshots.push(value); }, latest: async () => snapshots[0] }, async () => ({ OLLAMA_HOST: "http://127.0.0.1:11434", SECRET: "hidden" }), registry);
  manager.register(profile); await assert.rejects(() => manager.launch("local"), /rolled back/); assert.deepEqual(supplied, { OLLAMA_HOST: "http://127.0.0.1:11434" }); assert.equal(terminated, 1);
});

test("the concrete Windows probe uses fixed commands and reports context overhead", async () => {
  const calls: string[][] = []; const probe = createWindowsHardwareProbe({ run: async (file, args) => { calls.push([file, ...args]); if (args.at(-1)?.includes("ComputerSystem")) return "8000"; if (args.at(-1)?.includes("VideoController")) return '{"Name":"GPU","AdapterRAM":4000,"DriverVersion":"1"}'; if (args.at(-1)?.includes("Get-PSDrive")) return "9000"; return "100"; } });
  assert.equal(await probe.ramBytes(), 8000); assert.equal(await probe.gpuModel(), "GPU"); assert.equal(await probe.vramBytes(), 4000); assert.equal(await probe.driver(), "1"); assert.equal(await probe.freeDiskBytes(), 9000); assert.equal(await probe.architecture(), process.arch); assert.equal(await probe.contextOverheadBytes(), 100); assert.equal(calls.every((call) => call[0] === "powershell.exe" && call[1] === "-NoProfile"), true);
});

test("attachment decoding rejects spoofed bytes and malformed chat options", () => {
  assert.deepEqual(decodeAttachments([{ mimeType: "image/png", base64: PNG, bytes: atob(PNG).length }], { attachmentMimeTypes: ["image/png"] })[0].base64, PNG);
  assert.throws(() => decodeAttachments([{ mimeType: "image/png", base64: "AA==", bytes: 1 }], { attachmentMimeTypes: ["image/png"] }), OllamaProtocolError);
  assert.throws(() => __test.parseNdjsonLine("not-json"), OllamaProtocolError);
  assert.doesNotThrow(() => assertAttachmentCapabilities(undefined, undefined));
});

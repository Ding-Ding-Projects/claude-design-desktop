import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { PassThrough, Writable } from "node:stream";
import { EventEmitter } from "node:events";
import { afterEach, describe, it } from "vitest";
import { AccountHost, CODEX_AUTH_KEYRING_SERVICE, deriveKeyringAccountKey, ensureCodexHome, readSafeConfig } from "../src/index.js";
import { AppServerClient, type SpawnFn } from "../src/jsonl-client.js";

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly messages: Array<{ id?: number; method?: string; params?: Record<string, unknown>; error?: { code: number } }> = [];
  readonly stdin = new Writable({ write: (chunk, _encoding, callback) => { const message = JSON.parse(String(chunk).trim()) as { id?: number; method?: string; params?: Record<string, unknown>; error?: { code: number } }; this.messages.push(message); if (message.method) this.handle(message as { id?: number; method: string; params?: Record<string, unknown> }); callback(); } });
  killed = false;
  constructor(private readonly respondToRequests = true) { super(); }
  private handle(request: { id?: number; method: string; params?: Record<string, unknown> }): void {
    const send = (result: unknown): void => { if (request.id !== undefined) this.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`); };
    if (request.method === "initialize") return send({ platformFamily: "windows" });
    if (!this.respondToRequests) return;
    if (request.method === "account/login/start") return send(request.params?.type === "chatgptDeviceCode" ? { type: "chatgptDeviceCode", loginId: "11111111-1111-1111-1111-111111111111", verificationUrl: "https://auth.openai.com/codex/device", userCode: "ABCD-1234" } : { type: "chatgpt", loginId: "22222222-2222-2222-2222-222222222222", authUrl: "https://chatgpt.com/auth/callback?code=private" });
    if (request.method === "account/read") return send({ account: { type: "chatgpt", email: "person@example.com", planType: "pro" }, requiresOpenaiAuth: true });
    if (request.method === "model/list") return send({ data: [{ id: "gpt-5.6-terra", model: "gpt-5.6-terra" }] });
    if (request.method === "thread/start") return send({ thread: { id: "thr_1", sessionId: "thr_1" }, accessToken: "must-not-cross-boundary" });
    if (request.method === "thread/resume" || request.method === "thread/read") return send({ thread: { id: String(request.params?.threadId ?? "thr_1") } });
    if (request.method === "turn/start") return send({ turn: { id: "turn_1", status: "inProgress" } });
    return send({});
  }
  kill(): boolean { this.killed = true; this.emit("exit", 0, null); return true; }
  notify(method: string, params: Record<string, unknown> = {}): void { this.stdout.write(`${JSON.stringify({ method, params })}\n`); }
  notifyRequest(id: number, method: string, params: Record<string, unknown> = {}): void { this.stdout.write(`${JSON.stringify({ id, method, params })}\n`); }
}
function fakeSpawn(respondToRequests = true): { spawn: SpawnFn; children: FakeChild[] } { const children: FakeChild[] = []; const spawn: SpawnFn = () => { const child = new FakeChild(respondToRequests); children.push(child); return child as never; }; return { spawn, children }; }
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("account host", () => {
  it("isolates two canonical CODEX_HOME keyring namespaces", async () => {
    const root = await mkdtemp(`${tmpdir()}\\claude-design-account-host-`); roots.push(root);
    const homeA = `${root}\\slot-a\\codex-home`; const homeB = `${root}\\slot-b\\codex-home`;
    await ensureCodexHome(homeA); await ensureCodexHome(homeB);
    assert.notEqual(deriveKeyringAccountKey(homeA), deriveKeyringAccountKey(homeB)); assert.equal(CODEX_AUTH_KEYRING_SERVICE, "Codex Auth");
    const config = await readSafeConfig(homeA); assert.match(config, /cli_auth_credentials_store = "keyring"/); assert.match(config, /forced_login_method = "chatgpt"/); assert.doesNotMatch(config, /auth\.json|api[_-]?key/i);
  });
  it("does not return a browser auth URL to renderer callers", async () => {
    const root = await mkdtemp(`${tmpdir()}\\claude-design-account-host-`); roots.push(root); const fake = fakeSpawn(); let opened = ""; let childEnvironment: NodeJS.ProcessEnv | undefined;
    const spawn: SpawnFn = (file, args, options) => { childEnvironment = options.env; return fake.spawn(file, args, options); };
    const host = new AccountHost({ accountsRoot: root, codexExecutable: "codex.exe", appVersion: "1.0.0", spawn, environment: { OPENAI_API_KEY: "must-not-cross", CODEX_ACCESS_TOKEN: "must-not-cross", CODEX_HOME: "C:\\foreign" }, openExternal: (url) => { opened = url; } });
    const challenge = await host.startLogin({ flow: "browser" }); assert.deepEqual(challenge, { flow: "browser", loginId: "22222222-2222-2222-2222-222222222222" }); assert.match(opened, /^https:\/\/chatgpt\.com\//); assert.equal("authUrl" in challenge, false); assert.equal(childEnvironment?.OPENAI_API_KEY, undefined); assert.equal(childEnvironment?.CODEX_ACCESS_TOKEN, undefined); assert.match(childEnvironment?.CODEX_HOME ?? "", new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); await host.close();
  });
  it("supports device login cancellation and active account routing", async () => {
    const root = await mkdtemp(`${tmpdir()}\\claude-design-account-host-`); roots.push(root); const fake = fakeSpawn(); const host = new AccountHost({ accountsRoot: root, codexExecutable: "codex.exe", appVersion: "1.0.0", spawn: fake.spawn });
    const challenge = await host.startLogin({ flow: "deviceCode" }); assert.equal(challenge.flow, "deviceCode"); if (challenge.flow === "deviceCode") { assert.equal(challenge.userCode, "ABCD-1234"); assert.equal(challenge.verificationUrl, "https://auth.openai.com/codex/device"); }
    await host.cancelLogin(challenge.loginId); const accounts = await host.list(); assert.equal(accounts[0]?.state, "signedOut"); await host.activate(accounts[0]!.slotId); const thread = await host.startThread({}); assert.equal(thread.thread.id, "thr_1"); assert.equal("accessToken" in thread, false); await host.close();
  });
  it("waits for both login notifications before accepting an account", async () => {
    const root = await mkdtemp(`${tmpdir()}\\claude-design-account-host-`); roots.push(root); const fake = fakeSpawn(); const host = new AccountHost({ accountsRoot: root, codexExecutable: "codex.exe", appVersion: "1.0.0", spawn: fake.spawn });
    const challenge = await host.startLogin({ flow: "deviceCode" }); const child = fake.children[0]!; child.notify("account/updated"); await new Promise((resolve) => setImmediate(resolve)); assert.equal((await host.list())[0]?.state, "signingIn"); child.notify("account/login/completed", { loginId: challenge.loginId, success: true, error: null }); await new Promise((resolve) => setImmediate(resolve)); assert.equal((await host.list())[0]?.state, "ready"); await host.close();
  });
  it("refuses rate-limit reads while a turn is active until explicit interrupt", async () => {
    const root = await mkdtemp(`${tmpdir()}\\claude-design-account-host-`); roots.push(root); const fake = fakeSpawn(); const host = new AccountHost({ accountsRoot: root, codexExecutable: "codex.exe", appVersion: "1.0.0", spawn: fake.spawn });
    const slot = await host.startLogin({ flow: "deviceCode" }); const child = fake.children[0]!; child.notify("account/login/completed", { loginId: slot.loginId, success: false }); await new Promise((resolve) => setImmediate(resolve)); const account = (await host.list())[0]!; await host.activate(account.slotId); const turn = await host.startTurn({ threadId: "thr_1", input: [{ type: "text", text: "hello" }] }); await assert.rejects(() => host.readRateLimits(account.slotId), /busy/); const interruption = host.interruptTurn("thr_1", turn.id); fake.children[1]!.notify("turn/completed", { threadId: "thr_1", turn: { id: turn.id, status: "interrupted" } }); await interruption; await host.close();
  });
  it("enforces request deadlines and rejects unsupported methods before they reach the process", async () => {
    const fake = fakeSpawn(false); const client = new AppServerClient({ codexExecutable: "codex.exe", codexHome: "C:\\accounts\\slot\\codex-home", appVersion: "1.0.0", spawn: fake.spawn, requestTimeoutMs: 10 }); await client.start(); await assert.rejects(() => client.request("account/read", { refreshToken: false }), /timed out/); await client.close();
    const responsive = fakeSpawn(); const second = new AppServerClient({ codexExecutable: "codex.exe", codexHome: "C:\\accounts\\slot\\codex-home", appVersion: "1.0.0", spawn: responsive.spawn }); await second.start(); await assert.rejects(() => second.request("not-a-stable-method")); await second.close();
  });
  it("replies to a server request without treating its id as a stale response", async () => {
    const fake = fakeSpawn(); const client = new AppServerClient({ codexExecutable: "codex.exe", codexHome: "C:\\accounts\\slot\\codex-home", appVersion: "1.0.0", spawn: fake.spawn }); await client.start(); fake.children[0]!.notifyRequest(991, "server/request"); await new Promise((resolve) => setImmediate(resolve)); assert.equal(fake.children[0]!.messages.some((message) => message.error?.code === -32601), true); await client.close();
  });
  it("rejects stale login ids and removes a slot only after owner preflight and logout", async () => {
    const root = await mkdtemp(`${tmpdir()}\\claude-design-account-host-`); roots.push(root); const fake = fakeSpawn(); const host = new AccountHost({ accountsRoot: root, codexExecutable: "codex.exe", appVersion: "1.0.0", spawn: fake.spawn, prepareRemoval: async (slotId) => ({ slotId, ownedProjectIds: [], sharedProjectIds: [], canRemove: true }) });
    const challenge = await host.startLogin({ flow: "deviceCode" }); await assert.rejects(() => host.cancelLogin("33333333-3333-3333-3333-333333333333"), /stale|unknown|invalid/i); await host.cancelLogin(challenge.loginId); const slot = (await host.list())[0]!; await host.remove({ slotId: slot.slotId, confirmed: true }); assert.equal((await host.list()).length, 0); await host.close();
  });
  it("maps local image handles through the authorized resolver instead of exposing paths", async () => {
    const root = await mkdtemp(`${tmpdir()}\\claude-design-account-host-`); roots.push(root); const fake = fakeSpawn(); let seenHandle = ""; const host = new AccountHost({ accountsRoot: root, codexExecutable: "codex.exe", appVersion: "1.0.0", spawn: fake.spawn, resolveProjectFileHandle: async (handle) => { seenHandle = handle; return "C:\\project\\image.png"; } });
    const challenge = await host.startLogin({ flow: "deviceCode" }); await host.cancelLogin(challenge.loginId); const slot = (await host.list())[0]!; await host.activate(slot.slotId); await host.startTurn({ threadId: "thr_1", input: [{ type: "localImage", projectFileHandle: "file-handle-1" }] }); assert.equal(seenHandle, "file-handle-1"); await host.close();
  });
});

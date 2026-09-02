import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { PassThrough, Writable } from "node:stream";
import { EventEmitter } from "node:events";
import { afterEach, describe, it } from "vitest";
import { AccountHost, AppServerClient, CODEX_AUTH_KEYRING_SERVICE, deriveKeyringAccountKey, ensureCodexHome, readSafeConfig, type SpawnFn } from "../src/index.js";

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin = new Writable({ write: (chunk, _encoding, callback) => { this.handle(JSON.parse(String(chunk).trim()) as { id?: number; method: string; params?: Record<string, unknown> }); callback(); } });
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
    const root = await mkdtemp(`${tmpdir()}\\claude-design-account-host-`); roots.push(root); const fake = fakeSpawn(); let opened = "";
    const host = new AccountHost({ accountsRoot: root, codexExecutable: "codex.exe", appVersion: "1.0.0", spawn: fake.spawn, openExternal: (url) => { opened = url; } });
    const challenge = await host.startLogin({ flow: "browser" }); assert.deepEqual(challenge, { flow: "browser", loginId: "22222222-2222-2222-2222-222222222222" }); assert.match(opened, /^https:\/\/chatgpt\.com\//); assert.equal("authUrl" in challenge, false); await host.close();
  });
  it("supports device login cancellation and active account routing", async () => {
    const root = await mkdtemp(`${tmpdir()}\\claude-design-account-host-`); roots.push(root); const fake = fakeSpawn(); const host = new AccountHost({ accountsRoot: root, codexExecutable: "codex.exe", appVersion: "1.0.0", spawn: fake.spawn });
    const challenge = await host.startLogin({ flow: "deviceCode" }); assert.equal(challenge.flow, "deviceCode"); if (challenge.flow === "deviceCode") { assert.equal(challenge.userCode, "ABCD-1234"); assert.equal(challenge.verificationUrl, "https://auth.openai.com/codex/device"); }
    await host.cancelLogin(challenge.loginId); const accounts = await host.list(); assert.equal(accounts[0]?.state, "signedOut"); await host.activate(accounts[0]!.slotId); const thread = await host.startThread({}); assert.equal(thread.thread.id, "thr_1"); assert.equal("accessToken" in thread, false); await host.close();
  });
  it("enforces request deadlines and rejects unsupported methods before they reach the process", async () => {
    const fake = fakeSpawn(false); const client = new AppServerClient({ codexExecutable: "codex.exe", codexHome: "C:\\accounts\\slot\\codex-home", appVersion: "1.0.0", spawn: fake.spawn, requestTimeoutMs: 10 }); await client.start(); await assert.rejects(() => client.request("account/read"), /timed out/); await client.close();
    const responsive = fakeSpawn(); const second = new AppServerClient({ codexExecutable: "codex.exe", codexHome: "C:\\accounts\\slot\\codex-home", appVersion: "1.0.0", spawn: responsive.spawn }); await second.start(); await assert.rejects(() => second.request("not-a-stable-method")); await second.close();
  });
});

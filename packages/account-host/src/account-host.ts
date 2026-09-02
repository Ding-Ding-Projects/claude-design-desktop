import { ensureCodexHome, isAllowedAuthUrl, LOGIN_TIMEOUT_MS, sanitizeDeviceCode, sanitizeLoginId, sanitizeError, validateSlotId } from "./config.js";
import { AppServerClient, type SpawnFn } from "./jsonl-client.js";
import { AccountSlotStore, type StoredAccountSlot } from "./slot-store.js";
import type { AccountEvent, AccountSlotSummary, DesignOperationEvent, LoginChallenge, ModelSummary, RateLimitSnapshot, ThreadSnapshot, ThreadStartInput, TurnInput, TurnSnapshot, AccountHostApi } from "./types.js";

export interface AccountHostOptions { accountsRoot: string; codexExecutable: string; appVersion: string; openExternal?: (url: string) => Promise<void> | void; spawn?: SpawnFn; requestTimeoutMs?: number; environment?: NodeJS.ProcessEnv; }
interface ActiveSession { slotId: string; client: AppServerClient; }
interface LoginSession { slotId: string; loginId: string; client: AppServerClient; timer: NodeJS.Timeout; }

/** Account and app-server lifecycle host. Renderer code only receives sanitized domain DTOs. */
export class AccountHost implements AccountHostApi {
  private readonly options: AccountHostOptions;
  private readonly store: AccountSlotStore;
  private active: ActiveSession | undefined;
  private login: LoginSession | undefined;
  private initialized = false;
  private saveQueue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(event: AccountEvent | DesignOperationEvent) => void>();
  constructor(options: AccountHostOptions) { this.options = { ...options, openExternal: options.openExternal ?? (() => undefined) }; this.store = new AccountSlotStore(options.accountsRoot); }
  async initialize(): Promise<void> { if (this.initialized) return; await this.store.load(); this.initialized = true; }
  async list(): Promise<AccountSlotSummary[]> { await this.initialize(); return this.store.list().map(toSummary); }
  async startLogin(input: { slotId?: string; flow: "browser" | "deviceCode" }): Promise<LoginChallenge> {
    await this.initialize();
    if (this.login) throw new Error("Another account login is already in progress");
    const slot = input.slotId ? this.store.get(input.slotId) : this.store.create(`Account ${this.store.list().length + 1}`);
    let client: AppServerClient;
    try { client = await this.createClient(slot); } catch (error) { this.updateSlot(slot.slotId, { state: "unavailable" }); throw sanitizeError(error); }
    let loginResult: unknown;
    try { loginResult = await client.request("account/login/start", input.flow === "browser" ? { type: "chatgpt", useHostedLoginSuccessPage: true, appBrand: "codex" } : { type: "chatgptDeviceCode" }); }
    catch (error) { await client.close(); this.updateSlot(slot.slotId, { state: "error" }); throw sanitizeError(error); }
    const result = asRecord(loginResult);
    let loginId: string;
    try { loginId = sanitizeLoginId(result.loginId); }
    catch (error) { await client.close(); this.updateSlot(slot.slotId, { state: "error" }); throw sanitizeError(error); }
    const timer = setTimeout(() => { void this.expireLogin(loginId); }, LOGIN_TIMEOUT_MS);
    this.login = { slotId: slot.slotId, loginId, client, timer };
    this.updateSlot(slot.slotId, { state: "signingIn" });
    if (input.flow === "browser") {
      if (!isAllowedAuthUrl(result.authUrl)) { await this.finishLogin(loginId, false); throw new Error("App-server returned an unsafe authentication URL"); }
      try { await this.options.openExternal?.(result.authUrl); } catch (error) { await this.finishLogin(loginId, false); throw sanitizeError(error); }
      return { flow: "browser", loginId };
    }
    if (!isAllowedAuthUrl(result.verificationUrl)) { await this.finishLogin(loginId, false); throw new Error("App-server returned an unsafe device verification URL"); }
    return { flow: "deviceCode", loginId, verificationUrl: result.verificationUrl, userCode: sanitizeDeviceCode(result.userCode), expiresAt: new Date(Date.now() + LOGIN_TIMEOUT_MS).toISOString() };
  }
  async cancelLogin(loginId: string): Promise<void> { const current = this.login; if (!current || current.loginId !== sanitizeLoginId(loginId)) return; try { await current.client.request("account/login/cancel", { loginId: current.loginId }); } finally { await this.finishLogin(current.loginId, false); } }
  async activate(slotId: string): Promise<AccountSlotSummary> {
    await this.initialize(); const id = validateSlotId(slotId);
    if (this.login?.slotId === id) throw new Error("Account login is still in progress");
    if (this.active?.slotId !== id) { await this.closeActive(); const slot = this.store.get(id); const client = await this.createClient(slot); try { const account = await this.readAccount(client); if (!account) { throw new Error("Account is not authenticated"); } this.active = { slotId: id, client }; this.updateSlot(id, { ...account, state: "ready", lastVerifiedAt: new Date().toISOString() }); } catch (error) { await client.close(); this.updateSlot(id, { state: "error" }); throw sanitizeError(error); } }
    return this.store.get(id);
  }
  async logout(slotId: string): Promise<void> {
    await this.initialize(); const id = validateSlotId(slotId);
    if (this.active?.slotId === id) { try { await this.active.client.request("account/logout"); } finally { this.updateSlot(id, { state: "signedOut", email: null, planType: null }); await this.closeActive(); } return; }
    const client = await this.createClient(this.store.get(id)); try { await client.request("account/logout"); this.updateSlot(id, { state: "signedOut", email: null, planType: null }); } finally { await client.close(); }
  }
  async readRateLimits(slotId: string): Promise<RateLimitSnapshot> { return redactForRenderer(await this.clientFor(slotId).then((client) => client.request("account/rateLimits/read"))) as RateLimitSnapshot; }
  async listModels(): Promise<ModelSummary[]> { const result = asRecord(await this.requireActive().request("model/list")); return (result.data ?? result.models ?? []).filter(isRecord).map((model: Record<string, unknown>) => redactForRenderer(model)) as ModelSummary[]; }
  async startThread(input: ThreadStartInput): Promise<ThreadSnapshot> { return redactForRenderer(await this.requireActive().request("thread/start", input as Record<string, unknown>)) as ThreadSnapshot; }
  async resumeThread(threadId: string, options?: ThreadStartInput): Promise<ThreadSnapshot> { assertId(threadId, "thread id"); return redactForRenderer(await this.requireActive().request("thread/resume", { threadId, ...(options ?? {}) })) as ThreadSnapshot; }
  async readThread(threadId: string, includeTurns = false): Promise<ThreadSnapshot> { assertId(threadId, "thread id"); return redactForRenderer(await this.requireActive().request("thread/read", { threadId, includeTurns })) as ThreadSnapshot; }
  async injectItems(threadId: string, items: Array<Record<string, unknown>>): Promise<void> { assertId(threadId, "thread id"); if (!Array.isArray(items) || items.length > 10_000) throw new Error("Invalid thread items"); await this.requireActive().request("thread/inject_items", { threadId, items }); }
  async startTurn(input: TurnInput): Promise<TurnSnapshot> { assertId(input.threadId, "thread id"); if (!Array.isArray(input.input) || input.input.length > 100) throw new Error("Invalid turn input"); return redactForRenderer(await this.requireActive().request("turn/start", input as unknown as Record<string, unknown>)) as TurnSnapshot; }
  async interruptTurn(threadId: string, turnId: string): Promise<void> { assertId(threadId, "thread id"); assertId(turnId, "turn id"); await this.requireActive().request("turn/interrupt", { threadId, turnId }); }
  subscribe(listener: (event: AccountEvent | DesignOperationEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async close(): Promise<void> { if (this.login) await this.finishLogin(this.login.loginId, false); await this.closeActive(); await this.saveQueue; }
  private async createClient(slot: StoredAccountSlot): Promise<AppServerClient> {
    await ensureCodexHome(slot.home);
    const client = new AppServerClient({ codexExecutable: this.options.codexExecutable, codexHome: slot.home, appVersion: this.options.appVersion, requestTimeoutMs: this.options.requestTimeoutMs, spawn: this.options.spawn, environment: stripInheritedCodexHome(this.options.environment) });
    client.on("notification", (message: { method: string; params?: Record<string, unknown> }) => { void this.handleNotification(slot.slotId, client, message.method, message.params ?? {}); });
    await client.start(); return client;
  }
  private async handleNotification(slotId: string, client: AppServerClient, method: string, params: Record<string, unknown>): Promise<void> {
    if (method === "account/updated") { const account = await this.readAccount(client).catch(() => undefined); this.updateSlot(slotId, account ? { ...account, state: "ready", lastVerifiedAt: new Date().toISOString() } : { state: "signedOut" }); }
    if (method === "account/login/completed") { const loginId = typeof params.loginId === "string" ? params.loginId : undefined; if (loginId && this.login?.loginId === loginId) { const success = params.success === true; await this.finishLogin(loginId, success); this.emit({ type: "loginCompleted", slot: this.store.get(slotId), loginId, success }); } }
    if (method === "account/rateLimits/updated") this.emit({ type: "rateLimitsUpdated", slot: this.store.get(slotId) });
    if (method.startsWith("turn/") || method.startsWith("item/") || method.startsWith("thread/")) this.emit({ method, params: redactForRenderer(params) as Record<string, unknown> });
  }
  private async finishLogin(loginId: string, success: boolean): Promise<void> { const current = this.login; if (!current || current.loginId !== loginId) return; clearTimeout(current.timer); this.login = undefined; const account = success ? await this.readAccount(current.client).catch(() => undefined) : undefined; this.updateSlot(current.slotId, account ? { ...account, state: "ready", lastVerifiedAt: new Date().toISOString() } : { state: success ? "error" : "signedOut" }); await current.client.close(); }
  private async expireLogin(loginId: string): Promise<void> { const current = this.login; if (!current || current.loginId !== loginId) return; try { await current.client.request("account/login/cancel", { loginId }); } catch { /* close below */ } await this.finishLogin(loginId, false); }
  private async clientFor(slotId: string): Promise<AppServerClient> { const id = validateSlotId(slotId); if (this.active?.slotId !== id) await this.activate(id); return this.requireActive(); }
  private requireActive(): AppServerClient { if (!this.active) throw new Error("No active authenticated account"); return this.active.client; }
  private async closeActive(): Promise<void> { const current = this.active; this.active = undefined; if (current) await current.client.close(); }
  private async readAccount(client: AppServerClient): Promise<{ email: string | null; planType: string | null } | undefined> { const result = asRecord(await client.request("account/read", { refreshToken: false })); const account = asRecord(result.account); if (account.type !== "chatgpt") return undefined; return { email: typeof account.email === "string" ? account.email.slice(0, 320) : null, planType: typeof account.planType === "string" ? account.planType.slice(0, 80) : null }; }
  private updateSlot(slotId: string, patch: Parameters<AccountSlotStore["update"]>[1]): void { const slot = this.store.update(slotId, patch); this.saveQueue = this.saveQueue.then(() => this.store.save()).catch(() => undefined); this.emit({ type: "slotUpdated", slot: toSummary(slot) }); }
  private emit(event: AccountEvent | DesignOperationEvent): void { for (const listener of this.listeners) { try { listener(event); } catch { /* listeners cannot affect lifecycle */ } } }
}
function toSummary(slot: StoredAccountSlot): AccountSlotSummary { const { home: _home, ...summary } = slot; return summary; }
function stripInheritedCodexHome(environment: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv { const copy = { ...(environment ?? {}) }; delete copy.CODEX_HOME; return copy; }
function asRecord(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function assertId(value: string, label: string): void { if (typeof value !== "string" || value.length < 1 || value.length > 256 || /[\r\n]/.test(value)) throw new Error(`Invalid ${label}`); }
function redactForRenderer(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForRenderer);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/(?:token|authurl|authorization|cookie|secret|password|apikey)/i.test(key)) continue;
    output[key] = redactForRenderer(child);
  }
  return output;
}

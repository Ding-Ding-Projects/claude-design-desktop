import { ensureCodexHome, isAllowedAuthUrl, LOGIN_TIMEOUT_MS, sanitizeDeviceCode, sanitizeLoginId, sanitizeError, validateSlotId, CODEX_PACKAGE_VERSION, AccountHostError } from "./config.js";
import { AppServerClient, type SpawnFn } from "./jsonl-client.js";
import { AccountSlotStore, type StoredAccountSlot } from "./slot-store.js";
import { createSafeChildEnvironment, resolveBundledRuntime } from "./bundled-runtime.js";
import type { AccountEvent, AccountRemovalImpact, AccountSlotSummary, DesignOperationEvent, LoginChallenge, ModelSummary, RateLimitSnapshot, ThreadSnapshot, ThreadStartInput, ThreadInjectionItem, TurnInput, TurnSnapshot, AccountHostApi } from "./types.js";

export interface AccountHostOptions { accountsRoot: string; appVersion: string; resourcesRoot?: string; codexExecutable?: string; openExternal?: (url: string) => Promise<void> | void; spawn?: SpawnFn; requestTimeoutMs?: number; closeTimeoutMs?: number; environment?: NodeJS.ProcessEnv; prepareRemoval?: (slotId: string) => Promise<AccountRemovalImpact>; resolveProjectFileHandle?: (handle: string) => Promise<string>; }
interface ActiveOperation { threadId: string; turnId: string; interruptRequested: boolean; terminal: Promise<void>; resolveTerminal: () => void; }
interface ActiveSession { slotId: string; generation: number; client: AppServerClient; operations: Map<string, ActiveOperation>; completedTurnIds: Set<string>; closing: boolean; }
interface LoginSession { slotId: string; loginId: string; generation: number; client: AppServerClient; timer: NodeJS.Timeout; completed: boolean; success: boolean | null; accountUpdated: boolean; completing: boolean; }

/** Account and app-server lifecycle host. Renderer code only receives sanitized domain DTOs. */
export class AccountHost implements AccountHostApi {
  private readonly options: AccountHostOptions;
  private readonly store: AccountSlotStore;
  private active: ActiveSession | undefined;
  private login: LoginSession | undefined;
  private initialized = false;
  private saveQueue: Promise<void> = Promise.resolve();
  private nextGeneration = 1;
  private readonly generations = new WeakMap<AppServerClient, number>();
  private readonly listeners = new Set<(event: AccountEvent | DesignOperationEvent) => void>();
  constructor(options: AccountHostOptions) { this.options = { ...options, openExternal: options.openExternal ?? (() => undefined) }; this.store = new AccountSlotStore(options.accountsRoot); }
  async initialize(): Promise<void> { if (this.initialized) return; try { await this.store.load(); this.initialized = true; } catch (error) { throw sanitizeError(error); } }
  async list(): Promise<AccountSlotSummary[]> { await this.initialize(); return this.store.list().map(toSummary); }
  async startLogin(input: { slotId?: string; flow: "browser" | "deviceCode" }): Promise<LoginChallenge> {
    await this.initialize();
    if (this.login) throw new AccountHostError("busy", "The account is busy with another operation.");
    if (input.flow !== "browser" && input.flow !== "deviceCode") throw new AccountHostError("invalid_input", "The supplied value is invalid.");
    const slot = input.slotId ? this.store.get(input.slotId) : this.store.create(`Account ${this.store.list().length + 1}`);
    let client: AppServerClient;
    try { client = await this.createClient(slot); } catch (error) { this.updateSlot(slot.slotId, { state: "unavailable" }); throw sanitizeError(error); }
    let loginResult: unknown;
    try { loginResult = await client.request("account/login/start", input.flow === "browser" ? { type: "chatgpt", useHostedLoginSuccessPage: true, appBrand: "codex" } : { type: "chatgptDeviceCode" }); }
    catch (error) { await cancelLoginBeforeClose(client, undefined); await client.close(); this.updateSlot(slot.slotId, { state: "error" }); throw sanitizeError(error); }
    const result = asRecord(loginResult);
    let loginId: string;
    try { loginId = sanitizeLoginId(result.loginId); }
    catch (error) { await cancelLoginBeforeClose(client, undefined); await client.close(); this.updateSlot(slot.slotId, { state: "error" }); throw sanitizeError(error); }
    const timer = setTimeout(() => { void this.expireLogin(loginId); }, LOGIN_TIMEOUT_MS);
    this.login = { slotId: slot.slotId, loginId, generation: this.generationOf(client), client, timer, completed: false, success: null, accountUpdated: false, completing: false };
    this.updateSlot(slot.slotId, { state: "signingIn" });
    if (input.flow === "browser") {
      if (!isAllowedAuthUrl(result.authUrl)) { await this.finishLogin(loginId, false); throw new Error("App-server returned an unsafe authentication URL"); }
      try { await this.options.openExternal?.(result.authUrl); } catch (error) { await this.finishLogin(loginId, false); throw sanitizeError(error); }
      return { flow: "browser", loginId };
    }
    if (!isAllowedAuthUrl(result.verificationUrl)) { await this.finishLogin(loginId, false); throw new Error("App-server returned an unsafe device verification URL"); }
    return { flow: "deviceCode", loginId, verificationUrl: result.verificationUrl, userCode: sanitizeDeviceCode(result.userCode), expiresAt: new Date(Date.now() + LOGIN_TIMEOUT_MS).toISOString() };
  }
  async cancelLogin(loginId: string): Promise<void> { const validId = sanitizeLoginId(loginId); const current = this.login; if (!current || current.loginId !== validId) throw new AccountHostError("invalid_input", "The login challenge is stale or unknown."); await this.finishLogin(current.loginId, false); }
  async activate(slotId: string): Promise<AccountSlotSummary> {
    await this.initialize(); const id = validateSlotId(slotId);
    if (this.active?.closing) throw new AccountHostError("busy", "The previous account process has not confirmed exit.");
    if (this.login?.slotId === id) throw new AccountHostError("busy", "The account is busy with another operation.");
    if (this.active?.slotId !== id) { if (this.active?.closing) throw new AccountHostError("busy", "The previous account process has not confirmed exit."); this.assertNoActiveOperations(); await this.closeActive(); const slot = this.store.get(id); const client = await this.createClient(slot); try { const account = await this.readAccount(client); if (!account) { throw new Error("Account is not authenticated"); } this.active = { slotId: id, generation: this.generationOf(client), client, operations: new Map(), completedTurnIds: new Set(), closing: false }; this.updateSlot(id, { ...account, state: "ready", lastVerifiedAt: new Date().toISOString() }); } catch (error) { await client.close(); this.updateSlot(id, { state: "error" }); throw sanitizeError(error); } }
    return toSummary(this.store.get(id));
  }
  async logout(slotId: string): Promise<void> {
    await this.initialize(); const id = validateSlotId(slotId);
    if (this.active?.slotId === id) { if (this.active.closing) throw new AccountHostError("busy", "The previous account process has not confirmed exit."); this.assertNoActiveOperations(); try { await this.active.client.request("account/logout"); } finally { this.updateSlot(id, { state: "signedOut", email: null, planType: null }); await this.closeActive(); } return; }
    const client = await this.createClient(this.store.get(id)); try { await client.request("account/logout"); this.updateSlot(id, { state: "signedOut", email: null, planType: null }); } finally { await client.close(); }
  }
  async readRateLimits(slotId: string): Promise<RateLimitSnapshot> { this.assertNoActiveOperations(); return toRateLimitSnapshot(await this.clientFor(slotId).then((client) => client.request("account/rateLimits/read"))); }
  async listModels(): Promise<ModelSummary[]> { const result = asRecord(await this.requireActive().request("model/list")); return (result.data ?? result.models ?? []).filter(isRecord).map((model: Record<string, unknown>) => toModelSummary(model)).filter((model: ModelSummary | undefined): model is ModelSummary => model !== undefined); }
  async startThread(input: ThreadStartInput): Promise<ThreadSnapshot> { return toThreadSnapshot(await this.requireActive().request("thread/start", input as Record<string, unknown>)); }
  async resumeThread(threadId: string, options?: ThreadStartInput): Promise<ThreadSnapshot> { assertId(threadId, "thread id"); return toThreadSnapshot(await this.requireActive().request("thread/resume", { threadId, ...(options ?? {}) })); }
  async readThread(threadId: string, includeTurns = false): Promise<ThreadSnapshot> { assertId(threadId, "thread id"); return toThreadSnapshot(await this.requireActive().request("thread/read", { threadId, includeTurns })); }
  async injectItems(threadId: string, items: ThreadInjectionItem[]): Promise<void> { assertId(threadId, "thread id"); if (!Array.isArray(items) || items.length > 10_000) throw new AccountHostError("invalid_input", "The supplied value is invalid."); await this.requireActive().request("thread/inject_items", { threadId, items: items as unknown as Record<string, unknown>[] }); }
  async startTurn(input: TurnInput): Promise<TurnSnapshot> { assertId(input.threadId, "thread id"); if (!Array.isArray(input.input) || input.input.length > 100) throw new AccountHostError("invalid_input", "The supplied value is invalid."); const active = this.requireActiveSession(); if (active.operations.size > 0) throw new AccountHostError("busy", "The account is busy with another operation."); const protocolInput = await mapTurnInput(input.input, this.options.resolveProjectFileHandle); const turn = toTurnSnapshot(await active.client.request("turn/start", { ...input, input: protocolInput } as unknown as Record<string, unknown>)); if (!turn) throw new AccountHostError("operation_failed", "The account operation could not be completed."); const operation = createOperation(input.threadId, turn.id); if (active.completedTurnIds.delete(turn.id)) operation.resolveTerminal(); active.operations.set(turn.id, operation); return turn; }
  async interruptTurn(threadId: string, turnId: string): Promise<void> { assertId(threadId, "thread id"); assertId(turnId, "turn id"); const active = this.requireActiveSession(); const operation = active.operations.get(turnId); if (!operation || operation.threadId !== threadId) throw new AccountHostError("invalid_input", "The supplied value is invalid."); operation.interruptRequested = true; await active.client.request("turn/interrupt", { threadId, turnId }); await Promise.race([operation.terminal, new Promise<never>((_, reject) => setTimeout(() => reject(new AccountHostError("request_timeout", "The account service did not respond in time.")), 30_000))]); }
  async rendererDisconnected(): Promise<void> { if (this.login) await this.finishLogin(this.login.loginId, false); }
  async prepareRemoval(slotId: string): Promise<AccountRemovalImpact> { await this.initialize(); const id = validateSlotId(slotId); const impact = await this.options.prepareRemoval?.(id) ?? { slotId: id, ownedProjectIds: [], sharedProjectIds: [], canRemove: true }; return { slotId: id, ownedProjectIds: impact.ownedProjectIds.filter((value) => typeof value === "string").slice(0, 10_000), sharedProjectIds: impact.sharedProjectIds.filter((value) => typeof value === "string").slice(0, 10_000), canRemove: impact.canRemove === true }; }
  async remove(input: { slotId: string; confirmed: boolean }): Promise<void> { await this.initialize(); const id = validateSlotId(input.slotId); if (input.confirmed !== true) throw new AccountHostError("invalid_input", "Removal requires explicit confirmation."); const impact = await this.prepareRemoval(id); if (!impact.canRemove || impact.ownedProjectIds.length > 0) throw new AccountHostError("busy", "Owned projects must be transferred or removed first."); if (this.login?.slotId === id) await this.finishLogin(this.login.loginId, false); if (this.active?.slotId === id) this.assertNoActiveOperations(); await this.logout(id); await this.store.remove(id); }
  subscribe(listener: (event: AccountEvent | DesignOperationEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async close(): Promise<void> { this.assertNoActiveOperations(); if (this.login) await this.finishLogin(this.login.loginId, false); await this.closeActive(); await this.saveQueue; }
  private async createClient(slot: StoredAccountSlot): Promise<AppServerClient> {
    try { await ensureCodexHome(slot.home); } catch (error) { throw sanitizeError(error); }
    let runtime: Awaited<ReturnType<typeof resolveBundledRuntime>> | undefined;
    try { runtime = this.options.spawn ? undefined : await resolveBundledRuntime(this.options.resourcesRoot ?? ""); } catch (error) { throw sanitizeError(error); }
    const client = new AppServerClient({ codexExecutable: runtime?.executablePath ?? this.options.codexExecutable ?? "codex.exe", codexHome: slot.home, appVersion: this.options.appVersion, requestTimeoutMs: this.options.requestTimeoutMs, closeTimeoutMs: this.options.closeTimeoutMs, spawn: this.options.spawn, environment: createSafeChildEnvironment(this.options.environment, slot.home) });
    const generation = this.nextGeneration++;
    this.generations.set(client, generation);
    client.on("notification", (message: { method: string; params?: Record<string, unknown> }) => { void this.handleNotification(slot.slotId, client, generation, message.method, message.params ?? {}); });
    client.on("errorState", () => {
      if (this.active?.client === client && this.active.generation === generation) this.updateSlot(slot.slotId, { state: "unavailable" });
      if (this.login?.client === client && this.login.generation === generation && !this.login.completed) void this.finishLogin(this.login.loginId, false);
    });
    client.on("confirmedExit", () => {
      if (this.active?.client === client && this.active.generation === generation && this.active.closing) { this.active = undefined; this.updateSlot(slot.slotId, { state: "signedOut" }); }
    });
    await client.start(); return client;
  }
  private async handleNotification(slotId: string, client: AppServerClient, generation: number, method: string, params: Record<string, unknown>): Promise<void> {
    if (this.login?.client === client && this.login.generation === generation) {
      if (method === "account/login/completed") { this.login.completed = true; this.login.success = params.success === true; await this.maybeCompleteLogin(); return; }
      if (method === "account/updated") { this.login.accountUpdated = true; await this.maybeCompleteLogin(); return; }
    }
    if (this.active?.client !== client || this.active.generation !== generation) return;
    if (method === "account/updated") { const account = await this.readAccount(client).catch(() => undefined); this.updateSlot(slotId, account ? { ...account, state: "ready", lastVerifiedAt: new Date().toISOString() } : { state: "signedOut" }); }
    if (method === "account/rateLimits/updated") this.emit({ type: "rateLimitsUpdated", slot: toSummary(this.store.get(slotId)) });
    if (method === "turn/started") { const turnRecord = asRecord(params.turn); const turnId = typeof turnRecord.id === "string" ? turnRecord.id : typeof params.turnId === "string" ? params.turnId : ""; if (turnId && !this.active.operations.has(turnId)) this.active.operations.set(turnId, createOperation(typeof params.threadId === "string" ? params.threadId : "", turnId)); }
    if (method === "turn/completed" || method === "turn/aborted") { const turnRecord = asRecord(params.turn); const turnId = typeof turnRecord.id === "string" ? turnRecord.id : typeof params.turnId === "string" ? params.turnId : ""; const operation = this.active.operations.get(turnId); if (operation) { operation.resolveTerminal(); this.active.operations.delete(turnId); } else if (turnId) this.active.completedTurnIds.add(turnId); }
    const event = toOperationEvent(method, params); if (event) this.emit(event);
  }
  private async maybeCompleteLogin(): Promise<void> { const current = this.login; if (!current || current.completing || !current.completed || current.success === null || (current.success ? !current.accountUpdated : false)) return; current.completing = true; await this.finishLogin(current.loginId, current.success); this.emit({ type: "loginCompleted", slot: toSummary(this.store.get(current.slotId)), loginId: current.loginId, success: current.success }); }
  private async finishLogin(loginId: string, success: boolean): Promise<void> { const current = this.login; if (!current || current.loginId !== loginId) return; clearTimeout(current.timer); this.login = undefined; const verified = success && current.completed && current.accountUpdated; if (!verified) await cancelLoginBeforeClose(current.client, current.loginId); const account = verified ? await this.readAccount(current.client).catch(() => undefined) : undefined; this.updateSlot(current.slotId, account ? { ...account, state: "ready", lastVerifiedAt: new Date().toISOString() } : { state: verified ? "error" : "signedOut" }); await current.client.close(); }
  private async expireLogin(loginId: string): Promise<void> { const current = this.login; if (!current || current.loginId !== loginId) return; await this.finishLogin(loginId, false); }
  private async clientFor(slotId: string): Promise<AppServerClient> { const id = validateSlotId(slotId); if (this.active?.slotId !== id) await this.activate(id); return this.requireActive(); }
  private requireActive(): AppServerClient { return this.requireActiveSession().client; }
  private requireActiveSession(): ActiveSession { if (!this.active) throw new Error("No active authenticated account"); return this.active; }
  private assertNoActiveOperations(): void { if (this.active && this.active.operations.size > 0) throw new AccountHostError("busy", "The account is busy with another operation."); }
  private async closeActive(): Promise<void> { const current = this.active; if (!current) return; this.updateSlot(current.slotId, { state: "unavailable" }); try { await current.client.close(); this.active = undefined; } catch (error) { current.closing = true; throw sanitizeError(error); } }
  private generationOf(client: AppServerClient): number { const generation = this.generations.get(client); if (generation === undefined) throw new Error("Missing app-server process generation"); return generation; }
  private async readAccount(client: AppServerClient): Promise<{ email: string | null; planType: string | null } | undefined> { const result = asRecord(await client.request("account/read", { refreshToken: false })); const account = asRecord(result.account); if (account.type !== "chatgpt") return undefined; return { email: typeof account.email === "string" ? account.email.slice(0, 320) : null, planType: typeof account.planType === "string" ? account.planType.slice(0, 80) : null }; }
  private updateSlot(slotId: string, patch: Parameters<AccountSlotStore["update"]>[1]): void { const slot = this.store.update(slotId, { ...patch, appServerVersion: CODEX_PACKAGE_VERSION }); this.saveQueue = this.saveQueue.then(() => this.store.save()).catch(() => { this.emit({ type: "persistenceFailed", slot: toSummary(slot), errorCode: "persistence_failed" }); }); this.emit({ type: "slotUpdated", slot: toSummary(slot) }); }
  private emit(event: AccountEvent | DesignOperationEvent): void { for (const listener of this.listeners) { try { listener(event); } catch { /* listeners cannot affect lifecycle */ } } }
}
function toSummary(slot: StoredAccountSlot): AccountSlotSummary { const { home: _home, ...summary } = slot; return summary; }
function asRecord(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function assertId(value: string, label: string): void { if (typeof value !== "string" || value.length < 1 || value.length > 256 || /[\r\n]/.test(value)) throw new Error(`Invalid ${label}`); }
function toModelSummary(value: Record<string, unknown>): ModelSummary | undefined { if (typeof value.id !== "string" || value.id.length > 256) return undefined; return { id: value.id, model: typeof value.model === "string" ? value.model : value.id, displayName: typeof value.displayName === "string" ? value.displayName.slice(0, 256) : null, description: typeof value.description === "string" ? value.description.slice(0, 2000) : null, supportedReasoningEfforts: Array.isArray(value.supportedReasoningEfforts) ? value.supportedReasoningEfforts.filter((entry): entry is string => typeof entry === "string").slice(0, 32) : [] }; }
function toThreadSnapshot(value: unknown): ThreadSnapshot { const result = asRecord(value); const thread = toThreadSummary(result.thread); if (!thread) throw new Error("App-server returned an invalid thread"); const rawTurns = Array.isArray(result.turns) ? result.turns : Array.isArray(asRecord(result.thread).turns) ? asRecord(result.thread).turns : []; return { thread, turns: rawTurns.filter(isRecord).map((turn: Record<string, unknown>) => toTurnSnapshot(turn)).filter((turn: TurnSnapshot | undefined): turn is TurnSnapshot => turn !== undefined) }; }
function toThreadSummary(value: unknown): ThreadSnapshot["thread"] | undefined { const record = asRecord(value); if (typeof record.id !== "string" || record.id.length > 256) return undefined; return { id: record.id, sessionId: typeof record.sessionId === "string" ? record.sessionId : null, name: typeof record.name === "string" ? record.name.slice(0, 512) : null, status: typeof record.status === "string" ? record.status.slice(0, 80) : null }; }
function toTurnSnapshot(value: unknown): TurnSnapshot | undefined { const record = asRecord(value); const turn = asRecord(record.turn ?? value); if (typeof turn.id !== "string" || turn.id.length > 256) return undefined; return { id: turn.id, status: typeof turn.status === "string" ? turn.status.slice(0, 80) : null, errorCode: toTurnErrorCode(turn.error) }; }
function toTurnErrorCode(value: unknown): TurnSnapshot["errorCode"] { const code = String(asRecord(value).code ?? "").toLowerCase(); if (!code) return null; if (code.includes("auth")) return "authentication_required"; if (code.includes("rate") || code.includes("limit")) return "rate_limited"; if (code.includes("network") || code.includes("offline")) return "network_unavailable"; if (code.includes("interrupt") || code.includes("cancel")) return "cancelled"; if (code.includes("invalid")) return "invalid_input"; return "unknown"; }
function toRateLimitSnapshot(value: unknown): RateLimitSnapshot { const record = asRecord(value); return { primary: toRateLimitWindow(record.primary), secondary: toRateLimitWindow(record.secondary), credits: toCredits(record.credits), capturedAt: new Date().toISOString() }; }
function toRateLimitWindow(value: unknown): RateLimitSnapshot["primary"] { const record = asRecord(value); if (Object.keys(record).length === 0) return null; return { usedPercent: typeof record.usedPercent === "number" && Number.isFinite(record.usedPercent) ? Math.max(0, Math.min(100, record.usedPercent)) : null, windowDurationMins: typeof record.windowDurationMins === "number" && Number.isFinite(record.windowDurationMins) ? Math.max(0, record.windowDurationMins) : null, resetsAt: typeof record.resetsAt === "number" && Number.isFinite(record.resetsAt) ? record.resetsAt : null }; }
function toCredits(value: unknown): RateLimitSnapshot["credits"] { const record = asRecord(value); if (Object.keys(record).length === 0) return null; return { hasCredits: typeof record.hasCredits === "boolean" ? record.hasCredits : null, unlimited: typeof record.unlimited === "boolean" ? record.unlimited : null }; }
function toOperationEvent(method: string, params: Record<string, unknown>): DesignOperationEvent | undefined {
  const threadId = typeof params.threadId === "string" ? params.threadId.slice(0, 256) : null;
  if (method === "turn/started" || method === "turn/completed" || method === "turn/aborted") { const turnRecord = asRecord(params.turn); const turnId = typeof turnRecord.id === "string" ? turnRecord.id : typeof params.turnId === "string" ? params.turnId : null; if (!turnId) return undefined; return { type: method === "turn/started" ? "turnStarted" : "turnCompleted", threadId: threadId ?? "", turnId: turnId.slice(0, 256), status: typeof turnRecord.status === "string" ? turnRecord.status as string : null }; }
  if (method === "item/started" || method === "item/completed") { const item = asRecord(params.item); return { type: method === "item/started" ? "itemStarted" : "itemCompleted", threadId, itemId: typeof item.id === "string" ? item.id.slice(0, 256) : null, itemType: typeof item.type === "string" ? item.type.slice(0, 128) : null }; }
  if (method === "item/agentMessage/delta") return { type: "agentMessageDelta", threadId, itemId: typeof params.itemId === "string" ? params.itemId.slice(0, 256) : null, delta: typeof params.delta === "string" ? params.delta.slice(0, 100_000) : "" };
  const threadEvents: Record<string, DesignOperationEvent["type"]> = { "thread/started": "threadStarted", "thread/status/changed": "threadStatusChanged", "thread/closed": "threadClosed", "thread/archived": "threadArchived", "thread/unarchived": "threadUnarchived" };
  const type = threadEvents[method]; if (!type || !threadId) return undefined; return { type, threadId, status: typeof params.status === "string" ? params.status.slice(0, 80) : null } as DesignOperationEvent;
}
async function cancelLoginBeforeClose(client: AppServerClient, loginId: string | undefined): Promise<void> { if (!loginId) return; try { await client.request("account/login/cancel", { loginId }); } catch { /* close is still required when cancellation cannot be answered */ } }
function createOperation(threadId: string, turnId: string): ActiveOperation { let resolveTerminal: () => void = () => {}; const terminal = new Promise<void>((resolve) => { resolveTerminal = resolve; }); return { threadId, turnId, interruptRequested: false, terminal, resolveTerminal }; }
async function mapTurnInput(items: TurnInput["input"], resolver: ((handle: string) => Promise<string>) | undefined): Promise<Array<Record<string, unknown>>> { const mapped: Array<Record<string, unknown>> = []; for (const item of items) { if (item.type === "localImage") { if (!resolver) throw new AccountHostError("invalid_input", "A project file handle could not be resolved."); const path = await resolver(item.projectFileHandle); if (typeof path !== "string" || path.length === 0) throw new AccountHostError("invalid_input", "A project file handle could not be resolved."); mapped.push({ type: "localImage", path }); } else mapped.push(item); } return mapped; }

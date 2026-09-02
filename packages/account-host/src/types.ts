export type AccountSlotState = "signedOut" | "signingIn" | "ready" | "refreshing" | "offline" | "unavailable" | "error";
export type LoginChallenge =
  | { flow: "browser"; loginId: string }
  | { flow: "deviceCode"; loginId: string; verificationUrl: string; userCode: string; expiresAt: string };
export interface AccountSlotSummary { slotId: string; label: string; email: string | null; planType: string | null; state: AccountSlotState; lastVerifiedAt: string | null; }
export interface AccountEvent { type: "slotUpdated" | "loginCompleted" | "rateLimitsUpdated"; slot: AccountSlotSummary; loginId?: string; success?: boolean; }
export interface RateLimitSnapshot { [key: string]: unknown; }
export interface ModelSummary { id: string; model?: string; displayName?: string; description?: string; supportedReasoningEfforts?: string[]; [key: string]: unknown; }
export interface ThreadSummary { id: string; sessionId?: string; name?: string | null; status?: string; [key: string]: unknown; }
export interface ThreadSnapshot { thread: ThreadSummary; [key: string]: unknown; }
export interface TurnSnapshot { id: string; status?: string; [key: string]: unknown; }
export interface DesignOperationEvent { method: string; params: Record<string, unknown>; }
export interface ThreadStartInput { model?: string; cwd?: string; approvalPolicy?: string; sandbox?: string; sandboxPolicy?: Record<string, unknown>; personality?: string; serviceName?: string; }
export interface TurnInput { threadId: string; input: Array<Record<string, unknown>>; cwd?: string; model?: string; effort?: string; personality?: string; approvalPolicy?: string; sandboxPolicy?: Record<string, unknown>; outputSchema?: Record<string, unknown>; }
export interface AccountHostApi {
  list(): Promise<AccountSlotSummary[]>;
  startLogin(input: { slotId?: string; flow: "browser" | "deviceCode" }): Promise<LoginChallenge>;
  cancelLogin(loginId: string): Promise<void>;
  activate(slotId: string): Promise<AccountSlotSummary>;
  logout(slotId: string): Promise<void>;
  readRateLimits(slotId: string): Promise<RateLimitSnapshot>;
  listModels(): Promise<ModelSummary[]>;
  startThread(input: ThreadStartInput): Promise<ThreadSnapshot>;
  resumeThread(threadId: string, options?: ThreadStartInput): Promise<ThreadSnapshot>;
  readThread(threadId: string, includeTurns?: boolean): Promise<ThreadSnapshot>;
  injectItems(threadId: string, items: Array<Record<string, unknown>>): Promise<void>;
  startTurn(input: TurnInput): Promise<TurnSnapshot>;
  interruptTurn(threadId: string, turnId: string): Promise<void>;
  subscribe(listener: (event: AccountEvent | DesignOperationEvent) => void): () => void;
  close(): Promise<void>;
}

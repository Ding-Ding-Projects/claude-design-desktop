export type AccountSlotState = "signedOut" | "signingIn" | "ready" | "refreshing" | "offline" | "unavailable" | "error";
export type LoginChallenge =
  | { flow: "browser"; loginId: string }
  | { flow: "deviceCode"; loginId: string; verificationUrl: string; userCode: string; expiresAt: string };
export interface AccountSlotSummary { slotId: string; label: string; email: string | null; planType: string | null; state: AccountSlotState; lastVerifiedAt: string | null; appServerVersion: string; }
export interface AccountEvent { type: "slotUpdated" | "loginCompleted" | "rateLimitsUpdated" | "persistenceFailed"; slot: AccountSlotSummary; loginId?: string; success?: boolean; errorCode?: "persistence_failed"; }
export interface RateLimitWindow { usedPercent: number | null; windowDurationMins: number | null; resetsAt: number | null; }
export interface RateLimitSnapshot { primary: RateLimitWindow | null; secondary: RateLimitWindow | null; credits: { hasCredits: boolean | null; unlimited: boolean | null } | null; capturedAt: string; }
export interface ModelSummary { id: string; model: string; displayName: string | null; description: string | null; supportedReasoningEfforts: string[]; }
export interface ThreadSummary { id: string; sessionId: string | null; name: string | null; status: string | null; }
export interface ThreadSnapshot { thread: ThreadSummary; turns: TurnSnapshot[]; }
export type TurnErrorCode = "authentication_required" | "rate_limited" | "network_unavailable" | "cancelled" | "invalid_input" | "unknown";
export interface TurnSnapshot { id: string; status: string | null; errorCode: TurnErrorCode | null; }
export type DesignOperationEvent =
  | { type: "threadStarted" | "threadStatusChanged" | "threadClosed" | "threadArchived" | "threadUnarchived"; threadId: string; status: string | null }
  | { type: "turnStarted" | "turnCompleted"; threadId: string; turnId: string; status: string | null }
  | { type: "itemStarted" | "itemCompleted"; threadId: string | null; itemId: string | null; itemType: string | null }
  | { type: "agentMessageDelta"; threadId: string | null; itemId: string | null; delta: string };
export interface ThreadStartInput { model?: string; }
export type TurnInputItem = { type: "text"; text: string } | { type: "image"; url: string } | { type: "localImage"; projectFileHandle: string };
export type ThreadInjectionItem = { type: "message"; role: "user" | "assistant" | "developer"; content: Array<{ type: "input_text" | "output_text"; text: string }> } | { type: "functionCallOutput"; id: string; name: string; output: string };
export interface TurnInput { threadId: string; input: TurnInputItem[]; model?: string; effort?: string; }
export interface AccountRemovalImpact { slotId: string; ownedProjectIds: string[]; sharedProjectIds: string[]; canRemove: boolean; }
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
  injectItems(threadId: string, items: ThreadInjectionItem[]): Promise<void>;
  startTurn(input: TurnInput): Promise<TurnSnapshot>;
  interruptTurn(threadId: string, turnId: string): Promise<void>;
  rendererDisconnected(): Promise<void>;
  prepareRemoval(slotId: string): Promise<AccountRemovalImpact>;
  remove(input: { slotId: string; confirmed: boolean }): Promise<void>;
  subscribe(listener: (event: AccountEvent | DesignOperationEvent) => void): () => void;
  close(): Promise<void>;
}

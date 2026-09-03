export type AccountSlotState =
  | "signedOut"
  | "signingIn"
  | "ready"
  | "refreshing"
  | "offline"
  | "unavailable"
  | "error";

export type ProjectRole = "owner" | "editor" | "commenter" | "viewer";

export type AccountSlotSummary = {
  slotId: string;
  label: string;
  email: string | null;
  planType: string | null;
  state: AccountSlotState;
  lastVerifiedAt: string | null;
};

export type ProjectSummary = {
  projectId: string;
  name: string;
  role: ProjectRole;
  updatedAt: string;
};

export type AppProvenance = {
  version: string;
  updatedAt: string;
  timezone: string;
};

export type LoginChallenge =
  | { flow: "browser"; loginId: string }
  | {
      flow: "deviceCode";
      loginId: string;
      verificationUrl: string;
      userCode: string;
      expiresAt: string;
    };

export type AccountEvent =
  | { type: "updated"; account: AccountSlotSummary }
  | { type: "login-completed"; loginId: string; account: AccountSlotSummary }
  | { type: "error"; slotId: string; message: string };

export type WindowControlState = { maximized: boolean };

export type ProtocolRoute = { type: "home" } | { type: "open-project"; projectId: string };
export type AppRouteEvent = { version: 1; route: ProtocolRoute; status: "navigate" | "unavailable"; message?: string };

export function isAppRouteEvent(value: unknown): value is AppRouteEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || (record.status !== "navigate" && record.status !== "unavailable")) return false;
  if (record.status === "unavailable" && (typeof record.message !== "string" || record.message.length < 1 || record.message.length > 240)) return false;
  if (record.status === "navigate" && record.message !== undefined) return false;
  const route = record.route;
  if (typeof route !== "object" || route === null || Array.isArray(route)) return false;
  const routeRecord = route as Record<string, unknown>;
  if (routeRecord.type === "home") return Object.keys(routeRecord).length === 1 && Object.keys(record).length === 3;
  return routeRecord.type === "open-project"
    && typeof routeRecord.projectId === "string"
    && /^[a-zA-Z0-9_-]{1,128}$/.test(routeRecord.projectId)
    && Object.keys(routeRecord).length === 2
    && Object.keys(record).length === (record.status === "navigate" ? 3 : 4);
}

export const ACCOUNT_STATES: readonly AccountSlotState[] = ["signedOut", "signingIn", "ready", "refreshing", "offline", "unavailable", "error"];

export function isAccountEvent(value: unknown): value is AccountEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.type === "error") return typeof record.slotId === "string" && record.slotId.length >= 1 && record.slotId.length <= 128 && typeof record.message === "string" && record.message.length >= 1 && record.message.length <= 240 && Object.keys(record).length === 3;
  if (record.type !== "updated" && record.type !== "login-completed") return false;
  if (record.type === "login-completed" && (typeof record.loginId !== "string" || record.loginId.length < 1 || record.loginId.length > 200)) return false;
  const account = record.account;
  if (typeof account !== "object" || account === null || Array.isArray(account)) return false;
  const candidate = account as Record<string, unknown>;
  return typeof candidate.slotId === "string"
    && candidate.slotId.length >= 1 && candidate.slotId.length <= 128
    && typeof candidate.label === "string"
    && candidate.label.length >= 1 && candidate.label.length <= 120
    && (candidate.email === null || (typeof candidate.email === "string" && candidate.email.length <= 320))
    && (candidate.planType === null || (typeof candidate.planType === "string" && candidate.planType.length <= 80))
    && typeof candidate.state === "string"
    && ACCOUNT_STATES.includes(candidate.state as AccountSlotState)
    && (candidate.lastVerifiedAt === null || (typeof candidate.lastVerifiedAt === "string" && candidate.lastVerifiedAt.length <= 64))
    && Object.keys(candidate).length === 6
    && Object.keys(record).length === (record.type === "updated" ? 2 : 3);
}

export type DesignerBridge = {
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<WindowControlState>;
    close(): Promise<void>;
    showSystemMenu(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onStateChange(listener: (state: WindowControlState) => void): () => void;
  };
  accounts: {
    list(): Promise<AccountSlotSummary[]>;
    startLogin(input: { slotId?: string; flow: "browser" | "deviceCode" }): Promise<LoginChallenge>;
    cancelLogin(loginId: string): Promise<void>;
    activate(slotId: string): Promise<AccountSlotSummary>;
    logout(slotId: string): Promise<void>;
    subscribe(listener: (event: AccountEvent) => void): () => void;
  };
  projects: {
    list(): Promise<ProjectSummary[]>;
    create(input: { name: string }): Promise<ProjectSummary>;
    open(projectId: string): Promise<ProjectSummary>;
  };
  app: {
    provenance(): Promise<AppProvenance>;
    onRoute(listener: (event: AppRouteEvent) => void): () => void;
  };
};

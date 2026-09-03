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

export const ACCOUNT_STATES: readonly AccountSlotState[] = ["signedOut", "signingIn", "ready", "refreshing", "offline", "unavailable", "error"];

export function isAccountEvent(value: unknown): value is AccountEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.type === "error") return typeof record.slotId === "string" && typeof record.message === "string" && Object.keys(record).length === 3;
  if (record.type !== "updated" && record.type !== "login-completed") return false;
  if (record.type === "login-completed" && typeof record.loginId !== "string") return false;
  const account = record.account;
  if (typeof account !== "object" || account === null || Array.isArray(account)) return false;
  const candidate = account as Record<string, unknown>;
  return typeof candidate.slotId === "string"
    && typeof candidate.label === "string"
    && (candidate.email === null || typeof candidate.email === "string")
    && (candidate.planType === null || typeof candidate.planType === "string")
    && typeof candidate.state === "string"
    && ACCOUNT_STATES.includes(candidate.state as AccountSlotState)
    && (candidate.lastVerifiedAt === null || typeof candidate.lastVerifiedAt === "string")
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
  app: { provenance(): Promise<AppProvenance> };
};

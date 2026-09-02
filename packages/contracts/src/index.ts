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
  };
  app: { provenance(): Promise<AppProvenance> };
};

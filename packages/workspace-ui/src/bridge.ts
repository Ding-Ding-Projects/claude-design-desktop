export type AccountRole = "owner" | "editor" | "commenter" | "viewer";
export type AccountState = "signed-out" | "browser-pending" | "device-pending" | "ready" | "expired" | "rate-limited" | "logged-out" | "error";

export type AccountRateLimits = {
  remaining: number;
  resetAt?: string;
};

export type AccountSlot = {
  slotId: string;
  label: string;
  email?: string | null;
  plan?: string | null;
  lastVerified?: string | null;
  bundledVersion?: string | null;
  state: AccountState;
  expiresAt?: string;
  rateLimits?: AccountRateLimits;
};

/** Account is retained as a compatibility alias for hosts that used the first bridge revision. */
export type Account = AccountSlot;

export type Project = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  role: AccountRole;
  shared: boolean;
};

export type DesignSystem = {
  id: string;
  name: string;
  version: string;
  tokenCount: number;
  updatedAt: string;
};

export type WorkspaceFile = {
  path: string;
  kind: "file" | "folder";
  language?: string;
  size?: number;
};

export type PreviewHandle = {
  id: string;
  title: string;
  url: string;
  expiresAt?: string;
  close(): Promise<void>;
};

export const PREVIEW_PROTOCOLS = new Set(["claude-design-desktop:", "http:"]);
export const PREVIEW_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
  streaming?: boolean;
};

export type WorkspaceComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  replies: WorkspaceComment[];
};

export type ChatStreamEvent = {
  operationId: string;
  type: "chunk" | "complete" | "cancelled" | "error";
  chunk?: string;
  message?: string;
};

export type ShareRole = "can-edit" | "can-comment" | "can-view";

export type AccountLifecycleEvent =
  | { type: "login-started"; slot: AccountSlot }
  | { type: "login-updated"; slot: AccountSlot }
  | { type: "login-completed"; slot: AccountSlot }
  | { type: "login-cancelled"; slotId: string }
  | { type: "logged-out"; slotId: string }
  | { type: "rate-limit-updated"; slotId: string; rateLimits: AccountRateLimits };

export type DesignerBridge = {
  getSession(): Promise<{ authenticated: boolean; activeSlotId?: string }>;
  beginBrowserLogin(): Promise<{ slotId: string }>;
  beginDeviceLogin(): Promise<{ slotId: string; userCode: string; verificationUri: string; expiresAt?: string }>;
  listAccounts(): Promise<AccountSlot[]>;
  selectAccount(slotId: string): Promise<AccountSlot>;
  waitForAccountUpdate(slotId: string, signal: AbortSignal): Promise<AccountSlot>;
  cancelLogin(slotId: string): Promise<void>;
  logoutAccount(slotId: string): Promise<void>;
  subscribeAccountEvents(listener: (event: AccountLifecycleEvent) => void): () => void;
  listProjects(): Promise<Project[]>;
  createProject(input: { name: string; description: string }): Promise<Project>;
  openProject(projectId: string): Promise<{ project: Project; files: WorkspaceFile[] }>;
  listDesignSystems(): Promise<DesignSystem[]>;
  openPreview(projectId: string, filePath?: string): Promise<PreviewHandle>;
  listMigrationRecords?(): Promise<ReadonlyArray<{ id: string; label: string; state: "available" | "unavailable" }>>;
  readFile(projectId: string, filePath: string): Promise<{ content: string; language?: string }>;
  writeFile(projectId: string, filePath: string, content: string): Promise<void>;
  streamChat(
    projectId: string,
    prompt: string,
    operationId: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<{ messageId: string }>;
  interruptChat(operationId: string): Promise<void>;
  listComments(projectId: string): Promise<WorkspaceComment[]>;
  addComment(projectId: string, body: string): Promise<WorkspaceComment>;
  replyToComment(projectId: string, commentId: string, body: string): Promise<WorkspaceComment>;
  shareProject(projectId: string, recipientSlotId: string, role: ShareRole): Promise<void>;
  revokeShare(projectId: string, recipientSlotId: string): Promise<void>;
  transferProject(projectId: string, recipientSlotId: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  saveSettings(settings: Record<string, unknown>): Promise<void>;
  getSettings(): Promise<Record<string, unknown>>;
};

export const ROLE_CAPABILITIES: Record<AccountRole, ReadonlySet<string>> = {
  owner: new Set(["project:open", "file:read", "file:write", "chat", "comment", "share", "settings", "transfer"]),
  editor: new Set(["project:open", "file:read", "file:write", "chat", "comment"]),
  commenter: new Set(["project:open", "file:read", "chat", "comment"]),
  viewer: new Set(["project:open", "file:read"])
};

export function can(account: AccountSlot | undefined, capability: string, project?: Project): boolean {
  if (!account || account.state !== "ready") return false;
  if (capability === "project:create") return true;
  if (capability === "project:open") return true;
  if (!project) return false;
  return ROLE_CAPABILITIES[project.role]?.has(capability) ?? false;
}

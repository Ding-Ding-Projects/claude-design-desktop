export type AccountRole = "owner" | "editor" | "commenter" | "viewer";

export type Account = {
  id: string;
  label: string;
  email: string;
  role: AccountRole;
  ready: boolean;
};

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

export type ShareRole = "can-edit" | "can-comment" | "can-view";

export type DesignerBridge = {
  getSession(): Promise<{ authenticated: boolean; accountId?: string }>;
  beginBrowserLogin(): Promise<void>;
  beginDeviceLogin(): Promise<{ userCode: string; verificationUri: string }>;
  listAccounts(): Promise<Account[]>;
  selectAccount(accountId: string): Promise<Account>;
  listProjects(): Promise<Project[]>;
  createProject(input: { name: string; description: string }): Promise<Project>;
  openProject(projectId: string): Promise<{ project: Project; files: WorkspaceFile[] }>;
  listDesignSystems(): Promise<DesignSystem[]>;
  readFile(projectId: string, filePath: string): Promise<{ content: string; language?: string }>;
  writeFile(projectId: string, filePath: string, content: string): Promise<void>;
  streamChat(
    projectId: string,
    prompt: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<{ messageId: string }>;
  listComments(projectId: string): Promise<WorkspaceComment[]>;
  addComment(projectId: string, body: string): Promise<WorkspaceComment>;
  replyToComment(projectId: string, commentId: string, body: string): Promise<WorkspaceComment>;
  shareProject(projectId: string, recipient: string, role: ShareRole): Promise<void>;
  saveSettings(settings: Record<string, unknown>): Promise<void>;
  getSettings(): Promise<Record<string, unknown>>;
};

export const ROLE_CAPABILITIES: Record<AccountRole, ReadonlySet<string>> = {
  owner: new Set(["project:create", "project:open", "file:read", "file:write", "chat", "comment", "share", "settings"]),
  editor: new Set(["project:open", "file:read", "file:write", "chat", "comment", "share", "settings"]),
  commenter: new Set(["project:open", "file:read", "chat", "comment"]),
  viewer: new Set(["project:open", "file:read"])
};

export function can(account: Account | undefined, capability: string): boolean {
  return Boolean(account?.ready && ROLE_CAPABILITIES[account.role]?.has(capability));
}

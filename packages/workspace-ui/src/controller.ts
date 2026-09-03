import type {
  Account,
  AccountRole,
  ChatMessage,
  DesignerBridge,
  DesignSystem,
  Project,
  ShareRole,
  WorkspaceComment,
  WorkspaceFile
} from "./bridge";
import { can } from "./bridge";

export type AuthState = "signed-out" | "browser-pending" | "device-pending" | "ready" | "error";
export type OperationState = "idle" | "loading" | "streaming" | "saving" | "success" | "error" | "cancelled";

export type WorkspaceState = {
  auth: AuthState;
  accounts: Account[];
  activeAccount?: Account;
  projects: Project[];
  designSystems: DesignSystem[];
  activeProject?: Project;
  files: WorkspaceFile[];
  activeFile?: string;
  fileContent: string;
  fileLanguage?: string;
  chat: ChatMessage[];
  comments: WorkspaceComment[];
  settings: Record<string, unknown>;
  projectOperation: OperationState;
  fileOperation: OperationState;
  chatOperation: OperationState;
  commentOperation: OperationState;
  error?: string;
  notice?: string;
  deviceCode?: { userCode: string; verificationUri: string };
};

type Listener = (state: WorkspaceState) => void;

const initialState: WorkspaceState = {
  auth: "signed-out",
  accounts: [],
  projects: [],
  designSystems: [],
  files: [],
  fileContent: "",
  chat: [],
  comments: [],
  settings: {},
  projectOperation: "idle",
  fileOperation: "idle",
  chatOperation: "idle",
  commentOperation: "idle"
};

function message(role: ChatMessage["role"], text: string): ChatMessage {
  return { id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`, role, text, createdAt: new Date().toISOString() };
}

export class WorkspaceController {
  private state: WorkspaceState = { ...initialState };
  private readonly listeners = new Set<Listener>();
  private chatAbort?: AbortController;

  constructor(private readonly bridge: DesignerBridge) {}

  getState(): WorkspaceState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private patch(patch: Partial<WorkspaceState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private fail(error: unknown, operation?: keyof Pick<WorkspaceState, "projectOperation" | "fileOperation" | "chatOperation" | "commentOperation">): never {
    const text = error instanceof Error ? error.message : "The designer service returned an unknown error.";
    this.patch({ error: text, ...(operation ? { [operation]: "error" } : {}) });
    throw error;
  }

  has(capability: string): boolean {
    return can(this.state.activeAccount, capability);
  }

  async bootstrap(): Promise<void> {
    try {
      const session = await this.bridge.getSession();
      const accounts = await this.bridge.listAccounts();
      const activeAccount = accounts.find((account) => account.id === session.accountId && account.ready);
      this.patch({ accounts, activeAccount, auth: activeAccount && session.authenticated ? "ready" : "signed-out", settings: await this.bridge.getSettings() });
      if (activeAccount) await this.loadWorkspace();
    } catch (error) {
      this.fail(error);
    }
  }

  async beginBrowserLogin(): Promise<void> {
    this.patch({ auth: "browser-pending", error: undefined });
    try {
      await this.bridge.beginBrowserLogin();
      await this.bootstrap();
    } catch (error) {
      this.fail(error);
    }
  }

  async beginDeviceLogin(): Promise<void> {
    this.patch({ auth: "device-pending", error: undefined });
    try {
      this.patch({ deviceCode: await this.bridge.beginDeviceLogin() });
    } catch (error) {
      this.fail(error);
    }
  }

  async selectAccount(accountId: string): Promise<void> {
    try {
      const activeAccount = await this.bridge.selectAccount(accountId);
      if (!activeAccount.ready) throw new Error("This account is not ready for project access.");
      this.patch({ activeAccount, auth: "ready", error: undefined, notice: `Active account: ${activeAccount.label}` });
      await this.loadWorkspace();
    } catch (error) {
      this.fail(error, "projectOperation");
    }
  }

  async loadWorkspace(): Promise<void> {
    if (!this.state.activeAccount || !this.state.activeAccount.ready) throw new Error("A ready authenticated account is required before loading projects.");
    this.patch({ projectOperation: "loading", error: undefined });
    try {
      const [projects, designSystems] = await Promise.all([this.bridge.listProjects(), this.bridge.listDesignSystems()]);
      this.patch({ projects, designSystems, projectOperation: "success" });
    } catch (error) {
      this.fail(error, "projectOperation");
    }
  }

  async createProject(name: string, description: string): Promise<Project> {
    if (!this.has("project:create")) throw new Error("Your active account cannot create projects.");
    this.patch({ projectOperation: "loading", error: undefined });
    try {
      const project = await this.bridge.createProject({ name, description });
      this.patch({ projects: [project, ...this.state.projects], projectOperation: "success", notice: `Created ${project.name}` });
      return project;
    } catch (error) {
      this.fail(error, "projectOperation");
    }
  }

  async openProject(projectId: string): Promise<void> {
    if (!this.has("project:open")) throw new Error("A ready authenticated account is required before opening a project.");
    this.patch({ projectOperation: "loading", error: undefined });
    try {
      const result = await this.bridge.openProject(projectId);
      const project = this.state.projects.find((item) => item.id === projectId) ?? result.project;
      this.patch({ activeProject: project, files: result.files, activeFile: undefined, fileContent: "", comments: [], projectOperation: "success", notice: `Opened ${project.name}` });
      this.patch({ comments: await this.bridge.listComments(projectId) });
    } catch (error) {
      this.fail(error, "projectOperation");
    }
  }

  async openFile(filePath: string): Promise<void> {
    if (!this.state.activeProject || !this.has("file:read")) throw new Error("Open a project with file access first.");
    this.patch({ fileOperation: "loading", error: undefined });
    try {
      const file = await this.bridge.readFile(this.state.activeProject.id, filePath);
      this.patch({ activeFile: filePath, fileContent: file.content, fileLanguage: file.language, fileOperation: "success" });
    } catch (error) {
      this.fail(error, "fileOperation");
    }
  }

  async saveFile(content: string): Promise<void> {
    if (!this.state.activeProject || !this.state.activeFile || !this.has("file:write")) throw new Error("Your active account cannot edit this file.");
    this.patch({ fileOperation: "saving", error: undefined });
    try {
      await this.bridge.writeFile(this.state.activeProject.id, this.state.activeFile, content);
      this.patch({ fileContent: content, fileOperation: "success", notice: `Saved ${this.state.activeFile}` });
    } catch (error) {
      this.fail(error, "fileOperation");
    }
  }

  async sendChat(prompt: string): Promise<void> {
    if (!this.state.activeProject || !this.has("chat")) throw new Error("Your active account cannot use project chat.");
    const userMessage = message("user", prompt);
    const assistant = message("assistant", "");
    this.chatAbort?.abort();
    const abort = new AbortController();
    this.chatAbort = abort;
    this.patch({ chat: [...this.state.chat, userMessage, assistant], chatOperation: "streaming", error: undefined });
    try {
      await this.bridge.streamChat(this.state.activeProject.id, prompt, (chunk) => {
        const chat = this.state.chat.map((item) => item.id === assistant.id ? { ...item, text: item.text + chunk, streaming: true } : item);
        this.patch({ chat });
      }, abort.signal);
      this.patch({ chat: this.state.chat.map((item) => item.id === assistant.id ? { ...item, streaming: false } : item), chatOperation: "success" });
    } catch (error) {
      if (abort.signal.aborted) {
        this.patch({ chatOperation: "cancelled", notice: "Chat generation cancelled." });
        return;
      }
      this.fail(error, "chatOperation");
    }
  }

  cancelChat(): void {
    this.chatAbort?.abort();
  }

  async addComment(body: string): Promise<void> {
    if (!this.state.activeProject || !this.has("comment")) throw new Error("Your active account cannot comment here.");
    this.patch({ commentOperation: "loading", error: undefined });
    try {
      const comment = await this.bridge.addComment(this.state.activeProject.id, body);
      this.patch({ comments: [...this.state.comments, comment], commentOperation: "success" });
    } catch (error) {
      this.fail(error, "commentOperation");
    }
  }

  async replyComment(commentId: string, body: string): Promise<void> {
    if (!this.state.activeProject || !this.has("comment")) throw new Error("Your active account cannot reply here.");
    this.patch({ commentOperation: "loading", error: undefined });
    try {
      const updated = await this.bridge.replyToComment(this.state.activeProject.id, commentId, body);
      this.patch({ comments: this.state.comments.map((comment) => comment.id === commentId ? { ...comment, replies: [...comment.replies, updated] } : comment), commentOperation: "success" });
    } catch (error) {
      this.fail(error, "commentOperation");
    }
  }

  async share(recipient: string, role: ShareRole): Promise<void> {
    if (!this.state.activeProject || !this.has("share")) throw new Error("Your active account cannot share this project.");
    try {
      await this.bridge.shareProject(this.state.activeProject.id, recipient, role);
      this.patch({ notice: `Shared with ${recipient}` });
    } catch (error) {
      this.fail(error);
    }
  }

  async saveSettings(settings: Record<string, unknown>): Promise<void> {
    if (!this.has("settings")) throw new Error("Your active account cannot change settings.");
    try {
      await this.bridge.saveSettings(settings);
      this.patch({ settings: { ...this.state.settings, ...settings }, notice: "Settings saved." });
    } catch (error) {
      this.fail(error);
    }
  }

  signOut(): void {
    this.chatAbort?.abort();
    this.patch({ ...initialState, accounts: this.state.accounts, auth: "signed-out", error: undefined, notice: "Signed out." });
  }
}

export function createWorkspaceController(bridge: DesignerBridge): WorkspaceController {
  return new WorkspaceController(bridge);
}

export type { AccountRole };

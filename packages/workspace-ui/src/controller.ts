import type {
  AccountLifecycleEvent,
  AccountRole,
  AccountSlot,
  ChatStreamEvent,
  ChatMessage,
  DesignerBridge,
  DesignSystem,
  PreviewHandle,
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
  accounts: AccountSlot[];
  activeAccount?: AccountSlot;
  projects: Project[];
  designSystems: DesignSystem[];
  activeProject?: Project;
  files: WorkspaceFile[];
  activeFile?: string;
  fileContent: string;
  fileLanguage?: string;
  preview?: PreviewHandle;
  chat: ChatMessage[];
  comments: WorkspaceComment[];
  settings: Record<string, unknown>;
  projectOperation: OperationState;
  fileOperation: OperationState;
  chatOperation: OperationState;
  commentOperation: OperationState;
  previewOperation: OperationState;
  error?: string;
  notice?: string;
  deviceCode?: { slotId: string; userCode: string; verificationUri: string };
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
  commentOperation: "idle",
  previewOperation: "idle"
};

function message(role: ChatMessage["role"], text: string): ChatMessage {
  return { id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`, role, text, createdAt: new Date().toISOString() };
}

export class WorkspaceController {
  private state: WorkspaceState = { ...initialState };
  private readonly listeners = new Set<Listener>();
  private chatAbort?: AbortController;
  private authAbort?: AbortController;
  private workspaceGeneration = 0;
  private chatOperationId = 0;
  private readonly accountEventsUnsubscribe: () => void;

  constructor(private readonly bridge: DesignerBridge) {
    this.accountEventsUnsubscribe = bridge.subscribeAccountEvents((event) => this.handleAccountEvent(event));
  }

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

  private fail(error: unknown, operation?: keyof Pick<WorkspaceState, "projectOperation" | "fileOperation" | "chatOperation" | "commentOperation" | "previewOperation">): never {
    const text = error instanceof Error ? error.message : "The designer service returned an unknown error.";
    this.patch({ error: text, ...(operation ? { [operation]: "error" } : {}) });
    throw error;
  }

  has(capability: string): boolean {
    return can(this.state.activeAccount, capability, this.state.activeProject);
  }

  private handleAccountEvent(event: AccountLifecycleEvent): void {
    if (event.type === "login-started" || event.type === "login-updated" || event.type === "login-completed") {
      const accounts = this.state.accounts.some((account) => account.slotId === event.slot.slotId)
        ? this.state.accounts.map((account) => account.slotId === event.slot.slotId ? event.slot : account)
        : [...this.state.accounts, event.slot];
      const activeAccount = this.state.activeAccount?.slotId === event.slot.slotId ? event.slot : this.state.activeAccount;
      this.patch({ accounts, activeAccount, auth: event.type === "login-completed" && event.slot.state === "ready" ? "ready" : this.state.auth });
      return;
    }
    if (event.type === "rate-limit-updated") {
      this.patch({ accounts: this.state.accounts.map((account) => account.slotId === event.slotId ? { ...account, rateLimits: event.rateLimits } : account) });
      return;
    }
    if (event.type === "login-cancelled" || event.type === "logged-out") {
      const nextState: AccountSlot["state"] = event.type === "logged-out" ? "logged-out" : "signed-out";
      const accounts = this.state.accounts.map((account) => account.slotId === event.slotId ? { ...account, state: nextState } : account);
      if (this.state.activeAccount?.slotId === event.slotId) this.clearWorkspace(accounts, "The active account signed out.");
      else this.patch({ accounts });
    }
  }

  private clearWorkspace(accounts = this.state.accounts, notice?: string): void {
    this.authAbort?.abort();
    this.chatAbort?.abort();
    this.workspaceGeneration += 1;
    this.patch({ ...initialState, accounts, auth: "signed-out", notice, error: undefined });
  }

  async bootstrap(): Promise<void> {
    try {
      const session = await this.bridge.getSession();
      const accounts = await this.bridge.listAccounts();
      const activeAccount = accounts.find((account) => account.slotId === session.accountId && account.state === "ready");
      this.patch({ accounts, activeAccount, auth: activeAccount && session.authenticated === true ? "ready" : "signed-out", settings: await this.bridge.getSettings() });
      if (activeAccount && session.authenticated === true) await this.loadWorkspace();
    } catch (error) {
      this.fail(error);
    }
  }

  async beginBrowserLogin(): Promise<void> {
    this.patch({ auth: "browser-pending", error: undefined });
    try {
      const login = await this.bridge.beginBrowserLogin();
      this.authAbort?.abort();
      this.authAbort = new AbortController();
      const account = await this.bridge.waitForAccountUpdate(login.slotId, this.authAbort.signal);
      if (account.state !== "ready") throw new Error("Browser sign-in did not produce a ready account.");
      await this.selectAccount(account.slotId);
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
      if (activeAccount.state !== "ready") throw new Error("This account is not ready for project access.");
      this.patch({ activeAccount, auth: "ready", error: undefined, notice: `Active account: ${activeAccount.label}` });
      await this.loadWorkspace();
    } catch (error) {
      this.fail(error, "projectOperation");
    }
  }

  async loadWorkspace(): Promise<void> {
    if (!this.state.activeAccount || this.state.auth !== "ready" || this.state.activeAccount.state !== "ready") throw new Error("A ready authenticated account is required before loading projects.");
    const generation = ++this.workspaceGeneration;
    this.patch({ projectOperation: "loading", error: undefined });
    try {
      const [projects, designSystems] = await Promise.all([this.bridge.listProjects(), this.bridge.listDesignSystems()]);
      if (generation !== this.workspaceGeneration || this.state.auth !== "ready") return;
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
    const generation = ++this.workspaceGeneration;
    try {
      const result = await this.bridge.openProject(projectId);
      if (generation !== this.workspaceGeneration || this.state.auth !== "ready") return;
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

  async openPreview(): Promise<void> {
    if (!this.state.activeProject || !this.has("file:read")) throw new Error("Open a project with preview access first.");
    this.patch({ previewOperation: "loading", error: undefined });
    try {
      const preview = await this.bridge.openPreview(this.state.activeProject.id, this.state.activeFile);
      this.patch({ preview, previewOperation: "success" });
    } catch (error) {
      this.fail(error, "previewOperation");
    }
  }

  async closePreview(): Promise<void> {
    if (!this.state.preview) return;
    const preview = this.state.preview;
    await preview.close();
    this.patch({ preview: undefined, notice: "Preview closed." });
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
    const operationId = `chat-${++this.chatOperationId}`;
    this.chatAbort?.abort();
    const abort = new AbortController();
    this.chatAbort = abort;
    this.patch({ chat: [...this.state.chat, userMessage, assistant], chatOperation: "streaming", error: undefined });
    try {
      await this.bridge.streamChat(this.state.activeProject.id, prompt, operationId, (event: ChatStreamEvent) => {
        if (event.operationId !== operationId || abort.signal.aborted || this.chatOperationId.toString() !== operationId.slice("chat-".length)) return;
        if (event.type === "error") {
          this.patch({ error: event.message ?? "Chat stream failed.", chatOperation: "error" });
          return;
        }
        const chat = this.state.chat.map((item) => item.id === assistant.id ? { ...item, text: item.text + (event.chunk ?? ""), streaming: true } : item);
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
    const operationId = `chat-${this.chatOperationId}`;
    this.chatAbort?.abort();
    void this.bridge.interruptChat(operationId).catch(() => undefined);
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

  async revokeShare(recipientSlotId: string): Promise<void> {
    if (!this.state.activeProject || !this.has("share")) throw new Error("Only a project owner can change sharing.");
    await this.bridge.revokeShare(this.state.activeProject.id, recipientSlotId);
    this.patch({ notice: "Project access revoked." });
  }

  async transferProject(recipientSlotId: string): Promise<void> {
    if (!this.state.activeProject || !this.has("transfer")) throw new Error("Only a project owner can transfer this project.");
    await this.bridge.transferProject(this.state.activeProject.id, recipientSlotId);
    this.patch({ notice: "Project ownership transfer requested." });
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
    const slotId = this.state.activeAccount?.slotId;
    if (slotId) void this.bridge.logoutAccount(slotId).catch((error) => this.patch({ error: error instanceof Error ? error.message : "Sign-out failed." }));
    this.clearWorkspace(this.state.accounts, "Signed out.");
  }

  dispose(): void {
    this.accountEventsUnsubscribe();
    this.authAbort?.abort();
    this.chatAbort?.abort();
    if (this.state.preview) void this.state.preview.close();
  }
}

export function createWorkspaceController(bridge: DesignerBridge): WorkspaceController {
  return new WorkspaceController(bridge);
}

export type { AccountRole };

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
  deviceCode?: { slotId: string; userCode: string; verificationUri: string; expiresAt?: string };
};

type Listener = (state: WorkspaceState) => void;

const initialState: WorkspaceState = {
  auth: "signed-out",
  accounts: [],
  activeAccount: undefined,
  projects: [],
  designSystems: [],
  activeProject: undefined,
  files: [],
  activeFile: undefined,
  fileContent: "",
  fileLanguage: undefined,
  preview: undefined,
  chat: [],
  comments: [],
  settings: {},
  projectOperation: "idle",
  fileOperation: "idle",
  chatOperation: "idle",
  commentOperation: "idle",
  previewOperation: "idle",
  error: undefined,
  notice: undefined,
  deviceCode: undefined
};

function message(role: ChatMessage["role"], text: string): ChatMessage {
  return { id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`, role, text, createdAt: new Date().toISOString() };
}

export class WorkspaceController {
  private state: WorkspaceState = { ...initialState };
  private readonly listeners = new Set<Listener>();
  private chatAbort?: AbortController;
  private authAbort?: AbortController;
  private deviceExpiryTimer?: ReturnType<typeof setTimeout>;
  private workspaceGeneration = 0;
  private accountGeneration = 0;
  private projectGeneration = 0;
  private fileGeneration = 0;
  private commentGeneration = 0;
  private shareGeneration = 0;
  private settingsGeneration = 0;
  private previewGeneration = 0;
  private chatGeneration = 0;
  private chatOperationId = 0;
  private disposed = false;
  private pendingLoginSlotId?: string;
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
    if (this.disposed) return;
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
      if (event.type === "login-completed" && this.pendingLoginSlotId === event.slot.slotId) {
        this.pendingLoginSlotId = undefined;
        if (this.deviceExpiryTimer) clearTimeout(this.deviceExpiryTimer);
        this.deviceExpiryTimer = undefined;
        this.patch({ deviceCode: undefined });
      }
      const accounts = this.state.accounts.some((account) => account.slotId === event.slot.slotId)
        ? this.state.accounts.map((account) => account.slotId === event.slot.slotId ? event.slot : account)
        : [...this.state.accounts, event.slot];
      const activeAccount = this.state.activeAccount?.slotId === event.slot.slotId ? event.slot : this.state.activeAccount;
      this.patch({ accounts, activeAccount });
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
    if (this.deviceExpiryTimer) clearTimeout(this.deviceExpiryTimer);
    this.deviceExpiryTimer = undefined;
    this.pendingLoginSlotId = undefined;
    this.accountGeneration += 1;
    this.workspaceGeneration += 1;
    this.projectGeneration += 1;
    this.fileGeneration += 1;
    this.commentGeneration += 1;
    this.shareGeneration += 1;
    this.settingsGeneration += 1;
    this.previewGeneration += 1;
    this.chatGeneration += 1;
    this.patch({ ...initialState, accounts, auth: "signed-out", notice, error: undefined });
  }

  async bootstrap(): Promise<void> {
    const accountGeneration = ++this.accountGeneration;
    try {
      const session = await this.bridge.getSession();
      if (accountGeneration !== this.accountGeneration || this.disposed) return;
      const accounts = await this.bridge.listAccounts();
      if (accountGeneration !== this.accountGeneration || this.disposed) return;
      const activeAccount = accounts.find((account) => account.slotId === session.activeSlotId && account.state === "ready");
      const settings = await this.bridge.getSettings();
      if (accountGeneration !== this.accountGeneration || this.disposed) return;
      this.patch({ accounts, activeAccount, auth: activeAccount && session.authenticated === true ? "ready" : "signed-out", settings });
      if (activeAccount && session.authenticated === true) await this.loadWorkspace();
    } catch (error) {
      this.fail(error);
    }
  }

  async beginBrowserLogin(): Promise<void> {
    this.patch({ auth: "browser-pending", error: undefined });
    try {
      const login = await this.bridge.beginBrowserLogin();
      this.pendingLoginSlotId = login.slotId;
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
      const deviceCode = await this.bridge.beginDeviceLogin();
      if (deviceCode.expiresAt && !Number.isFinite(Date.parse(deviceCode.expiresAt))) throw new Error("The host returned an invalid device-code expiry.");
      this.pendingLoginSlotId = deviceCode.slotId;
      this.patch({ deviceCode });
      if (this.deviceExpiryTimer) clearTimeout(this.deviceExpiryTimer);
      if (deviceCode.expiresAt) {
        const delay = Math.min(2_147_483_647, Math.max(0, Date.parse(deviceCode.expiresAt) - Date.now()));
        if (delay === 0) {
          this.expireDeviceCode(deviceCode.slotId);
          return;
        }
        this.deviceExpiryTimer = setTimeout(() => this.expireDeviceCode(deviceCode.slotId), delay);
      }
    } catch (error) {
      this.fail(error);
    }
  }

  async cancelDeviceLogin(): Promise<void> {
    const slotId = this.state.deviceCode?.slotId ?? this.pendingLoginSlotId;
    if (!slotId) return;
    try {
      await this.bridge.cancelLogin(slotId);
      this.clearWorkspace(this.state.accounts, "Device sign-in cancelled.");
    } catch (error) {
      this.fail(error);
    }
  }

  async retryDeviceLogin(): Promise<void> {
    await this.cancelDeviceLogin();
    await this.beginDeviceLogin();
  }

  async copyDeviceCode(): Promise<void> {
    const code = this.state.deviceCode?.userCode;
    if (!code || typeof navigator === "undefined" || !navigator.clipboard) {
      this.patch({ error: "Device-code copy is unavailable in this host." });
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      this.patch({ notice: "Device code copied." });
    } catch (error) {
      this.fail(error);
    }
  }

  async openDeviceVerification(): Promise<void> {
    const url = this.state.deviceCode?.verificationUri;
    if (!url) return;
    try {
      await this.bridge.openExternal(url);
    } catch (error) {
      this.fail(error);
    }
  }

  private expireDeviceCode(slotId: string): void {
    if (this.state.deviceCode?.slotId !== slotId) return;
    this.deviceExpiryTimer = undefined;
    this.pendingLoginSlotId = undefined;
    this.patch({ deviceCode: undefined, auth: "signed-out", notice: "Device code expired. Start a new sign-in." });
  }

  async selectAccount(accountId: string): Promise<void> {
    const accountGeneration = ++this.accountGeneration;
    try {
      const before = await this.bridge.getSession();
      if (accountGeneration !== this.accountGeneration || this.disposed) return;
      if (before.authenticated !== true) throw new Error("The host session is not authenticated.");
      const knownSlot = this.state.accounts.find((account) => account.slotId === accountId);
      if ((!knownSlot || knownSlot.state !== "ready") && this.pendingLoginSlotId !== accountId) throw new Error("This account slot is not ready for project access.");
      const activeAccount = await this.bridge.selectAccount(accountId);
      const after = await this.bridge.getSession();
      if (accountGeneration !== this.accountGeneration || this.disposed) return;
      if (after.authenticated !== true || after.activeSlotId !== accountId || activeAccount.state !== "ready") throw new Error("Account selection did not produce an authenticated ready slot.");
      this.patch({ activeAccount, auth: "ready", error: undefined, notice: `Active account: ${activeAccount.label}` });
      await this.loadWorkspace();
    } catch (error) {
      this.fail(error, "projectOperation");
    }
  }

  async loadWorkspace(): Promise<void> {
    if (!this.state.activeAccount || this.state.auth !== "ready" || this.state.activeAccount.state !== "ready") throw new Error("A ready authenticated account is required before loading projects.");
    const accountGeneration = this.accountGeneration;
    const generation = ++this.workspaceGeneration;
    this.patch({ projectOperation: "loading", error: undefined });
    try {
      const [projects, designSystems] = await Promise.all([this.bridge.listProjects(), this.bridge.listDesignSystems()]);
      if (generation !== this.workspaceGeneration || accountGeneration !== this.accountGeneration || this.state.auth !== "ready") return;
      this.patch({ projects, designSystems, projectOperation: "success" });
    } catch (error) {
      this.fail(error, "projectOperation");
    }
  }

  async createProject(name: string, description: string): Promise<Project> {
    if (!this.has("project:create")) throw new Error("Your active account cannot create projects.");
    const accountGeneration = this.accountGeneration;
    const projectGeneration = ++this.projectGeneration;
    this.patch({ projectOperation: "loading", error: undefined });
    try {
      const project = await this.bridge.createProject({ name, description });
      if (accountGeneration !== this.accountGeneration || projectGeneration !== this.projectGeneration || this.state.auth !== "ready") return project;
      this.patch({ projects: [project, ...this.state.projects], projectOperation: "success", notice: `Created ${project.name}` });
      return project;
    } catch (error) {
      this.fail(error, "projectOperation");
    }
  }

  async openProject(projectId: string): Promise<void> {
    if (!this.has("project:open")) throw new Error("A ready authenticated account is required before opening a project.");
    if (!this.state.projects.some((project) => project.id === projectId)) throw new Error("That project is not in the current account's project list.");
    const accountGeneration = this.accountGeneration;
    const projectGeneration = ++this.projectGeneration;
    this.patch({ projectOperation: "loading", error: undefined });
    const generation = ++this.workspaceGeneration;
    try {
      const result = await this.bridge.openProject(projectId);
      if (generation !== this.workspaceGeneration || accountGeneration !== this.accountGeneration || projectGeneration !== this.projectGeneration || this.state.auth !== "ready") return;
      const project = this.state.projects.find((item) => item.id === projectId) ?? result.project;
      this.patch({ activeProject: project, files: result.files, activeFile: undefined, fileContent: "", comments: [], projectOperation: "success", notice: `Opened ${project.name}` });
      const comments = await this.bridge.listComments(projectId);
      if (generation !== this.workspaceGeneration || accountGeneration !== this.accountGeneration || projectGeneration !== this.projectGeneration || this.state.auth !== "ready" || this.state.activeProject?.id !== projectId) return;
      this.patch({ comments });
    } catch (error) {
      this.fail(error, "projectOperation");
    }
  }

  async openFile(filePath: string): Promise<void> {
    if (!this.state.activeProject || !this.has("file:read")) throw new Error("Open a project with file access first.");
    if (!this.state.files.some((file) => file.kind === "file" && file.path === filePath)) throw new Error("That file is not in the active project.");
    const accountGeneration = this.accountGeneration;
    const workspaceGeneration = this.workspaceGeneration;
    const fileGeneration = ++this.fileGeneration;
    const projectId = this.state.activeProject.id;
    this.patch({ fileOperation: "loading", error: undefined });
    try {
      const file = await this.bridge.readFile(projectId, filePath);
      if (accountGeneration !== this.accountGeneration || workspaceGeneration !== this.workspaceGeneration || fileGeneration !== this.fileGeneration || this.state.activeProject?.id !== projectId || this.state.auth !== "ready") return;
      this.patch({ activeFile: filePath, fileContent: file.content, fileLanguage: file.language, fileOperation: "success" });
    } catch (error) {
      this.fail(error, "fileOperation");
    }
  }

  async openPreview(): Promise<void> {
    if (!this.state.activeProject || !this.has("file:read")) throw new Error("Open a project with preview access first.");
    const accountGeneration = this.accountGeneration;
    const workspaceGeneration = this.workspaceGeneration;
    const previewGeneration = ++this.previewGeneration;
    const projectId = this.state.activeProject.id;
    this.patch({ previewOperation: "loading", error: undefined });
    try {
      const preview = await this.bridge.openPreview(projectId, this.state.activeFile);
      if (accountGeneration !== this.accountGeneration || workspaceGeneration !== this.workspaceGeneration || previewGeneration !== this.previewGeneration || this.state.activeProject?.id !== projectId || this.state.auth !== "ready") {
        await preview.close().catch(() => undefined);
        return;
      }
      this.patch({ preview, previewOperation: "success" });
    } catch (error) {
      this.fail(error, "previewOperation");
    }
  }

  async closePreview(): Promise<void> {
    if (!this.state.preview) return;
    const preview = this.state.preview;
    const previewGeneration = ++this.previewGeneration;
    try {
      await preview.close();
      if (previewGeneration !== this.previewGeneration || this.state.preview?.id !== preview.id) return;
      this.patch({ preview: undefined, notice: "Preview closed." });
    } catch (error) {
      this.fail(error, "previewOperation");
    }
  }

  async saveFile(content: string): Promise<void> {
    if (!this.state.activeProject || !this.state.activeFile || !this.has("file:write")) throw new Error("Your active account cannot edit this file.");
    if (!this.state.files.some((file) => file.kind === "file" && file.path === this.state.activeFile)) throw new Error("That file is not in the active project.");
    const accountGeneration = this.accountGeneration;
    const workspaceGeneration = this.workspaceGeneration;
    const fileGeneration = ++this.fileGeneration;
    const projectId = this.state.activeProject.id;
    const filePath = this.state.activeFile;
    this.patch({ fileOperation: "saving", error: undefined });
    try {
      await this.bridge.writeFile(projectId, filePath, content);
      if (accountGeneration !== this.accountGeneration || workspaceGeneration !== this.workspaceGeneration || fileGeneration !== this.fileGeneration || this.state.activeProject?.id !== projectId || this.state.activeFile !== filePath || this.state.auth !== "ready") return;
      this.patch({ fileContent: content, fileOperation: "success", notice: `Saved ${filePath}` });
    } catch (error) {
      this.fail(error, "fileOperation");
    }
  }

  async sendChat(prompt: string): Promise<void> {
    if (!this.state.activeProject || !this.has("chat")) throw new Error("Your active account cannot use project chat.");
    const userMessage = message("user", prompt);
    const assistant = message("assistant", "");
    const operationId = `chat-${++this.chatOperationId}`;
    const accountGeneration = this.accountGeneration;
    const workspaceGeneration = this.workspaceGeneration;
    const chatGeneration = ++this.chatGeneration;
    this.chatAbort?.abort();
    const abort = new AbortController();
    this.chatAbort = abort;
    this.patch({ chat: [...this.state.chat, userMessage, assistant], chatOperation: "streaming", error: undefined });
    try {
      await this.bridge.streamChat(this.state.activeProject.id, prompt, operationId, (event: ChatStreamEvent) => {
        if (event.operationId !== operationId || abort.signal.aborted || this.chatOperationId.toString() !== operationId.slice("chat-".length) || accountGeneration !== this.accountGeneration || workspaceGeneration !== this.workspaceGeneration || chatGeneration !== this.chatGeneration) return;
        if (event.type === "error") {
          this.patch({ error: event.message ?? "Chat stream failed.", chatOperation: "error" });
          return;
        }
        const chat = this.state.chat.map((item) => item.id === assistant.id ? { ...item, text: item.text + (event.chunk ?? ""), streaming: true } : item);
        this.patch({ chat });
      }, abort.signal);
      if (accountGeneration !== this.accountGeneration || workspaceGeneration !== this.workspaceGeneration || chatGeneration !== this.chatGeneration || abort.signal.aborted || this.state.chatOperation !== "streaming") return;
      this.patch({ chat: this.state.chat.map((item) => item.id === assistant.id ? { ...item, streaming: false } : item), chatOperation: "success" });
    } catch (error) {
      if (abort.signal.aborted || accountGeneration !== this.accountGeneration || workspaceGeneration !== this.workspaceGeneration || chatGeneration !== this.chatGeneration) {
        if (accountGeneration !== this.accountGeneration || workspaceGeneration !== this.workspaceGeneration || chatGeneration !== this.chatGeneration) return;
        this.patch({ chatOperation: "cancelled", notice: "Chat generation cancelled." });
        return;
      }
      this.fail(error, "chatOperation");
    }
  }

  async cancelChat(): Promise<void> {
    const operationId = `chat-${this.chatOperationId}`;
    this.chatAbort?.abort();
    try {
      await this.bridge.interruptChat(operationId);
    } catch (error) {
      this.patch({ chatOperation: "error", error: error instanceof Error ? `Chat interrupt was refused: ${error.message}` : "Chat interrupt was refused." });
      throw error;
    }
  }

  async addComment(body: string): Promise<void> {
    if (!this.state.activeProject || !this.has("comment")) throw new Error("Your active account cannot comment here.");
    const accountGeneration = this.accountGeneration;
    const workspaceGeneration = this.workspaceGeneration;
    const commentGeneration = ++this.commentGeneration;
    const projectId = this.state.activeProject.id;
    this.patch({ commentOperation: "loading", error: undefined });
    try {
      const comment = await this.bridge.addComment(projectId, body);
      if (accountGeneration !== this.accountGeneration || workspaceGeneration !== this.workspaceGeneration || commentGeneration !== this.commentGeneration || this.state.activeProject?.id !== projectId || this.state.auth !== "ready") return;
      this.patch({ comments: [...this.state.comments, comment], commentOperation: "success" });
    } catch (error) {
      this.fail(error, "commentOperation");
    }
  }

  async replyComment(commentId: string, body: string): Promise<void> {
    if (!this.state.activeProject || !this.has("comment")) throw new Error("Your active account cannot reply here.");
    if (!this.state.comments.some((comment) => comment.id === commentId)) throw new Error("That comment is not in the active project.");
    const accountGeneration = this.accountGeneration;
    const workspaceGeneration = this.workspaceGeneration;
    const commentGeneration = ++this.commentGeneration;
    const projectId = this.state.activeProject.id;
    this.patch({ commentOperation: "loading", error: undefined });
    try {
      const updated = await this.bridge.replyToComment(projectId, commentId, body);
      if (accountGeneration !== this.accountGeneration || workspaceGeneration !== this.workspaceGeneration || commentGeneration !== this.commentGeneration || this.state.activeProject?.id !== projectId || this.state.auth !== "ready") return;
      this.patch({ comments: this.state.comments.map((comment) => comment.id === commentId ? { ...comment, replies: [...comment.replies, updated] } : comment), commentOperation: "success" });
    } catch (error) {
      this.fail(error, "commentOperation");
    }
  }

  async share(recipient: string, role: ShareRole): Promise<void> {
    if (!this.state.activeProject || !this.has("share")) throw new Error("Your active account cannot share this project.");
    if (!this.state.accounts.some((account) => account.slotId === recipient && account.state === "ready" && account.slotId !== this.state.activeAccount?.slotId)) throw new Error("Choose a different ready saved account slot.");
    const accountGeneration = this.accountGeneration;
    const workspaceGeneration = this.workspaceGeneration;
    const shareGeneration = ++this.shareGeneration;
    const projectId = this.state.activeProject.id;
    try {
      await this.bridge.shareProject(projectId, recipient, role);
      if (accountGeneration !== this.accountGeneration || workspaceGeneration !== this.workspaceGeneration || shareGeneration !== this.shareGeneration || this.state.activeProject?.id !== projectId) return;
      this.patch({ notice: `Shared with ${recipient}` });
    } catch (error) {
      this.fail(error);
    }
  }

  async revokeShare(recipientSlotId: string): Promise<void> {
    if (!this.state.activeProject || !this.has("share")) throw new Error("Only a project owner can change sharing.");
    if (!this.state.accounts.some((account) => account.slotId === recipientSlotId && account.state === "ready" && account.slotId !== this.state.activeAccount?.slotId)) throw new Error("Choose a different ready saved account slot.");
    const projectId = this.state.activeProject.id;
    const accountGeneration = this.accountGeneration;
    const shareGeneration = ++this.shareGeneration;
    await this.bridge.revokeShare(projectId, recipientSlotId);
    if (accountGeneration !== this.accountGeneration || shareGeneration !== this.shareGeneration || this.state.activeProject?.id !== projectId) return;
    this.patch({ notice: "Project access revoked." });
  }

  async transferProject(recipientSlotId: string): Promise<void> {
    if (!this.state.activeProject || !this.has("transfer")) throw new Error("Only a project owner can transfer this project.");
    if (!this.state.accounts.some((account) => account.slotId === recipientSlotId && account.state === "ready" && account.slotId !== this.state.activeAccount?.slotId)) throw new Error("Choose a different ready saved account slot.");
    const projectId = this.state.activeProject.id;
    const accountGeneration = this.accountGeneration;
    const shareGeneration = ++this.shareGeneration;
    await this.bridge.transferProject(projectId, recipientSlotId);
    if (accountGeneration !== this.accountGeneration || shareGeneration !== this.shareGeneration || this.state.activeProject?.id !== projectId) return;
    this.patch({ notice: "Project ownership transfer requested." });
  }

  async saveSettings(settings: Record<string, unknown>): Promise<void> {
    if (!this.has("settings")) throw new Error("Your active account cannot change settings.");
    const accountGeneration = this.accountGeneration;
    const settingsGeneration = ++this.settingsGeneration;
    try {
      await this.bridge.saveSettings(settings);
      if (accountGeneration !== this.accountGeneration || settingsGeneration !== this.settingsGeneration || this.state.auth !== "ready") return;
      this.patch({ settings: { ...this.state.settings, ...settings }, notice: "Settings saved." });
    } catch (error) {
      this.fail(error);
    }
  }

  signOut(): void {
    const slotId = this.state.activeAccount?.slotId;
    const accountGeneration = this.accountGeneration;
    if (slotId) void this.bridge.logoutAccount(slotId).catch((error) => {
      if (accountGeneration === this.accountGeneration && !this.disposed) this.patch({ error: error instanceof Error ? error.message : "Sign-out failed." });
    });
    this.clearWorkspace(this.state.accounts, "Signed out.");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const pendingSlotId = this.pendingLoginSlotId;
    if (pendingSlotId) void this.bridge.cancelLogin(pendingSlotId).catch(() => undefined);
    this.accountEventsUnsubscribe();
    this.authAbort?.abort();
    this.chatAbort?.abort();
    if (this.deviceExpiryTimer) clearTimeout(this.deviceExpiryTimer);
    this.deviceExpiryTimer = undefined;
    this.pendingLoginSlotId = undefined;
    if (this.state.preview) void this.state.preview.close().catch(() => undefined);
  }
}

export function createWorkspaceController(bridge: DesignerBridge): WorkspaceController {
  return new WorkspaceController(bridge);
}

export type { AccountRole };

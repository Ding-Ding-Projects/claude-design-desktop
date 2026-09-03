import type { AccountLifecycleEvent, AccountSlot, DesignSystem, DesignerBridge, PreviewHandle, Project, WorkspaceComment, WorkspaceFile } from "./bridge";

export class BridgeSchemaError extends Error {
  constructor(path: string, expected: string) {
    super(`Designer bridge returned invalid ${expected} at ${path}.`);
    this.name = "BridgeSchemaError";
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BridgeSchemaError(path, "object");
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string") throw new BridgeSchemaError(path, "string");
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new BridgeSchemaError(path, "boolean");
  return value;
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new BridgeSchemaError(path, "finite number");
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return stringValue(value, path);
}

const accountStates = new Set<AccountSlot["state"]>(["signed-out", "browser-pending", "device-pending", "ready", "expired", "rate-limited", "logged-out", "error"]);
const projectRoles = new Set<Project["role"]>(["owner", "editor", "commenter", "viewer"]);

export function parseAccountSlot(value: unknown, path = "account"): AccountSlot {
  const item = record(value, path);
  const state = stringValue(item.state, `${path}.state`) as AccountSlot["state"];
  if (!accountStates.has(state)) throw new BridgeSchemaError(`${path}.state`, "account state");
  const rateLimits = item.rateLimits === undefined ? undefined : (() => {
    const limits = record(item.rateLimits, `${path}.rateLimits`);
    return { remaining: numberValue(limits.remaining, `${path}.rateLimits.remaining`), resetAt: optionalString(limits.resetAt, `${path}.rateLimits.resetAt`) };
  })();
  return { slotId: stringValue(item.slotId, `${path}.slotId`), label: stringValue(item.label, `${path}.label`), email: stringValue(item.email, `${path}.email`), loginId: stringValue(item.loginId, `${path}.loginId`), state, expiresAt: optionalString(item.expiresAt, `${path}.expiresAt`), isOwner: booleanValue(item.isOwner, `${path}.isOwner`), rateLimits };
}

export function parseProject(value: unknown, path = "project"): Project {
  const item = record(value, path);
  const role = stringValue(item.role, `${path}.role`) as Project["role"];
  if (!projectRoles.has(role)) throw new BridgeSchemaError(`${path}.role`, "project role");
  return { id: stringValue(item.id, `${path}.id`), name: stringValue(item.name, `${path}.name`), description: stringValue(item.description, `${path}.description`), updatedAt: stringValue(item.updatedAt, `${path}.updatedAt`), role, shared: booleanValue(item.shared, `${path}.shared`) };
}

export function parseDesignSystem(value: unknown, path = "designSystem"): DesignSystem {
  const item = record(value, path);
  return { id: stringValue(item.id, `${path}.id`), name: stringValue(item.name, `${path}.name`), version: stringValue(item.version, `${path}.version`), tokenCount: numberValue(item.tokenCount, `${path}.tokenCount`), updatedAt: stringValue(item.updatedAt, `${path}.updatedAt`) };
}

export function parseFile(value: unknown, path = "file"): WorkspaceFile {
  const item = record(value, path);
  const kind = stringValue(item.kind, `${path}.kind`);
  if (kind !== "file" && kind !== "folder") throw new BridgeSchemaError(`${path}.kind`, "file kind");
  const size = item.size === undefined ? undefined : numberValue(item.size, `${path}.size`);
  return { path: stringValue(item.path, `${path}.path`), kind, language: optionalString(item.language, `${path}.language`), size };
}

export function parsePreviewHandle(value: unknown, close: () => Promise<void>, path = "preview"): PreviewHandle {
  const item = record(value, path);
  return { id: stringValue(item.id, `${path}.id`), title: stringValue(item.title, `${path}.title`), url: stringValue(item.url, `${path}.url`), expiresAt: optionalString(item.expiresAt, `${path}.expiresAt`), close };
}

export function parseComment(value: unknown, path = "comment"): WorkspaceComment {
  const item = record(value, path);
  if (!Array.isArray(item.replies)) throw new BridgeSchemaError(`${path}.replies`, "array");
  return { id: stringValue(item.id, `${path}.id`), author: stringValue(item.author, `${path}.author`), body: stringValue(item.body, `${path}.body`), createdAt: stringValue(item.createdAt, `${path}.createdAt`), replies: item.replies.map((reply, index) => parseComment(reply, `${path}.replies[${index}]`)) };
}

export function parseLifecycleEvent(value: unknown): AccountLifecycleEvent {
  const item = record(value, "event");
  const type = stringValue(item.type, "event.type") as AccountLifecycleEvent["type"];
  if (type === "login-started" || type === "login-updated" || type === "login-completed") return { type, slot: parseAccountSlot(item.slot, "event.slot") };
  if (type === "login-cancelled" || type === "logged-out") return { type, slotId: stringValue(item.slotId, "event.slotId") };
  if (type === "rate-limit-updated") {
    const limits = record(item.rateLimits, "event.rateLimits");
    return { type, slotId: stringValue(item.slotId, "event.slotId"), rateLimits: { remaining: numberValue(limits.remaining, "event.rateLimits.remaining"), resetAt: optionalString(limits.resetAt, "event.rateLimits.resetAt") } };
  }
  throw new BridgeSchemaError("event.type", "account lifecycle event");
}

export type DesignerHost = {
  invoke(method: string, payload?: unknown): Promise<unknown>;
  subscribe(listener: (event: unknown) => void): () => void;
};

export function createDesignerBridge(host: DesignerHost): DesignerBridge {
  const invoke = (method: string, payload?: unknown) => host.invoke(method, payload);
  return {
    async getSession() { const value = record(await invoke("session.get"), "session"); return { authenticated: booleanValue(value.authenticated, "session.authenticated"), accountId: optionalString(value.accountId, "session.accountId") }; },
    async beginBrowserLogin() { const value = record(await invoke("auth.browser.start"), "browserLogin"); return { slotId: stringValue(value.slotId, "browserLogin.slotId") }; },
    async beginDeviceLogin() { const value = record(await invoke("auth.device.start"), "deviceLogin"); return { slotId: stringValue(value.slotId, "deviceLogin.slotId"), userCode: stringValue(value.userCode, "deviceLogin.userCode"), verificationUri: stringValue(value.verificationUri, "deviceLogin.verificationUri") }; },
    async listAccounts() { const value = await invoke("accounts.list"); if (!Array.isArray(value)) throw new BridgeSchemaError("accounts", "array"); return value.map((item, index) => parseAccountSlot(item, `accounts[${index}]`)); },
    async selectAccount(slotId) { return parseAccountSlot(await invoke("accounts.select", { slotId }), "account"); },
    async waitForAccountUpdate(slotId, signal) { const value = await invoke("accounts.wait", { slotId, signal }); return parseAccountSlot(value, "account"); },
    async cancelLogin(slotId) { await invoke("auth.cancel", { slotId }); },
    async logoutAccount(slotId) { await invoke("accounts.logout", { slotId }); },
    subscribeAccountEvents(listener) { return host.subscribe((value) => listener(parseLifecycleEvent(value))); },
    async listProjects() { const value = await invoke("projects.list"); if (!Array.isArray(value)) throw new BridgeSchemaError("projects", "array"); return value.map((item, index) => parseProject(item, `projects[${index}]`)); },
    async createProject(input) { return parseProject(await invoke("projects.create", input)); },
    async openProject(projectId) { const value = record(await invoke("projects.open", { projectId }), "openProject"); if (!Array.isArray(value.files)) throw new BridgeSchemaError("openProject.files", "array"); return { project: parseProject(value.project, "openProject.project"), files: value.files.map((item, index) => parseFile(item, `openProject.files[${index}]`)) }; },
    async listDesignSystems() { const value = await invoke("designSystems.list"); if (!Array.isArray(value)) throw new BridgeSchemaError("designSystems", "array"); return value.map((item, index) => parseDesignSystem(item, `designSystems[${index}]`)); },
    async openPreview(projectId, filePath) { const value = record(await invoke("preview.open", { projectId, filePath }), "preview"); return parsePreviewHandle(value, () => invoke("preview.close", { previewId: value.id }).then(() => undefined)); },
    async readFile(projectId, filePath) { const value = record(await invoke("files.read", { projectId, filePath }), "fileContent"); return { content: stringValue(value.content, "fileContent.content"), language: optionalString(value.language, "fileContent.language") }; },
    async writeFile(projectId, filePath, content) { await invoke("files.write", { projectId, filePath, content }); },
    async streamChat(projectId, prompt, operationId, onEvent, signal) { const value = record(await invoke("chat.stream", { projectId, prompt, operationId, onEvent, signal }), "chat"); return { messageId: stringValue(value.messageId, "chat.messageId") }; },
    async interruptChat(operationId) { await invoke("chat.interrupt", { operationId }); },
    async listComments(projectId) { const value = await invoke("comments.list", { projectId }); if (!Array.isArray(value)) throw new BridgeSchemaError("comments", "array"); return value.map((item, index) => parseComment(item, `comments[${index}]`)); },
    async addComment(projectId, body) { return parseComment(await invoke("comments.add", { projectId, body })); },
    async replyToComment(projectId, commentId, body) { return parseComment(await invoke("comments.reply", { projectId, commentId, body })); },
    async shareProject(projectId, recipientSlotId, role) { await invoke("projects.share", { projectId, recipientSlotId, role }); },
    async revokeShare(projectId, recipientSlotId) { await invoke("projects.revoke", { projectId, recipientSlotId }); },
    async transferProject(projectId, recipientSlotId) { await invoke("projects.transfer", { projectId, recipientSlotId }); },
    async saveSettings(settings) { await invoke("settings.save", settings); },
    async getSettings() { return record(await invoke("settings.get"), "settings"); }
  };
}

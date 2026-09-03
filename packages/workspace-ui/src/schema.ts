import type { AccountLifecycleEvent, AccountSlot, ChatStreamEvent, DesignSystem, DesignerBridge, PreviewHandle, Project, ShareRole, WorkspaceComment, WorkspaceFile } from "./bridge";
import { PREVIEW_LOCAL_HOSTS, PREVIEW_PROTOCOLS } from "./bridge";

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

function boundedString(value: unknown, path: string, maxLength: number): string {
  const result = stringValue(value, path);
  if (result.length === 0 || result.length > maxLength) throw new BridgeSchemaError(path, `string with 1-${maxLength} characters`);
  return result;
}

function idValue(value: unknown, path: string): string {
  const result = boundedString(value, path, 256);
  if (!/^[A-Za-z0-9._:-]+$/u.test(result)) throw new BridgeSchemaError(path, "safe identifier");
  return result;
}

function assertKnownFields(item: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
  for (const key of Object.keys(item)) if (!allowed.has(key)) throw new BridgeSchemaError(`${path}.${key}`, "known field");
}

const accountStates = new Set<AccountSlot["state"]>(["signed-out", "browser-pending", "device-pending", "ready", "expired", "rate-limited", "logged-out", "error"]);
const projectRoles = new Set<Project["role"]>(["owner", "editor", "commenter", "viewer"]);

export function parseAccountSlot(value: unknown, path = "account"): AccountSlot {
  const item = record(value, path);
  assertKnownFields(item, new Set(["slotId", "label", "email", "loginId", "state", "expiresAt", "isOwner", "rateLimits"]), path);
  const state = stringValue(item.state, `${path}.state`) as AccountSlot["state"];
  if (!accountStates.has(state)) throw new BridgeSchemaError(`${path}.state`, "account state");
  const rateLimits = item.rateLimits === undefined ? undefined : (() => {
    const limits = record(item.rateLimits, `${path}.rateLimits`);
    return { remaining: numberValue(limits.remaining, `${path}.rateLimits.remaining`), resetAt: optionalString(limits.resetAt, `${path}.rateLimits.resetAt`) };
  })();
  return { slotId: idValue(item.slotId, `${path}.slotId`), label: boundedString(item.label, `${path}.label`, 200), email: boundedString(item.email, `${path}.email`, 320), loginId: idValue(item.loginId, `${path}.loginId`), state, expiresAt: optionalString(item.expiresAt, `${path}.expiresAt`), isOwner: booleanValue(item.isOwner, `${path}.isOwner`), rateLimits };
}

export function parseProject(value: unknown, path = "project"): Project {
  const item = record(value, path);
  assertKnownFields(item, new Set(["id", "name", "description", "updatedAt", "role", "shared"]), path);
  const role = stringValue(item.role, `${path}.role`) as Project["role"];
  if (!projectRoles.has(role)) throw new BridgeSchemaError(`${path}.role`, "project role");
  return { id: idValue(item.id, `${path}.id`), name: boundedString(item.name, `${path}.name`, 200), description: boundedString(item.description, `${path}.description`, 4000), updatedAt: boundedString(item.updatedAt, `${path}.updatedAt`, 64), role, shared: booleanValue(item.shared, `${path}.shared`) };
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
  assertKnownFields(item, new Set(["id", "title", "url", "expiresAt"]), path);
  const url = boundedString(item.url, `${path}.url`, 2048);
  const parsed = new URL(url);
  if (!PREVIEW_PROTOCOLS.has(parsed.protocol) || (parsed.protocol === "http:" && !PREVIEW_LOCAL_HOSTS.has(parsed.hostname))) throw new BridgeSchemaError(`${path}.url`, "approved preview origin");
  return { id: idValue(item.id, `${path}.id`), title: boundedString(item.title, `${path}.title`, 200), url: parsed.href, expiresAt: optionalString(item.expiresAt, `${path}.expiresAt`), close };
}

export function parseComment(value: unknown, path = "comment"): WorkspaceComment {
  const item = record(value, path);
  assertKnownFields(item, new Set(["id", "author", "body", "createdAt", "replies"]), path);
  if (!Array.isArray(item.replies)) throw new BridgeSchemaError(`${path}.replies`, "array");
  return { id: idValue(item.id, `${path}.id`), author: boundedString(item.author, `${path}.author`, 200), body: boundedString(item.body, `${path}.body`, 20000), createdAt: boundedString(item.createdAt, `${path}.createdAt`, 64), replies: item.replies.map((reply, index) => parseComment(reply, `${path}.replies[${index}]`)) };
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

export type DesignerMethodMap = {
  "session.get": { payload: undefined };
  "auth.browser.start": { payload: undefined };
  "auth.device.start": { payload: undefined };
  "accounts.list": { payload: undefined };
  "accounts.select": { payload: { slotId: string } };
  "accounts.wait": { payload: { slotId: string } };
  "auth.cancel": { payload: { slotId: string } };
  "accounts.logout": { payload: { slotId: string } };
  "projects.list": { payload: undefined };
  "projects.create": { payload: { name: string; description: string } };
  "projects.open": { payload: { projectId: string } };
  "designSystems.list": { payload: undefined };
  "preview.open": { payload: { projectId: string; filePath?: string } };
  "preview.close": { payload: { previewId: string } };
  "files.read": { payload: { projectId: string; filePath: string } };
  "files.write": { payload: { projectId: string; filePath: string; content: string } };
  "chat.start": { payload: { projectId: string; prompt: string; operationId: string } };
  "chat.interrupt": { payload: { operationId: string } };
  "comments.list": { payload: { projectId: string } };
  "comments.add": { payload: { projectId: string; body: string } };
  "comments.reply": { payload: { projectId: string; commentId: string; body: string } };
  "projects.share": { payload: { projectId: string; recipientSlotId: string; role: ShareRole } };
  "projects.revoke": { payload: { projectId: string; recipientSlotId: string } };
  "projects.transfer": { payload: { projectId: string; recipientSlotId: string } };
  "settings.save": { payload: { compact?: boolean } };
  "settings.get": { payload: undefined };
  "external.open": { payload: { url: string } };
};

export type DesignerMethod = keyof DesignerMethodMap;
export type DesignerHost = {
  invoke<M extends DesignerMethod>(method: M, payload: DesignerMethodMap[M]["payload"]): Promise<unknown>;
  subscribeAccountEvents(listener: (event: unknown) => void): () => void;
  subscribeChat(operationId: string, listener: (event: unknown) => void): () => void;
};

export function createDesignerBridge(host: DesignerHost): DesignerBridge {
  const invoke = <M extends DesignerMethod>(method: M, payload: DesignerMethodMap[M]["payload"]) => host.invoke(method, payload);
  return {
    async getSession() { const value = record(await invoke("session.get", undefined), "session"); return { authenticated: booleanValue(value.authenticated, "session.authenticated"), activeSlotId: optionalString(value.activeSlotId, "session.activeSlotId") }; },
    async beginBrowserLogin() { const value = record(await invoke("auth.browser.start", undefined), "browserLogin"); return { slotId: idValue(value.slotId, "browserLogin.slotId") }; },
    async beginDeviceLogin() { const value = record(await invoke("auth.device.start", undefined), "deviceLogin"); return { slotId: idValue(value.slotId, "deviceLogin.slotId"), userCode: boundedString(value.userCode, "deviceLogin.userCode", 64), verificationUri: boundedString(value.verificationUri, "deviceLogin.verificationUri", 2048), expiresAt: optionalString(value.expiresAt, "deviceLogin.expiresAt") }; },
    async listAccounts() { const value = await invoke("accounts.list", undefined); if (!Array.isArray(value)) throw new BridgeSchemaError("accounts", "array"); return value.map((item, index) => parseAccountSlot(item, `accounts[${index}]`)); },
    async selectAccount(slotId) { return parseAccountSlot(await invoke("accounts.select", { slotId: idValue(slotId, "slotId") }), "account"); },
    async waitForAccountUpdate(slotId, signal) { const value = await invoke("accounts.wait", { slotId: idValue(slotId, "slotId") }); if (signal.aborted) throw new DOMException("Account wait cancelled", "AbortError"); return parseAccountSlot(value, "account"); },
    async cancelLogin(slotId) { await invoke("auth.cancel", { slotId: idValue(slotId, "slotId") }); },
    async logoutAccount(slotId) { await invoke("accounts.logout", { slotId: idValue(slotId, "slotId") }); },
    subscribeAccountEvents(listener) { return host.subscribeAccountEvents((value) => listener(parseLifecycleEvent(value))); },
    async listProjects() { const value = await invoke("projects.list", undefined); if (!Array.isArray(value)) throw new BridgeSchemaError("projects", "array"); return value.map((item, index) => parseProject(item, `projects[${index}]`)); },
    async createProject(input) { const payload = { name: boundedString(input.name, "name", 200), description: boundedString(input.description || "No description", "description", 4000) }; return parseProject(await invoke("projects.create", payload)); },
    async openProject(projectId) { const value = record(await invoke("projects.open", { projectId: idValue(projectId, "projectId") }), "openProject"); if (!Array.isArray(value.files)) throw new BridgeSchemaError("openProject.files", "array"); return { project: parseProject(value.project, "openProject.project"), files: value.files.map((item, index) => parseFile(item, `openProject.files[${index}]`)) }; },
    async listDesignSystems() { const value = await invoke("designSystems.list", undefined); if (!Array.isArray(value)) throw new BridgeSchemaError("designSystems", "array"); return value.map((item, index) => parseDesignSystem(item, `designSystems[${index}]`)); },
    async openPreview(projectId, filePath) { const value = record(await invoke("preview.open", { projectId: idValue(projectId, "projectId"), ...(filePath ? { filePath: boundedString(filePath, "filePath", 1024) } : {}) }), "preview"); return parsePreviewHandle(value, () => invoke("preview.close", { previewId: idValue(value.id, "preview.id") }).then(() => undefined)); },
    async readFile(projectId, filePath) { const value = record(await invoke("files.read", { projectId: idValue(projectId, "projectId"), filePath: boundedString(filePath, "filePath", 1024) }), "fileContent"); return { content: boundedString(value.content, "fileContent.content", 2_000_000), language: optionalString(value.language, "fileContent.language") }; },
    async writeFile(projectId, filePath, content) { await invoke("files.write", { projectId: idValue(projectId, "projectId"), filePath: boundedString(filePath, "filePath", 1024), content: boundedString(content, "content", 2_000_000) }); },
    async streamChat(projectId, prompt, operationId, onEvent, signal) { const id = idValue(operationId, "operationId"); const unsubscribe = host.subscribeChat(id, (raw) => { const event = record(raw, "chat.event"); const eventId = idValue(event.operationId, "chat.event.operationId"); if (eventId !== id) return; const type = stringValue(event.type, "chat.event.type"); if (type !== "chunk" && type !== "complete" && type !== "error") return; onEvent({ operationId: eventId, type, chunk: optionalString(event.chunk, "chat.event.chunk"), message: optionalString(event.message, "chat.event.message") } as ChatStreamEvent); }); try { const value = record(await invoke("chat.start", { projectId: idValue(projectId, "projectId"), prompt: boundedString(prompt, "prompt", 20_000), operationId: id }), "chat"); if (signal.aborted) throw new DOMException("Chat cancelled", "AbortError"); return { messageId: idValue(value.messageId, "chat.messageId") }; } finally { unsubscribe(); } },
    async interruptChat(operationId) { await invoke("chat.interrupt", { operationId: idValue(operationId, "operationId") }); },
    async listComments(projectId) { const value = await invoke("comments.list", { projectId: idValue(projectId, "projectId") }); if (!Array.isArray(value)) throw new BridgeSchemaError("comments", "array"); return value.map((item, index) => parseComment(item, `comments[${index}]`)); },
    async addComment(projectId, body) { return parseComment(await invoke("comments.add", { projectId: idValue(projectId, "projectId"), body: boundedString(body, "body", 20_000) })); },
    async replyToComment(projectId, commentId, body) { return parseComment(await invoke("comments.reply", { projectId: idValue(projectId, "projectId"), commentId: idValue(commentId, "commentId"), body: boundedString(body, "body", 20_000) })); },
    async shareProject(projectId, recipientSlotId, role) { await invoke("projects.share", { projectId: idValue(projectId, "projectId"), recipientSlotId: idValue(recipientSlotId, "recipientSlotId"), role }); },
    async revokeShare(projectId, recipientSlotId) { await invoke("projects.revoke", { projectId: idValue(projectId, "projectId"), recipientSlotId: idValue(recipientSlotId, "recipientSlotId") }); },
    async transferProject(projectId, recipientSlotId) { await invoke("projects.transfer", { projectId: idValue(projectId, "projectId"), recipientSlotId: idValue(recipientSlotId, "recipientSlotId") }); },
    async openExternal(url) { const parsed = new URL(boundedString(url, "url", 2048)); if (parsed.protocol !== "https:") throw new BridgeSchemaError("url", "HTTPS URL"); await invoke("external.open", { url: parsed.href }); },
    async saveSettings(settings) { const keys = Object.keys(settings); if (keys.some((key) => key !== "compact")) throw new BridgeSchemaError("settings", "known fields"); if (settings.compact !== undefined && typeof settings.compact !== "boolean") throw new BridgeSchemaError("settings.compact", "boolean"); await invoke("settings.save", { ...(settings.compact === undefined ? {} : { compact: settings.compact }) }); },
    async getSettings() { const value = record(await invoke("settings.get", undefined), "settings"); assertKnownFields(value, new Set(["compact"]), "settings"); if (value.compact !== undefined && typeof value.compact !== "boolean") throw new BridgeSchemaError("settings.compact", "boolean"); return value; }
  };
}

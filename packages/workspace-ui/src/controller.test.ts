import { describe, expect, it, vi } from "vitest";
import type { AccountLifecycleEvent, AccountSlot, DesignerBridge, Project, WorkspaceComment } from "./bridge";
import { createWorkspaceController } from "./controller";
import { BridgeSchemaError, createDesignerBridge, parseAccountSlot, parsePreviewHandle, parseProject } from "./schema";

const owner: AccountSlot = { slotId: "owner-1", label: "Owner", email: "owner@example.test", state: "ready" };
const viewer: AccountSlot = { slotId: "viewer-1", label: "Viewer", email: "viewer@example.test", state: "ready" };
const project: Project = { id: "project-1", name: "Canvas", description: "A real project", updatedAt: "2026-09-02T20:00:00Z", role: "owner", shared: false };

function fakeBridge(overrides: Partial<DesignerBridge> = {}): DesignerBridge {
  const comments: WorkspaceComment[] = [];
  return {
    getSession: vi.fn(async () => ({ authenticated: true, activeSlotId: owner.slotId })),
    beginBrowserLogin: vi.fn(async () => ({ slotId: owner.slotId })),
    beginDeviceLogin: vi.fn(async () => ({ slotId: owner.slotId, userCode: "ABCD-EFGH", verificationUri: "https://example.test/device", expiresAt: "2099-01-01T00:00:00.000Z" })),
    listAccounts: vi.fn(async () => [owner, viewer]),
    selectAccount: vi.fn(async (accountId: string) => accountId === owner.slotId ? owner : viewer),
    waitForAccountUpdate: vi.fn(async () => owner),
    cancelLogin: vi.fn(async () => undefined),
    logoutAccount: vi.fn(async () => undefined),
    subscribeAccountEvents: vi.fn(() => () => undefined),
    listProjects: vi.fn(async () => [project]),
    createProject: vi.fn(async (input) => ({ ...project, id: "created", name: input.name, description: input.description })),
    openProject: vi.fn(async () => ({ project, files: [{ path: "index.html", kind: "file" as const, language: "html", size: 12 }] })),
    listDesignSystems: vi.fn(async () => []),
    readFile: vi.fn(async () => ({ content: "hello", language: "text" })),
    writeFile: vi.fn(async () => undefined),
    streamChat: vi.fn(async (_id, _prompt, operationId, onEvent, signal) => {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      onEvent({ operationId, type: "chunk", chunk: "hello" });
      return { messageId: "message-1" };
    }),
    interruptChat: vi.fn(async () => undefined),
    openExternal: vi.fn(async () => undefined),
    listComments: vi.fn(async () => comments),
    addComment: vi.fn(async (_id, body) => ({ id: "comment-1", author: "Owner", body, createdAt: "now", replies: [] })),
    replyToComment: vi.fn(async (_id, commentId, body) => ({ id: "reply-1", author: "Owner", body: `${commentId}:${body}`, createdAt: "now", replies: [] })),
    shareProject: vi.fn(async () => undefined),
    revokeShare: vi.fn(async () => undefined),
    transferProject: vi.fn(async () => undefined),
    openPreview: vi.fn(async () => ({ id: "preview-1", title: "Preview", url: "http://127.0.0.1/preview-unguessable-token-1234", close: vi.fn(async () => undefined) })),
    saveSettings: vi.fn(async () => undefined),
    getSettings: vi.fn(async () => ({})),
    ...overrides
  };
}

describe("WorkspaceController", () => {
  it("does not invent an account and loads only the ready authenticated account", async () => {
    const bridge = fakeBridge({ getSession: vi.fn(async () => ({ authenticated: false })) });
    const controller = createWorkspaceController(bridge);
    await controller.bootstrap();
    expect(controller.getState().activeAccount).toBeUndefined();
    expect(controller.getState().auth).toBe("signed-out");
    expect(bridge.listProjects).not.toHaveBeenCalled();
  });

  it("enforces role capabilities before create and write operations", async () => {
    const bridge = fakeBridge({ getSession: vi.fn(async () => ({ authenticated: true, activeSlotId: viewer.slotId })) });
    const controller = createWorkspaceController(bridge);
    await controller.bootstrap();
    expect(controller.has("project:create")).toBe(true);
    await controller.createProject("Nope", "");
    await expect(controller.saveFile("nope")).rejects.toThrow("cannot edit");
    expect(bridge.createProject).toHaveBeenCalledWith({ name: "Nope", description: "" });
  });

  it("requires a ready account before project open", async () => {
    const bridge = fakeBridge();
    const controller = createWorkspaceController(bridge);
    await expect(controller.openProject(project.id)).rejects.toThrow("ready authenticated account");
    expect(bridge.openProject).not.toHaveBeenCalled();
  });

  it("opens files and saves through the real bridge", async () => {
    const bridge = fakeBridge();
    const controller = createWorkspaceController(bridge);
    await controller.bootstrap();
    await controller.openProject(project.id);
    await controller.openFile("index.html");
    await controller.saveFile("updated");
    expect(bridge.readFile).toHaveBeenCalledWith(project.id, "index.html");
    expect(bridge.writeFile).toHaveBeenCalledWith(project.id, "index.html", "updated");
    expect(controller.getState().fileContent).toBe("updated");
  });

  it("keeps streamed chat cancellable and does not hide a cancellation", async () => {
    const bridge = fakeBridge({
      streamChat: vi.fn((_id, _prompt, operationId, onEvent, signal) => new Promise<{ messageId: string }>((_resolve, reject) => {
        onEvent({ operationId, type: "chunk", chunk: "partial" });
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }))
    });
    const controller = createWorkspaceController(bridge);
    await controller.bootstrap();
    await controller.openProject(project.id);
    const running = controller.sendChat("hello");
    controller.cancelChat();
    await running;
    expect(controller.getState().chatOperation).toBe("cancelled");
    expect(controller.getState().chat.at(-1)?.text).toBe("partial");
  });

  it("routes comment and reply actions to the bridge", async () => {
    const bridge = fakeBridge();
    const controller = createWorkspaceController(bridge);
    await controller.bootstrap();
    await controller.openProject(project.id);
    await controller.addComment("Please review this frame");
    await controller.replyComment("comment-1", "On it");
    expect(bridge.addComment).toHaveBeenCalledWith(project.id, "Please review this frame");
    expect(bridge.replyToComment).toHaveBeenCalledWith(project.id, "comment-1", "On it");
    expect(controller.getState().comments[0]?.replies[0]?.body).toBe("comment-1:On it");
  });

  it("reports device-code routing and sign-out state", async () => {
    const bridge = fakeBridge();
    const controller = createWorkspaceController(bridge);
    await controller.beginDeviceLogin();
    expect(controller.getState().deviceCode?.userCode).toBe("ABCD-EFGH");
    controller.signOut();
    expect(controller.getState().auth).toBe("signed-out");
    expect(controller.getState().activeProject).toBeUndefined();
  });

  it("waits for the host account completion before loading projects", async () => {
    let complete: ((account: AccountSlot) => void) | undefined;
    const bridge = fakeBridge({
      waitForAccountUpdate: vi.fn(() => new Promise<AccountSlot>((resolve) => { complete = resolve; })),
      beginBrowserLogin: vi.fn(async () => ({ slotId: owner.slotId }))
    });
    const controller = createWorkspaceController(bridge);
    const pending = controller.beginBrowserLogin();
    await Promise.resolve();
    expect(controller.getState().auth).toBe("browser-pending");
    expect(bridge.listProjects).not.toHaveBeenCalled();
    complete?.(owner);
    await pending;
    expect(controller.getState().auth).toBe("ready");
    expect(bridge.listProjects).toHaveBeenCalledTimes(1);
  });

  it("uses project membership roles rather than the account slot role", async () => {
    const readOnlyProject = { ...project, role: "viewer" as const };
    const bridge = fakeBridge({ listProjects: vi.fn(async () => [readOnlyProject]), openProject: vi.fn(async () => ({ project: readOnlyProject, files: [] })) });
    const controller = createWorkspaceController(bridge);
    await controller.bootstrap();
    await controller.openProject(project.id);
    expect(controller.has("file:read")).toBe(true);
    expect(controller.has("file:write")).toBe(false);
    expect(controller.has("share")).toBe(false);
  });

  it("rejects stale project results after the active slot logs out", async () => {
    let emit: ((event: AccountLifecycleEvent) => void) | undefined;
    let finishOpen: ((value: { project: Project; files: never[] }) => void) | undefined;
    const bridge = fakeBridge({
      subscribeAccountEvents: vi.fn((listener) => { emit = listener; return () => undefined; }),
      openProject: vi.fn(() => new Promise<{ project: Project; files: never[] }>((resolve) => { finishOpen = resolve; }))
    });
    const controller = createWorkspaceController(bridge);
    await controller.bootstrap();
    const opening = controller.openProject(project.id);
    emit?.({ type: "logged-out", slotId: owner.slotId });
    finishOpen?.({ project, files: [] });
    await opening;
    expect(controller.getState().auth).toBe("signed-out");
    expect(controller.getState().activeProject).toBeUndefined();
  });

  it("exposes a preview handle and closes it through the host", async () => {
    const close = vi.fn(async () => undefined);
    const bridge = fakeBridge({ openPreview: vi.fn(async () => ({ id: "preview-1", title: "Preview", url: "http://127.0.0.1/preview-unguessable-token-1234", close })) });
    const controller = createWorkspaceController(bridge);
    await controller.bootstrap();
    await controller.openProject(project.id);
    await controller.openPreview();
    expect(controller.getState().preview?.url).toBe("http://127.0.0.1/preview-unguessable-token-1234");
    await controller.closePreview();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("validates the closed adapter schemas", () => {
    expect(() => parseAccountSlot({ state: "ready" })).toThrow(BridgeSchemaError);
    expect(() => parseProject({ id: "p", name: "P", description: "", updatedAt: "now", role: "admin", shared: false })).toThrow(BridgeSchemaError);
  });

  it("does not unlock for an unrelated login completion event", () => {
    let emit: ((event: AccountLifecycleEvent) => void) | undefined;
    const bridge = fakeBridge({ subscribeAccountEvents: vi.fn((listener) => { emit = listener; return () => undefined; }) });
    const controller = createWorkspaceController(bridge);
    emit?.({ type: "login-completed", slot: viewer });
    expect(controller.getState().auth).toBe("signed-out");
    expect(controller.getState().activeAccount).toBeUndefined();
  });

  it("rechecks the authoritative session after account selection", async () => {
    const getSession = vi.fn()
      .mockResolvedValueOnce({ authenticated: true, activeSlotId: owner.slotId })
      .mockResolvedValueOnce({ authenticated: true, activeSlotId: owner.slotId })
      .mockResolvedValueOnce({ authenticated: true, activeSlotId: viewer.slotId });
    const bridge = fakeBridge({ getSession, selectAccount: vi.fn(async () => owner) });
    const controller = createWorkspaceController(bridge);
    await controller.bootstrap();
    await expect(controller.selectAccount(owner.slotId)).rejects.toThrow("authenticated ready slot");
    expect(controller.getState().auth).toBe("ready");
    expect(bridge.listProjects).toHaveBeenCalledTimes(1);
  });

  it("surfaces an interrupt refusal instead of hiding it", async () => {
    const bridge = fakeBridge({ interruptChat: vi.fn(async () => { throw new Error("host refused interrupt"); }) });
    const controller = createWorkspaceController(bridge);
    await expect(controller.cancelChat()).rejects.toThrow("host refused interrupt");
    expect(controller.getState().chatOperation).toBe("error");
    expect(controller.getState().error).toContain("refused");
  });

  it("purges device-code state on cancellation and routes verification through the host", async () => {
    const bridge = fakeBridge();
    const controller = createWorkspaceController(bridge);
    await controller.beginDeviceLogin();
    await controller.openDeviceVerification();
    await controller.cancelDeviceLogin();
    expect(bridge.openExternal).toHaveBeenCalledWith("https://example.test/device");
    expect(bridge.cancelLogin).toHaveBeenCalledWith(owner.slotId);
    expect(controller.getState().deviceCode).toBeUndefined();
  });

  it("keeps callbacks and abort signals out of host request payloads", async () => {
    let emitChat: ((event: unknown) => void) | undefined;
    const invoke = vi.fn(async (method: string, _payload?: unknown) => {
      if (method === "session.get") return { authenticated: true, activeSlotId: owner.slotId };
      if (method === "accounts.list") return [owner];
      if (method === "settings.get") return {};
      if (method === "projects.list" || method === "designSystems.list") return [];
      if (method === "chat.start") { emitChat?.({ operationId: "chat-1", type: "complete" }); return { messageId: "m" }; }
      return {};
    });
    const host = { invoke, subscribeAccountEvents: vi.fn(() => () => undefined), subscribeChat: vi.fn((_operationId: string, listener: (event: unknown) => void) => { emitChat = listener; return () => undefined; }) };
    const bridge = createDesignerBridge(host);
    await bridge.streamChat(owner.slotId, "hello", "chat-1", () => undefined, new AbortController().signal);
    const start = invoke.mock.calls.find(([method]) => method === "chat.start");
    expect(start?.[1]).toEqual({ projectId: owner.slotId, prompt: "hello", operationId: "chat-1" });
    expect(JSON.stringify(start?.[1])).not.toContain("AbortSignal");
  });

  it("rejects preview handles outside approved origins", () => {
    expect(() => parsePreviewHandle({ id: "p", title: "P", url: "file:///secret" }, async () => undefined)).toThrow(BridgeSchemaError);
  });

  it("keeps the chat subscription through delayed post-ack terminal completion", async () => {
    let emit: ((event: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const host = {
      invoke: vi.fn(async (method: string) => method === "chat.start" ? { messageId: "message-1" } : {}),
      subscribeAccountEvents: vi.fn(() => () => undefined),
      subscribeChat: vi.fn((_operationId: string, listener: (event: unknown) => void) => { emit = listener; return unsubscribe; })
    };
    const bridge = createDesignerBridge(host);
    const abort = new AbortController();
    const pending = bridge.streamChat("project-1", "hello", "chat-1", () => undefined, abort.signal);
    await Promise.resolve();
    expect(unsubscribe).not.toHaveBeenCalled();
    emit?.({ operationId: "chat-1", type: "complete" });
    await pending;
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not let file activity invalidate an active chat operation", async () => {
    let finish: (() => void) | undefined;
    let emit: ((event: { operationId: string; type: "chunk" | "complete" }) => void) | undefined;
    const bridge = fakeBridge({
      streamChat: vi.fn(async (_id, _prompt, operationId, onEvent) => {
        emit = onEvent;
        onEvent({ operationId, type: "chunk", chunk: "partial" });
        await new Promise<void>((resolve) => { finish = resolve; });
        onEvent({ operationId, type: "complete" });
        return { messageId: "message-delayed" };
      })
    });
    const controller = createWorkspaceController(bridge);
    await controller.bootstrap();
    await controller.openProject(project.id);
    const running = controller.sendChat("hello");
    await Promise.resolve();
    await controller.openFile("index.html");
    expect(controller.getState().chatOperation).toBe("streaming");
    finish?.();
    emit?.({ operationId: "chat-1", type: "complete" });
    await running;
    expect(controller.getState().chatOperation).toBe("success");
    expect(controller.getState().chat.at(-1)?.text).toBe("partial");
  });
});

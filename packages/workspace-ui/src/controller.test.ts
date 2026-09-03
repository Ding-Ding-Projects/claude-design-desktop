import { describe, expect, it, vi } from "vitest";
import type { Account, DesignerBridge, Project, WorkspaceComment } from "./bridge";
import { createWorkspaceController } from "./controller";

const owner: Account = { id: "owner-1", label: "Owner", email: "owner@example.test", role: "owner", ready: true };
const viewer: Account = { id: "viewer-1", label: "Viewer", email: "viewer@example.test", role: "viewer", ready: true };
const project: Project = { id: "project-1", name: "Canvas", description: "A real project", updatedAt: "2026-09-02T20:00:00Z", role: "owner", shared: false };

function fakeBridge(overrides: Partial<DesignerBridge> = {}): DesignerBridge {
  const comments: WorkspaceComment[] = [];
  return {
    getSession: vi.fn(async () => ({ authenticated: true, accountId: owner.id })),
    beginBrowserLogin: vi.fn(async () => undefined),
    beginDeviceLogin: vi.fn(async () => ({ userCode: "ABCD-EFGH", verificationUri: "https://example.test/device" })),
    listAccounts: vi.fn(async () => [owner, viewer]),
    selectAccount: vi.fn(async (accountId: string) => accountId === owner.id ? owner : viewer),
    listProjects: vi.fn(async () => [project]),
    createProject: vi.fn(async (input) => ({ ...project, id: "created", name: input.name, description: input.description })),
    openProject: vi.fn(async () => ({ project, files: [{ path: "index.html", kind: "file", language: "html", size: 12 }] })),
    listDesignSystems: vi.fn(async () => []),
    readFile: vi.fn(async () => ({ content: "hello", language: "text" })),
    writeFile: vi.fn(async () => undefined),
    streamChat: vi.fn(async (_id, _prompt, onChunk, signal) => {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      onChunk("hello");
      return { messageId: "message-1" };
    }),
    listComments: vi.fn(async () => comments),
    addComment: vi.fn(async (_id, body) => ({ id: "comment-1", author: "Owner", body, createdAt: "now", replies: [] })),
    replyToComment: vi.fn(async (_id, commentId, body) => ({ id: "reply-1", author: "Owner", body: `${commentId}:${body}`, createdAt: "now", replies: [] })),
    shareProject: vi.fn(async () => undefined),
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
    const bridge = fakeBridge({ getSession: vi.fn(async () => ({ authenticated: true, accountId: viewer.id })) });
    const controller = createWorkspaceController(bridge);
    await controller.bootstrap();
    expect(controller.has("project:create")).toBe(false);
    await expect(controller.createProject("Nope", "")).rejects.toThrow("cannot create");
    await expect(controller.saveFile("nope")).rejects.toThrow("cannot edit");
    expect(bridge.createProject).not.toHaveBeenCalled();
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
      streamChat: vi.fn((_id, _prompt, onChunk, signal) => new Promise<{ messageId: string }>((resolve, reject) => {
        onChunk("partial");
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
});

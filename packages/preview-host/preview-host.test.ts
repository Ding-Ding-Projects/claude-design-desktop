import assert from "node:assert/strict";
import test from "node:test";
import { PreviewHandleError, PreviewHostController, previewDataUrl, sanitizePreviewHtml, type PreviewSession, type PreviewWindow } from "./index.ts";

class FakeSession implements PreviewSession {
  readonly webRequest = {
    onBeforeRequest: (filter: { urls: string[] }, listener: (details: { url: string }, callback: (result: { cancel: boolean }) => void) => void) => {
      this.requestFilter = filter;
      this.requestListener = listener;
    }
  };
  readonly partition: string;
  requestFilter?: { urls: string[] };
  requestListener?: (details: { url: string }, callback: (result: { cancel: boolean }) => void) => void;
  downloadListener?: (event: { preventDefault: () => void }) => void;
  permissionRequest?: (webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void;
  permissionCheck?: (webContents: unknown, permission: string, origin: string) => boolean;
  clearedStorage?: string[];
  clearedCache = false;

  constructor(partition: string) { this.partition = partition; }
  on(_event: "will-download", listener: (event: { preventDefault: () => void }) => void): void { this.downloadListener = listener; }
  setPermissionRequestHandler(listener: (webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void): void { this.permissionRequest = listener; }
  setPermissionCheckHandler(listener: (webContents: unknown, permission: string, origin: string) => boolean): void { this.permissionCheck = listener; }
  async clearStorageData(options: { storages: string[] }): Promise<void> { this.clearedStorage = options.storages; }
  async clearCache(): Promise<void> { this.clearedCache = true; }
}

class FakeWindow implements PreviewWindow {
  readonly webContents = {
    listeners: new Map<string, (...args: any[]) => void>(),
    openHandler: undefined as ((details: { url: string }) => { action: "deny" }) | undefined,
    setWindowOpenHandler: (listener: (details: { url: string }) => { action: "deny" }) => { this.webContents.openHandler = listener; },
    on: (event: string, listener: (...args: any[]) => void) => { this.webContents.listeners.set(event, listener); },
    closeDevTools: () => { this.devToolsClosed = true; }
  };
  loadedUrl = "";
  destroyed = false;
  devToolsClosed = false;
  readonly options: unknown;
  constructor(options: unknown) { this.options = options; }
  async loadURL(url: string): Promise<void> { this.loadedUrl = url; }
  destroy(): void { this.destroyed = true; }
  isDestroyed(): boolean { return this.destroyed; }
}

function harness() {
  const sessions: FakeSession[] = [];
  const windows: FakeWindow[] = [];
  const controller = new PreviewHostController({
    createSession: (partition) => { const session = new FakeSession(partition); sessions.push(session); return session; },
    createWindow: (options) => { const window = new FakeWindow(options); windows.push(window); return window; }
  });
  return { controller, sessions, windows };
}

test("preview data is local, CSP constrained, and rejects base-tag and network escapes", () => {
  const html = sanitizePreviewHtml({ html: "<html><head></head><body><img src=\"logo.png\"><a href=\"#details\">Details</a></body></html>", assets: [{ name: "logo.png", mimeType: "image/png", bytes: new Uint8Array([137, 80, 78, 71]) }] });
  assert.match(html, /Content-Security-Policy/iu);
  assert.match(html, /src="data:image\/png;base64,/iu);
  assert.throws(() => sanitizePreviewHtml({ html: "<base href=\"file:///secret\"><p>bad</p>" }), /base element/iu);
  assert.throws(() => sanitizePreviewHtml({ html: "<img src=\"https://example.invalid/image.png\">" }), /blocked resource/iu);
  assert.match(previewDataUrl({ html: "<p>safe</p>" }), /^data:text\/html/iu);
});

test("each handle gets isolated session policies and only hardened window preferences", async () => {
  const { controller, sessions, windows } = harness();
  const handle = await controller.create("project-a", { html: "<p>hello</p>" });
  const otherHandle = await controller.create("project-a", { html: "<p>separate</p>" });
  const session = sessions[0];
  const window = windows[0];
  assert.equal(session.partition, `preview-project-a-${handle.handleId}`);
  assert.notEqual(session.partition, sessions[1].partition);
  assert.notEqual(handle.handleId, otherHandle.handleId);
  assert.deepEqual(session.requestFilter, { urls: ["*://*/*"] });
  const network = { cancel: false };
  session.requestListener?.({ url: "https://example.invalid/" }, (result) => Object.assign(network, result));
  assert.equal(network.cancel, true);
  assert.equal(window.webContents.openHandler?.({ url: "https://example.invalid/popup" }).action, "deny");
  let permission = true;
  session.permissionRequest?.({}, "notifications", (allowed) => { permission = allowed; });
  assert.equal(permission, false);
  assert.equal(session.permissionCheck?.({}, "geolocation", "https://example.invalid"), false);
  let downloadPrevented = false;
  session.downloadListener?.({ preventDefault: () => { downloadPrevented = true; } });
  assert.equal(downloadPrevented, true);
  const navigation = { prevented: false };
  window.webContents.listeners.get("will-navigate")?.({ preventDefault: () => { navigation.prevented = true; } });
  assert.equal(navigation.prevented, true);
  const ipc = { prevented: false };
  window.webContents.listeners.get("ipc-message")?.({ preventDefault: () => { ipc.prevented = true; } });
  assert.equal(ipc.prevented, true);
  const options = windows[0].options as { show: false; webPreferences: Record<string, unknown> };
  assert.equal(options.show, false);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.sandbox, true);
  assert.equal(options.webPreferences.webSecurity, true);
  assert.equal(options.webPreferences.devTools, false);
  assert.equal("preload" in options.webPreferences, false);
});

test("reload invalidates the old generation and refuses cross-project handles", async () => {
  const { controller } = harness();
  const events: unknown[] = [];
  controller.onState((event) => events.push(event));
  const first = await controller.create("project-a", { html: "<p>one</p>" });
  const second = await controller.reload("project-a", first, { html: "<p>two</p>" });
  assert.equal(second.generation, first.generation + 1);
  assert.ok(events.length >= 3);
  for (const event of events) assert.deepEqual(Object.keys(event as object).sort(), ["handle", "state", "type"]);
  await assert.rejects(() => controller.close("project-a", first), (error: unknown) => error instanceof PreviewHandleError && error.code === "stale_handle");
  await assert.rejects(() => controller.close("project-b", second), (error: unknown) => error instanceof PreviewHandleError && error.code === "cross_project");
  await controller.close("project-a", second);
});

test("close clears service workers, caches, and the isolated browser storage", async () => {
  const { controller, sessions, windows } = harness();
  const handle = await controller.create("project-clean", { html: "<p>close me</p>" });
  await controller.close("project-clean", handle);
  assert.deepEqual(sessions[0].clearedStorage, ["serviceworkers", "caches", "localstorage", "indexdb", "websql", "cookies"]);
  assert.equal(sessions[0].clearedCache, true);
  assert.equal(windows[0].destroyed, true);
});

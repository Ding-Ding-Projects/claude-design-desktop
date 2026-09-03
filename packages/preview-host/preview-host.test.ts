import assert from "node:assert/strict";
import test from "node:test";
import {
  PreviewHostController,
  PreviewHostError,
  createElectronPreviewAdapters,
  previewDataUrl,
  type PreviewSession,
  type PreviewWindow
} from "./index.ts";

const actor = Object.freeze({ accountId: "account-a", role: "editor" });

function png(width = 1, height = 1): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes[16] = (width >>> 24) & 255;
  bytes[17] = (width >>> 16) & 255;
  bytes[18] = (width >>> 8) & 255;
  bytes[19] = width & 255;
  bytes[20] = (height >>> 24) & 255;
  bytes[21] = (height >>> 16) & 255;
  bytes[22] = (height >>> 8) & 255;
  bytes[23] = height & 255;
  return bytes;
}

function text(value: string): Uint8Array { return new TextEncoder().encode(value); }

class FakeSession implements PreviewSession {
  readonly partition: string;
  readonly webRequest = {
    onBeforeRequest: (filter: { urls: string[] }, listener: (details: { url: string }, callback: (result: { cancel: boolean }) => void) => void) => {
      this.requestFilter = filter;
      this.requestListener = listener;
    }
  };
  requestFilter?: { urls: string[] };
  requestListener?: (details: { url: string }, callback: (result: { cancel: boolean }) => void) => void;
  permissionRequest?: (webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void;
  permissionCheck?: (webContents: unknown, permission: string, origin: string) => boolean;
  downloadListener?: (event: { preventDefault: () => void }) => void;
  clearStorageCalls = 0;
  clearCacheCalls = 0;
  flushCalls = 0;
  failClearStorage = false;
  constructor(partition: string) { this.partition = partition; }
  on(_event: "will-download", listener: (event: { preventDefault: () => void }) => void): void { this.downloadListener = listener; }
  setPermissionRequestHandler(listener: (webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void): void { this.permissionRequest = listener; }
  setPermissionCheckHandler(listener: (webContents: unknown, permission: string, origin: string) => boolean): void { this.permissionCheck = listener; }
  async clearStorageData(): Promise<void> { this.clearStorageCalls += 1; if (this.failClearStorage) throw new Error("simulated cleanup failure"); }
  async clearCache(): Promise<void> { this.clearCacheCalls += 1; }
  async flushStorageData(): Promise<void> { this.flushCalls += 1; }
}

class FakeWindow implements PreviewWindow {
  readonly listeners = new Map<string, (...args: any[]) => void>();
  readonly webContents = {
    setWindowOpenHandler: (listener: (details: { url: string }) => { action: "deny" }) => { this.openHandler = listener; },
    on: (event: string, listener: (...args: any[]) => void) => { this.listeners.set(event, listener); },
    closeDevTools: () => { this.devToolsClosed = true; }
  };
  openHandler?: (details: { url: string }) => { action: "deny" };
  options: unknown;
  loadedUrl = "";
  showCalls = 0;
  destroyed = false;
  devToolsClosed = false;
  loadMode: "ok" | "reject" | "hang" = "ok";
  constructor(options: unknown) { this.options = options; }
  async loadURL(url: string): Promise<void> {
    this.loadedUrl = url;
    if (this.loadMode === "reject") throw new Error("simulated load failure");
    if (this.loadMode === "hang") await new Promise<void>(() => undefined);
  }
  show(): void { this.showCalls += 1; }
  destroy(): void { this.destroyed = true; }
  isDestroyed(): boolean { return this.destroyed; }
  emit(event: string, value: unknown = {}): void { this.listeners.get(event)?.(value); }
}

function harness(options: { allow?: boolean; maxActiveHandles?: number; watchdogMs?: number } = {}) {
  const sessions: FakeSession[] = [];
  const windows: FakeWindow[] = [];
  const controller = new PreviewHostController({
    createSession: (partition) => { const session = new FakeSession(partition); sessions.push(session); return session; },
    createWindow: (windowOptions) => { const window = new FakeWindow(windowOptions); windows.push(window); return window; }
  }, {
    authorize: () => options.allow ?? true,
    maxActiveHandles: options.maxActiveHandles,
    watchdogMs: options.watchdogMs
  });
  return { controller, sessions, windows };
}

test("the production adapter binds session.fromPartition and BrowserWindow without a preload", () => {
  const partitions: Array<{ name: string; options?: { cache?: boolean } }> = [];
  const windows: unknown[] = [];
  const electron = {
    session: { fromPartition: (name: string, options?: { cache?: boolean }) => { partitions.push({ name, options }); return new FakeSession(name); } },
    BrowserWindow: class extends FakeWindow { constructor(options: any) { super(options); windows.push(options); } }
  };
  const adapters = createElectronPreviewAdapters(electron);
  const session = adapters.createSession("preview-account-a-handle");
  const window = adapters.createWindow({ show: false, webPreferences: { session, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, devTools: false, allowRunningInsecureContent: false, webviewTag: false } });
  assert.deepEqual(partitions, [{ name: "preview-account-a-handle", options: { cache: false } }]);
  assert.ok(window);
  assert.equal((windows[0] as any).webPreferences.nodeIntegration, false);
  assert.equal((windows[0] as any).webPreferences.sandbox, true);
  assert.equal("preload" in (windows[0] as any).webPreferences, false);
});
test("HTML tokenization handles unquoted src and srcset and embeds only registered assets", () => {
  const html = previewDataUrl({
    html: "<html><head></head><body><img src=logo.png srcset=\"logo.png 1x, logo@2x.png 2x\"></body></html>",
    assets: [
      { name: "logo.png", mimeType: "image/png", bytes: png() },
      { name: "logo@2x.png", mimeType: "image/png", bytes: png(2, 2) }
    ]
  });
  assert.match(decodeURIComponent(html.slice(html.indexOf(",") + 1)), /Content-Security-Policy/iu);
  assert.match(decodeURIComponent(html.slice(html.indexOf(",") + 1)), /data:image\/png;base64,/iu);
});

test("dynamic local scripts and CSS imports are allowed only through bounded assets", () => {
  const html = decodeURIComponent(previewDataUrl({
    html: "<html><head><style>@import \"theme.css\"; body { background: url(logo.png) }</style></head><body><script src=preview.js></script></body></html>",
    assets: [
      { name: "theme.css", mimeType: "text/css", bytes: text("body { color: red; }") },
      { name: "logo.png", mimeType: "image/png", bytes: png() },
      { name: "preview.js", mimeType: "text/javascript", bytes: text("document.body.dataset.ready = 'yes';") }
    ]
  }).split(",").slice(1).join(","));
  assert.match(html, /script-src data:/iu);
  assert.match(html, /data:text\/javascript;base64,/iu);
  assert.throws(() => previewDataUrl({ html: "<script>fetch('https://example.invalid')</script>" }), (error: unknown) => error instanceof PreviewHostError && error.code === "content_rejected");
});

test("unsupported HTML and CSS URL-bearing constructs fail closed", () => {
  const bad = [
    "<meta http-equiv=refresh content=0;url=https://example.invalid>",
    "<img srcset=https://example.invalid/a.png 1x>",
    "<style>@import theme.css;</style>",
    "<style>@import url(https://example.invalid/theme.css);</style>",
    "<img src=ftp://example.invalid/a>",
    "<img src=file:///secret>",
    "<img src=about:blank>",
    "<img src=custom-scheme:value>",
    "<img src=//example.invalid/a>"
  ];
  for (const html of bad) assert.throws(() => previewDataUrl({ html }), (error: unknown) => error instanceof PreviewHostError && error.code === "content_rejected");
});

test("actor role authorization and explicit show operation are enforced", async () => {
  const calls: string[] = [];
  const { controller, windows } = (() => {
    const value = harness();
    return value;
  })();
  const authorized = new PreviewHostController({
    createSession: (partition) => new FakeSession(partition),
    createWindow: (options) => { const window = new FakeWindow(options); windows.push(window); return window; }
  }, { authorize: (request) => { calls.push(`${request.operation}:${request.actor.accountId}:${request.actor.role}:${request.projectId}:${request.generation}`); return request.actor.role === "editor"; } });
  const handle = await authorized.create(actor, "project-a", { html: "<p>ready</p>" });
  await authorized.show(actor, "project-a", handle);
  assert.equal(windows[0].showCalls, 1);
  await assert.rejects(() => authorized.show({ accountId: "account-a", role: "viewer" }, "project-a", handle), (error: unknown) => error instanceof PreviewHostError && error.code === "authorization_failed");
  assert.deepEqual(calls, ["create:account-a:editor:project-a:1", "show:account-a:editor:project-a:1", "show:account-a:viewer:project-a:1"]);
});

test("stale and cross-project handles are refused and events expose only fixed schemas", async () => {
  const { controller } = harness();
  const events: unknown[] = [];
  controller.onEvent((event) => events.push(event));
  const first = await controller.create(actor, "project-a", { html: "<p>one</p>" });
  const second = await controller.reload(actor, "project-a", first, { html: "<p>two</p>" });
  assert.equal(second.generation, 2);
  for (const event of events) assert.deepEqual(Object.keys(event as object).sort(), ["handle", "state", "type"]);
  await assert.rejects(() => controller.close(actor, "project-a", first), (error: unknown) => error instanceof PreviewHostError && error.code === "stale_handle");
  await assert.rejects(() => controller.close(actor, "project-b", second), (error: unknown) => error instanceof PreviewHostError && error.code === "cross_project");
  await controller.close(actor, "project-a", second);
});

test("all network schemes are refused by the session policy", async () => {
  const { controller, sessions } = harness();
  await controller.create(actor, "project-a", { html: "<p>local</p>" });
  for (const url of ["https://example.invalid", "http://example.invalid", "ws://example.invalid", "wss://example.invalid", "ftp://example.invalid", "file:///secret", "data:text/plain,leak", "blob:https://example.invalid/id", "about:blank", "chrome://settings", "custom:value"]) {
    let result = { cancel: false };
    sessions[0].requestListener?.({ url }, (next) => { result = next; });
    assert.equal(result.cancel, true, url);
  }
});

test("create, reload, close, and destroyed failures clean up and remove records", async () => {
  const failed = harness({ watchdogMs: 50 });
  failed.windows.push(new FakeWindow({}));
  const createFailure = new PreviewHostController({
    createSession: (partition) => { const session = new FakeSession(partition); failed.sessions.push(session); return session; },
    createWindow: (options) => { const window = new FakeWindow(options); window.loadMode = "reject"; failed.windows.push(window); return window; }
  }, { authorize: () => true, watchdogMs: 50 });
  await assert.rejects(() => createFailure.create(actor, "project-create", { html: "<p>fail</p>" }), (error: unknown) => error instanceof PreviewHostError && error.code === "adapter_failure");
  assert.equal(failed.sessions[0].clearStorageCalls, 1);
  assert.equal(failed.windows[1].destroyed, true);

  const reloadHarness = harness();
  const reloadHandle = await reloadHarness.controller.create(actor, "project-reload", { html: "<p>ok</p>" });
  reloadHarness.windows[0].loadMode = "reject";
  await assert.rejects(() => reloadHarness.controller.reload(actor, "project-reload", reloadHandle, { html: "<p>bad</p>" }), (error: unknown) => error instanceof PreviewHostError && error.code === "lifecycle_failure");
  assert.equal(reloadHarness.windows[0].destroyed, true);
  reloadHarness.sessions[0].failClearStorage = true;
  const closeHarness = harness();
  const closeHandle = await closeHarness.controller.create(actor, "project-close", { html: "<p>ok</p>" });
  closeHarness.sessions[0].failClearStorage = true;
  await assert.rejects(() => closeHarness.controller.close(actor, "project-close", closeHandle), (error: unknown) => error instanceof PreviewHostError && error.code === "cleanup_failed");
  assert.equal(closeHarness.windows[0].destroyed, true);
  await assert.rejects(() => closeHarness.controller.close(actor, "project-close", closeHandle), (error: unknown) => error instanceof PreviewHostError && error.code === "closed_handle");
});

test("capacity is bounded and destroyed windows trigger cleanup", async () => {
  const { controller, sessions, windows } = harness({ maxActiveHandles: 1 });
  await controller.create(actor, "project-a", { html: "<p>one</p>" });
  await assert.rejects(() => controller.create(actor, "project-a", { html: "<p>two</p>" }), (error: unknown) => error instanceof PreviewHostError && error.code === "capacity_exceeded");
  windows[0].emit("destroyed");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sessions[0].clearStorageCalls, 1);
  assert.equal(windows[0].destroyed, true);
  await controller.create(actor, "project-a", { html: "<p>three</p>" });
});

import { app, BrowserWindow, Menu, dialog, screen, session, shell } from "electron";
import { ipcMain } from "electron/main";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppProvenance } from "../../../packages/contracts/src/index";
import { clampBounds, DEFAULT_BOUNDS, MIN_BOUNDS } from "./window-bounds";
import { parseProtocolRoute, PROTOCOL_SCHEME, type ProtocolRoute } from "./protocol-route";
import { readPackagedProvenance } from "./provenance";
import { parsePersistedState, type PersistedState, type WindowBounds } from "./persisted-state";
import { configureSessionSecurity } from "./session-security";
import { protocolRouteEvent } from "./protocol-delivery";
import { runAfterReady } from "./ready-bootstrap";
import { acknowledgeRoute, beginRouteDelivery, canDeliverRoute, type RouteLifecycle } from "./route-lifecycle";
import { randomUUID } from "node:crypto";

const APP_ID = "com.dingdingprojects.claudedesigndesktop";
const PRODUCT_NAME = "Claude Design Desktop";
const REQUEST_VERSION = 1 as const;
const TRANSIENT_RENAME_ERRORS = new Set(["EPERM", "EACCES", "EBUSY"]);
const REVIEWED_EXTERNAL_HOSTS = new Set(["github.com", "githubusercontent.com", "openai.com", "auth.openai.com", "anthropic.com", "claude.ai"]);

let mainWindow: BrowserWindow | null = null;
let statePath = "";
let state: PersistedState = { version: 1, maximized: false };
let lastNormalBounds: WindowBounds | undefined;
let pendingSave: ReturnType<typeof setTimeout> | undefined;
let routeState: RouteLifecycle = { rendererLoaded: false, rendererAcknowledged: false, pendingRoute: null, inFlightDeliveryId: null };

function stableUserDataPath() {
  const localAppData = process.env.LOCALAPPDATA;
  return process.platform === "win32" && localAppData
    ? join(localAppData, "Ding-Ding-Projects", "ClaudeDesignDesktop")
    : join(app.getPath("appData"), "Ding-Ding-Projects", "ClaudeDesignDesktop");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadState(): PersistedState {
  if (!statePath || !existsSync(statePath)) return { version: 1, maximized: false };
  try { return parsePersistedState(JSON.parse(readFileSync(statePath, "utf8"))); }
  catch { return { version: 1, maximized: false }; }
}

function writeState() {
  mkdirSync(join(statePath, ".."), { recursive: true });
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tempPath, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  const deadline = Date.now() + 350;
  let lastError: unknown;
  for (let attempt = 0; attempt < 8 && Date.now() <= deadline; attempt += 1) {
    try { renameSync(tempPath, statePath); return; }
    catch (error) {
      lastError = error;
      if (!isRecord(error) || typeof error.code !== "string" || !TRANSIENT_RENAME_ERRORS.has(error.code)) break;
      const wait = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(wait, 0, 0, 20);
    }
  }
  try { unlinkSync(tempPath); } catch { /* best effort for a failed save */ }
  throw lastError instanceof Error ? lastError : new Error("Window state could not be persisted");
}

function saveStateSafely() {
  try { writeState(); }
  catch (error) { console.error("Window state persistence failed", error instanceof Error ? error.message : "unknown error"); }
}

function scheduleStateSave() {
  if (pendingSave) clearTimeout(pendingSave);
  pendingSave = setTimeout(() => { pendingSave = undefined; saveStateSafely(); }, 100);
}

function rememberNormalBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized() || mainWindow.isFullScreen()) return;
  lastNormalBounds = mainWindow.getBounds();
  state.bounds = lastNormalBounds;
  state.maximized = false;
  scheduleStateSave();
}

function sendWindowState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("window:state", { maximized: mainWindow.isMaximized() });
}

function assertTrustedSender(event: Electron.IpcMainInvokeEvent) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error("Untrusted IPC sender");
  if (event.senderFrame.url !== mainWindow.webContents.getURL()) throw new Error("Untrusted IPC frame URL");
  if (event.senderFrame.origin !== new URL(mainWindow.webContents.getURL()).origin) throw new Error("Untrusted IPC frame origin");
}

function assertRequest(event: Electron.IpcMainInvokeEvent, value: unknown, keys: readonly string[]) {
  assertTrustedSender(event);
  if (!isRecord(value) || value.version !== REQUEST_VERSION || Object.keys(value).some((key) => !keys.includes(key))) throw new TypeError("Invalid versioned IPC request");
}

function unavailable(feature: string): never { throw new Error(`${feature} is unavailable until its host service is connected`); }

function isReviewedExternalHttps(rawUrl: string) {
  try { const parsed = new URL(rawUrl); return parsed.protocol === "https:" && REVIEWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase()); }
  catch { return false; }
}

function showSystemMenu() {
  if (!mainWindow) return;
  const maximized = mainWindow.isMaximized();
  const menu = Menu.buildFromTemplate([
    { label: "Restore", enabled: maximized, accelerator: "Alt+F5", click: () => { mainWindow?.unmaximize(); } },
    { label: "Minimize", enabled: true, accelerator: "Alt+F9", click: () => { mainWindow?.minimize(); } },
    { label: "Maximize", enabled: !maximized, accelerator: "Alt+F10", click: () => { mainWindow?.maximize(); } },
    { type: "separator" },
    { label: "Close", accelerator: "Alt+F4", click: () => { mainWindow?.close(); } },
  ]);
  menu.popup({ window: mainWindow });
}

function registerIpc() {
  ipcMain.handle("window:minimize", (event, input: unknown) => { assertRequest(event, input, ["version"]); mainWindow?.minimize(); });
  ipcMain.handle("window:toggle-maximize", (event, input: unknown) => {
    assertRequest(event, input, ["version"]);
    if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize();
    sendWindowState();
    return { maximized: mainWindow?.isMaximized() ?? false };
  });
  ipcMain.handle("window:close", (event, input: unknown) => { assertRequest(event, input, ["version"]); mainWindow?.close(); });
  ipcMain.handle("window:is-maximized", (event, input: unknown) => { assertRequest(event, input, ["version"]); return mainWindow?.isMaximized() ?? false; });
  ipcMain.handle("window:show-system-menu", (event, input: unknown) => { assertRequest(event, input, ["version"]); showSystemMenu(); });
  ipcMain.handle("accounts:list", (event, input: unknown) => { assertRequest(event, input, ["version"]); return unavailable("Account listing"); });
  ipcMain.handle("accounts:start-login", (event, input: unknown) => {
    assertRequest(event, input, ["version", "slotId", "flow"]);
    if (!isRecord(input) || (input.flow !== "browser" && input.flow !== "deviceCode") || (input.slotId !== undefined && (typeof input.slotId !== "string" || input.slotId.length < 1 || input.slotId.length > 128))) throw new TypeError("Invalid account login request");
    return unavailable("Account sign-in");
  });
  ipcMain.handle("accounts:cancel-login", (event, input: unknown) => { assertRequest(event, input, ["version", "loginId"]); if (!isRecord(input) || typeof input.loginId !== "string" || input.loginId.length < 1 || input.loginId.length > 200) throw new TypeError("Invalid login id"); return unavailable("Account sign-in cancellation"); });
  ipcMain.handle("accounts:activate", (event, input: unknown) => { assertRequest(event, input, ["version", "slotId"]); if (!isRecord(input) || typeof input.slotId !== "string" || input.slotId.length < 1 || input.slotId.length > 200) throw new TypeError("Invalid account slot id"); return unavailable("Account activation"); });
  ipcMain.handle("accounts:logout", (event, input: unknown) => { assertRequest(event, input, ["version", "slotId"]); if (!isRecord(input) || typeof input.slotId !== "string" || input.slotId.length < 1 || input.slotId.length > 200) throw new TypeError("Invalid account slot id"); return unavailable("Account logout"); });
  ipcMain.handle("projects:list", (event, input: unknown) => { assertRequest(event, input, ["version"]); return unavailable("Project listing"); });
  ipcMain.handle("projects:create", (event, input: unknown) => { assertRequest(event, input, ["version", "name"]); if (!isRecord(input) || typeof input.name !== "string" || input.name.trim().length < 1 || input.name.trim().length > 120) throw new TypeError("Invalid project creation request"); return unavailable("Project creation"); });
  ipcMain.handle("projects:open", (event, input: unknown) => { assertRequest(event, input, ["version", "projectId"]); if (!isRecord(input) || typeof input.projectId !== "string" || input.projectId.length < 1 || input.projectId.length > 200) throw new TypeError("Invalid project id"); return unavailable("Project opening"); });
  ipcMain.handle("app:provenance", (event, input: unknown): AppProvenance => { assertRequest(event, input, ["version"]); const value = readPackagedProvenance(join(app.getAppPath(), "provenance.json"), app.getVersion()); return { version: value.version, updatedAt: value.updatedAt, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }; });
  ipcMain.handle("app:renderer-ready", (event, input: unknown) => { assertRequest(event, input, ["version"]); routeState = { ...routeState, rendererAcknowledged: true }; deliverProtocolRoute(); });
  ipcMain.handle("app:route-ack", (event, input: unknown) => { assertRequest(event, input, ["version", "deliveryId"]); if (!isRecord(input) || typeof input.deliveryId !== "string" || input.deliveryId.length < 1 || input.deliveryId.length > 128) throw new TypeError("Invalid route delivery id"); routeState = acknowledgeRoute(routeState, input.deliveryId); });
}

function routeProtocol(argv: string[]) {
  const candidate = argv.find((value) => value.startsWith(`${PROTOCOL_SCHEME}://`));
  if (!candidate) return;
  const route = parseProtocolRoute(candidate);
  if (route) { routeState = { ...routeState, pendingRoute: route, inFlightDeliveryId: null }; deliverProtocolRoute(); }
}

function deliverProtocolRoute() {
  if (!mainWindow || mainWindow.isDestroyed() || !canDeliverRoute(routeState)) return;
  const route = routeState.pendingRoute;
  if (!route) return;
  const deliveryId = randomUUID();
  routeState = beginRouteDelivery(routeState, deliveryId);
  mainWindow.webContents.send("app:route", protocolRouteEvent(route, deliveryId));
}

async function createWindow() {
  const savedBounds = state.bounds ?? { x: 0, y: 0, ...DEFAULT_BOUNDS };
  const display = screen.getDisplayNearestPoint({ x: savedBounds.x, y: savedBounds.y });
  const bounds = clampBounds(savedBounds, display.workArea);
  lastNormalBounds = bounds;
  mainWindow = new BrowserWindow({ ...bounds, minWidth: Math.min(MIN_BOUNDS.width, bounds.width), minHeight: Math.min(MIN_BOUNDS.height, bounds.height), frame: false, title: PRODUCT_NAME, backgroundColor: "#0f1115", webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true } });
  if (state.maximized) mainWindow.maximize();
  mainWindow.on("move", rememberNormalBounds);
  mainWindow.on("resize", rememberNormalBounds);
  mainWindow.on("maximize", () => { if (lastNormalBounds) state.bounds = lastNormalBounds; state.maximized = true; saveStateSafely(); sendWindowState(); });
  mainWindow.on("unmaximize", () => { state.maximized = false; rememberNormalBounds(); sendWindowState(); });
  mainWindow.on("close", () => { if (pendingSave) clearTimeout(pendingSave); if (mainWindow?.isMaximized()) { state.maximized = true; if (lastNormalBounds) state.bounds = lastNormalBounds; } else { state.maximized = false; state.bounds = mainWindow?.getBounds(); } saveStateSafely(); });
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.on("before-input-event", (event, input) => { if (input.type === "keyDown" && input.alt && input.key === " ") { event.preventDefault(); showSystemMenu(); } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (isReviewedExternalHttps(url)) void shell.openExternal(url); return { action: "deny" }; });
  await mainWindow.loadFile(join(__dirname, "renderer.html"));
  routeState = { ...routeState, rendererLoaded: true };
  deliverProtocolRoute();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();
else {
  app.setAppUserModelId(APP_ID);
  app.setName(PRODUCT_NAME);
  app.setPath("userData", stableUserDataPath());
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
  routeProtocol(process.argv);
  app.on("second-instance", (_event, commandLine) => { routeProtocol(commandLine); if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.on("open-url", (event, url) => { event.preventDefault(); routeProtocol([url]); });
  runAfterReady(() => app.whenReady().then(() => undefined), () => configureSessionSecurity(session.defaultSession), async () => { statePath = join(app.getPath("userData"), "state.json"); state = loadState(); registerIpc(); await createWindow(); }).catch((error: unknown) => { console.error("Startup failed", error instanceof Error ? error.message : "unknown error"); dialog.showErrorBox(PRODUCT_NAME, "The application could not start. Check the local logs for details."); app.quit(); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}

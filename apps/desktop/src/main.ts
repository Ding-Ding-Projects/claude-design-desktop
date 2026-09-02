import { app, BrowserWindow, Menu, screen, shell } from "electron";
import { ipcMain } from "electron/main";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { AppProvenance } from "../../../packages/contracts/src/index";
import { clampBounds, DEFAULT_BOUNDS, MIN_BOUNDS } from "./window-bounds";

const APP_ID = "com.dingdingprojects.claudedesigndesktop";
const PRODUCT_NAME = "Claude Design Desktop";

type PersistedState = {
  version: 1;
  bounds?: { x: number; y: number; width: number; height: number };
  maximized?: boolean;
};

let mainWindow: BrowserWindow | null = null;
let statePath = "";
let state: PersistedState;

function stableUserDataPath() {
  return join(app.getPath("appData"), "Ding-Ding-Projects", "ClaudeDesignDesktop");
}

function loadState(): PersistedState {
  if (!statePath || !existsSync(statePath)) {
    return { version: 1 };
  }
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<PersistedState>;
    if (parsed.version !== 1) {
      return { version: 1 };
    }
    return { version: 1, bounds: parsed.bounds, maximized: Boolean(parsed.maximized) };
  } catch {
    return { version: 1 };
  }
}

function saveState() {
  mkdirSync(join(statePath, ".."), { recursive: true });
  const tmp = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  renameSync(tmp, statePath);
}

function sendWindowState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:state", { maximized: mainWindow.isMaximized() });
  }
}

function unavailable(feature: string): never {
  throw new Error(`${feature} is unavailable until its host service is connected`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function registerIpc() {
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (!mainWindow) return { maximized: false };
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    sendWindowState();
    return { maximized: mainWindow.isMaximized() };
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle("window:show-system-menu", () => {
    if (!mainWindow) return;
    const menu = Menu.buildFromTemplate([
      { label: "Restore", enabled: mainWindow.isMaximized(), click: () => mainWindow?.unmaximize() },
      { label: "Minimize", click: () => mainWindow?.minimize() },
      { type: "separator" },
      { label: "Close", click: () => mainWindow?.close() },
    ]);
    menu.popup({ window: mainWindow });
  });
  ipcMain.handle("accounts:list", () => unavailable("Account listing"));
  ipcMain.handle("accounts:start-login", (_event, input: unknown) => {
    if (!isRecord(input) || (input.flow !== "browser" && input.flow !== "deviceCode") || (input.slotId !== undefined && typeof input.slotId !== "string")) {
      throw new TypeError("Invalid account login request");
    }
    return unavailable("Account sign-in");
  });
  ipcMain.handle("accounts:cancel-login", (_event, loginId: unknown) => {
    if (typeof loginId !== "string" || loginId.length < 1 || loginId.length > 200) throw new TypeError("Invalid login id");
    return unavailable("Account sign-in cancellation");
  });
  ipcMain.handle("accounts:activate", (_event, slotId: unknown) => {
    if (typeof slotId !== "string" || slotId.length < 1 || slotId.length > 200) throw new TypeError("Invalid account slot id");
    return unavailable("Account activation");
  });
  ipcMain.handle("accounts:logout", (_event, slotId: unknown) => {
    if (typeof slotId !== "string" || slotId.length < 1 || slotId.length > 200) throw new TypeError("Invalid account slot id");
    return unavailable("Account logout");
  });
  ipcMain.handle("projects:list", () => unavailable("Project listing"));
  ipcMain.handle("projects:create", (_event, input: unknown) => {
    if (!isRecord(input) || typeof input.name !== "string" || input.name.trim().length < 1 || input.name.trim().length > 120 || Object.keys(input).some((key) => key !== "name")) {
      throw new TypeError("Invalid project creation request");
    }
    return unavailable("Project creation");
  });
  ipcMain.handle("app:provenance", (): AppProvenance => ({ version: app.getVersion(), updatedAt: process.env.CDD_UPDATED_AT ?? "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
}

async function createWindow() {
  const savedBounds = state.bounds ?? { x: 0, y: 0, ...DEFAULT_BOUNDS };
  const display = screen.getDisplayNearestPoint({ x: savedBounds.x ?? 0, y: savedBounds.y ?? 0 });
  const bounds = clampBounds(savedBounds, display.workArea);
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: Math.min(MIN_BOUNDS.width, bounds.width),
    minHeight: Math.min(MIN_BOUNDS.height, bounds.height),
    frame: false,
    title: PRODUCT_NAME,
    backgroundColor: "#0f1115",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  if (state.maximized) mainWindow.maximize();
  mainWindow.on("maximize", sendWindowState);
  mainWindow.on("unmaximize", sendWindowState);
  mainWindow.on("close", () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) state.maximized = true;
    else { state.maximized = false; state.bounds = mainWindow.getBounds(); }
    saveState();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  await mainWindow.loadFile(join(__dirname, "renderer.html"));
}

app.setAppUserModelId(APP_ID);
app.setName(PRODUCT_NAME);
app.whenReady().then(async () => {
  app.setPath("userData", stableUserDataPath());
  statePath = join(app.getPath("userData"), "state.json");
  state = loadState();
  registerIpc();
  await createWindow();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

import { BrowserWindow, Menu, app, ipcMain, protocol, screen } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRouteParser } from "./route.mjs";
import { resolveProtocolResponse } from "./protocol-response.mjs";
import { clampWindowBounds, validPersistedState } from "./window-state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(here, "screens.json");
const indexPath = resolve(here, "index.html");
const appScriptPath = resolve(here, "app.js");
const stylePath = resolve(here, "styles.css");
const routes = JSON.parse(readFileSync(dataPath, "utf8"));
const parseRoute = createRouteParser(routes);
const knownScreens = new Set(routes.screens.map((item) => item.id));
let windowRef;
let persistedStatePath;

const value = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

function routeFromArgs() {
  const route = new URL(`design-reference://${value("screen", routes.defaults.screen)}`);
  for (const [key, current] of Object.entries({ state: value("state", routes.defaults.state), theme: value("theme", routes.defaults.theme), locale: value("locale", routes.defaults.locale), width: value("width", String(routes.defaults.width)), height: value("height", String(routes.defaults.height)), scale: value("scale", String(routes.defaults.scale)), fixture: value("fixture", routes.defaults.fixture), time: value("time", routes.defaults.time), motion: value("motion", routes.defaults.motion), network: value("network", routes.defaults.network) })) route.searchParams.set(key, String(current));
  return route.href;
}

function serveStatic(request) {
  const files = { "/index.html": [indexPath, "text/html"], "/app.js": [appScriptPath, "text/javascript"], "/styles.css": [stylePath, "text/css"] };
  let response;
  try { response = resolveProtocolResponse(request.url, { parseRoute, files, knownScreens }); } catch (error) { return new Response(error.message, { status: 400 }); }
  if (!response || !existsSync(response.path)) return new Response("Not found", { status: 404 });
  return new Response(readFileSync(response.path), { status: response.status, headers: { "content-type": response.contentType, "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; navigate-to 'none'", "x-reference-screen": response.route.screen.id } });
}

function sendWindowState() {
  if (!windowRef || windowRef.isDestroyed()) return;
  windowRef.webContents.send("window:state", { maximized: windowRef.isMaximized(), focused: windowRef.isFocused() });
}

function showNativeMenu() {
  if (!windowRef || windowRef.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([
    { label: "Minimize", click: () => windowRef.minimize() },
    { label: windowRef.isMaximized() ? "Restore" : "Maximize", click: () => { if (windowRef.isMaximized()) windowRef.unmaximize(); else windowRef.maximize(); } },
    { type: "separator" },
    { label: "Close", click: () => windowRef.close() }
  ]);
  menu.popup({ window: windowRef });
}

function readPersistedState() {
  try {
    const value = JSON.parse(readFileSync(persistedStatePath, "utf8"));
    return validPersistedState(value) ? value : null;
  } catch { return null; }
}

function saveWindowState() {
  if (!windowRef || windowRef.isDestroyed() || windowRef.isMaximized()) return;
  const bounds = windowRef.getBounds();
  writeFileSync(persistedStatePath, JSON.stringify({ normal: bounds, maximized: windowRef.isMaximized() }, null, 2), "utf8");
}

protocol.registerSchemesAsPrivileged([{ scheme: "design-reference", privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false } }]);
const initialRoute = parseRoute(routeFromArgs());

app.whenReady().then(async () => {
  protocol.handle("design-reference", serveStatic);
  app.commandLine.appendSwitch("force-device-scale-factor", String(initialRoute.scale));
  persistedStatePath = resolve(app.getPath("userData"), "window-state.json");
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const saved = readPersistedState();
  const hasExplicitSize = process.argv.includes("--width") || process.argv.includes("--height");
  const requestedBounds = hasExplicitSize || !saved ? { x: workArea.x, y: workArea.y, width: initialRoute.width, height: initialRoute.height } : saved.normal;
  const bounds = clampWindowBounds(requestedBounds, workArea);
  windowRef = new BrowserWindow({ ...bounds, minWidth: 320, minHeight: 240, show: false, frame: false, backgroundColor: initialRoute.theme === "dark" ? "#141218" : "#fffbfe", webPreferences: { preload: resolve(here, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, zoomFactor: initialRoute.scale } });
  windowRef.setMenuBarVisibility(false);
  windowRef.on("maximize", () => { if (persistedStatePath) writeFileSync(persistedStatePath, JSON.stringify({ normal: windowRef.getNormalBounds(), maximized: true }, null, 2), "utf8"); sendWindowState(); });
  windowRef.on("unmaximize", () => { saveWindowState(); sendWindowState(); });
  windowRef.on("resize", saveWindowState);
  windowRef.on("move", saveWindowState);
  windowRef.on("closed", saveWindowState);
  windowRef.on("focus", sendWindowState);
  windowRef.on("blur", sendWindowState);
  windowRef.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  windowRef.webContents.on("will-navigate", (event, url) => { try { parseRoute(url); } catch { event.preventDefault(); } });
  windowRef.webContents.on("will-redirect", (event) => event.preventDefault());
  windowRef.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  windowRef.webContents.on("context-menu", (event) => { event.preventDefault(); showNativeMenu(); });
  windowRef.webContents.on("before-input-event", (event, input) => { if (input.type === "keyDown" && input.alt && input.key === "F10") { event.preventDefault(); if (windowRef.isMaximized()) windowRef.unmaximize(); else windowRef.maximize(); } });
  await windowRef.loadURL(initialRoute.url.href);
  windowRef.webContents.setZoomFactor(initialRoute.scale);
  if (saved?.maximized && !hasExplicitSize) windowRef.maximize();
  windowRef.showInactive();
  sendWindowState();
});

ipcMain.handle("reference:data", () => routes);
ipcMain.handle("window:minimize", () => windowRef?.minimize());
ipcMain.handle("window:maximize", () => { if (!windowRef) return; if (windowRef.isMaximized()) windowRef.unmaximize(); else windowRef.maximize(); });
ipcMain.handle("window:close", () => windowRef?.close());
ipcMain.handle("window:menu", showNativeMenu);
app.on("window-all-closed", () => app.quit());

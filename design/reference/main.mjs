import { BrowserWindow, Menu, app, ipcMain, protocol } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRouteParser } from "./route.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(here, "screens.json");
const indexPath = resolve(here, "index.html");
const appScriptPath = resolve(here, "app.js");
const stylePath = resolve(here, "styles.css");
const routes = JSON.parse(readFileSync(dataPath, "utf8"));
const parseRoute = createRouteParser(routes);
let windowRef;

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
  const url = new URL(request.url);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const files = { "/index.html": [indexPath, "text/html"], "/app.js": [appScriptPath, "text/javascript"], "/styles.css": [stylePath, "text/css"] };
  const file = files[pathname];
  if (!file || !existsSync(file[0])) return new Response("Not found", { status: 404 });
  const route = pathname === "/index.html" && url.search ? parseRoute(request.url) : initialRoute;
  return new Response(readFileSync(file[0]), { headers: { "content-type": file[1], "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; navigate-to 'none'", "x-reference-screen": route.screen.id } });
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

protocol.registerSchemesAsPrivileged([{ scheme: "design-reference", privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false } }]);
const initialRoute = parseRoute(routeFromArgs());

app.whenReady().then(async () => {
  protocol.handle("design-reference", serveStatic);
  app.commandLine.appendSwitch("force-device-scale-factor", String(initialRoute.scale));
  windowRef = new BrowserWindow({ width: initialRoute.width, height: initialRoute.height, minWidth: 320, minHeight: 240, show: false, frame: false, backgroundColor: initialRoute.theme === "dark" ? "#141218" : "#fffbfe", webPreferences: { preload: resolve(here, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, zoomFactor: initialRoute.scale } });
  windowRef.setMenuBarVisibility(false);
  windowRef.on("maximize", sendWindowState);
  windowRef.on("unmaximize", sendWindowState);
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
  windowRef.showInactive();
  sendWindowState();
});

ipcMain.handle("reference:data", () => routes);
ipcMain.handle("window:minimize", () => windowRef?.minimize());
ipcMain.handle("window:maximize", () => { if (!windowRef) return; if (windowRef.isMaximized()) windowRef.unmaximize(); else windowRef.maximize(); });
ipcMain.handle("window:close", () => windowRef?.close());
ipcMain.handle("window:menu", showNativeMenu);
app.on("window-all-closed", () => app.quit());

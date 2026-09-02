import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routeFile = resolve(here, "screens.json");
const routes = JSON.parse(readFileSync(routeFile, "utf8"));
const value = (name, fallback) => { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] ?? fallback : fallback; };
const screen = value("screen", routes.defaults.screen);
const state = value("state", routes.defaults.state);
const theme = value("theme", routes.defaults.theme);
const locale = value("locale", routes.defaults.locale);
const width = Number(value("width", String(routes.defaults.width)));
const height = Number(value("height", String(routes.defaults.height)));
const scale = Number(value("scale", String(routes.defaults.scale)));
const time = value("time", routes.defaults.time);
const motion = value("motion", routes.defaults.motion);
const network = value("network", routes.defaults.network);
const allowed = routes.screens.some((item) => item.id === screen && item.state === state) || routes.screens.some((item) => item.id === screen);
if (!allowed || !Number.isInteger(width) || width < 320 || !Number.isInteger(height) || height < 240 || !Number.isFinite(scale) || scale <= 0 || Number.isNaN(Date.parse(time)) || motion !== "frozen" || network !== "disabled") throw new Error("Invalid reference route tuple");

let windowRef;
const createWindow = async () => {
  windowRef = new BrowserWindow({ width, height, minWidth: 320, minHeight: 240, show: false, frame: false, backgroundColor: theme === "dark" ? "#141218" : "#fffbfe", webPreferences: { preload: resolve(here, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  windowRef.setMenuBarVisibility(false);
  const route = new URL(pathToFileURL(resolve(here, "index.html")));
  for (const [key, current] of Object.entries({ screen, state, theme, locale, width, height, scale, fixture: routes.defaults.fixture, time, motion, random: routes.defaults.random, network })) route.searchParams.set(key, String(current));
  await windowRef.loadURL(route.href);
  windowRef.showInactive();
};
ipcMain.handle("window:minimize", () => windowRef?.minimize());
ipcMain.handle("window:maximize", () => { if (!windowRef) return; if (windowRef.isMaximized()) windowRef.unmaximize(); else windowRef.maximize(); });
ipcMain.handle("window:close", () => windowRef?.close());
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

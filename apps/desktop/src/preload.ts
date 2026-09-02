import type { AccountEvent, DesignerBridge } from "../../../packages/contracts/src/index";
import { contextBridge, ipcRenderer } from "electron";

const bridge: DesignerBridge = {
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    showSystemMenu: () => ipcRenderer.invoke("window:show-system-menu"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onStateChange: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: { maximized: boolean }) => listener(state);
      ipcRenderer.on("window:state", handler);
      return () => ipcRenderer.removeListener("window:state", handler);
    },
  },
  accounts: {
    list: () => ipcRenderer.invoke("accounts:list"),
    startLogin: (input) => ipcRenderer.invoke("accounts:start-login", input),
    cancelLogin: (loginId) => ipcRenderer.invoke("accounts:cancel-login", loginId),
    activate: (slotId) => ipcRenderer.invoke("accounts:activate", slotId),
    logout: (slotId) => ipcRenderer.invoke("accounts:logout", slotId),
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AccountEvent) => listener(payload);
      ipcRenderer.on("accounts:event", handler);
      return () => ipcRenderer.removeListener("accounts:event", handler);
    },
  },
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (input) => ipcRenderer.invoke("projects:create", input),
  },
  app: {
    provenance: () => ipcRenderer.invoke("app:provenance"),
  },
};

contextBridge.exposeInMainWorld("designer", bridge);

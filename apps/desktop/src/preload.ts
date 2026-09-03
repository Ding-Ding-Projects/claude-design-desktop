import { contextBridge, ipcRenderer } from "electron";
import { isAccountEvent, isAppRouteEvent, type DesignerBridge } from "../../../packages/contracts/src/index";

const REQUEST_VERSION = 1 as const;

const bridge: DesignerBridge = {
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize", { version: REQUEST_VERSION }),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize", { version: REQUEST_VERSION }),
    close: () => ipcRenderer.invoke("window:close", { version: REQUEST_VERSION }),
    showSystemMenu: () => ipcRenderer.invoke("window:show-system-menu", { version: REQUEST_VERSION }),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized", { version: REQUEST_VERSION }),
    onStateChange: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: { maximized: boolean }) => listener(state);
      ipcRenderer.on("window:state", handler);
      return () => ipcRenderer.removeListener("window:state", handler);
    },
  },
  accounts: {
    list: () => ipcRenderer.invoke("accounts:list", { version: REQUEST_VERSION }),
    startLogin: (input) => ipcRenderer.invoke("accounts:start-login", { version: REQUEST_VERSION, ...input }),
    cancelLogin: (loginId) => ipcRenderer.invoke("accounts:cancel-login", { version: REQUEST_VERSION, loginId }),
    activate: (slotId) => ipcRenderer.invoke("accounts:activate", { version: REQUEST_VERSION, slotId }),
    logout: (slotId) => ipcRenderer.invoke("accounts:logout", { version: REQUEST_VERSION, slotId }),
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => { if (isAccountEvent(payload)) listener(payload); };
      ipcRenderer.on("accounts:event", handler);
      return () => ipcRenderer.removeListener("accounts:event", handler);
    },
  },
  projects: {
    list: () => ipcRenderer.invoke("projects:list", { version: REQUEST_VERSION }),
    create: (input) => ipcRenderer.invoke("projects:create", { version: REQUEST_VERSION, ...input }),
    open: (projectId) => ipcRenderer.invoke("projects:open", { version: REQUEST_VERSION, projectId }),
  },
  app: {
    provenance: () => ipcRenderer.invoke("app:provenance", { version: REQUEST_VERSION }),
    onRoute: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => { if (isAppRouteEvent(payload)) { listener(payload); void ipcRenderer.invoke("app:route-ack", { version: REQUEST_VERSION, deliveryId: payload.deliveryId }); } };
      ipcRenderer.on("app:route", handler);
      return () => ipcRenderer.removeListener("app:route", handler);
    },
    rendererReady: () => ipcRenderer.invoke("app:renderer-ready", { version: REQUEST_VERSION }),
    acknowledgeRoute: (deliveryId) => ipcRenderer.invoke("app:route-ack", { version: REQUEST_VERSION, deliveryId }),
  },
};

contextBridge.exposeInMainWorld("designer", bridge);

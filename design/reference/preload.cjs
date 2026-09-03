const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("designReference", {
  data: () => ipcRenderer.invoke("reference:data"),
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    menu: () => ipcRenderer.invoke("window:menu"),
    onState: (listener) => {
      const handler = (_event, state) => listener(state);
      ipcRenderer.on("window:state", handler);
      return () => ipcRenderer.removeListener("window:state", handler);
    }
  }
});

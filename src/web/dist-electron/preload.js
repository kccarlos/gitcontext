import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("electron", {
  invoke: (channel, ...args) => {
    return Promise.reject(new Error(`IPC not implemented for channel: ${channel}`));
  }
});
window.isElectron = true;

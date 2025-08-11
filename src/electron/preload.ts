import { contextBridge } from 'electron'

// Minimal exposure to renderer
contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: unknown[]) => {
    // In a later task, wire ipcRenderer.invoke here
    return Promise.reject(new Error(`IPC not implemented for channel: ${channel}`))
  }
})

// Flag for isElectron() checks in renderer
// @ts-ignore
window.isElectron = true

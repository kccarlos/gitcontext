// Use CommonJS-style require to ensure compatibility with Electron preload
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { contextBridge /*, ipcRenderer*/ } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ..._args: unknown[]) => {
    return Promise.reject(new Error(`IPC not implemented for channel: ${channel}`))
  }
})

;(globalThis as any).isElectron = true

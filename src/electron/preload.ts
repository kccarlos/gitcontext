import { contextBridge, ipcRenderer } from 'electron'

const allowed = new Set(['git:call', 'fetch-models', 'tokenizer:count', 'dialog:pick-repo'])

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, payload?: any) => {
    if (!allowed.has(channel)) throw new Error('Channel not allowed: ' + channel)
    return ipcRenderer.invoke(channel, payload)
  },
})

// Optional flag (some code checks window.isElectron)
// @ts-ignore
;(window as any).isElectron = true

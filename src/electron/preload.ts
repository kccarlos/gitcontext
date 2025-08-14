import { contextBridge, ipcRenderer } from 'electron'

const allowed = new Set(['git:call', 'fetch-models', 'tokenizer:count', 'dialog:pick-repo'])
const allowedEvents = new Set(['git:progress'])

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, payload?: any) => {
    if (!allowed.has(channel)) throw new Error('Channel not allowed: ' + channel)
    return ipcRenderer.invoke(channel, payload)
  },
  on: (channel: string, listener: (payload: any) => void) => {
    if (!allowedEvents.has(channel)) throw new Error('Event not allowed: ' + channel)
    const wrapped = (_ev: any, payload: any) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.off(channel, wrapped)
  },
})

// Optional flag (some code checks window.isElectron)
// @ts-ignore
;(window as any).isElectron = true
// Also expose an explicit flag into the main world for contextIsolation
contextBridge.exposeInMainWorld('isElectron', true)

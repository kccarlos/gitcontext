import { app, BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const isDev = process.env.VITE_DEV_SERVER_URL !== undefined
const __dirnameSafe = dirname(fileURLToPath(import.meta.url))

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: true,
      preload: join(__dirnameSafe, 'preload.mjs'),
    }
  })

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    // In production, dist-electron/main.js sits next to ../dist/index.html
    win.loadFile(join(__dirnameSafe, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  // IPC: fetch LLM models from main process (used by renderer via preload bridge)
  ipcMain.handle('fetch-models', async () => {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) return null
      const apiResponse = await res.json()
      if (!apiResponse || !Array.isArray(apiResponse.data)) return null
      const models = apiResponse.data.map((apiModel: any) => ({
        id: apiModel.id,
        name: apiModel.name || apiModel.id,
        description: apiModel.description || '',
        context_length: apiModel.context_length || 0,
        pricing: apiModel.pricing || '',
        available: apiModel.available !== false,
      }))
      return models
    } catch {
      return null
    }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { Worker } from 'node:worker_threads'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

type EnvelopeOk = { id: number; type: 'ok'; data?: any }
type EnvelopeError = { id: number; type: 'error'; error: string }
type EnvelopeProgress = { id: number; type: 'progress'; message: string }
type Envelope = EnvelopeOk | EnvelopeError | EnvelopeProgress

function err(id: number, error: string): EnvelopeError { return { id, type: 'error', error } }

const __dirnameSafe = dirname(fileURLToPath(import.meta.url))
let gitWorker: Worker | null = null

function getGitWorker(): Worker {
  if (gitWorker) return gitWorker
  // Resolve built worker path when packaged with Vite plugin (same dir as main/preload)
  const workerPath = join(__dirnameSafe, 'workers', 'nodeGitWorker.js')
  gitWorker = new Worker(workerPath)
  return gitWorker
}

ipcMain.handle('git:call', async (_e, payload: any): Promise<Envelope> => {
  try {
    const id = Number(payload?.id ?? 0)
    const type = String(payload?.type ?? '')
    // Proxy to worker thread, keep envelope shape.
    const worker = getGitWorker()
    const request: any = (() => {
      if (type === 'loadRepo' && payload?.repoPath) return { id, type: 'loadRepo', repoPath: String(payload.repoPath) }
      return { id, type, ...payload }
    })()
    const response = await new Promise<Envelope>((resolve) => {
      const onMessage = (msg: Envelope) => {
        if (!msg || (msg as any).id !== id) return
        if (msg.type === 'progress') {
          // Re-emit progress notifications to renderer
          const win = BrowserWindow.getFocusedWindow()
          win?.webContents.send('git:progress', { id, message: msg.message })
          return
        }
        worker.off('message', onMessage)
        resolve(msg)
      }
      worker.on('message', onMessage)
      worker.postMessage(request)
    })
    return response
  } catch (e: any) {
    const id = Number(payload?.id ?? 0)
    return err(id, e?.message ?? String(e))
  }
})

ipcMain.handle('dialog:pick-repo', async () => {
  try {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths?.length) {
      return { type: 'error', error: 'cancelled' }
    }
    const dirPath = res.filePaths[0]
    const baseName = dirPath.split(/[\\/]/).pop() || ''
    return { type: 'ok', data: { path: dirPath, baseName } }
  } catch (e: any) {
    return { type: 'error', error: e?.message ?? String(e) }
  }
})



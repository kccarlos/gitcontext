import { ipcMain, dialog } from 'electron'

type EnvelopeOk = { id: number; type: 'ok'; data?: any }
type EnvelopeError = { id: number; type: 'error'; error: string }
type EnvelopeProgress = { id: number; type: 'progress'; message: string }
type Envelope = EnvelopeOk | EnvelopeError | EnvelopeProgress

function ok(id: number, data?: any): EnvelopeOk { return { id, type: 'ok', data } }
function err(id: number, error: string): EnvelopeError { return { id, type: 'error', error } }

ipcMain.handle('git:call', async (_e, payload: any): Promise<Envelope> => {
  try {
    const id = Number(payload?.id ?? 0)
    const type = String(payload?.type ?? '')
    switch (type) {
      case 'loadRepo': {
        // Minimal stub: return just WORKDIR sentinel
        return ok(id, { branches: ['__WORKDIR__'], defaultBranch: '__WORKDIR__' })
      }
      case 'listBranches': {
        return ok(id, { branches: ['__WORKDIR__'], defaultBranch: '__WORKDIR__' })
      }
      case 'diff': {
        return ok(id, { files: [] })
      }
      case 'listFiles': {
        return ok(id, { files: [] })
      }
      case 'readFile': {
        return ok(id, { binary: false, text: null, notFound: true })
      }
      case 'resolveRef': {
        return ok(id, { oid: '0'.repeat(40) })
      }
      default:
        return err(id, `Unknown git:call type: ${type}`)
    }
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



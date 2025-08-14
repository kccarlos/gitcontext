import { pickDirectory } from '../utils/fs'
import type { RepoPicker } from './types'

function isElectron(): boolean {
  // @ts-ignore
  const isRenderer = typeof window !== 'undefined' && typeof window.process !== 'undefined' && (window.process as any).type === 'renderer'
  // @ts-ignore
  const hasFlag = typeof window !== 'undefined' && (window as any).isElectron
  return isRenderer || hasFlag
}

class WebRepoPicker implements RepoPicker {
  async pickDirectory(): Promise<FileSystemDirectoryHandle> {
    return pickDirectory()
  }
}

class DesktopRepoPicker implements RepoPicker {
  async pickDirectory(): Promise<{ type: 'electron'; path: string }> {
    const invoke = (window as any)?.electron?.invoke as ((ch: string, payload?: any) => Promise<any>) | undefined
    if (!invoke) throw new Error('Electron bridge unavailable')
    const res = await invoke('dialog:pick-repo')
    if (!res || res.type !== 'ok') {
      const err = (res && res.error) ? String(res.error) : 'cancelled'
      throw new Error(err)
    }
    const path = String(res.data?.path || '')
    if (!path) throw new Error('No path selected')
    return { type: 'electron', path }
  }
}

export function createRepoPicker(): RepoPicker {
  return isElectron() ? new DesktopRepoPicker() : new WebRepoPicker()
}



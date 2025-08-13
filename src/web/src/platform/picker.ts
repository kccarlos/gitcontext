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
    throw new Error('Desktop RepoPicker not yet wired. Will be implemented in Phase 2.5')
  }
}

export function createRepoPicker(): RepoPicker {
  return isElectron() ? new DesktopRepoPicker() : new WebRepoPicker()
}



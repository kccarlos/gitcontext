import { createGitWorkerClient } from '../utils/gitWorkerClient'
import type { GitEngine } from './types'

function createIpcClient(onProgress?: (message: string) => void): GitEngine {
  const invoke = (window as any)?.electron?.invoke as ((ch: string, payload?: any) => Promise<any>) | undefined
  if (!invoke) {
    // Fallback to web engine if preload isn't available yet
    return createWebEngine(onProgress)
  }
  let idCounter = 1
  return {
    dispose() {},
    async loadRepo(repoKey: string, opts: any) {
      const id = idCounter++
      const res = await invoke('git:call', { id, type: 'loadRepo', repoKey, ...opts })
      if (res?.type === 'progress') onProgress?.(res.message)
      if (res?.type === 'error') throw new Error(res.error)
      return res?.data
    },
    async listBranches() {
      const id = idCounter++
      const res = await invoke('git:call', { id, type: 'listBranches' })
      if (res?.type === 'error') throw new Error(res.error)
      return res?.data
    },
    async diff(a: string, b: string) {
      const id = idCounter++
      const res = await invoke('git:call', { id, type: 'diff', base: a, compare: b })
      if (res?.type === 'error') throw new Error(res.error)
      return res?.data
    },
    async listFiles(ref: string) {
      const id = idCounter++
      const res = await invoke('git:call', { id, type: 'listFiles', ref })
      if (res?.type === 'error') throw new Error(res.error)
      return res?.data
    },
    async readFile(ref: string, filepath: string) {
      const id = idCounter++
      const res = await invoke('git:call', { id, type: 'readFile', ref, filepath })
      if (res?.type === 'error') throw new Error(res.error)
      return res?.data
    },
    async resolveRef(ref: string) {
      const id = idCounter++
      const res = await invoke('git:call', { id, type: 'resolveRef', ref })
      if (res?.type === 'error') throw new Error(res.error)
      return res?.data
    },
  }
}

function isElectron(): boolean {
  // mirrors utils/models.ts heuristic used in tests
  // @ts-ignore
  const isRenderer = typeof window !== 'undefined' && typeof window.process !== 'undefined' && (window.process as any).type === 'renderer'
  // @ts-ignore
  const hasFlag = typeof window !== 'undefined' && (window as any).isElectron
  return isRenderer || hasFlag
}

function fastPathEnabled(): boolean {
  // Gate desktop IPC engine behind a flag to keep tests/web behavior unchanged until Phase 3
  // @ts-ignore
  const winFlag = typeof window !== 'undefined' && Boolean((window as any).GC_DESKTOP_FAST_PATH)
  // @ts-ignore
  const envFlag = typeof process !== 'undefined' && (process as any)?.env && ((process as any).env.GC_DESKTOP_FAST_PATH === '1')
  return Boolean(winFlag || envFlag)
}

// Web adapter — thin wrapper to satisfy GitEngine type
function createWebEngine(onProgress?: (message: string) => void): GitEngine {
  const client = createGitWorkerClient(onProgress)
  return {
    dispose: () => client.dispose(),
    loadRepo: (repoKey: string, opts: any) => client.loadRepo(repoKey, opts),
    listBranches: () => client.listBranches(),
    diff: (a: string, b: string) => client.diff(a, b),
    listFiles: (ref: string) => client.listFiles(ref),
    readFile: (ref: string, filepath: string) => client.readFile(ref, filepath),
    resolveRef: (ref: string) => client.resolveRef(ref),
  }
}

// Desktop adapter placeholder — wires to IPC in Phase 2.6
function createDesktopEngine(onProgress?: (message: string) => void): GitEngine {
  return createIpcClient(onProgress)
}

export function createGitEngine(onProgress?: (message: string) => void): GitEngine {
  if (isElectron() && fastPathEnabled()) return createDesktopEngine(onProgress)
  return createWebEngine(onProgress)
}



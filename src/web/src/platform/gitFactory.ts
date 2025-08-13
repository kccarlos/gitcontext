import { createGitWorkerClient } from '../utils/gitWorkerClient'
import type { GitEngine } from './types'

function isElectron(): boolean {
  // mirrors utils/models.ts heuristic used in tests
  // @ts-ignore
  const isRenderer = typeof window !== 'undefined' && typeof window.process !== 'undefined' && (window.process as any).type === 'renderer'
  // @ts-ignore
  const hasFlag = typeof window !== 'undefined' && (window as any).isElectron
  return isRenderer || hasFlag
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
  // temporarily reuse web path (Phase 3 replaces this)
  return createWebEngine(onProgress)
}

export function createGitEngine(onProgress?: (message: string) => void): GitEngine {
  return isElectron() ? createDesktopEngine(onProgress) : createWebEngine(onProgress)
}



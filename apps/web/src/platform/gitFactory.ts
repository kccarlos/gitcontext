import { createGitWorkerClient } from '../utils/gitWorkerClient'
import type { GitEngine } from './types'
import { readWorkdirFile } from '../utils/workdirReader'
import { computeWorkdirDiff } from '../utils/workdirDiff'
import { listWorkdirFiles } from '../utils/fs'

// Simple LRU cache for readFile results
class ReadFileCache {
  private cache = new Map<string, any>()
  private maxSize = 64 // Cache up to 64 file reads

  get(key: string): any | undefined {
    if (!this.cache.has(key)) return undefined
    // Move to end (most recently used)
    const value = this.cache.get(key)!
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key: string, value: any): void {
    // Delete if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // Add to end
    this.cache.set(key, value)
    // Evict oldest if over capacity
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value as string
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }
}

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
    async listFilesWithOids(ref: string) {
      const id = idCounter++
      const res = await invoke('git:call', { id, type: 'listFilesWithOids', ref })
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
  let currentDirHandle: FileSystemDirectoryHandle | null = null
  const fileCache = new ReadFileCache()

  const WORKDIR_SENTINEL = '__WORKDIR__'

  return {
    dispose: () => {
      fileCache.clear()
      client.dispose()
    },
    loadRepo: (repoKey: string, opts: any) => {
      fileCache.clear() // Clear cache on repo load
      return client.loadRepo(repoKey, opts)
    },
    listBranches: () => client.listBranches(),
    async diff(base: string, compare: string) {
      // Special handling for WORKDIR diffs (web only)
      // Since worktree is not seeded, compute diff via main thread
      if (base === WORKDIR_SENTINEL || compare === WORKDIR_SENTINEL) {
        if (!currentDirHandle) {
          throw new Error('Cannot compute WORKDIR diff: directory handle not set')
        }

        // Determine which ref has the commit (non-WORKDIR)
        const commitRef = base === WORKDIR_SENTINEL ? compare : base
        const workdirIsCompare = compare === WORKDIR_SENTINEL

        // Get tracked files from commit with their OIDs
        const { files: filesWithOids } = await client.listFilesWithOids(commitRef)

        // Compute WORKDIR diff via main thread
        const result = await computeWorkdirDiff({
          dirHandle: currentDirHandle,
          filesWithOids,
          // TODO: wire up progress and cancellation
        })

        // If WORKDIR is base, invert the types (remove → add, add → remove)
        if (!workdirIsCompare) {
          result.files.forEach(f => {
            if (f.type === 'remove') f.type = 'add'
            else if (f.type === 'add') f.type = 'remove'
          })
        }

        return { files: result.files }
      }

      // For commit-to-commit diffs, use worker
      return client.diff(base, compare)
    },
    async listFiles(ref: string) {
      // Route WORKDIR listing to main thread
      if (ref === WORKDIR_SENTINEL) {
        if (!currentDirHandle) {
          throw new Error('Cannot list WORKDIR files: directory handle not set')
        }
        const files = await listWorkdirFiles(currentDirHandle)
        return { files }
      }
      // For commit refs, use worker
      return client.listFiles(ref)
    },
    listFilesWithOids: (ref: string) => client.listFilesWithOids(ref),
    async readFile(ref: string, filepath: string) {
      // Generate cache key
      // For WORKDIR, we could include file metadata but for simplicity accept minor staleness
      const cacheKey = `${ref}:${filepath}`

      // Check cache
      const cached = fileCache.get(cacheKey)
      if (cached !== undefined) {
        return cached
      }

      // Route WORKDIR reads through main-thread File System Access API
      let result: any
      if (ref === WORKDIR_SENTINEL) {
        if (!currentDirHandle) {
          throw new Error('Cannot read WORKDIR file: directory handle not set')
        }
        result = await readWorkdirFile(currentDirHandle, filepath)
      } else {
        // For all other refs, use worker
        result = await client.readFile(ref, filepath)
      }

      // Cache result
      fileCache.set(cacheKey, result)
      return result
    },
    resolveRef: (ref: string) => client.resolveRef(ref),
    setCurrentDir: (dirHandle: FileSystemDirectoryHandle | null) => {
      currentDirHandle = dirHandle
    },
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



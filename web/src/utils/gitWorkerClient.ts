export type LoadRepoResult = { branches: string[]; defaultBranch: string | null }
export type DiffFile = { path: string; type: 'modify' | 'add' | 'remove' }
export type DiffResult = { files: DiffFile[] }
export type ReadFileResult = { binary: boolean; text: string | null; notFound?: boolean }

type WorkerResponseOk = { id: number; type: 'ok'; data?: any }
type WorkerResponseError = { id: number; type: 'error'; error: string }
type WorkerResponseProgress = { id: number; type: 'progress'; message: string }
type WorkerResponse = WorkerResponseOk | WorkerResponseError | WorkerResponseProgress

export function createGitWorkerClient(onProgress?: (message: string) => void) {
  // Important: inline new URL inside new Worker() so Vite rewrites it in production.
  const worker = new Worker(new URL('../workers/gitWorker.ts', import.meta.url), {
    type: 'module',
  })

  let idCounter = 1
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()
  const REQUEST_TIMEOUT_MS = 60_000

  worker.onmessage = (ev: MessageEvent) => {
    const msg = ev.data as WorkerResponse
    try {
      // Inspect worker traffic in DevTools
      console.info('[worker → ui]', msg)
    } catch {}
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'progress') {
      onProgress?.(msg.message)
      return
    }
    const entry = pending.get((msg as any).id)
    if (!entry) return
    pending.delete((msg as any).id)
    if (msg.type === 'ok') {
      entry.resolve((msg as WorkerResponseOk).data)
    } else if (msg.type === 'error') {
      entry.reject(new Error((msg as WorkerResponseError).error))
    }
  }

  function dispose() {
    worker.terminate()
    for (const [, { reject }] of pending) {
      reject(new Error('Worker disposed'))
    }
    pending.clear()
  }

  worker.onerror = (e: ErrorEvent) => {
    try {
      console.error('[worker error]', e)
      console.error('[worker error details]', {
        message: e.message,
        type: e.type,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        error: (e as any)?.error,
      })
    } catch {}
    // Reject all in-flight requests so UI doesn't hang indefinitely
    const err = new Error(
      `Worker error: ${e?.message || e?.type || 'unknown'} @ ${e?.filename ?? ''}:${e?.lineno ?? 0}:${e?.colno ?? 0}`,
    )
    for (const [, { reject }] of pending) {
      try { reject(err) } catch {}
    }
    pending.clear()
  }

  function call<T>(payload: any): Promise<T> {
    const id = idCounter++
    const msg = { id, ...payload }
    return new Promise<T>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        // If still pending after timeout, reject and clear state
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`Worker request timed out after ${Math.floor(REQUEST_TIMEOUT_MS / 1000)} seconds. Type: ${String((payload && payload.type) || 'unknown')}`))
        }
      }, REQUEST_TIMEOUT_MS)

      pending.set(id, {
        resolve: (v: any) => {
          window.clearTimeout(timeoutId)
          resolve(v)
        },
        reject: (e: any) => {
          window.clearTimeout(timeoutId)
          reject(e)
        },
      })

      try {
        worker.postMessage(msg)
      } catch (e: any) {
        // Structured clone or non-serializable payload; fail fast
        window.clearTimeout(timeoutId)
        pending.delete(id)
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  function loadRepo(
    repoKey: string,
    opts: {
      dirHandle?: FileSystemDirectoryHandle
      gitFiles?: Array<{ path: string; data: Uint8Array }>
      workFiles?: Array<{ path: string; data: Uint8Array }>
    },
  ): Promise<LoadRepoResult> {
    return call<LoadRepoResult>({ type: 'loadRepo', repoKey, ...opts })
  }

  function listBranches(): Promise<LoadRepoResult> {
    return call<LoadRepoResult>({ type: 'listBranches' })
  }

  function diff(base: string, compare: string): Promise<DiffResult> {
    return call<DiffResult>({ type: 'diff', base, compare })
  }

  function readFile(ref: string, filepath: string): Promise<ReadFileResult> {
    return call<ReadFileResult>({ type: 'readFile', ref, filepath })
  }

  function listFiles(ref: string): Promise<{ files: string[] }> {
    return call<{ files: string[] }>({ type: 'listFiles', ref })
  }

  function resolveRef(ref: string): Promise<{ oid: string }> {
    return call<{ oid: string }>({ type: 'resolveRef', ref })
  }

  const api = {
    dispose,
    loadRepo,
    listBranches,
    diff,
    readFile,
    listFiles,
    resolveRef,
  } as any

  // Expose the next request id for UI debugging
  Object.defineProperty(api, '_nextId', {
    get: () => idCounter,
    enumerable: false,
  })

  return api
}

export type GitWorkerClient = ReturnType<typeof createGitWorkerClient>

/* Git Worker: offloads all Git/FS heavy operations to keep UI responsive.
   Responsibilities:
   - Initialize LightningFS and copy .git dir from a FileSystemDirectoryHandle
   - List branches and resolve default branch
   - Compute name-status diff between two refs
   - Read file content at a specific ref
   Notes:
   - This worker expects to be messaged using the RequestMessage format below.
   - It replies with responses carrying the same id, plus progress messages.
*/

 // LightningFS will be loaded lazily (see getFS) to avoid import-time crashes
// Polyfills: ensure Buffer and process exist in the worker context

import LightningFS from '@isomorphic-git/lightning-fs'
import * as BufferModule from 'buffer'
import ProcessModule from 'process'
import * as GIT from 'isomorphic-git'
import { detectBinaryByContent, SNIFF_BYTES, isBinaryPath } from '../shared/binary'

;(self as any).Buffer = (self as any).Buffer || (BufferModule as any).Buffer
;(self as any).process = (self as any).process || (ProcessModule as any)

// Lazy-load isomorphic-git inside worker to avoid import-time crashes
async function getGit() {
  // Globals are set above at module init; return statically imported ESM build
  return GIT as any
}


// Ensure required Node globals will exist (ensureGlobals will populate lazily)

// Boot diagnostics: let the UI know the worker file executed
try {
  ;(self as any).postMessage({ id: -1, type: 'progress', message: '[worker] booted' })
  ;(self as any).postMessage({
    id: -1,
    type: 'progress',
    message: `[worker] env: Buffer=${!!(self as any).Buffer}, process=${!!(self as any).process}`,
  })
} catch {}

// ---------- Message protocol types ----------
type ReqBase = { id: number }
type ResOk = { id: number; type: 'ok'; data?: any }
type ResError = { id: number; type: 'error'; error: string }
type ResProgress = { id: number; type: 'progress'; message: string }

type RequestMessage =
  | (ReqBase & {
      type: 'loadRepo'
      repoKey: string
      // Prefer passing a snapshot of .git files from the main thread for worker seeding.
      gitFiles?: Array<{ path: string; data: Uint8Array }>
      // Optional snapshot of working directory (excluding .git)
      workFiles?: Array<{ path: string; data: Uint8Array }>
      // Fallback (not recommended): pass a DirectoryHandle (may be restricted in workers)
      dirHandle?: FileSystemDirectoryHandle
    })
  | (ReqBase & { type: 'listBranches' })
  | (ReqBase & { type: 'diff'; base: string; compare: string })
  | (ReqBase & { type: 'listFiles'; ref: string })
  | (ReqBase & { type: 'listFilesWithOids'; ref: string })
  | (ReqBase & { type: 'readFile'; ref: string; filepath: string })
  | (ReqBase & { type: 'resolveRef'; ref: string })

type ResponseMessage = ResOk | ResError | ResProgress

// ---------- Internal worker state ----------
let lfs: any = null
let pfs: any = null as any // LightningFS.promises
let repoKey: string | null = null
let gitCache: Record<string, any> = Object.create(null)
const WORKDIR_SENTINEL = '__WORKDIR__'

// Dev-mode logging helper (only logs in development builds)
const DEV = import.meta.env.DEV
function devLog(msg: string) {
  if (DEV) {
    console.log(`[worker:dev] ${msg}`)
  }
}

// Simple LRU cache for diff results
class LRUCache<K, V> {
  private cache = new Map<K, V>()
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined
    // Move to end (most recently used)
    const value = this.cache.get(key)!
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    // Delete if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // Add to end
    this.cache.set(key, value)
    // Evict oldest if over capacity
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value as K
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }
}

// Diff result cache: keyed by (baseOid, compareOid)
const diffCache = new LRUCache<string, Array<{ path: string; type: 'modify' | 'add' | 'remove' }>>(16)

// ReadFile result cache: keyed by (commitOid:filepath)
// Cache value: { binary: boolean, text: string | null, notFound: boolean }
const readFileCache = new LRUCache<string, { binary: boolean; text: string | null; notFound: boolean }>(64)

// ---------- Helpers ----------
async function listBranchesFallbackFromFS(): Promise<string[]> {
  if (!pfs) return []
  const heads: string[] = []

  async function walk(dir: string, prefix: string) {
    let entries: string[]
    try {
      entries = await pfs.readdir(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const full = `${dir}/${name}`
      // If readdir on "full" succeeds, it's a directory; otherwise, it's a file.
      let isDir = false
      try {
        await pfs.readdir(full)
        isDir = true
      } catch {
        isDir = false
      }
      if (isDir) {
        await walk(full, prefix ? `${prefix}/${name}` : name)
      } else {
        heads.push(prefix ? `${prefix}/${name}` : name)
      }
    }
  }

  // refs/heads/*
  await walk('/.git/refs/heads', '')

  // packed-refs
  try {
    const packed = (await pfs.readFile('/.git/packed-refs')) as Uint8Array
    const text = new TextDecoder('utf-8').decode(packed)
    for (const line of text.split('\n')) {
      const l = line.trim()
      if (!l || l.startsWith('#') || l.startsWith('^')) continue
      const parts = l.split(/\s+/)
      if (parts.length < 2) continue
      const ref = parts[1]
      if (ref && ref.startsWith('refs/heads/')) {
        heads.push(ref.slice('refs/heads/'.length))
      }
    }
  } catch {
    // ignore if no packed-refs
  }

  // de-dup and sort
  return Array.from(new Set(heads)).sort()
}

async function computeBranches(): Promise<{ branches: string[]; defaultBranch: string | null }> {
  const git = await getGit()
  let branches: string[] = []
  try {
    branches = await git.listBranches({ fs: lfs, dir: '/' })
  } catch {
    // ignore
  }

  // Fallback to scanning refs and packed-refs
  if (!branches || branches.length === 0) {
    branches = await listBranchesFallbackFromFS()
  }

  // Read HEAD to get current branch if possible
  let headBranch: string | null = null
  try {
    const headBuf = (await pfs.readFile('/.git/HEAD')) as Uint8Array
    const headText = new TextDecoder('utf-8').decode(headBuf).trim()
    const m = headText.match(/^ref:\s+refs\/heads\/(.+)$/)
    if (m) headBranch = m[1]
  } catch {
    // no HEAD or detached HEAD
  }

  // Ensure HEAD branch is present in list
  if (headBranch && !branches.includes(headBranch)) {
    branches = [headBranch, ...branches]
  }

  const defaultBranch =
    headBranch ??
    (branches.includes('main') ? 'main' : branches.includes('master') ? 'master' : branches[0] || null)

  return { branches, defaultBranch }
}

// Utility: post response
function send(msg: ResponseMessage) {
  // eslint-disable-next-line no-restricted-globals
  ;(self as any).postMessage(msg)
}

// Utility: post progress (with same id as the request)
function progress(id: number, message: string) {
  send({ id, type: 'progress', message })
}

// Ensure a directory exists in LightningFS at 'path'
async function ensureDir(path: string) {
  const parts = path.split('/').filter(Boolean)
  let curr = ''
  for (const p of parts) {
    curr += '/' + p
    try {
      await pfs.mkdir(curr)
    } catch (e: any) {
      // ignore EEXIST-like errors; LightningFS throws generic
    }
  }
}

// Recursively copy a DirectoryHandle into LightningFS under destPath
async function copyDirectoryToLFS(id: number, src: FileSystemDirectoryHandle, destPath: string) {
  await ensureDir(destPath)
  // entries(): AsyncIterable<[name, FileSystemHandle]>
  // Cast any to avoid TS DOM version issues
  for await (const [name, handle] of (src as any).entries() as AsyncIterable<
    [string, FileSystemHandle]
  >) {
    if ((handle as any).kind === 'file') {
      const fileHandle = handle as FileSystemFileHandle
      const file = await fileHandle.getFile()
      const ab = await file.arrayBuffer()
      const buf = new Uint8Array(ab)
      const outPath = `${destPath}/${name}`
      // Ensure parent exists and write file
      await ensureDir(destPath)
      await pfs.writeFile(outPath, buf)
    } else {
      const dirHandle = handle as FileSystemDirectoryHandle
      await copyDirectoryToLFS(id, dirHandle, `${destPath}/${name}`)
    }
  }
}

// Load/Initialize repository into LightningFS by copying .git dir
async function handleLoadRepo(msg: Extract<RequestMessage, { type: 'loadRepo' }>): Promise<ResOk> {
  // Re-initialize LightningFS under a stable name to benefit from IndexedDB caching across sessions
  repoKey = msg.repoKey || 'repo'
  const fsName = `gitfs-${repoKey}`
  // Using top-level import for LightningFS so Vite pre-bundles CJS to ESM in the worker
  lfs = new LightningFS(fsName)
  pfs = lfs.promises
  gitCache = Object.create(null)
  diffCache.clear() // Clear diff cache on repo reload
  readFileCache.clear() // Clear readFile cache on repo reload

  progress(msg.id, 'Scanning .git directory…')

  // Seed LightningFS with .git contents
  if (msg.gitFiles && msg.gitFiles.length > 0) {
    progress(msg.id, `Seeding repository data… (${msg.gitFiles.length} files)`)
    for (const entry of msg.gitFiles) {
      const rel = entry.path.replace(/^\/+/, '')
      const outPath = '/.git/' + rel
      const parent = outPath.split('/').slice(0, -1).join('/')
      await ensureDir(parent)
      await pfs.writeFile(outPath, entry.data)
    }
  } else {
    // Fallback: copy directly from DirectoryHandle (may not work in all browsers/contexts)
    if (!msg.dirHandle) {
      throw new Error('No repository snapshot provided')
    }
    // Locate .git inside provided directory handle
    let gitDir: FileSystemDirectoryHandle
    try {
      gitDir = await msg.dirHandle.getDirectoryHandle('.git', { create: false })
    } catch (e: any) {
      throw new Error('Missing .git directory in selected folder')
    }
    // Copy into LightningFS root under "/.git"
    const dest = '/.git'
    await copyDirectoryToLFS(msg.id, gitDir, dest)
  }

  // Seed LightningFS with working directory files at root (skip collisions under .git)
  if (msg.workFiles && msg.workFiles.length > 0) {
    progress(msg.id, `Seeding working directory… (${msg.workFiles.length} files)`)
    for (const entry of msg.workFiles) {
      const rel = entry.path.replace(/^\/+/, '')
      if (rel === '.git' || rel.startsWith('.git/')) continue
      const outPath = '/' + rel
      const parent = outPath.split('/').slice(0, -1).join('/')
      await ensureDir(parent)
      await pfs.writeFile(outPath, entry.data)
    }
  }

  // Quick diagnostics before branch detection
  try {
    const headBuf = (await pfs.readFile('/.git/HEAD')) as Uint8Array
    const headText = new TextDecoder('utf-8').decode(headBuf).trim()
    progress(msg.id, `HEAD: ${headText}`)
  } catch {
    progress(msg.id, 'HEAD: <unavailable>')
  }
  try {
    const names = await pfs.readdir('/.git/refs/heads')
    progress(msg.id, `refs/heads entries: ${Array.isArray(names) ? names.length : 0}`)
  } catch {
    progress(msg.id, 'refs/heads entries: 0')
  }
  try {
    await pfs.readFile('/.git/packed-refs')
    progress(msg.id, 'packed-refs: present')
  } catch {
    progress(msg.id, 'packed-refs: absent')
  }

  // Verify: list branches quickly (with fallback)
  progress(msg.id, 'Verifying repository data…')
  let { branches, defaultBranch } = await computeBranches()
  // Prepend pseudo working directory branch
  branches = [WORKDIR_SENTINEL, ...branches]
  progress(msg.id, `Branches found: ${branches.length}${defaultBranch ? `, default: ${defaultBranch}` : ''}`)
  return { id: msg.id, type: 'ok', data: { branches, defaultBranch } }
}

async function handleListBranches(id: number): Promise<ResOk> {
  if (!pfs) throw new Error('Repository is not initialized in worker')
  const { branches, defaultBranch } = await computeBranches()
  return { id, type: 'ok', data: { branches: [WORKDIR_SENTINEL, ...branches], defaultBranch } }
}

async function handleListFiles(id: number, ref: string): Promise<ResOk> {
  if (!pfs) throw new Error('Repository is not initialized in worker')
  if (ref === WORKDIR_SENTINEL) {
    // WORKDIR listing is handled by main thread in web mode
    throw new Error('WORKDIR listing is not supported in worker. Use main-thread File System Access API.')
  }
  const git = await getGit()
  const files = await git.listFiles({ fs: lfs, dir: '/', ref })
  return { id, type: 'ok', data: { files } }
}

async function handleListFilesWithOids(id: number, ref: string): Promise<ResOk> {
  if (!pfs) throw new Error('Repository is not initialized in worker')
  if (ref === WORKDIR_SENTINEL) {
    throw new Error('listFilesWithOids does not support WORKDIR')
  }

  const git = await getGit()
  const commitOid = await git.resolveRef({ fs: lfs, dir: '/', ref })

  // Walk the tree and collect file paths with their OIDs
  const filesWithOids: Array<{ path: string; oid: string }> = []

  await git.walk({
    fs: lfs,
    dir: '/',
    trees: [(git as any).TREE({ ref: commitOid })],
    map: async (filepath: string, [entry]: Array<any>) => {
      if (filepath === '.') return
      if (filepath === '.git' || filepath.startsWith('.git/')) return

      const type = await entry?.type?.()
      if (type === 'tree') return // skip directories

      const oid = await entry?.oid?.()
      if (oid) {
        filesWithOids.push({ path: filepath, oid })
      }
    },
  })

  return { id, type: 'ok', data: { files: filesWithOids } }
}

type NameStatus = { path: string; type: 'modify' | 'add' | 'remove' }

async function handleDiff(
  id: number,
  base: string,
  compare: string,
): Promise<ResOk> {
  if (!pfs) throw new Error('Repository is not initialized in worker')

  devLog(`handleDiff: base=${base}, compare=${compare}`)
  const startTime = performance.now()

  // WORKDIR diffs are handled by main thread in web mode
  if (base === WORKDIR_SENTINEL || compare === WORKDIR_SENTINEL) {
    throw new Error('WORKDIR diff is not supported in worker. Use main-thread computation.')
  }

  if (base === compare) {
    progress(id, 'Base and compare are identical; empty diff.')
    devLog(`handleDiff completed in ${(performance.now() - startTime).toFixed(2)}ms (empty)`)
    return { id, type: 'ok', data: { files: [] } }
  }

  progress(id, 'Resolving refs…')
  const git = await getGit()
  const short = (s: string) => (s ? s.slice(0, 7) : s)
  let baseOid: string | null = null
  let compareOid: string | null = null
  try {
    if (base !== WORKDIR_SENTINEL) {
      baseOid = await git.resolveRef({ fs: lfs, dir: '/', ref: base })
    }
    if (compare !== WORKDIR_SENTINEL) {
      compareOid = await git.resolveRef({ fs: lfs, dir: '/', ref: compare })
    }
  } catch (e: any) {
    throw new Error(
      `Cannot resolve ${
        base !== WORKDIR_SENTINEL && !baseOid ? `base "${base}"` : `compare "${compare}"`
      }. It may not exist in this snapshot.`,
    )
  }
  progress(
    id,
    `Resolved base=${baseOid ? short(baseOid) : WORKDIR_SENTINEL} compare=${
      compareOid ? short(compareOid) : WORKDIR_SENTINEL
    }`,
  )

  // Check cache (only for non-WORKDIR diffs since WORKDIR can change)
  const cacheKey = `${baseOid || WORKDIR_SENTINEL}:${compareOid || WORKDIR_SENTINEL}`
  const useCache = base !== WORKDIR_SENTINEL && compare !== WORKDIR_SENTINEL
  if (useCache) {
    const cached = diffCache.get(cacheKey)
    if (cached) {
      devLog(`handleDiff cache hit: ${cacheKey}`)
      progress(id, `Diff complete. Files changed: ${cached.length} (cached)`)
      devLog(`handleDiff completed in ${(performance.now() - startTime).toFixed(2)}ms (cached)`)
      return { id, type: 'ok', data: { files: cached } }
    }
  }

  progress(id, 'Computing diff…')

  // Build walker trees outside the options to avoid syntax/type issues
  const A = base === WORKDIR_SENTINEL ? (git as any).WORKDIR() : (git as any).TREE({ ref: baseOid })
  const B = compare === WORKDIR_SENTINEL ? (git as any).WORKDIR() : (git as any).TREE({ ref: compareOid })

  let processed = 0
  const results = (await git.walk({
    fs: lfs,
    dir: '/',
    cache: gitCache,
    trees: [A, B],
    map: async (filepath: string, entries: Array<any | null>) => {
      processed++
      if (processed % 1000 === 0) {
        progress(id, `Scanned ${processed} entries…`)
      }
      if (filepath === '.') return
      if (filepath === '.git' || filepath.startsWith('.git/')) return
      // Respect .gitignore by consulting git's own ignore logic via WORKDIR + TREE walker filtering
      try {
        const ignored = await (git as any).isIgnored?.({ fs: lfs, dir: '/', filepath })
        if (ignored) return
      } catch {
        // older isomorphic-git may not have isIgnored; ignore silently
      }
      const [entryA, entryB] = entries as [any | null, any | null]
      const typeA = await entryA?.type?.()
      const typeB = await entryB?.type?.()
      if (typeA === 'tree' || typeB === 'tree') return // skip directories
      const oidA = await entryA?.oid?.()
      const oidB = await entryB?.oid?.()
      if (oidA === oidB) return // unchanged
      if (!oidA) return { path: filepath, type: 'add' } as NameStatus
      if (!oidB) return { path: filepath, type: 'remove' } as NameStatus
      return { path: filepath, type: 'modify' } as NameStatus
    },
  })) as Array<NameStatus | undefined>

  const files = results.filter((x): x is NameStatus => Boolean(x))

  // Store in cache (only for non-WORKDIR diffs)
  if (useCache) {
    diffCache.set(cacheKey, files)
    devLog(`handleDiff cache set: ${cacheKey}`)
  }

  progress(id, `Diff complete. Files changed: ${files.length}`)
  devLog(`handleDiff completed in ${(performance.now() - startTime).toFixed(2)}ms (${files.length} files, ${processed} entries scanned)`)
  return { id, type: 'ok', data: { files } }
}


async function handleReadFile(
  id: number,
  ref: string,
  filepath: string,
): Promise<ResOk> {
  if (!pfs) throw new Error('Repository is not initialized in worker')

  devLog(`handleReadFile: ref=${ref}, filepath=${filepath}`)
  const startTime = performance.now()

  // Fast extension short-circuit (no content read)
  if (isBinaryPath(filepath)) {
    if (ref === WORKDIR_SENTINEL) {
      try {
        await pfs.stat('/' + filepath)
        devLog(`handleReadFile completed in ${(performance.now() - startTime).toFixed(2)}ms (binary fast-path, exists)`)
        return { id, type: 'ok', data: { binary: true, text: null, notFound: false } }
      } catch {
        devLog(`handleReadFile completed in ${(performance.now() - startTime).toFixed(2)}ms (binary fast-path, not found)`)
        return { id, type: 'ok', data: { binary: false, text: null, notFound: true } }
      }
    }
    devLog(`handleReadFile completed in ${(performance.now() - startTime).toFixed(2)}ms (binary fast-path)`)
    return { id, type: 'ok', data: { binary: true, text: null, notFound: false } }
  }

  // Read raw and sniff (LightningFS can only read full files; we still only *inspect* a small prefix)
  if (ref === WORKDIR_SENTINEL) {
    try {
      const raw = (await pfs.readFile('/' + filepath)) as Uint8Array
      const sample = raw.subarray(0, SNIFF_BYTES)
      const binary = detectBinaryByContent(sample, filepath)
      const text = binary ? null : new TextDecoder('utf-8', { fatal: false }).decode(raw)
      devLog(`handleReadFile completed in ${(performance.now() - startTime).toFixed(2)}ms (WORKDIR, ${raw.length} bytes, binary=${binary})`)
      return { id, type: 'ok', data: { binary, text, notFound: false } }
    } catch {
      devLog(`handleReadFile completed in ${(performance.now() - startTime).toFixed(2)}ms (WORKDIR, not found)`)
      return { id, type: 'ok', data: { binary: false, text: null, notFound: true } }
    }
  }

  // For commit refs, resolve OID and check cache
  const git = await getGit()
  const commitOid = await git.resolveRef({ fs: lfs, dir: '/', ref })
  const cacheKey = `${commitOid}:${filepath}`

  // Check cache
  const cached = readFileCache.get(cacheKey)
  if (cached !== undefined) {
    devLog(`handleReadFile cache hit: ${cacheKey}`)
    devLog(`handleReadFile completed in ${(performance.now() - startTime).toFixed(2)}ms (cached)`)
    return { id, type: 'ok', data: cached }
  }

  let raw: Uint8Array | null = null
  try {
    const { blob } = (await git.readBlob({
      fs: lfs,
      dir: '/',
      oid: commitOid,
      filepath,
    })) as { blob: Uint8Array; oid: string }
    raw = blob as Uint8Array
  } catch (e: any) {
    // File does not exist at this ref (e.g. added/removed cases)
    const result = { binary: false, text: null, notFound: true }
    readFileCache.set(cacheKey, result)
    devLog(`handleReadFile cache set: ${cacheKey}`)
    devLog(`handleReadFile completed in ${(performance.now() - startTime).toFixed(2)}ms (commit, not found)`)
    return { id, type: 'ok', data: result }
  }

  const sample = (raw as Uint8Array).subarray(0, SNIFF_BYTES)
  const binary = detectBinaryByContent(sample, filepath)
  let text: string | null = null
  if (!binary && raw) {
    // Decode as UTF-8
    text = new TextDecoder('utf-8', { fatal: false }).decode(raw)
  }

  const result = { binary, text, notFound: false }
  readFileCache.set(cacheKey, result)
  devLog(`handleReadFile cache set: ${cacheKey}`)
  devLog(`handleReadFile completed in ${(performance.now() - startTime).toFixed(2)}ms (commit, ${raw.length} bytes, binary=${binary})`)
  return { id, type: 'ok', data: result }
}

self.addEventListener('error', (e: ErrorEvent) => {
  try {
    ;(self as any).postMessage({
      id: -1,
      type: 'error',
      error: `[worker error] ${e.message || e.type} @ ${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}`,
    })
  } catch {}
})

self.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  try {
    const msg = (e.reason && (e.reason.message || e.reason.stack || String(e.reason))) || 'unhandledrejection'
    ;(self as any).postMessage({
      id: -1,
      type: 'error',
      error: `[worker unhandledrejection] ${msg}`,
    })
  } catch {}
})

// ---------- Worker message dispatch ----------
self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data as RequestMessage
  try {
    switch (msg.type) {
      case 'loadRepo': {
        progress(msg.id, 'Initializing LightningFS…')
        const res = await handleLoadRepo(msg)
        send(res)
        return
      }
      case 'listBranches': {
        const res = await handleListBranches(msg.id)
        send(res)
        return
      }
      case 'listFiles': {
        const res = await handleListFiles(msg.id, (msg as any).ref)
        send(res)
        return
      }
      case 'listFilesWithOids': {
        const res = await handleListFilesWithOids(msg.id, (msg as any).ref)
        send(res)
        return
      }
      case 'diff': {
        const res = await handleDiff(msg.id, msg.base, msg.compare)
        send(res)
        return
      }
      case 'readFile': {
        const res = await handleReadFile(msg.id, msg.ref, msg.filepath)
        send(res)
        return
      }
      case 'resolveRef': {
        if (!pfs) throw new Error('Repository is not initialized in worker')
        const oid = await (await getGit()).resolveRef({ fs: lfs, dir: '/', ref: msg.ref })
        send({ id: msg.id, type: 'ok', data: { oid } })
        return
      }
      default:
        throw new Error(`Unknown request type: ${(msg as any).type}`)
    }
  } catch (e: any) {
    send({ id: msg.id, type: 'error', error: e?.message ?? String(e) })
  }
}

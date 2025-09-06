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
  | (ReqBase & { type: 'readFile'; ref: string; filepath: string })
  | (ReqBase & { type: 'resolveRef'; ref: string })

type ResponseMessage = ResOk | ResError | ResProgress

// ---------- Internal worker state ----------
let lfs: any = null
let pfs: any = null as any // LightningFS.promises
let repoKey: string | null = null
let gitCache: Record<string, any> = Object.create(null)
const WORKDIR_SENTINEL = '__WORKDIR__'

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
    branches = await git.listBranches({ fs: pfs, dir: '/' })
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
    // Walk working dir and list all files (excluding .git)
    const out: string[] = []
    async function walk(path: string) {
      let entries: string[]
      try {
        entries = await pfs.readdir(path)
      } catch {
        return
      }
      for (const name of entries) {
        const full = (path === '/' ? '' : path) + '/' + name
        if (full === '/.git' || full.startsWith('/.git/')) continue
        try {
          await pfs.readdir(full)
          await walk(full)
        } catch {
          out.push(full.slice(1))
        }
      }
    }
    await walk('/')
    return { id, type: 'ok', data: { files: out.sort() } }
  }
  const git = await getGit()
  const files = await git.listFiles({ fs: pfs, dir: '/', ref })
  return { id, type: 'ok', data: { files } }
}

type NameStatus = { path: string; type: 'modify' | 'add' | 'remove' }

async function handleDiff(
  id: number,
  base: string,
  compare: string,
): Promise<ResOk> {
  if (!pfs) throw new Error('Repository is not initialized in worker')

  if (base === compare) {
    progress(id, 'Base and compare are identical; empty diff.')
    return { id, type: 'ok', data: { files: [] } }
  }

  progress(id, 'Resolving refs…')
  const git = await getGit()
  const short = (s: string) => (s ? s.slice(0, 7) : s)
  let baseOid: string | null = null
  let compareOid: string | null = null
  try {
    if (base !== WORKDIR_SENTINEL) {
      baseOid = await git.resolveRef({ fs: pfs, dir: '/', ref: base })
    }
    if (compare !== WORKDIR_SENTINEL) {
      compareOid = await git.resolveRef({ fs: pfs, dir: '/', ref: compare })
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

  progress(id, 'Computing diff…')

  // Build walker trees outside the options to avoid syntax/type issues
  const A = base === WORKDIR_SENTINEL ? (git as any).WORKDIR() : (git as any).TREE({ ref: baseOid })
  const B = compare === WORKDIR_SENTINEL ? (git as any).WORKDIR() : (git as any).TREE({ ref: compareOid })

  let processed = 0
  const results = (await git.walk({
    fs: pfs,
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
        const ignored = await (git as any).isIgnored?.({ fs: pfs, dir: '/', filepath })
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
  progress(id, `Diff complete. Files changed: ${files.length}`)
  return { id, type: 'ok', data: { files } }
}

// Heuristic binary detection
function looksBinary(buf: Uint8Array): boolean {
  // If there are many zero bytes or high ASCII control chars, treat as binary
  const len = buf.length
  if (len === 0) return false
  let suspicious = 0
  const maxCheck = Math.min(len, 8192)
  for (let i = 0; i < maxCheck; i++) {
    const c = buf[i]
    // Allow common whitespace and ASCII printable range
    if (c === 0) {
      suspicious += 2
    } else if (c < 7 || (c > 13 && c < 32)) {
      suspicious++
    }
  }
  return suspicious / maxCheck > 0.3
}

async function handleReadFile(
  id: number,
  ref: string,
  filepath: string,
): Promise<ResOk> {
  if (!pfs) throw new Error('Repository is not initialized in worker')

  // Read raw to detect binary first
  if (ref === WORKDIR_SENTINEL) {
    try {
      const raw = (await pfs.readFile('/' + filepath)) as Uint8Array
      const binary = looksBinary(raw)
      const text = binary ? null : new TextDecoder('utf-8', { fatal: false }).decode(raw)
      return { id, type: 'ok', data: { binary, text, notFound: false } }
    } catch {
      return { id, type: 'ok', data: { binary: false, text: null, notFound: true } }
    }
  }
  const git = await getGit()
  const commitOid = await git.resolveRef({ fs: pfs, dir: '/', ref })

  let raw: Uint8Array | null = null
  try {
    const { blob } = (await git.readBlob({
      fs: pfs,
      dir: '/',
      oid: commitOid,
      filepath,
    })) as { blob: Uint8Array; oid: string }
    raw = blob as Uint8Array
  } catch (e: any) {
    // File does not exist at this ref (e.g. added/removed cases)
    return { id, type: 'ok', data: { binary: false, text: null, notFound: true } }
  }

  const binary = looksBinary(raw)
  let text: string | null = null
  if (!binary && raw) {
    // Decode as UTF-8
    text = new TextDecoder('utf-8', { fatal: false }).decode(raw)
  }

  return { id, type: 'ok', data: { binary, text, notFound: false } }
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
        const oid = await (await getGit()).resolveRef({ fs: pfs, dir: '/', ref: msg.ref })
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

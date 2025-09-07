import { parentPort } from 'worker_threads'
import * as fs from 'fs'
import * as path from 'path'
import * as git from 'isomorphic-git'
import { LRUCache } from 'lru-cache'
import { isBinaryPath, detectBinaryByContent, SNIFF_BYTES } from '../shared/binary'

type Msg =
  | { id: number; type: 'loadRepo'; repoPath: string }
  | { id: number; type: 'listBranches' }
  | { id: number; type: 'diff'; base: string; compare: string }
  | { id: number; type: 'listFiles'; ref: string }
  | { id: number; type: 'readFile'; ref: string; filepath: string }
  | { id: number; type: 'resolveRef'; ref: string }

let repoPath = ''
const blobCache = new LRUCache<string, { binary: boolean; text: string | null }>({ max: 512 })
let blobCacheHits = 0
const gitCache: Record<string, any> = Object.create(null)
const WORKDIR = '__WORKDIR__'

// Helper function to parse packed-refs
async function parsePackedRefs(repoPath: string): Promise<string[]> {
  const heads: string[] = []
  try {
    const packedPath = path.join(repoPath, '.git', 'packed-refs')
    const packed = await fs.promises.readFile(packedPath, 'utf8')
    for (const line of packed.split('\n')) {
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
  return heads
}

function send(msg: any) { parentPort?.postMessage(msg) }
function ok(id: number, data?: any) { send({ id, type: 'ok', data }) }
function err(id: number, error: string) { send({ id, type: 'error', error }) }
function progress(id: number, message: string) { send({ id, type: 'progress', message }) }

// (content sniffing comes from shared helper)

parentPort?.on('message', async (m: Msg) => {
  try {
    if (m.type === 'loadRepo') {
      repoPath = m.repoPath
      progress(m.id, `repo=${repoPath}`)
      // Discover branches (with fallback to refs/heads scan and packed-refs)
      const branches = await git.listBranches({ fs, dir: repoPath }).catch(async () => {
        const headsDir = path.join(repoPath, '.git', 'refs', 'heads')
        const list: string[] = []
        try {
          const stack = [{ p: headsDir, prefix: '' }]
          while (stack.length) {
            const { p, prefix } = stack.pop() as { p: string; prefix: string }
            const entries = await fs.promises.readdir(p, { withFileTypes: true }).catch(() => [])
            for (const e of entries) {
              if (e.isDirectory()) stack.push({ p: path.join(p, e.name), prefix: prefix ? `${prefix}/${e.name}` : e.name })
              else if (e.isFile()) list.push(prefix ? `${prefix}/${e.name}` : e.name)
            }
          }
        } catch {}
        
        // Also parse packed-refs
        const packedHeads = await parsePackedRefs(repoPath)
        list.push(...packedHeads)
        
        // de-dup and sort
        return Array.from(new Set(list)).sort()
      })
      const def = branches.includes('main') ? 'main'
                : branches.includes('master') ? 'master'
                : branches[0] ?? WORKDIR
      ok(m.id, { branches: [WORKDIR, ...branches], defaultBranch: def })
      return
    }
    if (!repoPath) throw new Error('Repo not loaded')
    switch (m.type) {
      case 'listBranches': {
        const branches = await git.listBranches({ fs, dir: repoPath }).catch(async () => {
          const headsDir = path.join(repoPath, '.git', 'refs', 'heads')
          const list: string[] = []
          try {
            const stack = [{ p: headsDir, prefix: '' }]
            while (stack.length) {
              const { p, prefix } = stack.pop() as { p: string; prefix: string }
              const entries = await fs.promises.readdir(p, { withFileTypes: true }).catch(() => [])
              for (const e of entries) {
                if (e.isDirectory()) stack.push({ p: path.join(p, e.name), prefix: prefix ? `${prefix}/${e.name}` : e.name })
                else if (e.isFile()) list.push(prefix ? `${prefix}/${e.name}` : e.name)
              }
            }
          } catch {}
          
          // Also parse packed-refs
          const packedHeads = await parsePackedRefs(repoPath)
          list.push(...packedHeads)
          
          // de-dup and sort
          return Array.from(new Set(list)).sort()
        })
        const def = branches.includes('main') ? 'main' : branches.includes('master') ? 'master' : branches[0] ?? WORKDIR
        ok(m.id, { branches: [WORKDIR, ...branches], defaultBranch: def })
        return
      }
      case 'resolveRef': {
        try {
          const oid = await git.resolveRef({ fs, dir: repoPath, ref: m.ref })
          ok(m.id, { oid })
        } catch {
          err(m.id, `Cannot resolve ref "${m.ref}"`)
        }
        return
      }
      case 'readFile': {
        // Fast path: known-binary extension => no content read
        if (isBinaryPath(m.filepath)) {
          if (m.ref !== WORKDIR) {
            ok(m.id, { binary: true, text: null, notFound: false }); return
          }
          // WORKDIR existence without reading file
          const fileAbs = path.join(repoPath, m.filepath)
          const exists = await fs.promises
            .stat(fileAbs)
            .then(() => true)
            .catch(() => false)
          ok(m.id, { binary: exists, text: null, notFound: !exists })
          return
        }
        if (m.ref !== WORKDIR) {
          const commitOid = await git.resolveRef({ fs, dir: repoPath, ref: m.ref }).catch(() => null as any)
          if (!commitOid) { ok(m.id, { binary: false, text: null, notFound: true }); return }
          const cacheKey = `${commitOid}:${m.filepath}`
          const cached = blobCache.get(cacheKey)
          if (cached) {
            blobCacheHits++
            if (blobCacheHits % 10 === 0) progress(m.id, `blob-cache hits=${blobCacheHits}`)
            ok(m.id, { ...cached, notFound: false })
            return
          }
          const res = await git.readBlob({ fs, dir: repoPath, oid: commitOid, filepath: m.filepath }).catch(() => null)
          if (!res) { ok(m.id, { binary: false, text: null, notFound: true }); return }
          const buf = Buffer.from(res.blob)
          const sample = buf.subarray(0, SNIFF_BYTES)
          const binary = detectBinaryByContent(sample, m.filepath)
          const value = { binary, text: binary ? null : buf.toString('utf8') }
          blobCache.set(cacheKey, value)
          ok(m.id, { ...value, notFound: false })
          return
        }
        // Partial read to sniff type without pulling whole large files
        const fileAbs = path.join(repoPath, m.filepath)
        const fd = await fs.promises.open(fileAbs, 'r').catch(() => null as any)
        if (!fd) { ok(m.id, { binary: false, text: null, notFound: true }); return }
        try {
          const probe = Buffer.allocUnsafe(SNIFF_BYTES)
          const { bytesRead } = await fd.read(probe, 0, SNIFF_BYTES, 0)
          const sample = probe.subarray(0, bytesRead)
          const binary = detectBinaryByContent(sample, m.filepath)
          if (binary) {
            ok(m.id, { binary: true, text: null, notFound: false })
          } else {
            // Now read full text if needed
            const full = await fs.promises.readFile(fileAbs, 'utf8')
            ok(m.id, { binary: false, text: full, notFound: false })
          }
        } finally {
          await fd.close().catch(() => {})
        }
        return
      }
      case 'listFiles': {
        if (m.ref !== WORKDIR) {
          const files = await git.listFiles({ fs, dir: repoPath, ref: m.ref }).catch(() => [])
          ok(m.id, { files })
          return
        }
        // Simple recursive read (placeholder for fast-glob optimization in later tasks)
        const results: string[] = []
        const root = repoPath
        async function walk(dir: string, rel: string) {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
          for (const e of entries) {
            if (e.name === '.git') continue
            const abs = path.join(dir, e.name)
            const nextRel = rel ? `${rel}/${e.name}` : e.name
            if (e.isDirectory()) await walk(abs, nextRel)
            else if (e.isFile()) {
              try {
                const ignored = await (git as any).isIgnored?.({ fs, dir: repoPath, filepath: nextRel })
                if (!ignored) results.push(nextRel)
              } catch {
                results.push(nextRel) // graceful fallback
              }
            }
          }
        }
        await walk(root, '')
        ok(m.id, { files: results })
        return
      }
      case 'diff': {
        const base = m.base
        const compare = m.compare
        if (base === compare) { ok(m.id, { files: [] }); return }
        const short = (s: string) => (s ? s.slice(0, 7) : s)
        let baseOid: string | null = null
        let compareOid: string | null = null
        if (base !== WORKDIR) {
          try { baseOid = await git.resolveRef({ fs, dir: repoPath, ref: base }) } catch {}
        }
        if (compare !== WORKDIR) {
          try { compareOid = await git.resolveRef({ fs, dir: repoPath, ref: compare }) } catch {}
        }
        progress(m.id, `Resolved base=${baseOid ? short(baseOid) : WORKDIR} compare=${compareOid ? short(compareOid) : WORKDIR}`)

        if (base !== WORKDIR && !baseOid) throw new Error(`Cannot resolve base "${base}"`)
        if (compare !== WORKDIR && !compareOid) throw new Error(`Cannot resolve compare "${compare}"`)
        const A = base === WORKDIR ? (git as any).WORKDIR() : (git as any).TREE({ ref: baseOid })
        const B = compare === WORKDIR ? (git as any).WORKDIR() : (git as any).TREE({ ref: compareOid })

        let processed = 0
        const results = (await git.walk({
          fs,
          dir: repoPath,
          cache: gitCache,
          trees: [A, B],
          map: async (filepath: string, entries: Array<any | null>) => {
            processed++
            if (processed % 1000 === 0) progress(m.id, `Scanned ${processed} entries…`)
            if (filepath === '.') return
            if (filepath === '.git' || filepath.startsWith('.git/')) return
            try {
              const ignored = await (git as any).isIgnored?.({ fs, dir: repoPath, filepath })
              if (ignored) return
            } catch {}
            const [entryA, entryB] = entries as [any | null, any | null]
            const typeA = await entryA?.type?.()
            const typeB = await entryB?.type?.()
            if (typeA === 'tree' || typeB === 'tree') return
            const oidA = await entryA?.oid?.()
            const oidB = await entryB?.oid?.()
            if (oidA === oidB) return
            if (!oidA) return { path: filepath, type: 'add' as const }
            if (!oidB) return { path: filepath, type: 'remove' as const }
            return { path: filepath, type: 'modify' as const }
          },
        })) as Array<{ path: string; type: 'modify' | 'add' | 'remove' } | undefined>
        const files = results.filter(Boolean) as Array<{ path: string; type: 'modify' | 'add' | 'remove' }>
        ok(m.id, { files })
        return
      }
      default:
        throw new Error('Unknown type: ' + (m as any).type)
    }
  } catch (e: any) {
    err((m as any).id ?? -1, e?.message ?? String(e))
  }
})



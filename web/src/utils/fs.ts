/* File System Access helpers for GitContext Web
   Notes:
   - Use any-casts to avoid DOM lib typing friction across TS versions.
   - Only read access is required for Epic 1.
*/
/* eslint-disable @typescript-eslint/no-explicit-any */
import ignore from 'ignore'

export type PermissionMode = 'read' | 'readwrite'

export async function queryPermission(handle: FileSystemHandle, mode: PermissionMode = 'read'): Promise<PermissionState> {
  const h = handle as any
  if (typeof h.queryPermission === 'function') {
    try {
      return await h.queryPermission({ mode })
    } catch {
      // Some browsers might throw; treat as prompt
      return 'prompt'
    }
  }
  // Fallback if not supported
  return 'prompt'
}

export async function requestPermission(handle: FileSystemHandle, mode: PermissionMode = 'read'): Promise<PermissionState> {
  const h = handle as any
  if (typeof h.requestPermission === 'function') {
    try {
      return await h.requestPermission({ mode })
    } catch {
      return 'denied'
    }
  }
  // If request not available, assume granted (older specs) — caller should still handle errors on actual access.
  return 'granted'
}

export async function ensurePermission(handle: FileSystemHandle, mode: PermissionMode = 'read'): Promise<PermissionState> {
  const state = await queryPermission(handle, mode)
  if (state === 'granted') return 'granted'
  if (state === 'denied') return 'denied'
  return requestPermission(handle, mode)
}

/**
 * Recursively navigate to a subdirectory path and return its handle.
 * pathSegments must be non-empty for nested directories.
 */
export async function getSubDirectoryHandle(
  dir: FileSystemDirectoryHandle,
  pathSegments: string[],
): Promise<FileSystemDirectoryHandle> {
  let current = dir
  for (const seg of pathSegments) {
    current = await current.getDirectoryHandle(seg, { create: false })
  }
  return current
}

/**
 * Read a text file at the given path relative to the provided directory handle.
 * Example: readFileTextFromDir(dirHandle, ['.git', 'HEAD'])
 */
export async function readFileTextFromDir(
  dir: FileSystemDirectoryHandle,
  path: string[],
): Promise<string> {
  if (path.length === 0) {
    throw new Error('Invalid path: empty')
  }
  const fileName = path[path.length - 1]
  const parentPath = path.slice(0, -1)
  const parentDir =
    parentPath.length > 0 ? await getSubDirectoryHandle(dir, parentPath) : dir
  const fileHandle = await parentDir.getFileHandle(fileName, { create: false })
  const file = await fileHandle.getFile()
  return await file.text()
}

/**
 * Verify that the provided directory looks like a Git repository root by checking for .git/HEAD.
 */
export async function verifyGitRepositoryRoot(
  dir: FileSystemDirectoryHandle,
): Promise<{ ok: true; head: string } | { ok: false; error: string }> {
  try {
    const headText = await readFileTextFromDir(dir, ['.git', 'HEAD'])
    return { ok: true, head: headText }
  } catch (e: any) {
    const msg = e?.name === 'NotFoundError'
      ? 'Not a valid Git repository (missing .git/HEAD)'
      : e?.message ?? String(e)
    return { ok: false, error: msg }
  }
}

/**
 * Try to re-authorize access to a previously stored directory handle.
 * Returns:
 *  - granted: ready to use
 *  - prompt: still requires user gesture to request permissions
 *  - denied: user or browser denied
 */
export async function reauthorizeIfNeeded(dir: FileSystemDirectoryHandle): Promise<PermissionState> {
  const state = await ensurePermission(dir, 'read')
  return state
}

/**
 * A safe wrapper around window.showDirectoryPicker.
 */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as any).showDirectoryPicker
  if (typeof picker !== 'function') {
    throw new Error('File System Access API is not supported in this browser')
  }
  const handle: FileSystemDirectoryHandle = await picker()
  return handle
}

/**
 * Snapshot the .git directory into a list of file entries for worker seeding.
 * Returns entries with paths relative to ".git" (e.g., "HEAD", "refs/heads/main", "objects/..").
 */
export async function snapshotGitFiles(
  repoRoot: FileSystemDirectoryHandle,
): Promise<Array<{ path: string; data: Uint8Array }>> {
  const entries: Array<{ path: string; data: Uint8Array }> = []

  let gitDir: FileSystemDirectoryHandle
  try {
    gitDir = await repoRoot.getDirectoryHandle('.git', { create: false })
  } catch {
    throw new Error('Missing .git directory in selected folder')
  }

  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    // DirectoryHandle.entries(): AsyncIterable<[name, FileSystemHandle]>
    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if ((handle as any).kind === 'file') {
        const f = await (handle as FileSystemFileHandle).getFile()
        const ab = await f.arrayBuffer()
        entries.push({ path: prefix ? `${prefix}/${name}` : name, data: new Uint8Array(ab) })
      } else {
        await walk(handle as FileSystemDirectoryHandle, prefix ? `${prefix}/${name}` : name)
      }
    }
  }

  await walk(gitDir, '') // paths will be relative to ".git"
  return entries
}

/**
 * Snapshot the working directory files (excluding .git) for a pseudo working-tree ref.
 * Returns entries with paths relative to repo root (e.g., "src/App.tsx").
 */
export async function snapshotWorktreeFiles(
  repoRoot: FileSystemDirectoryHandle,
): Promise<Array<{ path: string; data: Uint8Array }>> {
  const entries: Array<{ path: string; data: Uint8Array }> = []

  // Build ignore matcher from root-level gitignore and .git/info/exclude
  const ig = ignore()
  try {
    const gi = await readFileTextFromDir(repoRoot, ['.gitignore'])
    ig.add(gi)
  } catch {
    // no root .gitignore
  }
  try {
    const ex = await readFileTextFromDir(repoRoot, ['.git', 'info', 'exclude'])
    ig.add(ex)
  } catch {
    // no exclude
  }

  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      // Skip .git directory entirely
      if ((handle as any).kind === 'directory' && name === '.git') {
        continue
      }
      const relPath = prefix ? `${prefix}/${name}` : name
      // Apply ignore rules to both files and directories
      try {
        // Append trailing slash for directories when testing patterns ending with '/'
        const candidate = (handle as any).kind === 'directory' ? `${relPath}/` : relPath
        if (ig.ignores(candidate)) {
          continue
        }
      } catch {
        // ignore matcher errors
      }
      if ((handle as any).kind === 'file') {
        const f = await (handle as FileSystemFileHandle).getFile()
        const ab = await f.arrayBuffer()
        entries.push({ path: relPath, data: new Uint8Array(ab) })
      } else {
        await walk(handle as FileSystemDirectoryHandle, relPath)
      }
    }
  }

  await walk(repoRoot, '')
  return entries
}

/**
 * Lightweight snapshot of just refs for fast branch detection.
 * Includes:
 *  - HEAD
 *  - refs/heads/** (all local branch ref files)
 *  - packed-refs (if present)
 */
export async function snapshotGitRefs(
  repoRoot: FileSystemDirectoryHandle,
): Promise<Array<{ path: string; data: Uint8Array }>> {
  const out: Array<{ path: string; data: Uint8Array }> = []

  // .git directory
  const gitDir = await repoRoot.getDirectoryHandle('.git', { create: false })

  // HEAD
  try {
    const headFile = await gitDir.getFileHandle('HEAD', { create: false })
    const head = await (await headFile.getFile()).arrayBuffer()
    out.push({ path: 'HEAD', data: new Uint8Array(head) })
  } catch {
    // ignore
  }

  // refs/heads/**
  async function walkHeads(dir: FileSystemDirectoryHandle, prefix: string) {
    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if ((handle as any).kind === 'file') {
        const f = await (handle as FileSystemFileHandle).getFile()
        const ab = await f.arrayBuffer()
        out.push({ path: `${prefix}/${name}`, data: new Uint8Array(ab) })
      } else {
        await walkHeads(handle as FileSystemDirectoryHandle, `${prefix}/${name}`)
      }
    }
  }
  try {
    const headsDir = await gitDir.getDirectoryHandle('refs', { create: false })
    const headsSub = await headsDir.getDirectoryHandle('heads', { create: false })
    await walkHeads(headsSub, 'refs/heads')
  } catch {
    // ignore if missing
  }

  // packed-refs
  try {
    const packed = await gitDir.getFileHandle('packed-refs', { create: false })
    const pr = await (await packed.getFile()).arrayBuffer()
    out.push({ path: 'packed-refs', data: new Uint8Array(pr) })
  } catch {
    // ignore
  }

  return out
}

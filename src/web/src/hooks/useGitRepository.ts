import { useCallback, useEffect, useMemo, useState } from 'react'
import { createGitEngine } from '../platform/gitFactory'
import type { GitEngine } from '../platform/types'
import { pickDirectory, ensurePermission, verifyGitRepositoryRoot, snapshotGitFiles, snapshotWorktreeFiles } from '../utils/fs'
import type { AppStatus } from '../types/appStatus'

// Foundational repo mode for future expansion (git/plain)
export type RepoMode = 'git'

export type RepoStatus =
  | { state: 'idle' }
  | { state: 'loading'; message?: string }
  | { state: 'ready'; mode: RepoMode; headPreview?: string }
  | { state: 'error'; error: string }

export function useGitRepository(setAppStatus?: (s: AppStatus) => void) {
  const [currentDir, setCurrentDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [repoStatus, setRepoStatus] = useState<RepoStatus>({ state: 'idle' })
  const [gitClient, setGitClient] = useState<GitEngine | null>(null)
  const [gitProgress, setGitProgress] = useState<string | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [baseBranch, setBaseBranch] = useState<string>('')
  const [compareBranch, setCompareBranch] = useState<string>('')

  // Persist the branch pair so it survives Refresh and reloads
  useEffect(() => {
    if (!currentDir) return
    if (!baseBranch || !compareBranch) return
    const repoKey = `repo-${currentDir.name}`
    try {
      localStorage.setItem(
        `branchSel:${repoKey}`,
        JSON.stringify({ base: baseBranch, compare: compareBranch }),
      )
    } catch {
      // ignore quota / private-mode errors
    }
  }, [currentDir, baseBranch, compareBranch])

  const supportsFSAccess = useMemo(() => {
    try {
      return typeof (window as any).showDirectoryPicker === 'function'
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    return () => {
      try {
        gitClient?.dispose()
      } catch {}
    }
  }, [gitClient])

  const initWorkerLoad = useCallback(async (handle: FileSystemDirectoryHandle) => {
    if (gitClient) {
      try {
        gitClient.dispose()
      } catch {}
      // Clear the client reference to prevent race conditions
      setGitClient(null)
    }
    setGitProgress('Initializing repository worker…')
    setAppStatus?.({ state: 'LOADING', task: 'repo', message: 'Initializing repository…', progress: 'indeterminate' })
    try { console.info('[app-status]', { state: 'LOADING', task: 'repo', message: 'Initializing repository…', progress: 'indeterminate' }) } catch {}
    const client = createGitEngine((m: string) => {
      setGitProgress(m)
      const lower = (m || '').toLowerCase()
      let progress: number | 'indeterminate' = 'indeterminate'
      if (lower.includes('opening folder')) progress = 5
      else if (lower.includes('initializing lightningfs') || lower.includes('initializing repository')) progress = 10
      else if (lower.includes('snapshotting .git')) progress = 15
      else if (lower.includes('scanning .git')) progress = 20
      else if (lower.includes('seeding repository data')) progress = 40
      else if (lower.startsWith('head:')) progress = 60
      else if (lower.includes('refs/heads entries')) progress = 70
      else if (lower.includes('packed-refs')) progress = 75
      else if (lower.includes('verifying repository data')) progress = 85
      else if (lower.includes('branches found')) progress = 95
      setAppStatus?.({ state: 'LOADING', task: 'repo', message: m, progress })
      try { console.info('[app-status]', { state: 'LOADING', task: 'repo', message: m, progress }) } catch {}
      try { console.info('[git-worker]', m) } catch {}
    })
    try {
      // Selection persistence helpers (per repo name scope)
      const repoKey = `repo-${handle.name}`
      const loadSavedSelection = (): { base?: string; compare?: string } => {
        try {
          const raw = localStorage.getItem(`branchSel:${repoKey}`)
          return raw ? (JSON.parse(raw) as { base?: string; compare?: string }) : {}
        } catch {
          return {}
        }
      }
      const saveSelection = (base: string, compare: string) => {
        try {
          localStorage.setItem(
            `branchSel:${repoKey}`,
            JSON.stringify({ base, compare }),
          )
        } catch {}
      }
      function branchesFromSnapshot(files: Array<{ path: string; data: Uint8Array }>) {
        const heads = new Set<string>()
        let headBranch: string | null = null
        const headEntry = files.find((f) => f.path === 'HEAD')
        if (headEntry) {
          const txt = new TextDecoder('utf-8').decode(headEntry.data).trim()
          const m = txt.match(/^ref:\s+refs\/heads\/(.+)$/)
          if (m) headBranch = m[1]
        }
        for (const f of files) {
          if (f.path.startsWith('refs/heads/')) {
            const name = f.path.slice('refs/heads/'.length)
            if (name) heads.add(name)
          }
        }
        const packed = files.find((f) => f.path === 'packed-refs')
        if (packed) {
          const txt = new TextDecoder('utf-8').decode(packed.data)
          for (const line of txt.split('\n')) {
            const l = line.trim()
            if (!l || l.startsWith('#') || l.startsWith('^')) continue
            const parts = l.split(/\s+/)
            if (parts.length >= 2) {
              const ref = parts[1]
              if (ref && ref.startsWith('refs/heads/')) {
                heads.add(ref.slice('refs/heads/'.length))
              }
            }
          }
        }
        const list = Array.from(heads)
        list.sort()
        if (headBranch && !heads.has(headBranch)) {
          list.unshift(headBranch)
        } else if (headBranch && heads.has(headBranch)) {
          const idx = list.indexOf(headBranch)
          if (idx > 0) {
            list.splice(idx, 1)
            list.unshift(headBranch)
          }
        }
        const def = headBranch ?? (list.includes('main') ? 'main' : list.includes('master') ? 'master' : list[0] ?? null)
        return { branches: list, defaultBranch: def }
      }

      setGitProgress('Snapshotting .git files…')
      const gitFiles = await snapshotGitFiles(handle)
      const workFiles = await snapshotWorktreeFiles(handle)
      try { console.info('[snapshot] .git files:', gitFiles.length) } catch {}
      let res: any = null
      try {
        res = await client.loadRepo(repoKey, { gitFiles, workFiles })
      } catch (e: any) {
        console.warn('[git-worker] loadRepo failed, falling back to refs snapshot', e)
      }
      // Only publish the client once the repository is initialized in the worker
      if (res && res.branches) {
        setGitClient(client)
      }
      const fallback = !res || !res.branches || res.branches.length === 0 ? branchesFromSnapshot(gitFiles) : null
      let finalBranches: string[] = fallback ? fallback.branches : (res.branches as string[])
      // Ensure WORKDIR sentinel is present when falling back to snapshot-derived branches
      if (fallback) {
        const WORKDIR_SENTINEL = '__WORKDIR__'
        finalBranches = [WORKDIR_SENTINEL, ...finalBranches]
      }
      const finalDefault: string | null = fallback ? fallback.defaultBranch : (res.defaultBranch as string | null)
      try { console.info('[fallback] branches:', finalBranches.length, finalBranches) } catch {}
      setBranches(finalBranches)
      // Load any saved selection for this repo
      const saved = loadSavedSelection()

      // Compute next selection
      let nextBase = saved.base && finalBranches.includes(saved.base)
        ? saved.base
        : (baseBranch && finalBranches.includes(baseBranch)
            ? baseBranch
            : (finalDefault ?? (finalBranches[0] ?? '')))

      let nextCompare = saved.compare && finalBranches.includes(saved.compare)
        ? saved.compare
        : (compareBranch && finalBranches.includes(compareBranch)
            ? compareBranch
            : (finalBranches.find((b: string) => b !== nextBase) ?? ''))
      if (nextCompare === nextBase) {
        nextCompare = finalBranches.find((b: string) => b !== nextBase) ?? ''
      }
      setBaseBranch(nextBase)
      setCompareBranch(nextCompare)
      // Persist selection
      saveSelection(nextBase, nextCompare)
      try { console.info('[branches]', { base: nextBase, compare: nextCompare, branches: finalBranches }) } catch {}
      setAppStatus?.({ state: 'READY', message: 'Repository loaded successfully.' })
      try { console.info('[app-status]', { state: 'READY', message: 'Repository loaded successfully.' }) } catch {}
      // Now that the worker FS is initialized and branches known, publish the client
      setGitClient(client)
    } finally {
      // Keep the progress text until the consumer replaces it
      setGitProgress(null)
    }
  }, [gitClient, baseBranch, compareBranch])

  const loadRepoFromHandle = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setRepoStatus({ state: 'loading', message: 'Verifying Git repository…' })
    setAppStatus?.({ state: 'LOADING', task: 'repo', message: 'Verifying repository…', progress: 'indeterminate' })
    try { console.info('[app-status]', { state: 'LOADING', task: 'repo', message: 'Verifying repository…', progress: 'indeterminate' }) } catch {}
    const check = await verifyGitRepositoryRoot(handle)
    if (!check.ok) {
      setCurrentDir(null)
      setRepoStatus({ state: 'error', error: check.error })
      setAppStatus?.({ state: 'ERROR', message: check.error })
      try { console.info('[app-status]', { state: 'ERROR', message: check.error }) } catch {}
      return
    }
    setCurrentDir(handle)
    const headPreview = check.head.trim().slice(0, 120)
    setRepoStatus({ state: 'ready', mode: 'git', headPreview })
    await initWorkerLoad(handle)
  }, [initWorkerLoad])

  const selectNewRepo = useCallback(async (): Promise<boolean> => {
    if (!supportsFSAccess) return false
    const prevStatus = repoStatus
    setRepoStatus({ state: 'loading', message: 'Opening folder…' })
    setAppStatus?.({ state: 'LOADING', task: 'repo', message: 'Opening folder…', progress: 'indeterminate' })
    try { console.info('[app-status]', { state: 'LOADING', task: 'repo', message: 'Opening folder…', progress: 'indeterminate' }) } catch {}
    let handle: FileSystemDirectoryHandle
    try {
      handle = await pickDirectory()
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      if ((err as any).name === 'AbortError') {
        setRepoStatus(prevStatus)
        const appState: AppStatus = prevStatus.state === 'ready'
          ? { state: 'READY', message: 'Folder selection cancelled.' }
          : { state: 'IDLE' }
        setAppStatus?.(appState)
        try { console.info('[app-status]', appState) } catch {}
        return false
      }
      setRepoStatus({ state: 'error', error: err.message })
      setAppStatus?.({ state: 'ERROR', message: err.message })
      try { console.info('[app-status]', { state: 'ERROR', message: err.message }) } catch {}
      return false
    }
    const perm = await ensurePermission(handle, 'read')
    if (perm !== 'granted') {
      setRepoStatus({ state: 'error', error: 'Permission to read this folder was not granted.' })
      setAppStatus?.({ state: 'ERROR', message: 'Permission to read this folder was not granted.' })
      try { console.info('[app-status]', { state: 'ERROR', message: 'Permission to read this folder was not granted.' }) } catch {}
      return false
    }
    await loadRepoFromHandle(handle)
    return true
  }, [supportsFSAccess, loadRepoFromHandle, repoStatus])

  const refreshRepo = useCallback(async () => {
    if (!currentDir) return
    // Mark busy to block diff effects while worker is being re-initialized
    setRepoStatus({ state: 'loading', message: 'Refreshing…' })
    setAppStatus?.({ state: 'LOADING', task: 'refresh', message: 'Refreshing repository…', progress: 'indeterminate' })
    try { console.info('[app-status]', { state: 'LOADING', task: 'refresh', message: 'Refreshing repository…', progress: 'indeterminate' }) } catch {}
    await initWorkerLoad(currentDir)
    setRepoStatus({ state: 'ready', mode: 'git' })
    setAppStatus?.({ state: 'READY', message: 'Repository refreshed.' })
    try { console.info('[app-status]', { state: 'READY', message: 'Repository refreshed.' }) } catch {}
  }, [currentDir, initWorkerLoad])

  const resetRepo = useCallback(() => {
    try {
      gitClient?.dispose()
    } catch {}
    setGitClient(null)
    setCurrentDir(null)
    setRepoStatus({ state: 'idle' })
    setBranches([])
    setBaseBranch('')
    setCompareBranch('')
    setGitProgress(null)
    setAppStatus?.({ state: 'IDLE' })
  }, [gitClient])

  return {
    currentDir,
    repoStatus,
    gitClient,
    gitProgress,
    // expose setter only if needed by callers; keeping internal for now
    branches,
    baseBranch,
    setBaseBranch,
    compareBranch,
    setCompareBranch,
    loadRepoFromHandle,
    selectNewRepo,
    refreshRepo,
    resetRepo,
  }
}



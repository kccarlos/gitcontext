import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { TauriGitService } from '../services/TauriGitService'
import type { AppStatus } from '../types/appStatus'
import type { CommitInfo } from '@gitcontext/core'

// Debounce helper
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

export type RepoMode = 'git'

export type RepoStatus =
  | { state: 'idle' }
  | { state: 'loading'; message?: string }
  | { state: 'ready'; mode: RepoMode; headPreview?: string }
  | { state: 'error'; error: string }

export type BranchSelectionPreference = {
  base?: string
  compare?: string
}

type LoadRepoOptions = {
  preferredBranches?: BranchSelectionPreference
}

export function useGitRepository(setAppStatus?: (s: AppStatus) => void) {
  const [currentDir, setCurrentDir] = useState<string | null>(null)
  const [repoStatus, setRepoStatus] = useState<RepoStatus>({ state: 'idle' })
  const [gitClient] = useState(() => new TauriGitService())
  const [branches, setBranches] = useState<string[]>([])
  const [baseBranch, setBaseBranch] = useState<string>('')
  const [compareBranch, setCompareBranch] = useState<string>('')
  const [diffTrigger, setDiffTrigger] = useState(0) // Trigger diff refresh
  const loadRequestIdRef = useRef(0)

  // Commit-pinning state: null = branch tip, string = specific commit OID
  const [basePinnedCommit, setBasePinnedCommit] = useState<string | null>(null)
  const [comparePinnedCommit, setComparePinnedCommit] = useState<string | null>(null)
  const [baseCommits, setBaseCommits] = useState<CommitInfo[]>([])
  const [compareCommits, setCompareCommits] = useState<CommitInfo[]>([])
  const [baseCommitsLoading, setBaseCommitsLoading] = useState(false)
  const [compareCommitsLoading, setCompareCommitsLoading] = useState(false)

  const effectiveBaseRef = basePinnedCommit ?? baseBranch
  const effectiveCompareRef = comparePinnedCommit ?? compareBranch

  // Persist branch selection in localStorage
  useEffect(() => {
    if (!currentDir || !baseBranch || !compareBranch) return
    try {
      localStorage.setItem(
        `branchSel:${currentDir}`,
        JSON.stringify({ base: baseBranch, compare: compareBranch })
      )
    } catch {
      // ignore
    }
  }, [currentDir, baseBranch, compareBranch])

  useEffect(() => {
    return () => {
      void gitClient?.dispose()
    }
  }, [gitClient])

  // Debounced trigger for diff refresh
  const triggerDiffRefresh = useMemo(
    () => debounce(() => {
      setDiffTrigger(prev => prev + 1)
    }, 300),
    []
  )

  const loadRepoFromHandle = useCallback(async (path: string, options?: LoadRepoOptions): Promise<boolean> => {
    const requestId = ++loadRequestIdRef.current
    setRepoStatus({ state: 'loading', message: 'Loading repository...' })
    setAppStatus?.({ state: 'LOADING', task: 'repo', message: 'Loading repository...', progress: 'indeterminate' })

    try {
      const result = await gitClient.loadRepo(path, {})
      if (requestId !== loadRequestIdRef.current) return false

      setBranches(result.branches)
      setCurrentDir(path)

      // Restore saved branch selection or use defaults
      let savedBase = ''
      let savedCompare = ''
      try {
        const saved = localStorage.getItem(`branchSel:${path}`)
        if (saved) {
          const parsed = JSON.parse(saved)
          savedBase = parsed.base
          savedCompare = parsed.compare
        }
      } catch {}

      const preferredBase = options?.preferredBranches?.base
      const preferredCompare = options?.preferredBranches?.compare
      const branchList = result.branches
      const WORKDIR = '__WORKDIR__'

      const nextBase =
        [preferredBase, savedBase, result.defaultBranch]
          .find((branch) => Boolean(branch) && branchList.includes(branch as string)) ?? branchList[0] ?? ''

      const compareCandidates = [preferredCompare, savedCompare].filter(
        (branch): branch is string => Boolean(branch),
      )
      let nextCompare =
        compareCandidates.find((branch) => branchList.includes(branch) && branch !== nextBase) ?? ''
      if (!nextCompare) {
        nextCompare =
          branchList.find((branch) => branch !== nextBase && branch !== WORKDIR) ??
          branchList.find((branch) => branch !== nextBase) ??
          nextBase
      }
      if (!nextCompare && branchList.length === 1) nextCompare = branchList[0]

      setBaseBranch(nextBase)
      setCompareBranch(nextCompare)
      try {
        if (nextBase && nextCompare) {
          localStorage.setItem(`branchSel:${path}`, JSON.stringify({ base: nextBase, compare: nextCompare }))
        }
      } catch {}

      setRepoStatus({ state: 'ready', mode: 'git' })
      setAppStatus?.({ state: 'IDLE' })
      return true
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return false
      const message = error instanceof Error ? error.message : String(error)
      setRepoStatus({ state: 'error', error: message })
      setAppStatus?.({ state: 'ERROR', message })
      return false
    }
  }, [gitClient, setAppStatus])

  const selectNewRepo = useCallback(async (options?: LoadRepoOptions): Promise<string | null> => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Git Repository',
      })

      if (selected && typeof selected === 'string') {
        const loaded = await loadRepoFromHandle(selected, options)
        return loaded ? selected : null
      }
    } catch (error) {
      console.error('Failed to select repository:', error)
    }
    return null
  }, [loadRepoFromHandle])

  const refreshRepo = useCallback(async (options?: LoadRepoOptions): Promise<boolean> => {
    if (!currentDir) return false
    return loadRepoFromHandle(currentDir, options)
  }, [currentDir, loadRepoFromHandle])

  const resetRepo = useCallback(() => {
    loadRequestIdRef.current += 1
    gitClient.dispose()
    setRepoStatus({ state: 'idle' })
    setCurrentDir(null)
    setBranches([])
    setBaseBranch('')
    setCompareBranch('')
    setBasePinnedCommit(null)
    setComparePinnedCommit(null)
    setBaseCommits([])
    setCompareCommits([])
    setAppStatus?.({ state: 'IDLE' })
  }, [gitClient, setAppStatus])

  const handleBaseBranchChange = useCallback((branch: string) => {
    setBaseBranch(branch)
    setBasePinnedCommit(null)
  }, [])

  const handleCompareBranchChange = useCallback((branch: string) => {
    setCompareBranch(branch)
    setComparePinnedCommit(null)
  }, [])

  useEffect(() => {
    if (repoStatus.state !== 'ready' || !baseBranch || baseBranch === '__WORKDIR__') {
      setBaseCommits([])
      return
    }
    let cancelled = false
    setBaseCommitsLoading(true)
    gitClient.listCommits(baseBranch, 100).then((result) => {
      if (!cancelled) {
        setBaseCommits(result.commits)
        setBaseCommitsLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setBaseCommits([])
        setBaseCommitsLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [baseBranch, repoStatus.state, gitClient])

  useEffect(() => {
    if (repoStatus.state !== 'ready' || !compareBranch || compareBranch === '__WORKDIR__') {
      setCompareCommits([])
      return
    }
    let cancelled = false
    setCompareCommitsLoading(true)
    gitClient.listCommits(compareBranch, 100).then((result) => {
      if (!cancelled) {
        setCompareCommits(result.commits)
        setCompareCommitsLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setCompareCommits([])
        setCompareCommitsLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [compareBranch, repoStatus.state, gitClient])

  // Listen for working directory file changes
  useEffect(() => {
    if (!currentDir) return

    let unlisten: UnlistenFn | null = null
    const setup = async () => {
      unlisten = await listen<{ repoPath: string; changedFiles: string[] }>(
        'workdir-changed',
        (event) => {
          if (event.payload.repoPath !== currentDir) return
          // Only react if WORKDIR is currently selected
          if (baseBranch === '__WORKDIR__' || compareBranch === '__WORKDIR__') {
            console.log('Working directory changed, refreshing diff...', event.payload.changedFiles)
            triggerDiffRefresh()
          }
        }
      )
    }
    void setup()

    return () => {
      if (unlisten) void unlisten()
    }
  }, [currentDir, baseBranch, compareBranch, triggerDiffRefresh])

  // Listen for branch/refs changes
  useEffect(() => {
    if (!currentDir) return

    let unlisten: UnlistenFn | null = null
    const setup = async () => {
      unlisten = await listen<{ repoPath: string }>(
        'refs-changed',
        (event) => {
          if (event.payload.repoPath !== currentDir) return
          console.log('Git refs changed, refreshing branch list...', event.payload)
          // Use refreshRepo to reload branches
          void refreshRepo({
            preferredBranches: {
              base: baseBranch,
              compare: compareBranch,
            },
          })
        }
      )
    }
    void setup()

    return () => {
      if (unlisten) void unlisten()
    }
  }, [baseBranch, compareBranch, currentDir, refreshRepo])

  return {
    currentDir,
    repoStatus,
    gitClient,
    branches,
    baseBranch,
    setBaseBranch: handleBaseBranchChange,
    compareBranch,
    setCompareBranch: handleCompareBranchChange,
    basePinnedCommit,
    setBasePinnedCommit,
    comparePinnedCommit,
    setComparePinnedCommit,
    baseCommits,
    compareCommits,
    baseCommitsLoading,
    compareCommitsLoading,
    effectiveBaseRef,
    effectiveCompareRef,
    loadRepoFromHandle,
    selectNewRepo,
    refreshRepo,
    resetRepo,
    diffTrigger,
  }
}

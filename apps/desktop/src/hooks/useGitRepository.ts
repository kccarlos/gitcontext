import { useCallback, useEffect, useMemo, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { TauriGitService } from '../services/TauriGitService'
import type { AppStatus } from '../types/appStatus'

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

export function useGitRepository(setAppStatus?: (s: AppStatus) => void) {
  const [currentDir, setCurrentDir] = useState<string | null>(null)
  const [repoStatus, setRepoStatus] = useState<RepoStatus>({ state: 'idle' })
  const [gitClient] = useState(() => new TauriGitService())
  const [branches, setBranches] = useState<string[]>([])
  const [baseBranch, setBaseBranch] = useState<string>('')
  const [compareBranch, setCompareBranch] = useState<string>('')
  const [diffTrigger, setDiffTrigger] = useState(0) // Trigger diff refresh

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

  // Listen for working directory file changes
  useEffect(() => {
    if (!currentDir) return

    let unlisten: UnlistenFn | null = null
    const setup = async () => {
      unlisten = await listen<{ repoPath: string; changedFiles: string[] }>(
        'workdir-changed',
        (event) => {
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
          console.log('Git refs changed, refreshing branch list...', event.payload)
          void refreshRepo()
        }
      )
    }
    void setup()

    return () => {
      if (unlisten) void unlisten()
    }
  }, [currentDir, refreshRepo])

  const loadRepoFromHandle = useCallback(async (path: string) => {
    setRepoStatus({ state: 'loading', message: 'Loading repository...' })
    setAppStatus?.({ state: 'LOADING', task: 'repo', message: 'Loading repository...', progress: 'indeterminate' })

    try {
      const result = await gitClient.loadRepo(path, {})

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

      // Set branches
      if (savedBase && result.branches.includes(savedBase)) {
        setBaseBranch(savedBase)
      } else if (result.defaultBranch) {
        setBaseBranch(result.defaultBranch)
      } else if (result.branches.length > 0) {
        setBaseBranch(result.branches[0])
      }

      if (savedCompare && result.branches.includes(savedCompare)) {
        setCompareBranch(savedCompare)
      } else if (result.defaultBranch) {
        const otherBranch = result.branches.find(b => b !== result.defaultBranch)
        setCompareBranch(otherBranch || result.defaultBranch)
      } else if (result.branches.length >= 2) {
        setCompareBranch(result.branches[1])
      } else if (result.branches.length === 1) {
        setCompareBranch(result.branches[0])
      }

      setRepoStatus({ state: 'ready', mode: 'git' })
      setAppStatus?.({ state: 'IDLE' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRepoStatus({ state: 'error', error: message })
      setAppStatus?.({ state: 'ERROR', message })
    }
  }, [gitClient, setAppStatus])

  const selectNewRepo = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Git Repository',
      })

      if (selected && typeof selected === 'string') {
        await loadRepoFromHandle(selected)
      }
    } catch (error) {
      console.error('Failed to select repository:', error)
    }
  }, [loadRepoFromHandle])

  const refreshRepo = useCallback(async () => {
    if (!currentDir) return
    await loadRepoFromHandle(currentDir)
  }, [currentDir, loadRepoFromHandle])

  const resetRepo = useCallback(() => {
    // Note: dispose() clears the repo path but the service instance remains
    // valid and can be reused. This is by design for the singleton pattern.
    gitClient.dispose()
    setRepoStatus({ state: 'idle' })
    setCurrentDir(null)
    setBranches([])
    setBaseBranch('')
    setCompareBranch('')
    setAppStatus?.({ state: 'IDLE' })
  }, [gitClient, setAppStatus])

  return {
    currentDir,
    repoStatus,
    gitClient,
    branches,
    baseBranch,
    setBaseBranch,
    compareBranch,
    setCompareBranch,
    loadRepoFromHandle,
    selectNewRepo,
    refreshRepo,
    resetRepo,
    diffTrigger, // For triggering diff refresh on file changes
  }
}

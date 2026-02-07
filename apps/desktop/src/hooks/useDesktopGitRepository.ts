import { useState, useCallback } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { TauriGitService } from '../services/TauriGitService'
import type { LoadRepoResult } from '@gitcontext/core'

export type RepoStatus =
  | { state: 'idle' }
  | { state: 'loading'; message?: string }
  | { state: 'ready'; repoPath: string }
  | { state: 'error'; error: string }

export function useDesktopGitRepository() {
  const [repoStatus, setRepoStatus] = useState<RepoStatus>({ state: 'idle' })
  const [gitService] = useState(() => new TauriGitService())
  const [repoPath, setRepoPath] = useState<string>('')
  const [branches, setBranches] = useState<string[]>([])
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null)
  const [baseBranch, setBaseBranch] = useState<string>('')
  const [compareBranch, setCompareBranch] = useState<string>('')

  const selectAndLoadRepo = useCallback(async () => {
    try {
      setRepoStatus({ state: 'loading', message: 'Opening folder picker...' })

      // Open directory picker
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Git Repository',
      })

      if (!selected || typeof selected !== 'string') {
        setRepoStatus({ state: 'idle' })
        return
      }

      setRepoStatus({ state: 'loading', message: 'Loading repository...' })
      setRepoPath(selected)

      // Load repository
      const result: LoadRepoResult = await gitService.loadRepo(selected, {})

      setBranches(result.branches)
      setDefaultBranch(result.defaultBranch)

      // Set default branches if available
      if (result.defaultBranch && result.branches.length > 0) {
        setBaseBranch(result.defaultBranch)
        // Try to find a different branch for comparison
        const otherBranch = result.branches.find(b => b !== result.defaultBranch)
        if (otherBranch) {
          setCompareBranch(otherBranch)
        } else if (result.branches.length > 0) {
          setCompareBranch(result.branches[0])
        }
      } else if (result.branches.length >= 2) {
        setBaseBranch(result.branches[0])
        setCompareBranch(result.branches[1])
      } else if (result.branches.length === 1) {
        setBaseBranch(result.branches[0])
        setCompareBranch(result.branches[0])
      }

      setRepoStatus({ state: 'ready', repoPath: selected })
    } catch (error) {
      console.error('Failed to load repository:', error)
      setRepoStatus({
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [gitService])

  const resetRepo = useCallback(() => {
    gitService.dispose()
    setRepoStatus({ state: 'idle' })
    setRepoPath('')
    setBranches([])
    setDefaultBranch(null)
    setBaseBranch('')
    setCompareBranch('')
  }, [gitService])

  return {
    repoStatus,
    gitService,
    repoPath,
    branches,
    defaultBranch,
    baseBranch,
    setBaseBranch,
    compareBranch,
    setCompareBranch,
    selectAndLoadRepo,
    resetRepo,
  }
}

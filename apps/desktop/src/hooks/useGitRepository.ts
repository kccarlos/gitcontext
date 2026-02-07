import { useCallback, useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { TauriGitService } from '../services/TauriGitService'
import type { AppStatus } from '../types/appStatus'

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
      gitClient?.dispose()
    }
  }, [gitClient])

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
  }
}

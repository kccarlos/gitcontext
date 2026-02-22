import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// ── Hoisted mocks (available inside vi.mock factories) ───────────────────────

const mocks = vi.hoisted(() => {
  const mockLoadRepo = vi.fn()
  const mockDispose = vi.fn().mockResolvedValue(undefined)
  const mockUnlisten = vi.fn()
  const eventListeners = new Map<string, Array<(event: { payload: any }) => void>>()
  return { mockLoadRepo, mockDispose, mockUnlisten, eventListeners }
})

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../services/TauriGitService', () => {
  const MockTauriGitService = class {
    loadRepo = mocks.mockLoadRepo
    dispose = mocks.mockDispose
  }
  return { TauriGitService: MockTauriGitService }
})

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (eventName: string, cb: (event: { payload: any }) => void) => {
    if (!mocks.eventListeners.has(eventName)) {
      mocks.eventListeners.set(eventName, [])
    }
    mocks.eventListeners.get(eventName)!.push(cb)
    return mocks.mockUnlisten
  }),
}))

import { useGitRepository } from './useGitRepository'

// ── Helpers ──────────────────────────────────────────────────────────────────

function emitTauriEvent(eventName: string, payload: any) {
  const listeners = mocks.eventListeners.get(eventName)
  if (listeners) {
    for (const cb of listeners) {
      cb({ payload })
    }
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useGitRepository', () => {
  let localStore: Map<string, string>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mocks.eventListeners.clear()

    // Stub localStorage
    localStore = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (localStore.has(key) ? localStore.get(key)! : null),
      setItem: (key: string, value: string) => {
        localStore.set(key, String(value))
      },
      removeItem: (key: string) => {
        localStore.delete(key)
      },
      clear: () => {
        localStore.clear()
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // ── 1. Initial state ────────────────────────────────────────────────────

  it('initial state is idle with empty branches', () => {
    const { result } = renderHook(() => useGitRepository())

    expect(result.current.repoStatus).toEqual({ state: 'idle' })
    expect(result.current.branches).toEqual([])
    expect(result.current.baseBranch).toBe('')
    expect(result.current.compareBranch).toBe('')
    expect(result.current.currentDir).toBeNull()
    expect(result.current.diffTrigger).toBe(0)
  })

  // ── 2. Load success (idle→loading→ready) ────────────────────────────────

  it('loadRepoFromHandle transitions idle→loading→ready and sets branches', async () => {
    const setAppStatus = vi.fn()
    mocks.mockLoadRepo.mockResolvedValueOnce({
      branches: ['main', 'dev', 'feature'],
      defaultBranch: 'main',
    })

    const { result } = renderHook(() => useGitRepository(setAppStatus))

    let loadResult: boolean | undefined
    await act(async () => {
      loadResult = await result.current.loadRepoFromHandle('/tmp/repo')
    })

    expect(loadResult).toBe(true)
    expect(result.current.repoStatus).toEqual({ state: 'ready', mode: 'git' })
    expect(result.current.branches).toEqual(['main', 'dev', 'feature'])
    expect(result.current.baseBranch).toBe('main')
    expect(result.current.compareBranch).toBe('dev')
    expect(result.current.currentDir).toBe('/tmp/repo')

    // AppStatus transitions
    expect(setAppStatus).toHaveBeenCalledWith({
      state: 'LOADING',
      task: 'repo',
      message: 'Loading repository...',
      progress: 'indeterminate',
    })
    expect(setAppStatus).toHaveBeenCalledWith({ state: 'IDLE' })
  })

  // ── 3. Load error (idle→loading→error) ──────────────────────────────────

  it('loadRepoFromHandle with invalid path sets error state', async () => {
    const setAppStatus = vi.fn()
    mocks.mockLoadRepo.mockRejectedValueOnce(new Error('Not a git repository'))

    const { result } = renderHook(() => useGitRepository(setAppStatus))

    let loadResult: boolean | undefined
    await act(async () => {
      loadResult = await result.current.loadRepoFromHandle('/bad/path')
    })

    expect(loadResult).toBe(false)
    expect(result.current.repoStatus).toEqual({
      state: 'error',
      error: 'Not a git repository',
    })
    expect(setAppStatus).toHaveBeenCalledWith({
      state: 'ERROR',
      message: 'Not a git repository',
    })
  })

  // ── 4. Refresh repo reloads branches and preserves selection ────────────

  it('refreshRepo reloads branches and preserves current selection', async () => {
    mocks.mockLoadRepo.mockResolvedValueOnce({
      branches: ['main', 'dev'],
      defaultBranch: 'main',
    })

    const { result } = renderHook(() => useGitRepository())

    // Initial load
    await act(async () => {
      await result.current.loadRepoFromHandle('/tmp/repo')
    })
    expect(result.current.baseBranch).toBe('main')
    expect(result.current.compareBranch).toBe('dev')

    // Refresh — the branches now have an extra one
    mocks.mockLoadRepo.mockResolvedValueOnce({
      branches: ['main', 'dev', 'release'],
      defaultBranch: 'main',
    })

    await act(async () => {
      await result.current.refreshRepo({
        preferredBranches: { base: 'main', compare: 'dev' },
      })
    })

    expect(result.current.repoStatus).toEqual({ state: 'ready', mode: 'git' })
    expect(result.current.branches).toEqual(['main', 'dev', 'release'])
    expect(result.current.baseBranch).toBe('main')
    expect(result.current.compareBranch).toBe('dev')
  })

  // ── 5. Reset clears all state back to idle ──────────────────────────────

  it('resetRepo clears all state back to idle', async () => {
    const setAppStatus = vi.fn()
    mocks.mockLoadRepo.mockResolvedValueOnce({
      branches: ['main', 'dev'],
      defaultBranch: 'main',
    })

    const { result } = renderHook(() => useGitRepository(setAppStatus))

    await act(async () => {
      await result.current.loadRepoFromHandle('/tmp/repo')
    })
    expect(result.current.repoStatus).toEqual({ state: 'ready', mode: 'git' })

    setAppStatus.mockClear()
    act(() => {
      result.current.resetRepo()
    })

    expect(result.current.repoStatus).toEqual({ state: 'idle' })
    expect(result.current.currentDir).toBeNull()
    expect(result.current.branches).toEqual([])
    expect(result.current.baseBranch).toBe('')
    expect(result.current.compareBranch).toBe('')
    expect(mocks.mockDispose).toHaveBeenCalled()
    expect(setAppStatus).toHaveBeenCalledWith({ state: 'IDLE' })
  })

  // ── 6. Branch persistence via localStorage ─────────────────────────────

  it('persists branch selection to localStorage and restores on reload', async () => {
    mocks.mockLoadRepo.mockResolvedValueOnce({
      branches: ['main', 'dev', 'feature'],
      defaultBranch: 'main',
    })

    const { result } = renderHook(() => useGitRepository())

    await act(async () => {
      await result.current.loadRepoFromHandle('/tmp/repo')
    })

    // After loading, selection should be persisted (loadRepoFromHandle writes directly)
    const stored = localStore.get('branchSel:/tmp/repo')
    expect(stored).toBeDefined()
    const parsed = JSON.parse(stored!)
    expect(parsed.base).toBe('main')
    expect(parsed.compare).toBe('dev')

    // Now change the branch manually and let the useEffect persist
    await act(async () => {
      result.current.setBaseBranch('feature')
      result.current.setCompareBranch('main')
    })

    const updated = localStore.get('branchSel:/tmp/repo')
    expect(updated).toBeDefined()
    const updatedParsed = JSON.parse(updated!)
    expect(updatedParsed.base).toBe('feature')
    expect(updatedParsed.compare).toBe('main')

    // Reload repo — saved branches should be restored from localStorage
    mocks.mockLoadRepo.mockResolvedValueOnce({
      branches: ['main', 'dev', 'feature'],
      defaultBranch: 'main',
    })

    await act(async () => {
      await result.current.loadRepoFromHandle('/tmp/repo')
    })

    // Saved selection (feature/main) should be restored since they're in the branch list
    expect(result.current.baseBranch).toBe('feature')
    expect(result.current.compareBranch).toBe('main')
  })

  // ── 7. Watcher events: workdir-changed triggers diffTrigger ─────────────

  it('workdir-changed event increments diffTrigger when WORKDIR is selected', async () => {
    mocks.mockLoadRepo.mockResolvedValueOnce({
      branches: ['main', '__WORKDIR__'],
      defaultBranch: 'main',
    })

    const { result } = renderHook(() => useGitRepository())

    await act(async () => {
      await result.current.loadRepoFromHandle('/tmp/repo')
    })

    // The hook selects main as base, __WORKDIR__ as compare (only other branch)
    expect(result.current.baseBranch).toBe('main')
    expect(result.current.compareBranch).toBe('__WORKDIR__')

    const initialTrigger = result.current.diffTrigger

    // Fire a workdir-changed event
    act(() => {
      emitTauriEvent('workdir-changed', {
        repoPath: '/tmp/repo',
        changedFiles: ['src/app.ts'],
      })
    })

    // Advance past the 300ms debounce
    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(result.current.diffTrigger).toBe(initialTrigger + 1)
  })

  // ── 8. workdir-changed ignored when WORKDIR not selected ────────────────

  it('workdir-changed event does NOT increment diffTrigger when WORKDIR is not selected', async () => {
    mocks.mockLoadRepo.mockResolvedValueOnce({
      branches: ['main', 'dev', '__WORKDIR__'],
      defaultBranch: 'main',
    })

    const { result } = renderHook(() => useGitRepository())

    await act(async () => {
      await result.current.loadRepoFromHandle('/tmp/repo')
    })

    // Neither base nor compare should be __WORKDIR__ (main/dev selected)
    expect(result.current.baseBranch).toBe('main')
    expect(result.current.compareBranch).toBe('dev')

    const initialTrigger = result.current.diffTrigger

    act(() => {
      emitTauriEvent('workdir-changed', {
        repoPath: '/tmp/repo',
        changedFiles: ['src/app.ts'],
      })
    })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(result.current.diffTrigger).toBe(initialTrigger)
  })

  // ── 9. flipBranches swaps base and compare ──────────────────────────────

  it('setBaseBranch and setCompareBranch can swap (flip) branches', async () => {
    mocks.mockLoadRepo.mockResolvedValueOnce({
      branches: ['main', 'dev'],
      defaultBranch: 'main',
    })

    const { result } = renderHook(() => useGitRepository())

    await act(async () => {
      await result.current.loadRepoFromHandle('/tmp/repo')
    })

    expect(result.current.baseBranch).toBe('main')
    expect(result.current.compareBranch).toBe('dev')

    // Flip branches
    await act(async () => {
      const prevBase = result.current.baseBranch
      const prevCompare = result.current.compareBranch
      result.current.setBaseBranch(prevCompare)
      result.current.setCompareBranch(prevBase)
    })

    expect(result.current.baseBranch).toBe('dev')
    expect(result.current.compareBranch).toBe('main')
  })

  // ── 10. refreshRepo returns false when no directory is loaded ───────────

  it('refreshRepo returns false when no directory is loaded', async () => {
    const { result } = renderHook(() => useGitRepository())

    let refreshResult: boolean | undefined
    await act(async () => {
      refreshResult = await result.current.refreshRepo()
    })

    expect(refreshResult).toBe(false)
  })

  // ── 11. Single-branch repo: compare defaults to same as base ────────────

  it('single-branch repo defaults compare to same as base', async () => {
    mocks.mockLoadRepo.mockResolvedValueOnce({
      branches: ['main'],
      defaultBranch: 'main',
    })

    const { result } = renderHook(() => useGitRepository())

    await act(async () => {
      await result.current.loadRepoFromHandle('/tmp/repo')
    })

    expect(result.current.baseBranch).toBe('main')
    expect(result.current.compareBranch).toBe('main')
  })

  // ── 12. workdir-changed for wrong repo is ignored ───────────────────────

  it('workdir-changed event for different repo path is ignored', async () => {
    mocks.mockLoadRepo.mockResolvedValueOnce({
      branches: ['main', '__WORKDIR__'],
      defaultBranch: 'main',
    })

    const { result } = renderHook(() => useGitRepository())

    await act(async () => {
      await result.current.loadRepoFromHandle('/tmp/repo')
    })

    const initialTrigger = result.current.diffTrigger

    act(() => {
      emitTauriEvent('workdir-changed', {
        repoPath: '/tmp/other-repo',
        changedFiles: ['src/app.ts'],
      })
    })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(result.current.diffTrigger).toBe(initialTrigger)
  })
})

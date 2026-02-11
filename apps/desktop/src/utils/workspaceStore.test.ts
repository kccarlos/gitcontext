import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_WORKSPACE_SETTINGS,
  getActiveSession,
  getWorkspaceById,
  getWorkspaceSelectionRestore,
  loadWorkspaceStore,
  saveWorkspaceStore,
  upsertWorkspace,
  updateWorkspaceSession,
  WORKSPACE_STORE_KEY,
} from './workspaceStore'

describe('workspaceStore', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value))
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => {
        store.clear()
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads an empty store when localStorage content is invalid', () => {
    localStorage.setItem(WORKSPACE_STORE_KEY, '{invalid-json')
    const store = loadWorkspaceStore()
    expect(store.workspaces).toEqual([])
    expect(store.activeWorkspaceId).toBeNull()
  })

  it('creates and persists a workspace with a default session snapshot', () => {
    const initial = loadWorkspaceStore()
    const { store, workspaceId } = upsertWorkspace(initial, {
      name: 'Repo A',
      path: '/tmp/repo-a',
      snapshot: {
        baseBranch: 'main',
        compareBranch: 'feature',
        selectedPaths: ['src/a.ts', 'src/a.ts'],
        settings: {
          includeFileTree: false,
        },
      },
      markOpened: true,
    })

    saveWorkspaceStore(store)
    const reloaded = loadWorkspaceStore()
    const workspace = getWorkspaceById(reloaded, workspaceId)
    expect(workspace).not.toBeNull()
    expect(reloaded.activeWorkspaceId).toBe(workspaceId)
    expect(workspace?.path).toBe('/tmp/repo-a')
    expect(getActiveSession(workspace!).selectedPaths).toEqual(['src/a.ts'])
    expect(getActiveSession(workspace!).settings.includeFileTree).toBe(false)
  })

  it('updates a workspace session without losing previous settings defaults', () => {
    const base = loadWorkspaceStore()
    const created = upsertWorkspace(base, {
      name: 'Repo B',
      path: '/tmp/repo-b',
      snapshot: {
        baseBranch: 'main',
        compareBranch: 'dev',
        selectedPaths: [],
        settings: {},
      },
    })

    const updated = updateWorkspaceSession(created.store, created.workspaceId, {
      baseBranch: 'release',
      compareBranch: 'main',
      selectedPaths: ['README.md'],
      settings: {
        showChangedOnly: false,
      },
    })
    const workspace = getWorkspaceById(updated, created.workspaceId)
    const session = getActiveSession(workspace!)
    expect(session.baseBranch).toBe('release')
    expect(session.compareBranch).toBe('main')
    expect(session.selectedPaths).toEqual(['README.md'])
    expect(session.settings.showChangedOnly).toBe(false)
    expect(session.settings.activeTab).toBe(DEFAULT_WORKSPACE_SETTINGS.activeTab)
  })

  it('partitions restored and missing selected files', () => {
    const result = getWorkspaceSelectionRestore(
      ['src/a.ts', 'src/missing.ts', 'src/a.ts'],
      ['src/a.ts', 'src/b.ts'],
    )
    expect(result.matched).toEqual(['src/a.ts'])
    expect(result.missing).toEqual(['src/missing.ts'])
  })
})

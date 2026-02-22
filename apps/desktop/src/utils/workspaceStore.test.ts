import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_WORKSPACE_SETTINGS,
  findWorkspaceByPath,
  getActiveSession,
  getWorkspaceById,
  getWorkspaceSelectionRestore,
  listWorkspaceItems,
  loadWorkspaceStore,
  removeWorkspace,
  saveWorkspaceStore,
  setActiveWorkspace,
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

  it('upsertWorkspace with existing ID updates rather than creates duplicate', () => {
    const initial = loadWorkspaceStore()
    const first = upsertWorkspace(initial, {
      name: 'My Repo',
      path: '/tmp/my-repo',
      snapshot: {
        baseBranch: 'main',
        compareBranch: 'dev',
        selectedPaths: ['file1.ts'],
        settings: {},
      },
    })

    // Upsert again with same workspaceId to update
    const second = upsertWorkspace(first.store, {
      name: 'My Repo Updated',
      path: '/tmp/my-repo',
      workspaceId: first.workspaceId,
      snapshot: {
        baseBranch: 'main',
        compareBranch: 'staging',
        selectedPaths: ['file2.ts'],
        settings: {},
      },
    })

    expect(second.workspaceId).toBe(first.workspaceId)
    expect(second.store.workspaces).toHaveLength(1)
    const ws = getWorkspaceById(second.store, second.workspaceId)!
    expect(ws.name).toBe('My Repo Updated')
    expect(getActiveSession(ws).compareBranch).toBe('staging')
  })

  it('removeWorkspace with non-existent ID is a no-op', () => {
    const initial = loadWorkspaceStore()
    const { store } = upsertWorkspace(initial, {
      name: 'Repo X',
      path: '/tmp/repo-x',
      snapshot: {
        baseBranch: 'main',
        compareBranch: 'dev',
        selectedPaths: [],
        settings: {},
      },
    })

    const before = store.workspaces.length
    const after = removeWorkspace(store, 'non-existent-id-12345')
    expect(after.workspaces).toHaveLength(before)
    // activeWorkspaceId should remain unchanged
    expect(after.activeWorkspaceId).toBe(store.activeWorkspaceId)
  })

  it('getWorkspaceSelectionRestore is case-sensitive', () => {
    const result = getWorkspaceSelectionRestore(
      ['src/App.tsx', 'src/app.tsx', 'SRC/App.tsx'],
      ['src/App.tsx', 'SRC/App.tsx'],
    )
    // src/App.tsx and SRC/App.tsx match, src/app.tsx does not
    expect(result.matched).toEqual(['src/App.tsx', 'SRC/App.tsx'])
    expect(result.missing).toEqual(['src/app.tsx'])
  })

  it('enforces MAX_PERSISTED_SELECTIONS (5000) limit on save', () => {
    const paths: string[] = []
    for (let i = 0; i < 5100; i++) {
      paths.push(`src/file-${String(i).padStart(5, '0')}.ts`)
    }

    const initial = loadWorkspaceStore()
    const { store, workspaceId } = upsertWorkspace(initial, {
      name: 'Big Repo',
      path: '/tmp/big-repo',
      snapshot: {
        baseBranch: 'main',
        compareBranch: 'dev',
        selectedPaths: paths,
        settings: {},
      },
    })

    const ws = getWorkspaceById(store, workspaceId)!
    const session = getActiveSession(ws)
    expect(session.selectedPaths).toHaveLength(5000)
    // Should contain the first 5000 paths in order
    expect(session.selectedPaths[0]).toBe('src/file-00000.ts')
    expect(session.selectedPaths[4999]).toBe('src/file-04999.ts')
  })

  it('listWorkspaceItems returns sorted by lastOpenedAt descending', () => {
    let store = loadWorkspaceStore()

    // Create three workspaces with different lastOpenedAt times
    const first = upsertWorkspace(store, {
      name: 'Oldest',
      path: '/tmp/oldest',
      snapshot: { baseBranch: 'main', compareBranch: 'dev', selectedPaths: [], settings: {} },
      markOpened: true,
    })
    store = first.store

    // Small delay to ensure distinct timestamps
    const second = upsertWorkspace(store, {
      name: 'Middle',
      path: '/tmp/middle',
      snapshot: { baseBranch: 'main', compareBranch: 'dev', selectedPaths: [], settings: {} },
      markOpened: true,
    })
    store = second.store

    const third = upsertWorkspace(store, {
      name: 'Newest',
      path: '/tmp/newest',
      snapshot: { baseBranch: 'main', compareBranch: 'dev', selectedPaths: [], settings: {} },
      markOpened: true,
    })
    store = third.store

    const items = listWorkspaceItems(store)
    expect(items).toHaveLength(3)
    // All are created quickly so they may share timestamps; verify order is maintained
    // The most recently upserted (newest) should be first or equal
    const names = items.map((item) => item.name)
    expect(names).toContain('Oldest')
    expect(names).toContain('Middle')
    expect(names).toContain('Newest')
    // Newest was upserted last, so its lastOpenedAt >= others
    expect(items[0].name).toBe('Newest')
  })

  it('setActiveWorkspace/getWorkspaceById round-trips correctly', () => {
    const initial = loadWorkspaceStore()
    const { store, workspaceId } = upsertWorkspace(initial, {
      name: 'Active Repo',
      path: '/tmp/active-repo',
      snapshot: { baseBranch: 'main', compareBranch: 'dev', selectedPaths: [], settings: {} },
    })

    // Active workspace is set after upsert
    expect(store.activeWorkspaceId).toBe(workspaceId)

    // Clear active workspace
    const cleared = setActiveWorkspace(store, '')
    expect(cleared.activeWorkspaceId).toBeNull()

    // Set it back
    const restored = setActiveWorkspace(cleared, workspaceId)
    expect(restored.activeWorkspaceId).toBe(workspaceId)

    // Verify the workspace data is intact
    const ws = getWorkspaceById(restored, workspaceId)
    expect(ws).not.toBeNull()
    expect(ws!.name).toBe('Active Repo')
  })

  it('handles corrupt localStorage data gracefully (returns empty store)', () => {
    // Various forms of corrupt data
    const corruptValues = [
      'null',
      '42',
      '"just a string"',
      '[]',
      '{"workspaces": "not-an-array"}',
      '{"workspaces": [null, 42, "bad"]}',
      '{"workspaces": [{"id": ""}]}', // empty id
      '{"workspaces": [{"id": "x", "name": "", "path": "/p"}]}', // empty name
    ]

    for (const value of corruptValues) {
      localStorage.setItem(WORKSPACE_STORE_KEY, value)
      const store = loadWorkspaceStore()
      expect(store.workspaces).toEqual([])
      expect(store.activeWorkspaceId).toBeNull()
    }
  })

  it('workspace session settings merge with defaults (missing keys filled in)', () => {
    const initial = loadWorkspaceStore()
    const { store, workspaceId } = upsertWorkspace(initial, {
      name: 'Partial Settings Repo',
      path: '/tmp/partial-settings',
      snapshot: {
        baseBranch: 'main',
        compareBranch: 'dev',
        selectedPaths: [],
        settings: {
          // Only provide one setting, rest should be filled from defaults
          diffContextLines: 10,
        },
      },
    })

    const ws = getWorkspaceById(store, workspaceId)!
    const session = getActiveSession(ws)
    // Explicitly set value
    expect(session.settings.diffContextLines).toBe(10)
    // Default values filled in for missing keys
    expect(session.settings.selectedModel).toBe(DEFAULT_WORKSPACE_SETTINGS.selectedModel)
    expect(session.settings.userInstructions).toBe(DEFAULT_WORKSPACE_SETTINGS.userInstructions)
    expect(session.settings.includeFileTree).toBe(DEFAULT_WORKSPACE_SETTINGS.includeFileTree)
    expect(session.settings.includeBinaryAsPaths).toBe(DEFAULT_WORKSPACE_SETTINGS.includeBinaryAsPaths)
    expect(session.settings.showChangedOnly).toBe(DEFAULT_WORKSPACE_SETTINGS.showChangedOnly)
    expect(session.settings.activeTab).toBe(DEFAULT_WORKSPACE_SETTINGS.activeTab)
  })

  it('findWorkspaceByPath matches exact paths only (not substrings)', () => {
    const initial = loadWorkspaceStore()
    const { store } = upsertWorkspace(initial, {
      name: 'My Repo',
      path: '/home/user/my-repo',
      snapshot: { baseBranch: 'main', compareBranch: 'dev', selectedPaths: [], settings: {} },
    })

    // Exact match (should find)
    expect(findWorkspaceByPath(store, '/home/user/my-repo')).not.toBeNull()

    // Substring/partial matches (should NOT find)
    expect(findWorkspaceByPath(store, '/home/user/my-repo/sub')).toBeNull()
    expect(findWorkspaceByPath(store, '/home/user/my')).toBeNull()
    expect(findWorkspaceByPath(store, 'my-repo')).toBeNull()

    // Trailing slash normalization (should find since trailing slashes are stripped)
    expect(findWorkspaceByPath(store, '/home/user/my-repo/')).not.toBeNull()

    // Case-insensitive match (path lookup uses toLowerCase)
    expect(findWorkspaceByPath(store, '/HOME/USER/MY-REPO')).not.toBeNull()
  })

  it('upsertWorkspace by path match prevents duplicates', () => {
    const initial = loadWorkspaceStore()
    const first = upsertWorkspace(initial, {
      name: 'Repo',
      path: '/tmp/same-path',
      snapshot: { baseBranch: 'main', compareBranch: 'dev', selectedPaths: [], settings: {} },
    })

    // Upsert again with same path but no workspaceId — should match existing by path
    const second = upsertWorkspace(first.store, {
      name: 'Repo Renamed',
      path: '/tmp/same-path',
      snapshot: { baseBranch: 'main', compareBranch: 'staging', selectedPaths: ['x.ts'], settings: {} },
    })

    expect(second.workspaceId).toBe(first.workspaceId)
    expect(second.store.workspaces).toHaveLength(1)
    expect(second.store.workspaces[0].name).toBe('Repo Renamed')
  })

  it('removeWorkspace clears activeWorkspaceId when removing the active workspace', () => {
    const initial = loadWorkspaceStore()
    const { store, workspaceId } = upsertWorkspace(initial, {
      name: 'To Remove',
      path: '/tmp/to-remove',
      snapshot: { baseBranch: 'main', compareBranch: 'dev', selectedPaths: [], settings: {} },
    })

    expect(store.activeWorkspaceId).toBe(workspaceId)
    const after = removeWorkspace(store, workspaceId)
    expect(after.workspaces).toHaveLength(0)
    expect(after.activeWorkspaceId).toBeNull()
  })

  it('persisted workspace survives save/load round-trip with all session data', () => {
    const initial = loadWorkspaceStore()
    const { store, workspaceId } = upsertWorkspace(initial, {
      name: 'Roundtrip Repo',
      path: '/tmp/roundtrip',
      snapshot: {
        baseBranch: 'release/v2',
        compareBranch: '__WORKDIR__',
        selectedPaths: ['a.ts', 'b.ts', 'c.ts'],
        settings: {
          diffContextLines: 5,
          showChangedOnly: false,
          includeFileTree: false,
          activeTab: 'settings',
        },
      },
      markOpened: true,
    })

    saveWorkspaceStore(store)
    const reloaded = loadWorkspaceStore()
    expect(reloaded.activeWorkspaceId).toBe(workspaceId)
    const ws = getWorkspaceById(reloaded, workspaceId)!
    const session = getActiveSession(ws)
    expect(session.baseBranch).toBe('release/v2')
    expect(session.compareBranch).toBe('__WORKDIR__')
    expect(session.selectedPaths).toEqual(['a.ts', 'b.ts', 'c.ts'])
    expect(session.settings.diffContextLines).toBe(5)
    expect(session.settings.showChangedOnly).toBe(false)
    expect(session.settings.includeFileTree).toBe(false)
    expect(session.settings.activeTab).toBe('settings')
  })
})

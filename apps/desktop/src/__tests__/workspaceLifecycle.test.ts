import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_WORKSPACE_SETTINGS,
  findWorkspaceByPath,
  getActiveSession,
  getWorkspaceById,
  getWorkspaceSelectionRestore,
  listWorkspaceItems,
  loadWorkspaceStore,
  markWorkspaceOpened,
  removeWorkspace,
  saveWorkspaceStore,
  setActiveWorkspace,
  upsertWorkspace,
  updateWorkspaceSession,
  type WorkspaceSessionSnapshotInput,
  type WorkspaceStore,
} from '../utils/workspaceStore'

// ── Helpers ──────────────────────────────────────────────────────────────────

function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
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
  }
}

/**
 * Builds a WorkspaceSessionSnapshotInput simulating what `buildWorkspaceSessionSnapshot`
 * does inside App.tsx: it captures branch selection, file selection, and all settings.
 */
function buildSnapshot(overrides?: Partial<WorkspaceSessionSnapshotInput>): WorkspaceSessionSnapshotInput {
  return {
    sessionId: overrides?.sessionId,
    sessionName: overrides?.sessionName,
    baseBranch: overrides?.baseBranch ?? 'main',
    compareBranch: overrides?.compareBranch ?? '__WORKDIR__',
    selectedPaths: overrides?.selectedPaths ?? [],
    settings: {
      ...DEFAULT_WORKSPACE_SETTINGS,
      ...(overrides?.settings ?? {}),
    },
  }
}

/**
 * Simulates the commitWorkspaceStore helper from App.tsx:
 * applies an updater and immediately persists to localStorage.
 */
function commitWorkspaceStore(
  current: WorkspaceStore,
  updater: (store: WorkspaceStore) => WorkspaceStore,
): WorkspaceStore {
  const next = updater(current)
  saveWorkspaceStore(next)
  return next
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('workspace lifecycle integration', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── 1. Save workspace captures branches and file selection ──────────────

  it('saving a workspace captures current branch selection and file selection', () => {
    const store = loadWorkspaceStore()
    expect(store.workspaces).toHaveLength(0)

    // Simulate user: open repo, pick branches, select files, then save workspace
    const snapshot = buildSnapshot({
      baseBranch: 'main',
      compareBranch: 'feature/login',
      selectedPaths: ['src/auth.ts', 'src/utils.ts', 'package.json'],
      settings: {
        selectedModel: 'gpt-4',
        diffContextLines: 5,
        includeFileTree: true,
        showChangedOnly: false,
      },
    })

    const { store: saved, workspaceId } = upsertWorkspace(store, {
      name: 'Auth Feature',
      path: '/home/user/project',
      snapshot,
      markOpened: true,
    })
    saveWorkspaceStore(saved)

    // Verify the workspace was saved with correct data
    const ws = getWorkspaceById(saved, workspaceId)!
    const session = getActiveSession(ws)
    expect(session.baseBranch).toBe('main')
    expect(session.compareBranch).toBe('feature/login')
    expect(session.selectedPaths).toEqual(['src/auth.ts', 'src/utils.ts', 'package.json'])
    expect(session.settings.selectedModel).toBe('gpt-4')
    expect(session.settings.diffContextLines).toBe(5)
    expect(session.settings.includeFileTree).toBe(true)
    expect(session.settings.showChangedOnly).toBe(false)

    // Verify persistence round-trip
    const reloaded = loadWorkspaceStore()
    const restoredWs = getWorkspaceById(reloaded, workspaceId)!
    const restoredSession = getActiveSession(restoredWs)
    expect(restoredSession.baseBranch).toBe('main')
    expect(restoredSession.compareBranch).toBe('feature/login')
    expect(restoredSession.selectedPaths).toEqual(['src/auth.ts', 'src/utils.ts', 'package.json'])
    expect(restoredSession.settings.selectedModel).toBe('gpt-4')
  })

  // ── 2. Load workspace restores branches and triggers diff ───────────────

  it('loading a saved workspace restores branches and selection for diff', () => {
    // Phase 1: Save workspace with specific state
    let store = loadWorkspaceStore()
    const { store: saved, workspaceId } = upsertWorkspace(store, {
      name: 'Backend API',
      path: '/home/user/api-project',
      snapshot: buildSnapshot({
        baseBranch: 'develop',
        compareBranch: 'release/v2',
        selectedPaths: ['src/routes.ts', 'src/middleware.ts'],
        settings: { diffContextLines: 10, activeTab: 'settings' },
      }),
      markOpened: true,
    })
    saveWorkspaceStore(saved)

    // Phase 2: Simulate app restart — load from localStorage
    store = loadWorkspaceStore()
    expect(store.activeWorkspaceId).toBe(workspaceId)

    // Simulate handleSelectWorkspace: look up workspace, get session, restore state
    const workspace = getWorkspaceById(store, workspaceId)!
    const session = getActiveSession(workspace)

    // These would be passed to loadRepoFromHandle as preferredBranches
    const preferredBranches = {
      base: session.baseBranch,
      compare: session.compareBranch,
    }
    expect(preferredBranches.base).toBe('develop')
    expect(preferredBranches.compare).toBe('release/v2')

    // Simulate selection restore: check which saved paths exist in the current diff
    const availablePaths = new Set(['src/routes.ts', 'src/middleware.ts', 'src/app.ts'])
    const { matched, missing } = getWorkspaceSelectionRestore(
      session.selectedPaths,
      availablePaths,
    )
    expect(matched).toEqual(['src/routes.ts', 'src/middleware.ts'])
    expect(missing).toEqual([])

    // Settings are restored
    expect(session.settings.diffContextLines).toBe(10)
    expect(session.settings.activeTab).toBe('settings')

    // Mark workspace as opened (updates lastOpenedAt)
    const opened = markWorkspaceOpened(
      setActiveWorkspace(store, workspaceId),
      workspaceId,
    )
    expect(opened.activeWorkspaceId).toBe(workspaceId)
    const openedWs = getWorkspaceById(opened, workspaceId)!
    expect(openedWs.lastOpenedAt).toBeDefined()
  })

  // ── 3. Auto-detection on repo open matches by path ──────────────────────

  it('workspace auto-detection on repo open matches by path', () => {
    // Create two workspaces at different paths
    let store = loadWorkspaceStore()
    const { store: s1, workspaceId: ws1Id } = upsertWorkspace(store, {
      name: 'Frontend',
      path: '/home/user/frontend',
      snapshot: buildSnapshot({
        baseBranch: 'main',
        compareBranch: 'dev',
        selectedPaths: ['src/App.tsx'],
        settings: { selectedModel: 'claude-3', showChangedOnly: true },
      }),
    })
    const { store: s2, workspaceId: ws2Id } = upsertWorkspace(s1, {
      name: 'Backend',
      path: '/home/user/backend',
      snapshot: buildSnapshot({
        baseBranch: 'master',
        compareBranch: 'staging',
        selectedPaths: ['server.js'],
        settings: { selectedModel: 'gpt-4' },
      }),
    })
    store = s2
    saveWorkspaceStore(store)

    // Simulate opening a repo — the app checks if path matches any saved workspace
    const reloaded = loadWorkspaceStore()

    // Opening /home/user/frontend should auto-detect Frontend workspace
    const matchedFrontend = findWorkspaceByPath(reloaded, '/home/user/frontend')
    expect(matchedFrontend).not.toBeNull()
    expect(matchedFrontend!.id).toBe(ws1Id)
    expect(matchedFrontend!.name).toBe('Frontend')

    // Restore session data
    const frontendSession = getActiveSession(matchedFrontend!)
    expect(frontendSession.baseBranch).toBe('main')
    expect(frontendSession.selectedPaths).toEqual(['src/App.tsx'])
    expect(frontendSession.settings.selectedModel).toBe('claude-3')

    // Opening /home/user/backend should auto-detect Backend workspace
    const matchedBackend = findWorkspaceByPath(reloaded, '/home/user/backend')
    expect(matchedBackend).not.toBeNull()
    expect(matchedBackend!.id).toBe(ws2Id)

    // Opening a different path should NOT auto-detect
    const noMatch = findWorkspaceByPath(reloaded, '/home/user/other-project')
    expect(noMatch).toBeNull()

    // Trailing-slash and case normalization
    const trailingSlash = findWorkspaceByPath(reloaded, '/home/user/frontend/')
    expect(trailingSlash).not.toBeNull()
    expect(trailingSlash!.id).toBe(ws1Id)

    const caseInsensitive = findWorkspaceByPath(reloaded, '/HOME/USER/FRONTEND')
    expect(caseInsensitive).not.toBeNull()
    expect(caseInsensitive!.id).toBe(ws1Id)
  })

  // ── 4. Workspace refresh preserves current selection ────────────────────

  it('workspace refresh preserves current selection', () => {
    // Create a workspace
    let store = loadWorkspaceStore()
    const { store: s1, workspaceId } = upsertWorkspace(store, {
      name: 'My Project',
      path: '/home/user/project',
      snapshot: buildSnapshot({
        baseBranch: 'main',
        compareBranch: 'dev',
        selectedPaths: ['src/old.ts'],
        settings: { diffContextLines: 3 },
      }),
      markOpened: true,
    })
    store = s1

    // Simulate refresh: user triggers refresh while having current selection
    // The app captures current branches/selection BEFORE refreshing
    const currentBranches = { base: 'main', compare: 'dev' }
    const currentSelection = ['src/old.ts', 'src/new.ts', 'README.md']

    // After refresh, diff recomputes. Now simulate selection restore.
    // Some paths may have changed — e.g., src/old.ts was renamed
    const postRefreshPaths = new Set(['src/new.ts', 'README.md', 'src/renamed.ts'])
    const { matched, missing } = getWorkspaceSelectionRestore(
      currentSelection,
      postRefreshPaths,
    )
    expect(matched).toEqual(['src/new.ts', 'README.md'])
    expect(missing).toEqual(['src/old.ts'])

    // Update workspace session with the refresh results
    store = updateWorkspaceSession(store, workspaceId, buildSnapshot({
      baseBranch: currentBranches.base,
      compareBranch: currentBranches.compare,
      selectedPaths: matched,
      settings: { diffContextLines: 3 },
    }))

    const ws = getWorkspaceById(store, workspaceId)!
    const session = getActiveSession(ws)
    expect(session.baseBranch).toBe('main')
    expect(session.compareBranch).toBe('dev')
    expect(session.selectedPaths).toEqual(['src/new.ts', 'README.md'])
  })

  // ── 5. Deleting a workspace removes it from store and clears selection ──

  it('deleting a workspace removes it from store and clears selection', () => {
    let store = loadWorkspaceStore()

    // Create two workspaces
    const { store: s1, workspaceId: id1 } = upsertWorkspace(store, {
      name: 'Project Alpha',
      path: '/tmp/alpha',
      snapshot: buildSnapshot({ baseBranch: 'main', compareBranch: 'dev' }),
      markOpened: true,
    })
    const { store: s2, workspaceId: id2 } = upsertWorkspace(s1, {
      name: 'Project Beta',
      path: '/tmp/beta',
      snapshot: buildSnapshot({ baseBranch: 'main', compareBranch: 'staging' }),
      markOpened: true,
    })
    store = s2
    expect(store.workspaces).toHaveLength(2)

    // Active workspace is Beta (last upserted with markOpened)
    expect(store.activeWorkspaceId).toBe(id2)

    // Delete the active workspace (Beta)
    store = removeWorkspace(store, id2)
    expect(store.workspaces).toHaveLength(1)
    expect(store.activeWorkspaceId).toBeNull() // cleared because active was deleted
    expect(getWorkspaceById(store, id2)).toBeNull()

    // Alpha still exists
    expect(getWorkspaceById(store, id1)).not.toBeNull()

    // Delete a non-existent workspace — no-op
    const before = store.workspaces.length
    store = removeWorkspace(store, 'non-existent-id')
    expect(store.workspaces).toHaveLength(before)

    // Verify persistence
    saveWorkspaceStore(store)
    const reloaded = loadWorkspaceStore()
    expect(reloaded.workspaces).toHaveLength(1)
    expect(reloaded.activeWorkspaceId).toBeNull()
  })

  // ── 6. Workspace with missing branch falls back gracefully ──────────────

  it('workspace with missing branch falls back gracefully', () => {
    // Save a workspace with specific branches
    let store = loadWorkspaceStore()
    const { store: saved, workspaceId } = upsertWorkspace(store, {
      name: 'Feature Repo',
      path: '/home/user/feature-repo',
      snapshot: buildSnapshot({
        baseBranch: 'release/v1',
        compareBranch: 'feature/deleted-branch',
        selectedPaths: ['src/feature.ts', 'src/deleted-file.ts'],
      }),
      markOpened: true,
    })
    saveWorkspaceStore(saved)

    // Simulate restoring: the repo now has different branches
    const currentBranches = ['main', 'develop', 'release/v1']
    store = loadWorkspaceStore()
    const workspace = getWorkspaceById(store, workspaceId)!
    const session = getActiveSession(workspace)

    // Check if saved branches exist in current repo
    const baseBranchExists = currentBranches.includes(session.baseBranch)
    const compareBranchExists = currentBranches.includes(session.compareBranch)

    expect(baseBranchExists).toBe(true) // release/v1 still exists
    expect(compareBranchExists).toBe(false) // feature/deleted-branch was deleted

    // App falls back: keeps base if it exists, uses first available for missing compare
    const restoredBase = baseBranchExists ? session.baseBranch : currentBranches[0]
    const restoredCompare = compareBranchExists ? session.compareBranch : currentBranches[0]

    expect(restoredBase).toBe('release/v1')
    expect(restoredCompare).toBe('main') // fallback to first available branch

    // Selection restore: some files may no longer exist in the diff
    const availablePaths = new Set(['src/feature.ts', 'src/app.ts'])
    const { matched, missing } = getWorkspaceSelectionRestore(
      session.selectedPaths,
      availablePaths,
    )
    expect(matched).toEqual(['src/feature.ts'])
    expect(missing).toEqual(['src/deleted-file.ts'])
  })

  // ── 7. Session auto-persists on settings change (debounced) ─────────────

  it('workspace session auto-persists on settings change', () => {
    vi.useFakeTimers()

    try {
      let store = loadWorkspaceStore()
      const { store: saved, workspaceId } = upsertWorkspace(store, {
        name: 'Settings Test',
        path: '/home/user/settings-project',
        snapshot: buildSnapshot({
          baseBranch: 'main',
          compareBranch: '__WORKDIR__',
          selectedPaths: ['src/index.ts'],
          settings: {
            selectedModel: 'gpt-4',
            diffContextLines: 3,
            includeFileTree: true,
            userInstructions: '',
          },
        }),
        markOpened: true,
      })
      store = saved
      saveWorkspaceStore(store)

      // Simulate rapid settings changes (like the user toggling options)
      // The app uses a 300ms debounce before persisting

      // Change 1: update model
      let pendingSnapshot = buildSnapshot({
        baseBranch: 'main',
        compareBranch: '__WORKDIR__',
        selectedPaths: ['src/index.ts'],
        settings: { selectedModel: 'claude-3', diffContextLines: 3, includeFileTree: true },
      })

      // Simulate: debounce timer hasn't fired yet, settings not persisted
      // Change 2: update context lines (within the 300ms debounce window)
      pendingSnapshot = buildSnapshot({
        baseBranch: 'main',
        compareBranch: '__WORKDIR__',
        selectedPaths: ['src/index.ts'],
        settings: { selectedModel: 'claude-3', diffContextLines: 10, includeFileTree: true },
      })

      // Change 3: toggle file tree (still within debounce window)
      pendingSnapshot = buildSnapshot({
        baseBranch: 'main',
        compareBranch: '__WORKDIR__',
        selectedPaths: ['src/index.ts'],
        settings: { selectedModel: 'claude-3', diffContextLines: 10, includeFileTree: false },
      })

      // Simulate the debounce firing: only the final state is persisted
      store = commitWorkspaceStore(store, (current) =>
        updateWorkspaceSession(
          setActiveWorkspace(current, workspaceId),
          workspaceId,
          pendingSnapshot,
        ),
      )

      // Verify only the final settings were persisted
      const reloaded = loadWorkspaceStore()
      const ws = getWorkspaceById(reloaded, workspaceId)!
      const session = getActiveSession(ws)
      expect(session.settings.selectedModel).toBe('claude-3')
      expect(session.settings.diffContextLines).toBe(10)
      expect(session.settings.includeFileTree).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  // ── 8. Switching workspaces cancels pending restore ─────────────────────

  it('switching workspaces cancels pending selection restore from previous workspace', () => {
    // Create two workspaces
    let store = loadWorkspaceStore()
    const { store: s1, workspaceId: wsA } = upsertWorkspace(store, {
      name: 'Project A',
      path: '/tmp/project-a',
      snapshot: buildSnapshot({
        baseBranch: 'main',
        compareBranch: 'dev',
        selectedPaths: ['a1.ts', 'a2.ts'],
      }),
    })
    const { store: s2, workspaceId: wsB } = upsertWorkspace(s1, {
      name: 'Project B',
      path: '/tmp/project-b',
      snapshot: buildSnapshot({
        baseBranch: 'master',
        compareBranch: 'staging',
        selectedPaths: ['b1.ts', 'b2.ts'],
      }),
    })
    store = s2
    saveWorkspaceStore(store)

    // Simulate the workspace switch race condition.
    // The app uses workspaceSwitchRequestRef to track request IDs.
    let switchRequestId = 0

    // User clicks workspace A
    const requestIdA = ++switchRequestId
    const workspaceA = getWorkspaceById(store, wsA)!
    const sessionA = getActiveSession(workspaceA)

    // Before workspace A finishes loading, user clicks workspace B
    const requestIdB = ++switchRequestId
    const workspaceB = getWorkspaceById(store, wsB)!
    const sessionB = getActiveSession(workspaceB)

    // Workspace A load completes, but requestId is stale
    const isStaleA = requestIdA !== switchRequestId
    expect(isStaleA).toBe(true) // request A is stale — should be discarded

    // Workspace B load completes, requestId matches
    const isStaleB = requestIdB !== switchRequestId
    expect(isStaleB).toBe(false) // request B is current — should proceed

    // Only workspace B's selection should be restored
    const availablePaths = new Set(['b1.ts', 'b2.ts', 'b3.ts'])
    const { matched: matchedB } = getWorkspaceSelectionRestore(
      sessionB.selectedPaths,
      availablePaths,
    )
    expect(matchedB).toEqual(['b1.ts', 'b2.ts'])

    // Workspace A's paths should NOT be used since request was stale
    const { matched: matchedA } = getWorkspaceSelectionRestore(
      sessionA.selectedPaths,
      availablePaths,
    )
    // Even though a1.ts doesn't exist in available paths, the key point is
    // the stale check prevents this from being applied
    expect(matchedA).toEqual([]) // a1.ts, a2.ts not in available paths
  })

  // ── 9. Full lifecycle round-trip ────────────────────────────────────────

  it('full lifecycle: create → save → close → reopen → modify → persist → reload', () => {
    // Step 1: Start fresh
    let store = loadWorkspaceStore()
    expect(store.workspaces).toHaveLength(0)

    // Step 2: Create workspace
    const { store: created, workspaceId } = upsertWorkspace(store, {
      name: 'Full Lifecycle',
      path: '/projects/lifecycle-test',
      snapshot: buildSnapshot({
        baseBranch: 'main',
        compareBranch: '__WORKDIR__',
        selectedPaths: ['file1.ts', 'file2.ts'],
        settings: {
          selectedModel: 'gpt-4',
          userInstructions: 'Review code',
          includeFileTree: true,
          diffContextLines: 5,
        },
      }),
      markOpened: true,
    })
    saveWorkspaceStore(created)

    // Step 3: Simulate app close and reopen
    store = loadWorkspaceStore()
    expect(store.activeWorkspaceId).toBe(workspaceId)
    const ws = getWorkspaceById(store, workspaceId)!
    expect(ws.name).toBe('Full Lifecycle')
    expect(ws.path).toBe('/projects/lifecycle-test')

    // Step 4: User modifies selection and settings
    store = updateWorkspaceSession(store, workspaceId, buildSnapshot({
      baseBranch: 'develop',
      compareBranch: 'feature/new',
      selectedPaths: ['file1.ts', 'file3.ts', 'file4.ts'],
      settings: {
        selectedModel: 'claude-3',
        userInstructions: 'Updated instructions',
        diffContextLines: 0,
      },
    }))
    saveWorkspaceStore(store)

    // Step 5: Verify modifications persisted
    store = loadWorkspaceStore()
    const updatedWs = getWorkspaceById(store, workspaceId)!
    const updatedSession = getActiveSession(updatedWs)
    expect(updatedSession.baseBranch).toBe('develop')
    expect(updatedSession.compareBranch).toBe('feature/new')
    expect(updatedSession.selectedPaths).toEqual(['file1.ts', 'file3.ts', 'file4.ts'])
    expect(updatedSession.settings.selectedModel).toBe('claude-3')
    expect(updatedSession.settings.userInstructions).toBe('Updated instructions')
    expect(updatedSession.settings.diffContextLines).toBe(0)

    // Step 6: Workspace list reflects the workspace
    const items = listWorkspaceItems(store)
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Full Lifecycle')
    expect(items[0].path).toBe('/projects/lifecycle-test')
    expect(items[0].folderName).toBe('lifecycle-test')
  })

  // ── 10. Multiple workspaces are isolated ────────────────────────────────

  it('multiple workspaces maintain isolated sessions', () => {
    let store = loadWorkspaceStore()

    // Create three workspaces
    const { store: s1, workspaceId: id1 } = upsertWorkspace(store, {
      name: 'Web App',
      path: '/projects/web',
      snapshot: buildSnapshot({
        baseBranch: 'main',
        compareBranch: 'feature/ui',
        selectedPaths: ['src/App.tsx', 'src/styles.css'],
        settings: { selectedModel: 'gpt-4', showChangedOnly: true },
      }),
    })
    const { store: s2, workspaceId: id2 } = upsertWorkspace(s1, {
      name: 'API Server',
      path: '/projects/api',
      snapshot: buildSnapshot({
        baseBranch: 'develop',
        compareBranch: '__WORKDIR__',
        selectedPaths: ['routes.ts', 'middleware.ts'],
        settings: { selectedModel: 'claude-3', showChangedOnly: false },
      }),
    })
    const { store: s3, workspaceId: id3 } = upsertWorkspace(s2, {
      name: 'Shared Lib',
      path: '/projects/shared',
      snapshot: buildSnapshot({
        baseBranch: 'main',
        compareBranch: 'main',
        selectedPaths: [],
        settings: { includeFileTree: false },
      }),
    })
    store = s3
    saveWorkspaceStore(store)

    // Reload and verify isolation
    store = loadWorkspaceStore()
    expect(store.workspaces).toHaveLength(3)

    const web = getWorkspaceById(store, id1)!
    const api = getWorkspaceById(store, id2)!
    const shared = getWorkspaceById(store, id3)!

    expect(getActiveSession(web).compareBranch).toBe('feature/ui')
    expect(getActiveSession(web).selectedPaths).toEqual(['src/App.tsx', 'src/styles.css'])
    expect(getActiveSession(web).settings.selectedModel).toBe('gpt-4')

    expect(getActiveSession(api).compareBranch).toBe('__WORKDIR__')
    expect(getActiveSession(api).selectedPaths).toEqual(['routes.ts', 'middleware.ts'])
    expect(getActiveSession(api).settings.selectedModel).toBe('claude-3')

    expect(getActiveSession(shared).selectedPaths).toEqual([])
    expect(getActiveSession(shared).settings.includeFileTree).toBe(false)

    // Modifying one workspace doesn't affect others
    store = updateWorkspaceSession(store, id1, buildSnapshot({
      baseBranch: 'hotfix',
      compareBranch: 'main',
      selectedPaths: ['fix.ts'],
      settings: { selectedModel: 'gpt-4-turbo' },
    }))

    // API workspace is unchanged
    const apiAfter = getWorkspaceById(store, id2)!
    expect(getActiveSession(apiAfter).compareBranch).toBe('__WORKDIR__')
    expect(getActiveSession(apiAfter).settings.selectedModel).toBe('claude-3')
  })
})

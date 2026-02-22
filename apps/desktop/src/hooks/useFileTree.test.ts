import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFileTree } from './useFileTree'
import type { TauriGitService } from '../services/TauriGitService'
import type { DiffResult } from '@gitcontext/core'

// ─── helpers ────────────────────────────────────────────────────────

/** Minimal mock of TauriGitService with configurable responses */
function createMockGitClient(overrides: {
  diffFiles?: DiffResult['files']
  baseFiles?: string[]
  compareFiles?: string[]
} = {}): TauriGitService {
  const diffFiles = overrides.diffFiles ?? []
  const baseFiles = overrides.baseFiles ?? []
  const compareFiles = overrides.compareFiles ?? []

  return {
    getDiff: vi.fn().mockResolvedValue({ files: diffFiles }),
    listFiles: vi.fn().mockImplementation((ref: string) => {
      if (ref === 'main') return Promise.resolve({ files: baseFiles })
      if (ref === 'feature') return Promise.resolve({ files: compareFiles })
      return Promise.resolve({ files: [] })
    }),
  } as unknown as TauriGitService
}

/** Collect all file nodes from a tree (recursive walk) */
function collectFiles(node: { type: string; path: string; children?: any[]; status?: string; isLikelyBinary?: boolean }): any[] {
  if (node.type === 'file') return [node]
  return (node.children ?? []).flatMap(collectFiles)
}

/** Collect all dir nodes from a tree (recursive walk) */
function collectDirs(node: { type: string; path: string; children?: any[] }): any[] {
  const results: any[] = []
  if (node.type === 'dir' && node.path) results.push(node)
  for (const child of node.children ?? []) {
    results.push(...collectDirs(child))
  }
  return results
}

// ─── existing selection-helper tests ────────────────────────────────

describe('useFileTree selection helpers', () => {
  it('addSelectedPaths keeps existing and adds new unique paths', () => {
    const { result } = renderHook(() => useFileTree())

    act(() => {
      result.current.toggleSelect('src/app.ts')
      result.current.addSelectedPaths(['src/test/a.test.ts', 'src/app.ts'])
    })

    expect(Array.from(result.current.selectedPaths).sort()).toEqual([
      'src/app.ts',
      'src/test/a.test.ts',
    ])
  })

  it('removeSelectedPathsByPredicate removes only matching test paths (case-insensitive)', () => {
    const { result } = renderHook(() => useFileTree())

    act(() => {
      result.current.addSelectedPaths([
        'src/app.ts',
        'src/test/foo.ts',
        'unit/MyTest.spec.ts',
        'docs/guide.md',
      ])
      result.current.removeSelectedPathsByPredicate((p) => p.toLowerCase().includes('test'))
    })

    expect(Array.from(result.current.selectedPaths).sort()).toEqual([
      'docs/guide.md',
      'src/app.ts',
    ])
  })

  it('removeSelectedPathsByPredicate is a no-op when nothing matches', () => {
    const { result } = renderHook(() => useFileTree())

    act(() => {
      result.current.addSelectedPaths(['src/app.ts', 'docs/guide.md'])
      result.current.removeSelectedPathsByPredicate((p) => p.toLowerCase().includes('test'))
    })

    expect(Array.from(result.current.selectedPaths).sort()).toEqual([
      'docs/guide.md',
      'src/app.ts',
    ])
  })
})

// ─── comprehensive tests ────────────────────────────────────────────

describe('useFileTree computeDiffAndTree', () => {
  it('builds correct hierarchical tree from flat file list', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'src/components/Button.tsx', type: 'modify' },
        { path: 'src/utils/helpers.ts', type: 'add' },
      ],
      baseFiles: ['src/components/Button.tsx', 'src/index.ts'],
      compareFiles: ['src/components/Button.tsx', 'src/utils/helpers.ts', 'src/index.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    const tree = result.current.fileTree!
    expect(tree).not.toBeNull()
    expect(tree.type).toBe('dir')
    expect(tree.path).toBe('')

    // Root should have 'src' directory child
    expect(tree.children).toHaveLength(1)
    const srcDir = tree.children![0]
    expect(srcDir.type).toBe('dir')
    expect(srcDir.name).toBe('src')

    // src should contain dirs (components, utils) sorted before files (index.ts)
    const srcChildren = srcDir.children!
    const srcChildNames = srcChildren.map((c) => c.name)
    expect(srcChildNames).toEqual(['components', 'utils', 'index.ts'])

    // components is a dir with one file child
    expect(srcChildren[0].type).toBe('dir')
    expect(srcChildren[0].children).toHaveLength(1)
    expect(srcChildren[0].children![0].type).toBe('file')
    expect(srcChildren[0].children![0].name).toBe('Button.tsx')

    // Files are leaf nodes with no children
    const files = collectFiles(tree)
    for (const f of files) {
      expect(f.children).toBeUndefined()
    }
  })

  it('sets status markers (add/modify/remove/unchanged) correctly on file nodes', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'added.ts', type: 'add' },
        { path: 'modified.ts', type: 'modify' },
        { path: 'removed.ts', type: 'remove' },
      ],
      baseFiles: ['modified.ts', 'removed.ts', 'unchanged.ts'],
      compareFiles: ['added.ts', 'modified.ts', 'unchanged.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    const statusMap = result.current.statusByPath
    expect(statusMap.get('added.ts')).toBe('add')
    expect(statusMap.get('modified.ts')).toBe('modify')
    expect(statusMap.get('removed.ts')).toBe('remove')
    expect(statusMap.get('unchanged.ts')).toBe('unchanged')

    // Also verify on tree nodes directly
    const files = collectFiles(result.current.fileTree!)
    const byPath = new Map(files.map((f) => [f.path, f]))
    expect(byPath.get('added.ts')!.status).toBe('add')
    expect(byPath.get('modified.ts')!.status).toBe('modify')
    expect(byPath.get('removed.ts')!.status).toBe('remove')
    expect(byPath.get('unchanged.ts')!.status).toBe('unchanged')
  })

  it('binary files detected by extension get isLikelyBinary flag', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'assets/logo.png', type: 'add' },
        { path: 'fonts/icon.woff2', type: 'add' },
        { path: 'src/app.ts', type: 'modify' },
      ],
      baseFiles: ['src/app.ts'],
      compareFiles: ['assets/logo.png', 'fonts/icon.woff2', 'src/app.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    const files = collectFiles(result.current.fileTree!)
    const byPath = new Map(files.map((f) => [f.path, f]))
    expect(byPath.get('assets/logo.png')!.isLikelyBinary).toBe(true)
    expect(byPath.get('fonts/icon.woff2')!.isLikelyBinary).toBe(true)
    expect(byPath.get('src/app.ts')!.isLikelyBinary).toBe(false)
  })

  it('diffSequence increments on each computation', async () => {
    const client = createMockGitClient({
      diffFiles: [{ path: 'a.ts', type: 'add' }],
      baseFiles: [],
      compareFiles: ['a.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    const initialSeq = result.current.diffSequence

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })
    const afterFirst = result.current.diffSequence
    expect(afterFirst).toBeGreaterThan(initialSeq)

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })
    const afterSecond = result.current.diffSequence
    expect(afterSecond).toBeGreaterThan(afterFirst)
  })

  it('resets state when gitClient is null', async () => {
    const client = createMockGitClient({
      diffFiles: [{ path: 'a.ts', type: 'add' }],
      baseFiles: [],
      compareFiles: ['a.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    // First load some data
    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })
    expect(result.current.fileTree).not.toBeNull()

    // Now call with null client
    await act(async () => {
      await result.current.computeDiffAndTree(null as any, 'main', 'feature')
    })
    expect(result.current.fileTree).toBeNull()
    expect(result.current.selectedPaths.size).toBe(0)
    expect(result.current.expandedPaths.size).toBe(0)
  })
})

describe('useFileTree large repo mode', () => {
  it('auto-enables showChangedOnly when file count exceeds threshold', async () => {
    // LARGE_REPO_FILE_THRESHOLD is 50000 — build a union that just exceeds it.
    // To keep the test fast, return many files from listFiles but avoid
    // building a deeply nested tree. Flat paths (no directories) are cheapest.
    const COUNT = 50_001
    const baseFiles: string[] = []
    const compareFiles: string[] = []
    for (let i = 0; i < COUNT; i++) {
      const name = `f${i}.ts`
      baseFiles.push(name)
      compareFiles.push(name)
    }

    const client = {
      getDiff: vi.fn().mockResolvedValue({ files: [{ path: 'f0.ts', type: 'modify' }] }),
      listFiles: vi.fn().mockImplementation((ref: string) => {
        if (ref === 'main') return Promise.resolve({ files: baseFiles })
        return Promise.resolve({ files: compareFiles })
      }),
    } as unknown as TauriGitService

    const { result } = renderHook(() => useFileTree())

    // First disable showChangedOnly
    act(() => {
      result.current.setShowChangedOnly(false)
    })
    expect(result.current.showChangedOnly).toBe(false)

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    // Should be re-enabled because file count > LARGE_REPO_FILE_THRESHOLD
    expect(result.current.showChangedOnly).toBe(true)
    expect(result.current.totalFileCount).toBe(COUNT)
  }, 30_000)
})

describe('useFileTree race condition prevention', () => {
  it('ignores stale diff results when a newer request supersedes', async () => {
    // Strategy: first request's getDiff returns a deferred promise that we
    // control. The second request resolves instantly. After the second request
    // sets the tree, we resolve the first request and verify its data is
    // discarded (the tree still reflects the second request).

    let resolveStale: ((v: DiffResult) => void) | undefined
    let getDiffCallCount = 0

    const client = {
      getDiff: vi.fn().mockImplementation(() => {
        getDiffCallCount++
        if (getDiffCallCount === 1) {
          // First (stale) request — deferred
          return new Promise<DiffResult>((resolve) => {
            resolveStale = resolve
          })
        }
        // Second (fresh) request — resolves immediately
        return Promise.resolve({ files: [{ path: 'fresh.ts', type: 'add' }] })
      }),
      listFiles: vi.fn().mockImplementation((_ref: string) => {
        // For the second (fresh) request these resolve instantly.
        // For the first (stale) request, getDiff hasn't resolved yet so
        // listFiles will only be reached if getDiff resolves, and by then
        // the requestId check will cause an early return before listFiles data
        // is used. We still return something sensible so the promise chain
        // doesn't throw.
        if (getDiffCallCount <= 1) {
          return Promise.resolve({ files: ['stale.ts'] })
        }
        return Promise.resolve({ files: ['fresh.ts'] })
      }),
    } as unknown as TauriGitService

    const { result } = renderHook(() => useFileTree())

    // 1) Start the first (stale) request — it awaits getDiff which is deferred
    let stalePromise: Promise<void>
    act(() => {
      stalePromise = result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    // 2) Start the second (fresh) request — resolves immediately
    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    // The fresh request has set the tree
    expect(result.current.fileTree).not.toBeNull()
    const freshFiles = collectFiles(result.current.fileTree!)
    expect(freshFiles.map((f) => f.path)).toEqual(['fresh.ts'])

    // 3) Now resolve the stale getDiff
    await act(async () => {
      resolveStale!({ files: [{ path: 'stale.ts', type: 'modify' }] })
      await stalePromise!
    })

    // The tree should still reflect the fresh request — stale data discarded
    expect(result.current.fileTree).not.toBeNull()
    const afterStaleFiles = collectFiles(result.current.fileTree!)
    expect(afterStaleFiles.map((f) => f.path)).toEqual(['fresh.ts'])
  })
})

describe('useFileTree toggleExpand', () => {
  it('expands and collapses directory paths', () => {
    const { result } = renderHook(() => useFileTree())

    // Initially empty
    expect(result.current.expandedPaths.size).toBe(0)

    // Expand a directory
    act(() => {
      result.current.toggleExpand('src')
    })
    expect(result.current.expandedPaths.has('src')).toBe(true)

    // Collapse it
    act(() => {
      result.current.toggleExpand('src')
    })
    expect(result.current.expandedPaths.has('src')).toBe(false)
  })
})

describe('useFileTree toggleSelect', () => {
  it('selects and deselects files', () => {
    const { result } = renderHook(() => useFileTree())

    act(() => {
      result.current.toggleSelect('src/app.ts')
    })
    expect(result.current.selectedPaths.has('src/app.ts')).toBe(true)

    act(() => {
      result.current.toggleSelect('src/app.ts')
    })
    expect(result.current.selectedPaths.has('src/app.ts')).toBe(false)
  })
})

describe('useFileTree selectAll / deselectAll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('selectAll respects showChangedOnly', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'src/changed.ts', type: 'modify' },
      ],
      baseFiles: ['src/changed.ts', 'src/unchanged.ts'],
      compareFiles: ['src/changed.ts', 'src/unchanged.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    // showChangedOnly defaults to true
    expect(result.current.showChangedOnly).toBe(true)

    // First clear the initial selection
    act(() => {
      result.current.deselectAll()
    })
    expect(result.current.selectedPaths.size).toBe(0)

    // selectAll should only select changed files when showChangedOnly is true
    act(() => {
      result.current.selectAll()
    })
    expect(result.current.selectedPaths.has('src/changed.ts')).toBe(true)
    expect(result.current.selectedPaths.has('src/unchanged.ts')).toBe(false)
  })

  it('selectAll includes unchanged files when showChangedOnly is false', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'src/changed.ts', type: 'modify' },
      ],
      baseFiles: ['src/changed.ts', 'src/unchanged.ts'],
      compareFiles: ['src/changed.ts', 'src/unchanged.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    // Disable showChangedOnly
    act(() => {
      result.current.setShowChangedOnly(false)
    })

    act(() => {
      result.current.selectAll()
    })

    expect(result.current.selectedPaths.has('src/changed.ts')).toBe(true)
    expect(result.current.selectedPaths.has('src/unchanged.ts')).toBe(true)
  })

  it('selectAll respects filter text', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'src/app.ts', type: 'modify' },
        { path: 'src/utils.ts', type: 'modify' },
      ],
      baseFiles: ['src/app.ts', 'src/utils.ts'],
      compareFiles: ['src/app.ts', 'src/utils.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    // selectAll with filter text should only select matching files
    act(() => {
      result.current.selectAll('app')
    })
    expect(result.current.selectedPaths.has('src/app.ts')).toBe(true)
    expect(result.current.selectedPaths.has('src/utils.ts')).toBe(false)
  })

  it('deselectAll clears selected paths for visible files', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'a.ts', type: 'add' },
        { path: 'b.ts', type: 'add' },
      ],
      baseFiles: [],
      compareFiles: ['a.ts', 'b.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    // After computeDiffAndTree, add/modify files are auto-selected
    expect(result.current.selectedPaths.size).toBe(2)

    act(() => {
      result.current.deselectAll()
    })
    expect(result.current.selectedPaths.size).toBe(0)
  })
})

describe('useFileTree expandAll / collapseAll', () => {
  it('expandAll sets all directory paths', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'src/components/Button.tsx', type: 'add' },
        { path: 'src/utils/helpers.ts', type: 'add' },
        { path: 'lib/core.ts', type: 'add' },
      ],
      baseFiles: [],
      compareFiles: ['src/components/Button.tsx', 'src/utils/helpers.ts', 'lib/core.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    act(() => {
      result.current.expandAll()
    })

    // All directory paths should be expanded
    const dirs = collectDirs(result.current.fileTree!)
    for (const dir of dirs) {
      expect(result.current.expandedPaths.has(dir.path)).toBe(true)
    }
    // Verify we have the expected directories
    const dirPaths = dirs.map((d) => d.path).sort()
    expect(dirPaths).toEqual(['lib', 'src', 'src/components', 'src/utils'])
  })

  it('collapseAll clears all expanded paths', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'src/components/Button.tsx', type: 'add' },
      ],
      baseFiles: [],
      compareFiles: ['src/components/Button.tsx'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    // Paths auto-expanded after computeDiffAndTree
    expect(result.current.expandedPaths.size).toBeGreaterThan(0)

    act(() => {
      result.current.collapseAll()
    })
    expect(result.current.expandedPaths.size).toBe(0)
  })
})

describe('useFileTree revealPath', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('expands parent directories of target file', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'src/deep/nested/dir/file.ts', type: 'add' },
      ],
      baseFiles: [],
      compareFiles: ['src/deep/nested/dir/file.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    // Collapse everything first
    act(() => {
      result.current.collapseAll()
    })
    expect(result.current.expandedPaths.size).toBe(0)

    // Reveal the deeply nested file
    act(() => {
      result.current.revealPath('src/deep/nested/dir/file.ts')
    })

    // All parent directories should be expanded
    expect(result.current.expandedPaths.has('src')).toBe(true)
    expect(result.current.expandedPaths.has('src/deep')).toBe(true)
    expect(result.current.expandedPaths.has('src/deep/nested')).toBe(true)
    expect(result.current.expandedPaths.has('src/deep/nested/dir')).toBe(true)

    vi.useRealTimers()
  })
})

describe('useFileTree showChangedOnly filter', () => {
  it('showChangedOnly defaults to true and unchanged files are filterable', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'changed.ts', type: 'modify' },
      ],
      baseFiles: ['changed.ts', 'stable.ts'],
      compareFiles: ['changed.ts', 'stable.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    // showChangedOnly defaults to true
    expect(result.current.showChangedOnly).toBe(true)

    // Both files exist in the tree (the tree includes all files)
    const files = collectFiles(result.current.fileTree!)
    const paths = files.map((f) => f.path).sort()
    expect(paths).toEqual(['changed.ts', 'stable.ts'])

    // The unchanged file has 'unchanged' status (UI can filter on it)
    const stable = files.find((f) => f.path === 'stable.ts')!
    expect(stable.status).toBe('unchanged')

    // selectAll with showChangedOnly=true should skip unchanged
    act(() => {
      result.current.deselectAll()
    })
    act(() => {
      result.current.selectAll()
    })
    // Only changed.ts should be selected
    expect(result.current.selectedPaths.has('changed.ts')).toBe(true)
    expect(result.current.selectedPaths.has('stable.ts')).toBe(false)
  })
})

describe('useFileTree auto-selection on computeDiffAndTree', () => {
  it('auto-selects add and modify files, not remove files', async () => {
    const client = createMockGitClient({
      diffFiles: [
        { path: 'added.ts', type: 'add' },
        { path: 'modified.ts', type: 'modify' },
        { path: 'removed.ts', type: 'remove' },
      ],
      baseFiles: ['modified.ts', 'removed.ts'],
      compareFiles: ['added.ts', 'modified.ts'],
    })
    const { result } = renderHook(() => useFileTree())

    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })

    expect(result.current.selectedPaths.has('added.ts')).toBe(true)
    expect(result.current.selectedPaths.has('modified.ts')).toBe(true)
    expect(result.current.selectedPaths.has('removed.ts')).toBe(false)
  })
})

describe('useFileTree same branch handling', () => {
  it('resets state when base and compare branches are the same', async () => {
    const mockSetAppStatus = vi.fn()
    const client = createMockGitClient({
      diffFiles: [{ path: 'a.ts', type: 'add' }],
      baseFiles: [],
      compareFiles: ['a.ts'],
    })
    const { result } = renderHook(() => useFileTree(mockSetAppStatus))

    // First, load something
    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'feature')
    })
    expect(result.current.fileTree).not.toBeNull()

    // Now use same branch
    await act(async () => {
      await result.current.computeDiffAndTree(client, 'main', 'main')
    })

    expect(result.current.fileTree).toBeNull()
    expect(result.current.selectedPaths.size).toBe(0)
    expect(mockSetAppStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'READY',
        message: expect.stringContaining('same'),
      })
    )
  })
})

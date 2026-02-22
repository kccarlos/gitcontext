import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { FileDiffStatus, ReadFileResult } from '@gitcontext/core'

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockReadFile = vi.fn()
  return { mockReadFile }
})

// ── Module mocks ────────────────────────────────────────────────────────────

// Mock tiktoken to return deterministic token counts (1 token per word)
vi.mock('../utils/tokenizer', () => ({
  countTokens: vi.fn(async (text: string) => {
    if (!text) return 0
    return text.split(/\s+/).filter(Boolean).length
  }),
}))

import { useTokenCounts } from './useTokenCounts'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a fake git client with a mocked readFile method. */
function makeGitClient() {
  return { readFile: mocks.mockReadFile } as any
}

function makeReadResult(text: string, opts?: { binary?: boolean; notFound?: boolean }): ReadFileResult {
  return { binary: opts?.binary ?? false, text, notFound: opts?.notFound ?? false }
}

/** Flush all pending microtasks/promises so the hook effect runs. */
async function flushPromises() {
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0))
    }
  })
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useTokenCounts', () => {
  let gitClient: ReturnType<typeof makeGitClient>

  beforeEach(() => {
    vi.clearAllMocks()
    gitClient = makeGitClient()
    // Default readFile: return simple text content
    mocks.mockReadFile.mockImplementation(async (_ref: string, path: string) =>
      makeReadResult(`content of ${path}`)
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── 1. Token counts update when selectedPaths change ────────────────────

  it('updates token counts when selectedPaths change', async () => {
    const selectedPaths = new Set(['src/a.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([['src/a.ts', 'modify']])

    const { result, rerender } = renderHook(
      (props: { paths: Set<string>; statuses: Map<string, FileDiffStatus> }) =>
        useTokenCounts({
          gitClient,
          baseRef: 'main',
          compareRef: 'dev',
          selectedPaths: props.paths,
          statusByPath: props.statuses,
          diffContextLines: 3,
        }),
      { initialProps: { paths: selectedPaths, statuses: statusByPath } },
    )

    await flushPromises()

    expect(result.current.counts.size).toBe(1)
    expect(result.current.counts.has('src/a.ts')).toBe(true)
    expect(result.current.total).toBeGreaterThan(0)

    // Add another path and rerender
    const newPaths = new Set(['src/a.ts', 'src/b.ts'])
    const newStatuses = new Map<string, FileDiffStatus>([
      ['src/a.ts', 'modify'],
      ['src/b.ts', 'add'],
    ])

    rerender({ paths: newPaths, statuses: newStatuses })
    await flushPromises()

    expect(result.current.counts.size).toBe(2)
    expect(result.current.counts.has('src/b.ts')).toBe(true)
  })

  // ── 2. Binary files counted as path-only tokens when includeBinaryPaths is true

  it('counts binary files as header-only tokens when includeBinaryPaths is true', async () => {
    const selectedPaths = new Set(['image.png'])
    const statusByPath = new Map<string, FileDiffStatus>([['image.png', 'add']])

    const { result } = renderHook(() =>
      useTokenCounts({
        gitClient,
        baseRef: 'main',
        compareRef: 'dev',
        selectedPaths,
        statusByPath,
        diffContextLines: 3,
        includeBinaryPaths: true,
      }),
    )

    await flushPromises()

    // Binary file detected by extension (.png) should produce tokens from header only
    expect(result.current.counts.has('image.png')).toBe(true)
    const count = result.current.counts.get('image.png')!
    // The header "## FILE: image.png (ADD)\n\n" produces some tokens
    expect(count).toBeGreaterThan(0)
    // readFile should NOT be called since extension-detected binary skips content reading
    expect(mocks.mockReadFile).not.toHaveBeenCalled()
  })

  // ── 3. Binary files return 0 tokens when includeBinaryPaths is false ────

  it('returns 0 tokens for binary files when includeBinaryPaths is false', async () => {
    const selectedPaths = new Set(['photo.jpg'])
    const statusByPath = new Map<string, FileDiffStatus>([['photo.jpg', 'add']])

    const { result } = renderHook(() =>
      useTokenCounts({
        gitClient,
        baseRef: 'main',
        compareRef: 'dev',
        selectedPaths,
        statusByPath,
        diffContextLines: 3,
        includeBinaryPaths: false,
      }),
    )

    await flushPromises()

    expect(result.current.counts.has('photo.jpg')).toBe(true)
    expect(result.current.counts.get('photo.jpg')).toBe(0)
    expect(result.current.total).toBe(0)
    expect(mocks.mockReadFile).not.toHaveBeenCalled()
  })

  // ── 4. Progress callback reports correct completed/total ────────────────

  it('reports progress via onBatch callback', async () => {
    const paths = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts']
    const selectedPaths = new Set(paths)
    const statusByPath = new Map<string, FileDiffStatus>(
      paths.map((p) => [p, 'modify'] as const),
    )

    const onBatch = vi.fn()

    renderHook(() =>
      useTokenCounts({
        gitClient,
        baseRef: 'main',
        compareRef: 'dev',
        selectedPaths,
        statusByPath,
        diffContextLines: 3,
        onBatch,
      }),
    )

    await flushPromises()

    // onBatch should have been called multiple times
    expect(onBatch).toHaveBeenCalled()

    // Check initial call: (0, 5) since there are 5 files
    const firstCall = onBatch.mock.calls[0]
    expect(firstCall[0]).toBe(0)
    expect(firstCall[1]).toBe(5)

    // Check final call indicates completion: (5, 5)
    const lastCall = onBatch.mock.calls[onBatch.mock.calls.length - 1]
    expect(lastCall[0]).toBe(5)
    expect(lastCall[1]).toBe(5)
  })

  // ── 5. Cancellation via AbortSignal stops in-flight counting ────────────

  it('does not update state after cancellation (abort)', async () => {
    // Make readFile hang indefinitely until we resolve it
    let resolvers: Array<(v: ReadFileResult) => void> = []
    mocks.mockReadFile.mockImplementation(
      () =>
        new Promise<ReadFileResult>((resolve) => {
          resolvers.push(() => resolve(makeReadResult('slow content')))
        }),
    )

    const selectedPaths = new Set(['slow.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([['slow.ts', 'modify']])

    const { result, unmount } = renderHook(() =>
      useTokenCounts({
        gitClient,
        baseRef: 'main',
        compareRef: 'dev',
        selectedPaths,
        statusByPath,
        diffContextLines: 3,
      }),
    )

    // Let the effect start
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    // Unmount triggers abort via the cleanup function
    unmount()

    // Resolve the pending readFile (simulating response arriving after abort)
    resolvers.forEach((r) => r(makeReadResult('slow content')))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // After abort, counts should remain empty (no state update happened)
    expect(result.current.counts.size).toBe(0)
  })

  // ── 6. Empty selection returns all zero counts ──────────────────────────

  it('returns empty counts and zero total for empty selection', async () => {
    const selectedPaths = new Set<string>()
    const statusByPath = new Map<string, FileDiffStatus>()

    const { result } = renderHook(() =>
      useTokenCounts({
        gitClient,
        baseRef: 'main',
        compareRef: 'dev',
        selectedPaths,
        statusByPath,
        diffContextLines: 3,
      }),
    )

    await flushPromises()

    expect(result.current.counts.size).toBe(0)
    expect(result.current.total).toBe(0)
    expect(result.current.busy).toBe(false)
  })

  // ── 7. Diff context lines affect token count ───────────────────────────

  it('produces more tokens with more context lines', async () => {
    // Set up a modify scenario with multi-line content
    const longContent = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
    const modifiedContent = longContent.replace('line 10', 'CHANGED line 10')

    mocks.mockReadFile.mockImplementation(async (ref: string) => {
      if (ref === 'main') return makeReadResult(longContent)
      return makeReadResult(modifiedContent)
    })

    const selectedPaths = new Set(['file.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([['file.ts', 'modify']])

    // Render with 0 context lines
    const { result: result0 } = renderHook(() =>
      useTokenCounts({
        gitClient,
        baseRef: 'main',
        compareRef: 'dev',
        selectedPaths,
        statusByPath,
        diffContextLines: 0,
      }),
    )

    await flushPromises()
    const tokensWithZeroContext = result0.current.total

    // Render with 999 (full file) context lines
    const { result: resultMax } = renderHook(() =>
      useTokenCounts({
        gitClient,
        baseRef: 'main',
        compareRef: 'dev',
        selectedPaths,
        statusByPath,
        diffContextLines: 999,
      }),
    )

    await flushPromises()
    const tokensWithMaxContext = resultMax.current.total

    // More context lines should produce more tokens
    expect(tokensWithMaxContext).toBeGreaterThan(tokensWithZeroContext)
  })

  // ── 8. Total includes file content + header formatting tokens ───────────

  it('total is sum of all individual file counts', async () => {
    const paths = ['src/a.ts', 'src/b.ts', 'src/c.ts']
    const selectedPaths = new Set(paths)
    const statusByPath = new Map<string, FileDiffStatus>(
      paths.map((p) => [p, 'modify'] as const),
    )

    const { result } = renderHook(() =>
      useTokenCounts({
        gitClient,
        baseRef: 'main',
        compareRef: 'dev',
        selectedPaths,
        statusByPath,
        diffContextLines: 3,
      }),
    )

    await flushPromises()

    let expectedSum = 0
    for (const [, count] of result.current.counts) {
      expectedSum += count
    }
    expect(result.current.total).toBe(expectedSum)
    expect(result.current.total).toBeGreaterThan(0)
  })

  // ── 9. Runtime-detected binary files handled correctly ──────────────────

  it('handles runtime-detected binary files (non-binary extension but binary content)', async () => {
    // File with a text-like extension but readFile returns binary: true
    mocks.mockReadFile.mockResolvedValue(makeReadResult('', { binary: true }))

    const selectedPaths = new Set(['data.dat'])
    const statusByPath = new Map<string, FileDiffStatus>([['data.dat', 'modify']])

    // With includeBinaryPaths = true: should get header tokens
    const { result: resultInclude } = renderHook(() =>
      useTokenCounts({
        gitClient,
        baseRef: 'main',
        compareRef: 'dev',
        selectedPaths,
        statusByPath,
        diffContextLines: 3,
        includeBinaryPaths: true,
      }),
    )

    await flushPromises()
    const tokensIncluded = resultInclude.current.counts.get('data.dat')!
    expect(tokensIncluded).toBeGreaterThan(0) // Header tokens

    // With includeBinaryPaths = false: should get 0 tokens
    mocks.mockReadFile.mockResolvedValue(makeReadResult('', { binary: true }))
    const { result: resultExclude } = renderHook(() =>
      useTokenCounts({
        gitClient,
        baseRef: 'main',
        compareRef: 'dev',
        selectedPaths,
        statusByPath,
        diffContextLines: 3,
        includeBinaryPaths: false,
      }),
    )

    await flushPromises()
    const tokensExcluded = resultExclude.current.counts.get('data.dat')!
    expect(tokensExcluded).toBe(0)
  })

  // ── 10. No gitClient returns empty counts ───────────────────────────────

  it('returns empty counts when gitClient is null', async () => {
    const selectedPaths = new Set(['file.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([['file.ts', 'modify']])

    const { result } = renderHook(() =>
      useTokenCounts({
        gitClient: null,
        baseRef: 'main',
        compareRef: 'dev',
        selectedPaths,
        statusByPath,
        diffContextLines: 3,
      }),
    )

    await flushPromises()

    expect(result.current.counts.size).toBe(0)
    expect(result.current.total).toBe(0)
    expect(mocks.mockReadFile).not.toHaveBeenCalled()
  })
})

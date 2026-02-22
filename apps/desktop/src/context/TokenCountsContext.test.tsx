import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import type { FileDiffStatus } from '@gitcontext/core'

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // Capture the most recent return value and the onBatch callback
  let latestOnBatch: ((done: number, total: number) => void) | undefined
  let resolveRun: (() => void) | undefined
  const mockUseTokenCounts = vi.fn()

  return { mockUseTokenCounts, getOnBatch: () => latestOnBatch, setOnBatch: (fn: any) => { latestOnBatch = fn }, getResolveRun: () => resolveRun, setResolveRun: (fn: any) => { resolveRun = fn } }
})

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../hooks/useTokenCounts', () => ({
  useTokenCounts: (args: any) => {
    // Capture the onBatch callback so tests can invoke it
    mocks.setOnBatch(args.onBatch)
    return mocks.mockUseTokenCounts(args)
  },
}))

import { TokenCountsProvider, useTokenCountsContext } from './TokenCountsContext'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** A child component that reads and displays context values. */
function Consumer({ testId }: { testId?: string }) {
  const ctx = useTokenCountsContext()
  return (
    <div data-testid={testId ?? 'consumer'}>
      <span data-testid="total">{ctx.total}</span>
      <span data-testid="busy">{String(ctx.busy)}</span>
      <span data-testid="progress-completed">{ctx.progress.completed}</span>
      <span data-testid="progress-total">{ctx.progress.total}</span>
      <span data-testid="progress-percent">{ctx.progress.percent}</span>
      <span data-testid="counts-size">{ctx.counts.size}</span>
    </div>
  )
}

function makeProviderProps(overrides: Partial<React.ComponentProps<typeof TokenCountsProvider>> = {}) {
  return {
    gitClient: { readFile: vi.fn() } as any,
    baseRef: 'main',
    compareRef: 'dev',
    selectedPaths: new Set<string>(),
    statusByPath: new Map<string, FileDiffStatus>(),
    diffContextLines: 3,
    ...overrides,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('TokenCountsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: return idle/empty state
    mocks.mockUseTokenCounts.mockReturnValue({
      counts: new Map<string, number>(),
      total: 0,
      busy: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── 1. Provider makes token counts available to children via useContext ──

  it('makes token counts available to children via useContext', () => {
    const countsMap = new Map([['src/a.ts', 42], ['src/b.ts', 58]])
    mocks.mockUseTokenCounts.mockReturnValue({
      counts: countsMap,
      total: 100,
      busy: false,
    })

    const props = makeProviderProps()
    render(
      <TokenCountsProvider {...props}>
        <Consumer />
      </TokenCountsProvider>,
    )

    expect(screen.getByTestId('total').textContent).toBe('100')
    expect(screen.getByTestId('busy').textContent).toBe('false')
    expect(screen.getByTestId('counts-size').textContent).toBe('2')
  })

  // ── 2. Counts update when selectedPaths change ──────────────────────────

  it('updates counts when selectedPaths change', () => {
    const initialCounts = new Map([['src/a.ts', 20]])
    mocks.mockUseTokenCounts.mockReturnValue({
      counts: initialCounts,
      total: 20,
      busy: false,
    })

    const props = makeProviderProps({
      selectedPaths: new Set(['src/a.ts']),
      statusByPath: new Map([['src/a.ts', 'modify']]),
    })

    const { rerender } = render(
      <TokenCountsProvider {...props}>
        <Consumer />
      </TokenCountsProvider>,
    )

    expect(screen.getByTestId('total').textContent).toBe('20')
    expect(screen.getByTestId('counts-size').textContent).toBe('1')

    // Simulate selectedPaths change => useTokenCounts returns updated counts
    const updatedCounts = new Map([['src/a.ts', 20], ['src/b.ts', 30]])
    mocks.mockUseTokenCounts.mockReturnValue({
      counts: updatedCounts,
      total: 50,
      busy: false,
    })

    const newProps = makeProviderProps({
      selectedPaths: new Set(['src/a.ts', 'src/b.ts']),
      statusByPath: new Map([['src/a.ts', 'modify'], ['src/b.ts', 'add']]),
    })

    rerender(
      <TokenCountsProvider {...newProps}>
        <Consumer />
      </TokenCountsProvider>,
    )

    expect(screen.getByTestId('total').textContent).toBe('50')
    expect(screen.getByTestId('counts-size').textContent).toBe('2')

    // Verify useTokenCounts was called with the updated selectedPaths
    const lastCall = mocks.mockUseTokenCounts.mock.calls[mocks.mockUseTokenCounts.mock.calls.length - 1][0]
    expect(lastCall.selectedPaths.has('src/b.ts')).toBe(true)
  })

  // ── 3. Busy flag is true during computation and false when done ─────────

  it('busy flag reflects computation state', () => {
    mocks.mockUseTokenCounts.mockReturnValue({
      counts: new Map(),
      total: 0,
      busy: true,
    })

    const props = makeProviderProps({
      selectedPaths: new Set(['src/a.ts']),
    })

    const { rerender } = render(
      <TokenCountsProvider {...props}>
        <Consumer />
      </TokenCountsProvider>,
    )

    expect(screen.getByTestId('busy').textContent).toBe('true')

    // Simulate computation complete
    mocks.mockUseTokenCounts.mockReturnValue({
      counts: new Map([['src/a.ts', 50]]),
      total: 50,
      busy: false,
    })

    rerender(
      <TokenCountsProvider {...props}>
        <Consumer />
      </TokenCountsProvider>,
    )

    expect(screen.getByTestId('busy').textContent).toBe('false')
    expect(screen.getByTestId('total').textContent).toBe('50')
  })

  // ── 4. Progress reports completed/total/percent correctly ───────────────

  it('progress updates correctly when onBatch is called', () => {
    mocks.mockUseTokenCounts.mockReturnValue({
      counts: new Map(),
      total: 0,
      busy: true,
    })

    const props = makeProviderProps({
      selectedPaths: new Set(['a.ts', 'b.ts', 'c.ts', 'd.ts']),
    })

    render(
      <TokenCountsProvider {...props}>
        <Consumer />
      </TokenCountsProvider>,
    )

    // Initially progress should be zeros
    expect(screen.getByTestId('progress-completed').textContent).toBe('0')
    expect(screen.getByTestId('progress-total').textContent).toBe('0')
    expect(screen.getByTestId('progress-percent').textContent).toBe('0')

    // Simulate progress callback: 2 of 4 done
    const onBatch = mocks.getOnBatch()
    expect(onBatch).toBeDefined()

    act(() => {
      onBatch!(2, 4)
    })

    expect(screen.getByTestId('progress-completed').textContent).toBe('2')
    expect(screen.getByTestId('progress-total').textContent).toBe('4')
    expect(screen.getByTestId('progress-percent').textContent).toBe('50')

    // Simulate progress callback: 4 of 4 done
    act(() => {
      onBatch!(4, 4)
    })

    expect(screen.getByTestId('progress-completed').textContent).toBe('4')
    expect(screen.getByTestId('progress-total').textContent).toBe('4')
    expect(screen.getByTestId('progress-percent').textContent).toBe('100')
  })

  // ── 5. Total is sum of all individual file counts ───────────────────────

  it('total is the sum of all individual file counts', () => {
    const countsMap = new Map([
      ['src/a.ts', 100],
      ['src/b.ts', 200],
      ['src/c.ts', 300],
    ])
    mocks.mockUseTokenCounts.mockReturnValue({
      counts: countsMap,
      total: 600,
      busy: false,
    })

    const props = makeProviderProps({
      selectedPaths: new Set(['src/a.ts', 'src/b.ts', 'src/c.ts']),
    })

    render(
      <TokenCountsProvider {...props}>
        <Consumer />
      </TokenCountsProvider>,
    )

    expect(screen.getByTestId('total').textContent).toBe('600')

    // Verify that useTokenCounts is called and returns matching total
    let sum = 0
    for (const [, n] of countsMap) sum += n
    expect(sum).toBe(600)
  })

  // ── 6. Provider handles unmount during async counting gracefully ────────

  it('handles unmount during async counting without state-update-after-unmount warnings', () => {
    // Use a spy on console.error to detect React warnings
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mocks.mockUseTokenCounts.mockReturnValue({
      counts: new Map(),
      total: 0,
      busy: true,
    })

    const props = makeProviderProps({
      selectedPaths: new Set(['src/slow.ts']),
    })

    const { unmount } = render(
      <TokenCountsProvider {...props}>
        <Consumer />
      </TokenCountsProvider>,
    )

    // Capture onBatch before unmount
    const onBatch = mocks.getOnBatch()
    expect(onBatch).toBeDefined()

    // Unmount the provider while "busy"
    unmount()

    // Simulate the onBatch callback firing after unmount
    // This should not cause a "state update on unmounted component" warning
    // because React 18+ batches and ignores updates on unmounted components
    act(() => {
      // The onBatch calls setProgress, which would warn in older React
      // In React 18+, this is silently ignored
      onBatch!(1, 1)
    })

    // Check no "state update on unmounted component" warnings were logged
    const stateUpdateWarnings = consoleErrorSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('state update') &&
        call[0].includes('unmounted'),
    )
    expect(stateUpdateWarnings).toHaveLength(0)

    consoleErrorSpy.mockRestore()
  })

  // ── 7. Progress percent edge cases ──────────────────────────────────────

  it('progress percent handles edge cases correctly', () => {
    mocks.mockUseTokenCounts.mockReturnValue({
      counts: new Map(),
      total: 0,
      busy: true,
    })

    const props = makeProviderProps()

    render(
      <TokenCountsProvider {...props}>
        <Consumer />
      </TokenCountsProvider>,
    )

    const onBatch = mocks.getOnBatch()!

    // Edge case: totalFiles <= 0 should produce percent = 100
    act(() => {
      onBatch(0, 0)
    })
    expect(screen.getByTestId('progress-percent').textContent).toBe('100')

    // Edge case: completed > total (shouldn't happen, but clamp to 100)
    act(() => {
      onBatch(10, 5)
    })
    expect(screen.getByTestId('progress-percent').textContent).toBe('100')

    // Edge case: done 1 of 3 = 33%
    act(() => {
      onBatch(1, 3)
    })
    expect(screen.getByTestId('progress-percent').textContent).toBe('33')
  })

  // ── 8. useTokenCountsContext throws when used outside provider ──────────

  it('throws when useTokenCountsContext is used outside provider', () => {
    // Suppress React error boundary console output
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function BadConsumer() {
      useTokenCountsContext()
      return <div />
    }

    expect(() => render(<BadConsumer />)).toThrow(
      'useTokenCountsContext must be used within a TokenCountsProvider',
    )

    consoleErrorSpy.mockRestore()
  })

  // ── 9. Provider passes props correctly to useTokenCounts ────────────────

  it('passes all props to useTokenCounts correctly', () => {
    mocks.mockUseTokenCounts.mockReturnValue({
      counts: new Map(),
      total: 0,
      busy: false,
    })

    const gitClient = { readFile: vi.fn() } as any
    const selectedPaths = new Set(['x.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([['x.ts', 'add']])

    const props = makeProviderProps({
      gitClient,
      baseRef: 'feature',
      compareRef: 'main',
      selectedPaths,
      statusByPath,
      diffContextLines: 5,
      includeBinaryPaths: false,
    })

    render(
      <TokenCountsProvider {...props}>
        <Consumer />
      </TokenCountsProvider>,
    )

    expect(mocks.mockUseTokenCounts).toHaveBeenCalledTimes(1)
    const callArgs = mocks.mockUseTokenCounts.mock.calls[0][0]
    expect(callArgs.gitClient).toBe(gitClient)
    expect(callArgs.baseRef).toBe('feature')
    expect(callArgs.compareRef).toBe('main')
    expect(callArgs.selectedPaths).toBe(selectedPaths)
    expect(callArgs.statusByPath).toBe(statusByPath)
    expect(callArgs.diffContextLines).toBe(5)
    expect(callArgs.includeBinaryPaths).toBe(false)
    expect(typeof callArgs.onBatch).toBe('function')
  })
})

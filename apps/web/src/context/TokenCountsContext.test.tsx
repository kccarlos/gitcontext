// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { GitEngine } from '../platform/types'
import type { FileDiffStatus } from '../hooks/useFileTree'

vi.mock('../platform/tokenizerFactory', () => ({
  createTokenizer: () => ({
    async count(text: string) { return text.length },
    async warmup() {},
  }),
}))

import { TokenCountsProvider, useTokenCountsContext } from './TokenCountsContext'

function Total({ onRender }: { onRender: (total: number, busy: boolean) => void }) {
  const { total, busy } = useTokenCountsContext()
  onRender(total, busy)
  return null
}

describe('TokenCountsProvider', () => {
  it('counts each selected file once instead of restarting on its own progress updates', async () => {
    const readFile = vi.fn(async (_ref: string, path: string) => ({ text: `content of ${path}\n` }))
    const gitClient = { readFile } as unknown as GitEngine
    const selectedPaths = new Set(['a.ts', 'b.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([['a.ts', 'add'], ['b.ts', 'add']])
    let last = { total: 0, busy: true }

    render(
      <TokenCountsProvider
        gitClient={gitClient}
        baseRef="main"
        compareRef="feature"
        selectedPaths={selectedPaths}
        statusByPath={statusByPath}
        diffContextLines={3}
      >
        <Total onRender={(total, busy) => { last = { total, busy } }} />
      </TokenCountsProvider>,
    )

    await waitFor(() => expect(last.busy).toBe(false))
    await new Promise((r) => setTimeout(r, 50))

    expect(last.total).toBeGreaterThan(0)
    // Two added files: one read each, from the compare ref.
    expect(readFile).toHaveBeenCalledTimes(2)
  })
})

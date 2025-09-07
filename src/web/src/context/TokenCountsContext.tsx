import React, { createContext, useContext, useMemo, useState } from 'react'
import type { GitEngine } from '../platform/types'
import type { FileDiffStatus } from '../hooks/useFileTree'
import { useTokenCounts } from '../hooks/useTokenCounts'

type ProgressState = { completed: number; total: number; percent: number }
type Ctx = {
  counts: Map<string, number>
  total: number
  busy: boolean
  progress: ProgressState
}

const TokenCountsContext = createContext<Ctx | undefined>(undefined)

type ProviderProps = {
  gitClient: GitEngine | null
  baseRef: string
  compareRef: string
  selectedPaths: Set<string>
  statusByPath: Map<string, FileDiffStatus>
  diffContextLines: number
  includeBinaryPaths?: boolean
  children: React.ReactNode
}

export function TokenCountsProvider({
  gitClient,
  baseRef,
  compareRef,
  selectedPaths,
  statusByPath,
  diffContextLines,
  includeBinaryPaths = true,
  children,
}: ProviderProps) {
  const [progress, setProgress] = useState<ProgressState>({ completed: 0, total: 0, percent: 0 })

  const { counts, total, busy } = useTokenCounts({
    gitClient,
    baseRef,
    compareRef,
    selectedPaths,
    statusByPath,
    diffContextLines,
    includeBinaryPaths,
    onBatch: (done, totalFiles) => {
      const pct =
        totalFiles <= 0
          ? 100
          : Math.max(0, Math.min(100, Math.round((done / totalFiles) * 100)))
      setProgress({ completed: done, total: totalFiles, percent: pct })
    },
  })

  const value = useMemo(() => ({ counts, total, busy, progress }), [counts, total, busy, progress])
  return <TokenCountsContext.Provider value={value}>{children}</TokenCountsContext.Provider>
}

export function useTokenCountsContext(): Ctx {
  const v = useContext(TokenCountsContext)
  if (!v) throw new Error('useTokenCountsContext must be used within a TokenCountsProvider')
  return v
}

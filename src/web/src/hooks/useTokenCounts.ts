import { useEffect, useMemo, useState } from 'react'
import type { GitEngine, TokenizerEngine } from '../platform/types'
import { createTokenizer } from '../platform/tokenizerFactory'
import type { FileDiffStatus } from './useFileTree'
import { buildUnifiedDiffForStatus } from '../utils/diff'

export type TokenCounts = Map<string, number>

type Args = {
  gitClient: GitEngine | null
  baseRef: string
  compareRef: string
  selectedPaths: Set<string>
  statusByPath: Map<string, FileDiffStatus>
  diffContextLines: number
  tokenizer?: TokenizerEngine
}

export function useTokenCounts({ gitClient, baseRef, compareRef, selectedPaths, statusByPath, diffContextLines, tokenizer }: Args) {
  const [counts, setCounts] = useState<TokenCounts>(new Map())
  const [busy, setBusy] = useState(false)
  const tok: TokenizerEngine = useMemo(() => tokenizer ?? createTokenizer(), [tokenizer])

  const selectedList = useMemo(() => Array.from(selectedPaths), [selectedPaths])

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!gitClient || !baseRef || !compareRef) {
        setCounts(new Map())
        return
      }
      setBusy(true)
      try {
        const next = new Map<string, number>()
        
        // Limit concurrent requests to prevent overwhelming the worker
        const BATCH_SIZE = 10
        for (let i = 0; i < selectedList.length; i += BATCH_SIZE) {
          if (cancelled) break
          
          const batch = selectedList.slice(i, i + BATCH_SIZE)
          await Promise.all(
            batch.map(async (path) => {
            const status = statusByPath.get(path) ?? 'unchanged'
            const needBase = status !== 'add'
            const needCompare = status !== 'remove'
            const [baseRes, compareRes] = await Promise.all([
              needBase && baseRef ? gitClient.readFile(baseRef, path) : Promise.resolve(undefined as any),
              needCompare && compareRef ? gitClient.readFile(compareRef, path) : Promise.resolve(undefined as any),
            ])
            // Mirror final output generation logic
            const MAX_CONTEXT = 999
            const ctx = diffContextLines >= MAX_CONTEXT ? Number.MAX_SAFE_INTEGER : diffContextLines
            let textForCount = ''
            if (status === 'modify' || status === 'add' || status === 'remove') {
              if (status === 'add' && ctx === Number.MAX_SAFE_INTEGER) {
                textForCount = (compareRes as { text?: string } | undefined)?.text ?? ''
              } else {
                textForCount = buildUnifiedDiffForStatus(status, path, baseRes as any, compareRes as any, { context: ctx }) || ''
              }
            } else {
              const oldText = (baseRes as any)?.binary || (baseRes as any)?.notFound ? '' : (baseRes as any)?.text ?? ''
              textForCount = oldText
            }
              const n = await tok.count(textForCount)
              next.set(path, n)
            }),
          )
        }
        if (!cancelled) setCounts(next)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [gitClient, baseRef, compareRef, selectedList, statusByPath, diffContextLines])

  const total = useMemo(() => {
    let sum = 0
    for (const [, n] of counts) sum += n
    return sum
  }, [counts])

  return { counts, total, busy }
}



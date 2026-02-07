import { useEffect, useMemo, useState } from 'react'
import type { TauriGitService } from '../services/TauriGitService'
import { countTokens } from '../utils/tokenizer'
import type { FileDiffStatus } from '@gitcontext/core'
import { buildUnifiedDiffForStatus } from '../utils/diff'
import { isBinaryPath, MAX_CONCURRENT_READS } from '@gitcontext/core'
import { mapWithConcurrency } from '../utils/concurrency'

export type TokenCounts = Map<string, number>

type TokenizerEngine = {
  count(text: string): Promise<number>
}

type Args = {
  gitClient: TauriGitService | null
  baseRef: string
  compareRef: string
  selectedPaths: Set<string>
  statusByPath: Map<string, FileDiffStatus>
  diffContextLines: number
  includeBinaryPaths?: boolean
  tokenizer?: TokenizerEngine
  onBatch?: (completed: number, total: number) => void
}

export function useTokenCounts({
  gitClient,
  baseRef,
  compareRef,
  selectedPaths,
  statusByPath,
  diffContextLines,
  includeBinaryPaths = true,
  tokenizer,
  onBatch,
}: Args) {
  const [counts, setCounts] = useState<TokenCounts>(new Map())
  const [busy, setBusy] = useState(false)
  const tok: TokenizerEngine = useMemo(() => tokenizer ?? { count: countTokens }, [tokenizer])

  const selectedList = useMemo(() => Array.from(selectedPaths), [selectedPaths])

  useEffect(() => {
    const abortController = new AbortController()
    async function run() {
      if (!gitClient || !baseRef || !compareRef) {
        setCounts(new Map())
        // If caller wants progress, mark as "complete" when there's nothing to do.
        try { onBatch?.(1, 1) } catch {}
        return
      }
      setBusy(true)
      try {
        const totalFiles = selectedList.length
        // initial tick
        try { onBatch?.(totalFiles === 0 ? 1 : 0, totalFiles === 0 ? 1 : totalFiles) } catch {}

        let batchesCompleted = 0
        const batchSize = MAX_CONCURRENT_READS

        // Limit concurrent requests to prevent overwhelming the backend
        const results = await mapWithConcurrency(
          selectedList,
          async (path) => {
            const status = statusByPath.get(path) ?? 'unchanged'
            const looksBinary = isBinaryPath(path)
            let textForCount = ''

            // Fast path: known-binary files never load content
            if (looksBinary) {
              if (includeBinaryPaths) {
                // Mirror the exact header we output during copy
                const header = `## FILE: ${path} (${(status || 'unchanged').toUpperCase()})\n\n`
                textForCount = header
              } else {
                textForCount = ''
              }
            } else {
              // Textual path -> maybe fetch content/diff
              const needBase = status !== 'add'
              const needCompare = status !== 'remove'
              const [baseRes, compareRes] = await Promise.all([
                needBase && baseRef ? gitClient.readFile(baseRef, path) : Promise.resolve(undefined as any),
                needCompare && compareRef ? gitClient.readFile(compareRef, path) : Promise.resolve(undefined as any),
              ])
              // Mirror final output generation logic
              const MAX_CONTEXT = 999
              const ctx = diffContextLines >= MAX_CONTEXT ? Number.MAX_SAFE_INTEGER : diffContextLines
              if (status === 'modify' || status === 'add' || status === 'remove') {
                const isBinary = Boolean((baseRes as any)?.binary) || Boolean((compareRes as any)?.binary)
                if (isBinary) {
                  // Edge: unknown ext but worker says binary; treat same as looksBinary
                  if (includeBinaryPaths) {
                    const header = `## FILE: ${path} (${(status || 'unchanged').toUpperCase()})\n\n`
                    textForCount = header
                  } else {
                    textForCount = ''
                  }
                } else if (status === 'add' && ctx === Number.MAX_SAFE_INTEGER) {
                  textForCount = (compareRes as { text?: string } | undefined)?.text ?? ''
                } else {
                  textForCount = buildUnifiedDiffForStatus(status, path, baseRes as any, compareRes as any, { context: ctx }) || ''
                }
              } else {
                const isBinary = Boolean((baseRes as any)?.binary)
                const oldText = isBinary || (baseRes as any)?.notFound ? '' : (baseRes as any)?.text ?? ''
                textForCount = oldText
              }
            }
            const n = textForCount ? await tok.count(textForCount) : 0

            // Update progress after each batch
            batchesCompleted++
            if (batchesCompleted % batchSize === 0) {
              try {
                onBatch?.(Math.min(batchesCompleted, totalFiles), totalFiles || 1)
              } catch {}
            }

            return { path, count: n }
          },
          { limit: MAX_CONCURRENT_READS, signal: abortController.signal }
        )

        const next = new Map<string, number>()
        for (const { path, count } of results) {
          next.set(path, count)
        }
        setCounts(next)
      } catch (err: any) {
        if (err?.message !== 'Operation cancelled') {
          throw err
        }
      } finally {
        setBusy(false)
        // ensure we always end at 100%
        try {
          onBatch?.(selectedList.length || 1, selectedList.length || 1)
        } catch {}
      }
    }
    run()
    return () => {
      abortController.abort()
    }
  }, [gitClient, baseRef, compareRef, selectedList, statusByPath, diffContextLines])

  const total = useMemo(() => {
    let sum = 0
    for (const [, n] of counts) sum += n
    return sum
  }, [counts])

  return { counts, total, busy }
}

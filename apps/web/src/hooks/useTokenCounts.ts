import { useEffect, useMemo, useState } from 'react'
import type { GitEngine, TokenizerEngine } from '../platform/types'
import { createTokenizer } from '../platform/tokenizerFactory'
import type { FileDiffStatus } from './useFileTree'
import { buildUnifiedDiffForStatus } from '../utils/diff'
import { isBinaryPath, MAX_CONCURRENT_READS } from '@gitcontext/core'
import { mapWithConcurrency } from '../utils/concurrency'
import { logError } from '../utils/logger'

// Helper to infer language from file extension for syntax highlighting
function inferLangFromPath(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', c: 'c', cpp: 'cpp', java: 'java',
    kt: 'kotlin', swift: 'swift', php: 'php', cs: 'csharp', sh: 'bash', yaml: 'yaml',
    yml: 'yaml', json: 'json', xml: 'xml', html: 'html', css: 'css', scss: 'scss',
    md: 'markdown', sql: 'sql',
  }
  return langMap[ext] || ''
}

export type TokenCounts = Map<string, number>

type Args = {
  gitClient: GitEngine | null
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
  const tok: TokenizerEngine = useMemo(() => tokenizer ?? createTokenizer(), [tokenizer])

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

        // Limit concurrent requests to prevent overwhelming the worker
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
              // Mirror final output generation logic EXACTLY as in copyAllSelected
              const header = `## FILE: ${path} (${(status || 'unchanged').toUpperCase()})\n\n`
              const MAX_CONTEXT = 999
              const ctx = diffContextLines >= MAX_CONTEXT ? Number.MAX_SAFE_INTEGER : diffContextLines

              if (status === 'modify' || status === 'add' || status === 'remove') {
                const isBinary = Boolean((baseRes as any)?.binary) || Boolean((compareRes as any)?.binary)
                if (isBinary) {
                  // Edge: unknown ext but worker says binary; treat same as looksBinary
                  if (includeBinaryPaths) {
                    textForCount = header // Just the header, no [Binary file] text
                  } else {
                    textForCount = ''
                  }
                } else if (status === 'add') {
                  // Include header + markdown fences + content (matches copyAllSelected line 781)
                  const newTextRaw = (compareRes as { text?: string } | undefined)?.text ?? ''
                  const newText = newTextRaw.endsWith('\n') ? newTextRaw.slice(0, -1) : newTextRaw
                  const lang = inferLangFromPath(path)
                  textForCount = header + '```' + lang + '\n' + newText + '\n```\n\n'
                } else {
                  // modify/remove: include header + diff fences + diff (matches copyAllSelected line 791)
                  const diffText = buildUnifiedDiffForStatus(status, path, baseRes as any, compareRes as any, { context: ctx }) || ''
                  if (diffText) {
                    textForCount = header + '```diff\n' + diffText + '```\n\n'
                  } else {
                    // Fallback: no text (matches copyAllSelected line 794)
                    textForCount = header + '_No textual content available._\n\n'
                  }
                }
              } else {
                // unchanged: include header + markdown fences + content (matches copyAllSelected line 800)
                const isBinary = Boolean((baseRes as any)?.binary)
                const text = isBinary || (baseRes as any)?.notFound ? '' : (baseRes as any)?.text ?? ''
                const lang = inferLangFromPath(path)
                textForCount = header + '```' + lang + '\n' + (text || '') + '\n```\n\n'
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
        // Don't throw from effect to avoid unhandled promise rejection
        if (err?.message !== 'Operation cancelled') {
          logError('tokenCounts', err)
          setCounts(new Map()) // Reset to empty on error
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
  }, [gitClient, baseRef, compareRef, selectedList, statusByPath, diffContextLines, includeBinaryPaths, tok, onBatch])

  const total = useMemo(() => {
    let sum = 0
    for (const [, n] of counts) sum += n
    return sum
  }, [counts])

  return { counts, total, busy }
}

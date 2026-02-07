import { createTwoFilesPatch } from 'diff'

export type UnifiedDiffOptions = {
  context?: number
}

function normalizeEol(text: string): string {
  // Normalize CRLF to LF for stable diffs
  return text.replace(/\r\n/g, '\n')
}

function ensureFinalNewline(text: string): string {
  return text.endsWith('\n') ? text : text + '\n'
}

/**
 * Create a unified diff suitable for markdown code blocks and preview.
 * By default shows 3 lines of context.
 */
export function createUnifiedDiffForPath(
  path: string,
  oldText: string,
  newText: string,
  options?: UnifiedDiffOptions,
): string {
  const oldName = `a/${path}`
  const newName = `b/${path}`
  const ctx = options?.context ?? 3
  const patch = createTwoFilesPatch(
    oldName,
    newName,
    normalizeEol(oldText),
    normalizeEol(newText),
    undefined,
    undefined,
    { context: ctx },
  )
  return ensureFinalNewline(patch)
}

export type ReadFileSide = { binary: boolean; text: string | null; notFound?: boolean } | undefined

/**
 * Convenience: create unified diff text based on file status and worker read results.
 * - modify: diff old vs new
 * - add:    diff empty vs new
 * - remove: diff old vs empty
 * - unchanged: returns the unchanged full text (not a diff)
 * Returns null when content cannot be produced (binary or missing on both sides).
 */
export function buildUnifiedDiffForStatus(
  status: 'modify' | 'add' | 'remove' | 'unchanged',
  path: string,
  base: ReadFileSide,
  compare: ReadFileSide,
  options?: UnifiedDiffOptions,
): string | null {
  const ctx = options?.context ?? 3
  const oldText = base?.binary || base?.notFound ? '' : base?.text ?? ''
  const newText = compare?.binary || compare?.notFound ? '' : compare?.text ?? ''

  if (status === 'modify') {
    // If either side is binary, skip diff generation
    if (base?.binary || compare?.binary) return null
    return createUnifiedDiffForPath(path, oldText, newText, { context: ctx })
  }
  if (status === 'add') {
    if (compare?.binary) return null
    return createUnifiedDiffForPath(path, '', newText, { context: ctx })
  }
  if (status === 'remove') {
    if (base?.binary) return null
    return createUnifiedDiffForPath(path, oldText, '', { context: ctx })
  }
  // unchanged: return full content if textual, otherwise null
  if (base?.binary) return null
  return oldText || null
}



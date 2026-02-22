import { describe, expect, it } from 'vitest'
import {
  createUnifiedDiffForPath,
  buildUnifiedDiffForStatus,
  type ReadFileSide,
} from './diff'

describe('createUnifiedDiffForPath', () => {
  it('produces correct unified diff for modified file with context lines', () => {
    const oldText = 'line1\nline2\nline3\nline4\nline5\n'
    const newText = 'line1\nline2\nchanged\nline4\nline5\n'
    const result = createUnifiedDiffForPath('src/foo.ts', oldText, newText)

    expect(result).toContain('--- a/src/foo.ts')
    expect(result).toContain('+++ b/src/foo.ts')
    expect(result).toContain('-line3')
    expect(result).toContain('+changed')
    // Default context=3 means all surrounding lines appear
    expect(result).toContain(' line1')
    expect(result).toContain(' line2')
    expect(result).toContain(' line4')
    expect(result).toContain(' line5')
  })

  it('shows all lines as additions for added file', () => {
    const newText = 'alpha\nbeta\ngamma\n'
    const result = createUnifiedDiffForPath('new.txt', '', newText)

    expect(result).toContain('+alpha')
    expect(result).toContain('+beta')
    expect(result).toContain('+gamma')
    // No removal lines
    expect(result).not.toMatch(/^-[a-z]/m)
  })

  it('shows all lines as deletions for removed file', () => {
    const oldText = 'alpha\nbeta\ngamma\n'
    const result = createUnifiedDiffForPath('old.txt', oldText, '')

    expect(result).toContain('-alpha')
    expect(result).toContain('-beta')
    expect(result).toContain('-gamma')
    // No addition lines
    expect(result).not.toMatch(/^\+[a-z]/m)
  })

  it('returns empty diff body when old and new are identical', () => {
    const text = 'same\ncontent\nhere\n'
    const result = createUnifiedDiffForPath('file.ts', text, text)

    // The diff library produces a patch header but no hunks when content is identical
    expect(result).toContain('--- a/file.ts')
    expect(result).toContain('+++ b/file.ts')
    // No hunk headers when identical
    expect(result).not.toContain('@@')
  })

  it('normalizes CRLF to LF for stable diffs', () => {
    const oldText = 'line1\r\nline2\r\nline3\r\n'
    const newText = 'line1\nline2\nchanged\n'
    const result = createUnifiedDiffForPath('mixed.txt', oldText, newText)

    // CRLF in old is normalized, so only line3→changed is a real change
    expect(result).toContain('-line3')
    expect(result).toContain('+changed')
    // line1 and line2 should show as unchanged context
    expect(result).toContain(' line1')
    expect(result).toContain(' line2')
    // No \r characters should appear in the output
    expect(result).not.toContain('\r')
  })

  it('produces stable diff when both sides have CRLF', () => {
    const text = 'aaa\r\nbbb\r\nccc\r\n'
    const result = createUnifiedDiffForPath('same.txt', text, text)

    // After normalization both sides are identical → no hunks
    expect(result).not.toContain('@@')
    expect(result).not.toContain('\r')
  })

  it('context=0 shows only changed lines', () => {
    const oldText = 'a\nb\nc\nd\ne\n'
    const newText = 'a\nb\nX\nd\ne\n'
    const result = createUnifiedDiffForPath('ctx.txt', oldText, newText, { context: 0 })

    expect(result).toContain('-c')
    expect(result).toContain('+X')
    // With 0 context, surrounding unchanged lines should not appear as context
    const lines = result.split('\n')
    const contextLines = lines.filter((l) => l.startsWith(' ') && l.trim().length > 0)
    // The only space-prefixed lines should be from the patch header, not content context
    // Filter out the header area
    const afterHunk = lines.slice(lines.findIndex((l) => l.startsWith('@@')))
    const hunkContextLines = afterHunk.filter(
      (l) => l.startsWith(' ') && !l.startsWith('===') && l.trim().length > 0,
    )
    expect(hunkContextLines.length).toBe(0)
  })

  it('context=3 shows 3 lines around changes', () => {
    // 10-line file, change at line 5 → context=3 means lines 2-4 and 6-8 appear
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
    const oldText = lines.join('\n') + '\n'
    const newLines = [...lines]
    newLines[4] = 'CHANGED'
    const newText = newLines.join('\n') + '\n'

    const result = createUnifiedDiffForPath('big.txt', oldText, newText, { context: 3 })

    // 3 lines before the change
    expect(result).toContain(' line2')
    expect(result).toContain(' line3')
    expect(result).toContain(' line4')
    // The change
    expect(result).toContain('-line5')
    expect(result).toContain('+CHANGED')
    // 3 lines after the change
    expect(result).toContain(' line6')
    expect(result).toContain(' line7')
    expect(result).toContain(' line8')
    // line1 is 4 lines before change → outside context=3, should not appear as context
    // (unless the diff library includes it for header reasons — check it's not in a hunk)
    const afterHunk = result.slice(result.indexOf('@@'))
    expect(afterHunk).not.toContain(' line1')
    // line10 is 5 lines after change → should not appear
    expect(afterHunk).not.toContain(' line10')
  })

  it('context=999 shows all lines in the file', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
    const oldText = lines.join('\n') + '\n'
    const newLines = [...lines]
    newLines[4] = 'CHANGED'
    const newText = newLines.join('\n') + '\n'

    const result = createUnifiedDiffForPath('full.txt', oldText, newText, { context: 999 })

    // All lines should be present
    expect(result).toContain(' line1')
    expect(result).toContain(' line2')
    expect(result).toContain(' line10')
    expect(result).toContain('-line5')
    expect(result).toContain('+CHANGED')
  })

  it('handles empty files producing valid diff', () => {
    const result = createUnifiedDiffForPath('empty.txt', '', '')

    // Should produce a valid patch with headers but no hunks
    expect(result).toContain('--- a/empty.txt')
    expect(result).toContain('+++ b/empty.txt')
    expect(result).not.toContain('@@')
  })

  it('handles file with no trailing newline', () => {
    const oldText = 'no newline at end'
    const newText = 'different no newline'
    const result = createUnifiedDiffForPath('notrail.txt', oldText, newText)

    expect(result).toContain('-no newline at end')
    expect(result).toContain('+different no newline')
    // The diff library adds "No newline at end of file" markers
    expect(result).toContain('No newline at end of file')
    // ensureFinalNewline guarantees trailing newline on the overall output
    expect(result.endsWith('\n')).toBe(true)
  })

  it('output always ends with a newline', () => {
    const result = createUnifiedDiffForPath('f.txt', 'a\n', 'b\n')
    expect(result.endsWith('\n')).toBe(true)
  })
})

describe('buildUnifiedDiffForStatus', () => {
  const textFile = (text: string): ReadFileSide => ({ binary: false, text })
  const binaryFile: ReadFileSide = { binary: true, text: null }
  const notFoundFile: ReadFileSide = { binary: false, text: null, notFound: true }

  it('produces diff for modified file', () => {
    const base = textFile('old content\n')
    const compare = textFile('new content\n')
    const result = buildUnifiedDiffForStatus('modify', 'mod.ts', base, compare)

    expect(result).not.toBeNull()
    expect(result).toContain('-old content')
    expect(result).toContain('+new content')
  })

  it('produces diff for added file', () => {
    const compare = textFile('new file content\nline2\n')
    const result = buildUnifiedDiffForStatus('add', 'added.ts', undefined, compare)

    expect(result).not.toBeNull()
    expect(result).toContain('+new file content')
    expect(result).toContain('+line2')
  })

  it('produces diff for removed file', () => {
    const base = textFile('old line1\nold line2\n')
    const result = buildUnifiedDiffForStatus('remove', 'removed.ts', base, undefined)

    expect(result).not.toBeNull()
    expect(result).toContain('-old line1')
    expect(result).toContain('-old line2')
  })

  it('returns full text for unchanged file', () => {
    const base = textFile('unchanged content\n')
    const compare = textFile('unchanged content\n')
    const result = buildUnifiedDiffForStatus('unchanged', 'same.ts', base, compare)

    expect(result).toBe('unchanged content\n')
  })

  it('returns null for unchanged binary file', () => {
    const result = buildUnifiedDiffForStatus('unchanged', 'img.png', binaryFile, binaryFile)
    expect(result).toBeNull()
  })

  it('returns null for unchanged file with empty text', () => {
    const base = textFile('')
    const result = buildUnifiedDiffForStatus('unchanged', 'empty.ts', base, base)
    // empty string is falsy, so `oldText || null` returns null
    expect(result).toBeNull()
  })

  it('returns null for modified binary file (base binary)', () => {
    const compare = textFile('text\n')
    const result = buildUnifiedDiffForStatus('modify', 'f.bin', binaryFile, compare)
    expect(result).toBeNull()
  })

  it('returns null for modified binary file (compare binary)', () => {
    const base = textFile('text\n')
    const result = buildUnifiedDiffForStatus('modify', 'f.bin', base, binaryFile)
    expect(result).toBeNull()
  })

  it('returns null for added binary file', () => {
    const result = buildUnifiedDiffForStatus('add', 'new.png', undefined, binaryFile)
    expect(result).toBeNull()
  })

  it('returns null for removed binary file', () => {
    const result = buildUnifiedDiffForStatus('remove', 'old.png', binaryFile, undefined)
    expect(result).toBeNull()
  })

  it('passes context option through to createUnifiedDiffForPath', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
    const oldText = lines.join('\n') + '\n'
    const newLines = [...lines]
    newLines[4] = 'CHANGED'
    const newText = newLines.join('\n') + '\n'

    const base = textFile(oldText)
    const compare = textFile(newText)

    const result0 = buildUnifiedDiffForStatus('modify', 'f.ts', base, compare, { context: 0 })
    const result999 = buildUnifiedDiffForStatus('modify', 'f.ts', base, compare, { context: 999 })

    // context=0 should be shorter (fewer lines)
    expect(result0!.length).toBeLessThan(result999!.length)
    // context=999 should include all lines
    expect(result999).toContain(' line1')
    expect(result999).toContain(' line10')
  })

  it('handles notFound on base side for modify', () => {
    const compare = textFile('new\n')
    const result = buildUnifiedDiffForStatus('modify', 'f.ts', notFoundFile, compare)

    // notFound base → treated as empty, so all compare lines are additions
    expect(result).not.toBeNull()
    expect(result).toContain('+new')
  })

  it('handles CRLF content through buildUnifiedDiffForStatus', () => {
    const base = textFile('same\r\nline\r\n')
    const compare = textFile('same\nchanged\n')
    const result = buildUnifiedDiffForStatus('modify', 'crlf.ts', base, compare)

    expect(result).not.toBeNull()
    expect(result).not.toContain('\r')
    // "same" should be unchanged context (CRLF normalized away)
    expect(result).toContain(' same')
    expect(result).toContain('-line')
    expect(result).toContain('+changed')
  })
})

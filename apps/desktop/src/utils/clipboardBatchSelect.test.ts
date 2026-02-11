import { describe, it, expect } from 'vitest'
import {
  normalizeClipboardPath,
  parseClipboardPathLines,
  resolveSelectablePaths,
} from './clipboardBatchSelect'

describe('clipboardBatchSelect', () => {
  it('parses newline-delimited paths and ignores blank lines', () => {
    const parsed = parseClipboardPathLines('\n src/App.tsx \n\nREADME.md\r\n')
    expect(parsed).toEqual(['src/App.tsx', 'README.md'])
  })

  it('normalizes absolute path inside repo to relative', () => {
    const result = normalizeClipboardPath('/Users/me/repo/src/App.tsx', '/Users/me/repo')
    expect(result).toBe('src/App.tsx')
  })

  it('normalizes windows separators for relative paths', () => {
    const result = normalizeClipboardPath('src\\components\\Tree.tsx', '/Users/me/repo')
    expect(result).toBe('src/components/Tree.tsx')
  })

  it('returns null for absolute path outside repo', () => {
    const result = normalizeClipboardPath('/Users/me/other-repo/src/App.tsx', '/Users/me/repo')
    expect(result).toBeNull()
  })

  it('resolves mixed input with inside and outside repo paths', () => {
    const selectableSet = new Set(['src/App.tsx', 'README.md'])
    const result = resolveSelectablePaths(
      ['src/App.tsx', '/Users/me/repo/README.md', '/Users/me/other/repo.ts'],
      '/Users/me/repo',
      selectableSet
    )

    expect(result.matched.sort()).toEqual(['README.md', 'src/App.tsx'])
    expect(result.invalidCount).toBe(0)
    expect(result.outsideRepoCount).toBe(1)
  })
})

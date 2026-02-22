import { describe, it, expect } from 'vitest'
import {
  normalizeClipboardPath,
  parseClipboardPathLines,
  resolveSelectablePaths,
} from './clipboardBatchSelect'

describe('clipboardBatchSelect', () => {
  // ── Existing tests ──────────────────────────────────────────────────

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

  // ── Windows drive letter paths ──────────────────────────────────────

  it('normalizes Windows drive letter absolute path to relative', () => {
    const result = normalizeClipboardPath(
      'C:\\Users\\me\\repo\\src\\App.tsx',
      'C:\\Users\\me\\repo'
    )
    expect(result).toBe('src/App.tsx')
  })

  it('handles case-insensitive matching for Windows drive letter paths', () => {
    // Drive letter case mismatch between path and repo root
    const result = normalizeClipboardPath(
      'c:\\users\\me\\repo\\src\\App.tsx',
      'C:\\Users\\Me\\Repo'
    )
    expect(result).toBe('src/App.tsx')
  })

  it('returns null for Windows drive letter path outside repo', () => {
    const result = normalizeClipboardPath(
      'D:\\other\\project\\file.ts',
      'C:\\Users\\me\\repo'
    )
    expect(result).toBeNull()
  })

  // ── UNC paths ───────────────────────────────────────────────────────

  it('normalizes UNC paths correctly', () => {
    const result = normalizeClipboardPath(
      '\\\\server\\share\\repo\\src\\file.ts',
      '\\\\server\\share\\repo'
    )
    expect(result).toBe('src/file.ts')
  })

  it('returns null for UNC path outside repo root', () => {
    const result = normalizeClipboardPath(
      '\\\\server\\share\\other\\file.ts',
      '\\\\server\\share\\repo'
    )
    expect(result).toBeNull()
  })

  // ── Trailing slashes ────────────────────────────────────────────────

  it('strips trailing slashes from repo root and paths', () => {
    const result = normalizeClipboardPath(
      '/Users/me/repo/src/dir/',
      '/Users/me/repo/'
    )
    // Trailing slash on directory is stripped, but normalize still produces relative path
    expect(result).toBe('src/dir')
  })

  // ── Whitespace and empty lines ──────────────────────────────────────

  it('filters whitespace-only lines in parseClipboardPathLines', () => {
    const parsed = parseClipboardPathLines('  \n\t\nsrc/file.ts\n   \n  \t  \n')
    expect(parsed).toEqual(['src/file.ts'])
  })

  // ── Duplicate paths ─────────────────────────────────────────────────

  it('deduplicates matched paths in resolveSelectablePaths', () => {
    const selectableSet = new Set(['src/App.tsx', 'README.md'])
    const result = resolveSelectablePaths(
      ['src/App.tsx', 'src/App.tsx', './src/App.tsx', 'src/App.tsx'],
      '/Users/me/repo',
      selectableSet
    )

    expect(result.matched).toEqual(['src/App.tsx'])
    expect(result.invalidCount).toBe(0)
    expect(result.outsideRepoCount).toBe(0)
  })

  // ── Special characters (spaces, unicode) ────────────────────────────

  it('handles paths with spaces and unicode characters', () => {
    const result = normalizeClipboardPath(
      '/Users/me/my repo/src/日本語 file.ts',
      '/Users/me/my repo'
    )
    expect(result).toBe('src/日本語 file.ts')
  })

  // ── Relative paths with ./ prefix ──────────────────────────────────

  it('resolves relative paths with ./ prefix', () => {
    const result = normalizeClipboardPath('./src/file.ts', '/Users/me/repo')
    expect(result).toBe('src/file.ts')
  })

  it('resolves relative paths with multiple ./ segments stripped', () => {
    const result = normalizeClipboardPath('.///src/file.ts', '/Users/me/repo')
    expect(result).toBe('src/file.ts')
  })

  // ── outsideRepoCount tracking ──────────────────────────────────────

  it('counts paths outside repo root correctly in resolveSelectablePaths', () => {
    const selectableSet = new Set(['src/App.tsx'])
    const result = resolveSelectablePaths(
      [
        '/other/project/file.ts',        // absolute, outside repo -> outsideRepoCount
        '/another/path/x.ts',            // absolute, outside repo -> outsideRepoCount
        'C:\\Other\\Project\\file.ts',    // Windows abs, outside repo -> outsideRepoCount
        'src/App.tsx',                    // valid match
        'nonexistent/file.ts',           // relative, not in selectable -> outsideRepoCount
      ],
      '/Users/me/repo',
      selectableSet
    )

    expect(result.matched).toEqual(['src/App.tsx'])
    expect(result.outsideRepoCount).toBe(4)
    expect(result.invalidCount).toBe(0)
  })

  // ── Edge: repo root itself is rejected ─────────────────────────────

  it('returns null when path equals repo root exactly', () => {
    const result = normalizeClipboardPath('/Users/me/repo', '/Users/me/repo')
    expect(result).toBeNull()
  })

  // ── Windows drive letter resolveSelectablePaths integration ────────

  it('resolves Windows drive letter paths end-to-end via resolveSelectablePaths', () => {
    const selectableSet = new Set(['src/App.tsx', 'lib/utils.ts'])
    const result = resolveSelectablePaths(
      [
        'C:\\Users\\me\\repo\\src\\App.tsx',
        'c:\\users\\me\\repo\\lib\\utils.ts', // different case
        'D:\\outside\\file.ts',               // outside repo
      ],
      'C:\\Users\\me\\repo',
      selectableSet
    )

    expect(result.matched.sort()).toEqual(['lib/utils.ts', 'src/App.tsx'])
    expect(result.outsideRepoCount).toBe(1)
    expect(result.invalidCount).toBe(0)
  })
})

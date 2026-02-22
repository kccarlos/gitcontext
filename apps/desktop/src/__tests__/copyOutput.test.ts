import { describe, it, expect } from 'vitest'
import type { FileTreeNode } from '@gitcontext/core'
import {
  generateFileTreeText,
  buildHeader,
  buildFileSection,
  buildCopyOutput,
} from '../utils/copyOutput'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReadResult(text: string) {
  return { binary: false, text, notFound: false }
}

function makeBinaryResult() {
  return { binary: true, text: null, notFound: false }
}

function makeNotFoundResult() {
  return { binary: false, text: null, notFound: true }
}

/**
 * Build a simple file tree for testing.
 */
function makeFileTree(): FileTreeNode {
  return {
    name: 'root',
    path: '',
    type: 'dir',
    children: [
      {
        name: 'src',
        path: 'src',
        type: 'dir',
        children: [
          { name: 'index.ts', path: 'src/index.ts', type: 'file', status: 'modify' },
          { name: 'utils.ts', path: 'src/utils.ts', type: 'file', status: 'add' },
        ],
      },
      { name: 'README.md', path: 'README.md', type: 'file', status: 'unchanged' },
      { name: 'logo.png', path: 'logo.png', type: 'file', status: 'add', isLikelyBinary: true },
    ],
  }
}

// ── Tests: buildHeader ──────────────────────────────────────────────────────

describe('buildHeader', () => {
  it('includes repo path, base/compare branches, and file count', () => {
    const header = buildHeader({
      baseBranch: 'main',
      compareBranch: 'feature',
      currentDir: '/home/user/project',
      fileCount: 3,
      userInstructions: '',
      fileTreeText: '',
    })

    expect(header).toContain('# Git Diff Context: main → feature')
    expect(header).toContain('Repository: /home/user/project')
    expect(header).toContain('Base: main')
    expect(header).toContain('Compare: feature')
    expect(header).toContain('Files: 3')
    expect(header).toContain('## Diffs')
  })

  it('includes user instructions in ## Instructions section when non-empty', () => {
    const header = buildHeader({
      baseBranch: 'main',
      compareBranch: 'dev',
      currentDir: '/repo',
      fileCount: 1,
      userInstructions: 'Please review these changes carefully.',
      fileTreeText: '',
    })

    expect(header).toContain('## Instructions')
    expect(header).toContain('Please review these changes carefully.')
  })

  it('omits ## Instructions section when instructions are empty or whitespace', () => {
    const header = buildHeader({
      baseBranch: 'main',
      compareBranch: 'dev',
      currentDir: '/repo',
      fileCount: 1,
      userInstructions: '   ',
      fileTreeText: '',
    })

    expect(header).not.toContain('## Instructions')
  })

  it('includes ## File Tree section when fileTreeText is provided', () => {
    const header = buildHeader({
      baseBranch: 'main',
      compareBranch: 'dev',
      currentDir: '/repo',
      fileCount: 2,
      userInstructions: '',
      fileTreeText: '```\n📦 Repository Structure\n\n📄 file.ts\n```\n',
    })

    expect(header).toContain('## File Tree')
    expect(header).toContain('📦 Repository Structure')
  })

  it('omits ## File Tree section when fileTreeText is empty', () => {
    const header = buildHeader({
      baseBranch: 'main',
      compareBranch: 'dev',
      currentDir: '/repo',
      fileCount: 1,
      userInstructions: '',
      fileTreeText: '',
    })

    expect(header).not.toContain('## File Tree')
  })

  it('shows Unknown when currentDir is empty', () => {
    const header = buildHeader({
      baseBranch: 'main',
      compareBranch: 'dev',
      currentDir: '',
      fileCount: 0,
      userInstructions: '',
      fileTreeText: '',
    })

    expect(header).toContain('Repository: Unknown')
  })
})

// ── Tests: generateFileTreeText ─────────────────────────────────────────────

describe('generateFileTreeText', () => {
  it('generates tree text for selected files only', () => {
    const tree = makeFileTree()
    const selected = new Set(['src/index.ts', 'src/utils.ts'])
    const text = generateFileTreeText(tree, selected)

    expect(text).toContain('📦 Repository Structure')
    expect(text).toContain('📁 src')
    expect(text).toContain('📄 index.ts [MODIFY]')
    expect(text).toContain('📄 utils.ts [ADD]')
    // README.md is not selected, should be absent
    expect(text).not.toContain('README.md')
  })

  it('excludes directories that contain no selected files', () => {
    const tree: FileTreeNode = {
      name: 'root',
      path: '',
      type: 'dir',
      children: [
        {
          name: 'src',
          path: 'src',
          type: 'dir',
          children: [
            { name: 'a.ts', path: 'src/a.ts', type: 'file', status: 'modify' },
          ],
        },
        {
          name: 'docs',
          path: 'docs',
          type: 'dir',
          children: [
            { name: 'guide.md', path: 'docs/guide.md', type: 'file', status: 'unchanged' },
          ],
        },
      ],
    }
    const selected = new Set(['src/a.ts'])
    const text = generateFileTreeText(tree, selected)

    expect(text).toContain('📁 src')
    expect(text).toContain('📄 a.ts')
    expect(text).not.toContain('docs')
    expect(text).not.toContain('guide.md')
  })

  it('wraps output in code fences', () => {
    const tree = makeFileTree()
    const selected = new Set(['src/index.ts'])
    const text = generateFileTreeText(tree, selected)

    expect(text).toMatch(/^```\n/)
    expect(text).toMatch(/\n```\n$/)
  })
})

// ── Tests: buildFileSection ─────────────────────────────────────────────────

describe('buildFileSection', () => {
  it('produces ```diff block for modified files', () => {
    const baseRes = makeReadResult('line1\nline2\nline3\n')
    const compareRes = makeReadResult('line1\nlineChanged\nline3\n')
    const section = buildFileSection('src/app.ts', 'modify', baseRes, compareRes, 3)

    expect(section).toContain('## FILE: src/app.ts (MODIFY)')
    expect(section).toContain('```diff')
    expect(section).toContain('--- a/src/app.ts')
    expect(section).toContain('+++ b/src/app.ts')
  })

  it('produces ``` block (full content) for added files with unlimited context', () => {
    const compareRes = makeReadResult('const x = 1;\nconst y = 2;\n')
    const section = buildFileSection(
      'src/new.ts',
      'add',
      undefined,
      compareRes,
      Number.MAX_SAFE_INTEGER,
    )

    expect(section).toContain('## FILE: src/new.ts (ADD)')
    // Full content in a plain code block (not a diff block)
    expect(section).toContain('```\nconst x = 1;\nconst y = 2;\n')
    expect(section).not.toContain('```diff')
  })

  it('produces ```diff block for added files with limited context', () => {
    const compareRes = makeReadResult('const x = 1;\nconst y = 2;\n')
    const section = buildFileSection('src/new.ts', 'add', undefined, compareRes, 3)

    expect(section).toContain('## FILE: src/new.ts (ADD)')
    expect(section).toContain('```diff')
    expect(section).toContain('+const x = 1;')
  })

  it('produces diff block for removed files', () => {
    const baseRes = makeReadResult('old content\n')
    const section = buildFileSection('src/old.ts', 'remove', baseRes, undefined, 3)

    expect(section).toContain('## FILE: src/old.ts (REMOVE)')
    expect(section).toContain('```diff')
    expect(section).toContain('-old content')
  })

  it('shows [Binary file] placeholder for binary file paths (extension-based)', () => {
    const section = buildFileSection(
      'assets/logo.png',
      'add',
      undefined,
      makeReadResult(''),
      3,
    )

    expect(section).toContain('## FILE: assets/logo.png (ADD)')
    expect(section).toContain('[Binary file]')
    expect(section).not.toContain('```diff')
  })

  it('shows [Binary file] for files detected as binary by content (binary flag)', () => {
    const section = buildFileSection(
      'data/file.dat',
      'modify',
      makeBinaryResult(),
      makeBinaryResult(),
      3,
    )

    expect(section).toContain('## FILE: data/file.dat (MODIFY)')
    expect(section).toContain('[Binary file]')
  })

  it('produces full content block for unchanged files', () => {
    const baseRes = makeReadResult('unchanged content here\n')
    const section = buildFileSection(
      'config.json',
      'unchanged',
      baseRes,
      undefined,
      3,
    )

    expect(section).toContain('## FILE: config.json (UNCHANGED)')
    expect(section).toContain('```\nunchanged content here\n')
  })

  it('returns empty string for unchanged file with notFound base', () => {
    const section = buildFileSection(
      'missing.ts',
      'unchanged',
      makeNotFoundResult(),
      undefined,
      3,
    )

    expect(section).toBe('')
  })

  it('context lines setting affects diff output length', () => {
    // Create content with many lines where only one changes
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
    const oldLines = [...lines]
    const newLines = [...lines]
    newLines[10] = 'CHANGED LINE 11'

    const baseRes = makeReadResult(oldLines.join('\n') + '\n')
    const compareRes = makeReadResult(newLines.join('\n') + '\n')

    const withCtx0 = buildFileSection('file.ts', 'modify', baseRes, compareRes, 0)
    const withCtx3 = buildFileSection('file.ts', 'modify', baseRes, compareRes, 3)
    const withCtxMax = buildFileSection(
      'file.ts',
      'modify',
      baseRes,
      compareRes,
      Number.MAX_SAFE_INTEGER,
    )

    // More context = longer output
    expect(withCtx0.length).toBeLessThan(withCtx3.length)
    expect(withCtx3.length).toBeLessThan(withCtxMax.length)
  })
})

// ── Tests: buildCopyOutput (full assembly) ──────────────────────────────────

describe('buildCopyOutput', () => {
  it('concatenates header and multiple file sections in order', () => {
    const params = {
      baseBranch: 'main',
      compareBranch: 'feature',
      currentDir: '/repo',
      paths: ['a.ts', 'b.ts'],
      statusByPath: new Map([
        ['a.ts', 'modify' as const],
        ['b.ts', 'add' as const],
      ]),
      userInstructions: '',
      includeFileTree: false,
      fileTree: null,
      selectedPaths: new Set(['a.ts', 'b.ts']),
      diffContextLines: 3,
    }

    const fileResults = [
      { path: 'a.ts', section: '## FILE: a.ts (MODIFY)\n\ncontent-a\n\n' },
      { path: 'b.ts', section: '## FILE: b.ts (ADD)\n\ncontent-b\n\n' },
    ]

    const output = buildCopyOutput(params, fileResults)

    // Header comes first
    expect(output).toMatch(/^# Git Diff Context/)
    // Files come after header in order
    const aIndex = output.indexOf('## FILE: a.ts')
    const bIndex = output.indexOf('## FILE: b.ts')
    expect(aIndex).toBeGreaterThan(-1)
    expect(bIndex).toBeGreaterThan(aIndex)
  })

  it('includes file tree when includeFileTree is true and tree exists', () => {
    const tree = makeFileTree()
    const params = {
      baseBranch: 'main',
      compareBranch: 'dev',
      currentDir: '/repo',
      paths: ['src/index.ts'],
      statusByPath: new Map([['src/index.ts', 'modify' as const]]),
      userInstructions: '',
      includeFileTree: true,
      fileTree: tree,
      selectedPaths: new Set(['src/index.ts']),
      diffContextLines: 3,
    }

    const output = buildCopyOutput(params, [
      { path: 'src/index.ts', section: '## FILE: src/index.ts (MODIFY)\n\ndiff\n\n' },
    ])

    expect(output).toContain('## File Tree')
    expect(output).toContain('📦 Repository Structure')
    expect(output).toContain('📄 index.ts')
  })

  it('omits file tree when includeFileTree is false', () => {
    const tree = makeFileTree()
    const params = {
      baseBranch: 'main',
      compareBranch: 'dev',
      currentDir: '/repo',
      paths: ['src/index.ts'],
      statusByPath: new Map([['src/index.ts', 'modify' as const]]),
      userInstructions: '',
      includeFileTree: false,
      fileTree: tree,
      selectedPaths: new Set(['src/index.ts']),
      diffContextLines: 3,
    }

    const output = buildCopyOutput(params, [
      { path: 'src/index.ts', section: '## FILE: src/index.ts (MODIFY)\n\ndiff\n\n' },
    ])

    expect(output).not.toContain('## File Tree')
  })

  it('includes instructions when userInstructions is non-empty', () => {
    const params = {
      baseBranch: 'main',
      compareBranch: 'dev',
      currentDir: '/repo',
      paths: ['a.ts'],
      statusByPath: new Map<string, any>(),
      userInstructions: 'Focus on security implications.',
      includeFileTree: false,
      fileTree: null,
      selectedPaths: new Set(['a.ts']),
      diffContextLines: 3,
    }

    const output = buildCopyOutput(params, [])

    expect(output).toContain('## Instructions')
    expect(output).toContain('Focus on security implications.')
  })
})

// ── Tests: includeBinaryAsPaths behavior ────────────────────────────────────

describe('binary file handling in output', () => {
  it('binary files by extension produce [Binary file] placeholder with path in header', () => {
    const section = buildFileSection('images/icon.png', 'add', undefined, undefined, 3)

    expect(section).toContain('## FILE: images/icon.png (ADD)')
    expect(section).toContain('[Binary file]')
  })

  it('binary files by content flag produce [Binary file] placeholder', () => {
    const section = buildFileSection(
      'data/blob',
      'modify',
      makeBinaryResult(),
      makeReadResult('text'),
      3,
    )

    expect(section).toContain('## FILE: data/blob (MODIFY)')
    expect(section).toContain('[Binary file]')
  })

  it('non-binary file with .dat extension is not treated as binary', () => {
    // .dat is not in BINARY_EXTS
    const section = buildFileSection(
      'data/output.dat',
      'modify',
      makeReadResult('old\n'),
      makeReadResult('new\n'),
      3,
    )

    expect(section).not.toContain('[Binary file]')
    expect(section).toContain('```diff')
  })
})

// ── Tests: end-to-end output format ─────────────────────────────────────────

describe('end-to-end output format', () => {
  it('matches the expected markdown structure for a realistic scenario', () => {
    const tree: FileTreeNode = {
      name: 'root',
      path: '',
      type: 'dir',
      children: [
        { name: 'app.ts', path: 'app.ts', type: 'file', status: 'modify' },
        { name: 'new.ts', path: 'new.ts', type: 'file', status: 'add' },
      ],
    }

    const params = {
      baseBranch: 'main',
      compareBranch: 'feature-x',
      currentDir: '/home/dev/myrepo',
      paths: ['app.ts', 'new.ts'],
      statusByPath: new Map([
        ['app.ts', 'modify' as const],
        ['new.ts', 'add' as const],
      ]),
      userInstructions: 'Review these changes.',
      includeFileTree: true,
      fileTree: tree,
      selectedPaths: new Set(['app.ts', 'new.ts']),
      diffContextLines: 3,
    }

    // Simulate what the caller would build using buildFileSection
    const appSection = buildFileSection(
      'app.ts',
      'modify',
      makeReadResult('const a = 1;\n'),
      makeReadResult('const a = 2;\n'),
      3,
    )
    const newSection = buildFileSection(
      'new.ts',
      'add',
      undefined,
      makeReadResult('export const b = true;\n'),
      3,
    )

    const output = buildCopyOutput(params, [
      { path: 'app.ts', section: appSection },
      { path: 'new.ts', section: newSection },
    ])

    // Verify overall structure ordering
    const headerIdx = output.indexOf('# Git Diff Context')
    const instrIdx = output.indexOf('## Instructions')
    const treeIdx = output.indexOf('## File Tree')
    const diffsIdx = output.indexOf('## Diffs')
    const file1Idx = output.indexOf('## FILE: app.ts')
    const file2Idx = output.indexOf('## FILE: new.ts')

    expect(headerIdx).toBe(0)
    expect(instrIdx).toBeGreaterThan(headerIdx)
    expect(treeIdx).toBeGreaterThan(instrIdx)
    expect(diffsIdx).toBeGreaterThan(treeIdx)
    expect(file1Idx).toBeGreaterThan(diffsIdx)
    expect(file2Idx).toBeGreaterThan(file1Idx)

    // Verify specific content
    expect(output).toContain('Repository: /home/dev/myrepo')
    expect(output).toContain('Files: 2')
    expect(output).toContain('Review these changes.')
    expect(output).toContain('📄 app.ts [MODIFY]')
    expect(output).toContain('📄 new.ts [ADD]')
    expect(output).toContain('```diff')
    expect(output).toContain('-const a = 1;')
    expect(output).toContain('+const a = 2;')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectedFilesPanel } from './SelectedFilesPanel'
import type { FileDiffStatus } from '@gitcontext/core'

// Mock the TokenCountsContext module
const mockCounts = new Map<string, number>()
const mockContextValue = {
  counts: mockCounts,
  total: 0,
  busy: false,
  progress: { completed: 0, total: 0, percent: 0 },
}

vi.mock('../context/TokenCountsContext', () => ({
  useTokenCountsContext: () => mockContextValue,
}))

function makeProps(overrides: Partial<Parameters<typeof SelectedFilesPanel>[0]> = {}) {
  return {
    selectedPaths: new Set<string>(),
    statusByPath: new Map<string, FileDiffStatus>(),
    onUnselect: vi.fn(),
    onPreview: vi.fn(),
    ...overrides,
  }
}

describe('SelectedFilesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCounts.clear()
    mockContextValue.counts = mockCounts
    mockContextValue.total = 0
    mockContextValue.busy = false
    mockContextValue.progress = { completed: 0, total: 0, percent: 0 }
  })

  it('renders list of selected files with correct status icons', () => {
    const selectedPaths = new Set(['src/app.ts', 'src/new.ts', 'src/old.ts', 'src/readme.md'])
    const statusByPath = new Map<string, FileDiffStatus>([
      ['src/app.ts', 'modify'],
      ['src/new.ts', 'add'],
      ['src/old.ts', 'remove'],
      ['src/readme.md', 'unchanged'],
    ])
    mockCounts.set('src/app.ts', 100)
    mockCounts.set('src/new.ts', 50)
    mockCounts.set('src/old.ts', 75)
    mockCounts.set('src/readme.md', 25)
    mockContextValue.total = 250

    render(<SelectedFilesPanel {...makeProps({ selectedPaths, statusByPath })} />)

    // Verify all files are rendered
    expect(screen.getByText('app.ts')).toBeInTheDocument()
    expect(screen.getByText('new.ts')).toBeInTheDocument()
    expect(screen.getByText('old.ts')).toBeInTheDocument()
    expect(screen.getByText('readme.md')).toBeInTheDocument()

    // Verify status icons via aria-labels
    expect(screen.getByLabelText('Modified')).toBeInTheDocument()
    expect(screen.getByLabelText('Added')).toBeInTheDocument()
    expect(screen.getByLabelText('Removed')).toBeInTheDocument()
    expect(screen.getByLabelText('Unchanged')).toBeInTheDocument()
  })

  it('sorts by tokens high-to-low by default', () => {
    const selectedPaths = new Set(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([
      ['src/a.ts', 'modify'],
      ['src/b.ts', 'add'],
      ['src/c.ts', 'modify'],
    ])
    mockCounts.set('src/a.ts', 10)
    mockCounts.set('src/b.ts', 300)
    mockCounts.set('src/c.ts', 50)

    render(<SelectedFilesPanel {...makeProps({ selectedPaths, statusByPath })} />)

    const rows = screen.getAllByText(/\.(ts)$/)
    // Default sort is tokens-desc: b.ts (300), c.ts (50), a.ts (10)
    expect(rows[0].textContent).toBe('b.ts')
    expect(rows[1].textContent).toBe('c.ts')
    expect(rows[2].textContent).toBe('a.ts')
  })

  it('sorts by tokens low-to-high when sort mode is changed', async () => {
    const user = userEvent.setup()
    const selectedPaths = new Set(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([
      ['src/a.ts', 'modify'],
      ['src/b.ts', 'add'],
      ['src/c.ts', 'modify'],
    ])
    mockCounts.set('src/a.ts', 10)
    mockCounts.set('src/b.ts', 300)
    mockCounts.set('src/c.ts', 50)

    render(<SelectedFilesPanel {...makeProps({ selectedPaths, statusByPath })} />)

    const sortSelect = screen.getByTitle('Sort by')
    await user.selectOptions(sortSelect, 'tokens-asc')

    const rows = screen.getAllByText(/\.(ts)$/)
    // tokens-asc: a.ts (10), c.ts (50), b.ts (300)
    expect(rows[0].textContent).toBe('a.ts')
    expect(rows[1].textContent).toBe('c.ts')
    expect(rows[2].textContent).toBe('b.ts')
  })

  it('sorts by name A-Z and Z-A when sort mode is changed', async () => {
    const user = userEvent.setup()
    const selectedPaths = new Set(['src/charlie.ts', 'src/alpha.ts', 'src/bravo.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([
      ['src/charlie.ts', 'modify'],
      ['src/alpha.ts', 'add'],
      ['src/bravo.ts', 'modify'],
    ])
    mockCounts.set('src/charlie.ts', 10)
    mockCounts.set('src/alpha.ts', 10)
    mockCounts.set('src/bravo.ts', 10)

    render(<SelectedFilesPanel {...makeProps({ selectedPaths, statusByPath })} />)

    const sortSelect = screen.getByTitle('Sort by')

    // Sort A-Z
    await user.selectOptions(sortSelect, 'name-asc')
    let rows = screen.getAllByText(/\.(ts)$/)
    expect(rows[0].textContent).toBe('alpha.ts')
    expect(rows[1].textContent).toBe('bravo.ts')
    expect(rows[2].textContent).toBe('charlie.ts')

    // Sort Z-A
    await user.selectOptions(sortSelect, 'name-desc')
    rows = screen.getAllByText(/\.(ts)$/)
    expect(rows[0].textContent).toBe('charlie.ts')
    expect(rows[1].textContent).toBe('bravo.ts')
    expect(rows[2].textContent).toBe('alpha.ts')
  })

  it('binary files show binary indicator and preview button is disabled', () => {
    const selectedPaths = new Set(['assets/logo.png', 'src/app.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([
      ['assets/logo.png', 'add'],
      ['src/app.ts', 'modify'],
    ])
    mockCounts.set('assets/logo.png', 5)
    mockCounts.set('src/app.ts', 100)

    render(<SelectedFilesPanel {...makeProps({ selectedPaths, statusByPath })} />)

    // Binary file should have the binary indicator
    expect(screen.getByLabelText('Binary file')).toBeInTheDocument()

    // Find all preview buttons
    const previewButtons = screen.getAllByLabelText('Preview')
    // The binary file's preview button should be disabled
    // logo.png is binary -> its preview button is disabled
    const disabledButtons = previewButtons.filter((btn) => (btn as HTMLButtonElement).disabled)
    const enabledButtons = previewButtons.filter((btn) => !(btn as HTMLButtonElement).disabled)
    expect(disabledButtons).toHaveLength(1)
    expect(enabledButtons).toHaveLength(1)
  })

  it('clicking remove calls onUnselect with correct path', async () => {
    const user = userEvent.setup()
    const onUnselect = vi.fn()
    const selectedPaths = new Set(['src/file1.ts', 'src/file2.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([
      ['src/file1.ts', 'modify'],
      ['src/file2.ts', 'add'],
    ])
    mockCounts.set('src/file1.ts', 100)
    mockCounts.set('src/file2.ts', 50)

    render(<SelectedFilesPanel {...makeProps({ selectedPaths, statusByPath, onUnselect })} />)

    // Find remove buttons by title
    const removeButtons = screen.getAllByTitle('Remove from selection')
    expect(removeButtons).toHaveLength(2)

    // Click the first remove button (tokens-desc default: file1.ts=100 first)
    await user.click(removeButtons[0])
    expect(onUnselect).toHaveBeenCalledWith('src/file1.ts')
  })

  it('clicking reveal calls onReveal with correct path', async () => {
    const user = userEvent.setup()
    const onReveal = vi.fn()
    const selectedPaths = new Set(['src/target.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([
      ['src/target.ts', 'modify'],
    ])
    mockCounts.set('src/target.ts', 42)

    render(<SelectedFilesPanel {...makeProps({ selectedPaths, statusByPath, onReveal })} />)

    const revealButton = screen.getByLabelText('Reveal in tree')
    await user.click(revealButton)
    expect(onReveal).toHaveBeenCalledWith('src/target.ts')
  })

  it('clicking preview calls onPreview with path and status', async () => {
    const user = userEvent.setup()
    const onPreview = vi.fn()
    const selectedPaths = new Set(['src/modified.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([
      ['src/modified.ts', 'modify'],
    ])
    mockCounts.set('src/modified.ts', 200)

    render(<SelectedFilesPanel {...makeProps({ selectedPaths, statusByPath, onPreview })} />)

    const previewButton = screen.getByLabelText('Preview')
    await user.click(previewButton)
    expect(onPreview).toHaveBeenCalledWith('src/modified.ts', 'modify')
  })

  it('empty selection shows empty state message', () => {
    render(<SelectedFilesPanel {...makeProps()} />)

    expect(screen.getByText('No Files Selected')).toBeInTheDocument()
    expect(screen.getByText(/Select files from the tree/)).toBeInTheDocument()
  })

  it('refreshing state shows recalculating indicator', () => {
    render(<SelectedFilesPanel {...makeProps({ refreshing: true })} />)

    expect(screen.getByText('Recalculating…')).toBeInTheDocument()
  })

  it('busy context state shows recalculating indicator', () => {
    mockContextValue.busy = true

    render(<SelectedFilesPanel {...makeProps()} />)

    expect(screen.getByText('Recalculating…')).toBeInTheDocument()
  })

  it('reveal button not rendered when onReveal is not provided', () => {
    const selectedPaths = new Set(['src/file.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([
      ['src/file.ts', 'modify'],
    ])
    mockCounts.set('src/file.ts', 10)

    render(<SelectedFilesPanel {...makeProps({ selectedPaths, statusByPath })} />)

    expect(screen.queryByLabelText('Reveal in tree')).not.toBeInTheDocument()
  })

  it('displays token counts formatted with locale string', () => {
    const selectedPaths = new Set(['src/big.ts'])
    const statusByPath = new Map<string, FileDiffStatus>([
      ['src/big.ts', 'modify'],
    ])
    mockCounts.set('src/big.ts', 12345)

    render(<SelectedFilesPanel {...makeProps({ selectedPaths, statusByPath })} />)

    // toLocaleString() will format 12345 as "12,345" in en-US
    expect(screen.getByText('12,345')).toBeInTheDocument()
  })
})

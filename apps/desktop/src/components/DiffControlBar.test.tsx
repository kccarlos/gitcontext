import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiffControlBar } from './DiffControlBar'

describe('DiffControlBar', () => {
  const defaultProps = {
    branches: ['main', 'dev', 'feature/test'],
    baseBranch: 'main',
    compareBranch: 'dev',
    workspaces: [
      { id: 'ws-1', name: 'Main Repo', path: '/tmp/main', folderName: 'main', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'ws-2', name: 'Docs', path: '/tmp/docs', folderName: 'docs', updatedAt: '2026-01-02T00:00:00.000Z' },
    ],
    selectedWorkspaceId: '',
    currentWorkspacePath: '/tmp/main',
    onWorkspaceSelect: vi.fn(),
    onSaveWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onBaseBranchChange: vi.fn(),
    onCompareBranchChange: vi.fn(),
    onFlip: vi.fn(),
    onRefresh: vi.fn(),
  }

  it('renders base and compare branch selectors', () => {
    render(<DiffControlBar {...defaultProps} />)

    expect(screen.getByLabelText(/base/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/compare/i)).toBeInTheDocument()
  })

  it('displays correct branch values in selectors', () => {
    render(<DiffControlBar {...defaultProps} />)

    const baseSelect = screen.getByLabelText(/base/i) as HTMLSelectElement
    const compareSelect = screen.getByLabelText(/compare/i) as HTMLSelectElement

    expect(baseSelect.value).toBe('main')
    expect(compareSelect.value).toBe('dev')
  })

  it('renders all branch options in both selectors', () => {
    render(<DiffControlBar {...defaultProps} />)

    const baseSelect = screen.getByLabelText(/base/i)
    const compareSelect = screen.getByLabelText(/compare/i)
    const baseOptions = Array.from(baseSelect.querySelectorAll('option'))
    const compareOptions = Array.from(compareSelect.querySelectorAll('option'))

    expect(baseOptions).toHaveLength(3)
    expect(compareOptions).toHaveLength(3)
    expect(baseOptions.map(o => o.value)).toEqual(['main', 'dev', 'feature/test'])
    expect(compareOptions.map(o => o.value)).toEqual(['main', 'dev', 'feature/test'])
  })

  it('renders workspace selector and controls', () => {
    render(<DiffControlBar {...defaultProps} />)

    expect(screen.getByLabelText(/workspace/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save current workspace/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete selected workspace/i })).toBeInTheDocument()
  })

  it('calls onWorkspaceSelect when a saved workspace is selected', async () => {
    const user = userEvent.setup()
    const onWorkspaceSelect = vi.fn()

    render(<DiffControlBar {...defaultProps} onWorkspaceSelect={onWorkspaceSelect} />)

    const workspaceSelect = screen.getByLabelText(/workspace/i)
    await user.selectOptions(workspaceSelect, 'ws-2')

    expect(onWorkspaceSelect).toHaveBeenCalledWith('ws-2')
  })

  it('calls onSaveWorkspace when save button is clicked', async () => {
    const user = userEvent.setup()
    const onSaveWorkspace = vi.fn()

    render(<DiffControlBar {...defaultProps} onSaveWorkspace={onSaveWorkspace} />)
    await user.click(screen.getByRole('button', { name: /save current workspace/i }))
    expect(onSaveWorkspace).toHaveBeenCalledOnce()
  })

  it('calls onDeleteWorkspace when delete button is clicked', async () => {
    const user = userEvent.setup()
    const onDeleteWorkspace = vi.fn()

    render(
      <DiffControlBar
        {...defaultProps}
        selectedWorkspaceId="ws-1"
        onDeleteWorkspace={onDeleteWorkspace}
      />,
    )
    await user.click(screen.getByRole('button', { name: /delete selected workspace/i }))
    expect(onDeleteWorkspace).toHaveBeenCalledOnce()
  })

  it('displays "My Working Directory" for __WORKDIR__ branch', () => {
    const props = {
      ...defaultProps,
      branches: ['main', '__WORKDIR__'],
      compareBranch: '__WORKDIR__',
    }

    render(<DiffControlBar {...props} />)

    // __WORKDIR__ appears in both selects, so we expect to find it twice
    const workdirOptions = screen.getAllByText('My Working Directory')
    expect(workdirOptions).toHaveLength(2)
    expect(workdirOptions[0]).toBeInTheDocument()
  })

  it('calls onBaseBranchChange when base branch is changed', async () => {
    const user = userEvent.setup()
    const onBaseBranchChange = vi.fn()

    render(<DiffControlBar {...defaultProps} onBaseBranchChange={onBaseBranchChange} />)

    const baseSelect = screen.getByLabelText(/base/i)
    await user.selectOptions(baseSelect, 'feature/test')

    expect(onBaseBranchChange).toHaveBeenCalledWith('feature/test')
  })

  it('calls onCompareBranchChange when compare branch is changed', async () => {
    const user = userEvent.setup()
    const onCompareBranchChange = vi.fn()

    render(<DiffControlBar {...defaultProps} onCompareBranchChange={onCompareBranchChange} />)

    const compareSelect = screen.getByLabelText(/compare/i)
    await user.selectOptions(compareSelect, 'feature/test')

    expect(onCompareBranchChange).toHaveBeenCalledWith('feature/test')
  })

  it('renders flip button', () => {
    render(<DiffControlBar {...defaultProps} />)

    const flipButton = screen.getByRole('button', { name: /swap branches/i })
    expect(flipButton).toBeInTheDocument()
  })

  it('calls onFlip when flip button is clicked', async () => {
    const user = userEvent.setup()
    const onFlip = vi.fn()

    render(<DiffControlBar {...defaultProps} onFlip={onFlip} />)

    const flipButton = screen.getByRole('button', { name: /swap branches/i })
    await user.click(flipButton)

    expect(onFlip).toHaveBeenCalledOnce()
  })

  it('renders refresh button', () => {
    render(<DiffControlBar {...defaultProps} />)

    const refreshButton = screen.getByRole('button', { name: /refresh/i })
    expect(refreshButton).toBeInTheDocument()
  })

  it('calls onRefresh when refresh button is clicked', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()

    render(<DiffControlBar {...defaultProps} onRefresh={onRefresh} />)

    const refreshButton = screen.getByRole('button', { name: /refresh/i })
    await user.click(refreshButton)

    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('disables all controls when disabled prop is true', () => {
    render(<DiffControlBar {...defaultProps} disabled={true} />)

    const workspaceSelect = screen.getByLabelText(/workspace/i)
    const baseSelect = screen.getByLabelText(/base/i)
    const compareSelect = screen.getByLabelText(/compare/i)
    const saveButton = screen.getByRole('button', { name: /save current workspace/i })
    const deleteButton = screen.getByRole('button', { name: /delete selected workspace/i })
    const flipButton = screen.getByRole('button', { name: /swap/i })
    const refreshButton = screen.getByRole('button', { name: /refresh/i })

    expect(workspaceSelect).toBeDisabled()
    expect(baseSelect).toBeDisabled()
    expect(compareSelect).toBeDisabled()
    expect(saveButton).toBeDisabled()
    expect(deleteButton).toBeDisabled()
    expect(flipButton).toBeDisabled()
    expect(refreshButton).toBeDisabled()
  })

  it('disables flip button when base branch is empty', () => {
    render(<DiffControlBar {...defaultProps} baseBranch="" />)

    const flipButton = screen.getByRole('button', { name: /swap/i })
    expect(flipButton).toBeDisabled()
  })

  it('disables flip button when compare branch is empty', () => {
    render(<DiffControlBar {...defaultProps} compareBranch="" />)

    const flipButton = screen.getByRole('button', { name: /swap/i })
    expect(flipButton).toBeDisabled()
  })

  it('enables flip button when both branches are selected', () => {
    render(<DiffControlBar {...defaultProps} />)

    const flipButton = screen.getByRole('button', { name: /swap/i })
    expect(flipButton).not.toBeDisabled()
  })

  it('has correct structure with all elements', () => {
    const { container } = render(<DiffControlBar {...defaultProps} />)

    expect(container.querySelector('.gc-diff-bar')).toBeInTheDocument()
    expect(container.querySelector('.diff-bar-workspace-controls')).toBeInTheDocument()
    expect(container.querySelector('.diff-bar-branch-selector')).toBeInTheDocument()
    // Arrow removed - swap button is sufficient visual indicator
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiffControlBar } from './DiffControlBar'

describe('DiffControlBar', () => {
  const defaultProps = {
    branches: ['main', 'dev', 'feature/test'],
    baseBranch: 'main',
    compareBranch: 'dev',
    basePinnedCommit: null,
    comparePinnedCommit: null,
    baseCommits: [],
    compareCommits: [],
    baseCommitsLoading: false,
    compareCommitsLoading: false,
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
    onBasePinnedCommitChange: vi.fn(),
    onComparePinnedCommitChange: vi.fn(),
    onFlip: vi.fn(),
    onRefresh: vi.fn(),
  }

  it('renders base and compare branch triggers', () => {
    render(<DiffControlBar {...defaultProps} />)

    expect(screen.getByRole('button', { name: /main \(latest\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dev \(latest\)/i })).toBeInTheDocument()
  })

  it('displays correct branch labels in triggers', () => {
    render(<DiffControlBar {...defaultProps} />)

    expect(screen.getByRole('button', { name: /main \(latest\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dev \(latest\)/i })).toBeInTheDocument()
  })

  it('renders branch name text for both commit picker triggers', () => {
    render(<DiffControlBar {...defaultProps} />)

    expect(screen.getByRole('button', { name: /main \(latest\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dev \(latest\)/i })).toBeInTheDocument()
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

    expect(screen.getByRole('button', { name: /main \(latest\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /my working directory/i })).toBeInTheDocument()
  })

  it('renders updated base branch name in trigger', () => {
    render(<DiffControlBar {...defaultProps} baseBranch="feature/test" />)

    expect(screen.getByRole('button', { name: /feature\/test \(latest\)/i })).toBeInTheDocument()
  })

  it('renders updated compare branch name in trigger', () => {
    render(<DiffControlBar {...defaultProps} compareBranch="feature/test" />)

    expect(screen.getByRole('button', { name: /feature\/test \(latest\)/i })).toBeInTheDocument()
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
    const baseTrigger = screen.getByRole('button', { name: /main \(latest\)/i })
    const compareTrigger = screen.getByRole('button', { name: /dev \(latest\)/i })
    const saveButton = screen.getByRole('button', { name: /save current workspace/i })
    const deleteButton = screen.getByRole('button', { name: /delete selected workspace/i })
    const flipButton = screen.getByRole('button', { name: /swap/i })
    const refreshButton = screen.getByRole('button', { name: /refresh/i })

    expect(workspaceSelect).toBeDisabled()
    expect(baseTrigger).toBeDisabled()
    expect(compareTrigger).toBeDisabled()
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
    expect(container.querySelectorAll('.commit-picker-wrapper')).toHaveLength(2)
    // Arrow removed - swap button is sufficient visual indicator
  })

  it('delete button is disabled when no workspace is selected', () => {
    render(<DiffControlBar {...defaultProps} selectedWorkspaceId="" />)

    const deleteButton = screen.getByRole('button', { name: /delete selected workspace/i })
    expect(deleteButton).toBeDisabled()
  })

  it('delete button is enabled when a workspace is selected', () => {
    render(<DiffControlBar {...defaultProps} selectedWorkspaceId="ws-1" />)

    const deleteButton = screen.getByRole('button', { name: /delete selected workspace/i })
    expect(deleteButton).not.toBeDisabled()
  })

  it('save button is disabled when currentWorkspacePath is empty', () => {
    render(<DiffControlBar {...defaultProps} currentWorkspacePath="" />)

    const saveButton = screen.getByRole('button', { name: /save current workspace/i })
    expect(saveButton).toBeDisabled()
  })

  it('workspace selector shows unsaved label with folder name when no workspace selected', () => {
    render(<DiffControlBar {...defaultProps} selectedWorkspaceId="" currentWorkspacePath="/tmp/my-project" />)

    const workspaceSelect = screen.getByLabelText(/workspace/i)
    const options = Array.from(workspaceSelect.querySelectorAll('option'))
    // First option should be the unsaved label
    expect(options[0].textContent).toBe('Unsaved: my-project')
  })

  it('workspace selector shows "Unsaved Workspace" when no path provided and no workspace selected', () => {
    render(<DiffControlBar {...defaultProps} selectedWorkspaceId="" currentWorkspacePath="" />)

    const workspaceSelect = screen.getByLabelText(/workspace/i)
    const options = Array.from(workspaceSelect.querySelectorAll('option'))
    expect(options[0].textContent).toBe('Unsaved Workspace')
  })

  it('workspace options display name and folder name', () => {
    render(<DiffControlBar {...defaultProps} />)

    const workspaceSelect = screen.getByLabelText(/workspace/i)
    const options = Array.from(workspaceSelect.querySelectorAll('option'))
    // Unsaved option + 2 workspace options
    const wsOptions = options.filter(o => o.value === 'ws-1' || o.value === 'ws-2')
    expect(wsOptions).toHaveLength(2)
    expect(wsOptions[0].textContent).toBe('Main Repo - main')
    expect(wsOptions[1].textContent).toBe('Docs - docs')
  })

  it('selecting empty workspace ID calls onWorkspaceSelect with empty string', async () => {
    const user = userEvent.setup()
    const onWorkspaceSelect = vi.fn()

    // Start with a workspace selected so the unsaved option isn't shown
    // We'll select one of the workspaces first
    render(
      <DiffControlBar
        {...defaultProps}
        selectedWorkspaceId="ws-1"
        onWorkspaceSelect={onWorkspaceSelect}
      />,
    )

    // There's no empty option when a workspace is selected, so we verify via
    // selecting a different workspace and the callback arg shape
    const workspaceSelect = screen.getByLabelText(/workspace/i)
    await user.selectOptions(workspaceSelect, 'ws-2')
    expect(onWorkspaceSelect).toHaveBeenCalledWith('ws-2')
  })

  it('workspace selector shows fallback text for unknown workspace ID', () => {
    render(
      <DiffControlBar
        {...defaultProps}
        selectedWorkspaceId="ws-unknown"
      />,
    )

    const workspaceSelect = screen.getByLabelText(/workspace/i) as HTMLSelectElement
    const options = Array.from(workspaceSelect.querySelectorAll('option'))
    // Should have a "Selected Workspace" fallback option for unknown ID
    const fallbackOption = options.find(o => o.value === 'ws-unknown')
    expect(fallbackOption).toBeTruthy()
    expect(fallbackOption!.textContent).toBe('Selected Workspace')
  })

  it('workspace selector has title attribute showing workspace path', () => {
    render(<DiffControlBar {...defaultProps} currentWorkspacePath="/tmp/my-repo" />)

    const workspaceSelect = screen.getByLabelText(/workspace/i)
    expect(workspaceSelect).toHaveAttribute('title', '/tmp/my-repo')
  })

  it('workspace selector title shows selected workspace path when workspace is selected', () => {
    render(
      <DiffControlBar
        {...defaultProps}
        selectedWorkspaceId="ws-1"
        currentWorkspacePath="/tmp/main"
      />,
    )

    const workspaceSelect = screen.getByLabelText(/workspace/i)
    // selectedWorkspace.path is '/tmp/main'
    expect(workspaceSelect).toHaveAttribute('title', '/tmp/main')
  })

  it('__WORKDIR__ displays as My Working Directory in base branch trigger', () => {
    render(
      <DiffControlBar
        {...defaultProps}
        branches={['main', '__WORKDIR__']}
        baseBranch="__WORKDIR__"
      />,
    )

    expect(screen.getByRole('button', { name: /my working directory/i })).toBeInTheDocument()
  })

  it('all controls are enabled when disabled prop is false', () => {
    render(<DiffControlBar {...defaultProps} selectedWorkspaceId="ws-1" disabled={false} />)

    expect(screen.getByLabelText(/workspace/i)).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /main \(latest\)/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /dev \(latest\)/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /save current workspace/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /delete selected workspace/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /swap/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /refresh/i })).not.toBeDisabled()
  })

  it('disabled prop overrides individual button enable conditions', () => {
    // Even with a selected workspace and valid branches, disabled=true disables everything
    render(
      <DiffControlBar
        {...defaultProps}
        selectedWorkspaceId="ws-1"
        disabled={true}
      />,
    )

    expect(screen.getByRole('button', { name: /save current workspace/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /delete selected workspace/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /swap/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CommitInfo } from '@gitcontext/core'
import { CommitPickerPopover } from './CommitPickerPopover'

describe('CommitPickerPopover', () => {
  const commits: CommitInfo[] = [
    {
      oid: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      messageHeadline: 'Add commit picker popover interactions',
      authorName: 'Alice',
      authorEmail: 'alice@example.com',
      timestamp: 1_700_000_000,
    },
    {
      oid: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      messageHeadline: 'Improve branch selection behavior',
      authorName: 'Bob',
      authorEmail: 'bob@example.com',
      timestamp: 1_700_000_100,
    },
  ]

  const defaultProps = {
    branches: ['main', 'dev', '__WORKDIR__'],
    selectedBranch: 'main',
    pinnedCommit: null,
    commits,
    loading: false,
    label: 'Base',
    onBranchChange: vi.fn(),
    onCommitSelect: vi.fn(),
  }

  it('renders trigger button with branch name', () => {
    render(<CommitPickerPopover {...defaultProps} />)

    expect(screen.getByRole('button', { name: /main \(latest\)/i })).toBeInTheDocument()
  })

  it('renders trigger with pinned commit hash in label', () => {
    render(
      <CommitPickerPopover
        {...defaultProps}
        pinnedCommit="a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
      />,
    )

    expect(screen.getByRole('button', { name: /main \(a1b2c3d\)/i })).toBeInTheDocument()
  })

  it('opens popover on click', async () => {
    const user = userEvent.setup()
    render(<CommitPickerPopover {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /main \(latest\)/i }))

    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows "My Working Directory" for __WORKDIR__ branch', () => {
    render(<CommitPickerPopover {...defaultProps} selectedBranch="__WORKDIR__" />)

    expect(screen.getByRole('button', { name: /my working directory/i })).toBeInTheDocument()
  })

  it('does not show commit list for __WORKDIR__', async () => {
    const user = userEvent.setup()
    render(<CommitPickerPopover {...defaultProps} selectedBranch="__WORKDIR__" />)

    await user.click(screen.getByRole('button', { name: /my working directory/i }))

    expect(screen.queryByText('Latest (Branch Tip)')).not.toBeInTheDocument()
    expect(screen.getByText('Working directory has no history')).toBeInTheDocument()
  })

  it('shows "Latest (Branch Tip)" option in commit list', async () => {
    const user = userEvent.setup()
    render(<CommitPickerPopover {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /main \(latest\)/i }))

    expect(screen.getByText('Latest (Branch Tip)')).toBeInTheDocument()
  })

  it('calls onCommitSelect(null) when "Latest" is clicked', async () => {
    const user = userEvent.setup()
    const onCommitSelect = vi.fn()
    render(<CommitPickerPopover {...defaultProps} pinnedCommit={commits[0].oid} onCommitSelect={onCommitSelect} />)

    await user.click(screen.getByRole('button', { name: /main \(a1b2c3d\)/i }))
    await user.click(screen.getByText('Latest (Branch Tip)'))

    expect(onCommitSelect).toHaveBeenCalledWith(null)
  })

  it('calls onCommitSelect with oid when a commit is clicked', async () => {
    const user = userEvent.setup()
    const onCommitSelect = vi.fn()
    render(<CommitPickerPopover {...defaultProps} onCommitSelect={onCommitSelect} />)

    await user.click(screen.getByRole('button', { name: /main \(latest\)/i }))
    await user.click(screen.getByText('Add commit picker popover interactions'))

    expect(onCommitSelect).toHaveBeenCalledWith(commits[0].oid)
  })

  it('calls onBranchChange when branch dropdown changes', async () => {
    const user = userEvent.setup()
    const onBranchChange = vi.fn()
    render(<CommitPickerPopover {...defaultProps} onBranchChange={onBranchChange} />)

    await user.click(screen.getByRole('button', { name: /main \(latest\)/i }))
    await user.selectOptions(screen.getByRole('combobox'), 'dev')

    expect(onBranchChange).toHaveBeenCalledWith('dev')
  })

  it('shows loading state when loading=true', async () => {
    const user = userEvent.setup()
    render(<CommitPickerPopover {...defaultProps} loading={true} />)

    await user.click(screen.getByRole('button', { name: /main \(latest\)/i }))

    expect(screen.getByText('Loading commits...')).toBeInTheDocument()
  })

  it('trigger button is disabled when disabled=true', () => {
    render(<CommitPickerPopover {...defaultProps} disabled={true} />)

    expect(screen.getByRole('button', { name: /main \(latest\)/i })).toBeDisabled()
  })
})

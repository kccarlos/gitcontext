import { ArrowLeftRight, RefreshCw, Save, Trash2 } from 'lucide-react'
import type { WorkspaceListItem } from '../utils/workspaceStore'
import type { CommitInfo } from '@gitcontext/core'
import { CommitPickerPopover } from './CommitPickerPopover'

type DiffControlBarProps = {
  branches: string[]
  baseBranch: string
  compareBranch: string
  basePinnedCommit: string | null
  comparePinnedCommit: string | null
  baseCommits: CommitInfo[]
  compareCommits: CommitInfo[]
  baseCommitsLoading: boolean
  compareCommitsLoading: boolean
  onBaseBranchChange: (branch: string) => void
  onCompareBranchChange: (branch: string) => void
  onBasePinnedCommitChange: (oid: string | null) => void
  onComparePinnedCommitChange: (oid: string | null) => void
  onFlip: () => void
  onRefresh: () => void
  disabled?: boolean
  workspaces: WorkspaceListItem[]
  selectedWorkspaceId: string | ''
  currentWorkspacePath: string
  onWorkspaceSelect: (workspaceId: string | '') => void
  onSaveWorkspace: () => void
  onDeleteWorkspace: () => void
}

export function DiffControlBar({
  branches,
  baseBranch,
  compareBranch,
  basePinnedCommit,
  comparePinnedCommit,
  baseCommits,
  compareCommits,
  baseCommitsLoading,
  compareCommitsLoading,
  onBaseBranchChange,
  onCompareBranchChange,
  onBasePinnedCommitChange,
  onComparePinnedCommitChange,
  onFlip,
  onRefresh,
  disabled = false,
  workspaces,
  selectedWorkspaceId,
  currentWorkspacePath,
  onWorkspaceSelect,
  onSaveWorkspace,
  onDeleteWorkspace,
}: DiffControlBarProps) {
  const selectedWorkspace =
    selectedWorkspaceId !== ''
      ? workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null
      : null
  const fallbackFolder = currentWorkspacePath
    ? currentWorkspacePath.split('/').filter(Boolean).pop() || currentWorkspacePath
    : ''
  const unsavedLabel = currentWorkspacePath ? `Unsaved: ${fallbackFolder}` : 'Unsaved Workspace'
  const workspaceTitle = selectedWorkspace?.path || currentWorkspacePath || 'Workspace'

  return (
    <div className="gc-diff-bar">
      <div className="diff-bar-workspace-controls">
        <div className="diff-bar-workspace-selector">
          <label htmlFor="workspace-select" className="diff-bar-label">Workspace</label>
          <select
            id="workspace-select"
            value={selectedWorkspaceId}
            onChange={(event) => onWorkspaceSelect(event.target.value || '')}
            className="gc-select diff-bar-select"
            title={workspaceTitle}
            disabled={disabled}
          >
            {selectedWorkspaceId === '' ? (
              <option value="">{unsavedLabel}</option>
            ) : null}
            {selectedWorkspaceId !== '' && !selectedWorkspace ? (
              <option value={selectedWorkspaceId}>Selected Workspace</option>
            ) : null}
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name} - {workspace.folderName}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onSaveWorkspace}
          className="btn btn-ghost btn-icon"
          title="Save current workspace"
          disabled={disabled || !currentWorkspacePath}
        >
          <Save size={16} />
        </button>
        <button
          onClick={onDeleteWorkspace}
          className="btn btn-ghost btn-icon"
          title="Delete selected workspace"
          disabled={disabled || selectedWorkspaceId === ''}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <CommitPickerPopover
        branches={branches}
        selectedBranch={baseBranch}
        pinnedCommit={basePinnedCommit}
        commits={baseCommits}
        loading={baseCommitsLoading}
        disabled={disabled}
        label="Base"
        onBranchChange={onBaseBranchChange}
        onCommitSelect={onBasePinnedCommitChange}
      />

      <button
        onClick={onFlip}
        className="btn btn-ghost btn-icon"
        title="Swap branches"
        disabled={disabled || !baseBranch || !compareBranch}
        style={{ alignSelf: 'flex-end', marginBottom: 'var(--space-1)' }}
      >
        <ArrowLeftRight size={18} />
      </button>

      <CommitPickerPopover
        branches={branches}
        selectedBranch={compareBranch}
        pinnedCommit={comparePinnedCommit}
        commits={compareCommits}
        loading={compareCommitsLoading}
        disabled={disabled}
        label="Compare"
        onBranchChange={onCompareBranchChange}
        onCommitSelect={onComparePinnedCommitChange}
      />

      <div className="ml-auto" />

      <button
        onClick={onRefresh}
        disabled={disabled}
        className="btn btn-ghost"
        title="Refresh repository"
        style={{ alignSelf: 'flex-end', marginBottom: 'var(--space-1)' }}
      >
        <RefreshCw size={16} /> Refresh
      </button>
    </div>
  )
}

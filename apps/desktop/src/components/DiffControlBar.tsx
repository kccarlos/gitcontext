import { ArrowLeftRight, RefreshCw, Save, Trash2 } from 'lucide-react'
import type { WorkspaceListItem } from '../utils/workspaceStore'

type DiffControlBarProps = {
  branches: string[]
  baseBranch: string
  compareBranch: string
  onBaseBranchChange: (branch: string) => void
  onCompareBranchChange: (branch: string) => void
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
  onBaseBranchChange,
  onCompareBranchChange,
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
  const formatBranchLabel = (branch: string) =>
    branch === '__WORKDIR__' ? 'My Working Directory' : branch
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
      <div className="diff-bar-branch-selector">
        <label htmlFor="base-branch-select" className="diff-bar-label">Base</label>
        <select
          id="base-branch-select"
          value={baseBranch}
          onChange={(e) => onBaseBranchChange(e.target.value)}
          className="gc-select diff-bar-select"
          disabled={disabled}
        >
          {branches.map((branch) => (
            <option key={branch} value={branch}>
              {formatBranchLabel(branch)}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={onFlip}
        className="btn btn-ghost btn-icon"
        title="Swap branches"
        disabled={disabled || !baseBranch || !compareBranch}
      >
        <ArrowLeftRight size={18} />
      </button>

      <div className="diff-bar-branch-selector">
        <label htmlFor="compare-branch-select" className="diff-bar-label">Compare</label>
        <select
          id="compare-branch-select"
          value={compareBranch}
          onChange={(e) => onCompareBranchChange(e.target.value)}
          className="gc-select diff-bar-select"
          disabled={disabled}
        >
          {branches.map((branch) => (
            <option key={branch} value={branch}>
              {formatBranchLabel(branch)}
            </option>
          ))}
        </select>
      </div>

      <div className="ml-auto" />

      <button
        onClick={onRefresh}
        disabled={disabled}
        className="btn btn-ghost"
        title="Refresh repository"
      >
        <RefreshCw size={16} /> Refresh
      </button>
    </div>
  )
}

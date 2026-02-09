import { ArrowLeftRight, RefreshCw, Folder } from 'lucide-react'

type DiffControlBarProps = {
  branches: string[]
  baseBranch: string
  compareBranch: string
  onBaseBranchChange: (branch: string) => void
  onCompareBranchChange: (branch: string) => void
  onFlip: () => void
  onRefresh: () => void
  disabled?: boolean
  projectName?: string
  projectPath?: string
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
  projectName,
  projectPath,
}: DiffControlBarProps) {
  const formatBranchLabel = (branch: string) =>
    branch === '__WORKDIR__' ? 'My Working Directory' : branch

  return (
    <div className="gc-diff-bar">
      {projectName && (
        <div className="diff-bar-project-info">
          <Folder size={16} style={{ opacity: 0.6 }} />
          <span className="diff-bar-project-name" title={projectPath || projectName}>
            {projectName}
          </span>
        </div>
      )}
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

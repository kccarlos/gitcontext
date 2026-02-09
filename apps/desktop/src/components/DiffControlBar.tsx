import { ArrowLeftRight, RefreshCw } from 'lucide-react'

type DiffControlBarProps = {
  branches: string[]
  baseBranch: string
  compareBranch: string
  onBaseBranchChange: (branch: string) => void
  onCompareBranchChange: (branch: string) => void
  onFlip: () => void
  onRefresh: () => void
  disabled?: boolean
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
}: DiffControlBarProps) {
  const formatBranchLabel = (branch: string) =>
    branch === '__WORKDIR__' ? 'My Working Directory' : branch

  return (
    <div className="gc-diff-bar">
      <div className="diff-bar-branch-selector">
        <label className="diff-bar-label">Base</label>
        <select
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

      <div className="diff-bar-arrow">→</div>

      <div className="diff-bar-branch-selector">
        <label className="diff-bar-label">Compare</label>
        <select
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

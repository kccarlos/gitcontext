import { useState, useRef, useEffect } from 'react'
import { GitBranch, GitCommit, Search, ChevronDown, Check } from 'lucide-react'
import type { CommitInfo } from '@gitcontext/core'

type CommitPickerPopoverProps = {
  branches: string[]
  selectedBranch: string
  pinnedCommit: string | null // the OID if user pinned a commit, null = branch tip
  commits: CommitInfo[]
  loading: boolean
  disabled?: boolean
  label: string // "Base" or "Compare"
  onBranchChange: (branch: string) => void
  onCommitSelect: (oid: string | null) => void
}

function formatRelativeTime(seconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - seconds
  
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(seconds * 1000).toLocaleDateString()
}

export function CommitPickerPopover({
  branches,
  selectedBranch,
  pinnedCommit,
  commits,
  loading,
  disabled = false,
  label,
  onBranchChange,
  onCommitSelect,
}: CommitPickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [customHash, setCustomHash] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Handle custom hash submission
  const handleHashSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (customHash.trim().length >= 7) {
      onCommitSelect(customHash.trim())
      setIsOpen(false)
      setCustomHash('')
    }
  }

  const formatBranchLabel = (branch: string) =>
    branch === '__WORKDIR__' ? 'My Working Directory' : branch

  const isWorkDir = selectedBranch === '__WORKDIR__'

  const triggerLabel = isWorkDir
    ? 'My Working Directory'
    : pinnedCommit
      ? `${selectedBranch} (${pinnedCommit.slice(0, 7)})`
      : `${selectedBranch} (Latest)`

  return (
    <div className="commit-picker-wrapper" ref={popoverRef}>
      <div className="diff-bar-label" style={{ marginBottom: 'var(--space-1)' }}>{label}</div>
      <button
        className="btn commit-picker-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        type="button"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', overflow: 'hidden' }}>
          <GitBranch size={14} style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {triggerLabel}
          </span>
        </span>
        <ChevronDown size={14} style={{ opacity: 0.5 }} />
      </button>

      {isOpen && (
        <div className="commit-picker-popover">
          <div className="commit-picker-header">
            <select
              className="gc-select"
              value={selectedBranch}
              onChange={(e) => {
                onBranchChange(e.target.value)
              }}
              style={{ width: '100%' }}
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {formatBranchLabel(b)}
                </option>
              ))}
            </select>

            {!isWorkDir && (
              <form onSubmit={handleHashSubmit} style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    className="gc-input"
                    placeholder="Paste commit hash..."
                    value={customHash}
                    onChange={(e) => setCustomHash(e.target.value)}
                    style={{ width: '100%', paddingLeft: '28px' }}
                  />
                  <Search 
                    size={14} 
                    style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} 
                  />
                </div>
              </form>
            )}
          </div>

          <div className="commit-list">
            {isWorkDir ? (
              <div className="commit-empty-state">
                <span className="hint">Working directory has no history</span>
              </div>
            ) : (
              <>
                <div
                  className={`commit-item ${pinnedCommit === null ? 'active' : ''}`}
                  onClick={() => {
                    onCommitSelect(null)
                    setIsOpen(false)
                  }}
                >
                  <div className="commit-item-header">
                    <span>Latest (Branch Tip)</span>
                    {pinnedCommit === null && <Check size={14} />}
                  </div>
                  <div className="commit-item-meta">
                    Current state of {selectedBranch}
                  </div>
                </div>

                {loading ? (
                  <div className="commit-empty-state">
                    <span className="hint">Loading commits...</span>
                  </div>
                ) : commits.length === 0 ? (
                  <div className="commit-empty-state">
                    <span className="hint">No commits found</span>
                  </div>
                ) : (
                  commits.map((commit) => {
                    const isActive = pinnedCommit === commit.oid
                    const shortHash = commit.oid.slice(0, 7)
                    
                    return (
                      <div
                        key={commit.oid}
                        className={`commit-item ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          onCommitSelect(commit.oid)
                          setIsOpen(false)
                        }}
                      >
                        <div className="commit-item-header">
                          <span title={commit.messageHeadline}>
                            {commit.messageHeadline.length > 60
                              ? commit.messageHeadline.slice(0, 60) + '...'
                              : commit.messageHeadline}
                          </span>
                          {isActive && <Check size={14} />}
                        </div>
                        <div className="commit-item-meta">
                          <span className="commit-hash">
                            <GitCommit size={10} style={{ display: 'inline', marginRight: 2 }} />
                            {shortHash}
                          </span>
                          <span>•</span>
                          <span>{commit.authorName}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(commit.timestamp)}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

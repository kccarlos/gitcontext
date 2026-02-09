import { Copy } from 'lucide-react'
import { useTokenCountsContext } from '../context/TokenCountsContext'

type ContextFooterProps = {
  filesCount: number
  instructionsTokens: number
  fileTreeTokens: number
  limit: number
  onCopy: () => void
  copyFlash: string | null
  disabled?: boolean
}

export function ContextFooter({
  filesCount,
  instructionsTokens,
  fileTreeTokens,
  limit,
  onCopy,
  copyFlash,
  disabled = false,
}: ContextFooterProps) {
  const { total: filesTokens } = useTokenCountsContext()
  const totalTokens = filesTokens + instructionsTokens + fileTreeTokens
  const percentage = limit > 0 ? Math.min((totalTokens / limit) * 100, 100) : 0
  const isOverLimit = totalTokens > limit

  return (
    <div className="context-footer">
      {/* File and token usage breakdown */}
      <div className="token-breakdown">
        <div className="token-row">
          <span className="token-label">Files:</span>
          <span className="token-value">{filesCount}</span>
        </div>
        <div className="token-row">
          <span className="token-label">File Content:</span>
          <span className="token-value">{filesTokens.toLocaleString()}</span>
        </div>
        <div className="token-row">
          <span className="token-label">Instructions:</span>
          <span className="token-value">{instructionsTokens.toLocaleString()}</span>
        </div>
        <div className="token-row">
          <span className="token-label">File Tree:</span>
          <span className="token-value">{fileTreeTokens.toLocaleString()}</span>
        </div>
        <div className="token-row token-total">
          <span className="token-label">Total Tokens:</span>
          <span className={`token-value ${isOverLimit ? 'over-limit' : ''}`}>
            {totalTokens.toLocaleString()} / {limit.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {limit > 0 && (
        <div className="token-progress-bar">
          <div
            className={`token-progress-fill ${isOverLimit ? 'over-limit' : ''}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      {/* Copy button */}
      <button
        onClick={onCopy}
        disabled={disabled || filesCount === 0 || !!copyFlash}
        className="btn btn-primary copy-button"
      >
        {copyFlash ? (
          copyFlash
        ) : (
          <>
            <Copy size={18} />
            COPY ALL SELECTED ({filesCount})
          </>
        )}
      </button>
    </div>
  )
}

type Props = {
  fileTokensTotalSource: () => number
  filesCount?: number
  instructionsTokens: number
  fileTreeTokens: number
  limit: number
}

export default function TokenUsage({ fileTokensTotalSource, filesCount, instructionsTokens, fileTreeTokens, limit }: Props) {
  // Evaluate lazily to avoid re-render loops
  const filesTotal = fileTokensTotalSource()
  const total = filesTotal + instructionsTokens + fileTreeTokens
  const percent = Math.min(100, (total / Math.max(1, limit)) * 100)
  const over = total > limit
  return (
    <div className="panel" style={{ padding: '0.5rem' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <strong>Context Usage</strong>
        <span className="hint" style={{ color: over ? 'crimson' : undefined }}>
          {total.toLocaleString()} / {limit.toLocaleString()} tokens
        </span>
      </div>
      <div className="status-bar-track" style={{ marginTop: 6 }}>
        <div className={`status-bar-fill${over ? '' : ''}`} style={{ width: `${percent}%`, backgroundColor: over ? 'crimson' : undefined }} />
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        {(filesCount ?? 0).toLocaleString()} Files: {filesTotal.toLocaleString()} tokens | Instructions: {instructionsTokens.toLocaleString()} tokens | File Tree: {fileTreeTokens.toLocaleString()} tokens
      </div>
    </div>
  )
}



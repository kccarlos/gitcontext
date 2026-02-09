type TopProgressBarProps = {
  visible: boolean
  indeterminate?: boolean
}

export function TopProgressBar({ visible, indeterminate = true }: TopProgressBarProps) {
  if (!visible) return null

  return (
    <div className="top-progress-bar">
      <div className={`top-progress-fill${indeterminate ? ' indeterminate' : ''}`} />
    </div>
  )
}

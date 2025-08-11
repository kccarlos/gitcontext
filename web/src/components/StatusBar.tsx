type StatusBarProps = {
  message: string
  percent?: number
  indeterminate?: boolean
}

export function StatusBar({ message, percent = 0, indeterminate = false }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-bar-text">{message}</div>
      <div className="status-bar-track">
        <div
          className={`status-bar-fill${indeterminate ? ' indeterminate' : ''}`}
          style={{ width: indeterminate ? '40%' : `${percent}%` }}
        />
      </div>
    </div>
  )
}



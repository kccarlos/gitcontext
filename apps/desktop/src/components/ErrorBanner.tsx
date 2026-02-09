import { X } from 'lucide-react'

type ErrorBannerProps = {
  error: string | null
  onDismiss: () => void
}

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  if (!error) return null

  return (
    <div className="error-banner">
      <span className="error-banner-icon" aria-hidden="true">
        ⚠️
      </span>
      <span className="error-banner-text">{error}</span>
      <button
        onClick={onDismiss}
        className="btn btn-ghost btn-icon error-banner-close"
        aria-label="Dismiss error"
        title="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  )
}

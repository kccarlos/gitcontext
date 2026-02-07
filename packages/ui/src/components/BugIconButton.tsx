import { Bug } from 'lucide-react'

type Props = {
  url: string
  size?: number
}

export default function BugIconButton({ url, size = 16 }: Props) {
  const onClick = () => {
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="icon-only"
      aria-label="Report a problem"
      title="Report a problem"
    >
      <Bug size={size} />
    </button>
  )
}



import { Github } from 'lucide-react'

type Props = {
  repoUrl: string
  size?: number
}

export default function GitHubStarIconButton({ repoUrl, size = 16 }: Props) {
  const onClick = () => {
    try {
      window.open(repoUrl, '_blank', 'noopener,noreferrer')
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="icon-only"
      aria-label="Star on GitHub"
      title="Star on GitHub"
    >
      <Github size={size} />
    </button>
  )
}



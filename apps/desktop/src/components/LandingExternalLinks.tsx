import { BugIconButton, GitHubStarIconButton } from '@gitcontext/ui'

const GITHUB_REPO_URL = 'https://github.com/kccarlos/gitcontext'
const GITHUB_ISSUES_URL = 'https://github.com/kccarlos/gitcontext/issues'

export function LandingExternalLinks() {
  return (
    <div style={{ marginTop: '1.25rem' }}>
      <div className="row" style={{ marginTop: 8 }}>
        <GitHubStarIconButton repoUrl={GITHUB_REPO_URL} />
        <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="hint">
          https://github.com/kccarlos/gitcontext
        </a>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <BugIconButton url={GITHUB_ISSUES_URL} size={16} />
        <a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer" className="hint">
          https://github.com/kccarlos/gitcontext/issues
        </a>
      </div>
    </div>
  )
}

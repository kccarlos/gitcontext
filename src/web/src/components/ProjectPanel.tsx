import { ArrowLeftRight, RefreshCw } from 'lucide-react'

type Props = {
  branches: string[]
  baseBranch: string
  setBaseBranch: (v: string) => void
  compareBranch: string
  setCompareBranch: (v: string) => void
  isComputing?: boolean
  onRefresh?: () => void | Promise<void>
}

export function ProjectPanel({
  branches,
  baseBranch,
  setBaseBranch,
  compareBranch,
  setCompareBranch,
  isComputing,
  onRefresh,
}: Props) {
  const WORKDIR_SENTINEL = '__WORKDIR__'
  const labelFor = (name: string) => (name === WORKDIR_SENTINEL ? 'My Working Directory' : name)

  const canSwap = baseBranch && compareBranch
  const handleSwap = () => {
    if (!canSwap) return
    setBaseBranch(compareBranch)
    setCompareBranch(baseBranch)
  }
  return (
    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', columnGap: '0.5rem', alignItems: 'center' }}>
        <span>Base</span>
        <select
          value={baseBranch}
          onChange={(e) => setBaseBranch(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', width: '100%', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }}
        >
          <option value="">— Select —</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {labelFor(b)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', columnGap: '0.5rem', alignItems: 'center' }}>
        <span>Compare</span>
        <select
          value={compareBranch}
          onChange={(e) => setCompareBranch(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', width: '100%', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }}
        >
          <option value="">— Select —</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {labelFor(b)}
            </option>
          ))}
        </select>
      </div>

      {onRefresh && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            title="Swap Base and Compare"
            onClick={handleSwap}
            disabled={!canSwap || !!isComputing}
          >
            <ArrowLeftRight size={16} /> Swap
          </button>
          <button
            type="button"
            onClick={() => onRefresh()}
            title="Re-read .git and refresh branches/diff"
            disabled={!!isComputing}
          >
            <RefreshCw size={16} /> Fetch & Refresh
          </button>
        </div>
      )}
    </div>
  )
}



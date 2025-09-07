import { useMemo, useState } from 'react'
import { ArrowUpDown, Search, X, FilePenLine, FilePlus2, FileMinus2, File as FileIcon, FileArchive } from 'lucide-react'
import { useTokenCountsContext } from '../context/TokenCountsContext'
import type { FileDiffStatus } from '../hooks/useFileTree'

type SelectedEntry = {
  path: string
  name: string
  status: FileDiffStatus
  tokens: number
  isLikelyBinary?: boolean
}

type SortKey = 'tokens-desc' | 'tokens-asc' | 'name-asc' | 'name-desc'

type Props = {
  selectedPaths: Set<string>
  statusByPath: Map<string, FileDiffStatus>
  onUnselect: (path: string) => void
  onPreview: (path: string, status: FileDiffStatus) => void
  refreshing?: boolean
  filterText?: string
}

export function SelectedFilesPanel({ selectedPaths, statusByPath, onUnselect, onPreview, refreshing, filterText }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('tokens-desc')
  const { counts, busy } = useTokenCountsContext()
  const effectiveBusy = !!refreshing || busy

  const items = useMemo<SelectedEntry[]>(() => {
    const entries: SelectedEntry[] = []
    for (const path of selectedPaths) {
      const st = statusByPath.get(path) ?? 'unchanged'
      const tokens = counts.get(path) ?? 0
      const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
      const lower = path.toLowerCase()
      const exts = ['.png','.jpg','.jpeg','.gif','.webp','.svg','.ico','.pdf','.zip','.gz','.tgz','.rar','.7z','.mp4','.mp3','.wav','.mov','.avi','.mkv','.woff','.woff2','.ttf']
      const isLikelyBinary = exts.some((e) => lower.endsWith(e))
      entries.push({ path, name, status: st, tokens, isLikelyBinary })
    }
    const q = (filterText || '').trim().toLowerCase()
    const filtered = q
      ? entries.filter((it) => it.path.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
      : entries
    switch (sortKey) {
      case 'tokens-asc':
        return filtered.sort((a, b) => a.tokens - b.tokens)
      case 'name-asc':
        return filtered.sort((a, b) => a.name.localeCompare(b.name))
      case 'name-desc':
        return filtered.sort((a, b) => b.name.localeCompare(a.name))
      case 'tokens-desc':
      default:
        return filtered.sort((a, b) => b.tokens - a.tokens)
    }
  }, [selectedPaths, statusByPath, sortKey, counts, filterText])

  // total retained for hooks; totalTokens previously displayed in header moved to Output Settings

  const StatusIcon = ({ status }: { status: FileDiffStatus }) => {
    const size = 16
    switch (status) {
      case 'modify':
        return <FilePenLine size={size} className="status-m" aria-label="Modified" />
      case 'add':
        return <FilePlus2 size={size} className="status-a" aria-label="Added" />
      case 'remove':
        return <FileMinus2 size={size} className="status-d" aria-label="Removed" />
      default:
        return <FileIcon size={size} style={{ opacity: 0.5 }} aria-label="Unchanged" />
    }
  }

  function pathTreeTooltip(path: string): string {
    // Render a simple single-branch tree from root to the file
    const parts = path.split('/')
    const lines: string[] = []
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1
      const prefix = ' '.repeat(i * 4) + (isLast ? '└── ' : '└── ')
      lines.push(prefix + parts[i])
    }
    return lines.join('\n')
  }

  return (
    <div className="selected-files">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Selected Files</h2>
        <div className="row">
          <span className="tag" style={{ visibility: effectiveBusy ? 'visible' : 'hidden' }}>{effectiveBusy ? 'Recalculating…' : ''}</span>
          <div className="row">
            <ArrowUpDown size={16} />
            <select className="select" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} title="Sort by">
              <option value="tokens-desc">Tokens: High to Low</option>
              <option value="tokens-asc">Tokens: Low to High</option>
              <option value="name-asc">Name: A → Z</option>
              <option value="name-desc">Name: Z → A</option>
            </select>
          </div>
        </div>
      </div>
      

      {items.length === 0 ? (
        <div className="hint">No files selected.</div>
      ) : (
        <div className="selected-files-list">
          {items.map((it) => (
            <div key={it.path} className="selected-file-row">
              <span title={pathTreeTooltip(it.path)} className="row" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <StatusIcon status={it.status} />
                <span className="row" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.isLikelyBinary ? (
                    <span aria-label="Binary file" title="Binary (heuristic)">
                      <FileArchive size={14} />
                    </span>
                  ) : null}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                </span>
              </span>
              <span className="tokens"><span className="badge">{it.tokens.toLocaleString()}</span></span>
              <button
                type="button"
                onClick={() => onPreview(it.path, it.status)}
                title="Preview"
                aria-label="Preview"
                className="btn btn-ghost btn-icon"
              >
                <Search size={14} />
              </button>
              <button
                type="button"
                onClick={() => onUnselect(it.path)}
                title="Remove from selection"
                className="btn btn-ghost btn-icon"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SelectedFilesPanel



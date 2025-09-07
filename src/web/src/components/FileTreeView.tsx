import type { FileTreeNode, FileDiffStatus } from '../hooks/useFileTree'
import { ChevronDown, ChevronRight, Search, FilePenLine, FilePlus2, FileMinus2, File as FileIcon, FileArchive } from 'lucide-react'

type Props = {
  tree: FileTreeNode | null
  expandedPaths: Set<string>
  selectedPaths: Set<string>
  showChangedOnly: boolean
  filterText?: string
  onToggleExpand: (path: string) => void
  onToggleSelect: (path: string) => void
  onPreviewFile: (path: string, status: FileDiffStatus) => void | Promise<void>
}

export function FileTreeView({
  tree,
  expandedPaths,
  selectedPaths,
  showChangedOnly,
  filterText,
  onToggleExpand,
  onToggleSelect,
  onPreviewFile,
}: Props) {
  if (!tree) return null

  const nodeVisible = (node: FileTreeNode): boolean => {
    if (!showChangedOnly) return true
    if (node.type === 'file') return (node.status ?? 'unchanged') !== 'unchanged'
    return (node.children ?? []).some(nodeVisible)
  }

  // Render nodes using semantic lists with connector lines via CSS
  const renderTreeNodes = (nodes: FileTreeNode[]): (JSX.Element | null)[] => {
    const renderStatusIcon = (status: FileDiffStatus) => {
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
    // Filtering helpers: match name or full path (case-insensitive)
    const q = (filterText || '').trim().toLowerCase()
    const hasQuery = q.length > 0

    function matchesFilter(node: FileTreeNode): boolean {
      if (!hasQuery) return true
      const path = (node.path || '').toLowerCase()
      const name = (node.name || '').toLowerCase()
      if (path.includes(q) || name.includes(q)) return true
      if (node.type === 'dir') return (node.children ?? []).some(matchesFilter)
      return false
    }

    function shouldShow(node: FileTreeNode): boolean {
      if (!matchesFilter(node)) return false
      if (!showChangedOnly) return true
      if (node.type === 'file') return (node.status ?? 'unchanged') !== 'unchanged'
      return (node.children ?? []).some(shouldShow)
    }

    // Note: filter match helpers were inline; removed unused variants to satisfy linter

    return nodes.map((node) => {
      if (!shouldShow(node)) return null

      if (node.type === 'dir') {
        const hasVisibleChildren = node.children?.some(shouldShow) ?? false
        if (!hasVisibleChildren && (showChangedOnly || hasQuery)) return null
        // Auto-expand during filter to reveal matches
        const isExpanded = hasQuery || expandedPaths.has(node.path)

        // Gather all descendant file paths (regardless of visibility)
        const gatherFiles = (n: FileTreeNode | undefined): string[] => {
          if (!n) return []
          if (n.type === 'file') return [n.path]
          const acc: string[] = []
          for (const c of n.children ?? []) acc.push(...gatherFiles(c))
          return acc
        }
        const descendantFiles = gatherFiles(node)
        const selectedCount = descendantFiles.filter((p) => selectedPaths.has(p)).length
        const allSelected = descendantFiles.length > 0 && selectedCount === descendantFiles.length
        const noneSelected = selectedCount === 0

        const toggleFolderSelection = () => {
          if (descendantFiles.length === 0) return
          const toToggle = allSelected
            ? descendantFiles.filter((p) => selectedPaths.has(p))
            : descendantFiles.filter((p) => !selectedPaths.has(p))
          for (const p of toToggle) onToggleSelect(p)
        }
        return (
          <li key={node.path}>
            <div className="row tree-row" style={{ gap: 4 }}>
              <button
                type="button"
                onClick={() => onToggleExpand(node.path)}
                className="btn btn-ghost btn-icon"
                style={{ width: 28, padding: 2 }}
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = !allSelected && !noneSelected
                }}
                onChange={toggleFolderSelection}
                aria-label={`Select folder ${node.name}`}
              />
              <strong>{node.name || '/'}</strong>
            </div>
            {isExpanded && node.children && (
              <ul>
                {renderTreeNodes(node.children)}
              </ul>
            )}
          </li>
        )
      } else {
        const st = node.status ?? 'unchanged'
        if (showChangedOnly && st === 'unchanged') return null
        const checked = selectedPaths.has(node.path)
        return (
          <li key={node.path}>
            <div className="row tree-row" style={{ gap:6, paddingLeft:4 }}>
              <input type="checkbox" checked={checked} onChange={() => onToggleSelect(node.path)} />
              <span className="row" style={{ gap:6, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {renderStatusIcon(st)}
                <span className="row" style={{ gap:4 }}>
                  {node.isLikelyBinary ? (
                    <span aria-label="Binary file" title="Binary (heuristic)">
                      <FileArchive size={14} />
                    </span>
                  ) : null}
                  <span>{node.name}</span>
                </span>
                {/* Hidden full path to aid tests/search without impacting layout */}
                <span className="visually-hidden" aria-hidden="true" data-full-path={node.path}>{node.path}</span>
              </span>
              <button
                type="button"
                onClick={() => onPreviewFile(node.path, st)}
                className="btn btn-ghost btn-icon ml-auto"
                title={node.isLikelyBinary ? 'Preview disabled for binary files' : 'Preview'}
                aria-label="Preview"
                disabled={node.isLikelyBinary}
              >
                <Search size={14} />
              </button>
            </div>
          </li>
        )
      }
    })
  }

  return (
    <div
      className="file-tree-view"
      style={{
        border: '1px solid color-mix(in hsl, currentColor 20%, transparent)',
        borderRadius: 8,
        padding: '0.5rem',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}
    >
      <ul style={{ paddingLeft: 0, flex: 1, overflowY: 'auto' }}>
        {tree.children && renderTreeNodes(tree.children)}
      </ul>
    </div>
  )
}



import type { WorkspaceListItem } from '../hooks/useWorkspaces'
import { Save, Trash2, Folder } from 'lucide-react'

type Props = {
  workspaces: WorkspaceListItem[]
  selectedWorkspaceId: number | ''
  onSelectWorkspace: (id: number | '') => void | Promise<void>
  onSaveWorkspace: () => void | Promise<void>
  onRemoveWorkspace: () => void | Promise<void>
  onSelectNewRepo: () => void | Promise<void>
  projectLoaded: boolean
  currentDir?: FileSystemDirectoryHandle | null
}

export function HeaderControls({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onSaveWorkspace,
  onRemoveWorkspace,
  onSelectNewRepo,
  projectLoaded,
  currentDir,
}: Props) {
  // Compute display data for current context
  const isUnsaved = selectedWorkspaceId === ''
  const currentWs = workspaces.find((w) => w.id === selectedWorkspaceId) || null
  const isInitial = !projectLoaded && !currentDir && isUnsaved
  const headerId = isInitial ? 'Workspace' : (isUnsaved ? 'Unsaved Workspace' : currentWs?.name ?? 'Workspace')
  const headerFolder = isInitial ? '' : (currentDir?.name ?? currentWs?.folderName ?? '')

  // When closed (no native open state), this block mirrors header
  // When user interacts, they can still open a new folder via the last option
  const handleSelectMenu = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === '__browse__') {
      void onSelectNewRepo()
      return
    }
    void onSelectWorkspace(val === '' ? '' : Number(val))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) auto auto', gap: '0.5rem', alignItems: 'center', minWidth: 0 }}>
      {/* Combined header + dropdown control */}
      <div style={{ position: 'relative', minWidth: 0 }}>
        <div
          style={{
            border: '1px solid color-mix(in hsl, currentColor 20%, transparent)',
            borderRadius: 8,
            padding: '0.5rem 0.75rem',
          }}
        >
          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Folder size={18} /> {headerId}</div>
          {headerFolder ? (
            <div style={{ opacity: 0.9 }}>{headerFolder}</div>
          ) : null}
          {/* full path removed per request */}
        </div>
        {/* Overlay a transparent select to act as the dropdown trigger */}
        <select
          value={selectedWorkspaceId}
          onChange={handleSelectMenu}
          title="Switch workspace or browse…"
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            width: '100%',
            height: '100%',
            cursor: 'pointer',
          }}
        >
          {/* Show current first */}
          <option value={selectedWorkspaceId}>
            {headerId} — {headerFolder}
          </option>
          {/* Separator-like disabled option */}
          <option disabled>──────────</option>
          {/* Workspaces list with two-line like hints (native select is single-line; we compress info) */}
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} — {w.folderName ?? ''}
            </option>
          ))}
          <option value="__browse__">📂 Browse for another folder…</option>
        </select>
      </div>

      <button type="button" onClick={() => onSaveWorkspace()} disabled={!projectLoaded} title="Save current folder as workspace" className="icon-only">
        <Save size={16} />
      </button>
      <button
        type="button"
        onClick={() => onRemoveWorkspace()}
        disabled={selectedWorkspaceId === ''}
        title={selectedWorkspaceId === '' ? 'Select a saved workspace to remove' : 'Remove selected from saved workspaces'}
        className="icon-only"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}



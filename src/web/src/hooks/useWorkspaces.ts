import { useCallback, useEffect, useState } from 'react'
import { listWorkspaces, saveWorkspace, removeWorkspace, getWorkspace } from '../utils/idb'
import { reauthorizeIfNeeded } from '../utils/fs'

export type WorkspaceListItem = { id: number; name: string; folderName?: string }

export function useWorkspaces(onWorkspaceSelect: (handle: FileSystemDirectoryHandle) => Promise<void> | void) {
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | ''>('')

  const refreshWorkspaceList = useCallback(async () => {
    const list = await listWorkspaces()
    // Augment with folderName for nicer menu rendering (best-effort)
    const augmented = await Promise.all(
      list.map(async (w) => {
        try {
          const rec = await getWorkspace(w.id)
          const folderName = rec?.handle?.name ?? undefined
          return { ...w, folderName }
        } catch {
          return w
        }
      }),
    )
    setWorkspaces(augmented)
    if (selectedWorkspaceId !== '' && !list.some((w) => w.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId('')
    }
  }, [selectedWorkspaceId])

  useEffect(() => {
    void refreshWorkspaceList()
  }, [refreshWorkspaceList])

  const handleSelect = useCallback(
    async (id: number | '') => {
      setSelectedWorkspaceId(id)
      if (id === '') return
      const rec = await getWorkspace(id)
      if (rec) {
        // Attempt to (re)authorize access before using the stored handle
        let state: PermissionState | 'error' = 'prompt'
        try {
          state = await reauthorizeIfNeeded(rec.handle)
        } catch {
          state = 'error'
        }
        if (state !== 'granted') {
          const remove = window.confirm(
            'Permission to access this folder was lost or denied. Would you like to remove this workspace entry?',
          )
          if (remove) {
            await removeWorkspace(rec.id)
            await refreshWorkspaceList()
            setSelectedWorkspaceId('')
          }
          return
        }

        // Validate the directory still exists and is a Git repo. If not, offer to remove the workspace entry.
        try {
          // Quick existence check for .git directory
          await rec.handle.getDirectoryHandle('.git', { create: false })
        } catch {
          const remove = window.confirm(
            'This workspace folder appears to be missing or is no longer a Git repository. Remove this workspace entry?',
          )
          if (remove) {
            await removeWorkspace(rec.id)
            await refreshWorkspaceList()
            setSelectedWorkspaceId('')
          }
          return
        }
        await onWorkspaceSelect(rec.handle)
      }
    },
    [onWorkspaceSelect, refreshWorkspaceList],
  )

  const saveWorkspaceFromHandle = useCallback(
    async (handle: FileSystemDirectoryHandle | null) => {
      if (!handle) return
      const name = window.prompt('Enter a name for this workspace:', handle.name)
      if (!name || !name.trim()) return
      const id = await saveWorkspace(name.trim(), handle)
      await refreshWorkspaceList()
      setSelectedWorkspaceId(id)
    },
    [refreshWorkspaceList],
  )

  const removeSelected = useCallback(async () => {
    if (selectedWorkspaceId === '') return
    const confirm = window.confirm('Remove the selected workspace from this browser?')
    if (!confirm) return
    await removeWorkspace(selectedWorkspaceId)
    await refreshWorkspaceList()
    setSelectedWorkspaceId('')
  }, [selectedWorkspaceId, refreshWorkspaceList])

  return {
    workspaces,
    selectedWorkspaceId,
    refreshWorkspaceList,
    handleSelect,
    saveWorkspaceFromHandle,
    removeSelected,
    setSelectedWorkspaceId,
  }
}



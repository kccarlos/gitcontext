/* Minimal IndexedDB wrapper for storing FileSystemDirectoryHandle workspaces.
   Schema:
   - DB name: 'gitcontext'
   - Store: 'workspaces' with keyPath 'id' (auto-increment)
   - Value: { id?: number, name: string, handle: FileSystemDirectoryHandle }
*/

type WorkspaceRecord = {
  id?: number
  name: string
  handle: FileSystemDirectoryHandle
}

const DB_NAME = 'gitcontext'
const DB_VERSION = 1
const STORE = 'workspaces'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T = unknown>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const store = transaction.objectStore(STORE)
    const request = fn(store)
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

export async function listWorkspaces(): Promise<Array<{ id: number; name: string }>> {
  const db = await openDB()
  // Use getAll to keep it simple; filter out handle to reduce exposure when not needed.
  const all = await tx<any[]>(db, 'readonly', (s) => s.getAll())
  return (all as WorkspaceRecord[])
    .map((r) => ({ id: r.id as number, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getWorkspace(
  id: number,
): Promise<WorkspaceRecord & { id: number } | undefined> {
  const db = await openDB()
  const rec = (await tx<WorkspaceRecord | undefined>(db, 'readonly', (s) => s.get(id))) as
    | WorkspaceRecord
    | undefined
  if (!rec) return undefined
  return { ...(rec as WorkspaceRecord), id: id }
}

export async function saveWorkspace(
  name: string,
  handle: FileSystemDirectoryHandle,
): Promise<number> {
  const db = await openDB()
  const key = await tx<IDBValidKey>(db, 'readwrite', (s) =>
    s.add({ name, handle } as WorkspaceRecord),
  )
  return key as number
}

export async function updateWorkspace(
  id: number,
  patch: Partial<Pick<WorkspaceRecord, 'name' | 'handle'>>,
): Promise<void> {
  const db = await openDB()
  const existing = (await tx<WorkspaceRecord | undefined>(db, 'readonly', (s) => s.get(id))) as
    | WorkspaceRecord
    | undefined
  if (!existing) throw new Error('Workspace not found')
  const next: WorkspaceRecord & { id: number } = { ...existing, ...patch, id }
  await tx(db, 'readwrite', (s) => s.put(next))
}

export async function removeWorkspace(id: number): Promise<void> {
  const db = await openDB()
  await tx(db, 'readwrite', (s) => s.delete(id))
}

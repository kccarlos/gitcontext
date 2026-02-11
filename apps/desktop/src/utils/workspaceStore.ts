import type { TabId } from '../components/RightPanelTabs'

export const WORKSPACE_STORE_KEY = 'gc.desktop.workspaces.v1'
export const WORKSPACE_STORE_VERSION = 1
export const DEFAULT_WORKSPACE_SESSION_ID = 'default'
export const DEFAULT_WORKSPACE_SESSION_NAME = 'Main'
const MAX_PERSISTED_SELECTIONS = 5000

export type WorkspaceSessionSettings = {
  selectedModel: string
  userInstructions: string
  includeFileTree: boolean
  includeBinaryAsPaths: boolean
  diffContextLines: number
  showChangedOnly: boolean
  activeTab: TabId
}

export type WorkspaceSessionSnapshot = {
  id: string
  name: string
  baseBranch: string
  compareBranch: string
  selectedPaths: string[]
  settings: WorkspaceSessionSettings
  updatedAt: string
}

export type StoredWorkspace = {
  id: string
  name: string
  path: string
  createdAt: string
  updatedAt: string
  lastOpenedAt?: string
  activeSessionId: string
  sessions: WorkspaceSessionSnapshot[]
}

export type WorkspaceStore = {
  version: number
  activeWorkspaceId: string | null
  workspaces: StoredWorkspace[]
}

export type WorkspaceListItem = {
  id: string
  name: string
  path: string
  folderName: string
  updatedAt: string
  lastOpenedAt?: string
}

export type WorkspaceSessionSnapshotInput = {
  sessionId?: string
  sessionName?: string
  baseBranch: string
  compareBranch: string
  selectedPaths: string[]
  settings: Partial<WorkspaceSessionSettings>
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSessionSettings = {
  selectedModel: '',
  userInstructions: '',
  includeFileTree: true,
  includeBinaryAsPaths: false,
  diffContextLines: 3,
  showChangedOnly: true,
  activeTab: 'files',
}

function createEmptyStore(): WorkspaceStore {
  return {
    version: WORKSPACE_STORE_VERSION,
    activeWorkspaceId: null,
    workspaces: [],
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function toPathLookupKey(path: string): string {
  return normalizeWorkspacePath(path).toLowerCase()
}

function folderNameFromPath(path: string): string {
  const normalized = normalizeWorkspacePath(path)
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] || normalized || path
}

function normalizeSelection(paths: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of paths) {
    if (typeof raw !== 'string') continue
    const next = raw.trim()
    if (!next) continue
    if (seen.has(next)) continue
    seen.add(next)
    out.push(next)
    if (out.length >= MAX_PERSISTED_SELECTIONS) break
  }
  return out
}

function sanitizeSessionSettings(value: unknown): WorkspaceSessionSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_WORKSPACE_SETTINGS }
  }
  const src = value as Partial<Record<keyof WorkspaceSessionSettings, unknown>>
  const activeTab = src.activeTab === 'settings' ? 'settings' : 'files'
  return {
    selectedModel: typeof src.selectedModel === 'string' ? src.selectedModel : DEFAULT_WORKSPACE_SETTINGS.selectedModel,
    userInstructions:
      typeof src.userInstructions === 'string' ? src.userInstructions : DEFAULT_WORKSPACE_SETTINGS.userInstructions,
    includeFileTree:
      typeof src.includeFileTree === 'boolean' ? src.includeFileTree : DEFAULT_WORKSPACE_SETTINGS.includeFileTree,
    includeBinaryAsPaths:
      typeof src.includeBinaryAsPaths === 'boolean'
        ? src.includeBinaryAsPaths
        : DEFAULT_WORKSPACE_SETTINGS.includeBinaryAsPaths,
    diffContextLines:
      typeof src.diffContextLines === 'number' && Number.isFinite(src.diffContextLines)
        ? Math.max(0, Math.floor(src.diffContextLines))
        : DEFAULT_WORKSPACE_SETTINGS.diffContextLines,
    showChangedOnly:
      typeof src.showChangedOnly === 'boolean' ? src.showChangedOnly : DEFAULT_WORKSPACE_SETTINGS.showChangedOnly,
    activeTab,
  }
}

function sanitizeSession(value: unknown): WorkspaceSessionSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const src = value as Partial<Record<keyof WorkspaceSessionSnapshot, unknown>>
  if (typeof src.id !== 'string' || !src.id.trim()) return null
  if (typeof src.name !== 'string' || !src.name.trim()) return null
  if (typeof src.baseBranch !== 'string') return null
  if (typeof src.compareBranch !== 'string') return null
  const selectedPaths = Array.isArray(src.selectedPaths) ? normalizeSelection(src.selectedPaths as string[]) : []
  const updatedAt = typeof src.updatedAt === 'string' && src.updatedAt ? src.updatedAt : nowIso()
  return {
    id: src.id,
    name: src.name,
    baseBranch: src.baseBranch,
    compareBranch: src.compareBranch,
    selectedPaths,
    settings: sanitizeSessionSettings(src.settings),
    updatedAt,
  }
}

function ensureDefaultSession(
  sessions: WorkspaceSessionSnapshot[],
  fallbackBranch = '',
): WorkspaceSessionSnapshot[] {
  if (sessions.length > 0) return sessions
  return [
    {
      id: DEFAULT_WORKSPACE_SESSION_ID,
      name: DEFAULT_WORKSPACE_SESSION_NAME,
      baseBranch: fallbackBranch,
      compareBranch: fallbackBranch,
      selectedPaths: [],
      settings: { ...DEFAULT_WORKSPACE_SETTINGS },
      updatedAt: nowIso(),
    },
  ]
}

function sanitizeWorkspace(value: unknown): StoredWorkspace | null {
  if (!value || typeof value !== 'object') return null
  const src = value as Partial<Record<keyof StoredWorkspace, unknown>>
  if (typeof src.id !== 'string' || !src.id.trim()) return null
  if (typeof src.name !== 'string' || !src.name.trim()) return null
  if (typeof src.path !== 'string' || !src.path.trim()) return null

  const createdAt = typeof src.createdAt === 'string' && src.createdAt ? src.createdAt : nowIso()
  const updatedAt = typeof src.updatedAt === 'string' && src.updatedAt ? src.updatedAt : createdAt
  const sessionsRaw = Array.isArray(src.sessions) ? src.sessions : []
  const sessions = ensureDefaultSession(
    sessionsRaw
      .map((session) => sanitizeSession(session))
      .filter((session): session is WorkspaceSessionSnapshot => Boolean(session)),
  )
  const activeSessionIdRaw = typeof src.activeSessionId === 'string' ? src.activeSessionId : DEFAULT_WORKSPACE_SESSION_ID
  const activeSessionId = sessions.some((session) => session.id === activeSessionIdRaw)
    ? activeSessionIdRaw
    : sessions[0].id

  return {
    id: src.id,
    name: src.name.trim(),
    path: normalizeWorkspacePath(src.path),
    createdAt,
    updatedAt,
    lastOpenedAt: typeof src.lastOpenedAt === 'string' && src.lastOpenedAt ? src.lastOpenedAt : undefined,
    activeSessionId,
    sessions,
  }
}

export function loadWorkspaceStore(): WorkspaceStore {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORE_KEY)
    if (!raw) return createEmptyStore()
    const parsed = JSON.parse(raw) as Partial<WorkspaceStore>
    const workspaces = Array.isArray(parsed.workspaces)
      ? parsed.workspaces
          .map((item) => sanitizeWorkspace(item))
          .filter((item): item is StoredWorkspace => Boolean(item))
      : []
    const activeWorkspaceId =
      typeof parsed.activeWorkspaceId === 'string' && workspaces.some((w) => w.id === parsed.activeWorkspaceId)
        ? parsed.activeWorkspaceId
        : null
    return {
      version: WORKSPACE_STORE_VERSION,
      activeWorkspaceId,
      workspaces,
    }
  } catch {
    return createEmptyStore()
  }
}

export function saveWorkspaceStore(store: WorkspaceStore): void {
  try {
    localStorage.setItem(WORKSPACE_STORE_KEY, JSON.stringify(store))
  } catch {
    // Ignore quota or serialization failures.
  }
}

export function createWorkspaceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function ensureSessionSnapshot(
  input: WorkspaceSessionSnapshotInput,
  fallback: WorkspaceSessionSnapshot | null,
): WorkspaceSessionSnapshot {
  const sessionId = input.sessionId?.trim() || fallback?.id || DEFAULT_WORKSPACE_SESSION_ID
  const sessionName = input.sessionName?.trim() || fallback?.name || DEFAULT_WORKSPACE_SESSION_NAME
  return {
    id: sessionId,
    name: sessionName,
    baseBranch: input.baseBranch,
    compareBranch: input.compareBranch,
    selectedPaths: normalizeSelection(input.selectedPaths),
    settings: {
      ...DEFAULT_WORKSPACE_SETTINGS,
      ...(fallback?.settings ?? {}),
      ...input.settings,
      activeTab: input.settings.activeTab === 'settings' ? 'settings' : input.settings.activeTab === 'files' ? 'files' : (fallback?.settings.activeTab ?? DEFAULT_WORKSPACE_SETTINGS.activeTab),
    },
    updatedAt: nowIso(),
  }
}

function sortWorkspaces(workspaces: StoredWorkspace[]): StoredWorkspace[] {
  return [...workspaces].sort((a, b) => {
    const aSort = a.lastOpenedAt || a.updatedAt
    const bSort = b.lastOpenedAt || b.updatedAt
    if (aSort !== bSort) return bSort.localeCompare(aSort)
    return a.name.localeCompare(b.name)
  })
}

export function listWorkspaceItems(store: WorkspaceStore): WorkspaceListItem[] {
  return sortWorkspaces(store.workspaces).map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
    folderName: folderNameFromPath(workspace.path),
    updatedAt: workspace.updatedAt,
    lastOpenedAt: workspace.lastOpenedAt,
  }))
}

export function getWorkspaceById(store: WorkspaceStore, workspaceId: string): StoredWorkspace | null {
  return store.workspaces.find((workspace) => workspace.id === workspaceId) ?? null
}

export function findWorkspaceByPath(store: WorkspaceStore, workspacePath: string): StoredWorkspace | null {
  const wanted = toPathLookupKey(workspacePath)
  return store.workspaces.find((workspace) => toPathLookupKey(workspace.path) === wanted) ?? null
}

export function getActiveSession(workspace: StoredWorkspace): WorkspaceSessionSnapshot {
  return (
    workspace.sessions.find((session) => session.id === workspace.activeSessionId) ||
    workspace.sessions[0]
  )
}

export function upsertWorkspace(
  store: WorkspaceStore,
  params: {
    name: string
    path: string
    workspaceId?: string
    snapshot: WorkspaceSessionSnapshotInput
    markOpened?: boolean
  },
): { store: WorkspaceStore; workspaceId: string } {
  const normalizedPath = normalizeWorkspacePath(params.path)
  const now = nowIso()
  const existingById = params.workspaceId ? store.workspaces.find((workspace) => workspace.id === params.workspaceId) : null
  const existingByPath = store.workspaces.find(
    (workspace) => toPathLookupKey(workspace.path) === toPathLookupKey(normalizedPath),
  )
  const existing = existingById || existingByPath || null
  const nextWorkspaceId = existing?.id || createWorkspaceId()
  const baseWorkspace: StoredWorkspace =
    existing ?? {
      id: nextWorkspaceId,
      name: params.name.trim(),
      path: normalizedPath,
      createdAt: now,
      updatedAt: now,
      activeSessionId: params.snapshot.sessionId || DEFAULT_WORKSPACE_SESSION_ID,
      sessions: ensureDefaultSession([]),
    }
  const fallbackSession =
    baseWorkspace.sessions.find((session) => session.id === (params.snapshot.sessionId || baseWorkspace.activeSessionId)) ??
    getActiveSession(baseWorkspace)
  const nextSession = ensureSessionSnapshot(params.snapshot, fallbackSession)
  const nextSessions = [
    ...baseWorkspace.sessions.filter((session) => session.id !== nextSession.id),
    nextSession,
  ]
  const nextWorkspace: StoredWorkspace = {
    ...baseWorkspace,
    name: params.name.trim(),
    path: normalizedPath,
    updatedAt: now,
    lastOpenedAt: params.markOpened ? now : baseWorkspace.lastOpenedAt,
    activeSessionId: nextSession.id,
    sessions: nextSessions,
  }
  const nextWorkspaces = [
    ...store.workspaces.filter((workspace) => workspace.id !== nextWorkspace.id),
    nextWorkspace,
  ]
  return {
    workspaceId: nextWorkspace.id,
    store: {
      version: WORKSPACE_STORE_VERSION,
      activeWorkspaceId: nextWorkspace.id,
      workspaces: sortWorkspaces(nextWorkspaces),
    },
  }
}

export function removeWorkspace(store: WorkspaceStore, workspaceId: string): WorkspaceStore {
  const nextWorkspaces = store.workspaces.filter((workspace) => workspace.id !== workspaceId)
  return {
    version: WORKSPACE_STORE_VERSION,
    activeWorkspaceId: store.activeWorkspaceId === workspaceId ? null : store.activeWorkspaceId,
    workspaces: sortWorkspaces(nextWorkspaces),
  }
}

export function setActiveWorkspace(store: WorkspaceStore, workspaceId: string | ''): WorkspaceStore {
  return {
    ...store,
    activeWorkspaceId: workspaceId === '' ? null : workspaceId,
  }
}

export function updateWorkspaceSession(
  store: WorkspaceStore,
  workspaceId: string,
  snapshot: WorkspaceSessionSnapshotInput,
): WorkspaceStore {
  const workspace = getWorkspaceById(store, workspaceId)
  if (!workspace) return store
  const fallbackSession =
    workspace.sessions.find((session) => session.id === (snapshot.sessionId || workspace.activeSessionId)) ??
    getActiveSession(workspace)
  const nextSession = ensureSessionSnapshot(snapshot, fallbackSession)
  const nextWorkspace: StoredWorkspace = {
    ...workspace,
    updatedAt: nowIso(),
    activeSessionId: nextSession.id,
    sessions: [...workspace.sessions.filter((session) => session.id !== nextSession.id), nextSession],
  }
  return {
    ...store,
    workspaces: sortWorkspaces([
      ...store.workspaces.filter((item) => item.id !== workspaceId),
      nextWorkspace,
    ]),
  }
}

export function markWorkspaceOpened(store: WorkspaceStore, workspaceId: string): WorkspaceStore {
  const workspace = getWorkspaceById(store, workspaceId)
  if (!workspace) return store
  const nextWorkspace: StoredWorkspace = {
    ...workspace,
    updatedAt: nowIso(),
    lastOpenedAt: nowIso(),
  }
  return {
    ...store,
    activeWorkspaceId: workspaceId,
    workspaces: sortWorkspaces([
      ...store.workspaces.filter((item) => item.id !== workspaceId),
      nextWorkspace,
    ]),
  }
}

export function getWorkspaceSelectionRestore(
  selectedPaths: string[],
  selectablePaths: Iterable<string>,
): { matched: string[]; missing: string[] } {
  const selectableSet = new Set(selectablePaths)
  const matched: string[] = []
  const missing: string[] = []
  for (const path of normalizeSelection(selectedPaths)) {
    if (selectableSet.has(path)) matched.push(path)
    else missing.push(path)
  }
  return { matched, missing }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { ChevronsDown, ChevronsUp, CheckSquare, Square, Sun, Moon, Folder, FolderGit2, ListChecks, Copy, ArrowLeftRight, Trash2 } from 'lucide-react'
import { FileTreeView, PreviewModal, GitHubStarIconButton, BugIconButton } from '@gitcontext/ui'
import { type FileDiffStatus, MAX_CONCURRENT_READS } from '@gitcontext/core'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useGitRepository } from './hooks/useGitRepository'
import { useFileTree } from './hooks/useFileTree'
import { useTheme } from './hooks/useTheme'
import { SelectedFilesPanel } from './components/SelectedFilesPanel'
import { TopProgressBar } from './components/TopProgressBar'
import { ErrorBanner } from './components/ErrorBanner'
import { DiffControlBar } from './components/DiffControlBar'
import { RightPanelTabs, type TabId } from './components/RightPanelTabs'
import { ContextFooter } from './components/ContextFooter'
import { getModels } from './utils/models'
import type { ModelInfo } from './types/models'
import type { AppStatus } from './types/appStatus'
import { generateFileTreeText, buildHeader, buildFileSection } from './utils/copyOutput'
import { countTokens } from './utils/tokenizer'
import { TokenCountsProvider } from './context/TokenCountsContext'
import { mapWithConcurrency } from './utils/concurrency'
import { logError } from './utils/logger'
import { debounce } from './utils/debounce'
import {
  INVALID_CLIPBOARD_FORMAT_MESSAGE,
  NO_MATCHING_FILES_MESSAGE,
  parseClipboardPathLines,
  resolveSelectablePaths,
} from './utils/clipboardBatchSelect'
import {
  DEFAULT_WORKSPACE_SETTINGS,
  findWorkspaceByPath,
  getActiveSession,
  getWorkspaceById,
  getWorkspaceSelectionRestore,
  listWorkspaceItems,
  loadWorkspaceStore,
  markWorkspaceOpened,
  removeWorkspace,
  saveWorkspaceStore,
  setActiveWorkspace,
  type WorkspaceSessionSnapshotInput,
  type WorkspaceStore,
  upsertWorkspace,
  updateWorkspaceSession,
} from './utils/workspaceStore'

type PendingWorkspaceSelectionRestore = {
  id: number
  source: 'workspace-open' | 'workspace-refresh' | 'workspace-autodetect'
  workspaceId: string
  workspaceName: string
  workspacePath: string
  baseBranch: string
  compareBranch: string
  selectedPaths: string[]
  targetDiffSequence: number
}

function AppContent() {
  const [, setAppStatus] = useState<AppStatus>({ state: 'IDLE' })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault?.()
      console.error('[unhandledrejection]', event.reason)
      setErrorMessage(
        event.reason instanceof Error ? event.reason.message : String(event.reason)
      )
    }
    const onError = (event: ErrorEvent) => {
      console.error('[window.error]', event.error || event.message)
      setErrorMessage(event.error?.message || event.message)
    }

    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError)
    }
  }, [])

  const {
    currentDir,
    repoStatus,
    gitClient,
    branches,
    baseBranch,
    setBaseBranch,
    compareBranch,
    setCompareBranch,
    loadRepoFromHandle,
    selectNewRepo,
    refreshRepo,
    resetRepo,
    diffTrigger,
  } = useGitRepository(setAppStatus)

  const [activeTab, setActiveTab] = useState<TabId>('files')
  const [copyFlash, setCopyFlash] = useState<string | null>(null)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewStatus, setPreviewStatus] = useState<FileDiffStatus>('unchanged')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState<{
    base?: { binary: boolean; text: string | null; notFound?: boolean }
    compare?: { binary: boolean; text: string | null; notFound?: boolean }
  } | null>(null)

  // Theme management
  const { effectiveTheme, toggleTheme } = useTheme()

  // User instructions
  const [userInstructions, setUserInstructions] = useState<string>('')
  const [userInstructionsTokens, setUserInstructionsTokens] = useState<number>(0)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gc.userInstructions')
      if (typeof saved === 'string') setUserInstructions(saved)
    } catch (e) {
      logError('instructionsLoad', e)
    }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('gc.userInstructions', userInstructions) } catch (e) { logError('instructionsSave', e) }
    let cancelled = false
    ;(async () => {
      const n = await countTokens(userInstructions || '')
      if (!cancelled) setUserInstructionsTokens(n)
    })()
    return () => { cancelled = true }
  }, [userInstructions])

  const PROMPT_TEMPLATES = [
    { id: 'branch-summary', label: 'Summarize branch diff', content: 'You are an expert engineer. Summarize the changes between the selected branches and explain the impact of the modifications.' },
    { id: 'wd-review', label: 'Review working directory changes', content: 'You are a code reviewer. Review the current working directory diff for potential issues, bugs, or improvements.' },
    { id: 'test-plan', label: 'Suggest tests for diff', content: 'You are a QA engineer. Based on the provided diff, propose relevant unit or integration tests to cover the changes.' },
    { id: 'release-notes', label: 'Draft release notes', content: 'You are a technical writer. Craft concise release notes that describe the user-facing effects of the diff.' },
  ]
  const [templateId, setTemplateId] = useState<string>('')
  useEffect(() => {
    const t = PROMPT_TEMPLATES.find((x) => x.id === templateId)
    if (t) setUserInstructions(t.content)
  }, [templateId])

  // Model selection
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  useEffect(() => {
    getModels().then(setModels)
  }, [])
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gc.selectedModel')
      if (saved) setSelectedModel(saved)
    } catch {}
  }, [])
  useEffect(() => {
    try { if (selectedModel) localStorage.setItem('gc.selectedModel', selectedModel) } catch {}
  }, [selectedModel])

  const tokenLimit = useMemo(() => {
    if (!selectedModel || !models) return 0
    const m = models.find((x) => x.id === selectedModel)
    return m?.context_length ?? 0
  }, [selectedModel, models])

  // File tree management
  const {
    isComputing: isDiffComputing,
    fileTree,
    statusByPath,
    showChangedOnly,
    setShowChangedOnly,
    expandedPaths,
    selectedPaths,
    diffSequence,
    computeDiffAndTree,
    toggleExpand,
    toggleSelect,
    expandAll,
    collapseAll,
    selectAll,
    deselectAll,
    addSelectedPaths,
    removeSelectedPathsByPredicate,
    setSelectedPathsDirect,
    revealPath,
  } = useFileTree(setAppStatus)

  const [treeFilter, setTreeFilter] = useState('')
  const [treeFilterInput, setTreeFilterInput] = useState('')
  const treeFilterInputRef = useRef<HTMLInputElement>(null)
  const debouncedSetTreeFilter = useMemo(() => debounce(setTreeFilter, 150), [])

  // Diff context lines
  const MAX_CONTEXT = 999
  const [diffContextLines, setDiffContextLines] = useState(3)
  const [diffContextImmediate, setDiffContextImmediate] = useState(3)
  const diffContextImmediateRef = useRef(3)
  const diffRangeRef = useRef<HTMLInputElement>(null)
  const debouncedSetDiffContextLines = useMemo(() => debounce(setDiffContextLines, 300), [])

  // Include file tree in output
  const [includeFileTree, setIncludeFileTree] = useState(true)
  const [fileTreeTokens, setFileTreeTokens] = useState(0)

  // Include binary files as file paths
  const [includeBinaryAsPaths, setIncludeBinaryAsPaths] = useState(false)

  const initialWorkspaceStoreRef = useRef<WorkspaceStore | null>(null)
  if (!initialWorkspaceStoreRef.current) {
    initialWorkspaceStoreRef.current = loadWorkspaceStore()
  }
  const [workspaceStore, setWorkspaceStore] = useState<WorkspaceStore>(initialWorkspaceStoreRef.current)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | ''>(
    initialWorkspaceStoreRef.current.activeWorkspaceId ?? '',
  )
  const workspaceStoreRef = useRef(workspaceStore)
  useEffect(() => {
    workspaceStoreRef.current = workspaceStore
  }, [workspaceStore])
  const workspaceItems = useMemo(() => listWorkspaceItems(workspaceStore), [workspaceStore])
  const pendingSelectionRestoreCounterRef = useRef(0)
  const workspaceSwitchRequestRef = useRef(0)
  const skipNextAutoWorkspacePathRef = useRef<string | null>(null)
  const lastAutoWorkspaceSyncPathRef = useRef<string | null>(null)
  const [pendingSelectionRestore, setPendingSelectionRestore] = useState<PendingWorkspaceSelectionRestore | null>(null)

  const commitWorkspaceStore = useCallback((updater: (store: WorkspaceStore) => WorkspaceStore) => {
    setWorkspaceStore((current) => {
      const next = updater(current)
      saveWorkspaceStore(next)
      workspaceStoreRef.current = next
      return next
    })
  }, [])

  const setActiveWorkspaceSelection = useCallback((workspaceId: string | '') => {
    setSelectedWorkspaceId(workspaceId)
    commitWorkspaceStore((current) => setActiveWorkspace(current, workspaceId))
  }, [commitWorkspaceStore])

  const buildWorkspaceSessionSnapshot = useCallback(
    (overrides?: Partial<WorkspaceSessionSnapshotInput>): WorkspaceSessionSnapshotInput => ({
      sessionId: overrides?.sessionId,
      sessionName: overrides?.sessionName,
      baseBranch: overrides?.baseBranch ?? baseBranch,
      compareBranch: overrides?.compareBranch ?? compareBranch,
      selectedPaths: overrides?.selectedPaths ?? Array.from(selectedPaths),
      settings: {
        ...DEFAULT_WORKSPACE_SETTINGS,
        selectedModel,
        userInstructions,
        includeFileTree,
        includeBinaryAsPaths,
        diffContextLines,
        showChangedOnly,
        activeTab,
        ...(overrides?.settings ?? {}),
      },
    }),
    [
      activeTab,
      baseBranch,
      compareBranch,
      diffContextLines,
      includeBinaryAsPaths,
      includeFileTree,
      selectedModel,
      selectedPaths,
      showChangedOnly,
      userInstructions,
    ],
  )

  const applyWorkspaceSettings = useCallback((settings: Partial<typeof DEFAULT_WORKSPACE_SETTINGS>) => {
    setSelectedModel(settings.selectedModel ?? '')
    setUserInstructions(settings.userInstructions ?? '')
    setIncludeFileTree(settings.includeFileTree ?? DEFAULT_WORKSPACE_SETTINGS.includeFileTree)
    setIncludeBinaryAsPaths(settings.includeBinaryAsPaths ?? DEFAULT_WORKSPACE_SETTINGS.includeBinaryAsPaths)
    const nextContextLines = settings.diffContextLines ?? DEFAULT_WORKSPACE_SETTINGS.diffContextLines
    diffContextImmediateRef.current = nextContextLines
    setDiffContextImmediate(nextContextLines)
    setDiffContextLines(nextContextLines)
    setShowChangedOnly(settings.showChangedOnly ?? DEFAULT_WORKSPACE_SETTINGS.showChangedOnly)
    setActiveTab(settings.activeTab ?? DEFAULT_WORKSPACE_SETTINGS.activeTab)
  }, [setShowChangedOnly])

  const queueWorkspaceSelectionRestore = useCallback(
    (params: Omit<PendingWorkspaceSelectionRestore, 'id' | 'targetDiffSequence'> & { expectNextDiff?: boolean }) => {
      const restoreId = ++pendingSelectionRestoreCounterRef.current
      setPendingSelectionRestore({
        id: restoreId,
        source: params.source,
        workspaceId: params.workspaceId,
        workspaceName: params.workspaceName,
        workspacePath: params.workspacePath,
        baseBranch: params.baseBranch,
        compareBranch: params.compareBranch,
        selectedPaths: params.selectedPaths,
        targetDiffSequence: params.expectNextDiff === false ? diffSequence : diffSequence + 1,
      })
    },
    [diffSequence],
  )

  // Flip base and compare branches
  const flipBranches = useCallback(() => {
    if (baseBranch && compareBranch) {
      const temp = baseBranch
      setBaseBranch(compareBranch)
      setCompareBranch(temp)
    }
  }, [baseBranch, compareBranch, setBaseBranch, setCompareBranch])

  // Compute diff when branches change or file watcher triggers
  useEffect(() => {
    if (repoStatus.state === 'ready' && baseBranch && compareBranch) {
      computeDiffAndTree(gitClient, baseBranch, compareBranch)
    }
  }, [repoStatus, baseBranch, compareBranch, gitClient, computeDiffAndTree, diffTrigger])

  // Keep selected workspace in sync when a repository is opened directly.
  useEffect(() => {
    if (!currentDir) {
      setPendingSelectionRestore(null)
      skipNextAutoWorkspacePathRef.current = null
      lastAutoWorkspaceSyncPathRef.current = null
      return
    }
    if (lastAutoWorkspaceSyncPathRef.current === currentDir) {
      return
    }
    if (skipNextAutoWorkspacePathRef.current === currentDir) {
      skipNextAutoWorkspacePathRef.current = null
      lastAutoWorkspaceSyncPathRef.current = currentDir
      return
    }
    lastAutoWorkspaceSyncPathRef.current = currentDir
    const matchedWorkspace = findWorkspaceByPath(workspaceStoreRef.current, currentDir)
    if (!matchedWorkspace) {
      if (selectedWorkspaceId !== '') {
        setActiveWorkspaceSelection('')
      }
      return
    }
    const activeSession = getActiveSession(matchedWorkspace)
    setSelectedWorkspaceId(matchedWorkspace.id)
    commitWorkspaceStore((current) =>
      markWorkspaceOpened(setActiveWorkspace(current, matchedWorkspace.id), matchedWorkspace.id),
    )
    applyWorkspaceSettings(activeSession.settings)
    if (activeSession.baseBranch && branches.includes(activeSession.baseBranch) && baseBranch !== activeSession.baseBranch) {
      setBaseBranch(activeSession.baseBranch)
    }
    if (
      activeSession.compareBranch &&
      branches.includes(activeSession.compareBranch) &&
      compareBranch !== activeSession.compareBranch
    ) {
      setCompareBranch(activeSession.compareBranch)
    }
    queueWorkspaceSelectionRestore({
      source: 'workspace-autodetect',
      workspaceId: matchedWorkspace.id,
      workspaceName: matchedWorkspace.name,
      workspacePath: matchedWorkspace.path,
      baseBranch: activeSession.baseBranch,
      compareBranch: activeSession.compareBranch,
      selectedPaths: activeSession.selectedPaths,
      expectNextDiff: true,
    })
  }, [
    applyWorkspaceSettings,
    baseBranch,
    branches,
    commitWorkspaceStore,
    compareBranch,
    currentDir,
    queueWorkspaceSelectionRestore,
    selectedWorkspaceId,
    setActiveWorkspaceSelection,
    setBaseBranch,
    setCompareBranch,
  ])

  const handleSelectWorkspace = useCallback(
    async (workspaceId: string | '') => {
      if (workspaceId === '') {
        setActiveWorkspaceSelection('')
        return
      }
      const workspace = getWorkspaceById(workspaceStoreRef.current, workspaceId)
      if (!workspace) {
        setActiveWorkspaceSelection('')
        return
      }
      const requestId = ++workspaceSwitchRequestRef.current
      const session = getActiveSession(workspace)
      skipNextAutoWorkspacePathRef.current = workspace.path
      setErrorMessage(null)
      const loaded = await loadRepoFromHandle(workspace.path, {
        preferredBranches: {
          base: session.baseBranch,
          compare: session.compareBranch,
        },
      })
      if (requestId !== workspaceSwitchRequestRef.current) return
      if (!loaded) {
        const shouldRemove = window.confirm(
          'This workspace path cannot be opened right now. Remove it from saved workspaces?',
        )
        if (shouldRemove) {
          commitWorkspaceStore((current) => removeWorkspace(current, workspaceId))
          setSelectedWorkspaceId('')
        }
        return
      }
      setSelectedWorkspaceId(workspaceId)
      commitWorkspaceStore((current) =>
        markWorkspaceOpened(setActiveWorkspace(current, workspaceId), workspaceId),
      )
      applyWorkspaceSettings(session.settings)
      queueWorkspaceSelectionRestore({
        source: 'workspace-open',
        workspaceId,
        workspaceName: workspace.name,
        workspacePath: workspace.path,
        baseBranch: session.baseBranch,
        compareBranch: session.compareBranch,
        selectedPaths: session.selectedPaths,
        expectNextDiff: true,
      })
    },
    [
      applyWorkspaceSettings,
      commitWorkspaceStore,
      loadRepoFromHandle,
      queueWorkspaceSelectionRestore,
      setActiveWorkspaceSelection,
    ],
  )

  const handleSaveWorkspace = useCallback(() => {
    if (!currentDir) return
    const selectedWorkspace =
      selectedWorkspaceId !== '' ? getWorkspaceById(workspaceStoreRef.current, selectedWorkspaceId) : null
    const byPathWorkspace = findWorkspaceByPath(workspaceStoreRef.current, currentDir)
    const existing = selectedWorkspace ?? byPathWorkspace
    const defaultName =
      existing?.name || currentDir.split('/').filter(Boolean).pop() || 'Workspace'
    let nextName = defaultName
    try {
      const enteredName = window.prompt('Enter a name for this workspace:', defaultName)
      if (typeof enteredName === 'string') {
        const trimmed = enteredName.trim()
        if (!trimmed) return
        nextName = trimmed
      }
      // `null` is treated as "prompt unavailable" fallback in desktop webviews.
    } catch {
      // Fall back to default name when prompt isn't supported by the runtime.
    }

    const sessionId = existing ? getActiveSession(existing).id : undefined
    const sessionName = existing ? getActiveSession(existing).name : undefined
    const snapshot = buildWorkspaceSessionSnapshot({ sessionId, sessionName })
    let nextWorkspaceId = ''
    commitWorkspaceStore((current) => {
      const { store, workspaceId } = upsertWorkspace(current, {
        name: nextName,
        path: currentDir,
        workspaceId: existing?.id,
        snapshot,
        markOpened: true,
      })
      nextWorkspaceId = workspaceId
      return store
    })
    if (nextWorkspaceId) {
      setSelectedWorkspaceId(nextWorkspaceId)
    }
  }, [buildWorkspaceSessionSnapshot, commitWorkspaceStore, currentDir, selectedWorkspaceId])

  const handleDeleteWorkspace = useCallback(() => {
    if (selectedWorkspaceId === '') return
    const workspace = getWorkspaceById(workspaceStoreRef.current, selectedWorkspaceId)
    if (!workspace) {
      setActiveWorkspaceSelection('')
      return
    }
    const confirmed = window.confirm(`Remove saved workspace "${workspace.name}"?`)
    if (!confirmed) return
    commitWorkspaceStore((current) => removeWorkspace(current, selectedWorkspaceId))
    setSelectedWorkspaceId('')
  }, [commitWorkspaceStore, selectedWorkspaceId, setActiveWorkspaceSelection])

  const handleSelectNewRepo = useCallback(async () => {
    const selectedPath = await selectNewRepo()
    if (!selectedPath) return
    const matchedWorkspace = findWorkspaceByPath(workspaceStoreRef.current, selectedPath)
    if (!matchedWorkspace) {
      setActiveWorkspaceSelection('')
      return
    }
    const activeSession = getActiveSession(matchedWorkspace)
    setSelectedWorkspaceId(matchedWorkspace.id)
    commitWorkspaceStore((current) =>
      markWorkspaceOpened(setActiveWorkspace(current, matchedWorkspace.id), matchedWorkspace.id),
    )
    applyWorkspaceSettings(activeSession.settings)
    if (activeSession.baseBranch && branches.includes(activeSession.baseBranch) && baseBranch !== activeSession.baseBranch) {
      setBaseBranch(activeSession.baseBranch)
    }
    if (
      activeSession.compareBranch &&
      branches.includes(activeSession.compareBranch) &&
      compareBranch !== activeSession.compareBranch
    ) {
      setCompareBranch(activeSession.compareBranch)
    }
    queueWorkspaceSelectionRestore({
      source: 'workspace-autodetect',
      workspaceId: matchedWorkspace.id,
      workspaceName: matchedWorkspace.name,
      workspacePath: matchedWorkspace.path,
      baseBranch: activeSession.baseBranch,
      compareBranch: activeSession.compareBranch,
      selectedPaths: activeSession.selectedPaths,
      expectNextDiff: true,
    })
  }, [
    applyWorkspaceSettings,
    baseBranch,
    branches,
    commitWorkspaceStore,
    compareBranch,
    queueWorkspaceSelectionRestore,
    selectNewRepo,
    setActiveWorkspaceSelection,
    setBaseBranch,
    setCompareBranch,
  ])

  const handleRefreshWorkspace = useCallback(async () => {
    const baseSnapshot = baseBranch
    const compareSnapshot = compareBranch
    const currentSelection = Array.from(selectedPaths)
    const currentWorkspace =
      selectedWorkspaceId !== '' ? getWorkspaceById(workspaceStoreRef.current, selectedWorkspaceId) : null
    if (currentWorkspace) {
      queueWorkspaceSelectionRestore({
        source: 'workspace-refresh',
        workspaceId: currentWorkspace.id,
        workspaceName: currentWorkspace.name,
        workspacePath: currentWorkspace.path,
        baseBranch: baseSnapshot,
        compareBranch: compareSnapshot,
        selectedPaths: currentSelection,
        expectNextDiff: true,
      })
    }
    await refreshRepo({
      preferredBranches: {
        base: baseSnapshot,
        compare: compareSnapshot,
      },
    })
  }, [baseBranch, compareBranch, queueWorkspaceSelectionRestore, refreshRepo, selectedPaths, selectedWorkspaceId])

  // Persist the latest session snapshot for the active saved workspace.
  useEffect(() => {
    if (!currentDir || selectedWorkspaceId === '') return
    const timeout = window.setTimeout(() => {
      const workspace = getWorkspaceById(workspaceStoreRef.current, selectedWorkspaceId)
      if (!workspace) return
      if (workspace.path !== currentDir) return
      const activeSession = getActiveSession(workspace)
      const snapshot = buildWorkspaceSessionSnapshot({
        sessionId: activeSession.id,
        sessionName: activeSession.name,
      })
      commitWorkspaceStore((current) =>
        updateWorkspaceSession(setActiveWorkspace(current, selectedWorkspaceId), selectedWorkspaceId, snapshot),
      )
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [buildWorkspaceSessionSnapshot, commitWorkspaceStore, currentDir, selectedWorkspaceId])

  useEffect(() => {
    if (!pendingSelectionRestore) return
    if (!currentDir || repoStatus.state !== 'ready' || isDiffComputing) return
    if (currentDir !== pendingSelectionRestore.workspacePath) return
    if (diffSequence < pendingSelectionRestore.targetDiffSequence) return

    const { matched, missing } = getWorkspaceSelectionRestore(
      pendingSelectionRestore.selectedPaths,
      statusByPath.keys(),
    )
    setSelectedPathsDirect(matched)

    const branchMismatch =
      pendingSelectionRestore.baseBranch !== baseBranch ||
      pendingSelectionRestore.compareBranch !== compareBranch
    if (missing.length > 0 || branchMismatch) {
      const pieces: string[] = []
      if (branchMismatch) {
        pieces.push(
          `Restored against ${baseBranch} -> ${compareBranch} instead of ${pendingSelectionRestore.baseBranch} -> ${pendingSelectionRestore.compareBranch}.`,
        )
      }
      if (missing.length > 0) {
        const preview = missing.slice(0, 5).join(', ')
        pieces.push(
          `Could not re-select ${missing.length} saved file${missing.length === 1 ? '' : 's'}: ${preview}${missing.length > 5 ? ', ...' : ''}`,
        )
      }
      setErrorMessage(pieces.join(' '))
    } else if (pendingSelectionRestore.source !== 'workspace-refresh') {
      setErrorMessage(null)
    }
    setPendingSelectionRestore(null)
  }, [
    baseBranch,
    compareBranch,
    currentDir,
    diffSequence,
    isDiffComputing,
    pendingSelectionRestore,
    repoStatus.state,
    setSelectedPathsDirect,
    statusByPath,
  ])

  useEffect(() => {
    if (repoStatus.state === 'error') {
      setPendingSelectionRestore(null)
    }
  }, [repoStatus.state])

  // Preview file
  const previewFile = useCallback(async (path: string, status: FileDiffStatus) => {
    if (!gitClient || !baseBranch || !compareBranch) return
    setPreviewPath(path)
    setPreviewStatus(status)
    setPreviewOpen(true)
    setPreviewData(null)
    try {
      const needBase = status !== 'add'
      const needCompare = status !== 'remove'
      const [baseRes, compareRes] = await Promise.all([
        needBase ? gitClient.readFile(baseBranch, path) : Promise.resolve(undefined),
        needCompare ? gitClient.readFile(compareBranch, path) : Promise.resolve(undefined),
      ])
      setPreviewData({ base: baseRes as any, compare: compareRes as any })
    } catch (err) {
      logError('preview', err)
      setPreviewData({ base: { binary: false, text: null, notFound: true }, compare: { binary: false, text: null, notFound: true } })
    }
  }, [gitClient, baseBranch, compareBranch])

  const renderPreview = () => {
    if (!previewOpen || !previewPath) return null
    return (
      <PreviewModal
        open={previewOpen}
        path={previewPath}
        status={previewStatus}
        baseLabel={baseBranch}
        compareLabel={compareBranch}
        base={previewData?.base}
        compare={previewData?.compare}
        onClose={() => {
          setPreviewOpen(false)
          setPreviewPath(null)
          setPreviewData(null)
        }}
      />
    )
  }

  // Copy all selected files
  const copyAllSelected = useCallback(async () => {
    if (!gitClient || !baseBranch || !compareBranch || selectedPaths.size === 0) return
    setCopyFlash('⏳ Copying...')
    try {
      const paths = Array.from(selectedPaths)
      const MAX_CTX = 999
      const ctx = diffContextLines >= MAX_CTX ? Number.MAX_SAFE_INTEGER : diffContextLines

      // Generate file tree if requested (only for selected files)
      let fileTreeText = ''
      if (includeFileTree && fileTree && selectedPaths.size > 0) {
        fileTreeText = generateFileTreeText(fileTree, selectedPaths)
      }

      // Build header
      const headerText = buildHeader({
        baseBranch,
        compareBranch,
        currentDir: currentDir || '',
        fileCount: paths.length,
        userInstructions,
        fileTreeText,
      })

      const output = [headerText]

      // Fetch file contents with bounded concurrency
      const results = await mapWithConcurrency(
        paths,
        async (path) => {
          const status = statusByPath.get(path) ?? 'unchanged'

          const needBase = status !== 'add'
          const needCompare = status !== 'remove'
          const [baseRes, compareRes] = await Promise.all([
            needBase ? gitClient.readFile(baseBranch, path) : Promise.resolve(undefined),
            needCompare ? gitClient.readFile(compareBranch, path) : Promise.resolve(undefined),
          ])

          return buildFileSection(path, status, baseRes, compareRes, ctx)
        },
        { limit: MAX_CONCURRENT_READS }
      )

      output.push(...results)

      await writeText(output.join(''))
      setCopyFlash('✓ Copied to clipboard!')
      setTimeout(() => setCopyFlash(null), 2000)
    } catch (err) {
      logError('copy', err)
      setCopyFlash('❌ Failed to copy')
      setTimeout(() => setCopyFlash(null), 2000)
    }
  }, [gitClient, baseBranch, compareBranch, selectedPaths, diffContextLines, statusByPath, userInstructions, fileTree, includeFileTree, showChangedOnly, currentDir])

  const handleBatchSelectFromClipboard = useCallback(async () => {
    if (!currentDir || !fileTree) return

    try {
      const clipboardText = await readText()
      const lines = parseClipboardPathLines(clipboardText)
      if (lines.length === 0) {
        setErrorMessage(INVALID_CLIPBOARD_FORMAT_MESSAGE)
        return
      }

      const selectableSet = new Set(statusByPath.keys())
      const { matched, invalidCount, outsideRepoCount } = resolveSelectablePaths(lines, currentDir, selectableSet)

      if (matched.length === 0) {
        if (invalidCount === lines.length && outsideRepoCount === 0) {
          setErrorMessage(INVALID_CLIPBOARD_FORMAT_MESSAGE)
        } else {
          setErrorMessage(NO_MATCHING_FILES_MESSAGE)
        }
        return
      }

      addSelectedPaths(matched)
      setErrorMessage(null)
    } catch (err) {
      logError('batchSelectFromClipboard', err)
      setErrorMessage('Failed to read clipboard content.')
    }
  }, [currentDir, fileTree, statusByPath, addSelectedPaths])

  const handleRemoveTestPathsFromSelection = useCallback(() => {
    removeSelectedPathsByPredicate((path) => path.toLowerCase().includes('test'))
  }, [removeSelectedPathsByPredicate])

  // Calculate file tree tokens
  useEffect(() => {
    if (!includeFileTree || !fileTree || selectedPaths.size === 0) {
      setFileTreeTokens(0)
      return
    }
    let cancelled = false
    ;(async () => {
      const lines: string[] = ['```', '📦 Repository Structure', '']

      // Check if a directory has any selected files in its subtree
      const hasSelectedFiles = (node: any): boolean => {
        if (node.type === 'file') {
          return selectedPaths.has(node.path)
        }
        if (node.children) {
          return node.children.some((child: any) => hasSelectedFiles(child))
        }
        return false
      }

      const walk = (node: any, depth: number) => {
        // Skip files not in selectedPaths
        if (node.type === 'file' && !selectedPaths.has(node.path)) {
          return
        }
        // Skip directories without selected files
        if (node.type === 'dir' && !hasSelectedFiles(node)) {
          return
        }

        if (depth > 0) {
          const indent = '  '.repeat(depth - 1)
          const icon = node.type === 'dir' ? '📁' : '📄'
          const status = node.status ? ` [${node.status.toUpperCase()}]` : ''
          lines.push(`${indent}${icon} ${node.name}${status}`)
        }
        if (node.children) {
          for (const child of node.children) {
            if (!showChangedOnly || child.type === 'dir' || (child.status && child.status !== 'unchanged')) {
              walk(child, depth + 1)
            }
          }
        }
      }
      walk(fileTree, 0)
      lines.push('```', '')
      const text = lines.join('\n')
      const tokens = await countTokens(text)
      if (!cancelled) setFileTreeTokens(tokens)
    })()
    return () => { cancelled = true }
  }, [includeFileTree, fileTree, showChangedOnly, selectedPaths])

  const isReady = repoStatus.state === 'ready'
  const isLoading = repoStatus.state === 'loading'
  const isComputing = fileTree === null && isReady

  // Update error message when repo status changes
  useEffect(() => {
    if (repoStatus.state === 'error') {
      setErrorMessage(repoStatus.error)
    }
  }, [repoStatus])

  return (
    <TokenCountsProvider
      gitClient={gitClient}
      baseRef={baseBranch}
      compareRef={compareBranch}
      selectedPaths={selectedPaths}
      statusByPath={statusByPath}
      diffContextLines={diffContextLines}
      includeBinaryPaths={includeBinaryAsPaths}
    >
      <div id="gc-app" className="gc-app">
      <TopProgressBar visible={isLoading || isComputing} />

      {/* Header */}
      <div className="gc-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => resetRepo()}
            title={isReady ? "Go to landing" : "GitContext"}
            aria-label={isReady ? "Go to landing" : "GitContext"}
            className="btn btn-ghost"
            style={{ border: 'none', background: 'transparent', padding: '4px' }}
          >
            <img
              src={effectiveTheme === 'dark' ? '/gitcontext-full-dark.svg' : '/gitcontext-full.svg'}
              alt="GitContext"
              height={56}
              style={{ display: 'inline-block' }}
            />
          </button>
          <GitHubStarIconButton repoUrl="https://github.com/kccarlos/gitcontext" />
          <BugIconButton url="https://github.com/kccarlos/gitcontext/issues" size={16} />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={toggleTheme} className="btn btn-ghost btn-icon" title="Toggle theme">
            {effectiveTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={handleSelectNewRepo} disabled={isLoading} className="btn btn-primary">
            <Folder size={16} /> {isReady ? 'Change Repository' : 'Open Repository'}
          </button>
        </div>
      </div>

      <ErrorBanner error={errorMessage} onDismiss={() => setErrorMessage(null)} />

      {/* Main content */}
      {!isReady ? (
        <div className="gc-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '2rem' }}>
            <div className="panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Build Perfect Context of Your Codebase for Your AI Chatbot</h2>
              <p>
                GitContext helps you package local file diffs and code into a single, clean prompt,
                ensuring your AI chatbot has the precise information it needs — all without your code ever
                leaving your machine.
              </p>
              <div className="row" style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
                <button type="button" className="btn btn-primary" onClick={() => void handleSelectNewRepo()} disabled={repoStatus.state === 'loading'}>
                  <Folder size={16} /> {repoStatus.state === 'loading' ? 'Opening...' : 'Select Project Folder'}
                </button>
              </div>

              <h3 style={{ fontSize: '1.1rem', marginTop: '1.5rem', marginBottom: '0.75rem' }}>How it works</h3>
              <ul className="how-list">
                <li className="how-item">
                  <span><FolderGit2 size={18} /></span>
                  <span><strong>Open your local Git repo.</strong> Choose any project on your computer. Files are never uploaded.</span>
                </li>
                <li className="how-item">
                  <span><ArrowLeftRight size={18} /></span>
                  <span><strong>Select branches.</strong> Pick two branches to see what changed between them.</span>
                </li>
                <li className="how-item">
                  <span><ListChecks size={18} /></span>
                  <span><strong>Pick files.</strong> Choose which files to include in your prompt.</span>
                </li>
                <li className="how-item">
                  <span><Copy size={18} /></span>
                  <span><strong>Copy & paste.</strong> One click copies everything to your clipboard, ready for ChatGPT or Claude.</span>
                </li>
              </ul>

              <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--surface-2)', borderRadius: '8px' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>
                  <strong>Powered by Rust + Tauri</strong> — Native performance with blazing-fast Git operations via the git2 crate.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <DiffControlBar
            branches={branches}
            baseBranch={baseBranch}
            compareBranch={compareBranch}
            onBaseBranchChange={setBaseBranch}
            onCompareBranchChange={setCompareBranch}
            onFlip={flipBranches}
            onRefresh={handleRefreshWorkspace}
            disabled={isLoading}
            workspaces={workspaceItems}
            selectedWorkspaceId={selectedWorkspaceId}
            currentWorkspacePath={currentDir || ''}
            onWorkspaceSelect={handleSelectWorkspace}
            onSaveWorkspace={handleSaveWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
          />

          <div className="gc-main-content">
            {/* Left panel: File tree */}
            <div className="gc-left-panel">
              {/* Tree controls - sticky */}
              <div className="left-panel-controls">
                {/* File tree controls and filter checkbox in one row */}
                <div className="tree-controls-row">
                  <div className="tree-action-buttons">
                    <button onClick={expandAll} className="btn btn-ghost btn-icon" title="Expand All" disabled={!fileTree}><ChevronsDown size={14} /></button>
                    <button onClick={collapseAll} className="btn btn-ghost btn-icon" title="Collapse All" disabled={!fileTree}><ChevronsUp size={14} /></button>
                    <button onClick={() => selectAll(treeFilter)} className="btn btn-ghost btn-icon" title="Select All" disabled={!fileTree}><CheckSquare size={14} /></button>
                    <button onClick={() => deselectAll(treeFilter)} className="btn btn-ghost btn-icon" title="Deselect All" disabled={!fileTree}><Square size={14} /></button>
                    <button onClick={() => void handleBatchSelectFromClipboard()} className="btn btn-ghost btn-icon" title="Batch Select from Clipboard" disabled={!fileTree || !currentDir}><ListChecks size={14} /></button>
                    <button onClick={handleRemoveTestPathsFromSelection} className="btn btn-ghost btn-icon" title="Remove selected test files" disabled={!fileTree || selectedPaths.size === 0}><Trash2 size={14} /></button>
                  </div>
                  <label className="tree-filter-checkbox">
                    <input type="checkbox" checked={showChangedOnly} onChange={(e) => setShowChangedOnly(e.target.checked)} />
                    Filter changed files only
                  </label>
                </div>

                <div className="tree-search-input">
                  <input
                    ref={treeFilterInputRef}
                    type="text"
                    placeholder="Filter files..."
                    value={treeFilterInput}
                    onChange={(e) => {
                      setTreeFilterInput(e.target.value)
                      debouncedSetTreeFilter(e.target.value)
                    }}
                    className="gc-input"
                  />
                  {treeFilterInput && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => {
                        setTreeFilterInput('')
                        setTreeFilter('')
                        treeFilterInputRef.current?.focus()
                      }}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* File tree */}
              <div className="left-panel-tree-container">
                {fileTree && (
                  <FileTreeView
                    tree={fileTree}
                    expandedPaths={expandedPaths}
                    selectedPaths={selectedPaths}
                    onToggleExpand={toggleExpand}
                    onToggleSelect={toggleSelect}
                    onPreviewFile={previewFile}
                    filterText={treeFilter}
                    showChangedOnly={showChangedOnly}
                  />
                )}
              </div>
            </div>

            {/* Right panel: Tabbed interface */}
            <div className="gc-right-panel">
              <RightPanelTabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                filesCount={selectedPaths.size}
              >
                {activeTab === 'files' ? (
                  <div className="selected-files-container">
                    <SelectedFilesPanel
                      selectedPaths={selectedPaths}
                      statusByPath={statusByPath}
                      onUnselect={(path) => toggleSelect(path)}
                      onPreview={(path, status) => previewFile(path, status)}
                      onReveal={revealPath}
                      refreshing={false}
                    />
                  </div>
                ) : (
                  <div className="settings-container">
                    {/* Model selection */}
                    <div className="settings-section">
                      <label className="settings-label">Target Model</label>
                      <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="gc-select">
                        <option value="">Select a model...</option>
                        {models?.map((m) => (
                          <option key={m.id} value={m.id}>{m.name} ({(m.context_length ?? 0).toLocaleString()} tokens)</option>
                        ))}
                      </select>
                    </div>

                    {/* User instructions */}
                    <div className="settings-section">
                      <label className="settings-label">Prompt / Instructions</label>
                      <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="gc-select">
                        <option value="">Custom prompt...</option>
                        {PROMPT_TEMPLATES.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                      <textarea
                        value={userInstructions}
                        onChange={(e) => setUserInstructions(e.target.value)}
                        className="gc-textarea"
                        placeholder="Enter custom instructions for the LLM..."
                        rows={4}
                      />
                    </div>

                    {/* Options */}
                    <div className="settings-section">
                      <label className="settings-checkbox">
                        <input type="checkbox" checked={includeFileTree} onChange={(e) => setIncludeFileTree(e.target.checked)} />
                        Include file tree structure
                      </label>
                      <label className="settings-checkbox">
                        <input type="checkbox" checked={includeBinaryAsPaths} onChange={(e) => setIncludeBinaryAsPaths(e.target.checked)} />
                        Include binary files as paths
                      </label>
                    </div>

                    {/* Context lines */}
                    <div className="settings-section">
                      <label className="settings-label">Context lines:</label>
                      <div className="context-slider">
                        <input
                          ref={diffRangeRef}
                          type="range"
                          min={0}
                          max={MAX_CONTEXT}
                          step={1}
                          value={diffContextImmediate}
                          onInput={(e) => {
                            const v = Number((e.target as HTMLInputElement).value)
                            diffContextImmediateRef.current = v
                            setDiffContextImmediate(v)
                          }}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            diffContextImmediateRef.current = v
                            setDiffContextImmediate(v)
                            debouncedSetDiffContextLines(v)
                          }}
                        />
                        <span className="context-value">
                          {diffContextImmediate >= MAX_CONTEXT ? '∞' : diffContextImmediate}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </RightPanelTabs>

              <ContextFooter
                filesCount={selectedPaths.size}
                instructionsTokens={userInstructionsTokens}
                fileTreeTokens={includeFileTree ? fileTreeTokens : 0}
                limit={tokenLimit}
                onCopy={copyAllSelected}
                copyFlash={copyFlash}
                disabled={!gitClient || selectedPaths.size === 0}
              />
            </div>
          </div>
        </>
      )}

        {renderPreview()}
      </div>
    </TokenCountsProvider>
  )
}

function App() {
  return <AppContent />
}

export default App

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { Folder, ChevronsDown, ChevronsUp, CheckSquare, Square, Copy, Sun, Moon, ArrowLeftRight, MessageCircleMore, FolderGit2, ListChecks } from 'lucide-react'
import BrowserSupportGate from './components/BrowserSupportGate'
import { HeaderControls } from './components/HeaderControls'
import { ProjectPanel } from './components/ProjectPanel'
import { FileTreeView } from './components/FileTreeView'
import PreviewModal from './components/PreviewModal'
import { useWorkspaces } from './hooks/useWorkspaces'
import { useGitRepository } from './hooks/useGitRepository'
import { useFileTree, type FileDiffStatus } from './hooks/useFileTree'
import { SelectedFilesPanel } from './components/SelectedFilesPanel'
import { StatusBar } from './components/StatusBar'
import TokenUsage from './components/TokenUsage'
import GitHubStarIconButton from './components/GitHubStarIconButton'
import BugIconButton from './components/BugIconButton'
import { getModels } from './utils/models'
import type { ModelInfo } from './types/models'
import type { AppStatus } from './types/appStatus'
import { buildUnifiedDiffForStatus } from './utils/diff'
import { countTokens } from './utils/tokenizer'
// Globally shared token counts
import { TokenCountsProvider, useTokenCountsContext } from './context/TokenCountsContext'
import { logError } from './utils/logger'
import { debounce } from './utils/debounce'

function App() {
  const [appStatus, setAppStatus] = useState<AppStatus>({ state: 'IDLE' })
  // note: we will temporarily set task='tokens' while counting, see effect below

  const [currentDir, setCurrentDir] = useState<FileSystemDirectoryHandle | null>(null)
  const { 
    currentDir: repoDir,
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
  } = useGitRepository(setAppStatus)
  const [notif, setNotif] = useState<string | null>(null)
  const [copyFlash, setCopyFlash] = useState<string | null>(null)
  const [hideStatus, setHideStatus] = useState<boolean>(false)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewStatus, setPreviewStatus] = useState<FileDiffStatus>('unchanged')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState<{
    base?: { binary: boolean; text: string | null; notFound?: boolean }
    compare?: { binary: boolean; text: string | null; notFound?: boolean }
  } | null>(null)

  const [theme, setTheme] = useState<'light' | 'dark' | null>(() => {
    try {
      const saved = localStorage.getItem('gc.theme')
      return saved === 'light' || saved === 'dark' ? saved : null
    } catch (e) {
      logError('themeLoad', e)
      return null
    }
  })
  const [systemDark, setSystemDark] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  const effectiveTheme = theme ?? (systemDark ? 'dark' : 'light')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme)
  }, [effectiveTheme])
  useEffect(() => {
    try {
      if (theme) localStorage.setItem('gc.theme', theme)
      else localStorage.removeItem('gc.theme')
    } catch (e) {
      logError('themePersistence', e)
      setNotif('Your browser blocked saving theme preference.')
    }
  }, [theme])
  const toggleTheme = () => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')

  // Landing example preview state and loader
  const [exampleOpen, setExampleOpen] = useState<boolean>(false)
  const [exampleText, setExampleText] = useState<string | null>(null)
  const [exampleLoading, setExampleLoading] = useState<boolean>(false)
  const [exampleError, setExampleError] = useState<string | null>(null)
  async function loadExampleIfNeeded(): Promise<void> {
    if (exampleText || exampleLoading) return
    setExampleLoading(true)
    setExampleError(null)
    try {
      const url = `${import.meta.env.BASE_URL}example-output.txt`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to load example (${res.status})`)
      const txt = await res.text()
      setExampleText(txt)
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      setExampleError(err)
    } finally {
      setExampleLoading(false)
    }
  }
  async function openExample(): Promise<void> {
    setExampleOpen(true)
    void loadExampleIfNeeded()
  }

  // Prefetch example content while landing is visible so the preview is visible under the overlay
  useEffect(() => {
    const shouldPrefetch = currentDir === null && !exampleText && !exampleLoading
    if (shouldPrefetch) void loadExampleIfNeeded()
  }, [currentDir])

  // --- Column resizer state & handlers ---
  const uiHasResizer = currentDir !== null
  const [narrowLayout, setNarrowLayout] = useState(window.matchMedia('(max-width: 1100px)').matches)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1100px)')
    const onChange = (e: MediaQueryListEvent) => setNarrowLayout(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    if (!uiHasResizer || narrowLayout) return
    const appEl = document.getElementById('gc-app')
    if (!appEl) return

    // Initialize from storage on mount/change
    try {
      const saved = Number(localStorage.getItem('gc.leftCol') || '')
      if (!Number.isNaN(saved) && saved > 0) appEl.style.setProperty('--left-col', `${saved}px`)
    } catch (e) {
      logError('leftColLoad', e)
    }

    const handle = document.getElementById('gc-col-resizer')
    if (!handle) return

    const minLeft = 240 // px
    const computeMaxLeft = () => Math.max(480, Math.floor((appEl.clientWidth - 100) * 0.85))
    let maxLeft = computeMaxLeft()

    // ARIA setup for accessibility
    try {
      handle.setAttribute('role', 'separator')
      handle.setAttribute('aria-orientation', 'vertical')
      handle.setAttribute('aria-valuemin', String(minLeft))
      handle.setAttribute('aria-valuemax', String(maxLeft))
      ;(handle as HTMLElement).tabIndex = 0
      const current = Number((getComputedStyle(appEl).getPropertyValue('--left-col') || '').replace('px','')) || minLeft
      handle.setAttribute('aria-valuenow', String(current))
      handle.setAttribute('aria-label', 'Resize panels')
    } catch {}

    const applyLeft = (px: number) => {
      const clamped = Math.min(Math.max(px, minLeft), maxLeft)
      appEl.style.setProperty('--left-col', `${clamped}px`)
      try {
        localStorage.setItem('gc.leftCol', String(clamped))
      } catch (e) {
        logError('leftColSave', e)
      }
      try { handle.setAttribute('aria-valuenow', String(clamped)) } catch {}
    }

    let dragging = false

    const onPointerDown = (e: PointerEvent) => {
      dragging = true
      appEl.classList.add('resizing')
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      e.preventDefault()
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return
      const rect = appEl.getBoundingClientRect()
      const x = e.clientX - rect.left
      const clamped = Math.min(Math.max(x - 12, minLeft), maxLeft)
      applyLeft(clamped)
    }
    const onPointerUp = (e: PointerEvent) => {
      dragging = false
      appEl.classList.remove('resizing')
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
      // Snap to ~50% if handle is near the middle
      const current = Number((getComputedStyle(appEl).getPropertyValue('--left-col') || '').replace('px','')) || minLeft
      const mid = Math.round(appEl.clientWidth * 0.5)
      if (Math.abs(current - mid) < 24) applyLeft(mid)
    }
    // Double-click to center
    const onDoubleClick = () => {
      const mid = Math.round(appEl.clientWidth * 0.5)
      applyLeft(mid)
    }

    // Keyboard support: ArrowLeft/Right, Home/End
    const onKeyDown = (e: KeyboardEvent) => {
      const step = e.ctrlKey ? 50 : 16
      const curr = Number((getComputedStyle(appEl).getPropertyValue('--left-col') || '').replace('px','')) || minLeft
      switch (e.key) {
        case 'ArrowLeft':
          applyLeft(curr - step)
          e.preventDefault()
          break
        case 'ArrowRight':
          applyLeft(curr + step)
          e.preventDefault()
          break
        case 'Home':
          applyLeft(minLeft)
          e.preventDefault()
          break
        case 'End':
          applyLeft(maxLeft)
          e.preventDefault()
          break
      }
    }

    // Clamp saved width on window resize so layout never overflows
    const onWindowResize = () => {
      const nextMax = computeMaxLeft()
      if (nextMax !== maxLeft) {
        maxLeft = nextMax
        try { handle.setAttribute('aria-valuemax', String(maxLeft)) } catch {}
        const curr = Number((getComputedStyle(appEl).getPropertyValue('--left-col') || '').replace('px','')) || minLeft
        applyLeft(curr) // re-clamp
      }
    }

    handle.addEventListener('pointerdown', onPointerDown)
    handle.addEventListener('dblclick', onDoubleClick)
    handle.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('resize', onWindowResize)
    return () => {
      handle.removeEventListener('pointerdown', onPointerDown)
      handle.removeEventListener('dblclick', onDoubleClick)
      handle.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('resize', onWindowResize)
    }
  }, [uiHasResizer, narrowLayout])

  // User instructions: persisted in localStorage and token-counted for budgeting
  const [userInstructions, setUserInstructions] = useState<string>('')
  const [userInstructionsTokens, setUserInstructionsTokens] = useState<number>(0)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gc.userInstructions')
      if (typeof saved === 'string') setUserInstructions(saved)
    } catch (e) {
      logError('instructionsLoad', e)
      setNotif('Unable to load saved instructions (storage disabled?).')
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
    {
      id: 'branch-summary',
      label: 'Summarize branch diff',
      content:
        'You are an expert engineer. Summarize the changes between the selected branches and explain the impact of the modifications.',
    },
    {
      id: 'wd-review',
      label: 'Review working directory changes',
      content:
        'You are a code reviewer. Review the current working directory diff for potential issues, bugs, or improvements.',
    },
    {
      id: 'test-plan',
      label: 'Suggest tests for diff',
      content:
        'You are a QA engineer. Based on the provided diff, propose relevant unit or integration tests to cover the changes.',
    },
    {
      id: 'release-notes',
      label: 'Draft release notes',
      content:
        'You are a technical writer. Craft concise release notes that describe the user-facing effects of the diff.',
    },
  ]
  const [templateId, setTemplateId] = useState<string>('')

  // Model selection: fetched dynamically; derive token limit from the selected model
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelId, setModelId] = useState<string>(() => {
    const saved = localStorage.getItem('gc.modelId')
    return saved || ''
  })
  const [modelFilter, setModelFilter] = useState<string>('')
  const selectedModel: ModelInfo | undefined = useMemo(
    () => models.find((m) => m.id === modelId) ?? models[0],
    [models, modelId]
  )
  const filteredModels = useMemo(() => {
    const q = modelFilter.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) =>
      (m.name || '').toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q)
    )
  }, [models, modelFilter])
  const tokenLimit = selectedModel?.context_length ?? 0
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const fetched = await getModels()
      if (cancelled) return
      if (Array.isArray(fetched) && fetched.length > 0) {
        setModels(fetched)
        // Initialize selection if not set or missing
        setModelId((prev) => {
          const stillExists = fetched.some((m) => m.id === prev)
          return stillExists && prev ? prev : fetched[0].id
        })
      } else {
        setModels([])
      }
    })()
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    try {
      if (modelId) localStorage.setItem('gc.modelId', modelId)
    } catch (e) {
      logError('modelIdSave', e)
    }
  }, [modelId])

  // Output settings: toggles controlling included sections and UI behavior
  const [includeFileTree, setIncludeFileTree] = useState<boolean>(true)
  const [includeBinaryAsPaths, setIncludeBinaryAsPaths] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('gc.includeBinaryAsPaths')
      if (saved === '0' || saved === 'false') return false
      if (saved === '1' || saved === 'true') return true
    } catch {}
    return true
  })
  const includeBinaryAsPathsRef = useRef<boolean>(includeBinaryAsPaths)
  useEffect(() => { includeBinaryAsPathsRef.current = includeBinaryAsPaths }, [includeBinaryAsPaths])
  const includeBinaryCheckboxRef = useRef<HTMLInputElement | null>(null)
  const lastDeselectedBinaryPathsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    try {
      localStorage.setItem('gc.includeBinaryAsPaths', includeBinaryAsPaths ? '1' : '0')
    } catch {}
  }, [includeBinaryAsPaths])
  const [diffContextLines, setDiffContextLines] = useState<number>(3)
  // Immediate UI value used for copy; debounced value used for token recomputations
  const [diffContextImmediate, setDiffContextImmediate] = useState<number>(3)
  const diffContextImmediateRef = useRef<number>(diffContextImmediate)
  const diffRangeRef = useRef<HTMLInputElement | null>(null)
  const MAX_CONTEXT = 999
  const debouncedSetDiffContextLines = useMemo(() => debounce(setDiffContextLines, 250), [])
  // Collapsible User Instructions
  const [instructionsOpen, setInstructionsOpen] = useState<boolean>(true)

  // Selected files token counts come from hook; compute extras for file tree and assemble total
  const [fileTreeTokens, setFileTreeTokens] = useState<number>(0)
  const [treeFilter, setTreeFilter] = useState<string>('')
  const [treeTokensBusy, setTreeTokensBusy] = useState<boolean>(false)
  // (moved into TokenCountsContext)

  function generateSelectedTreeString(paths: string[]): string {
    // Build a minimal tree of selected files only
    type Node = { name: string; children?: Map<string, Node>; isFile?: boolean }
    const root: Node = { name: '' }
    for (const p of paths.sort()) {
      const parts = p.split('/')
      let curr = root
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        curr.children ||= new Map()
        if (!curr.children.has(part)) curr.children.set(part, { name: part })
        const next = curr.children.get(part) as Node
        if (i === parts.length - 1) next.isFile = true
        curr = next
      }
    }
    function walk(n: Node, indent: string): string[] {
      const out: string[] = []
      if (!n.children) return out
      const entries = Array.from(n.children.values())
      entries.sort((a, b) => {
        const aDir = a.children && !a.isFile
        const bDir = b.children && !b.isFile
        if (aDir !== bDir) return aDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      entries.forEach((child, idx) => {
        const isLast = idx === entries.length - 1
        const prefix = indent + (isLast ? '└── ' : '├── ')
        out.push(prefix + child.name)
        const nextIndent = indent + (isLast ? '    ' : '│   ')
        out.push(...walk(child, nextIndent))
      })
      return out
    }
    const body = walk(root, '')
    return body.join('\n') + (body.length ? '\n' : '')
  }

  // Recompute file tree tokens when selection or toggle changes
  // Defer this effect until after file tree state is available
  const [pendingTreeTokenCalc, setPendingTreeTokenCalc] = useState(0)
  const {
    isComputing,
    fileTree,
    showChangedOnly,
    setShowChangedOnly,
    expandedPaths,
    selectedPaths,
    computeDiffAndTree,
    toggleExpand,
    toggleSelect,
    expandAll,
    collapseAll,
    selectAll,
    deselectAll,
  } = useFileTree(setAppStatus)

  // Mirror selection into a ref to avoid stale closures in event handlers
  const selectedPathsRef = useRef<Set<string>>(selectedPaths)
  useEffect(() => { selectedPathsRef.current = selectedPaths }, [selectedPaths])

  useEffect(() => {
    setPendingTreeTokenCalc((x) => x + 1)
  }, [selectedPaths, includeFileTree])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!includeFileTree) {
        setFileTreeTokens(0)
        setTreeTokensBusy(false)
        return
      }
      setTreeTokensBusy(true)
      const list = Array.from(selectedPaths)
      const treeStr = generateSelectedTreeString(list)
      const n = await countTokens(treeStr)
      if (!cancelled) {
        setFileTreeTokens(n)
        setTreeTokensBusy(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTreeTokenCalc])

  const [progress, setProgress] = useState<{ message: string; percent: number } | null>(null)

  const { workspaces, selectedWorkspaceId, handleSelect, saveWorkspaceFromHandle, removeSelected, setSelectedWorkspaceId } = useWorkspaces(loadRepoFromHandle)

  // Wrap folder picker so UI reflects an unsaved workspace after selection
  const selectNewRepoAndReset = async () => {
    const loaded = await selectNewRepo()
    if (loaded) {
      // Mark as unsaved in the unified selector until user saves
      setSelectedWorkspaceId('')
    }
  }

  async function computeDiff(): Promise<void> {
    try {
      await computeDiffAndTree(gitClient, baseBranch, compareBranch, setProgress)
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      setNotif(`Failed to compute diff: ${err.message}`)
      setProgress(null)
      setAppStatus({ state: 'ERROR', message: err.message })
    }
  }

  // Automatically recompute diff when branches change
  useEffect(() => {
    const key = `${baseBranch}→${compareBranch}`
    // Avoid firing while the worker is initializing or repo not ready
    if (
      repoStatus.state === 'ready' &&
      gitClient &&
      baseBranch &&
      compareBranch &&
      baseBranch !== compareBranch &&
      !isComputing &&
      lastDiffKeyRef.current !== key
    ) {
      lastDiffKeyRef.current = key
      setProgress({ message: `Preparing diff: ${baseBranch} → ${compareBranch}`, percent: 10 })
      setAppStatus({ state: 'LOADING', task: 'diff', message: `Preparing diff: ${baseBranch} → ${compareBranch}` , progress: 10 })
      try { console.info('[app-status]', { state: 'LOADING', task: 'diff', message: `Preparing diff: ${baseBranch} → ${compareBranch}`, progress: 10 }) } catch { /* noop */ }
      void computeDiff()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseBranch, compareBranch, gitClient, repoStatus.state, isComputing])

  // Track last computed pair to prevent effect loops and double runs
  const lastDiffKeyRef = useRef<string>('')

  useEffect(() => {
    // Keep a local mirror of currentDir for legacy display
    setCurrentDir(repoDir)
  }, [repoDir])
  

  // Keep the main UI visible during refresh; only hide when no project selected
  const projectLoaded = currentDir !== null

  // Auto-hide READY status messages after 5 seconds
  useEffect(() => {
    if (appStatus.state === 'READY') {
      setHideStatus(false)
      const t = window.setTimeout(() => setHideStatus(true), 5000)
      return () => window.clearTimeout(t)
    }
    setHideStatus(false)
  }, [appStatus])

  // Build a path -> status map from current file tree (unconditional to satisfy Rules of Hooks)
  const statusByPath = useMemo<Map<string, FileDiffStatus>>(() => {
    const m = new Map<string, FileDiffStatus>()
    const walk = (n: unknown) => {
      if (!n) return
      const node = n as { type: 'dir' | 'file'; path: string; status?: FileDiffStatus; children?: unknown[] }
      if (node.type === 'file') m.set(node.path, node.status ?? 'unchanged')
      ;(node.children as unknown[] | undefined)?.forEach(walk)
    }
    if (fileTree) walk(fileTree)
    return m
  }, [fileTree])

  // Token counting is now provided globally via <TokenCountsProvider />.

  // (progress is handled in the TokenCountsProvider; no local reset needed)

  // (moved status-bar tie-in to a small bridge component below)

  const headerRight = (
    <HeaderControls
      workspaces={workspaces}
      selectedWorkspaceId={selectedWorkspaceId}
      onSelectWorkspace={handleSelect}
      onSaveWorkspace={() => saveWorkspaceFromHandle(currentDir)}
      onRemoveWorkspace={removeSelected}
      onSelectNewRepo={selectNewRepoAndReset}
      projectLoaded={projectLoaded}
      currentDir={currentDir}
    />
  )

  // file tree handled by useFileTree + FileTreeView (inline where used)

  async function previewFile(path: string, status: FileDiffStatus): Promise<void> {
    if (!gitClient) return
    try {
      const toFetchBase = status !== 'add'
      const toFetchCompare = status !== 'remove'

      const [baseRes, compareRes] = await Promise.all([
        toFetchBase && baseBranch ? gitClient.readFile(baseBranch, path) : Promise.resolve(undefined),
        toFetchCompare && compareBranch ? gitClient.readFile(compareBranch, path) : Promise.resolve(undefined),
      ])

      setPreviewPath(path)
      setPreviewStatus(status)
      setPreviewData({
        base: baseRes as unknown as { binary: boolean; text: string | null; notFound?: boolean },
        compare: compareRes as unknown as { binary: boolean; text: string | null; notFound?: boolean },
      })
      setPreviewOpen(true)
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      setNotif(`Failed to read file content: ${err.message}`)
    }
  }

  function renderPreview(): JSX.Element | null {
    if (!previewOpen || !previewPath) return null
    return (
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        path={previewPath}
        status={previewStatus}
        baseLabel={baseBranch || '(unset)'}
        compareLabel={compareBranch || '(unset)'}
        base={previewData?.base}
        compare={previewData?.compare}
      />
    )
  }

  // Assemble final context content for the clipboard
  async function copyAllSelected() {
    if (!gitClient || !baseBranch || !compareBranch) return
    try {
      const selected = Array.from(selectedPathsRef.current)
      // Resolve refs for display; handle WORKDIR sentinel specially
      const WORKDIR = '__WORKDIR__'
      const baseDisp = baseBranch === WORKDIR
        ? 'WORKDIR'
        : (await gitClient.resolveRef(baseBranch)).oid.slice(0, 7)
      const compareDisp = compareBranch === WORKDIR
        ? 'WORKDIR'
        : (await gitClient.resolveRef(compareBranch)).oid.slice(0, 7)

      // Git Context section
      const contextLines = [
        '## Select branches',
        `- Base: ${baseBranch} (commit: ${baseDisp})`,
        `- Compare: ${compareBranch} (commit: ${compareDisp})`,
        '',
      ]

      // Optional File Tree section
      const treeStr = includeFileTree ? generateSelectedTreeString(selected) : ''
      const treeSection = includeFileTree && treeStr
        ? '## File Tree\n\n' + '```\n' + treeStr + '```\n\n'
        : ''

      // User Instructions section
      const instrSection = userInstructions?.trim()
        ? `## User Instructions\n\n${userInstructions}\n\n`
        : ''

      // File sections
      const fileSections: string[] = []
      const includeBinaryNow = (includeBinaryCheckboxRef.current?.checked ?? includeBinaryAsPathsRef.current)
        const pathsToProcess = includeBinaryNow ? selected : selected.filter((p) => !isLikelyBinaryPath(p))
      const fileReadPromises = pathsToProcess.map((path) => {
        const status = statusByPath.get(path) ?? 'unchanged'
        const needBase = status !== 'add'
        const needCompare = status !== 'remove'
        return Promise.all([
          needBase ? gitClient.readFile(baseBranch, path) : Promise.resolve(undefined),
          needCompare ? gitClient.readFile(compareBranch, path) : Promise.resolve(undefined),
        ]).then(([baseRes, compareRes]) => ({ path, status, baseRes, compareRes }))
      })
      const fileContents = await Promise.all(fileReadPromises)
        for (const { path, status, baseRes, compareRes } of fileContents) {
          const isBinary = (baseRes as { binary?: boolean } | undefined)?.binary || (compareRes as { binary?: boolean } | undefined)?.binary || isLikelyBinaryPath(path)
        const header = `## FILE: ${path} (${status.toUpperCase()})\n\n`
        if (isBinary) {
          // When we filtered out likely-binary paths earlier and still hit binary here (e.g. unknown ext),
          // respect the includeBinaryNow toggle: either include a path-only note or skip entirely.
            if (!includeBinaryNow) continue
            fileSections.push(`## FILE: ${path} (${status.toUpperCase()})\n\n`)
          continue
        }

        // Read the live slider value to tolerate cases where input events were not dispatched
        const sliderVal = (() => { try { return Number(diffRangeRef.current?.value) } catch { return NaN } })()
        const rawContext = Number.isFinite(sliderVal) && !Number.isNaN(sliderVal)
          ? sliderVal
          : Number(diffContextImmediateRef.current ?? diffContextImmediate)
        const ctx = rawContext >= MAX_CONTEXT ? Number.MAX_SAFE_INTEGER : rawContext

        if (status === 'add') {
          // Always include full content for newly added files
          const newTextRaw = (compareRes as { text?: string } | undefined)?.text ?? ''
          const newText = newTextRaw.endsWith('\n') ? newTextRaw.slice(0, -1) : newTextRaw
          const lang = inferLangFromPath(path)
          fileSections.push(header + '```' + lang + '\n' + newText + '\n```\n\n')
        } else if (status === 'modify' || status === 'remove') {
          const diffText = buildUnifiedDiffForStatus(
            status,
            path,
            baseRes as { binary: boolean; text: string | null; notFound?: boolean } | undefined,
            compareRes as { binary: boolean; text: string | null; notFound?: boolean } | undefined,
            { context: ctx },
          )
          if (diffText) {
            fileSections.push(header + '```diff\n' + diffText + '```\n\n')
          } else {
            // Fallback: no text
            fileSections.push(header + '_No textual content available._\n\n')
          }
        } else {
          // unchanged: include full base content
          const text = (baseRes as { text?: string } | undefined)?.text ?? ''
          const lang = inferLangFromPath(path)
          fileSections.push(header + '```' + lang + '\n' + (text || '') + '\n```\n\n')
        }
      }

      const final = [
        instrSection,
        contextLines.join('\n'),
        treeSection,
        ...fileSections,
      ].filter(Boolean).join('\n')

      await navigator.clipboard.writeText(final)
      setCopyFlash('✅ Copied!')
      setTimeout(() => setCopyFlash(null), 2000)
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      setCopyFlash('Copy failed. See console.')
      setTimeout(() => setCopyFlash(null), 3000)
      console.error('[copy]', err)
    }
  }

  function inferLangFromPath(p: string): string {
    const lower = p.toLowerCase()
    if (lower.endsWith('.ts')) return 'ts'
    if (lower.endsWith('.tsx')) return 'tsx'
    if (lower.endsWith('.js')) return 'js'
    if (lower.endsWith('.jsx')) return 'jsx'
    if (lower.endsWith('.json')) return 'json'
    if (lower.endsWith('.md')) return 'markdown'
    if (lower.endsWith('.css')) return 'css'
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
    return ''
  }
  function isLikelyBinaryPath(p: string): boolean {
    const lower = p.toLowerCase()
    const binaryExts = [
      '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico',
      '.pdf', '.zip', '.rar', '.7z', '.tar', '.gz', '.tgz',
      '.mp3', '.wav', '.flac', '.mp4', '.mov', '.avi', '.mkv', '.webm',
      '.exe', '.dll', '.bin', '.dmg', '.pkg', '.iso',
      '.woff', '.woff2', '.ttf', '.otf'
    ]
    return binaryExts.some((ext) => lower.endsWith(ext))
  }

  // Small helper: use context to feed TokenUsage without prop-drilling
  function TokenUsageWithContext({
    filesCount,
    instructionsTokens,
    fileTreeTokens,
    limit,
  }: {
    filesCount: number
    instructionsTokens: number
    fileTreeTokens: number
    limit: number
  }) {
    const { total } = useTokenCountsContext()
    const src = useCallback(() => total, [total])
    return (
      <TokenUsage
        fileTokensTotalSource={src}
        filesCount={filesCount}
        instructionsTokens={instructionsTokens}
        fileTreeTokens={fileTreeTokens}
        limit={limit}
      />
    )
  }

  // Bridge: keeps your StatusBar messages/progress exactly as before, now fed by the context.
  function TokenCountingStatusBridge({
    includeTree,
    treeBusy,
  }: {
    includeTree: boolean
    treeBusy: boolean
  }) {
    const { busy, progress } = useTokenCountsContext()
    useEffect(() => {
      const anotherTaskLoading =
        appStatus.state === 'LOADING' && 'task' in appStatus && appStatus.task !== 'tokens'

      const tokenWorkActive = busy || treeBusy
      const selectedWeight = includeTree ? 85 : 100
      const treeWeight = includeTree ? 15 : 0
      const selectedPortion = Math.round((Math.max(0, Math.min(100, progress.percent)) * selectedWeight) / 100)
      const treePortion = treeBusy ? 0 : treeWeight
      const overallPercent = Math.max(0, Math.min(100, selectedPortion + treePortion))

      if (tokenWorkActive) {
        if (!anotherTaskLoading && currentDir !== null) {
          const files = selectedPaths.size
          const msg =
            files > 0
              ? `Counting tokens for ${files.toLocaleString()} selected file${files === 1 ? '' : 's'}…`
              : 'Counting tokens…'
          setAppStatus({
            state: 'LOADING',
            task: 'tokens',
            message: `${msg} ${overallPercent}%`,
            progress: overallPercent,
          })
          try {
            console.info('[app-status]', {
              state: 'LOADING',
              task: 'tokens',
              message: `${msg} ${overallPercent}%`,
              progress: overallPercent,
            })
          } catch {}
        }
      } else {
        if (
          appStatus.state === 'LOADING' &&
          'task' in appStatus &&
          appStatus.task === 'tokens' &&
          currentDir !== null
        ) {
          setAppStatus({ state: 'READY', message: 'Token counts updated.' })
          try {
            console.info('[app-status]', { state: 'READY', message: 'Token counts updated.' })
          } catch {}
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [busy, treeBusy, progress.percent, includeTree, currentDir, selectedPaths.size])
    return null
  }

  return (
    <BrowserSupportGate>
      <TokenCountsProvider
        gitClient={gitClient}
        baseRef={baseBranch}
        compareRef={compareBranch}
        selectedPaths={selectedPaths}
        statusByPath={statusByPath}
        diffContextLines={diffContextLines}
      >
      <div className={`app-container${!projectLoaded ? ' landing-full' : ''}`} id="gc-app">
        <header className="header">
          <div className="brand">
            <button type="button" onClick={() => resetRepo()} title="Go to landing" aria-label="Go to landing" className="btn btn-ghost" style={{ border: 'none', background: 'transparent' }}>
              <img
                src={`${import.meta.env.BASE_URL}${effectiveTheme === 'dark' ? 'gitcontext-full-dark.svg' : 'gitcontext-full.svg'}`}
                alt="GitContext"
                height={56}
                style={{ display: 'inline-block' }}
              />
            </button>
            <GitHubStarIconButton repoUrl="https://github.com/kccarlos/gitcontext" />
            <BugIconButton url="https://github.com/kccarlos/gitcontext/issues" size={16} />
            <button type="button" onClick={toggleTheme} className="btn btn-ghost btn-icon" aria-label="Toggle color scheme" title="Toggle color scheme">
              {effectiveTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          {headerRight}
        </header>

        

        {!projectLoaded ? (
          <section className="panel" style={{ gridColumn: '1 / -1' }}>
            <div className="landing-grid">
              <div>
                <h2 className="landing-title">Build Perfect Context of Your Codebase for Your AI Chatbot</h2>
                <p>
                  GitContext helps you package local file diffs and code into a single, clean prompt,
                  ensuring your AI chatbot has the precise information it needs — all without your code ever
                  leaving your machine.
                </p>
                <div className="row" style={{ marginTop: '.5rem' }}>
                  <button type="button" className="btn btn-primary" onClick={() => void selectNewRepo()}>
                    <Folder size={16} /> Select Project Folder
                  </button>
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  Requires a Chromium-based browser (Chrome/Edge). Your data stays local.
                </p>

                <h3 className="landing-subtitle">How it works</h3>
                <ul className="how-list">
                  <li className="how-item">
                    <span><FolderGit2 size={18} /></span>
                    <span><strong>Open your local Git repo.</strong> Choose any project on your computer. Files are never uploaded.</span>
                  </li>
                  <li className="how-item">
                    <span><ArrowLeftRight size={18} /></span>
                    <span><strong>Select branches.</strong> Pick a branch or your current working directory to see what changed.</span>
                  </li>
                  <li className="how-item">
                    <span><ListChecks size={18} /></span>
                    <span><strong>Select files to include.</strong> Both changed and unchanged files could be included.</span>
                  </li>
                  <li className="how-item">
                    <span><MessageCircleMore size={18} /></span>
                    <span><strong>Add prompt to tell your AI what to do.</strong> Choose from a template or type in your own.</span>
                  </li>
                  <li className="how-item">
                    <span><Copy size={18} /></span>
                    <span><strong>Copy to clipboard.</strong> Generate a token‑efficient context ready for your favorite AI Chatbot.</span>
                  </li>
                </ul>

                <div style={{ marginTop: '1.25rem' }}>
                  <div className="row" style={{ marginTop: 8 }}>
                    <GitHubStarIconButton repoUrl="https://github.com/kccarlos/gitcontext" />
                    <a href="https://github.com/kccarlos/gitcontext" target="_blank" rel="noreferrer" className="hint">
                      Star this project on GitHub
                    </a>
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <BugIconButton url="https://github.com/kccarlos/gitcontext/issues" size={16} />
                    <a href="https://github.com/kccarlos/gitcontext/issues" target="_blank" rel="noreferrer" className="hint">
                      Report a problem
                    </a>
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button type="button" onClick={toggleTheme} className="btn btn-ghost btn-icon" aria-label="Toggle color scheme" title="Toggle color scheme" style={{ border: 'none', background: 'transparent' }}>
                      {effectiveTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                    <a href="#" onClick={(e) => { e.preventDefault(); toggleTheme(); }} className="hint">
                      {effectiveTheme === 'dark' ? 'Turn on the light' : 'Turn off the light'}
                    </a>
                  </div>
                </div>
              </div>
              <div className="landing-visual landing-visual-stack">
                {/* Underlay: example content always present under overlay */}
                <div className="example-output" role="region" aria-label="Example output">
                  {exampleLoading && <div className="hint">Loading example…</div>}
                  {exampleError && <div className="hint" style={{ color: 'crimson' }}>{exampleError}</div>}
                  {!exampleLoading && !exampleError && (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {exampleText}
                    </pre>
                  )}
                </div>

                {/* Overlay: clickable svg that hides on click */}
                {!exampleOpen && (
                  <button type="button" className="landing-visual-button landing-visual-overlay" onClick={() => void openExample()} aria-label="Show me an example" title="Show me an example">
                    <img className="img-rounded" src={`${import.meta.env.BASE_URL}landing-placeholder.svg`} alt="GitContext demo – Show me an example" />
                  </button>
                )}
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="left-panel">
              <div className="panel-section">
                <h2>Select branches to diff</h2>
                <ProjectPanel
                  branches={branches}
                  baseBranch={baseBranch}
                  setBaseBranch={setBaseBranch}
                  compareBranch={compareBranch}
                  setCompareBranch={setCompareBranch}
                  isComputing={!!progress}
                  onRefresh={async () => {
                    setProgress({ message: 'Refreshing repository…', percent: 0 })
                    await refreshRepo()
                    // Do not manually compute diff here; let the effect run with the fresh client
                    setProgress(null)
                  }}
                />
                {appStatus.state === 'LOADING' && appStatus.task === 'diff' && (
                  <StatusBar
                    message={appStatus.message}
                    percent={typeof appStatus.progress === 'number' ? appStatus.progress : 0}
                    indeterminate={appStatus.progress === 'indeterminate'}
                  />
                )}
              </div>

              <div className="panel-section">
                <div className="row-between">
                  <h2 style={{ margin: 0 }}>File Tree</h2>
                  <div className="row">
                    <input className="input"
                      type="text"
                      placeholder="Filter files…"
                      value={treeFilter}
                      onChange={(e) => setTreeFilter(e.target.value)}
                    />
                    <button type="button" onClick={expandAll} disabled={!fileTree} title="Expand all" className="btn btn-ghost btn-icon"><ChevronsDown size={18} /></button>
                    <button type="button" onClick={collapseAll} disabled={!fileTree} title="Collapse all" className="btn btn-ghost btn-icon"><ChevronsUp size={18} /></button>
                    <button type="button" onClick={selectAll} disabled={!fileTree} title="Select all" className="btn btn-ghost btn-icon"><CheckSquare size={16} /></button>
                    <button type="button" onClick={deselectAll} disabled={!fileTree} title="Deselect all" className="btn btn-ghost btn-icon"><Square size={16} /></button>
                    <label className="row" style={{ alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={showChangedOnly}
                        onChange={(e) => setShowChangedOnly(e.target.checked)}
                      />
                      Filter Changed Files
                    </label>
                  </div>
                </div>
                <FileTreeView
                  key={`${baseBranch}→${compareBranch}`}
                  tree={fileTree}
                  expandedPaths={expandedPaths}
                  selectedPaths={selectedPaths}
                  showChangedOnly={showChangedOnly}
                  filterText={treeFilter}
                  onToggleExpand={toggleExpand}
                  onToggleSelect={toggleSelect}
                  onPreviewFile={(path, status) => previewFile(path, status)}
                />
              </div>
            </div>

            {/* Resizer handle between columns */}
            <div
              className="column-resizer"
              id="gc-col-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panels"
              tabIndex={0}
            />

            <div className="right-panel">
              <div className="panel-section">
                <div className="row-between">
                  <h2 style={{ margin: 0 }}>User Instructions</h2>
                  <div className="row">
                    <span className="hint">{userInstructionsTokens.toLocaleString()} tokens</span>
                    <button
                      type="button"
                      onClick={() => setInstructionsOpen((v) => !v)}
                      aria-expanded={instructionsOpen}
                      title={instructionsOpen ? 'Collapse' : 'Expand'}
                    >
                      {instructionsOpen ? '▾' : '▸'}
                    </button>
                  </div>
                </div>
                {instructionsOpen && (
                  <>
                    <textarea
                      className="instructions-textarea textarea"
                      placeholder="You are an expert engineer. Analyze the following..."
                      value={userInstructions}
                      onChange={(e) => setUserInstructions(e.target.value)}
                      style={{ minHeight: 56, height: 56 }}
                      rows={3}
                    />
                    <div className="row" style={{ marginTop: 8 }}>
                      <select
                        className="select"
                        value={templateId}
                        onChange={(e) => {
                          const id = e.target.value
                          setTemplateId(id)
                          const tmpl = PROMPT_TEMPLATES.find((t) => t.id === id)
                          if (tmpl) setUserInstructions(tmpl.content)
                        }}
                        style={{ flexGrow: 1 }}
                      >
                        <option value="">Choose template…</option>
                        {PROMPT_TEMPLATES.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="panel-section">
                <h2>Output Settings</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="row" style={{ width: '100%' }}>
                    <span>Model:</span>
                    <select
                      className="select"
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                      disabled={models.length === 0}
                      style={{ minWidth: 260 }}
                    >
                      {models.length === 0 ? (
                        <option value="">Loading models…</option>
                      ) : filteredModels.length === 0 ? (
                        <option value="" disabled>No matches</option>
                      ) : (
                        filteredModels.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))
                      )}
                    </select>
                    <input
                      className="input"
                      type="text"
                      placeholder="Filter models…"
                      aria-label="Filter models"
                      value={modelFilter}
                      onChange={(e) => setModelFilter(e.target.value)}
                      disabled={models.length === 0}
                      style={{ flex: 1 }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input data-testid="toggle-include-file-tree" type="checkbox" checked={includeFileTree} onChange={(e) => setIncludeFileTree(e.target.checked)} />
                      Include File Tree
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        data-testid="toggle-include-binary-paths"
                        ref={includeBinaryCheckboxRef}
                        type="checkbox"
                        checked={includeBinaryAsPaths}
                        onChange={(e) => {
                          const next = e.target.checked
                          setIncludeBinaryAsPaths(next)
                          includeBinaryAsPathsRef.current = next
                          if (!next) {
                            // Proactively deselect likely-binary files from the selection and remember them
                            const curr = Array.from(selectedPathsRef.current)
                            const removed: string[] = []
                            for (const p of curr) {
                              if (isLikelyBinaryPath(p)) {
                                removed.push(p)
                                toggleSelect(p)
                              }
                            }
                            lastDeselectedBinaryPathsRef.current = new Set(removed)
                          } else {
                            // Toggle switched ON: restore previously auto-deselected binary paths
                            const toRestore = Array.from(lastDeselectedBinaryPathsRef.current)
                            for (const p of toRestore) {
                              if (!selectedPathsRef.current.has(p)) toggleSelect(p)
                            }
                            lastDeselectedBinaryPathsRef.current.clear()
                          }
                        }}
                      />
                      Include Binary as Paths
                    </label>
                    <div className="row ml-auto">
                      <button
                        data-testid="copy-all-selected"
                        type="button"
                        className="btn btn-primary"
                        onClick={() => { void copyAllSelected() }}
                        disabled={selectedPaths.size === 0 || !gitClient}
                      >
                        {copyFlash ? copyFlash : (<><Copy size={16} /> COPY ALL SELECTED</>)}
                      </button>
                    </div>
                  </div>

                  <div className="row" style={{ width: '100%' }}>
                    <label className="row" style={{ width: '100%' }}>
                      <span style={{whiteSpace:'nowrap'}}>Context&nbsp;lines:</span>
                      <input
                        data-testid="context-lines-slider"
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
                        style={{flex:1, minWidth: '120px'}}
                        title="Number of context lines to include around diffs"
                      />
                      <span style={{width:36,textAlign:'right'}}>
                        {diffContextImmediate >= MAX_CONTEXT ? '∞' : diffContextImmediate}
                      </span>
                    </label>
                  </div>

                  {/* Token usage summary (fed from global context) */}
                  <TokenUsageWithContext
                    filesCount={selectedPaths.size}
                    instructionsTokens={userInstructionsTokens}
                    fileTreeTokens={includeFileTree ? fileTreeTokens : 0}
                    limit={tokenLimit}
                  />

                  
                </div>
              </div>

              <div className="panel-section">
                <SelectedFilesPanel
                  key={`sel-${selectedPaths.size}`}
                  selectedPaths={selectedPaths}
                  statusByPath={statusByPath}
                  onUnselect={(path) => toggleSelect(path)}
                  onPreview={(path, status) => previewFile(path, status)}
                  refreshing={repoStatus.state === 'loading'}
                  filterText={treeFilter}
                />
              </div>

              {renderPreview()}
            </div>
          </>
        )}
      </div>

      <div style={{ padding: '0 2rem 2rem 2rem' }}>
        {repoStatus.state === 'error' && (
          <div className="hint" style={{ color: 'crimson' }}>{repoStatus.error}</div>
        )}
        {notif && <div className="hint" style={{ color: 'green' }}>{notif}</div>}

        {!copyFlash && (
          <div
            className="status-footer-fixed"
            style={{ display: hideStatus && appStatus.state === 'READY' ? 'none' : undefined }}
          >
            <StatusBar
              message={
                appStatus.state === 'LOADING' ||
                appStatus.state === 'READY' ||
                appStatus.state === 'ERROR'
                  ? appStatus.message
                  : 'Idle. Select a repository to begin.'
              }
              percent={
                appStatus.state === 'LOADING'
                  ? (typeof appStatus.progress === 'number' ? appStatus.progress : 0)
                  : appStatus.state === 'READY'
                  ? 100
                  : 0
              }
              indeterminate={
                appStatus.state === 'LOADING' && appStatus.progress === 'indeterminate'
              }
            />
          </div>
        )}
      </div>

      {/* Keep StatusBar updates synchronized with global token counting */}
      <TokenCountingStatusBridge includeTree={includeFileTree} treeBusy={treeTokensBusy} />
      </TokenCountsProvider>
    </BrowserSupportGate>
  )
}

export default App

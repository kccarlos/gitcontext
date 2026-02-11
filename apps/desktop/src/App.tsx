import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { ChevronsDown, ChevronsUp, CheckSquare, Square, Sun, Moon, Folder, FolderGit2, ListChecks, Copy, ArrowLeftRight } from 'lucide-react'
import { FileTreeView, PreviewModal, GitHubStarIconButton, BugIconButton } from '@gitcontext/ui'
import { type FileDiffStatus, isBinaryPath, MAX_CONCURRENT_READS } from '@gitcontext/core'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useGitRepository } from './hooks/useGitRepository'
import { useFileTree } from './hooks/useFileTree'
import { SelectedFilesPanel } from './components/SelectedFilesPanel'
import { TopProgressBar } from './components/TopProgressBar'
import { ErrorBanner } from './components/ErrorBanner'
import { DiffControlBar } from './components/DiffControlBar'
import { RightPanelTabs, type TabId } from './components/RightPanelTabs'
import { ContextFooter } from './components/ContextFooter'
import { getModels } from './utils/models'
import type { ModelInfo } from './types/models'
import type { AppStatus } from './types/appStatus'
import { buildUnifiedDiffForStatus } from './utils/diff'
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

function AppContent() {
  const [, setAppStatus] = useState<AppStatus>({ state: 'IDLE' })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const {
    currentDir,
    repoStatus,
    gitClient,
    branches,
    baseBranch,
    setBaseBranch,
    compareBranch,
    setCompareBranch,
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
    }
  }, [theme])
  const toggleTheme = () => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')

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
    fileTree,
    statusByPath,
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
    addSelectedPaths,
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
        const lines: string[] = ['```', '📦 Repository Structure', '']

        // Helper to check if a directory contains any selected files
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
          // Only include directories that contain selected files, or files that are selected
          if (node.type === 'file' && !selectedPaths.has(node.path)) {
            return
          }
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
              walk(child, depth + 1)
            }
          }
        }
        walk(fileTree, 0)
        lines.push('```', '')
        fileTreeText = lines.join('\n')
      }

      // Build header
      const header = [
        `# Git Diff Context: ${baseBranch} → ${compareBranch}`,
        '',
        `Repository: ${currentDir || 'Unknown'}`,
        `Base: ${baseBranch}`,
        `Compare: ${compareBranch}`,
        `Files: ${paths.length}`,
        '',
      ]

      if (userInstructions.trim()) {
        header.push('## Instructions', '', userInstructions.trim(), '')
      }

      if (fileTreeText) {
        header.push('## File Tree', '', fileTreeText)
      }

      header.push('## Diffs', '')

      const output = [header.join('\n')]

      // Fetch file contents with bounded concurrency
      const results = await mapWithConcurrency(
        paths,
        async (path) => {
          const status = statusByPath.get(path) ?? 'unchanged'
          const looksBinary = isBinaryPath(path)

          if (looksBinary) {
            return `## FILE: ${path} (${status.toUpperCase()})\n\n[Binary file]\n\n`
          }

          const needBase = status !== 'add'
          const needCompare = status !== 'remove'
          const [baseRes, compareRes] = await Promise.all([
            needBase ? gitClient.readFile(baseBranch, path) : Promise.resolve(undefined),
            needCompare ? gitClient.readFile(compareBranch, path) : Promise.resolve(undefined),
          ])

          if (status === 'modify' || status === 'add' || status === 'remove') {
            const isBinary = Boolean((baseRes as any)?.binary) || Boolean((compareRes as any)?.binary)
            if (isBinary) {
              return `## FILE: ${path} (${status.toUpperCase()})\n\n[Binary file]\n\n`
            }
            if (status === 'add' && ctx === Number.MAX_SAFE_INTEGER) {
              return `## FILE: ${path} (ADD)\n\n\`\`\`\n${(compareRes as any)?.text ?? ''}\n\`\`\`\n\n`
            }
            const diffText = buildUnifiedDiffForStatus(status, path, baseRes as any, compareRes as any, { context: ctx })
            return diffText ? `## FILE: ${path} (${status.toUpperCase()})\n\n\`\`\`diff\n${diffText}\n\`\`\`\n\n` : ''
          } else {
            const isBinary = Boolean((baseRes as any)?.binary)
            const text = isBinary || (baseRes as any)?.notFound ? '' : (baseRes as any)?.text ?? ''
            return text ? `## FILE: ${path} (UNCHANGED)\n\n\`\`\`\n${text}\n\`\`\`\n\n` : ''
          }
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
          <button onClick={selectNewRepo} disabled={isLoading} className="btn btn-primary">
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
                <button type="button" className="btn btn-primary" onClick={() => void selectNewRepo()} disabled={repoStatus.state === 'loading'}>
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
            onRefresh={refreshRepo}
            disabled={isLoading}
            projectName={currentDir ? currentDir.split('/').pop() || currentDir : undefined}
            projectPath={currentDir || undefined}
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

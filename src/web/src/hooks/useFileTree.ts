import { useCallback, useState } from 'react'
import type { GitWorkerClient } from '../utils/gitWorkerClient'
import type { AppStatus } from '../types/appStatus'

export type FileDiffStatus = 'modify' | 'add' | 'remove' | 'unchanged'

export type FileTreeNode = {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: FileTreeNode[]
  status?: FileDiffStatus
  isLikelyBinary?: boolean
}

type ProgressSetter = (update: { message: string; percent: number } | null) => void

export function useFileTree(setAppStatus?: (s: AppStatus) => void) {
  const [diffFiles, setDiffFiles] = useState<Array<{ path: string; type: 'modify' | 'add' | 'remove' }>>([])
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null)
  const [showChangedOnly, setShowChangedOnly] = useState<boolean>(true)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [isComputing, setIsComputing] = useState<boolean>(false)

  const buildTreeFromPaths = useCallback((allPaths: string[], diffMap: Map<string, FileDiffStatus>): FileTreeNode => {
    const root: FileTreeNode = { name: '', path: '', type: 'dir', children: [] }
    const dirMap = new Map<string, FileTreeNode>()
    dirMap.set('', root)

    function ensureDir(dirPath: string): FileTreeNode {
      if (dirMap.has(dirPath)) return dirMap.get(dirPath) as FileTreeNode
      const parentPath = dirPath.split('/').slice(0, -1).join('/')
      const name = dirPath.split('/').slice(-1)[0]
      const parentNode = ensureDir(parentPath)
      const node: FileTreeNode = { name, path: dirPath, type: 'dir', children: [] }
      ;(parentNode.children as FileTreeNode[]).push(node)
      dirMap.set(dirPath, node)
      return node
    }

    const likelyBinary = (p: string): boolean => {
      const lower = p.toLowerCase()
      // Heuristic similar to App.tsx; keep in sync
      const exts = ['.png','.jpg','.jpeg','.gif','.webp','.svg','.ico','.pdf','.zip','.gz','.tgz','.rar','.7z','.mp4','.mp3','.wav','.mov','.avi','.mkv','.woff','.woff2','.ttf']
      return exts.some((e) => lower.endsWith(e))
    }

    for (const fullPath of allPaths) {
      const parts = fullPath.split('/')
      const dirPath = parts.slice(0, -1).join('/')
      const fileName = parts[parts.length - 1]
      const parent = ensureDir(dirPath)
      if (!(parent.children as FileTreeNode[]).some((c) => c.type === 'file' && c.name === fileName)) {
        const fileNode: FileTreeNode = {
          name: fileName,
          path: fullPath,
          type: 'file',
          status: (diffMap.get(fullPath) ?? 'unchanged') as FileDiffStatus,
          isLikelyBinary: likelyBinary(fullPath),
        }
        ;(parent.children as FileTreeNode[]).push(fileNode)
      }
    }

    function sort(node: FileTreeNode) {
      if (!node.children) return
      node.children.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name)
        return a.type === 'dir' ? -1 : 1
      })
      for (const c of node.children) sort(c)
    }
    sort(root)
    return root
  }, [])

  const computeDiffAndTree = useCallback(
    async (
      gitClient: GitWorkerClient | null,
      baseBranch: string,
      compareBranch: string,
      setProgress?: ProgressSetter,
    ) => {
      if (!gitClient || !baseBranch || !compareBranch || baseBranch === compareBranch) {
        setDiffFiles([])
        setFileTree(null)
        setSelectedPaths(new Set())
        setExpandedPaths(new Set())
        return
      }
      setIsComputing(true)
      
      try {
        setAppStatus?.({ state: 'LOADING', task: 'diff', message: 'Computing file differences…', progress: 25 })
        try { console.info('[app-status]', { state: 'LOADING', task: 'diff', message: 'Computing file differences…', progress: 25 }) } catch {}
        setProgress?.({ message: 'Computing file differences…', percent: 25 })
        
        const res = await gitClient.diff(baseBranch, compareBranch)
        setDiffFiles(res.files)

        setProgress?.({ message: 'Fetching file list…', percent: 50 })
        setAppStatus?.({ state: 'LOADING', task: 'diff', message: 'Fetching file list…', progress: 50 })
        try { console.info('[app-status]', { state: 'LOADING', task: 'diff', message: 'Fetching file list…', progress: 50 }) } catch {}
        const baseList = await gitClient.listFiles(baseBranch)
        const compareList = await gitClient.listFiles(compareBranch)
        const diffMap = new Map<string, FileDiffStatus>()
        for (const f of res.files) diffMap.set(f.path, f.type as FileDiffStatus)
        // Build union from both sides to keep unchanged files present on either side
        const union = new Set<string>([...baseList.files, ...compareList.files])
        setProgress?.({ message: 'Building file tree…', percent: 75 })
        setAppStatus?.({ state: 'LOADING', task: 'diff', message: 'Building file tree…', progress: 75 })
        try { console.info('[app-status]', { state: 'LOADING', task: 'diff', message: 'Building file tree…', progress: 75 }) } catch {}
        const tree = buildTreeFromPaths(Array.from(union), diffMap)
        setFileTree(tree)

        const sel = new Set<string>()
        for (const f of res.files) {
          // Reset selection to reflect new diff context: select modified and added files
          if (f.type === 'modify' || f.type === 'add') sel.add(f.path)
        }
        setSelectedPaths(sel)

        const exp = new Set<string>()
        for (const f of res.files) {
          const parts = f.path.split('/').slice(0, -1)
          let acc = ''
          for (const part of parts) {
            acc = acc ? `${acc}/${part}` : part
            exp.add(acc)
          }
        }
        setExpandedPaths(exp)
        setProgress?.(null)
        setAppStatus?.({ state: 'READY', message: `Diff complete (${baseBranch} → ${compareBranch}). Files changed: ${res.files.length}` })
        try { console.info('[app-status]', { state: 'READY', base: baseBranch, compare: compareBranch, changed: res.files.length }) } catch {}
      } catch (err: any) {
        setProgress?.({ message: err?.message || 'Failed to compute diff', percent: 0 })
        setAppStatus?.({ state: 'ERROR', message: err?.message || 'Failed to compute diff' })
        try { console.info('[app-status]', { state: 'ERROR', message: err?.message || 'Failed to compute diff' }) } catch {}
        throw err
      } finally {
        // Always reset computing state regardless of success or failure
        setIsComputing(false)
      }
    },
    [buildTreeFromPaths],
  )

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const toggleSelect = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    if (!fileTree) return
    const dirs: string[] = []
    const walk = (n: FileTreeNode) => {
      if (n.type === 'dir') {
        if (n.path) dirs.push(n.path)
        n.children?.forEach(walk)
      }
    }
    walk(fileTree)
    setExpandedPaths(new Set(dirs))
  }, [fileTree])

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set())
  }, [])

  const selectAll = useCallback(() => {
    if (!fileTree) return
    const paths: string[] = []
    const walk = (n: FileTreeNode) => {
      if (n.type === 'file') {
        if (!showChangedOnly || (n.status ?? 'unchanged') !== 'unchanged') paths.push(n.path)
      } else {
        n.children?.forEach(walk)
      }
    }
    walk(fileTree)
    setSelectedPaths(new Set(paths))
  }, [fileTree, showChangedOnly])

  const deselectAll = useCallback(() => {
    setSelectedPaths(new Set())
  }, [])

  return {
    isComputing,
    diffFiles,
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
  }
}



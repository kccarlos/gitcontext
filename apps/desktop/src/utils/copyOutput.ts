import { isBinaryPath, type FileDiffStatus, type FileTreeNode } from '@gitcontext/core'
import { buildUnifiedDiffForStatus, type ReadFileSide } from './diff'

export type CopyOutputParams = {
  baseBranch: string
  compareBranch: string
  currentDir: string
  paths: string[]
  statusByPath: Map<string, FileDiffStatus>
  userInstructions: string
  includeFileTree: boolean
  fileTree: FileTreeNode | null
  selectedPaths: Set<string>
  diffContextLines: number
}

/**
 * Generate the file tree text portion of the copy output.
 */
export function generateFileTreeText(
  fileTree: FileTreeNode,
  selectedPaths: Set<string>,
): string {
  const lines: string[] = ['```', '📦 Repository Structure', '']

  const hasSelectedFiles = (node: FileTreeNode): boolean => {
    if (node.type === 'file') {
      return selectedPaths.has(node.path)
    }
    if (node.children) {
      return node.children.some((child) => hasSelectedFiles(child))
    }
    return false
  }

  const walk = (node: FileTreeNode, depth: number) => {
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
  return lines.join('\n')
}

/**
 * Build the header portion of the copy output.
 */
export function buildHeader(params: {
  baseBranch: string
  compareBranch: string
  currentDir: string
  fileCount: number
  userInstructions: string
  fileTreeText: string
}): string {
  const header = [
    `# Git Diff Context: ${params.baseBranch} → ${params.compareBranch}`,
    '',
    `Repository: ${params.currentDir || 'Unknown'}`,
    `Base: ${params.baseBranch}`,
    `Compare: ${params.compareBranch}`,
    `Files: ${params.fileCount}`,
    '',
  ]

  if (params.userInstructions.trim()) {
    header.push('## Instructions', '', params.userInstructions.trim(), '')
  }

  if (params.fileTreeText) {
    header.push('## File Tree', '', params.fileTreeText)
  }

  header.push('## Diffs', '')

  return header.join('\n')
}

/**
 * Build the output text for a single file based on its status and content.
 */
export function buildFileSection(
  path: string,
  status: FileDiffStatus,
  baseRes: ReadFileSide,
  compareRes: ReadFileSide,
  ctx: number,
): string {
  const looksBinary = isBinaryPath(path)

  if (looksBinary) {
    return `## FILE: ${path} (${status.toUpperCase()})\n\n[Binary file]\n\n`
  }

  if (status === 'modify' || status === 'add' || status === 'remove') {
    const isBinary =
      Boolean((baseRes as any)?.binary) || Boolean((compareRes as any)?.binary)
    if (isBinary) {
      return `## FILE: ${path} (${status.toUpperCase()})\n\n[Binary file]\n\n`
    }
    if (status === 'add' && ctx === Number.MAX_SAFE_INTEGER) {
      return `## FILE: ${path} (ADD)\n\n\`\`\`\n${(compareRes as any)?.text ?? ''}\n\`\`\`\n\n`
    }
    const diffText = buildUnifiedDiffForStatus(
      status,
      path,
      baseRes as any,
      compareRes as any,
      { context: ctx },
    )
    return diffText
      ? `## FILE: ${path} (${status.toUpperCase()})\n\n\`\`\`diff\n${diffText}\n\`\`\`\n\n`
      : ''
  } else {
    const isBinary = Boolean((baseRes as any)?.binary)
    const text =
      isBinary || (baseRes as any)?.notFound
        ? ''
        : ((baseRes as any)?.text ?? '')
    return text
      ? `## FILE: ${path} (UNCHANGED)\n\n\`\`\`\n${text}\n\`\`\`\n\n`
      : ''
  }
}

/**
 * Build the complete copy output string from the given params.
 * This is the pure, testable core of the copyAllSelected logic.
 */
export function buildCopyOutput(
  params: CopyOutputParams,
  fileResults: Array<{ path: string; section: string }>,
): string {
  let fileTreeText = ''
  if (params.includeFileTree && params.fileTree && params.selectedPaths.size > 0) {
    fileTreeText = generateFileTreeText(params.fileTree, params.selectedPaths)
  }

  const headerText = buildHeader({
    baseBranch: params.baseBranch,
    compareBranch: params.compareBranch,
    currentDir: params.currentDir,
    fileCount: params.paths.length,
    userInstructions: params.userInstructions,
    fileTreeText,
  })

  const output = [headerText]
  for (const result of fileResults) {
    output.push(result.section)
  }

  return output.join('')
}

/**
 * Core types for GitContext shared across platforms
 */

/**
 * Result of loading a git repository
 */
export type LoadRepoResult = {
  branches: string[]
  defaultBranch: string | null
}

/**
 * A file in a diff result
 */
export type DiffFile = {
  path: string
  type: 'modify' | 'add' | 'remove'
}

/**
 * Result of a diff operation
 */
export type DiffResult = {
  files: DiffFile[]
}

/**
 * Result of reading a file
 */
export type ReadFileResult = {
  binary: boolean
  text: string | null
  notFound?: boolean
}

/**
 * File content with metadata
 */
export type FileContent = ReadFileResult

/**
 * File diff result (unified diff format)
 */
export type FileDiff = DiffFile

/**
 * File diff status for UI display
 */
export type FileDiffStatus = 'modify' | 'add' | 'remove' | 'unchanged'

/**
 * File tree node for UI display
 */
export type FileTreeNode = {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: FileTreeNode[]
  status?: FileDiffStatus
  isLikelyBinary?: boolean
}

/**
 * Workspace list item for UI display
 */
export type WorkspaceListItem = {
  id: number
  name: string
  folderName?: string
}

/**
 * GitService interface - abstraction for git operations
 *
 * This interface decouples the UI from the underlying git implementation.
 * Different platforms (web with isomorphic-git, desktop with Tauri/Rust)
 * implement this interface to provide git functionality.
 */
export interface GitService {
  /**
   * Load a repository and return available branches
   */
  loadRepo(
    repoKey: string,
    opts: {
      dirHandle?: FileSystemDirectoryHandle
      gitFiles?: Array<{ path: string; data: Uint8Array }>
      workFiles?: Array<{ path: string; data: Uint8Array }>
    }
  ): Promise<LoadRepoResult>

  /**
   * List all branches in the repository
   */
  listBranches(): Promise<LoadRepoResult>

  /**
   * Get diff between two refs (branches, commits, or WORKDIR)
   */
  getDiff(base: string, compare: string): Promise<DiffResult>

  /**
   * List all files at a given ref
   */
  listFiles(ref: string): Promise<{ files: string[] }>

  /**
   * List all files at a given ref with their object IDs
   */
  listFilesWithOids(ref: string): Promise<{ files: Array<{ path: string; oid: string }> }>

  /**
   * Read file content at a specific ref
   */
  readFile(ref: string, path: string): Promise<FileContent>

  /**
   * Resolve a ref to an object ID
   */
  resolveRef(ref: string): Promise<{ oid: string }>

  /**
   * Dispose of resources
   */
  dispose(): void
}

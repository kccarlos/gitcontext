import { invoke } from '@tauri-apps/api/core'
import type {
  GitService,
  LoadRepoResult,
  DiffResult,
  FileContent,
} from '@gitcontext/core'

/**
 * TauriGitService - Desktop implementation using Rust git2 crate
 *
 * This service implements the GitService interface using Tauri's invoke
 * to call Rust functions that use native git2 for high performance.
 */
export class TauriGitService implements GitService {
  private repoPath: string | null = null

  async loadRepo(
    repoKey: string,
    _opts: {
      dirHandle?: FileSystemDirectoryHandle
      gitFiles?: Array<{ path: string; data: Uint8Array }>
      workFiles?: Array<{ path: string; data: Uint8Array }>
    }
  ): Promise<LoadRepoResult> {
    // For desktop, we use the repo path directly (no browser FileSystemDirectoryHandle)
    // The repoKey should be the actual file system path
    this.repoPath = repoKey

    return invoke<LoadRepoResult>('open_repo', { path: repoKey })
  }

  async listBranches(): Promise<LoadRepoResult> {
    if (!this.repoPath) {
      throw new Error('No repository loaded')
    }

    return invoke<LoadRepoResult>('get_branches', { path: this.repoPath })
  }

  async getDiff(base: string, compare: string): Promise<DiffResult> {
    if (!this.repoPath) {
      throw new Error('No repository loaded')
    }

    return invoke<DiffResult>('git_diff', {
      path: this.repoPath,
      base,
      compare,
    })
  }

  async listFiles(_ref: string): Promise<{ files: string[] }> {
    // TODO: Implement in Rust if needed
    // For now, we can derive this from git_diff against an empty tree
    throw new Error('listFiles not yet implemented in TauriGitService')
  }

  async listFilesWithOids(_ref: string): Promise<{ files: Array<{ path: string; oid: string }> }> {
    // TODO: Implement in Rust if needed
    throw new Error('listFilesWithOids not yet implemented in TauriGitService')
  }

  async readFile(ref: string, path: string): Promise<FileContent> {
    if (!this.repoPath) {
      throw new Error('No repository loaded')
    }

    const result = await invoke<{
      binary: boolean
      text: string | null
      not_found?: boolean
    }>('read_file_blob', {
      path: this.repoPath,
      refName: ref,
      filePath: path,
    })

    return {
      binary: result.binary,
      text: result.text,
      notFound: result.not_found,
    }
  }

  async resolveRef(_ref: string): Promise<{ oid: string }> {
    // TODO: Implement in Rust if needed
    throw new Error('resolveRef not yet implemented in TauriGitService')
  }

  dispose(): void {
    this.repoPath = null
  }
}

import { invoke } from '@tauri-apps/api/core'
import type {
  GitService,
  LoadRepoResult,
  DiffResult,
  FileContent,
  CommitInfo,
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

  async listFiles(ref: string): Promise<{ files: string[] }> {
    if (!this.repoPath) {
      throw new Error('No repository loaded')
    }

    const result = await invoke<{ files: string[] }>('list_files', {
      path: this.repoPath,
      refName: ref,
    })

    return result
  }

  async listFilesWithOids(ref: string): Promise<{ files: Array<{ path: string; oid: string }> }> {
    if (!this.repoPath) {
      throw new Error('No repository loaded')
    }

    const result = await invoke<{ files: Array<{ path: string; oid: string }> }>('list_files_with_oids', {
      path: this.repoPath,
      refName: ref,
    })

    return result
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

  async resolveRef(ref: string): Promise<{ oid: string }> {
    if (!this.repoPath) {
      throw new Error('No repository loaded')
    }

    const result = await invoke<{ oid: string }>('resolve_ref', {
      path: this.repoPath,
      refName: ref,
    })

    return result
  }

  async listCommits(ref: string, maxCount?: number): Promise<{ commits: CommitInfo[] }> {
    if (!this.repoPath) {
      throw new Error('No repository loaded')
    }

    return invoke<{ commits: CommitInfo[] }>('list_commits', {
      path: this.repoPath,
      refName: ref,
      maxCount: maxCount ?? null,
    })
  }

  /**
   * Dispose of resources by clearing the repo path.
   * Note: This service instance remains valid and can be reused after dispose().
   * Call loadRepo() again to load a new repository.
   */
  async dispose(): Promise<void> {
    if (this.repoPath) {
      try {
        await invoke('close_repo')
      } catch (e) {
        console.error('Failed to close repo watcher:', e)
      }
    }
    this.repoPath = null
  }
}

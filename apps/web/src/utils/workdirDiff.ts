/**
 * Main-thread WORKDIR diff computation that doesn't require worktree snapshot.
 *
 * Strategy:
 * 1. List tracked files from the non-WORKDIR ref (via worker)
 * 2. For each file, read from WORKDIR (main thread) and compute hash
 * 3. Compare hashes to detect modifications
 * 4. Support cancellation and progress updates
 */

import { readWorkdirFile } from './workdirReader'
import { MAX_CONCURRENT_READS } from '@gitcontext/core'

// Compute Git blob hash (format: "blob <size>\0<content>")
async function hashGitBlob(data: Uint8Array): Promise<string> {
  // Git blob format: "blob <size>\0<content>"
  const header = `blob ${data.length}\0`
  const headerBytes = new TextEncoder().encode(header)
  const combined = new Uint8Array(headerBytes.length + data.length)
  combined.set(headerBytes)
  combined.set(data, headerBytes.length)

  const hashBuffer = await crypto.subtle.digest('SHA-1', combined)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

export type WorkdirDiffOptions = {
  dirHandle: FileSystemDirectoryHandle
  filesWithOids: Array<{ path: string; oid: string }>
  onProgress?: (completed: number, total: number) => void
  signal?: AbortSignal
}

export type WorkdirDiffResult = {
  files: Array<{ path: string; type: 'modify' | 'add' | 'remove' }>
}

/**
 * Compute diff between a commit and WORKDIR without requiring worktree snapshot.
 * Only checks tracked files (files that exist in the commit).
 */
export async function computeWorkdirDiff(options: WorkdirDiffOptions): Promise<WorkdirDiffResult> {
  const { dirHandle, filesWithOids, onProgress, signal } = options

  const changedFiles: Array<{ path: string; type: 'modify' | 'add' | 'remove' }> = []
  const totalFiles = filesWithOids.length
  let completed = 0

  // Initial progress
  onProgress?.(0, totalFiles)

  // Process files in batches to avoid overwhelming the system
  for (let i = 0; i < filesWithOids.length; i += MAX_CONCURRENT_READS) {
    // Check for cancellation
    if (signal?.aborted) {
      throw new Error('WORKDIR diff cancelled')
    }

    const batch = filesWithOids.slice(i, i + MAX_CONCURRENT_READS)

    const batchPromises = batch.map(async ({ path, oid }) => {
      try {
        // Read file from WORKDIR
        const workdirFile = await readWorkdirFile(dirHandle, path)

        if (workdirFile.notFound) {
          // File exists in commit but not in WORKDIR → removed
          return { path, type: 'remove' as const }
        }

        if (workdirFile.binary) {
          // Binary file - we can't easily compare, so assume modified if it exists
          // A more sophisticated approach would read and hash the binary content
          return null // Skip binary files for now
        }

        // Compute hash of WORKDIR version
        const workdirText = workdirFile.text || ''
        const workdirBytes = new TextEncoder().encode(workdirText)
        const workdirHash = await hashGitBlob(workdirBytes)

        // Compare hashes
        if (workdirHash !== oid) {
          return { path, type: 'modify' as const }
        }

        // No change
        return null
      } catch (err) {
        // Error reading file - treat as removed
        return { path, type: 'remove' as const }
      }
    })

    const batchResults = await Promise.all(batchPromises)

    // Collect changed files
    for (const result of batchResults) {
      if (result !== null) {
        changedFiles.push(result)
      }
    }

    completed += batch.length
    onProgress?.(completed, totalFiles)
  }

  return { files: changedFiles }
}

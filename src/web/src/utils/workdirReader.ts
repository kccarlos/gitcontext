/**
 * Main-thread utility for reading working directory files on-demand.
 *
 * This bypasses the need to snapshot the entire worktree into LightningFS,
 * enabling GitContext to scale to very large repositories.
 *
 * Strategy:
 * - Binary files (by extension): Check existence only, don't read content
 * - Other files: Read content, sniff first 8KB for binary detection
 */

import { isBinaryPath, detectBinaryByContent, SNIFF_BYTES } from '../shared/binary'

export type WorkdirFileResult = {
  binary: boolean
  text: string | null
  notFound?: boolean
}

/**
 * Read a file from the working directory using FileSystemDirectoryHandle.
 *
 * @param rootHandle - The root directory handle (repo root)
 * @param filepath - Relative path from repo root (e.g., "src/index.ts")
 * @returns File content or binary indicator
 *
 * Performance notes:
 * - Binary paths (by extension) skip full content reads
 * - Text files are fully read but only first 8KB is sniffed for binary detection
 */
export async function readWorkdirFile(
  rootHandle: FileSystemDirectoryHandle,
  filepath: string,
): Promise<WorkdirFileResult> {
  // Fast path: known binary extensions - check existence only
  if (isBinaryPath(filepath)) {
    try {
      // Navigate to file and verify it exists
      await getFileHandle(rootHandle, filepath)
      return { binary: true, text: null, notFound: false }
    } catch {
      return { binary: false, text: null, notFound: true }
    }
  }

  // Read file content for text files (or unknown extensions)
  try {
    const fileHandle = await getFileHandle(rootHandle, filepath)
    const file = await fileHandle.getFile()
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    // Sniff first SNIFF_BYTES for binary content
    const sample = bytes.subarray(0, Math.min(bytes.length, SNIFF_BYTES))
    const binary = detectBinaryByContent(sample, filepath)

    if (binary) {
      return { binary: true, text: null, notFound: false }
    }

    // Decode as UTF-8 text
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    return { binary: false, text, notFound: false }
  } catch (err) {
    // File not found or access denied
    return { binary: false, text: null, notFound: true }
  }
}

/**
 * Helper to navigate nested directory structure and get file handle.
 * Handles paths like "src/components/Button.tsx"
 */
async function getFileHandle(
  rootHandle: FileSystemDirectoryHandle,
  filepath: string,
): Promise<FileSystemFileHandle> {
  // Split path into directory components and filename
  const parts = filepath.split('/').filter(Boolean)

  if (parts.length === 0) {
    throw new Error('Invalid filepath: empty')
  }

  // Navigate through directories
  let currentDir = rootHandle
  for (let i = 0; i < parts.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(parts[i], { create: false })
  }

  // Get final file handle
  const filename = parts[parts.length - 1]
  return await currentDir.getFileHandle(filename, { create: false })
}

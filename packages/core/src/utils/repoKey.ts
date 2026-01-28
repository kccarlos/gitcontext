/**
 * Repository key derivation utilities.
 * Ensures consistent key generation for localStorage, IndexedDB, and cache operations.
 */

/**
 * Derives a repository key from a directory handle name.
 * This key is used for:
 * - LightningFS IndexedDB database naming (`gitfs-${repoKey}`)
 * - localStorage branch selection keys (`branchSel:${repoKey}`)
 *
 * @param dirHandle - FileSystemDirectoryHandle for the repository
 * @returns Repository key string (e.g., "repo-my-project")
 */
export function deriveRepoKey(dirHandle: FileSystemDirectoryHandle): string {
  // Use consistent format: repo-${sanitizedName}
  const sanitized = dirHandle.name.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `repo-${sanitized}`
}

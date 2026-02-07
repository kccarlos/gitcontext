/**
 * Cache management utilities for LightningFS IndexedDB storage
 */

/**
 * Clears the LightningFS IndexedDB cache for a given repository key.
 * This forces a fresh load on the next repository open.
 *
 * @param repoKey - The repository key (e.g., derived from folder name)
 * @returns Promise that resolves when cache is cleared
 */
export async function clearRepositoryCache(repoKey: string): Promise<void> {
  const dbName = `gitfs-${repoKey}`

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName)

    request.onsuccess = () => {
      console.info(`[cache] Cleared IndexedDB cache for: ${dbName}`)
      resolve()
    }

    request.onerror = () => {
      console.error(`[cache] Failed to clear cache for: ${dbName}`, request.error)
      reject(request.error)
    }

    request.onblocked = () => {
      console.warn(`[cache] Cache clear blocked for: ${dbName}. Close other tabs using this repo.`)
      // Still resolve - the clear will happen when unblocked
      resolve()
    }
  })
}

/**
 * Lists all LightningFS IndexedDB databases (for debugging/admin).
 * Useful for seeing what's cached.
 */
export async function listCachedRepositories(): Promise<string[]> {
  if (!indexedDB.databases) {
    // Older browsers don't support this API
    console.warn('[cache] indexedDB.databases() not supported in this browser')
    return []
  }

  const databases = await indexedDB.databases()
  return databases
    .map((db) => db.name)
    .filter((name): name is string => name !== undefined && name.startsWith('gitfs-'))
}

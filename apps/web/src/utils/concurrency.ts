/**
 * Bounded concurrency utilities for processing large arrays without overwhelming resources
 */

export type MapWithConcurrencyOptions = {
  /** Maximum number of concurrent operations */
  limit: number
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal
}

/**
 * Maps an array through an async function with bounded concurrency.
 * Processes items in batches to prevent resource exhaustion.
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param options - Concurrency limit and optional cancellation signal
 * @returns Array of results in same order as input
 *
 * @example
 * const results = await mapWithConcurrency(
 *   paths,
 *   async (path) => await readFile(path),
 *   { limit: 10, signal: abortController.signal }
 * )
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: MapWithConcurrencyOptions,
): Promise<R[]> {
  const { limit, signal } = options
  const results: R[] = new Array(items.length)

  // Process in batches of `limit` size
  for (let i = 0; i < items.length; i += limit) {
    // Check for cancellation
    if (signal?.aborted) {
      throw new Error('Operation cancelled')
    }

    const batch = items.slice(i, Math.min(i + limit, items.length))
    const batchPromises = batch.map((item, batchIndex) => {
      const originalIndex = i + batchIndex
      return fn(item, originalIndex)
    })

    const batchResults = await Promise.all(batchPromises)

    // Store results in correct positions
    batchResults.forEach((result, batchIndex) => {
      results[i + batchIndex] = result
    })
  }

  return results
}

/**
 * Creates a limiter function that restricts concurrent execution.
 * Alternative API inspired by p-limit.
 *
 * @param limit - Maximum number of concurrent operations
 * @returns Function that wraps async operations with concurrency control
 *
 * @example
 * const limit = createConcurrencyLimiter(3)
 * const results = await Promise.all(
 *   paths.map(path => limit(() => readFile(path)))
 * )
 */
export function createConcurrencyLimiter(limit: number) {
  const queue: Array<() => void> = []
  let activeCount = 0

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    // Wait if at capacity
    if (activeCount >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve))
    }

    activeCount++
    try {
      return await fn()
    } finally {
      activeCount--
      // Start next queued operation
      const next = queue.shift()
      if (next) next()
    }
  }

  return run
}

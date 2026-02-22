import { describe, expect, it } from 'vitest'
import { mapWithConcurrency, createConcurrencyLimiter } from './concurrency'

describe('mapWithConcurrency', () => {
  it('respects concurrency limit by never exceeding max in-flight count', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const limit = 2

    const items = [1, 2, 3, 4, 5, 6]
    await mapWithConcurrency(
      items,
      async (item) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        // Simulate async work with varying durations
        await new Promise((r) => setTimeout(r, 10))
        inFlight--
        return item * 2
      },
      { limit },
    )

    expect(maxInFlight).toBeLessThanOrEqual(limit)
    expect(maxInFlight).toBeGreaterThan(0)
  })

  it('processes all items and returns results in input order', async () => {
    const items = [50, 10, 30, 20, 40]

    const results = await mapWithConcurrency(
      items,
      async (item) => {
        // Items complete in different order than started
        await new Promise((r) => setTimeout(r, item))
        return `result-${item}`
      },
      { limit: 2 },
    )

    expect(results).toEqual([
      'result-50',
      'result-10',
      'result-30',
      'result-20',
      'result-40',
    ])
    expect(results).toHaveLength(items.length)
  })

  it('propagates errors from rejected promises', async () => {
    const items = [1, 2, 3, 4]

    await expect(
      mapWithConcurrency(
        items,
        async (item) => {
          if (item === 3) throw new Error('Item 3 failed')
          return item
        },
        { limit: 2 },
      ),
    ).rejects.toThrow('Item 3 failed')
  })

  it('returns empty array for empty input', async () => {
    const results = await mapWithConcurrency(
      [],
      async (item: number) => item * 2,
      { limit: 5 },
    )

    expect(results).toEqual([])
  })

  it('processes sequentially when limit is 1', async () => {
    const executionOrder: number[] = []

    const items = [1, 2, 3]
    await mapWithConcurrency(
      items,
      async (item) => {
        executionOrder.push(item)
        await new Promise((r) => setTimeout(r, 5))
        return item
      },
      { limit: 1 },
    )

    // With limit=1, items must execute in order
    expect(executionOrder).toEqual([1, 2, 3])
  })

  it('works correctly when limit is greater than array length', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const items = [1, 2, 3]

    const results = await mapWithConcurrency(
      items,
      async (item) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 10))
        inFlight--
        return item * 10
      },
      { limit: 100 },
    )

    expect(results).toEqual([10, 20, 30])
    // All items should run concurrently in a single batch
    expect(maxInFlight).toBe(3)
  })

  it('supports cancellation via AbortSignal', async () => {
    const controller = new AbortController()
    const processed: number[] = []

    const items = [1, 2, 3, 4, 5, 6]

    const promise = mapWithConcurrency(
      items,
      async (item) => {
        processed.push(item)
        await new Promise((r) => setTimeout(r, 10))
        // Abort after first batch starts
        if (item === 2) controller.abort()
        return item
      },
      { limit: 2, signal: controller.signal },
    )

    await expect(promise).rejects.toThrow('Operation cancelled')
    // First batch (items 1,2) processed, but should stop before processing all
    expect(processed.length).toBeLessThan(items.length)
  })
})

describe('createConcurrencyLimiter', () => {
  it('limits concurrent execution to the specified count', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const limit = createConcurrencyLimiter(2)

    const tasks = Array.from({ length: 6 }, (_, i) =>
      limit(async () => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 20))
        inFlight--
        return i
      }),
    )

    const results = await Promise.all(tasks)

    expect(maxInFlight).toBeLessThanOrEqual(2)
    expect(maxInFlight).toBeGreaterThan(0)
    expect(results).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('returns results in correct order from wrapped functions', async () => {
    const limit = createConcurrencyLimiter(2)

    const results = await Promise.all([
      limit(async () => {
        await new Promise((r) => setTimeout(r, 30))
        return 'slow'
      }),
      limit(async () => {
        await new Promise((r) => setTimeout(r, 5))
        return 'fast'
      }),
      limit(async () => {
        await new Promise((r) => setTimeout(r, 15))
        return 'medium'
      }),
    ])

    // Promise.all preserves order regardless of completion time
    expect(results).toEqual(['slow', 'fast', 'medium'])
  })

  it('propagates errors from limited functions', async () => {
    const limit = createConcurrencyLimiter(2)

    await expect(
      limit(async () => {
        throw new Error('limiter error')
      }),
    ).rejects.toThrow('limiter error')
  })
})

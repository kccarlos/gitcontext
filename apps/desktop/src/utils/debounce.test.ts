import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from './debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('only invokes once after a burst of calls within the delay', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced()
    debounced()
    debounced()
    debounced()
    debounced()

    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('uses the arguments from the final call', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('first')
    debounced('second')
    debounced('third')

    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('third')
  })

  it('resets the timer on each call so rapid calls delay execution', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced()
    vi.advanceTimersByTime(80)
    expect(fn).not.toHaveBeenCalled()

    // Call again, resetting the 100ms timer
    debounced()
    vi.advanceTimersByTime(80)
    expect(fn).not.toHaveBeenCalled()

    // Call again, resetting the 100ms timer
    debounced()
    vi.advanceTimersByTime(80)
    expect(fn).not.toHaveBeenCalled()

    // Now let the full delay pass without another call
    vi.advanceTimersByTime(20)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('triggers the function after the full delay elapses', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('value')

    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('value')
  })

  it('returned function is callable multiple independent times', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 50)

    // First debounced invocation
    debounced('a')
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')

    // Second independent debounced invocation
    debounced('b')
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith('b')
  })

  it('handles multiple arguments correctly', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced(1, 'two', { three: 3 })

    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledWith(1, 'two', { three: 3 })
  })
})

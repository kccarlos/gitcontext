import { describe, expect, it, vi, beforeEach } from 'vitest'
import { logError, errorLog } from './logger'

describe('logError', () => {
  beforeEach(() => {
    // Clear the shared errorLog between tests
    errorLog.length = 0
    vi.restoreAllMocks()
  })

  it('calls console.error with formatted source prefix and the Error object', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('something broke')

    logError('GIT_DIFF', err)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('[GIT_DIFF]', err)
  })

  it('extracts message from Error objects and pushes to errorLog', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('disk full')

    logError('FS_READ', err)

    expect(errorLog).toHaveLength(1)
    expect(errorLog[0].message).toBe('disk full')
    expect(errorLog[0].source).toBe('FS_READ')
    expect(typeof errorLog[0].timestamp).toBe('number')
  })

  it('handles string errors by using the string directly as the message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    logError('PARSE', 'invalid JSON')

    expect(errorLog).toHaveLength(1)
    expect(errorLog[0].message).toBe('invalid JSON')
    expect(errorLog[0].source).toBe('PARSE')
  })

  it('handles non-Error non-string values (objects, null, undefined)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    logError('OBJ', { code: 42 })
    logError('NULL', null)
    logError('UNDEF', undefined)

    expect(errorLog).toHaveLength(3)
    expect(errorLog[0].message).toBe('[object Object]')
    expect(errorLog[0].source).toBe('OBJ')
    expect(errorLog[1].message).toBe('null')
    expect(errorLog[1].source).toBe('NULL')
    expect(errorLog[2].message).toBe('undefined')
    expect(errorLog[2].source).toBe('UNDEF')
  })

  it('includes the error code/source prefix in console.error output', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logError('E_REPO_OPEN', 'failed')

    expect(spy).toHaveBeenCalledWith('[E_REPO_OPEN]', 'failed')
  })

  it('caps errorLog at 100 entries by removing oldest', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    for (let i = 0; i < 105; i++) {
      logError('FLOOD', `error-${i}`)
    }

    expect(errorLog).toHaveLength(100)
    // Oldest entries (0-4) should have been shifted out
    expect(errorLog[0].message).toBe('error-5')
    expect(errorLog[99].message).toBe('error-104')
  })
})

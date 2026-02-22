import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../hooks/useTheme'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a minimal matchMedia mock whose `matches` value can be controlled. */
function createMatchMediaMock(prefersDark: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  const mql = {
    matches: prefersDark,
    addEventListener: vi.fn((_event: string, handler: (e: { matches: boolean }) => void) => {
      listeners.push(handler)
    }),
    removeEventListener: vi.fn((_event: string, handler: (e: { matches: boolean }) => void) => {
      const idx = listeners.indexOf(handler)
      if (idx >= 0) listeners.splice(idx, 1)
    }),
  }
  const trigger = (matches: boolean) => {
    mql.matches = matches
    listeners.forEach((fn) => fn({ matches }))
  }
  return { mql, trigger }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useTheme', () => {
  let matchMediaSpy: ReturnType<typeof vi.spyOn>
  let matchMediaMock: ReturnType<typeof createMatchMediaMock>

  beforeEach(() => {
    // Clear localStorage and DOM attribute
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')

    // Default: system prefers light
    matchMediaMock = createMatchMediaMock(false)
    matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue(matchMediaMock.mql as any)
  })

  afterEach(() => {
    matchMediaSpy.mockRestore()
  })

  // ── 1. Default theme follows system preference (light) ─────────────────

  it('defaults to light when system prefers light', () => {
    const { result } = renderHook(() => useTheme())

    expect(result.current.effectiveTheme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  // ── 2. Default theme follows system preference (dark) ──────────────────

  it('defaults to dark when system prefers dark', () => {
    matchMediaMock = createMatchMediaMock(true)
    matchMediaSpy.mockReturnValue(matchMediaMock.mql as any)

    const { result } = renderHook(() => useTheme())

    expect(result.current.effectiveTheme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  // ── 3. Toggling theme switches between light and dark ──────────────────

  it('toggles between light and dark', () => {
    const { result } = renderHook(() => useTheme())

    // Starts light (system default)
    expect(result.current.effectiveTheme).toBe('light')

    // Toggle to dark
    act(() => {
      result.current.toggleTheme()
    })
    expect(result.current.effectiveTheme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    // Toggle back to light
    act(() => {
      result.current.toggleTheme()
    })
    expect(result.current.effectiveTheme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  // ── 4. Theme persists to localStorage key 'gc.theme' ───────────────────

  it('persists theme choice to localStorage under gc.theme', () => {
    const { result } = renderHook(() => useTheme())

    // No saved preference initially
    expect(localStorage.getItem('gc.theme')).toBeNull()

    // Toggle to dark → persisted
    act(() => {
      result.current.toggleTheme()
    })
    expect(localStorage.getItem('gc.theme')).toBe('dark')

    // Toggle to light → persisted
    act(() => {
      result.current.toggleTheme()
    })
    expect(localStorage.getItem('gc.theme')).toBe('light')
  })

  // ── 5. Restores persisted theme on mount ───────────────────────────────

  it('restores persisted theme from localStorage on mount', () => {
    localStorage.setItem('gc.theme', 'dark')

    const { result } = renderHook(() => useTheme())

    // Should use saved preference, not system (which is light)
    expect(result.current.effectiveTheme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  // ── 6. Removing theme preference falls back to system ──────────────────

  it('falls back to system preference when localStorage has no theme', () => {
    // Start with system-dark and no saved preference
    matchMediaMock = createMatchMediaMock(true)
    matchMediaSpy.mockReturnValue(matchMediaMock.mql as any)

    const { result } = renderHook(() => useTheme())

    // Falls back to system dark
    expect(result.current.effectiveTheme).toBe('dark')

    // Toggle explicitly sets light
    act(() => {
      result.current.toggleTheme()
    })
    expect(result.current.effectiveTheme).toBe('light')
    expect(localStorage.getItem('gc.theme')).toBe('light')
  })

  // ── 7. data-theme attribute set on document.documentElement ────────────

  it('sets data-theme attribute on documentElement', () => {
    localStorage.setItem('gc.theme', 'light')

    renderHook(() => useTheme())
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  // ── 8. Corrupt localStorage theme value falls back to system default ───

  it('falls back to system default when localStorage has corrupt theme value', () => {
    // Set an invalid value
    localStorage.setItem('gc.theme', 'invalid-value')

    // System prefers dark
    matchMediaMock = createMatchMediaMock(true)
    matchMediaSpy.mockReturnValue(matchMediaMock.mql as any)

    const { result } = renderHook(() => useTheme())

    // Should ignore invalid value and fall back to system dark
    expect(result.current.effectiveTheme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    // Invalid value should be cleaned up (removed)
    expect(localStorage.getItem('gc.theme')).toBeNull()
  })

  // ── 9. System preference change updates theme when no explicit choice ──

  it('responds to system preference changes when no explicit theme is set', () => {
    const { result } = renderHook(() => useTheme())

    expect(result.current.effectiveTheme).toBe('light')

    // Simulate system switching to dark mode
    act(() => {
      matchMediaMock.trigger(true)
    })

    expect(result.current.effectiveTheme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  // ── 10. Cleanup removes matchMedia listener on unmount ─────────────────

  it('removes matchMedia listener on unmount', () => {
    const { unmount } = renderHook(() => useTheme())

    expect(matchMediaMock.mql.addEventListener).toHaveBeenCalledTimes(1)

    unmount()

    expect(matchMediaMock.mql.removeEventListener).toHaveBeenCalledTimes(1)
  })
})

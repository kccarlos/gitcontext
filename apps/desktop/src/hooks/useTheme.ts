import { useEffect, useState } from 'react'
import { logError } from '../utils/logger'

export type ThemeValue = 'light' | 'dark'

export interface UseThemeResult {
  /** The resolved theme: explicit user choice, or system fallback. */
  effectiveTheme: ThemeValue
  /** Toggle between light and dark. Sets an explicit preference. */
  toggleTheme: () => void
}

/**
 * Manages theme state with system-preference fallback and localStorage persistence.
 *
 * - Reads saved preference from `localStorage` key `gc.theme`.
 * - Falls back to `prefers-color-scheme` when no saved preference exists.
 * - Sets `data-theme` attribute on `document.documentElement`.
 * - Persists explicit choice to `localStorage`; removing preference (null) deletes the key.
 */
export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useState<ThemeValue | null>(() => {
    try {
      const saved = localStorage.getItem('gc.theme')
      return saved === 'light' || saved === 'dark' ? saved : null
    } catch (e) {
      logError('themeLoad', e)
      return null
    }
  })

  const [systemDark, setSystemDark] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const effectiveTheme: ThemeValue = theme ?? (systemDark ? 'dark' : 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme)
  }, [effectiveTheme])

  useEffect(() => {
    try {
      if (theme) localStorage.setItem('gc.theme', theme)
      else localStorage.removeItem('gc.theme')
    } catch (e) {
      logError('themePersistence', e)
    }
  }, [theme])

  const toggleTheme = () => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')

  return { effectiveTheme, toggleTheme }
}

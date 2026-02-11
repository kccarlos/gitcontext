import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFileTree } from './useFileTree'

describe('useFileTree selection helpers', () => {
  it('addSelectedPaths keeps existing and adds new unique paths', () => {
    const { result } = renderHook(() => useFileTree())

    act(() => {
      result.current.toggleSelect('src/app.ts')
      result.current.addSelectedPaths(['src/test/a.test.ts', 'src/app.ts'])
    })

    expect(Array.from(result.current.selectedPaths).sort()).toEqual([
      'src/app.ts',
      'src/test/a.test.ts',
    ])
  })

  it('removeSelectedPathsByPredicate removes only matching test paths (case-insensitive)', () => {
    const { result } = renderHook(() => useFileTree())

    act(() => {
      result.current.addSelectedPaths([
        'src/app.ts',
        'src/test/foo.ts',
        'unit/MyTest.spec.ts',
        'docs/guide.md',
      ])
      result.current.removeSelectedPathsByPredicate((p) => p.toLowerCase().includes('test'))
    })

    expect(Array.from(result.current.selectedPaths).sort()).toEqual([
      'docs/guide.md',
      'src/app.ts',
    ])
  })

  it('removeSelectedPathsByPredicate is a no-op when nothing matches', () => {
    const { result } = renderHook(() => useFileTree())

    act(() => {
      result.current.addSelectedPaths(['src/app.ts', 'docs/guide.md'])
      result.current.removeSelectedPathsByPredicate((p) => p.toLowerCase().includes('test'))
    })

    expect(Array.from(result.current.selectedPaths).sort()).toEqual([
      'docs/guide.md',
      'src/app.ts',
    ])
  })
})

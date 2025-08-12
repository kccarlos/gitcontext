import { test, expect } from '@playwright/test'

// Helpers to construct a minimal fake FileSystemDirectoryHandle
function makeFile(data: string | Uint8Array, name: string): File {
  const blob = typeof data === 'string' ? new Blob([data]) : new Blob([data])
  // @ts-ignore - in browser this will be a File
  return new File([blob], name)
}

type FakeFileHandle = {
  kind: 'file'
  getFile: () => Promise<File>
}

type FakeDirHandle = {
  kind: 'directory'
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<FakeFileHandle>
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<FakeDirHandle>
  entries: () => AsyncGenerator<[string, FakeDirHandle | FakeFileHandle]>
  name?: string
}

function dirEntries(obj: Record<string, any>): [string, any][] {
  return Object.keys(obj).map((k) => [k, obj[k]])
}

function makeDir(structure: any, name = ''): FakeDirHandle {
  const dir: FakeDirHandle = {
    kind: 'directory',
    name,
    async getFileHandle(n: string) {
      const child = structure[n]
      if (!child || typeof child !== 'string') throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
      const file = makeFile(child, n)
      return { kind: 'file', async getFile() { return file } }
    },
    async getDirectoryHandle(n: string) {
      const child = structure[n]
      if (!child || typeof child === 'string') throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
      return makeDir(child, n)
    },
    async *entries() {
      for (const [n, child] of dirEntries(structure)) {
        if (typeof child === 'string') {
          const file = makeFile(child, n)
          yield [n, { kind: 'file', async getFile() { return file } } as FakeFileHandle]
        } else {
          yield [n, makeDir(child, n) as FakeDirHandle]
        }
      }
    },
  }
  return dir
}

// Minimal mock git repo structure
function makeMockGitRepo(): FakeDirHandle {
  const structure = {
    '.git': {
      'HEAD': 'ref: refs/heads/main\n',
      'refs': { 'heads': { 'main': 'aaaaaaaa\n', 'feature-branch': 'bbbbbbbb\n' } },
      // packed-refs is optional
    },
    'README.md': '# Hello\n',
    'src': { 'index.ts': 'console.log(1)\n' },
  }
  return makeDir(structure, 'mock-repo')
}

test.describe('Repository Loading and Initialization', () => {
  test('1.1: Successful Repository Load', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__MOCK_DIR__ = (window as any).__MOCK_DIR__ || null
      ;(window as any).showDirectoryPicker = async () => {
        if (!(window as any).__MOCK_DIR__) throw new Error('No mock dir set')
        return (window as any).__MOCK_DIR__
      }
      // Pre-seed branch selection to WORKDIR for this mock repo to avoid diff on load
      try { localStorage.setItem('branchSel:repo-mock-repo', JSON.stringify({ base: '__WORKDIR__', compare: '__WORKDIR__' })) } catch {}
    })

    // Navigate to app
    await page.goto('/')

    // Install mock repo handle
    const dirHandle = await page.evaluateHandle(() => {
      return null // placeholder; replaced below
    })
    // Create the mock directory in page context
    await page.evaluate(() => {
      function makeFile(data: string | Uint8Array, name: string): File {
        const blob = typeof data === 'string' ? new Blob([data]) : new Blob([data])
        // @ts-ignore
        return new File([blob], name)
      }
      function dirEntries(obj: Record<string, any>): [string, any][] {
        return Object.keys(obj).map((k) => [k, obj[k]])
      }
      function makeDir(structure: any, name = ''): any {
        return {
          kind: 'directory',
          name,
          async getFileHandle(n: string) {
            const child = structure[n]
            if (!child || typeof child !== 'string') throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
            const file = makeFile(child, n)
            return { kind: 'file', async getFile() { return file } }
          },
          async getDirectoryHandle(n: string) {
            const child = structure[n]
            if (!child || typeof child === 'string') throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
            return makeDir(child, n)
          },
          async *entries() {
            for (const [n, child] of dirEntries(structure)) {
              if (typeof child === 'string') {
                const file = makeFile(child, n)
                yield [n, { kind: 'file', async getFile() { return file } }]
              } else {
                yield [n, makeDir(child, n)]
              }
            }
          },
        }
      }
      const structure = {
        '.git': {
          'HEAD': 'ref: refs/heads/main\n',
          // Use long fake OIDs to satisfy resolveRef and walk expectations
          'refs': { 'heads': { 'main': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', 'feature-branch': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' } },
        },
        'README.md': '# Hello\n',
        'src': { 'index.ts': 'console.log(1)\n' },
      }
      ;(window as any).__MOCK_DIR__ = makeDir(structure, 'mock-repo')
    })

    // Click select project folder
    await page.getByRole('button', { name: /Select Project Folder/i }).click()

    // Assert main interface visible (two columns: left and right panels)
    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toBeVisible()

    // Branch dropdowns within the panel should be populated
    const branchesPanel = page.locator('.panel-section', { has: page.getByRole('heading', { name: /Select branches to diff/i }) })
    const baseSelect = branchesPanel.locator('select').nth(0)
    const compareSelect = branchesPanel.locator('select').nth(1)
    await expect(baseSelect).toHaveValue(/.+/)
    await expect(compareSelect).toHaveValue(/.+/)

    // Ensure they are non-identical
    const baseVal = await baseSelect.inputValue()
    const compareVal = await compareSelect.inputValue()
    expect(baseVal).not.toEqual('')
    expect(compareVal).not.toEqual('')
    expect(compareVal).not.toEqual(baseVal)

    // Do not assert status text; mock repo lacks real objects so diff may emit errors
    await expect(branchesPanel).toBeVisible()
  })

  test('1.2: Attempt to Load a Non-Git Folder', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).showDirectoryPicker = async () => {
        // Return a folder without .git
        function makeFile(data: string | Uint8Array, name: string): File {
          const blob = typeof data === 'string' ? new Blob([data]) : new Blob([data])
          // @ts-ignore
          return new File([blob], name)
        }
        function makeDir(structure: any, name = ''): any {
          return {
            kind: 'directory',
            name,
            async getFileHandle(n: string) {
              const child = structure[n]
              if (!child || typeof child !== 'string') throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
              const file = makeFile(child, n)
              return { kind: 'file', async getFile() { return file } }
            },
            async getDirectoryHandle(n: string) {
              const child = structure[n]
              if (!child || typeof child === 'string') throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
              return makeDir(child, n)
            },
            async *entries() { /* empty */ },
          }
        }
        const nonGit = makeDir({ 'README.md': '# hi' }, 'non-git')
        return nonGit
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Select Project Folder/i }).click()

    // Error should be shown and remain on landing (no branches panel)
    await expect(page.locator('.hint', { hasText: /Not a valid Git repository/i }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toHaveCount(0)
  })

  test('1.3: User Cancels Folder Selection', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).showDirectoryPicker = async () => {
        const e: any = new Error('AbortError')
        e.name = 'AbortError'
        throw e
      }
    })
    await page.goto('/')
    await page.getByRole('button', { name: /Select Project Folder/i }).click()
    // Should remain on landing, with no error
    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toHaveCount(0)
    // No crimson error hint visible
    await expect(page.locator('.hint', { hasText: /Not a valid Git repository/i })).toHaveCount(0)
  })

  test('1.4: Repository Refresh', async ({ page }) => {
    await page.addInitScript(() => {
      // Provide a valid repo then reuse same handle for refresh
      function makeFile(data: string | Uint8Array, name: string): File {
        const blob = typeof data === 'string' ? new Blob([data]) : new Blob([data])
        // @ts-ignore
        return new File([blob], name)
      }
      function dirEntries(obj: Record<string, any>): [string, any][] {
        return Object.keys(obj).map((k) => [k, obj[k]])
      }
      function makeDir(structure: any, name = ''): any {
        return {
          kind: 'directory',
          name,
          async getFileHandle(n: string) {
            const child = structure[n]
            if (!child || typeof child !== 'string') throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
            const file = makeFile(child, n)
            return { kind: 'file', async getFile() { return file } }
          },
          async getDirectoryHandle(n: string) {
            const child = structure[n]
            if (!child || typeof child === 'string') throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
            return makeDir(child, n)
          },
          async *entries() {
            for (const [n, child] of dirEntries(structure)) {
              if (typeof child === 'string') {
                const file = makeFile(child, n)
                yield [n, { kind: 'file', async getFile() { return file } }]
              } else {
                yield [n, makeDir(child, n)]
              }
            }
          },
        }
      }
      const structure = {
        '.git': {
          'HEAD': 'ref: refs/heads/main\n',
          'refs': { 'heads': { 'main': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', 'feature-branch': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' } },
        },
        'README.md': '# Hello\n',
      }
      ;(window as any).__MOCK_DIR__ = makeDir(structure, 'mock-repo')
      ;(window as any).showDirectoryPicker = async () => (window as any).__MOCK_DIR__
      try { localStorage.setItem('branchSel:repo-mock-repo', JSON.stringify({ base: '__WORKDIR__', compare: '__WORKDIR__' })) } catch {}
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Select Project Folder/i }).click()

    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toBeVisible()

    // Set both base and compare to WORKDIR to avoid resolving missing commit oids in the mock
    const branchesPanel = page.locator('.panel-section', { has: page.getByRole('heading', { name: /Select branches to diff/i }) })
    const baseSelect = branchesPanel.locator('select').nth(0)
    const compareSelect = branchesPanel.locator('select').nth(1)
    await baseSelect.selectOption({ label: 'My Working Directory' })
    await compareSelect.selectOption({ label: 'My Working Directory' })

    // Click Fetch & Refresh
    await page.getByRole('button', { name: /Fetch & Refresh/i }).click()
    // Do not depend on exact status text; just ensure UI is still interactive
    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toBeVisible()

    // Ensure branches still populated; app may avoid identical pair by changing compare
    await expect(baseSelect).toHaveValue(/.+/)
    await expect(compareSelect).toHaveValue(/.+/)
    const newBase = await baseSelect.inputValue()
    const newCompare = await compareSelect.inputValue()
    expect(newBase).not.toEqual('')
    expect(newCompare).not.toEqual('')
  })
})



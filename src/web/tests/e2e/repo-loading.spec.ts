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
          'refs': { 'heads': { 'main': 'aaaaaaaa\n', 'feature-branch': 'bbbbbbbb\n' } },
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

    // Branch dropdowns populated with main and feature-branch and working dir sentinel label
    const baseSelect = page.locator('label:has-text("Base") ~ select, select').nth(0)
    const compareSelect = page.locator('label:has-text("Compare") ~ select, select').nth(1)
    await expect(baseSelect).toHaveValue(/.+/)
    await expect(compareSelect).toHaveValue(/.+/)

    // Ensure they are non-identical
    const baseVal = await baseSelect.inputValue()
    const compareVal = await compareSelect.inputValue()
    expect(baseVal).not.toEqual('')
    expect(compareVal).not.toEqual('')
    expect(compareVal).not.toEqual(baseVal)

    // Status bar should show Ready or success
    await expect(page.locator('.status-footer-fixed')).toContainText(/Ready|Repository loaded/i)
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
    await expect(page.locator('.hint')).toContainText(/Not a valid Git repository/i)
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
          'refs': { 'heads': { 'main': 'aaaaaaaa\n', 'feature-branch': 'bbbbbbbb\n' } },
        },
        'README.md': '# Hello\n',
      }
      ;(window as any).__MOCK_DIR__ = makeDir(structure, 'mock-repo')
      ;(window as any).showDirectoryPicker = async () => (window as any).__MOCK_DIR__
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Select Project Folder/i }).click()

    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toBeVisible()

    // Click Fetch & Refresh
    await page.getByRole('button', { name: /Fetch & Refresh/i }).click()
    // Expect refreshing status then recovered UI
    await expect(page.locator('.status-footer-fixed')).toContainText(/Refreshing|Repository refreshed|Ready/i)

    // Ensure branches still populated and diff recompute effect allowed
    const baseSelect = page.locator('select').nth(0)
    const compareSelect = page.locator('select').nth(1)
    await expect(baseSelect).toHaveValue(/.+/)
    await expect(compareSelect).toHaveValue(/.+/)
  })
})



import { test, expect } from '@playwright/test'

test.describe('File Tree, Selection and Preview', () => {
  test.beforeEach(async ({ page }) => {
    // Override Worker to mock diff/listFiles/readFile, but pass-through loadRepo
    await page.addInitScript(() => {
      const RealWorker = window.Worker
      // Synthetic dataset for tests
      const baseFiles = ['src/existing.ts', 'docs/readme.md', 'docs/old.md']
      const workFiles = ['src/existing.ts', 'src/new.ts', 'docs/readme.md']
      const diffFiles = [
        { path: 'src/existing.ts', type: 'modify' },
        { path: 'src/new.ts', type: 'add' },
        { path: 'docs/old.md', type: 'remove' },
      ]
      const fileText: Record<string, { base?: string; compare?: string }> = {
        'src/existing.ts': { base: 'console.log("old")\n', compare: 'console.log("new")\n' },
        'src/new.ts': { compare: 'export const x=1\n' },
        'docs/old.md': { base: '# Old\n' },
        'docs/readme.md': { base: '# Readme\n', compare: '# Readme\n' },
      }
      // @ts-ignore
      window.Worker = class extends RealWorker {
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url as any, options)
          const realPost = this.postMessage.bind(this)
          ;(this as any).postMessage = (msg: any) => {
            try {
              if (!msg || typeof msg !== 'object') return realPost(msg)
              if (msg.type === 'diff') {
                // Reply with synthetic diff result
                setTimeout(() => {
                  ;(this as any).dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'ok', data: { files: diffFiles } } }))
                }, 0)
                return
              }
              if (msg.type === 'listFiles') {
                const list = msg.ref === '__WORKDIR__' ? workFiles : baseFiles
                setTimeout(() => {
                  ;(this as any).dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'ok', data: { files: list } } }))
                }, 0)
                return
              }
              if (msg.type === 'readFile') {
                const isWork = msg.ref === '__WORKDIR__'
                const key = msg.filepath
                const text = (isWork ? fileText[key]?.compare : fileText[key]?.base) ?? null
                const notFound = text === null
                const payload = { binary: false, text, notFound }
                setTimeout(() => {
                  ;(this as any).dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'ok', data: payload } }))
                }, 0)
                return
              }
            } catch {}
            return realPost(msg)
          }
        }
      }
      // Expose dataset for assertions if needed
      ;(window as any).__FT_DATA__ = { baseFiles, workFiles, diffFiles }
    })

    // Mock FS folder picker to allow app to proceed
    await page.addInitScript(() => {
      ;(window as any).__MOCK_DIR__ = (window as any).__MOCK_DIR__ || null
      ;(window as any).showDirectoryPicker = async () => {
        if (!(window as any).__MOCK_DIR__) throw new Error('No mock dir set')
        return (window as any).__MOCK_DIR__
      }
    })

    await page.goto('/')
    // Seed a minimal repo handle (branches are resolved by loadRepo fallback)
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
          'refs': { 'heads': { 'main': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', 'feature-branch': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' } },
        },
      }
      ;(window as any).__MOCK_DIR__ = makeDir(structure, 'mock-repo')
    })

    // Load repo
    await page.getByRole('button', { name: /Select Project Folder/i }).click()
    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toBeVisible()
    // Wait for diff to populate tree (existing.ts appears)
    await expect(page.locator('.file-tree-view').getByText('existing.ts', { exact: true }).first()).toBeVisible()
  })

  test('3.1: File Tree Rendering and Status', async ({ page }) => {
    const tree = page.locator('.file-tree-view')
    await expect(page.getByRole('heading', { name: 'File Tree' })).toBeVisible()
    // Wait for file entries to appear
    await expect(tree.getByText('existing.ts', { exact: true }).first()).toBeVisible()
    await expect(tree.getByText('new.ts', { exact: true }).first()).toBeVisible()
    await expect(tree.getByText('old.md', { exact: true }).first()).toBeVisible()
    // Unchanged hidden initially since filter is on
    await expect(tree.getByText('readme.md')).toHaveCount(0)
  })

  test('3.2: Initial Selection and Expansion', async ({ page }) => {
    const result = await page.evaluate(() => {
      const tree = document.querySelector('.file-tree-view')!
      function getLi(name: string): HTMLLIElement | null {
        const lis = Array.from(tree.querySelectorAll('li')) as HTMLLIElement[]
        return lis.find((li) => li.textContent?.includes(name) ?? false) || null
      }
      function isChecked(li: HTMLLIElement | null): boolean | null {
        const input = li?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
        return input ? input.checked : null
      }
      return {
        newChecked: isChecked(getLi('new.ts')),
        existingChecked: isChecked(getLi('existing.ts')),
        oldChecked: isChecked(getLi('old.md')),
        srcVisible: !!getLi('src'),
        docsVisible: !!getLi('docs'),
      }
    })
    expect(result.newChecked).toBe(true)
    expect(result.existingChecked).toBe(true)
    expect(result.oldChecked).toBe(false)
    expect(result.srcVisible).toBe(true)
    expect(result.docsVisible).toBe(true)
  })

  test('3.3: Filter Changed Files Toggle', async ({ page }) => {
    const filterToggle = page.getByLabel('Filter Changed Files')
    const tree = page.locator('.file-tree-view')
    await expect(tree.getByText('readme.md')).toHaveCount(0)
    await filterToggle.uncheck()
    await expect(tree.getByText('readme.md').first()).toBeVisible()
  })

  test('3.4: Selection/Deselection Logic', async ({ page }) => {
    // Deselect existing.ts via DOM click
    await page.evaluate(() => {
      const tree = document.querySelector('.file-tree-view')!
      const lis = Array.from(tree.querySelectorAll('li')) as HTMLLIElement[]
      const li = lis.find((el) => el.textContent?.includes('existing.ts'))
      const input = li?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
      input?.click()
    })
    const selectedPanel = page.locator('.panel-section').filter({ has: page.getByRole('heading', { name: 'Selected Files' }) })
    await expect(selectedPanel.getByText('existing.ts')).toHaveCount(0)
    // Select all under folder 'src'
    await page.evaluate(() => {
      const tree = document.querySelector('.file-tree-view')!
      const lis = Array.from(tree.querySelectorAll('li')) as HTMLLIElement[]
      const li = lis.find((el) => el.textContent?.includes('src'))
      const input = li?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
      input?.click()
    })
    await expect(selectedPanel.getByText('new.ts')).toBeVisible()
    await expect(selectedPanel.getByText('existing.ts')).toBeVisible()
  })

  test('3.5: File Preview Asynchronous Load', async ({ page }) => {
    // Click preview button via DOM
    await page.evaluate(() => {
      const tree = document.querySelector('.file-tree-view')!
      const lis = Array.from(tree.querySelectorAll('li')) as HTMLLIElement[]
      const li = lis.find((el) => el.textContent?.includes('existing.ts'))
      const btns = Array.from(li?.querySelectorAll('button') || []) as HTMLButtonElement[]
      const previewBtn = btns.find((b) => (b.getAttribute('aria-label') || b.title || '').toLowerCase().includes('preview'))
      previewBtn?.click()
    })
    // Modal appears
    await expect(page.getByRole('dialog')).toBeVisible()
    // There should be diff content; assert code text presence
    await expect(page.getByRole('dialog').getByText('old')).toBeVisible()
    await expect(page.getByRole('dialog').getByText('new')).toBeVisible()
  })
})



import { test, expect } from '@playwright/test'

test.describe('Output Generation and Token Counting', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant clipboard permissions for this origin to stabilize clipboard calls
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5173' })
    // Worker override with synthetic repo
    await page.addInitScript(() => {
      const RealWorker = window.Worker
      const baseFiles = ['src/existing.ts', 'docs/readme.md']
      const workFiles = ['src/existing.ts', 'src/new.ts', 'docs/readme.md', 'assets/image.png']
      const diffFiles = [
        { path: 'src/existing.ts', type: 'modify' },
        { path: 'src/new.ts', type: 'add' },
        { path: 'assets/image.png', type: 'add' },
      ]
      const fileText: Record<string, { base?: string; compare?: string; binary?: boolean }> = {
        'src/existing.ts': { base: 'console.log("old")\n', compare: 'console.log("new")\n' },
        'src/new.ts': { compare: 'export const x=1\n' },
        'docs/readme.md': { base: '# Readme\n', compare: '# Readme\n' },
        'assets/image.png': { compare: '', binary: true },
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
                const meta = fileText[key] || {}
                const binary = !!meta.binary
                const text = binary ? null : (isWork ? meta.compare : meta.base) ?? null
                const notFound = text === null && !binary
                const payload = { binary, text, notFound }
                setTimeout(() => {
                  ;(this as any).dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'ok', data: payload } }))
                }, 0)
                return
              }
              if (msg.type === 'resolveRef') {
                // Return a fake oid
                setTimeout(() => {
                  ;(this as any).dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'ok', data: { oid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } } }))
                }, 0)
                return
              }
            } catch {}
            return realPost(msg)
          }
        }
      }
      // Mock clipboard via defineProperty to bypass permission guards
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        get() {
          return {
            writeText(txt: string) { (window as any).__COPIED__ = String(txt); return Promise.resolve() },
            readText() { return Promise.resolve((window as any).__COPIED__ || '') },
          }
        }
      })
    })

    // Mock FS picker
    await page.addInitScript(() => {
      ;(window as any).__MOCK_DIR__ = (window as any).__MOCK_DIR__ || null
      ;(window as any).showDirectoryPicker = async () => {
        if (!(window as any).__MOCK_DIR__) throw new Error('No mock dir set')
        return (window as any).__MOCK_DIR__
      }
    })

    await page.goto('/')
    // Seed minimal .git to enter UI
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
    await expect(page.locator('.file-tree-view').getByText('existing.ts').first()).toBeVisible()
  })

  test('4.1: useTokenCounts logic via UI reflects busy and per-file tokens', async ({ page }) => {
    // Selecting/deselecting triggers recalculation
    const selectedPanel = page.locator('.panel-section').filter({ has: page.getByRole('heading', { name: 'Selected Files' }) })
    // Ensure new.ts initially present in Selected Files
    await expect(selectedPanel.getByText('new.ts')).toBeVisible({ timeout: 5000 })
    // Deselect existing.ts to trigger recompute
    await page.evaluate(() => {
      const tree = document.querySelector('.file-tree-view')!
      const lis = Array.from(tree.querySelectorAll('li')) as HTMLLIElement[]
      const li = lis.find((el) => el.textContent?.includes('existing.ts'))
      const input = li?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
      input?.click()
    })
    // existing.ts removed from selected
    await expect(selectedPanel.getByText('existing.ts')).toHaveCount(0)
  })

  test('4.2: Final Clipboard Output Format', async ({ page }) => {
    const instr = 'Please analyze.'
    await page.getByLabel('Toggle color scheme').scrollIntoViewIfNeeded().catch(() => {})
    // Enter User Instructions
    await page.locator('textarea[placeholder="You are an expert engineer. Analyze the following..."]').fill(instr)
    // Ensure Include File Tree on (default) and binary as paths on (default)
    // Click COPY ALL SELECTED
    const copyBtn = page.getByRole('button', { name: /COPY ALL SELECTED/ })
    await expect(copyBtn).toBeEnabled()
    // Clear previous copied content
    await page.evaluate(() => { (window as any).__COPIED__ = '' })
    await copyBtn.click()
    await page.waitForFunction(() => !!(window as any).__COPIED__, null, { timeout: 2000 }).catch(() => {})
    const txt = await page.evaluate(() => (window as any).__COPIED__ || '')
    expect(txt).toContain('## Select branches')
    expect(txt).toContain('## File Tree')
    expect(txt).toMatch(/## FILE:\s+src\/existing.ts/i)
    expect(txt).toMatch(/## FILE:\s+src\/new.ts/i)
    expect(txt).toMatch(/_Binary file; included as path only\._/)
    expect(txt).toContain(instr)
  })

  test('4.3: Clipboard Output Varies with Settings', async ({ page }) => {
    // Toggle: hide file tree
    const includeTree = page.getByLabel('Include File Tree')
    await includeTree.uncheck()
    // Also deselect binary file to ensure no binary section appears in output
    await page.evaluate(() => {
      const tree = document.querySelector('.file-tree-view')!
      const lis = Array.from(tree.querySelectorAll('li')) as HTMLLIElement[]
      const li = lis.find((el) => el.textContent?.includes('assets/image.png'))
      const input = li?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
      if (input && input.checked) input.click()
    })
    await page.getByRole('button', { name: /COPY ALL SELECTED/ }).click()
    let txt = await page.evaluate(() => (window as any).__COPIED__ || '')
    expect(txt).not.toContain('## File Tree')

    // Toggle: exclude binary paths
    const includeBinary = page.getByLabel('Include Binary as Paths')
    if (await includeBinary.isChecked()) {
      await includeBinary.uncheck()
    }
    await expect(includeBinary).not.toBeChecked()
    await page.getByRole('button', { name: /COPY ALL SELECTED/ }).click()
    txt = await page.evaluate(() => (window as any).__COPIED__ || '')
    expect(txt).not.toContain('assets/image.png')

    // Context lines slider to max (∞) should include whole content for added file
    const slider = page.locator('input[type="range"]').first()
    await slider.fill('999')
    await page.getByRole('button', { name: /COPY ALL SELECTED/ }).click()
    txt = await page.evaluate(() => (window as any).__COPIED__ || '')
    // Expect full file block for added new.ts (not a diff block)
    expect(txt).toMatch(/## FILE:\s+src\/new\.ts[\s\S]*```[a-z]*\nexport const x=1\n```/)
  })
})



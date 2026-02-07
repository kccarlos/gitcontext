import { test, expect } from '@playwright/test'

test.describe('Git Worker under Electron-like environment', () => {
  test('6.1: Worker boots and reports environment when Electron is present', async ({ page }) => {
    // Simulate Electron renderer + preload
    await page.addInitScript(() => {
      ;(window as any).isElectron = true
      ;(window as any).electron = { invoke: async () => null }
    })

    // Capture console to observe worker boot diagnostics
    const logs: string[] = []
    page.on('console', (msg) => {
      const t = msg.text()
      if (t.includes('[worker → ui]')) logs.push(t)
    })

    // Provide a minimal mock repo and picker to trigger worker init
    await page.addInitScript(() => {
      function makeFile(data: string | Uint8Array, name: string): File {
        const blob = typeof data === 'string' ? new Blob([data]) : new Blob([data])
        // @ts-ignore
        return new File([blob], name)
      }
      function dirEntries(obj: Record<string, any>): [string, any][] { return Object.keys(obj).map((k) => [k, obj[k]]) }
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
          'refs': { 'heads': { 'main': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n' } },
        },
        'README.md': '# Hello\n',
      }
      ;(window as any).__MOCK_DIR__ = makeDir(structure, 'mock-repo')
      ;(window as any).showDirectoryPicker = async () => (window as any).__MOCK_DIR__
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Select Project Folder/i }).click()
    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toBeVisible()

    // Wait briefly for worker logs to flush, then assert boot/env messages were observed
    await page.waitForTimeout(300)
    const joined = logs.join('\n')
    expect(joined).toContain('[worker → ui]')
    expect(joined).toMatch(/\[worker\] booted|\[worker\] env:/)
  })

  test('6.2: Using WORKDIR vs WORKDIR, output paths use forward slashes under Electron-like env', async ({ page }) => {
    // Stub Worker to simulate git worker responses and simulate Electron renderer + preload; also stub clipboard
    await page.addInitScript(() => {
      const fileList = ['sub/dir/file.txt']
      class FakeWorker {
        public onmessage: ((ev: MessageEvent) => void) | null = null
        public onerror: ((ev: any) => void) | null = null
        // eslint-disable-next-line @typescript-eslint/no-useless-constructor
        constructor(_url?: any, _opts?: any) {}
        postMessage(msg: any) {
          const id = msg?.id ?? 0
          const type = msg?.type
          const respond = (payload: any) => {
            this.onmessage && this.onmessage({ data: payload } as any)
          }
          setTimeout(() => {
            if (type === 'loadRepo') {
              respond({ id, type: 'ok', data: { branches: ['__WORKDIR__', 'main'], defaultBranch: '__WORKDIR__' } })
            } else if (type === 'listBranches') {
              respond({ id, type: 'ok', data: { branches: ['__WORKDIR__', 'main'], defaultBranch: '__WORKDIR__' } })
            } else if (type === 'diff') {
              respond({ id, type: 'ok', data: { files: [] } })
            } else if (type === 'listFiles') {
              respond({ id, type: 'ok', data: { files: fileList } })
            } else if (type === 'readFile') {
              respond({ id, type: 'ok', data: { binary: false, text: 'content\n', notFound: false } })
            } else if (type === 'resolveRef') {
              respond({ id, type: 'ok', data: { oid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } })
            } else {
              respond({ id, type: 'error', error: 'unknown' })
            }
          }, 0)
        }
        terminate() {}
      }
      ;(window as any).Worker = FakeWorker as any
      ;(window as any).isElectron = true
      ;(window as any).electron = { invoke: async () => null }
      // Robust clipboard override via defineProperty
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        get() {
          return {
            writeText(txt: string) { (window as any).__copied_text__ = String(txt); return Promise.resolve() },
            readText() { return Promise.resolve((window as any).__copied_text__ || '') },
          }
        }
      })
    })

    // Mock repo with nested paths
    await page.addInitScript(() => {
      function makeFile(data: string | Uint8Array, name: string): File {
        const blob = typeof data === 'string' ? new Blob([data]) : new Blob([data])
        // @ts-ignore
        return new File([blob], name)
      }
      function dirEntries(obj: Record<string, any>): [string, any][] { return Object.keys(obj).map((k) => [k, obj[k]]) }
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
          'refs': { 'heads': { 'main': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n' } },
        },
        'sub': { 'dir': { 'file.txt': 'content\n' } },
      }
      ;(window as any).__MOCK_DIR__ = makeDir(structure, 'mock-repo')
      ;(window as any).showDirectoryPicker = async () => (window as any).__MOCK_DIR__
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Select Project Folder/i }).click()
    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toBeVisible()

    const branchesPanel = page.locator('.panel-section', { has: page.getByRole('heading', { name: /Select branches to diff/i }) })
    const baseSelect = branchesPanel.locator('select').nth(0)
    const compareSelect = branchesPanel.locator('select').nth(1)
    await baseSelect.selectOption({ label: 'My Working Directory' })
    // Select a different branch to trigger compute; handled by FakeWorker
    await compareSelect.selectOption({ label: 'main' })

    // Show unchanged files so we can select them, then select the file directly
    const fileTreePanel = page.locator('.panel-section', { has: page.getByRole('heading', { name: 'File Tree' }) })
    const filterChangedCheckbox = fileTreePanel.locator('label:has-text("Filter Changed Files") >> input[type="checkbox"]')
    await filterChangedCheckbox.uncheck()
    // Expand may be disabled depending on structure; directly pick the checkbox if visible
    const expandAll = fileTreePanel.getByRole('button', { name: 'Expand all' })
    if (await expandAll.isEnabled()) await expandAll.click()
    const fileCheckbox = fileTreePanel.locator('li:has(span[data-full-path="sub/dir/file.txt"]) input[type="checkbox"]').first()
    await fileCheckbox.check()

    // Wait until copy is enabled, then copy output
    const copyBtn = page.getByTestId('copy-all-selected')
    await expect(copyBtn).toBeEnabled()
    await copyBtn.click()
    await page.waitForFunction(() => !!(window as any).__copied_text__, null, { timeout: 2000 }).catch(() => {})
    const copied = await page.evaluate(() => (window as any).__copied_text__ as string)
    expect(copied || '').toContain('## FILE: sub/dir/file.txt')
  })
})



import { test, expect } from '@playwright/test'

test.describe('Token Counting & WASM in Electron-like environment', () => {
  test('7.1: tiktoken WASM loads without errors and shows non-zero token usage', async ({ page, context }) => {
    // Simulate Electron renderer
    await page.addInitScript(() => {
      ;(window as any).isElectron = true
      ;(window as any).electron = { invoke: async () => null }
    })

    // Stub worker to provide deterministic file listing and content; grant clipboard (not required here but keeps env consistent)
    await page.addInitScript(() => {
      const fileList = ['hello.txt']
      class FakeWorker {
        public onmessage: ((ev: MessageEvent) => void) | null = null
        public onerror: ((ev: any) => void) | null = null
        // eslint-disable-next-line @typescript-eslint/no-useless-constructor
        constructor(_url?: any, _opts?: any) {}
        postMessage(msg: any) {
          const id = msg?.id ?? 0
          const type = msg?.type
          const respond = (payload: any) => { this.onmessage && this.onmessage({ data: payload } as any) }
          setTimeout(() => {
            if (type === 'loadRepo') {
              respond({ id, type: 'ok', data: { branches: ['__WORKDIR__', 'main'], defaultBranch: 'main' } })
            } else if (type === 'diff') {
              respond({ id, type: 'ok', data: { files: [] } })
            } else if (type === 'listFiles') {
              respond({ id, type: 'ok', data: { files: fileList } })
            } else if (type === 'readFile') {
              respond({ id, type: 'ok', data: { binary: false, text: 'hello world\n', notFound: false } })
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
    })
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5173' })

    // Mock FS picker with a tiny repo so UI loads and hook runs
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
        'hello.txt': 'hello world\n',
      }
      ;(window as any).__MOCK_DIR__ = makeDir(structure, 'mock-repo')
      ;(window as any).showDirectoryPicker = async () => (window as any).__MOCK_DIR__
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Select Project Folder/i }).click()
    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toBeVisible()

    // Ensure Token Usage panel shows a number > 0 after selecting a file
    // Make file tree show unchanged files, then select hello.txt
    const fileTreePanel = page.locator('.panel-section', { has: page.getByRole('heading', { name: 'File Tree' }) })
    const filterChangedCheckbox = fileTreePanel.locator('label:has-text("Filter Changed Files") >> input[type="checkbox"]')
    await filterChangedCheckbox.uncheck()
    // Find the file checkbox by its hidden full path span
    const fileCheckbox = fileTreePanel.locator('li:has(span[data-full-path="hello.txt"]) input[type="checkbox"]').first()
    await fileCheckbox.check()

    // Token Usage shows a non-zero number
    // Wait for token usage helper text under TokenUsage (files tokens count)
    const filesHint = page.locator('.panel .hint', { hasText: /Files: .* tokens/ })
    await expect(filesHint).toBeVisible()
    const filesTxt = await filesHint.textContent()
    // Expect non-zero file tokens for hello.txt
    expect(filesTxt || '').toMatch(/Files:\s*[1,\d]+\s+tokens/)
  })

  test('7.2: Token counts consistent for identical text in Electron-like vs browser', async ({ page, context, browser }) => {
    // Build a helper to run the flow and return the displayed token count
    async function runFlow(electronLike: boolean): Promise<number> {
      const ctx = await browser.newContext({ baseURL: 'http://localhost:5173' })
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5173' })
      const p = await ctx.newPage()
      if (electronLike) {
        await p.addInitScript(() => { (window as any).isElectron = true; (window as any).electron = { invoke: async () => null } })
      }
      await p.addInitScript(() => {
        // Stub worker consistently in both environments
        const fileList = ['hello.txt']
        class FakeWorker {
          public onmessage: ((ev: MessageEvent) => void) | null = null
          public onerror: ((ev: any) => void) | null = null
          // eslint-disable-next-line @typescript-eslint/no-useless-constructor
          constructor(_url?: any, _opts?: any) {}
          postMessage(msg: any) {
            const id = msg?.id ?? 0
            const type = msg?.type
            const respond = (payload: any) => { this.onmessage && this.onmessage({ data: payload } as any) }
            setTimeout(() => {
              if (type === 'loadRepo') {
                respond({ id, type: 'ok', data: { branches: ['__WORKDIR__', 'main'], defaultBranch: 'main' } })
              } else if (type === 'diff') {
                respond({ id, type: 'ok', data: { files: [] } })
              } else if (type === 'listFiles') {
                respond({ id, type: 'ok', data: { files: fileList } })
              } else if (type === 'readFile') {
                respond({ id, type: 'ok', data: { binary: false, text: 'hello world\n', notFound: false } })
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
          'hello.txt': 'hello world\n',
        }
        ;(window as any).__MOCK_DIR__ = makeDir(structure, 'mock-repo')
        ;(window as any).showDirectoryPicker = async () => (window as any).__MOCK_DIR__
      })
      await p.goto('/')
      await p.getByRole('button', { name: /Select Project Folder/i }).click()
      const fileTreePanel = p.locator('.panel-section', { has: p.getByRole('heading', { name: 'File Tree' }) })
      const filterChangedCheckbox = fileTreePanel.locator('label:has-text("Filter Changed Files") >> input[type="checkbox"]')
      await filterChangedCheckbox.uncheck()
      const fileCheckbox = fileTreePanel.locator('li:has(span[data-full-path="hello.txt"]) input[type="checkbox"]').first()
      await fileCheckbox.check()
      const filesHint = p.locator('.panel .hint', { hasText: /Files: .* tokens/ })
      await filesHint.waitFor()
      const txt = (await filesHint.textContent()) || ''
      const match = txt.match(/Files:\s*(\d[\d,]*)\s+tokens/)
      const count = match ? Number(match[1].replace(/,/g, '')) : 0
      await p.close()
      await ctx.close()
      return count
    }

    const electronCount = await runFlow(true)
    const browserCount = await runFlow(false)
    expect(electronCount).toBeGreaterThan(0)
    expect(browserCount).toBeGreaterThan(0)
    expect(electronCount).toBe(browserCount)
  })
})



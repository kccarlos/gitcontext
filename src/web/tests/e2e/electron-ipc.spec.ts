import { test, expect } from '@playwright/test'

test.describe('Electron IPC bridge simulation', () => {
  test('5.1: Successful IPC invoke round-trip populates models without renderer network', async ({ page }) => {
    const mockModels = [
      { id: 'openrouter/test-1', name: 'Test Model One', description: '', context_length: 1000, pricing: '', available: true },
      { id: 'openrouter/test-2', name: 'Test Model Two', description: '', context_length: 2000, pricing: '', available: true },
    ]

    // Inject a mocked preload bridge before any app scripts run
    await page.addInitScript(({ models }) => {
      // Simulate Electron renderer detection and preload exposure
      ;(window as any).isElectron = true
      ;(window as any).electron = {
        invoke: async (channel: string) => {
          if (channel === 'fetch-models') {
            return models
          }
          return null
        },
      }
      // Track any renderer-initiated requests for later assertion
      const originalFetch = window.fetch.bind(window)
      const calls: string[] = []
      ;(window as any).__gc_fetch_calls__ = calls
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : (input as URL).toString()
        calls.push(url)
        return originalFetch(input, init)
      }
    }, { models: mockModels })

    // Also mock a minimal repo picker to reach main UI
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
          'refs': { 'heads': { 'main': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', 'feature-branch': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' } },
        },
      }
      ;(window as any).__MOCK_DIR__ = makeDir(structure, 'mock-repo')
      ;(window as any).showDirectoryPicker = async () => (window as any).__MOCK_DIR__
    })

    // Navigate to app and load mock repo to render Output Settings
    await page.goto('/')
    await page.getByRole('button', { name: /Select Project Folder/i }).click()
    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toBeVisible()

    // Expect the model dropdown (inside Output Settings panel) to be populated with mocked names
    const outputPanel = page.locator('.panel-section:has(h2:has-text("Output Settings"))')
    const modelSelect = outputPanel.locator('select').first()
    await expect(modelSelect).toBeVisible()
    await expect(modelSelect).toContainText('Test Model One')
    await expect(modelSelect).toContainText('Test Model Two')

    // Ensure no request to OpenRouter was initiated from renderer
    const calls = await page.evaluate(() => (window as any).__gc_fetch_calls__ as string[])
    const rendererHitOpenRouter = (calls || []).some(u => u.includes('openrouter.ai/api/v1/models'))
    expect(rendererHitOpenRouter).toBeFalsy()
  })

  test('5.2: IPC error causes fallback and shows empty/loading models (renderer falls back to OpenRouter)', async ({ page }) => {
    // Mock preload bridge where invoke throws, and override fetch to return a stubbed response
    await page.addInitScript(() => {
      ;(window as any).isElectron = true
      ;(window as any).electron = {
        invoke: async (_channel: string) => {
          throw new Error('Synthetic Main Process Error')
        },
      }
      // Intercept fetch; if OpenRouter models endpoint, return a minimal valid payload
      const originalFetch = window.fetch.bind(window)
      const calls: string[] = []
      ;(window as any).__gc_fetch_calls__ = calls
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : (input as URL).toString()
        calls.push(url)
        if (url.includes('openrouter.ai/api/v1/models')) {
          const body = JSON.stringify({ data: [] })
          return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return originalFetch(input, init)
      }
    })

    // Also mock a minimal repo selection to render Output Settings
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
          async *entries() { for (const [n, child] of dirEntries(structure)) { if (typeof child === 'string') { const file = makeFile(child, n); yield [n, { kind: 'file', async getFile() { return file } }] } else { yield [n, makeDir(child, n)] } } },
        }
      }
      const structure = { '.git': { 'HEAD': 'ref: refs/heads/main\n', 'refs': { 'heads': { 'main': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n' } } } }
      ;(window as any).__MOCK_DIR__ = makeDir(structure, 'mock-repo')
      ;(window as any).showDirectoryPicker = async () => (window as any).__MOCK_DIR__
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Select Project Folder/i }).click()
    await expect(page.getByRole('heading', { name: /Select branches to diff/i })).toBeVisible()

    // The dropdown should be present; after fallback we used stubbed empty data → shows loading/empty
    const outputPanel = page.locator('.panel-section:has(h2:has-text("Output Settings"))')
    const modelSelect = outputPanel.locator('select').first()
    await expect(modelSelect).toBeVisible()
    const selectText = await modelSelect.textContent()
    expect(selectText === null ? '' : selectText).toMatch(/Loading models…|No matches|^\s*$/)

    // Ensure renderer did not reach out to OpenRouter directly (calls were intercepted in our stub)
    const calls = await page.evaluate(() => (window as any).__gc_fetch_calls__ as string[])
    const directRendererRequest = (calls || []).some(u => u.includes('openrouter.ai/api/v1/models'))
    expect(directRendererRequest).toBeTruthy()
  })
})



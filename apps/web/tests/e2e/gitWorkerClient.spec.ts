import { test, expect } from '@playwright/test'

function makeEvalRepo(head = 'main', extras: Record<string, string> = { 'feature-branch': 'bbbbbbbb' }) {
  return { head, extras }
}

test.describe('Git Worker Client (integration via browser)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const RealWorker = window.Worker
      ;(window as any).__workerBehavior = { mode: 'normal', delayMs: 250 }
      // @ts-ignore
      window.Worker = class extends RealWorker {
        constructor(url: URL | string, options?: WorkerOptions) {
          super(url as any, options)
          const behavior = (window as any).__workerBehavior
          const realPost = this.postMessage.bind(this)
          ;(this as any).postMessage = (msg: any) => {
            try {
              if (msg && msg.type === 'diff') {
                if (behavior.mode === 'throw') {
                  setTimeout(() => {
                    ;(this as any).dispatchEvent(new MessageEvent('message', { data: { id: msg.id, type: 'error', error: 'Synthetic error for test: diff' } }))
                  }, 0)
                  return
                }
                if (behavior.mode === 'delay') {
                  const d = Math.max(behavior.delayMs || 250, 1)
                  setTimeout(() => realPost(msg), d)
                  return
                }
              }
            } catch {}
            realPost(msg)
          }
        }
      }
    })
    await page.goto('/')
  })

  test('2.1: loadRepo returns branches and defaultBranch; emits progress', async ({ page }) => {
    const report = await page.evaluate(async ({ head, extras }) => {
      const enc = new TextEncoder()
      function gitFiles(): Array<{ path: string; data: Uint8Array }> {
        const out: Array<{ path: string; data: Uint8Array }> = []
        out.push({ path: 'HEAD', data: enc.encode(`ref: refs/heads/${head}\n`) })
        const refs = { [head]: 'aaaaaaaa', ...extras }
        for (const [name, oid] of Object.entries(refs)) {
          out.push({ path: `refs/heads/${name}`, data: enc.encode(`${oid}\n`) })
        }
        return out
      }
      const progress: string[] = []
      const mod = await import('/src/utils/gitWorkerClient.ts')
      const client = mod.createGitWorkerClient((m: string) => progress.push(m))
      const res = await client.loadRepo('repo-int', { gitFiles: gitFiles(), workFiles: [] })
      client.dispose()
      return { branches: res.branches, def: res.defaultBranch, prog: progress }
    }, makeEvalRepo('main', { 'feature-branch': 'bbbbbbbb' }))

    expect(report.branches).toEqual(expect.arrayContaining(['__WORKDIR__', 'main', 'feature-branch']))
    expect(['main', 'feature-branch']).toContain(report.def)
    expect(report.prog.join('\n')).toMatch(/Seeding|Branches found|refs\/heads/i)
  })

  test('2.2: diff empty when base==compare', async ({ page }) => {
    const out = await page.evaluate(async ({ head }) => {
      const enc = new TextEncoder()
      const gf = [
        { path: 'HEAD', data: enc.encode(`ref: refs/heads/${head}\n`) },
        { path: `refs/heads/${head}`, data: enc.encode('aaaaaaaa\n') },
      ]
      const mod = await import('/src/utils/gitWorkerClient.ts')
      const client = mod.createGitWorkerClient()
      await client.loadRepo('repo-int2', { gitFiles: gf, workFiles: [] })
      const r = await client.diff('main', 'main')
      client.dispose()
      return r
    }, makeEvalRepo('main'))
    expect(out.files).toEqual([])
  })

  test('2.3: readFile notFound for missing file', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const enc = new TextEncoder()
      const mod = await import('/src/utils/gitWorkerClient.ts')
      const client = mod.createGitWorkerClient()
      await client.loadRepo('repo-int3', { gitFiles: [
        { path: 'HEAD', data: enc.encode('ref: refs/heads/main\n') },
        { path: 'refs/heads/main', data: enc.encode('aaaaaaaa\n') },
      ], workFiles: [] })
      // Use WORKDIR sentinel to exercise notFound path without requiring commit objects
      const r = await client.readFile('__WORKDIR__', 'missing.txt')
      client.dispose()
      return r
    })
    expect(res.notFound).toBe(true)
  })

  test('2.4: worker error propagates', async ({ page }) => {
    const threw = await page.evaluate(async () => {
      ;(window as any).__workerBehavior.mode = 'throw'
      const enc = new TextEncoder()
      const mod = await import('/src/utils/gitWorkerClient.ts')
      const client = mod.createGitWorkerClient()
      await client.loadRepo('repo-int4', { gitFiles: [
        { path: 'HEAD', data: enc.encode('ref: refs/heads/main\n') },
        { path: 'refs/heads/main', data: enc.encode('aaaaaaaa\n') },
      ], workFiles: [] })
      try {
        await client.diff('main', 'feature-branch')
        return false
      } catch (e: any) {
        return /Synthetic error/.test(e?.message || '')
      } finally {
        client.dispose()
        ;(window as any).__workerBehavior.mode = 'normal'
      }
    })
    expect(threw).toBe(true)
  })

  test('2.5: client timeout when worker delayed', async ({ page }) => {
    const timedOut = await page.evaluate(async () => {
      ;(window as any).__workerBehavior.mode = 'delay'; (window as any).__workerBehavior.delayMs = 61_000
      const enc = new TextEncoder()
      const mod = await import('/src/utils/gitWorkerClient.ts')
      const client = mod.createGitWorkerClient()
      await client.loadRepo('repo-int5', { gitFiles: [
        { path: 'HEAD', data: enc.encode('ref: refs/heads/main\n') },
        { path: 'refs/heads/main', data: enc.encode('aaaaaaaa\n') },
      ], workFiles: [] })
      // Patch timers BEFORE issuing the request so the client's timeout is scheduled as immediate
      const originalSetTimeout = window.setTimeout
      const originalClearTimeout = window.clearTimeout
      let timers: any[] = []
      ;(window as any).setTimeout = ((fn: any, ms?: number, ...args: any[]) => {
        const id = originalSetTimeout(fn, 0, ...args)
        timers.push(id)
        return id
      }) as any
      ;(window as any).clearTimeout = ((id: any) => originalClearTimeout(id)) as any
      try {
        await client.diff('main', 'feature-branch')
        return false
      } catch (e: any) {
        return /timed out/i.test(e?.message || '')
      } finally {
        ;(window as any).setTimeout = originalSetTimeout
        ;(window as any).clearTimeout = originalClearTimeout
        timers.forEach((id) => originalClearTimeout(id))
        client.dispose()
        ;(window as any).__workerBehavior.mode = 'normal'
      }
    })
    expect(timedOut).toBe(true)
  })
})



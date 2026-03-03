import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TauriGitService } from './TauriGitService'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'

const mockedInvoke = vi.mocked(invoke)

describe('TauriGitService', () => {
  let service: TauriGitService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new TauriGitService()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadRepo', () => {
    it('calls invoke("open_repo") with correct path and returns mapped result', async () => {
      const mockResult = { branches: ['main', 'dev'], defaultBranch: 'main' }
      mockedInvoke.mockResolvedValueOnce(mockResult)

      const result = await service.loadRepo('/tmp/my-repo', {})

      expect(mockedInvoke).toHaveBeenCalledWith('open_repo', { path: '/tmp/my-repo' })
      expect(result).toEqual(mockResult)
    })
  })

  describe('listBranches', () => {
    it('calls invoke("get_branches") with repo path', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      const branchResult = { branches: ['main', 'feature'], defaultBranch: 'main' }
      mockedInvoke.mockResolvedValueOnce(branchResult)

      const result = await service.listBranches()

      expect(mockedInvoke).toHaveBeenCalledWith('get_branches', { path: '/tmp/repo' })
      expect(result).toEqual(branchResult)
    })

    it('throws when no repository is loaded', async () => {
      await expect(service.listBranches()).rejects.toThrow('No repository loaded')
    })
  })

  describe('getDiff', () => {
    it('calls invoke("git_diff") with base and compare refs', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      const diffResult = { files: [{ path: 'src/index.ts', type: 'modify' }] }
      mockedInvoke.mockResolvedValueOnce(diffResult)

      const result = await service.getDiff('main', 'feature')

      expect(mockedInvoke).toHaveBeenCalledWith('git_diff', {
        path: '/tmp/repo',
        base: 'main',
        compare: 'feature',
      })
      expect(result).toEqual(diffResult)
    })

    it('throws when no repository is loaded', async () => {
      await expect(service.getDiff('main', 'dev')).rejects.toThrow('No repository loaded')
    })
  })

  describe('readFile', () => {
    it('maps invoke result to FileContent with notFound field', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      mockedInvoke.mockResolvedValueOnce({
        binary: false,
        text: 'console.log("hello")',
        not_found: false,
      })

      const result = await service.readFile('main', 'src/index.ts')

      expect(mockedInvoke).toHaveBeenCalledWith('read_file_blob', {
        path: '/tmp/repo',
        refName: 'main',
        filePath: 'src/index.ts',
      })
      expect(result).toEqual({
        binary: false,
        text: 'console.log("hello")',
        notFound: false,
      })
    })

    it('maps not_found to notFound for missing files', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      mockedInvoke.mockResolvedValueOnce({
        binary: false,
        text: null,
        not_found: true,
      })

      const result = await service.readFile('main', 'nonexistent.ts')

      expect(result).toEqual({
        binary: false,
        text: null,
        notFound: true,
      })
    })

    it('returns binary: true for binary files', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      mockedInvoke.mockResolvedValueOnce({
        binary: true,
        text: null,
      })

      const result = await service.readFile('main', 'image.png')

      expect(result).toEqual({
        binary: true,
        text: null,
        notFound: undefined,
      })
    })
  })

  describe('listFiles', () => {
    it('returns flat array of file paths', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      const filesResult = { files: ['src/a.ts', 'src/b.ts', 'README.md'] }
      mockedInvoke.mockResolvedValueOnce(filesResult)

      const result = await service.listFiles('main')

      expect(mockedInvoke).toHaveBeenCalledWith('list_files', {
        path: '/tmp/repo',
        refName: 'main',
      })
      expect(result).toEqual(filesResult)
    })
  })

  describe('listFilesWithOids', () => {
    it('returns files with OID strings', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      const filesResult = {
        files: [
          { path: 'src/a.ts', oid: 'abc123def456' },
          { path: 'src/b.ts', oid: '789012fed345' },
        ],
      }
      mockedInvoke.mockResolvedValueOnce(filesResult)

      const result = await service.listFilesWithOids('main')

      expect(mockedInvoke).toHaveBeenCalledWith('list_files_with_oids', {
        path: '/tmp/repo',
        refName: 'main',
      })
      expect(result).toEqual(filesResult)
    })
  })

  describe('resolveRef', () => {
    it('returns OID string for a ref', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      const oidResult = { oid: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' }
      mockedInvoke.mockResolvedValueOnce(oidResult)

      const result = await service.resolveRef('main')

      expect(mockedInvoke).toHaveBeenCalledWith('resolve_ref', {
        path: '/tmp/repo',
        refName: 'main',
      })
      expect(result).toEqual(oidResult)
    })
  })

  describe('listCommits', () => {
    it('calls invoke("list_commits") with ref and maxCount', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      const commitsResult = { commits: [] }
      mockedInvoke.mockResolvedValueOnce(commitsResult)

      const result = await service.listCommits('main', 50)

      expect(mockedInvoke).toHaveBeenCalledWith('list_commits', {
        path: '/tmp/repo',
        refName: 'main',
        maxCount: 50,
      })
      expect(result).toEqual(commitsResult)
    })

    it('passes null maxCount when not provided', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      const commitsResult = { commits: [] }
      mockedInvoke.mockResolvedValueOnce(commitsResult)

      await service.listCommits('dev')

      expect(mockedInvoke).toHaveBeenCalledWith('list_commits', {
        path: '/tmp/repo',
        refName: 'dev',
        maxCount: null,
      })
    })

    it('throws when no repository is loaded', async () => {
      await expect(service.listCommits('main')).rejects.toThrow('No repository loaded')
    })
  })

  describe('dispose', () => {
    it('calls invoke("close_repo") and clears repo path', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      mockedInvoke.mockResolvedValueOnce(undefined)
      await service.dispose()

      expect(mockedInvoke).toHaveBeenCalledWith('close_repo')

      // After dispose, methods that need repoPath should throw
      await expect(service.listBranches()).rejects.toThrow('No repository loaded')
    })

    it('does not call close_repo when no repo is loaded', async () => {
      await service.dispose()

      expect(mockedInvoke).not.toHaveBeenCalled()
    })

    it('clears repo path even if close_repo fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      mockedInvoke.mockRejectedValueOnce(new Error('close failed'))
      await service.dispose()

      // repoPath should still be cleared
      await expect(service.getDiff('main', 'dev')).rejects.toThrow('No repository loaded')
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('error propagation', () => {
    it('propagates invoke rejection for loadRepo', async () => {
      mockedInvoke.mockRejectedValueOnce(new Error('Repo not found at /bad/path'))

      await expect(service.loadRepo('/bad/path', {})).rejects.toThrow(
        'Repo not found at /bad/path'
      )
    })

    it('propagates invoke rejection for getDiff', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})
      mockedInvoke.mockClear()

      mockedInvoke.mockRejectedValueOnce(new Error('Invalid ref: nonexistent'))

      await expect(service.getDiff('main', 'nonexistent')).rejects.toThrow(
        'Invalid ref: nonexistent'
      )
    })
  })

  describe('singleton-like reuse', () => {
    it('reuses the same instance and repo path across calls', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo', {})

      mockedInvoke.mockResolvedValueOnce({ files: [] })
      await service.getDiff('main', 'main')

      mockedInvoke.mockResolvedValueOnce({ files: ['a.ts'] })
      await service.listFiles('main')

      // All calls after loadRepo should use the same path
      expect(mockedInvoke).toHaveBeenCalledWith('git_diff', expect.objectContaining({ path: '/tmp/repo' }))
      expect(mockedInvoke).toHaveBeenCalledWith('list_files', expect.objectContaining({ path: '/tmp/repo' }))
    })

    it('allows loading a new repo after dispose', async () => {
      mockedInvoke.mockResolvedValueOnce({ branches: ['main'], defaultBranch: 'main' })
      await service.loadRepo('/tmp/repo-a', {})

      mockedInvoke.mockResolvedValueOnce(undefined)
      await service.dispose()

      mockedInvoke.mockResolvedValueOnce({ branches: ['dev'], defaultBranch: 'dev' })
      const result = await service.loadRepo('/tmp/repo-b', {})

      expect(result).toEqual({ branches: ['dev'], defaultBranch: 'dev' })
      expect(mockedInvoke).toHaveBeenLastCalledWith('open_repo', { path: '/tmp/repo-b' })
    })
  })
})

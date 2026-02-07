import { useState, useEffect } from 'react'
import { useDesktopGitRepository } from './hooks/useDesktopGitRepository'
import { StatusBar } from '@gitcontext/ui'
import type { DiffResult } from '@gitcontext/core'
import './App.css'

function DesktopApp() {
  const {
    repoStatus,
    gitService,
    repoPath,
    branches,
    baseBranch,
    setBaseBranch,
    compareBranch,
    setCompareBranch,
    selectAndLoadRepo,
    resetRepo,
  } = useDesktopGitRepository()

  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)

  // Load diff when branches change
  useEffect(() => {
    if (repoStatus.state !== 'ready' || !baseBranch || !compareBranch) {
      setDiffResult(null)
      return
    }

    let cancelled = false

    async function loadDiff() {
      try {
        setDiffLoading(true)
        setDiffError(null)
        const result = await gitService.getDiff(baseBranch, compareBranch)
        if (!cancelled) {
          setDiffResult(result)
        }
      } catch (error) {
        if (!cancelled) {
          setDiffError(error instanceof Error ? error.message : String(error))
          setDiffResult(null)
        }
      } finally {
        if (!cancelled) {
          setDiffLoading(false)
        }
      }
    }

    loadDiff()

    return () => {
      cancelled = true
    }
  }, [repoStatus, baseBranch, compareBranch, gitService])

  const isReady = repoStatus.state === 'ready'
  const statusMessage =
    repoStatus.state === 'loading'
      ? repoStatus.message || 'Loading...'
      : repoStatus.state === 'error'
      ? `Error: ${repoStatus.error}`
      : repoStatus.state === 'ready'
      ? `Repository: ${repoPath}`
      : 'No repository loaded'

  return (
    <div className="gc-app">
      <div className="gc-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            GitContext Desktop
          </h1>
          <span style={{ fontSize: '12px', color: '#666', background: '#f0f0f0', padding: '2px 8px', borderRadius: '4px' }}>
            Rust + Tauri
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={selectAndLoadRepo}
            disabled={repoStatus.state === 'loading'}
            className="gc-button gc-button-primary"
          >
            📁 {isReady ? 'Change Repository' : 'Open Repository'}
          </button>
          {isReady && (
            <button onClick={resetRepo} className="gc-button">
              ✕ Close
            </button>
          )}
        </div>
      </div>

      <div className="gc-content">
        {!isReady ? (
          <div className="gc-empty-state">
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
              <h2 style={{ marginBottom: '8px' }}>No Repository Open</h2>
              <p style={{ color: '#666', marginBottom: '24px' }}>
                Select a Git repository to get started
              </p>
              <button
                onClick={selectAndLoadRepo}
                disabled={repoStatus.state === 'loading'}
                className="gc-button gc-button-primary"
                style={{ fontSize: '16px', padding: '12px 24px' }}
              >
                {repoStatus.state === 'loading' ? '⏳ Opening...' : '📁 Open Repository'}
              </button>
            </div>
          </div>
        ) : (
          <div className="gc-workspace">
            {/* Branch Selection Panel */}
            <div className="gc-panel" style={{ padding: '16px', borderBottom: '1px solid #e0e0e0' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#666' }}>
                    Base Branch
                  </label>
                  <select
                    value={baseBranch}
                    onChange={(e) => setBaseBranch(e.target.value)}
                    className="gc-select"
                    style={{ width: '100%' }}
                  >
                    {branches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ paddingTop: '20px', fontSize: '20px', color: '#999' }}>→</div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#666' }}>
                    Compare Branch
                  </label>
                  <select
                    value={compareBranch}
                    onChange={(e) => setCompareBranch(e.target.value)}
                    className="gc-select"
                    style={{ width: '100%' }}
                  >
                    {branches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Diff Results */}
            <div className="gc-panel" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>
                Changed Files ({diffResult?.files.length || 0})
              </h3>

              {diffLoading && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                  <div>⏳ Loading diff...</div>
                </div>
              )}

              {diffError && (
                <div style={{ padding: '12px', background: '#fee', border: '1px solid #fcc', borderRadius: '4px', color: '#c00' }}>
                  ❌ Error: {diffError}
                </div>
              )}

              {!diffLoading && !diffError && diffResult && diffResult.files.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
                  <div>No changes between these branches</div>
                </div>
              )}

              {!diffLoading && !diffError && diffResult && diffResult.files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {diffResult.files.map((file) => (
                    <div
                      key={file.path}
                      style={{
                        padding: '8px 12px',
                        background: '#f8f8f8',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '16px',
                          width: '20px',
                          textAlign: 'center',
                        }}
                      >
                        {file.type === 'add' ? '✚' : file.type === 'remove' ? '✖' : '●'}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          color:
                            file.type === 'add'
                              ? '#0a0'
                              : file.type === 'remove'
                              ? '#c00'
                              : '#07c',
                          width: '50px',
                        }}
                      >
                        {file.type}
                      </span>
                      <span style={{ flex: 1, wordBreak: 'break-all' }}>{file.path}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <StatusBar
        message={statusMessage}
        percent={repoStatus.state === 'loading' ? 50 : 100}
        indeterminate={repoStatus.state === 'loading'}
      />
    </div>
  )
}

export default DesktopApp

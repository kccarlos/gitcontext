import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { HeaderControls } from '@gitcontext/ui'
import type { WorkspaceListItem } from '@gitcontext/core'
import { TauriGitService } from './services/TauriGitService'
import './App.css'

function App() {
  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('World')
  const [gitMsg, setGitMsg] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [branches, setBranches] = useState<string[]>([])

  async function greet() {
    try {
      const msg = await invoke<string>('greet', { name })
      setGreetMsg(msg)
    } catch (error) {
      setGreetMsg(`Error: ${error}`)
    }
  }

  async function selectRepo() {
    try {
      // Open directory picker
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Git Repository',
      })

      if (!selected || typeof selected !== 'string') {
        return
      }

      setRepoPath(selected)
      setGitMsg('Opening repository...')

      // Test git operations
      const gitService = new TauriGitService()
      const result = await gitService.loadRepo(selected, {})

      setBranches(result.branches)
      setGitMsg(
        `✅ Repository opened!\nDefault branch: ${result.defaultBranch || 'unknown'}\nBranches: ${result.branches.length}`
      )
    } catch (error) {
      setGitMsg(`❌ Error: ${error}`)
      setBranches([])
    }
  }

  // Test shared UI component rendering
  const mockWorkspaces: WorkspaceListItem[] = []

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1>GitContext Desktop (Tauri) ✨</h1>
      <p style={{ color: '#666' }}>Successfully using shared @gitcontext/ui and @gitcontext/core packages</p>

      <div style={{ marginBottom: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
        <h2>🦀 Tauri Backend Communication Test</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter a name..."
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', flex: 1 }}
          />
          <button onClick={greet} style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#007bff', color: 'white', cursor: 'pointer' }}>
            Greet
          </button>
        </div>
        {greetMsg && <p style={{ marginTop: '10px', padding: '10px', background: 'white', borderRadius: '4px' }}>{greetMsg}</p>}
      </div>

      <div style={{ marginBottom: '20px', padding: '15px', background: '#e8f4f8', borderRadius: '8px' }}>
        <h2>🔧 Rust Git2 Integration Test</h2>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
          Test native Git operations using Rust git2 crate
        </p>
        <button
          onClick={selectRepo}
          style={{
            padding: '10px 20px',
            borderRadius: '4px',
            border: 'none',
            background: '#28a745',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          📁 Select Git Repository
        </button>
        {repoPath && (
          <p style={{ marginTop: '10px', fontSize: '12px', color: '#666', wordBreak: 'break-all' }}>
            <strong>Path:</strong> {repoPath}
          </p>
        )}
        {gitMsg && (
          <pre
            style={{
              marginTop: '10px',
              padding: '10px',
              background: 'white',
              borderRadius: '4px',
              fontSize: '13px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {gitMsg}
          </pre>
        )}
        {branches.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <strong>Branches ({branches.length}):</strong>
            <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
              {branches.slice(0, 10).map((branch) => (
                <li key={branch} style={{ fontSize: '13px' }}>
                  {branch}
                </li>
              ))}
              {branches.length > 10 && <li style={{ fontSize: '13px', color: '#666' }}>... and {branches.length - 10} more</li>}
            </ul>
          </div>
        )}
      </div>

      <div style={{ padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
        <h2>⚛️ Shared UI Component Test</h2>
        <p style={{ fontSize: '14px', color: '#666' }}>Rendering HeaderControls from @gitcontext/ui:</p>
        <div style={{ marginTop: '10px' }}>
          <HeaderControls
            workspaces={mockWorkspaces}
            selectedWorkspaceId={''}
            onSelectWorkspace={() => console.log('Select workspace')}
            onSaveWorkspace={() => console.log('Save workspace')}
            onRemoveWorkspace={() => console.log('Remove workspace')}
            onSelectNewRepo={() => console.log('Select new repo')}
            projectLoaded={false}
            currentDir={null}
          />
        </div>
      </div>
    </div>
  )
}

export default App

import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { HeaderControls } from '@gitcontext/ui'
import type { WorkspaceListItem } from '@gitcontext/core'

function App() {
  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('World')

  async function greet() {
    // Test Tauri invoke
    try {
      const msg = await invoke<string>('greet', { name })
      setGreetMsg(msg)
    } catch (error) {
      setGreetMsg(`Error: ${error}`)
    }
  }

  // Test shared UI component rendering
  const mockWorkspaces: WorkspaceListItem[] = []

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1>GitContext Desktop (Tauri) ✨</h1>
      <p style={{ color: '#666' }}>Successfully using shared @gitcontext/ui and @gitcontext/core packages</p>

      <div style={{ marginBottom: '30px', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
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

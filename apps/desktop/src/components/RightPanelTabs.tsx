import { ReactNode } from 'react'

export type TabId = 'files' | 'settings'

type RightPanelTabsProps = {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  filesCount: number
  children: ReactNode
}

export function RightPanelTabs({ activeTab, onTabChange, filesCount, children }: RightPanelTabsProps) {
  return (
    <div className="right-panel-tabs">
      <div className="tab-nav">
        <button
          className={`tab-nav-item ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => onTabChange('files')}
          type="button"
        >
          Selected Files
          {filesCount > 0 && <span className="tab-badge">{filesCount}</span>}
        </button>
        <button
          className={`tab-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
          type="button"
        >
          Settings
        </button>
      </div>
      <div className="tab-content">
        {children}
      </div>
    </div>
  )
}

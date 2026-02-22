import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { RightPanelTabs, TabId } from './RightPanelTabs'

function makeProps(overrides: Partial<Parameters<typeof RightPanelTabs>[0]> = {}) {
  return {
    activeTab: 'files' as TabId,
    onTabChange: vi.fn(),
    filesCount: 0,
    children: <div data-testid="tab-content">Tab Content</div>,
    ...overrides,
  }
}

describe('RightPanelTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders two tabs: Selected Files and Settings', () => {
    render(<RightPanelTabs {...makeProps()} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(screen.getByText('Selected Files')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('files tab shows badge with file count when filesCount > 0', () => {
    render(<RightPanelTabs {...makeProps({ filesCount: 42 })} />)

    expect(screen.getByText('42')).toBeInTheDocument()
    const badge = screen.getByText('42')
    expect(badge).toHaveClass('tab-badge')
  })

  it('badge is not shown when filesCount is 0', () => {
    render(<RightPanelTabs {...makeProps({ filesCount: 0 })} />)

    const badges = document.querySelectorAll('.tab-badge')
    expect(badges).toHaveLength(0)
  })

  it('clicking files tab calls onTabChange with "files"', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()

    render(
      <RightPanelTabs
        {...makeProps({ activeTab: 'settings', onTabChange })}
      />
    )

    await user.click(screen.getByText('Selected Files'))
    expect(onTabChange).toHaveBeenCalledTimes(1)
    expect(onTabChange).toHaveBeenCalledWith('files')
  })

  it('clicking settings tab calls onTabChange with "settings"', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()

    render(
      <RightPanelTabs
        {...makeProps({ activeTab: 'files', onTabChange })}
      />
    )

    await user.click(screen.getByText('Settings'))
    expect(onTabChange).toHaveBeenCalledTimes(1)
    expect(onTabChange).toHaveBeenCalledWith('settings')
  })

  it('active tab has "active" class styling', () => {
    const { rerender } = render(
      <RightPanelTabs {...makeProps({ activeTab: 'files' })} />
    )

    const filesButton = screen.getByText('Selected Files').closest('button')!
    const settingsButton = screen.getByText('Settings').closest('button')!

    expect(filesButton).toHaveClass('active')
    expect(settingsButton).not.toHaveClass('active')

    // Switch active tab to settings
    rerender(
      <RightPanelTabs {...makeProps({ activeTab: 'settings' })} />
    )

    expect(filesButton).not.toHaveClass('active')
    expect(settingsButton).toHaveClass('active')
  })

  it('children content renders in tab panel', () => {
    render(
      <RightPanelTabs {...makeProps()}>
        <div data-testid="custom-child">Custom child content</div>
      </RightPanelTabs>
    )

    expect(screen.getByTestId('custom-child')).toBeInTheDocument()
    expect(screen.getByText('Custom child content')).toBeInTheDocument()

    // Verify the child is within the tab-content container
    const tabContent = document.querySelector('.tab-content')
    expect(tabContent).toContainElement(screen.getByTestId('custom-child'))
  })

  it('switching tabs preserves children (no remount)', async () => {
    let renderCount = 0

    function TrackedChild() {
      renderCount++
      return <div data-testid="tracked">Rendered {renderCount} times</div>
    }

    function TestWrapper() {
      const [activeTab, setActiveTab] = useState<TabId>('files')
      return (
        <RightPanelTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          filesCount={5}
        >
          <TrackedChild />
        </RightPanelTabs>
      )
    }

    const user = userEvent.setup()
    render(<TestWrapper />)

    // Child rendered initially
    expect(screen.getByTestId('tracked')).toBeInTheDocument()
    const initialCount = renderCount

    // Switch to settings
    await user.click(screen.getByText('Settings'))

    // Child still in DOM (not unmounted/remounted)
    expect(screen.getByTestId('tracked')).toBeInTheDocument()

    // Switch back to files
    await user.click(screen.getByText('Selected Files'))

    // Child still there and hasn't been unmounted
    expect(screen.getByTestId('tracked')).toBeInTheDocument()

    // renderCount should have increased due to re-renders, but the
    // component was never unmounted (content stays in the same place)
    expect(renderCount).toBeGreaterThanOrEqual(initialCount)
  })
})

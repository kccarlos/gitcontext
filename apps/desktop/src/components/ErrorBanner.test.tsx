import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, useEffect, useCallback } from 'react'
import { ErrorBanner } from './ErrorBanner'

describe('ErrorBanner', () => {
  it('renders nothing when error is null', () => {
    const { container } = render(<ErrorBanner error={null} onDismiss={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when error is empty string', () => {
    const { container } = render(<ErrorBanner error="" onDismiss={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders error banner with message when error is provided', () => {
    render(<ErrorBanner error="Test error message" onDismiss={vi.fn()} />)
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('displays warning icon', () => {
    const { container } = render(<ErrorBanner error="Test error" onDismiss={vi.fn()} />)
    const icon = container.querySelector('.error-banner-icon')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveTextContent('⚠️')
  })

  it('renders dismiss button', () => {
    render(<ErrorBanner error="Test error" onDismiss={vi.fn()} />)
    const dismissButton = screen.getByRole('button', { name: /dismiss/i })
    expect(dismissButton).toBeInTheDocument()
  })

  it('calls onDismiss when dismiss button is clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(<ErrorBanner error="Test error" onDismiss={onDismiss} />)

    const dismissButton = screen.getByRole('button', { name: /dismiss/i })
    await user.click(dismissButton)

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('has correct CSS classes', () => {
    const { container } = render(<ErrorBanner error="Test error" onDismiss={vi.fn()} />)

    expect(container.querySelector('.error-banner')).toBeInTheDocument()
    expect(container.querySelector('.error-banner-text')).toBeInTheDocument()
    expect(container.querySelector('.error-banner-close')).toBeInTheDocument()
  })

  it('renders long error messages', () => {
    const longError = 'This is a very long error message that should still be displayed correctly in the banner component without breaking the layout'
    render(<ErrorBanner error={longError} onDismiss={vi.fn()} />)
    expect(screen.getByText(longError)).toBeInTheDocument()
  })
})

/**
 * Integration-level tests that simulate the App's error management pattern:
 * - errorMessage state managed via useState
 * - Global event listeners (unhandledrejection, window.error) → setErrorMessage
 * - Repo load / diff compute errors → setErrorMessage
 * - Dismiss → setErrorMessage(null)
 * - Auto-clear on successful load
 * - Recovery flow: error → user action → success
 */
describe('ErrorBanner integration', () => {
  /**
   * A test harness that mirrors the error management pattern in AppContent:
   * - errorMessage state drives the banner
   * - Global error/rejection listeners set errorMessage
   * - External controls simulate repo load and diff compute
   */
  function ErrorBannerHarness() {
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    // Global error listeners (mirrors App.tsx lines 65-84)
    useEffect(() => {
      const onRejection = (event: PromiseRejectionEvent) => {
        event.preventDefault?.()
        setErrorMessage(
          event.reason instanceof Error ? event.reason.message : String(event.reason),
        )
      }
      const onError = (event: ErrorEvent) => {
        setErrorMessage(event.error?.message || event.message)
      }

      window.addEventListener('unhandledrejection', onRejection)
      window.addEventListener('error', onError)
      return () => {
        window.removeEventListener('unhandledrejection', onRejection)
        window.removeEventListener('error', onError)
      }
    }, [])

    // Simulate loadRepoFromHandle success (clears error)
    const simulateRepoLoadSuccess = useCallback(() => {
      setErrorMessage(null)
    }, [])

    // Simulate loadRepoFromHandle failure (propagates error)
    const simulateRepoLoadError = useCallback((msg: string) => {
      setErrorMessage(msg)
    }, [])

    // Simulate computeDiffAndTree failure
    const simulateDiffError = useCallback((msg: string) => {
      setErrorMessage(msg)
    }, [])

    return (
      <div>
        <ErrorBanner error={errorMessage} onDismiss={() => setErrorMessage(null)} />
        <button data-testid="repo-load-success" onClick={simulateRepoLoadSuccess}>
          Load Success
        </button>
        <button
          data-testid="repo-load-error"
          onClick={() => simulateRepoLoadError('Failed to open repository')}
        >
          Load Error
        </button>
        <button
          data-testid="diff-error"
          onClick={() => simulateDiffError('Failed to compute diff')}
        >
          Diff Error
        </button>
        <button
          data-testid="set-error"
          onClick={() => setErrorMessage('custom error')}
        >
          Set Error
        </button>
      </div>
    )
  }

  let originalOnError: OnErrorEventHandler

  beforeEach(() => {
    // Prevent jsdom from logging dispatched error events as actual test errors
    originalOnError = window.onerror
    window.onerror = null
  })

  afterEach(() => {
    window.onerror = originalOnError
  })

  it('unhandled promise rejection displays in error banner', async () => {
    render(<ErrorBannerHarness />)

    expect(screen.queryByText('async failure')).not.toBeInTheDocument()

    await act(async () => {
      const event = new Event('unhandledrejection') as any
      event.reason = new Error('async failure')
      event.preventDefault = vi.fn()
      window.dispatchEvent(event)
    })

    expect(screen.getByText('async failure')).toBeInTheDocument()
  })

  it('unhandled promise rejection with non-Error reason displays stringified value', async () => {
    render(<ErrorBannerHarness />)

    await act(async () => {
      const event = new Event('unhandledrejection') as any
      event.reason = 'plain string rejection'
      event.preventDefault = vi.fn()
      window.dispatchEvent(event)
    })

    expect(screen.getByText('plain string rejection')).toBeInTheDocument()
  })

  it('window.error event displays in error banner', async () => {
    render(<ErrorBannerHarness />)

    expect(screen.queryByText('runtime error')).not.toBeInTheDocument()

    await act(async () => {
      const errorEvent = new ErrorEvent('error', {
        error: new Error('runtime error'),
        message: 'runtime error',
      })
      window.dispatchEvent(errorEvent)
    })

    expect(screen.getByText('runtime error')).toBeInTheDocument()
  })

  it('window.error event without error object uses message field', async () => {
    render(<ErrorBannerHarness />)

    await act(async () => {
      const errorEvent = new ErrorEvent('error', {
        message: 'script error from cross-origin',
      })
      window.dispatchEvent(errorEvent)
    })

    expect(screen.getByText('script error from cross-origin')).toBeInTheDocument()
  })

  it('error banner auto-clears when new repo loads successfully', async () => {
    const user = userEvent.setup()
    render(<ErrorBannerHarness />)

    // First trigger an error
    await user.click(screen.getByTestId('repo-load-error'))
    expect(screen.getByText('Failed to open repository')).toBeInTheDocument()

    // Then simulate successful repo load which clears the error
    await user.click(screen.getByTestId('repo-load-success'))
    expect(screen.queryByText('Failed to open repository')).not.toBeInTheDocument()

    // Banner should not be rendered
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument()
  })

  it('multiple rapid errors show only the latest', async () => {
    const user = userEvent.setup()

    function RapidErrorHarness() {
      const [errorMessage, setErrorMessage] = useState<string | null>(null)
      return (
        <div>
          <ErrorBanner error={errorMessage} onDismiss={() => setErrorMessage(null)} />
          <button data-testid="error-1" onClick={() => setErrorMessage('Error one')}>E1</button>
          <button data-testid="error-2" onClick={() => setErrorMessage('Error two')}>E2</button>
          <button data-testid="error-3" onClick={() => setErrorMessage('Error three')}>E3</button>
        </div>
      )
    }

    render(<RapidErrorHarness />)

    // Fire multiple errors rapidly
    await user.click(screen.getByTestId('error-1'))
    await user.click(screen.getByTestId('error-2'))
    await user.click(screen.getByTestId('error-3'))

    // Only the latest should be visible
    expect(screen.queryByText('Error one')).not.toBeInTheDocument()
    expect(screen.queryByText('Error two')).not.toBeInTheDocument()
    expect(screen.getByText('Error three')).toBeInTheDocument()
  })

  it('error from loadRepoFromHandle propagates to banner', async () => {
    const user = userEvent.setup()
    render(<ErrorBannerHarness />)

    // No error initially
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument()

    // Simulate repo load error
    await user.click(screen.getByTestId('repo-load-error'))
    expect(screen.getByText('Failed to open repository')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('error from computeDiffAndTree propagates to banner', async () => {
    const user = userEvent.setup()
    render(<ErrorBannerHarness />)

    await user.click(screen.getByTestId('diff-error'))
    expect(screen.getByText('Failed to compute diff')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('dismissing error clears it and does not reappear unless a new error occurs', async () => {
    const user = userEvent.setup()
    render(<ErrorBannerHarness />)

    // Trigger an error
    await user.click(screen.getByTestId('repo-load-error'))
    expect(screen.getByText('Failed to open repository')).toBeInTheDocument()

    // Dismiss it
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText('Failed to open repository')).not.toBeInTheDocument()

    // Simulate a successful load — banner should remain hidden
    await user.click(screen.getByTestId('repo-load-success'))
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument()

    // A new error should appear
    await user.click(screen.getByTestId('diff-error'))
    expect(screen.getByText('Failed to compute diff')).toBeInTheDocument()
  })

  it('error recovery flow: error state → user action → success state', async () => {
    const user = userEvent.setup()
    render(<ErrorBannerHarness />)

    // 1. Error state: load failure
    await user.click(screen.getByTestId('repo-load-error'))
    expect(screen.getByText('Failed to open repository')).toBeInTheDocument()

    // 2. User action: retry load → success
    await user.click(screen.getByTestId('repo-load-success'))
    expect(screen.queryByText('Failed to open repository')).not.toBeInTheDocument()

    // 3. Verify clean state — no banner visible
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument()

    // 4. New error (diff) shows banner again
    await user.click(screen.getByTestId('diff-error'))
    expect(screen.getByText('Failed to compute diff')).toBeInTheDocument()

    // 5. Dismiss, then success
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText('Failed to compute diff')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('repo-load-success'))
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument()
  })

  it('re-renders correctly when error message changes', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<ErrorBanner error="First error" onDismiss={onDismiss} />)
    expect(screen.getByText('First error')).toBeInTheDocument()

    rerender(<ErrorBanner error="Second error" onDismiss={onDismiss} />)
    expect(screen.queryByText('First error')).not.toBeInTheDocument()
    expect(screen.getByText('Second error')).toBeInTheDocument()
  })

  it('transitions from error to null hides the banner', () => {
    const onDismiss = vi.fn()
    const { rerender, container } = render(
      <ErrorBanner error="Some error" onDismiss={onDismiss} />,
    )
    expect(screen.getByText('Some error')).toBeInTheDocument()

    rerender(<ErrorBanner error={null} onDismiss={onDismiss} />)
    expect(container.firstChild).toBeNull()
  })

  it('global listeners are cleaned up on unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(<ErrorBannerHarness />)

    // Listeners were added for 'unhandledrejection' and 'error'
    const addedTypes = addSpy.mock.calls.map((c) => c[0])
    expect(addedTypes).toContain('unhandledrejection')
    expect(addedTypes).toContain('error')

    unmount()

    // Listeners are removed on unmount
    const removedTypes = removeSpy.mock.calls.map((c) => c[0])
    expect(removedTypes).toContain('unhandledrejection')
    expect(removedTypes).toContain('error')

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})

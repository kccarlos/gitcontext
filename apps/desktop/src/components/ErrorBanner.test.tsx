import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

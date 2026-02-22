import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextFooter } from './ContextFooter'

// Mock the TokenCountsContext module
const mockContextValue = {
  counts: new Map<string, number>(),
  total: 0,
  busy: false,
  progress: { completed: 0, total: 0, percent: 0 },
}

vi.mock('../context/TokenCountsContext', () => ({
  useTokenCountsContext: () => mockContextValue,
}))

function makeProps(overrides: Partial<Parameters<typeof ContextFooter>[0]> = {}) {
  return {
    filesCount: 0,
    instructionsTokens: 0,
    fileTreeTokens: 0,
    limit: 128000,
    onCopy: vi.fn(),
    copyFlash: null as string | null,
    ...overrides,
  }
}

describe('ContextFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockContextValue.counts = new Map()
    mockContextValue.total = 0
    mockContextValue.busy = false
    mockContextValue.progress = { completed: 0, total: 0, percent: 0 }
  })

  it('displays correct token breakdown (files, content, instructions, file tree, total)', () => {
    mockContextValue.total = 5000

    render(
      <ContextFooter
        {...makeProps({
          filesCount: 3,
          instructionsTokens: 200,
          fileTreeTokens: 100,
          limit: 128000,
        })}
      />
    )

    // Files count
    expect(screen.getByText('Files:')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()

    // File content tokens from context
    expect(screen.getByText('File Content:')).toBeInTheDocument()
    expect(screen.getByText('5,000')).toBeInTheDocument()

    // Instructions tokens
    expect(screen.getByText('Instructions:')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()

    // File tree tokens
    expect(screen.getByText('File Tree:')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()

    // Total tokens (5000 + 200 + 100 = 5300)
    expect(screen.getByText('Total Tokens:')).toBeInTheDocument()
    expect(screen.getByText('5,300 / 128,000')).toBeInTheDocument()
  })

  it('progress bar width matches percentage of limit', () => {
    mockContextValue.total = 64000

    const { container } = render(
      <ContextFooter
        {...makeProps({
          filesCount: 5,
          instructionsTokens: 0,
          fileTreeTokens: 0,
          limit: 128000,
        })}
      />
    )

    // 64000 / 128000 = 50%
    const progressFill = container.querySelector('.token-progress-fill') as HTMLElement
    expect(progressFill).toBeTruthy()
    expect(progressFill.style.width).toBe('50%')
  })

  it('progress bar width is capped at 100% when over limit', () => {
    mockContextValue.total = 200000

    const { container } = render(
      <ContextFooter
        {...makeProps({
          filesCount: 5,
          instructionsTokens: 0,
          fileTreeTokens: 0,
          limit: 128000,
        })}
      />
    )

    // 200000 / 128000 > 100%, capped at 100%
    const progressFill = container.querySelector('.token-progress-fill') as HTMLElement
    expect(progressFill).toBeTruthy()
    expect(progressFill.style.width).toBe('100%')
  })

  it('over-limit state shows warning styling when total > limit', () => {
    mockContextValue.total = 130000

    const { container } = render(
      <ContextFooter
        {...makeProps({
          filesCount: 10,
          instructionsTokens: 500,
          fileTreeTokens: 200,
          limit: 128000,
        })}
      />
    )

    // total = 130000 + 500 + 200 = 130700 > 128000
    // The token-value element and progress fill should have over-limit class
    const overLimitValue = container.querySelector('.token-value.over-limit')
    expect(overLimitValue).toBeTruthy()
    expect(overLimitValue!.textContent).toBe('130,700 / 128,000')

    const progressFill = container.querySelector('.token-progress-fill.over-limit')
    expect(progressFill).toBeTruthy()
  })

  it('over-limit is not applied when total equals limit exactly', () => {
    mockContextValue.total = 128000

    const { container } = render(
      <ContextFooter
        {...makeProps({
          filesCount: 5,
          instructionsTokens: 0,
          fileTreeTokens: 0,
          limit: 128000,
        })}
      />
    )

    // total = 128000, limit = 128000 -> not over limit (total > limit is false)
    const overLimitValue = container.querySelector('.token-value.over-limit')
    expect(overLimitValue).toBeNull()
  })

  it('copy button disabled when no files selected', () => {
    render(<ContextFooter {...makeProps({ filesCount: 0 })} />)

    const copyButton = screen.getByRole('button')
    expect(copyButton).toBeDisabled()
  })

  it('copy button disabled when disabled prop is true', () => {
    render(<ContextFooter {...makeProps({ filesCount: 5, disabled: true })} />)

    const copyButton = screen.getByRole('button')
    expect(copyButton).toBeDisabled()
  })

  it('copy button enabled when files are selected and not disabled', () => {
    render(<ContextFooter {...makeProps({ filesCount: 3 })} />)

    const copyButton = screen.getByRole('button')
    expect(copyButton).not.toBeDisabled()
    expect(copyButton.textContent).toContain('COPY ALL SELECTED (3)')
  })

  it('clicking copy calls onCopy', async () => {
    const user = userEvent.setup()
    const onCopy = vi.fn()

    render(<ContextFooter {...makeProps({ filesCount: 5, onCopy })} />)

    const copyButton = screen.getByRole('button')
    await user.click(copyButton)
    expect(onCopy).toHaveBeenCalledOnce()
  })

  it('copy flash message appears and disables button (success)', () => {
    render(
      <ContextFooter
        {...makeProps({ filesCount: 5, copyFlash: 'Copied!' })}
      />
    )

    const copyButton = screen.getByRole('button')
    expect(copyButton.textContent).toBe('Copied!')
    // Button is disabled during flash
    expect(copyButton).toBeDisabled()
  })

  it('copy flash message shows failure text', () => {
    render(
      <ContextFooter
        {...makeProps({ filesCount: 5, copyFlash: 'Copy failed' })}
      />
    )

    const copyButton = screen.getByRole('button')
    expect(copyButton.textContent).toBe('Copy failed')
    expect(copyButton).toBeDisabled()
  })

  it('zero limit hides progress bar', () => {
    const { container } = render(
      <ContextFooter {...makeProps({ limit: 0 })} />
    )

    const progressBar = container.querySelector('.token-progress-bar')
    expect(progressBar).toBeNull()
  })

  it('positive limit shows progress bar', () => {
    const { container } = render(
      <ContextFooter {...makeProps({ limit: 128000 })} />
    )

    const progressBar = container.querySelector('.token-progress-bar')
    expect(progressBar).toBeTruthy()
  })

  it('token counts formatted with commas for readability', () => {
    mockContextValue.total = 1234567

    render(
      <ContextFooter
        {...makeProps({
          filesCount: 50,
          instructionsTokens: 98765,
          fileTreeTokens: 43210,
          limit: 2000000,
        })}
      />
    )

    // File content: 1,234,567
    expect(screen.getByText('1,234,567')).toBeInTheDocument()
    // Instructions: 98,765
    expect(screen.getByText('98,765')).toBeInTheDocument()
    // File tree: 43,210
    expect(screen.getByText('43,210')).toBeInTheDocument()
    // Total: 1,234,567 + 98,765 + 43,210 = 1,376,542
    expect(screen.getByText('1,376,542 / 2,000,000')).toBeInTheDocument()
  })

  it('shows calculating text when busy', () => {
    mockContextValue.busy = true

    render(
      <ContextFooter
        {...makeProps({
          filesCount: 3,
          instructionsTokens: 100,
          fileTreeTokens: 50,
          limit: 128000,
        })}
      />
    )

    expect(screen.getByText('calculating...')).toBeInTheDocument()
  })
})

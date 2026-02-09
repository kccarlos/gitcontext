import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TopProgressBar } from './TopProgressBar'

describe('TopProgressBar', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(<TopProgressBar visible={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders progress bar when visible is true', () => {
    const { container } = render(<TopProgressBar visible={true} />)
    const progressBar = container.querySelector('.top-progress-bar')
    expect(progressBar).toBeInTheDocument()
  })

  it('applies indeterminate class by default', () => {
    const { container } = render(<TopProgressBar visible={true} />)
    const progressFill = container.querySelector('.top-progress-fill')
    expect(progressFill).toHaveClass('indeterminate')
  })

  it('applies indeterminate class when indeterminate is true', () => {
    const { container } = render(<TopProgressBar visible={true} indeterminate={true} />)
    const progressFill = container.querySelector('.top-progress-fill')
    expect(progressFill).toHaveClass('indeterminate')
  })

  it('does not apply indeterminate class when indeterminate is false', () => {
    const { container } = render(<TopProgressBar visible={true} indeterminate={false} />)
    const progressFill = container.querySelector('.top-progress-fill')
    expect(progressFill).not.toHaveClass('indeterminate')
  })

  it('has correct DOM structure', () => {
    const { container } = render(<TopProgressBar visible={true} />)
    const progressBar = container.querySelector('.top-progress-bar')
    const progressFill = progressBar?.querySelector('.top-progress-fill')

    expect(progressBar).toBeInTheDocument()
    expect(progressFill).toBeInTheDocument()
  })
})

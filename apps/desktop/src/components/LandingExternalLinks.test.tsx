import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingExternalLinks } from './LandingExternalLinks'

describe('LandingExternalLinks', () => {
  it('renders clickable GitHub repository and issue links', () => {
    render(<LandingExternalLinks />)

    const repoLink = screen.getByRole('link', {
      name: 'https://github.com/kccarlos/gitcontext',
    })
    expect(repoLink).toHaveAttribute('href', 'https://github.com/kccarlos/gitcontext')
    expect(repoLink).toHaveAttribute('target', '_blank')
    expect(repoLink).toHaveAttribute('rel', 'noopener noreferrer')

    const issuesLink = screen.getByRole('link', {
      name: 'https://github.com/kccarlos/gitcontext/issues',
    })
    expect(issuesLink).toHaveAttribute('href', 'https://github.com/kccarlos/gitcontext/issues')
    expect(issuesLink).toHaveAttribute('target', '_blank')
    expect(issuesLink).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

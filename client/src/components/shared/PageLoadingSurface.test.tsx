import { fireEvent, render, screen } from '../../../tests/helpers/render'
import { describe, expect, it, vi } from 'vitest'
import { PageLoadFailed } from './PageLoadFailed'
import { PageLoadingSurface } from './PageLoadingSurface'

describe('PageLoadingSurface', () => {
  it('exposes a status region with the loading label', () => {
    render(<PageLoadingSurface />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading...')
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })
})

describe('PageLoadFailed', () => {
  it('is an alert with retry, never a spinner', () => {
    const onRetry = vi.fn()
    render(
      <PageLoadFailed
        title="Could not load journeys."
        body="This part of the app stopped working. Your trips are still in the family account."
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Could not load journeys.' })).toBeInTheDocument()
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again|common\.errorRetry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

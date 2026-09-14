import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fireEvent, render, screen } from '../../../tests/helpers/render'
import { describe, expect, it, vi } from 'vitest'
import RouteErrorBoundary from './RouteErrorBoundary'

function Boom(): React.ReactElement {
  throw new Error('route widget exploded')
}

function PathSwitch(): React.ReactElement {
  const location = useLocation()
  if (location.pathname === '/boom') throw new Error('route widget exploded')
  return <div>safe route</div>
}

function PathHarness(): React.ReactElement {
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => navigate('/boom')}>go boom</button>
      <button type="button" onClick={() => navigate('/safe')}>go safe</button>
      <RouteErrorBoundary>
        <PathSwitch />
      </RouteErrorBoundary>
    </>
  )
}

describe('RouteErrorBoundary', () => {
  it('keeps a retry card instead of an empty route', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <RouteErrorBoundary>
        <Boom />
      </RouteErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /something went wrong|common\.errorTitle/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again|common\.errorRetry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload page|common\.errorReload/i })).toBeInTheDocument()
  })

  it('clears the fallback when the pathname changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<PathHarness />, { initialEntries: ['/safe'] })
    expect(screen.getByText('safe route')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'go boom' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('safe route')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'go safe' }))
    expect(screen.getByText('safe route')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../../tests/helpers/render'
import AppErrorBoundary from './AppErrorBoundary'

function Boom(): React.ReactElement {
  throw new Error('dashboard widget exploded')
}

describe('AppErrorBoundary', () => {
  it('keeps a reload card instead of an empty #root', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
    const source = screen.getByTestId('source-code-link')
    expect(source).toHaveAttribute('href', 'https://github.com/Misael-L/familytravelsite-source')
    expect(source).toHaveTextContent(/Source code \(AGPL-3.0\)/)
  })
})

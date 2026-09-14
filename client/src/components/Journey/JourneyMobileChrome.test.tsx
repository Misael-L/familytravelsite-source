import React from 'react'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { JourneySheet } from './JourneyMobileChrome'

describe('JourneySheet', () => {
  it('exposes a labelled dialog, traps Tab, restores focus, and closes on Escape', async () => {
    const user = userEvent.setup()
    function Host() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Opener</button>
          <JourneySheet
            open={open}
            title="Create Journey"
            onClose={() => setOpen(false)}
            footer={<button type="button">Save</button>}
          >
            <input aria-label="Journey Name" />
          </JourneySheet>
        </>
      )
    }
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Opener' })
    opener.focus()
    await user.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Create Journey' })
    expect(dialog).toBeInTheDocument()
    const name = screen.getByLabelText('Journey Name')
    await waitFor(() => expect(name).toHaveFocus())
    await user.tab()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    await user.tab()
    expect(name).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Create Journey' })).not.toBeInTheDocument()
    })
    expect(opener).toHaveFocus()
  })
})

import { useState } from 'react'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { upsertTripTransport, type FamilyTransportReservation } from '../../data/supabase/tripReservations'
import FamilyTransportEditor from './FamilyTransportEditor'

vi.mock('../Files/FamilyFileAttach', () => ({
  default: () => null,
}))

vi.mock('../../data/supabase/tripReservations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripReservations')>()
  return {
    ...actual,
    upsertTripTransport: vi.fn(),
  }
})

const reservation: FamilyTransportReservation = {
  id: '22222222-2222-4222-8222-222222222222',
  tripId: 'trip-1',
  type: 'bus',
  status: 'pending',
  title: 'Night bus',
  startTripDayId: 'day-1',
  endTripDayId: 'day-1',
  startsAt: null,
  endsAt: null,
  confirmationCode: null,
  notes: null,
  url: null,
  metadata: {},
  sortOrder: 0,
  createdAt: '2026-08-20T00:00:00.000Z',
  endpoints: [
    {
      id: 'rome', role: 'from', sequence: 0, name: 'Rome', code: null, airportId: null, placeId: null,
      latitude: null, longitude: null, timeZone: null, localDate: '2026-08-12', localTime: '22:00',
    },
    {
      id: 'zurich', role: 'to', sequence: 1, name: 'Zurich', code: null, airportId: null, placeId: null,
      latitude: null, longitude: null, timeZone: null, localDate: '2026-08-13', localTime: '09:30',
    },
  ],
  legs: [],
}

function clockButtons(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>('button[aria-expanded]'))
    .filter(button => (button.textContent ?? '').trim() === '')
}

describe('FamilyTransportEditor focus scope', () => {
  beforeEach(() => {
    vi.mocked(upsertTripTransport).mockReset()
    vi.mocked(upsertTripTransport).mockResolvedValue(reservation.id)
  })

  function renderEditor(opts: { scope?: boolean } = {}) {
    const restore = document.createElement('button')
    restore.textContent = 'Night bus'
    document.body.appendChild(restore)
    const suppressRestoreRef = { current: false }
    const onClose = vi.fn()
    const onOpenCostsPrefill = vi.fn()
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <FamilyTransportEditor
          open={open}
          tripId="trip-1"
          reservation={reservation}
          days={[{ id: 'day-1', tripId: 'trip-1', civilDay: '2026-08-12', dayIndex: 0, title: 'Leave' }]}
          places={[]}
          linkedExpense={null}
          currencyCode="EUR"
          locale="en"
          canMutate
          familyId="fam-1"
          mePersonId="p1"
          onClose={() => {
            onClose()
            setOpen(false)
          }}
          onSaved={vi.fn().mockResolvedValue(undefined)}
          onOpenCostsPrefill={onOpenCostsPrefill}
          onExpenseUnlinked={vi.fn().mockResolvedValue(undefined)}
          focusScope={opts.scope === false ? undefined : { restoreTo: restore, suppressRestoreRef }}
        />
      )
    }
    render(<Harness />)
    return { restore, suppressRestoreRef, onClose, onOpenCostsPrefill }
  }

  it('keeps the day menu and time menu inside the editor until they close', async () => {
    const user = userEvent.setup()
    const { restore, onClose } = renderEditor()
    const editor = await screen.findByRole('dialog', { name: 'Edit transport' })
    expect(editor.contains(document.activeElement)).toBe(true)

    const status = screen.getByRole('button', { name: 'Pending' })
    await user.click(status)
    const confirmed = await screen.findByRole('button', { name: 'Confirmed' })
    await user.tab()
    expect(editor.contains(document.activeElement)).toBe(false)
    expect(document.activeElement).toBeInstanceOf(HTMLButtonElement)
    await user.tab({ shift: true })
    expect(editor.contains(document.activeElement)).toBe(false)
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(editor).toBeInTheDocument()
    expect(status).toHaveFocus()
    expect(status).toHaveAttribute('aria-expanded', 'false')
    expect(confirmed).not.toBeInTheDocument()

    const clock = clockButtons(editor)[0]
    expect(clock).toBeTruthy()
    await user.click(clock)
    expect(clock).toHaveAttribute('aria-expanded', 'true')
    await user.tab()
    expect(editor.contains(document.activeElement)).toBe(false)
    await user.tab({ shift: true })
    expect(editor.contains(document.activeElement)).toBe(false)
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(clock).toHaveFocus()
    expect(clock).toHaveAttribute('aria-expanded', 'false')

    await user.click(status)
    await screen.findByRole('button', { name: 'Confirmed' })
    const backdrop = document.querySelector('.trek-modal-backdrop') as HTMLElement
    fireEvent.pointerDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Confirmed' })).not.toBeInTheDocument()
    expect(editor).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    await waitFor(() => expect(restore).toHaveFocus())
    restore.remove()
  })

  it('suppresses restoration when create expense closes the editor', async () => {
    const user = userEvent.setup()
    const { restore, suppressRestoreRef, onClose, onOpenCostsPrefill } = renderEditor()
    await user.click(await screen.findByRole('button', { name: 'Create expense' }))
    await waitFor(() => expect(onOpenCostsPrefill).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Night bus',
      reservationId: reservation.id,
    })))
    expect(suppressRestoreRef.current).toBe(true)
    expect(onClose).toHaveBeenCalled()
    expect(restore).not.toHaveFocus()
    restore.remove()
  })

  it('keeps manual create on the existing modal close path', async () => {
    const user = userEvent.setup()
    const { restore, onClose } = renderEditor({ scope: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Edit transport')).toBeInTheDocument()
    restore.focus()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
    expect(restore).toHaveFocus()
    restore.remove()
  })
})

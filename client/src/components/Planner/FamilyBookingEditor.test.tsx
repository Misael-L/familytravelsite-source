import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ToastContainer } from '../shared/Toast'
import { upsertTripBooking, type FamilyTripReservation } from '../../data/supabase/tripReservations'
import type { FamilyTripExpense } from '../../data/supabase/tripExpenses'
import FamilyBookingEditor from './FamilyBookingEditor'
import type { FamilyBookingEditorProps } from './FamilyBookingEditor'

vi.mock('../Files/FamilyFileAttach', () => ({
  default: () => null,
}))

vi.mock('../../data/supabase/tripReservations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripReservations')>()
  return {
    ...actual,
    upsertTripBooking: vi.fn().mockResolvedValue('r-1'),
  }
})

function renderEditor(opts: {
  onStageDraft?: (draft: unknown) => Promise<boolean>
  canMutate?: boolean
}) {
  const onSaved = vi.fn().mockResolvedValue(undefined)
  render(
    <>
      <ToastContainer />
      <FamilyBookingEditor
        open
        tripId="trip-1"
        reservation={null}
        days={[{ id: 'd1', tripId: 'trip-1', civilDay: '2026-08-12', dayIndex: 0, title: 'Arrive' }]}
        places={[]}
        scheduleItems={[]}
        linkedExpense={null}
        currencyCode="EUR"
        locale="en"
        canMutate={opts.canMutate ?? true}
        onStageDraft={opts.onStageDraft}
        familyId="fam-1"
        mePersonId="p1"
        onClose={vi.fn()}
        onSaved={onSaved}
        onOpenCostsPrefill={vi.fn()}
        onExpenseUnlinked={vi.fn().mockResolvedValue(undefined)}
      />
    </>,
  )
  return { onSaved }
}

describe('FamilyBookingEditor change-request staging', () => {
  it('stages apply-v1 fields on My Draft and skips the booking adapter', async () => {
    const user = userEvent.setup()
    const onStageDraft = vi.fn().mockResolvedValue(true)
    renderEditor({ onStageDraft })
    await user.type(screen.getByPlaceholderText('e.g. Lufthansa LH123, Hotel Adlon, ...'), 'Hotel Erba')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(onStageDraft).toHaveBeenCalled())
    expect(upsertTripBooking).not.toHaveBeenCalled()
    expect(onStageDraft.mock.calls[0][0]).toMatchObject({ title: 'Hotel Erba', type: 'hotel' })
    expect(await screen.findByText('Added to My draft')).toBeInTheDocument()
  })

  it('keeps HOF published saves on upsertTripBooking', async () => {
    const user = userEvent.setup()
    renderEditor({})
    await user.type(screen.getByPlaceholderText('e.g. Lufthansa LH123, Hotel Adlon, ...'), 'Hotel Erba')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(upsertTripBooking).toHaveBeenCalledWith('trip-1', expect.objectContaining({ title: 'Hotel Erba' })))
  })
})

const TRIP = '11111111-1111-4111-8111-111111111111'
const RESERVATION_ID = '22222222-2222-4222-8222-222222222222'

function loadedReservation(overrides: Partial<FamilyTripReservation> = {}): FamilyTripReservation {
  return {
    id: RESERVATION_ID,
    tripId: TRIP,
    type: 'hotel',
    status: 'pending',
    title: 'Villa Erba',
    startTripDayId: null,
    endTripDayId: null,
    startsAt: null,
    endsAt: null,
    confirmationCode: null,
    notes: null,
    url: null,
    placeId: null,
    hotelId: null,
    scheduleItemId: null,
    metadata: {},
    sortOrder: 0,
    createdAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  }
}

function linkedExpense(): FamilyTripExpense {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    tripId: TRIP,
    name: 'Taxi',
    category: 'transport',
    totalAmount: 40,
    currencyCode: 'EUR',
    exchangeRate: 1,
    expenseDate: null,
    note: null,
    ticketLines: null,
    reservationId: RESERVATION_ID,
    sortOrder: 0,
    createdAt: '2026-08-20T00:00:00.000Z',
    shares: [],
    payers: [],
  }
}

function editorProps(overrides: Partial<FamilyBookingEditorProps> = {}): FamilyBookingEditorProps {
  return {
    open: true,
    tripId: TRIP,
    reservation: null,
    days: [{ id: 'd1', tripId: TRIP, civilDay: '2026-08-12', dayIndex: 0, title: 'Arrive' }],
    places: [],
    scheduleItems: [],
    linkedExpense: null,
    currencyCode: 'EUR',
    locale: 'en',
    canMutate: true,
    familyId: '99999999-9999-4999-8999-999999999999',
    mePersonId: '88888888-8888-4888-8888-888888888888',
    onClose: vi.fn(),
    onSaved: vi.fn().mockResolvedValue(undefined),
    onOpenCostsPrefill: vi.fn(),
    onExpenseUnlinked: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function bookingDialog() {
  return screen.getByRole('dialog', { name: /reservation/i })
}

function titleField() {
  return screen.getByRole('textbox', { name: /title/i })
}

function discardQuestion() {
  return screen.getByRole('alertdialog', { name: 'Discard Changes' })
}

function withinQuestion() {
  return within(discardQuestion())
}

function backdropOf(dialog: HTMLElement): HTMLElement {
  const backdrop = dialog.parentElement
  if (!backdrop) throw new Error('booking dialog has no backdrop')
  return backdrop
}

describe('FamilyBookingEditor dialog focus', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    vi.mocked(upsertTripBooking).mockReset()
    vi.mocked(upsertTripBooking).mockResolvedValue('r-1')
  })

  it('names the dialog, the close control, and the title field', () => {
    render(<><ToastContainer /><FamilyBookingEditor {...editorProps()} /></>)
    expect(bookingDialog()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(titleField()).toBeInTheDocument()
  })

  it('focuses the dialog on a coarse pointer and the title on a fine pointer', () => {
    const { unmount } = render(<><ToastContainer /><FamilyBookingEditor {...editorProps()} /></>)
    expect(bookingDialog()).toHaveFocus()
    expect(titleField()).not.toHaveFocus()
    unmount()

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: String(query).includes('pointer: fine'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    render(<><ToastContainer /><FamilyBookingEditor {...editorProps()} /></>)
    expect(titleField()).toHaveFocus()
  })

  it('wraps Tab and pulls focus back inside the dialog', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">Outside</button>
        <ToastContainer />
        <FamilyBookingEditor {...editorProps()} />
      </>,
    )
    await user.type(titleField(), 'Hotel Erba')
    const close = screen.getByRole('button', { name: 'Close' })
    const add = screen.getByRole('button', { name: 'Add' })
    // TREK's title input is the first control in the copied header.
    titleField().focus()
    await user.tab({ shift: true })
    expect(add).toHaveFocus()
    await user.tab()
    expect(titleField()).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()

    screen.getByRole('button', { name: 'Outside' }).focus()
    await user.tab()
    expect(bookingDialog().contains(document.activeElement)).toBe(true)
    expect(screen.getByRole('button', { name: 'Outside' })).not.toHaveFocus()
  })

  it('restores a connected opener and skips a disconnected one', async () => {
    const user = userEvent.setup()
    function RestoreHarness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open booking</button>
          <FamilyBookingEditor {...editorProps({ open, onClose: () => setOpen(false) })} />
        </>
      )
    }
    const { unmount } = render(<><ToastContainer /><RestoreHarness /></>)
    await user.click(screen.getByRole('button', { name: 'Open booking' }))
    expect(bookingDialog()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open booking' })).toHaveFocus())
    unmount()

    function StrictHarness() {
      const [open, setOpen] = useState(false)
      return (
        <React.StrictMode>
          <button type="button" onClick={() => setOpen(true)}>Open booking</button>
          <FamilyBookingEditor {...editorProps({ open, onClose: () => setOpen(false) })} />
        </React.StrictMode>
      )
    }
    const strictView = render(<><ToastContainer /><StrictHarness /></>)
    await user.click(screen.getByRole('button', { name: 'Open booking' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open booking' })).toHaveFocus())
    strictView.unmount()

    function DetachedHarness() {
      const [open, setOpen] = useState(false)
      const [showOpener, setShowOpener] = useState(true)
      return (
        <>
          {showOpener && (
            <button type="button" onClick={() => setOpen(true)}>Opener</button>
          )}
          <FamilyBookingEditor {...editorProps({
            open,
            onClose: () => { setShowOpener(false); setOpen(false) },
          })} />
        </>
      )
    }
    render(<><ToastContainer /><DetachedHarness /></>)
    await user.click(screen.getByRole('button', { name: 'Opener' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /reservation/i })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Opener' })).not.toBeInTheDocument()
  })

  it('does not steal focus from a Costs dialog opened by a successful save', async () => {
    const user = userEvent.setup()
    function HandoffHarness() {
      const [open, setOpen] = useState(true)
      const [costs, setCosts] = useState(false)
      return (
        <>
          <button type="button">Opener</button>
          <FamilyBookingEditor {...editorProps({
            open,
            onClose: () => setOpen(false),
            onOpenCostsPrefill: () => setCosts(true),
          })} />
          {costs && (
            <div role="dialog" aria-label="Costs">
              <button type="button">Cost name</button>
            </div>
          )}
        </>
      )
    }
    render(<><ToastContainer /><HandoffHarness /></>)
    await user.type(titleField(), 'Hotel Erba')
    await user.click(screen.getByRole('button', { name: /Create expense/i }))
    expect(await screen.findByRole('dialog', { name: 'Costs' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Opener' })).not.toHaveFocus())
    expect(upsertTripBooking).toHaveBeenCalled()
  })

  it('closes a clean form from Escape, backdrop, close, and Cancel without saving', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(<><ToastContainer /><FamilyBookingEditor {...editorProps({ onClose })} /></>)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(<><ToastContainer /><FamilyBookingEditor {...editorProps({ onClose })} /></>)
    await user.click(screen.getAllByRole('button', { name: 'Close' })[0])
    expect(onClose).toHaveBeenCalledTimes(2)

    rerender(<><ToastContainer /><FamilyBookingEditor {...editorProps({ onClose })} /></>)
    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
    expect(onClose).toHaveBeenCalledTimes(3)

    rerender(<><ToastContainer /><FamilyBookingEditor {...editorProps({ onClose })} /></>)
    const backdrop = backdropOf(bookingDialog())
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(4)
    expect(upsertTripBooking).not.toHaveBeenCalled()
  })

  it('starts clean for a loaded reservation and asks after a real edit', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<><ToastContainer /><FamilyBookingEditor {...editorProps({ reservation: loadedReservation(), onClose })} /></>)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('asks when the title, confirmation, location, or check-in-until changes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const cases: Array<(user: ReturnType<typeof userEvent.setup>) => Promise<void>> = [
      async next => { await next.type(titleField(), ' west') },
      async next => { await next.type(screen.getByRole('textbox', { name: /booking code/i }), 'AB12') },
      async next => { await next.type(screen.getByRole('textbox', { name: /location/i }), 'Lake road') },
      async next => { await next.type(screen.getAllByPlaceholderText('00:00')[1], '18:00') },
    ]
    for (const edit of cases) {
      const view = render(<><ToastContainer /><FamilyBookingEditor {...editorProps({ reservation: loadedReservation(), onClose })} /></>)
      await edit(user)
      await user.keyboard('{Escape}')
      expect(discardQuestion()).toBeInTheDocument()
      view.unmount()
    }
    expect(onClose).not.toHaveBeenCalled()
  })

  it('treats a time typed before its date as dirty and keeps it', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <>
        <ToastContainer />
        <FamilyBookingEditor {...editorProps({
          reservation: loadedReservation({ type: 'restaurant', title: 'Lunch' }),
          onClose,
        })} />
      </>,
    )
    const startTime = screen.getAllByPlaceholderText('00:00')[0]
    await user.type(startTime, '09:15')
    await user.keyboard('{Escape}')
    expect(discardQuestion()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('alertdialog').querySelector('button') as HTMLButtonElement)
    expect(startTime).toHaveValue('09:15')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks when a picker is the first edit, and not after the value returns', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<><ToastContainer /><FamilyBookingEditor {...editorProps({ reservation: loadedReservation(), onClose })} /></>)
    await user.click(screen.getByRole('button', { name: 'Pending' }))
    await user.click(screen.getByRole('button', { name: 'Confirmed' }))
    await user.keyboard('{Escape}')
    expect(discardQuestion()).toBeInTheDocument()
    expect(withinQuestion().getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(bookingDialog().contains(document.activeElement)).toBe(true)
    expect(screen.getByRole('button', { name: 'Confirmed' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes without asking when an edit is reverted to the loaded value', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<><ToastContainer /><FamilyBookingEditor {...editorProps({ reservation: loadedReservation(), onClose })} /></>)
    await user.clear(titleField())
    await user.type(titleField(), 'Villa Erba')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps edits on Cancel and discards without staging or saving', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onStageDraft = vi.fn().mockResolvedValue(true)
    render(
      <>
        <ToastContainer />
        <FamilyBookingEditor {...editorProps({ reservation: loadedReservation(), onClose, onStageDraft })} />
      </>,
    )
    await user.type(titleField(), ' west')
    await user.keyboard('{Escape}')
    const question = discardQuestion()
    expect(within(question).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(within(question).getByRole('button', { name: 'Discard' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(within(question).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(question.contains(document.activeElement)).toBe(true)
    expect(screen.queryByRole('textbox', { name: /title/i })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(titleField()).toHaveValue('Villa Erba west')
    expect(onClose).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    await user.click(within(discardQuestion()).getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onStageDraft).not.toHaveBeenCalled()
    expect(upsertTripBooking).not.toHaveBeenCalled()
  })

  it('reopens from the loaded reservation instead of the discarded edit', async () => {
    const user = userEvent.setup()
    function ReopenHarness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Edit reservation</button>
          <FamilyBookingEditor {...editorProps({
            open,
            reservation: loadedReservation(),
            onClose: () => setOpen(false),
          })} />
        </>
      )
    }
    render(<><ToastContainer /><ReopenHarness /></>)
    await user.type(titleField(), ' west')
    await user.keyboard('{Escape}')
    await user.click(within(discardQuestion()).getByRole('button', { name: 'Discard' }))
    await user.click(screen.getByRole('button', { name: 'Edit reservation' }))
    expect(titleField()).toHaveValue('Villa Erba')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /reservation/i })).not.toBeInTheDocument())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps a linked expense visible and sends the typed title only after save', async () => {
    const user = userEvent.setup()
    let resolveSave: (id: string) => void = () => {}
    vi.mocked(upsertTripBooking).mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
    const linked = render(
      <>
        <ToastContainer />
        <FamilyBookingEditor {...editorProps({
          reservation: loadedReservation(),
          linkedExpense: linkedExpense(),
        })} />
      </>,
    )
    expect(screen.getByText('Taxi')).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create expense/i })).not.toBeInTheDocument()
    await user.type(titleField(), ' west')
    await user.keyboard('{Escape}')
    expect(discardQuestion()).toBeInTheDocument()
    linked.unmount()

    const onOpenCostsPrefill = vi.fn()
    const onClose = vi.fn()
    render(
      <>
        <ToastContainer />
        <FamilyBookingEditor {...editorProps({ onOpenCostsPrefill, onClose })} />
      </>,
    )
    await user.type(titleField(), 'Hotel Erba')
    await user.click(screen.getByRole('button', { name: /Create expense/i }))
    expect(onOpenCostsPrefill).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    resolveSave('44444444-4444-4444-8444-444444444444')
    await waitFor(() => expect(onOpenCostsPrefill).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Hotel Erba',
      category: 'accommodation',
      reservationId: '44444444-4444-4444-8444-444444444444',
    })))
  })

  it('keeps the title when a save or a stage fails', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    vi.mocked(upsertTripBooking).mockRejectedValueOnce(new Error('down'))
    const { rerender } = render(<><ToastContainer /><FamilyBookingEditor {...editorProps({ onClose })} /></>)
    await user.type(titleField(), 'Hotel Erba')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Failed to save')).toBeInTheDocument()
    expect(titleField()).toHaveValue('Hotel Erba')
    expect(onClose).not.toHaveBeenCalled()

    const onStageDraft = vi.fn().mockResolvedValue(false)
    rerender(<><ToastContainer /><FamilyBookingEditor {...editorProps({ onClose, onStageDraft })} /></>)
    await user.clear(titleField())
    await user.type(titleField(), 'Still here')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(onStageDraft).toHaveBeenCalled())
    expect(titleField()).toHaveValue('Still here')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores a second submit and dismissal while a save is in flight', async () => {
    const user = userEvent.setup()
    let resolveSave: (id: string) => void = () => {}
    vi.mocked(upsertTripBooking).mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
    const onClose = vi.fn()
    render(<><ToastContainer /><FamilyBookingEditor {...editorProps({ onClose })} /></>)
    await user.type(titleField(), 'Hotel Erba')
    const add = screen.getByRole('button', { name: 'Add' })
    await user.click(add)
    await user.click(add)
    expect(upsertTripBooking).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    fireEvent.mouseDown(backdropOf(bookingDialog()))
    fireEvent.click(backdropOf(bookingDialog()))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).not.toHaveBeenCalled()
    resolveSave('r-1')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('closes an owned picker without closing the editor, including one backdrop gesture', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    function OtherDialog() {
      const [open, setOpen] = useState(true)
      React.useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [])
      if (!open) return null
      return <div role="dialog" aria-label="Other"><button type="button">Stay</button></div>
    }
    render(
      <>
        <OtherDialog />
        <ToastContainer />
        <FamilyBookingEditor {...editorProps({
          reservation: loadedReservation({ type: 'restaurant', title: 'Lunch' }),
          onClose,
        })} />
      </>,
    )
    await user.click(screen.getAllByRole('button', { name: 'Date' })[0])
    expect(screen.getByRole('dialog', { name: 'Date picker' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Date picker' })).not.toBeInTheDocument()
    expect(bookingDialog()).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Date' })[0]).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Pending' }))
    expect(screen.getByRole('button', { name: 'Confirmed' })).toBeInTheDocument()
    const backdrop = backdropOf(bookingDialog())
    fireEvent.pointerDown(backdrop)
    fireEvent.click(backdrop)
    expect(screen.queryByRole('button', { name: 'Confirmed' })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('dialog', { name: 'Other' })).toBeInTheDocument()
  })

  it('cancels manual date entry without closing the booking or committing the text', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const restaurant = loadedReservation({ type: 'restaurant', title: 'Harbor lunch' })
    render(<><ToastContainer /><FamilyBookingEditor {...editorProps({ reservation: restaurant, onClose })} /></>)
    await user.click(screen.getAllByRole('button', { name: 'Enter date manually' })[0])
    const manual = screen.getByRole('textbox', { name: 'Enter date manually' })
    await user.type(manual, '12.')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Enter date manually' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(bookingDialog()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: 'Enter date manually' })[0]).toHaveFocus()
    expect(screen.getAllByRole('button', { name: 'Date' })).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: 'Enter date manually' })[0])
    await user.type(screen.getByRole('textbox', { name: 'Enter date manually' }), '12.12.2026')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Enter date manually' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Date' })).toHaveLength(2)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps unfinished manual date text when Close is cancelled', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <>
        <ToastContainer />
        <FamilyBookingEditor {...editorProps({
          reservation: loadedReservation({ type: 'restaurant', title: 'Harbor lunch' }),
          onClose,
        })} />
      </>,
    )
    await user.click(screen.getAllByRole('button', { name: 'Enter date manually' })[0])
    await user.type(screen.getByRole('textbox', { name: 'Enter date manually' }), '12.')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(bookingDialog()).toBeInTheDocument()
    expect(discardQuestion()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    await user.click(withinQuestion().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('textbox', { name: 'Enter date manually' })).toHaveValue('12.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks before a backdrop or Cancel dismisses unfinished manual date text', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const props = editorProps({
      reservation: loadedReservation({ type: 'restaurant', title: 'Harbor lunch' }),
      onClose,
    })
    const view = render(<><ToastContainer /><FamilyBookingEditor {...props} /></>)
    await user.click(screen.getAllByRole('button', { name: 'Enter date manually' })[0])
    await user.type(screen.getByRole('textbox', { name: 'Enter date manually' }), '12.')
    const backdrop = backdropOf(bookingDialog())
    fireEvent.pointerDown(backdrop)
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(discardQuestion()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    await user.click(withinQuestion().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('textbox', { name: 'Enter date manually' })).toHaveValue('12.')
    view.unmount()

    render(<><ToastContainer /><FamilyBookingEditor {...props} /></>)
    await user.click(screen.getAllByRole('button', { name: 'Enter date manually' })[0])
    await user.type(screen.getByRole('textbox', { name: 'Enter date manually' }), '12.')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(discardQuestion()).toBeInTheDocument()
    await user.click(withinQuestion().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('textbox', { name: 'Enter date manually' })).toHaveValue('12.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('commits a later manual date on blur after Escape cancelled the previous entry', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ToastContainer />
        <FamilyBookingEditor {...editorProps({
          reservation: loadedReservation({ type: 'restaurant', title: 'Harbor lunch' }),
        })} />
      </>,
    )
    await user.click(screen.getAllByRole('button', { name: 'Enter date manually' })[0])
    await user.type(screen.getByRole('textbox', { name: 'Enter date manually' }), '12.')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Enter date manually' })).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Enter date manually' })[0])
    await user.type(screen.getByRole('textbox', { name: 'Enter date manually' }), '2026-12-12')
    await user.click(titleField())
    expect(screen.queryByRole('textbox', { name: 'Enter date manually' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Date' })).toHaveLength(1)
  })

  it('cancels manual date entry before the discard question when the booking is already dirty', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <>
        <ToastContainer />
        <FamilyBookingEditor {...editorProps({
          reservation: loadedReservation({ type: 'restaurant', title: 'Harbor lunch' }),
          onClose,
        })} />
      </>,
    )
    await user.type(titleField(), ' late')
    await user.click(screen.getAllByRole('button', { name: 'Enter date manually' })[0])
    await user.type(screen.getByRole('textbox', { name: 'Enter date manually' }), '12.')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Enter date manually' })).not.toBeInTheDocument()
    expect(titleField()).toHaveValue('Harbor lunch late')
    expect(bookingDialog()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(discardQuestion()).toBeInTheDocument()
    await user.click(withinQuestion().getByRole('button', { name: 'Cancel' }))
    expect(titleField()).toHaveValue('Harbor lunch late')
  })

  it('asks a read-only member before closing an edit and still blocks the save', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<><ToastContainer /><FamilyBookingEditor {...editorProps({ canMutate: false, onClose })} /></>)
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(titleField()).toBeEnabled()
    await user.type(titleField(), 'Note')
    await user.keyboard('{Escape}')
    expect(discardQuestion()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(upsertTripBooking).not.toHaveBeenCalled()
  })
})

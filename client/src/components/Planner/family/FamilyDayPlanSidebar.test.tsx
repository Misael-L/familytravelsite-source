import { useState } from 'react'
import { render, screen, within } from '../../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import FamilyDayPlanSidebar from './FamilyDayPlanSidebar'
import { projectFamilyDayTimeline } from './familyDayTimeline'
import type { FamilyTripReservation } from '../../../data/supabase/tripReservations'
import { ToastContainer } from '../../shared/Toast'
import { useAuthStore } from '../../../store/authStore'
import { seedStore } from '../../../../tests/helpers/store'
import type { FamilyTripDay } from '../../../data/supabase/tripDays'
import type { FamilyScheduleItem } from '../../../data/supabase/scheduleItems'
import type { FamilyTripPlace } from '../../../data/supabase/tripPlaces'
import type { FamilyDayNote } from '../../../data/supabase/dayNotes'

vi.mock('../../../data/supabase/calendarFeed', async () => {
  const actual = await vi.importActual<typeof import('../../../data/supabase/calendarFeed')>(
    '../../../data/supabase/calendarFeed',
  )
  return {
    ...actual,
    fetchCalendarFeedUrl: vi.fn().mockResolvedValue(null),
    enableCalendarFeed: vi.fn(),
    regenerateCalendarFeed: vi.fn(),
    disableCalendarFeed: vi.fn(),
  }
})

class MockIO {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}
beforeAll(() => { (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = MockIO })

const day: FamilyTripDay = {
  id: 'd1', tripId: 't1', civilDay: '2026-12-01', dayIndex: 0, title: 'Arrival',
}
const item: FamilyScheduleItem = {
  id: 'i1', tripId: 't1', activity: 'Zócalo walk', placeId: null,
  startsAt: '2026-12-01T16:00:00.000Z', endsAt: null, address: null,
  timeZone: null, sortOrder: 0, experienceId: null, foodId: null, linkUrl: null,
}

function renderSidebar() {
  const toastWrite = vi.fn()
  render(
    <>
      <ToastContainer />
      <FamilyDayPlanSidebar
        tripId="t1"
        tripTitle="Mexico"
        days={[day]}
        itemsByDayId={new Map([['d1', [item]]])}
        placesById={new Map()}
        notesByCivilDay={new Map()}
        selectedDayId={null}
        onSelectDay={() => {}}
        onRemoveItem={() => {}}
        onMoveItem={() => {}}
        onOpenNote={() => {}}
        onSaveTitle={() => {}}
        canMutate={false}
        onToastWrite={toastWrite}
      />
    </>,
  )
  return toastWrite
}

describe('FamilyDayPlanSidebar exports', () => {
  afterEach(() => {
    document.getElementById('family-pdf-preview-overlay')?.remove()
    seedStore(useAuthStore, { familyId: null, personId: null })
    vi.restoreAllMocks()
  })

  it('opens a print overlay on PDF click instead of toasting exportLater', async () => {
    const user = userEvent.setup()
    const toastWrite = renderSidebar()
    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(screen.getByText('PDF'))
    expect(document.getElementById('family-pdf-preview-overlay')).not.toBeNull()
    expect(toastWrite).not.toHaveBeenCalledWith('export')
    expect(screen.queryByText(/PDF and calendar export arrive later/i)).not.toBeInTheDocument()
  })

  it('downloads ICS from the hover menu without toasting exportLater', async () => {
    const user = userEvent.setup()
    const toastWrite = renderSidebar()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ics')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(await screen.findByText('Download .ics'))
    expect(createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(toastWrite).not.toHaveBeenCalledWith('export')
  })

  it('opens the all-trips subscribe modal when Subscribe is chosen', async () => {
    const user = userEvent.setup()
    seedStore(useAuthStore, { familyId: 'fam-1', personId: 'per-1' })
    const toastWrite = renderSidebar()
    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(await screen.findByText('Subscribe to calendar'))
    expect(await screen.findByText('Subscribe to all trips')).toBeInTheDocument()
    expect(await screen.findByText('Enable calendar subscription')).toBeInTheDocument()
    expect(screen.queryByText(/Calendar subscribe arrives later/i)).not.toBeInTheDocument()
    expect(toastWrite).not.toHaveBeenCalledWith('export')
  })

  it('omits account subscription when no linked profile exists', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByRole('button', {name: 'Export'}))
    expect(screen.queryByText('Subscribe to calendar')).not.toBeInTheDocument()
    expect(screen.getByText('Download .ics')).toBeInTheDocument()
  })
})

const TRIP_ID = '11111111-1111-4111-8111-111111111111'
const DAY_A = '22222222-2222-4222-8222-222222222222'
const DAY_B = '33333333-3333-4333-8333-333333333333'
const ITEM_A = '44444444-4444-4444-8444-444444444444'
const ITEM_B = '55555555-5555-4555-8555-555555555555'
const PLACE_ID = '66666666-6666-4666-8666-666666666666'

const uuidDay = (id: string, dayIndex: number, title: string, civilDay: string): FamilyTripDay => ({
  id, tripId: TRIP_ID, civilDay, dayIndex, title,
})
const uuidItem = (id: string, activity: string, sortOrder: number, placeId: string | null): FamilyScheduleItem => ({
  id, tripId: TRIP_ID, activity, placeId,
  startsAt: '2026-12-01T16:00:00.000Z', endsAt: null, address: null,
  timeZone: null, sortOrder, experienceId: null, foodId: null, linkUrl: null,
})

const harbor = uuidDay(DAY_A, 1, 'Harbor morning', '2026-12-01')
const inland = uuidDay(DAY_B, 2, 'Inland road', '2026-12-02')
const firstStop = uuidItem(ITEM_A, 'Zócalo walk', 0, null)
const secondStop = uuidItem(ITEM_B, 'Museum hour', 1, PLACE_ID)
const place: FamilyTripPlace = {
  id: PLACE_ID,
  name: 'City museum',
  lat: 19.43,
  lng: -99.13,
  notes: null,
  timeZone: 'America/Mexico_City',
  countryId: null,
  placeTypeId: null,
  isPrimary: false,
  imageUrl: null,
  familyPlaceCategoryId: null,
  familyPlaceCategoryName: null,
  familyPlaceCategoryColor: null,
  familyPlaceCategoryIcon: null,
}
const note: FamilyDayNote = {
  id: '77777777-7777-4777-8777-777777777777',
  tripId: TRIP_ID,
  civilDay: '2026-12-01',
  body: 'Land before lunch',
  icon: null,
  sortOrder: 0,
}

function dayHead(dayId: string): HTMLElement {
  const head = document.querySelector(`.dp-day-header[data-day-id="${dayId}"]`)
  if (!(head instanceof HTMLElement)) throw new Error(`missing day head ${dayId}`)
  return head
}

describe('FamilyDayPlanSidebar interactions', () => {
  afterEach(() => {
    localStorage.clear()
  })

  function renderInteractive(opts?: { canMutate?: boolean; canUndo?: boolean; longTitle?: boolean }) {
    const onSaveTitle = vi.fn()
    const onOpenNote = vi.fn()
    const onMoveItem = vi.fn()
    const onRemoveItem = vi.fn()
    const onUndo = vi.fn()
    const onToastWrite = vi.fn()
    const days = opts?.longTitle
      ? [{ ...harbor, title: 'A very long harbor morning title that should stay on one line in the day head' }]
      : [harbor, inland]
    function Harness() {
      const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
      return (
        <FamilyDayPlanSidebar
          tripId={TRIP_ID}
          tripTitle="Mexico"
          days={days}
          itemsByDayId={new Map([
            [DAY_A, [firstStop, secondStop]],
            [DAY_B, []],
          ])}
          placesById={new Map([[PLACE_ID, place]])}
          notesByCivilDay={new Map([['2026-12-01', note]])}
          selectedDayId={selectedDayId}
          onSelectDay={setSelectedDayId}
          onRemoveItem={onRemoveItem}
          onMoveItem={onMoveItem}
          onOpenNote={onOpenNote}
          onSaveTitle={onSaveTitle}
          canMutate={opts?.canMutate ?? true}
          onToastWrite={onToastWrite}
          canUndo={opts?.canUndo ?? false}
          onUndo={onUndo}
          lastActionLabel="Removed from day"
        />
      )
    }
    render(<Harness />)
    return { onSaveTitle, onOpenNote, onMoveItem, onRemoveItem, onUndo, onToastWrite }
  }

  it('selects and clears a day, and collapses and expands days', async () => {
    const user = userEvent.setup()
    renderInteractive()
    expect(screen.getByText('Zócalo walk')).toBeInTheDocument()
    expect(screen.getByText('No places planned for this day')).toBeInTheDocument()
    expect(screen.getByText('Land before lunch')).toBeInTheDocument()

    await user.click(screen.getByText('Harbor morning'))
    expect(dayHead(DAY_A).getAttribute('data-selected')).toBe('true')
    await user.click(screen.getByText('Harbor morning'))
    expect(dayHead(DAY_A).getAttribute('data-selected')).toBe('false')

    await user.click(within(dayHead(DAY_A)).getByRole('button', { name: 'Collapse' }))
    expect(screen.queryByText('Zócalo walk')).not.toBeInTheDocument()
    await user.click(within(dayHead(DAY_A)).getByRole('button', { name: 'Expand' }))
    expect(screen.getByText('Zócalo walk')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Collapse all days' }))
    expect(screen.queryByText('Zócalo walk')).not.toBeInTheDocument()
    expect(screen.queryByText('No places planned for this day')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand all days' }))
    expect(screen.getByText('Zócalo walk')).toBeInTheDocument()
    expect(screen.getByText('City museum')).toBeInTheDocument()
    expect(screen.getByText('No places planned for this day')).toBeInTheDocument()
  })

  it('commits a changed title on Enter, ignores an unchanged blur, and cancels on Escape', async () => {
    const user = userEvent.setup()
    const { onSaveTitle } = renderInteractive()
    await user.click(within(dayHead(DAY_A)).getByRole('button', { name: 'Edit' }))
    const input = screen.getByRole('textbox', { name: 'Edit' })
    await user.clear(input)
    await user.type(input, 'Harbor morning')
    await user.tab()
    expect(onSaveTitle).not.toHaveBeenCalled()

    await user.click(within(dayHead(DAY_A)).getByRole('button', { name: 'Edit' }))
    const changed = screen.getByRole('textbox', { name: 'Edit' })
    await user.clear(changed)
    await user.type(changed, 'Harbor evening')
    await user.keyboard('{Enter}')
    expect(onSaveTitle).toHaveBeenCalledTimes(1)
    expect(onSaveTitle).toHaveBeenCalledWith(DAY_A, 'Harbor evening')

    await user.click(within(dayHead(DAY_A)).getByRole('button', { name: 'Edit' }))
    const cancelled = screen.getByRole('textbox', { name: 'Edit' })
    await user.clear(cancelled)
    await user.type(cancelled, 'Discard me')
    await user.keyboard('{Escape}')
    expect(onSaveTitle).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('textbox', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('hides the title pencil when mutation is off and still offers export', async () => {
    renderInteractive({ canMutate: false })
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Export'})).toBeInTheDocument()
  })

  it('opens notes and moves or removes the addressed schedule row', async () => {
    const user = userEvent.setup()
    const { onOpenNote, onMoveItem, onRemoveItem } = renderInteractive()
    await user.click(within(dayHead(DAY_A)).getByRole('button', { name: 'Add Note' }))
    expect(onOpenNote).toHaveBeenCalledWith(expect.objectContaining({ id: DAY_A, civilDay: '2026-12-01' }))

    const firstUp = within(dayHead(DAY_A).parentElement as HTMLElement).getAllByRole('button', { name: 'Move up' })[0]
    const lastDown = within(dayHead(DAY_A).parentElement as HTMLElement).getAllByRole('button', { name: 'Move down' })[1]
    expect(firstUp).toBeDisabled()
    expect(lastDown).toBeDisabled()
    await user.click(firstUp)
    await user.click(lastDown)
    expect(onMoveItem).not.toHaveBeenCalled()

    await user.click(within(dayHead(DAY_A).parentElement as HTMLElement).getAllByRole('button', { name: 'Move down' })[0])
    expect(onMoveItem).toHaveBeenCalledWith(DAY_A, ITEM_A, 1)
    await user.click(within(dayHead(DAY_A).parentElement as HTMLElement).getAllByRole('button', { name: 'Move up' })[1])
    expect(onMoveItem).toHaveBeenCalledWith(DAY_A, ITEM_B, -1)

    await user.click(within(dayHead(DAY_A).parentElement as HTMLElement).getAllByRole('button', { name: 'Delete' })[1])
    expect(onRemoveItem).toHaveBeenCalledWith(ITEM_B)
  })

  it('disables unavailable undo and omits unconnected day reorder', async () => {
    const user = userEvent.setup()
    const { onUndo, onToastWrite } = renderInteractive()
    const undo = screen.getByRole('button', {name: 'Undo'})
    expect(undo).toBeDisabled()
    await user.click(undo)
    expect(screen.queryByRole('button', {name: 'Reorder days'})).not.toBeInTheDocument()
    expect(onUndo).not.toHaveBeenCalled()
    expect(onToastWrite).not.toHaveBeenCalled()
  })

  it('calls undo and does not toast when a direct undo exists', async () => {
    const user = userEvent.setup()
    const { onUndo, onToastWrite } = renderInteractive({ canUndo: true })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onToastWrite).not.toHaveBeenCalled()
  })

  it('renders one mixed sequence and disables a move into a reservation', async () => {
    const user = userEvent.setup()
    const onMoveItem = vi.fn()
    const onOpenTimeline = vi.fn()
    const gap: FamilyTripReservation = {
      id: 'gap', tripId: TRIP_ID, type: 'event', status: 'pending', title: 'Gap event',
      startTripDayId: null, endTripDayId: null, startsAt: '2026-12-01T00:00:00.000Z', endsAt: null,
      confirmationCode: null, notes: null, url: null, placeId: null, hotelId: null, scheduleItemId: null,
      metadata: {}, sortOrder: 0, createdAt: '2026-08-01T00:00:00.000Z',
    }
    const untimed = (id: string, sortOrder: number): FamilyScheduleItem => ({
      ...uuidItem(id, id, sortOrder, null),
      startsAt: '2026-12-01T00:00:00.000Z',
    })
    const timeline = projectFamilyDayTimeline({
      days: [harbor],
      scheduleItems: [untimed('A', 0), untimed('C', 1)],
      notes: [],
      bookings: [gap],
      transports: [],
    })
    render(
      <FamilyDayPlanSidebar
        tripId={TRIP_ID}
        tripTitle="Mexico"
        days={[harbor]}
        itemsByDayId={new Map([[harbor.id, [untimed('A', 0), untimed('C', 1)]]])}
        placesById={new Map()}
        notesByCivilDay={new Map()}
        selectedDayId={null}
        onSelectDay={() => {}}
        onRemoveItem={() => {}}
        onMoveItem={onMoveItem}
        onOpenNote={() => {}}
        onSaveTitle={() => {}}
        canMutate
        onToastWrite={() => {}}
        timeline={timeline}
        onOpenTimeline={onOpenTimeline}
      />,
    )
    const card = dayHead(harbor.id).parentElement as HTMLElement
    expect(within(card).getByText('A')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Gap event' })).toBeInTheDocument()
    const text = card.textContent ?? ''
    expect(text.indexOf('A')).toBeLessThan(text.indexOf('Gap event'))
    const downTowardReservation = within(card).getAllByRole('button', { name: 'Move down' })[1]
    expect(downTowardReservation).toBeDisabled()
    await user.click(downTowardReservation)
    expect(onMoveItem).not.toHaveBeenCalled()
    await user.click(within(card).getByRole('button', { name: 'Gap event' }))
    expect(onOpenTimeline).toHaveBeenCalledWith('booking', 'gap', expect.any(HTMLElement))
  })

  it('keeps a long title and a place with no image on the row', async () => {
    const user = userEvent.setup()
    renderInteractive({ longTitle: true })
    const longTitle = 'A very long harbor morning title that should stay on one line in the day head'
    expect(screen.getByText(longTitle)).toBeInTheDocument()
    expect(screen.getByText('City museum')).toBeInTheDocument()
    expect(Array.from(document.images).some(image => image.src.includes('supabase.co'))).toBe(false)

    const collapse = within(dayHead(DAY_A)).getByRole('button', { name: 'Collapse' })
    collapse.focus()
    await user.keyboard('{Enter}')
    expect(screen.queryByText('City museum')).not.toBeInTheDocument()
  })
})

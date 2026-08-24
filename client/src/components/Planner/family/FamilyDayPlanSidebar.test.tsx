import { render, screen } from '../../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import FamilyDayPlanSidebar from './FamilyDayPlanSidebar'
import { ToastContainer } from '../../shared/Toast'
import { useAuthStore } from '../../../store/authStore'
import { seedStore } from '../../../../tests/helpers/store'
import type { FamilyTripDay } from '../../../data/supabase/tripDays'
import type { FamilyScheduleItem } from '../../../data/supabase/scheduleItems'

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
    await user.hover(screen.getByText('ICS').closest('button')!)
    await user.click(await screen.findByText('Download ICS'))
    expect(createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(toastWrite).not.toHaveBeenCalledWith('export')
  })

  it('opens the all-trips subscribe modal when Subscribe is chosen', async () => {
    const user = userEvent.setup()
    seedStore(useAuthStore, { familyId: 'fam-1', personId: 'per-1' })
    const toastWrite = renderSidebar()
    await user.hover(screen.getByText('ICS').closest('button')!)
    await user.click(await screen.findByText('Subscribe to calendar'))
    expect(await screen.findByText('Subscribe to all trips')).toBeInTheDocument()
    expect(await screen.findByText('Enable calendar subscription')).toBeInTheDocument()
    expect(screen.queryByText(/Calendar subscribe arrives later/i)).not.toBeInTheDocument()
    expect(toastWrite).not.toHaveBeenCalledWith('export')
  })

  it('toasts missingPerson when Subscribe is chosen without a linked profile', async () => {
    const user = userEvent.setup()
    seedStore(useAuthStore, { familyId: null, personId: null })
    renderSidebar()
    await user.hover(screen.getByText('ICS').closest('button')!)
    await user.click(await screen.findByText('Subscribe to calendar'))
    expect(await screen.findByText(/Your family profile is not linked yet/i)).toBeInTheDocument()
    expect(screen.queryByText('Subscribe to all trips')).not.toBeInTheDocument()
  })
})

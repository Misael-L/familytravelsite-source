import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { buildUser } from '../../../tests/helpers/factories'
import { useAuthStore } from '../../store/authStore'
import { ToastContainer } from '../../components/shared/Toast'
import CopyTripDialog, { FAMILY_COPY_WILL_KEYS, FAMILY_COPY_WONT_KEYS } from '../../components/shared/CopyTripDialog'
import { duplicateTrip, listOpenTripProposals, canDecideProposal } from '../../data/supabase/tripProposals'
import { listFamilyTrips } from '../../data/supabase/trips'
import { fetchFamilyTravelStats } from '../../data/supabase/travelStats'
import { useDashboard } from './useDashboard'
import type { FamilyDashboardTrip } from './familyDashboardModel'

const { isSupabaseMock } = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => true),
}))

vi.mock('../../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('../../data/supabase/trips', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/trips')>()
  return {
    ...actual,
    listFamilyTrips: vi.fn(),
  }
})

vi.mock('../../data/supabase/tripProposals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripProposals')>()
  return {
    ...actual,
    duplicateTrip: vi.fn(),
    listOpenTripProposals: vi.fn(),
    canDecideProposal: vi.fn(),
  }
})

vi.mock('../../data/supabase/travelStats', () => ({
  fetchFamilyTravelStats: vi.fn(),
}))

const SOURCE: FamilyDashboardTrip = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  family_id: 'fam-1',
  title: 'Paris Adventure',
  description: null,
  start_date: '2026-07-01',
  end_date: '2026-07-10',
  cover_image: null,
  is_archived: 0,
  currency: 'USD',
  reminder_days: 3,
  status: 'published',
}

function DuplicateHarness() {
  const { requestCopyTrip, confirmCopy, copyTrip, setCopyTrip } = useDashboard()
  return (
    <>
      <button type="button" onClick={() => requestCopyTrip(SOURCE)}>
        Open duplicate
      </button>
      {copyTrip && (
        <CopyTripDialog
          isOpen
          tripTitle={copyTrip.title}
          onConfirm={confirmCopy}
          onClose={() => setCopyTrip(null)}
          willCopyKeys={FAMILY_COPY_WILL_KEYS}
          wontCopyKeys={FAMILY_COPY_WONT_KEYS}
        />
      )}
    </>
  )
}

describe('useDashboard supabase Duplicate', () => {
  beforeEach(() => {
    resetAllStores()
    isSupabaseMock.mockReturnValue(true)
    vi.mocked(listFamilyTrips).mockResolvedValue({ trips: [SOURCE], archivedTrips: [] })
    vi.mocked(listOpenTripProposals).mockResolvedValue([])
    vi.mocked(canDecideProposal).mockResolvedValue(false)
    vi.mocked(fetchFamilyTravelStats).mockResolvedValue({
      totalTrips: 0,
      totalDays: 0,
      totalPlaces: 0,
      totalDistanceKm: 0,
      countries: [],
    })
    vi.mocked(duplicateTrip).mockReset()
    vi.mocked(duplicateTrip).mockResolvedValue({ proposalId: 'p-new', tripId: 't-new' })
    seedStore(useAuthStore, {
      isAuthenticated: true,
      user: buildUser(),
      familyId: 'fam-1',
      personId: 'per-1',
      membershipRole: 'child',
    })
  })

  it('opens the copy dialog and does not toast copyLater', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ToastContainer />
        <DuplicateHarness />
      </>,
    )

    await user.click(screen.getByRole('button', { name: 'Open duplicate' }))

    expect(await screen.findByText('Copy this trip?')).toBeInTheDocument()
    expect(screen.getByText('Dates, cover image & notes')).toBeInTheDocument()
    expect(screen.queryByText('Copying trips on the web arrives in a later phase')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /copy trip/i }))

    await waitFor(() => {
      expect(duplicateTrip).toHaveBeenCalledWith(SOURCE.id)
    })
    expect(await screen.findByText('Trip copied!')).toBeInTheDocument()
    expect(screen.queryByText('Copying trips on the web arrives in a later phase')).not.toBeInTheDocument()
  })

  it('toasts missingPerson when family profile is not linked', async () => {
    seedStore(useAuthStore, {
      isAuthenticated: true,
      user: buildUser(),
      familyId: null,
      personId: null,
      membershipRole: 'child',
    })
    const user = userEvent.setup()
    render(
      <>
        <ToastContainer />
        <DuplicateHarness />
      </>,
    )

    await user.click(screen.getByRole('button', { name: 'Open duplicate' }))

    expect(await screen.findByText('Your family profile is not linked yet')).toBeInTheDocument()
    expect(screen.queryByText('Copy this trip?')).not.toBeInTheDocument()
    expect(duplicateTrip).not.toHaveBeenCalled()
  })
})

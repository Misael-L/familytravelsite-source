import { render, screen, waitFor } from '../../../tests/helpers/render'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { buildUser } from '../../../tests/helpers/factories'
import { server } from '../../../tests/helpers/msw/server'
import { useAuthStore } from '../../store/authStore'
import { usePermissionsStore } from '../../store/permissionsStore'
import { ToastContainer } from '../../components/shared/Toast'
import DashboardPage from '../DashboardPage'
import { archiveTrip, listFamilyTrips } from '../../data/supabase/trips'
import { canDecideProposal, listOpenTripProposals } from '../../data/supabase/tripProposals'
import { fetchFamilyTravelStats } from '../../data/supabase/travelStats'
import { useDashboard } from './useDashboard'
import { isFamilyDashboardTrip } from './dashboardModel'
import type { FamilyDashboardTrip } from './familyDashboardModel'

const { isSupabaseMock, canTripActionDirectMock } = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => true),
  canTripActionDirectMock: vi.fn(async () => true),
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
    archiveTrip: vi.fn(),
  }
})

vi.mock('../../data/supabase/tripProposals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripProposals')>()
  return {
    ...actual,
    listOpenTripProposals: vi.fn(),
    canDecideProposal: vi.fn(),
  }
})

vi.mock('../../data/supabase/travelStats', () => ({
  fetchFamilyTravelStats: vi.fn(),
}))

vi.mock('../../data/supabase/familyPermissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyPermissions')>()
  return { ...actual, canTripActionDirect: canTripActionDirectMock }
})

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86400000).toISOString().split('T')[0]

const SPOTLIGHT: FamilyDashboardTrip = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  family_id: 'fam-1',
  title: 'Como Live',
  description: null,
  start_date: iso(-5),
  end_date: iso(5),
  cover_image: null,
  is_archived: 0,
  currency: 'USD',
  reminder_days: 0,
  status: 'published',
  day_count: 11,
  place_count: 4,
  traveler_count: 3,
  hub_members: [
    { personId: 'p1', displayName: 'Ada Lovelace', color: '#6366f1', avatarUrl: null },
    { personId: 'p2', displayName: 'Bob', color: null, avatarUrl: null },
  ],
  hub_places: [
    { id: 'pl1', name: 'Bellagio', lat: 46, lng: 9, imageUrl: null },
    { id: 'pl2', name: 'Varenna', lat: 46, lng: 9, imageUrl: null },
    { id: 'pl3', name: 'Menaggio', lat: 46, lng: 9, imageUrl: null },
    { id: 'pl4', name: 'Tremezzo', lat: 46, lng: 9, imageUrl: null },
  ],
}

const GRID: FamilyDashboardTrip = {
  id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  family_id: 'fam-1',
  title: 'Nice Weekend',
  description: null,
  start_date: iso(20),
  end_date: iso(24),
  cover_image: null,
  is_archived: 0,
  currency: 'USD',
  reminder_days: 0,
  status: 'published',
  day_count: 5,
  place_count: 7,
  traveler_count: 4,
}

function seedFamilyAuth() {
  seedStore(useAuthStore, {
    isAuthenticated: true,
    user: buildUser(),
    familyId: 'fam-1',
    personId: 'per-1',
    membershipRole: 'parent',
    isSuperAdmin: false,
  })
  seedStore(usePermissionsStore, { level: 'owner' } as never)
}

describe('useDashboard Family hub boarding pass', () => {
  beforeEach(() => {
    resetAllStores()
    isSupabaseMock.mockReturnValue(true)
    vi.mocked(listFamilyTrips).mockResolvedValue({ trips: [SPOTLIGHT, GRID], archivedTrips: [] })
    vi.mocked(listOpenTripProposals).mockResolvedValue([])
    vi.mocked(canDecideProposal).mockResolvedValue(false)
    vi.mocked(fetchFamilyTravelStats).mockResolvedValue({
      totalTrips: 0,
      totalDays: 0,
      totalPlaces: 0,
      totalDistanceKm: 0,
      countries: [],
    })
    vi.mocked(archiveTrip).mockReset()
    canTripActionDirectMock.mockResolvedValue(true)
    seedFamilyAuth()
    server.use(
      http.get('https://api.frankfurter.dev/v2/rates', () => {
        return HttpResponse.json([{ date: '2026-08-15', base: 'EUR', quote: 'USD', rate: 1.08 }])
      }),
    )
  })

  it('shows Family destination and traveler copy, not Nest shared_count + 1', async () => {
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Como Live').length).toBeGreaterThan(0)
    })

    expect(screen.getByText(/4 destinations/i)).toBeInTheDocument()
    expect(screen.getByText(/3 travelers/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 destinations/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/1 traveler$/i)).not.toBeInTheDocument()
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(screen.getByText('BO')).toBeInTheDocument()
    expect(document.querySelectorAll('.places-preview .place-av').length).toBe(3)
    expect(document.querySelector('.places-preview .place-more')?.textContent).toBe('+1')
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()

    const card = screen.getByText('Nice Weekend').closest('.trip-card')
    expect(card).toBeTruthy()
    expect(card).toHaveTextContent('5')
    expect(card).toHaveTextContent('7')
    expect(card).toHaveTextContent('4')
  })

  it('shows 0 travelers with no owner chip when the Family party is empty', async () => {
    vi.mocked(listFamilyTrips).mockResolvedValue({
      trips: [{
        ...SPOTLIGHT,
        traveler_count: 0,
        place_count: 0,
        hub_members: [],
        hub_places: [],
        title: 'Solo Idea',
      }],
      archivedTrips: [],
    })

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Solo Idea')).toBeInTheDocument()
    })
    expect(screen.getByText(/0 travelers/i)).toBeInTheDocument()
    expect(screen.getByText(/0 destinations/i)).toBeInTheDocument()
    expect(document.querySelector('.buddies-avatars .buddy-avatar')).toBeNull()
  })
})

function ArchiveHarness() {
  const { handleArchive, gridTrips, isLoading, setTripFilter, tripFilter } = useDashboard()
  if (isLoading) return <div>loading</div>
  return (
    <>
      <div data-testid="loaded-count">{tripFilter}</div>
      <button type="button" onClick={() => {
        void handleArchive(SPOTLIGHT.id).then(() => setTripFilter('archive'))
      }}>Archive</button>
      {tripFilter === 'archive' && gridTrips.map(t => (
        <div key={String(t.id)} data-testid="archived-meta">
          {t.place_count}-{isFamilyDashboardTrip(t) ? t.traveler_count : t.shared_count}
        </div>
      ))}
    </>
  )
}

describe('useDashboard archive keeps hub counts', () => {
  beforeEach(() => {
    resetAllStores()
    isSupabaseMock.mockReturnValue(true)
    vi.mocked(listFamilyTrips).mockResolvedValue({ trips: [SPOTLIGHT], archivedTrips: [] })
    vi.mocked(listOpenTripProposals).mockResolvedValue([])
    vi.mocked(canDecideProposal).mockResolvedValue(false)
    vi.mocked(fetchFamilyTravelStats).mockResolvedValue({
      totalTrips: 0,
      totalDays: 0,
      totalPlaces: 0,
      totalDistanceKm: 0,
      countries: [],
    })
    vi.mocked(archiveTrip).mockResolvedValue({
      ...SPOTLIGHT,
      is_archived: 1,
      place_count: 0,
      traveler_count: 0,
      hub_members: undefined,
      hub_places: undefined,
    })
    canTripActionDirectMock.mockResolvedValue(true)
    seedFamilyAuth()
  })

  it('copies in-memory place and traveler counts onto the archived row', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ToastContainer />
        <ArchiveHarness />
      </>,
    )

    await screen.findByTestId('loaded-count')
    await user.click(screen.getByRole('button', { name: 'Archive' }))

    expect(await screen.findByTestId('archived-meta')).toHaveTextContent('4-3')
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '../../tests/helpers/render'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/helpers/msw/server'
import { resetAllStores, seedStore } from '../../tests/helpers/store'
import { buildUser } from '../../tests/helpers/factories'
import { useAuthStore } from '../store/authStore'
import { useAddonStore } from '../store/addonStore'
import { usePermissionsStore } from '../store/permissionsStore'
import { useJourneyStore } from '../store/journeyStore'
import JourneyPage from './JourneyPage'
import { journeyApi } from '../api/client'
import { addLocalIsoDays, localIsoDate } from '../utils/localIsoDate'

const {
  isSupabaseMock,
  listFamilyJourneysMock,
  listFamilyJourneyAvailableTripsMock,
} = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => true),
  listFamilyJourneysMock: vi.fn(),
  listFamilyJourneyAvailableTripsMock: vi.fn(),
}))

vi.mock('../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('../data/supabase/journeys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/journeys')>()
  return {
    ...actual,
    listFamilyJourneys: listFamilyJourneysMock,
    listFamilyJourneyAvailableTrips: listFamilyJourneyAvailableTripsMock,
  }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('../components/Layout/Navbar', () => ({
  default: () => <nav data-testid="navbar" />,
}))

const nestSuggestions = vi.spyOn(journeyApi, 'suggestions')

function familyJourney(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    title: 'Como',
    subtitle: null,
    cover_image: null,
    status: 'draft' as const,
    created_at: Date.now(),
    updated_at: Date.now(),
    entry_count: 2,
    photo_count: 4,
    place_count: 1,
    linked_trip_ids: [] as string[],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  isSupabaseMock.mockReturnValue(true)
  resetAllStores()
  useJourneyStore.setState({
    journeys: [],
    current: null,
    loading: false,
    notFound: false,
    loadError: false,
  })
  seedStore(useAuthStore, {
    isAuthenticated: true,
    user: buildUser(),
    familyId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    personId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  })
  seedStore(useAddonStore, { addons: [{ id: 'journey', type: 'global', enabled: true }] } as never)
  seedStore(usePermissionsStore, { level: 'owner' } as never)
  listFamilyJourneysMock.mockResolvedValue([familyJourney()])
  listFamilyJourneyAvailableTripsMock.mockResolvedValue([])
  server.use(
    http.get('/api/journeys', () => HttpResponse.json({ error: 'nest' }, { status: 500 })),
    http.get('/api/journeys/suggestions', () => HttpResponse.json({ error: 'nest' }, { status: 500 })),
  )
})

describe('JourneyPage Family plane', () => {
  it('renders Latest Journey from Family UUIDs and never calls Nest suggestions', async () => {
    render(<JourneyPage />)
    await waitFor(() => {
      expect(screen.getByText('Como')).toBeInTheDocument()
    })
    expect(screen.getByText('Latest Journey')).toBeInTheDocument()
    expect(listFamilyJourneysMock).toHaveBeenCalled()
    expect(nestSuggestions).not.toHaveBeenCalled()
  })

  it('shows Trip just ended for an eligible Family trip that is not already linked', async () => {
    listFamilyJourneyAvailableTripsMock.mockResolvedValue([
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        title: 'Paris Adventure',
        start_date: addLocalIsoDays(localIsoDate(), -14),
        end_date: addLocalIsoDays(localIsoDate(), -5),
        cover_image: null,
        place_count: 5,
        linked: false,
      },
    ])
    render(<JourneyPage />)
    await waitFor(() => {
      expect(screen.getByText(/Trip just ended/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Paris Adventure/)).toBeInTheDocument()
    expect(nestSuggestions).not.toHaveBeenCalled()
  })

  it('does not treat a failed Family list as an empty grid', async () => {
    listFamilyJourneysMock.mockRejectedValue(new Error('rpc failed'))
    render(<JourneyPage />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText('Could not load journeys.')).toBeInTheDocument()
    expect(screen.queryByText(/create a new journey/i)).not.toBeInTheDocument()
  })

  it('does not treat a failed suggestion RPC as an empty trip suggestion', async () => {
    listFamilyJourneyAvailableTripsMock.mockRejectedValue(new Error('rpc failed'))
    render(<JourneyPage />)
    await waitFor(() => {
      expect(screen.getByText('Como')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load trip suggestions.')
    expect(screen.queryByText(/Trip just ended/i)).not.toBeInTheDocument()
    expect(screen.getByText(/create a new journey/i)).toBeInTheDocument()
    expect(nestSuggestions).not.toHaveBeenCalled()
  })
})

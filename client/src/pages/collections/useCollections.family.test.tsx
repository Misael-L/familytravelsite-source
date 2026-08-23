import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { buildUser } from '../../../tests/helpers/factories'
import { useAuthStore } from '../../store/authStore'
import { ToastContainer } from '../../components/shared/Toast'
import CollectionsPage from '../CollectionsPage'
import { loadFamilyCollections } from '../../data/supabase/familyLists'
import { addListener } from '../../api/websocket'
import { collectionsApi } from '../../api/collections'
import { tripsApi } from '../../api/client'
import { canTripActionDirect } from '../../data/supabase/familyPermissions'
import { addCatalogPlaceToTrip } from '../../data/supabase/exploreAddToTrip'
import { listFamilyTrips } from '../../data/supabase/trips'
import { listTripPlaces } from '../../data/supabase/tripPlaces'

const {
  isSupabaseMock,
  canTripActionDirectMock,
  listTripPlacesMock,
  addCatalogPlaceToTripMock,
  listFamilyTripsMock,
  tripsApiListMock,
  copyToTripApiMock,
} = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => true),
  canTripActionDirectMock: vi.fn(async () => true),
  listTripPlacesMock: vi.fn(async () => []),
  addCatalogPlaceToTripMock: vi.fn(async () => ({ ok: true as const, outcome: 'added' as const })),
  listFamilyTripsMock: vi.fn(async () => ({ trips: [], archivedTrips: [] })),
  tripsApiListMock: vi.fn(),
  copyToTripApiMock: vi.fn(),
}))

vi.mock('../../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('../../data/supabase/familyLists', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyLists')>()
  return {
    ...actual,
    loadFamilyCollections: vi.fn(),
    createFamilyList: vi.fn(),
    updateFamilyList: vi.fn(),
    archiveFamilyList: vi.fn(),
    addFamilyListItem: vi.fn(),
    removeFamilyListItem: vi.fn(),
    setFamilyListItemStatus: vi.fn(),
    searchCatalogForList: vi.fn().mockResolvedValue([]),
    uploadFamilyListCover: vi.fn(),
  }
})

vi.mock('../../components/Layout/Navbar', () => ({
  default: () => <nav data-testid="navbar" />,
}))

vi.mock('../../components/Collections/CollectionMapPanel', () => ({
  default: () => <div data-testid="map" />,
}))

vi.mock('../../api/websocket', () => ({
  addListener: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('../../data/supabase/familyPermissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyPermissions')>()
  return { ...actual, canTripActionDirect: canTripActionDirectMock }
})

vi.mock('../../data/supabase/tripPlaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripPlaces')>()
  return { ...actual, listTripPlaces: listTripPlacesMock }
})

vi.mock('../../data/supabase/exploreAddToTrip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/exploreAddToTrip')>()
  return { ...actual, addCatalogPlaceToTrip: addCatalogPlaceToTripMock }
})

vi.mock('../../data/supabase/trips', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/trips')>()
  return { ...actual, listFamilyTrips: listFamilyTripsMock }
})

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>()
  return { ...actual, tripsApi: { ...actual.tripsApi, list: tripsApiListMock } }
})

vi.mock('../../api/collections', () => ({
  collectionsApi: {
    list: vi.fn(),
    get: vi.fn(),
    copyToTrip: copyToTripApiMock,
  },
}))

describe('Family Collections chrome', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
    isSupabaseMock.mockReturnValue(true)
    seedStore(useAuthStore, {
      isAuthenticated: true,
      user: buildUser(),
      familyId: 'fam-1',
      personId: 'p1',
      membershipRole: 'parent',
    })
    vi.mocked(loadFamilyCollections).mockResolvedValue({
      collections: [{
        id: 'list-1' as unknown as number,
        owner_id: 'p1' as unknown as number,
        name: 'Eats',
        description: null,
        color: '#6366f1',
        cover_image: null,
        is_owner: true,
        place_count: 0,
        visibility: 'private',
      }],
      places: [],
    })
  })

  it('loads lists via the Family adapter and does not call Nest collections or websocket', async () => {
    render(<CollectionsPage />, { initialEntries: ['/collections'] })
    await waitFor(() => expect(loadFamilyCollections).toHaveBeenCalledWith({ familyId: 'fam-1', personId: 'p1' }))
    expect(addListener).not.toHaveBeenCalled()
    expect(collectionsApi.list).not.toHaveBeenCalled()
    expect(screen.getByText('Eats')).toBeInTheDocument()
  })

  it('toasts missingPerson when family profile is not linked', async () => {
    seedStore(useAuthStore, {
      isAuthenticated: true,
      user: buildUser(),
      familyId: null,
      personId: null,
    })
    render(
      <>
        <ToastContainer />
        <CollectionsPage />
      </>,
      { initialEntries: ['/collections'] },
    )
    await waitFor(() => {
      expect(screen.getByText(/family profile is not linked/i)).toBeInTheDocument()
    })
    expect(loadFamilyCollections).not.toHaveBeenCalled()
  })
})

const familyPlace = {
  id: 'item-1' as unknown as number,
  collection_id: 'list-1' as unknown as number,
  name: 'Gubbio',
  description: null,
  lat: null,
  lng: null,
  address: 'Perugia',
  notes: null,
  image_url: null,
  website: null,
  phone: null,
  status: 'idea' as const,
  sort_order: 0,
  label_ids: [],
  catalog_kind: 'place',
  catalog_entity_id: 'pl-1',
}

describe('Family Collections copy to trip', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
    isSupabaseMock.mockReturnValue(true)
    canTripActionDirectMock.mockResolvedValue(true)
    listTripPlacesMock.mockResolvedValue([])
    addCatalogPlaceToTripMock.mockResolvedValue({ ok: true, outcome: 'added' })
    listFamilyTripsMock.mockResolvedValue({
      trips: [{
        id: 'trip-1',
        family_id: 'fam-1',
        title: 'Umbria',
        description: null,
        start_date: '2026-09-01',
        end_date: '2026-09-08',
        cover_image: null,
        is_archived: 0,
        currency: 'EUR',
        reminder_days: 0,
        status: 'planning',
      } as never],
      archivedTrips: [],
    })
    seedStore(useAuthStore, {
      isAuthenticated: true,
      user: buildUser(),
      familyId: 'fam-1',
      personId: 'p1',
      membershipRole: 'parent',
    })
    vi.mocked(loadFamilyCollections).mockResolvedValue({
      collections: [{
        id: 'list-1' as unknown as number,
        owner_id: 'p1' as unknown as number,
        name: 'Eats',
        description: null,
        color: '#6366f1',
        cover_image: null,
        is_owner: true,
        place_count: 1,
        visibility: 'private',
      }],
      places: [familyPlace],
    })
  })

  async function openCopyPicker() {
    const user = userEvent.setup()
    render(
      <>
        <ToastContainer />
        <CollectionsPage />
      </>,
      { initialEntries: ['/collections'] },
    )
    expect(await screen.findByText('Gubbio')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByText('Gubbio'))
    await user.click(screen.getByRole('button', { name: 'Copy to trip' }))
    expect(await screen.findByRole('button', { name: /umbria/i })).toBeInTheDocument()
    return user
  }

  it('copies a listed place via W8.5 and never Nest copyToTrip / tripsApi', async () => {
    const user = await openCopyPicker()
    expect(listFamilyTrips).toHaveBeenCalledWith('fam-1')
    expect(tripsApi.list).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /umbria/i }))
    await waitFor(() => {
      expect(addCatalogPlaceToTrip).toHaveBeenCalledWith(expect.objectContaining({
        tripId: 'trip-1',
        placeId: 'pl-1',
        canMutate: true,
        confirmedOutOfPurview: true,
      }))
    })
    expect(canTripActionDirect).toHaveBeenCalledWith('trip-1', 'trip.places.manage')
    expect(listTripPlaces).toHaveBeenCalledWith('trip-1')
    expect(collectionsApi.copyToTrip).not.toHaveBeenCalled()
    expect(tripsApi.list).not.toHaveBeenCalled()
  })

  it('toasts hof-only and does not call addCatalogPlaceToTrip for non-HOF', async () => {
    canTripActionDirectMock.mockResolvedValue(false)
    const user = await openCopyPicker()
    await user.click(screen.getByRole('button', { name: /umbria/i }))
    expect(await screen.findByText('Only the family head can change published trip places')).toBeInTheDocument()
    expect(addCatalogPlaceToTrip).not.toHaveBeenCalled()
    expect(collectionsApi.copyToTrip).not.toHaveBeenCalled()
  })
})

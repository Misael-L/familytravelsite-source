import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { listHubTripPlaces } from './tripPlaces'
import { listHubTripTravelers } from './tripTravelers'
import { listPeopleAvatarRefs, signAvatarUrls } from './personAvatars'
import { listFamilyTrips } from './trips'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

vi.mock('./tripTravelers', () => ({
  listHubTripTravelers: vi.fn(),
}))

vi.mock('./tripPlaces', () => ({
  listHubTripPlaces: vi.fn(),
}))

vi.mock('./personAvatars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./personAvatars')>()
  return {
    ...actual,
    listPeopleAvatarRefs: vi.fn(),
    signAvatarUrls: vi.fn(),
  }
})

function thenable(result: { data: unknown; error: unknown }) {
  const t: Record<string, unknown> = {}
  const self = () => t
  t.select = self
  t.eq = self
  t.is = self
  t.not = self
  t.order = self
  t.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return t
}

const ACTIVE = {
  id: 't-active',
  family_id: 'fam-1',
  name: 'Como',
  primary_country_id: null,
  start_at: '2026-08-10T00:00:00Z',
  end_at: '2026-08-17T00:00:00Z',
  status: 'published',
  cover_url: null,
  notes: null,
  occasion: null,
  reminder_days: 0,
  archived_at: null,
  currency_code: 'USD',
}

describe('listFamilyTrips hub enrichment', () => {
  const from = vi.fn()

  beforeEach(() => {
    from.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from } as never)
    vi.mocked(listHubTripTravelers).mockReset()
    vi.mocked(listHubTripPlaces).mockReset()
    vi.mocked(listPeopleAvatarRefs).mockReset()
    vi.mocked(signAvatarUrls).mockReset()
    vi.mocked(listPeopleAvatarRefs).mockResolvedValue([])
    vi.mocked(signAvatarUrls).mockResolvedValue({})
  })

  it('batches travelers and places then groups onto trips', async () => {
    const results = [
      { data: [ACTIVE], error: null },
      { data: [], error: null },
    ]
    from.mockImplementation(() => thenable(results.shift() ?? { data: [], error: null }))
    vi.mocked(listHubTripTravelers).mockResolvedValue([
      { tripId: 't-active', personId: 'p1', displayName: 'Ada', color: '#111', avatarUrl: null },
      { tripId: 't-active', personId: 'p2', displayName: null, color: null, avatarUrl: null },
    ])
    vi.mocked(listHubTripPlaces).mockResolvedValue([
      { tripId: 't-active', placeId: 'pl1', name: 'Bellagio', lat: 46, lng: 9, imageUrl: null },
    ])

    const { trips, archivedTrips } = await listFamilyTrips('fam-1')
    expect(listHubTripTravelers).toHaveBeenCalledWith(['t-active'])
    expect(listHubTripPlaces).toHaveBeenCalledWith(['t-active'])
    expect(archivedTrips).toEqual([])
    expect(trips[0]?.traveler_count).toBe(2)
    expect(trips[0]?.place_count).toBe(1)
    expect(trips[0]?.day_count).toBe(8)
    expect(trips[0]?.hub_members?.map(m => m.displayName)).toEqual(['Ada'])
    expect(trips[0]?.shared_count).toBeUndefined()
    expect(listPeopleAvatarRefs).toHaveBeenCalledWith('fam-1')
    expect(signAvatarUrls).toHaveBeenCalledWith([], ['p1'])
  })

  it('stamps signed avatar URLs onto hub members', async () => {
    const results = [
      { data: [ACTIVE], error: null },
      { data: [], error: null },
    ]
    from.mockImplementation(() => thenable(results.shift() ?? { data: [], error: null }))
    vi.mocked(listHubTripTravelers).mockResolvedValue([
      { tripId: 't-active', personId: 'p1', displayName: 'Ada', color: '#111', avatarUrl: null },
    ])
    vi.mocked(listHubTripPlaces).mockResolvedValue([])
    vi.mocked(listPeopleAvatarRefs).mockResolvedValue([{
      personId: 'p1',
      familyId: 'fam-1',
      displayName: 'Ada',
      color: '#111',
      avatarMediaId: 'm1',
      bucket: 'family',
      storagePath: 'fam-1/ada.jpg',
    }])
    vi.mocked(signAvatarUrls).mockResolvedValue({ p1: 'https://signed/ada' })

    const { trips } = await listFamilyTrips('fam-1')
    expect(trips[0]?.hub_members?.[0]?.avatarUrl).toBe('https://signed/ada')
    expect(trips[0]?.traveler_count).toBe(1)
  })

  it('skips extra queries when there are no trips', async () => {
    from.mockReturnValue(thenable({ data: [], error: null }))
    const { trips, archivedTrips } = await listFamilyTrips('fam-1')
    expect(trips).toEqual([])
    expect(archivedTrips).toEqual([])
    expect(listHubTripTravelers).not.toHaveBeenCalled()
    expect(listHubTripPlaces).not.toHaveBeenCalled()
    expect(listPeopleAvatarRefs).not.toHaveBeenCalled()
  })

  it('keeps places when travelers fail', async () => {
    const results = [
      { data: [ACTIVE], error: null },
      { data: [], error: null },
    ]
    from.mockImplementation(() => thenable(results.shift() ?? { data: [], error: null }))
    vi.mocked(listHubTripTravelers).mockRejectedValue(new Error('timeout'))
    vi.mocked(listHubTripPlaces).mockResolvedValue([
      { tripId: 't-active', placeId: 'pl1', name: 'Bellagio', lat: 46, lng: 9, imageUrl: null },
    ])

    const { trips } = await listFamilyTrips('fam-1')
    expect(trips).toHaveLength(1)
    expect(trips[0]?.title).toBe('Como')
    expect(trips[0]?.traveler_count).toBe(0)
    expect(trips[0]?.place_count).toBe(1)
    expect(listPeopleAvatarRefs).not.toHaveBeenCalled()
  })

  it('keeps travelers when places fail', async () => {
    const results = [
      { data: [ACTIVE], error: null },
      { data: [], error: null },
    ]
    from.mockImplementation(() => thenable(results.shift() ?? { data: [], error: null }))
    vi.mocked(listHubTripTravelers).mockResolvedValue([
      { tripId: 't-active', personId: 'p1', displayName: 'Ada', color: '#111', avatarUrl: null },
    ])
    vi.mocked(listHubTripPlaces).mockRejectedValue(new Error('places down'))

    const { trips } = await listFamilyTrips('fam-1')
    expect(trips[0]?.traveler_count).toBe(1)
    expect(trips[0]?.place_count).toBe(0)
    expect(trips[0]?.hub_members?.[0]?.displayName).toBe('Ada')
  })

  it('keeps the trip list when both enrichment queries fail', async () => {
    const results = [
      { data: [ACTIVE], error: null },
      { data: [], error: null },
    ]
    from.mockImplementation(() => thenable(results.shift() ?? { data: [], error: null }))
    vi.mocked(listHubTripTravelers).mockRejectedValue(new Error('timeout'))
    vi.mocked(listHubTripPlaces).mockRejectedValue(new Error('places down'))

    const { trips } = await listFamilyTrips('fam-1')
    expect(trips).toHaveLength(1)
    expect(trips[0]?.id).toBe('t-active')
    expect(trips[0]?.traveler_count).toBe(0)
    expect(trips[0]?.place_count).toBe(0)
    expect(trips[0]?.day_count).toBe(8)
  })

  it('keeps counts when avatar signing fails', async () => {
    const results = [
      { data: [ACTIVE], error: null },
      { data: [], error: null },
    ]
    from.mockImplementation(() => thenable(results.shift() ?? { data: [], error: null }))
    vi.mocked(listHubTripTravelers).mockResolvedValue([
      { tripId: 't-active', personId: 'p1', displayName: 'Ada', color: '#111', avatarUrl: null },
    ])
    vi.mocked(listHubTripPlaces).mockResolvedValue([])
    vi.mocked(listPeopleAvatarRefs).mockRejectedValue(new Error('refs down'))

    const { trips } = await listFamilyTrips('fam-1')
    expect(trips[0]?.traveler_count).toBe(1)
    expect(trips[0]?.hub_members?.[0]?.avatarUrl).toBeNull()
  })

  it('throws when the trips list query errors', async () => {
    from.mockReturnValue(thenable({ data: null, error: { message: 'rls' } }))
    await expect(listFamilyTrips('fam-1')).rejects.toMatchObject({ message: 'rls' })
    expect(listHubTripTravelers).not.toHaveBeenCalled()
  })
})

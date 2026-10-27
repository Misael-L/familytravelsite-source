import React from 'react'
import { Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '../../tests/helpers/render'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/helpers/msw/server'
import { resetAllStores, seedStore } from '../../tests/helpers/store'
import { useAuthStore } from '../store/authStore'
import { ToastContainer } from '../components/shared/Toast'
import TripPlannerPage from './TripPlannerPage'
import type { FamilyTripPlace } from '../data/supabase/tripPlaces'
import type { FamilyScheduleItem } from '../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../data/supabase/tripDays'
import type { FamilyDayNote } from '../data/supabase/dayNotes'

const harness = vi.hoisted(() => ({
  tripId: '11111111-1111-4111-8111-111111111111',
  familyId: '99999999-9999-4999-8999-999999999999',
  personId: '88888888-8888-4888-8888-888888888888',
  dayId: '22222222-2222-4222-8222-222222222222',
  itemA: '44444444-4444-4444-8444-444444444444',
  itemB: '55555555-5555-4555-8555-555555555555',
  placeId: '66666666-6666-4666-8666-666666666666',
  noteId: '77777777-7777-4777-8777-777777777777',
  hof: true,
  canDraft: true,
  outcome: 'direct' as 'direct' | 'propose' | 'deny',
  updateTripDayTitle: vi.fn(),
  deleteScheduleItem: vi.fn(),
  updateScheduleSortOrders: vi.fn(),
  upsertDayNote: vi.fn(),
  deleteDayNote: vi.fn(),
  upsertTripChangeDraftOp: vi.fn(),
  mapProps: { current: null as Record<string, unknown> | null },
}))

vi.mock('../components/Layout/Navbar', () => ({
  default: () => React.createElement('nav', { 'data-testid': 'navbar' }),
}))

vi.mock('../components/Map/MapViewAuto', () => ({
  MapViewAuto: (props: Record<string, unknown>) => {
    harness.mapProps.current = props
    return React.createElement('div', { 'data-testid': 'family-map' })
  },
}))

vi.mock('../components/Map/useWorkspacePois', () => ({
  useWorkspacePois: () => ({
    pois: [],
    onViewportChange: () => {},
    updatePlaceFocus: () => {},
    usesFamilyCatalog: false,
    setUsesFamilyCatalog: () => {},
    active: new Set<string>(),
    toggle: () => {},
    loadingKeys: new Set<string>(),
    errorKeys: new Set<string>(),
    moved: false,
    searchArea: () => {},
    showNearbyToggle: false,
    allowNearby: false,
    setAllowNearby: () => {},
    isExploreEnabled: false,
    showBoundaryComingSoon: false,
  }),
}))

vi.mock('../hooks/useFamilyItineraryRealtime', () => ({
  useFamilyItineraryRealtime: () => {},
}))

vi.mock('../lib/map/placeFootprints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/map/placeFootprints')>()
  return { ...actual, findPlaceFootprint: vi.fn().mockResolvedValue(null) }
})

vi.mock('../data/supabase/client', () => ({
  getSupabaseBrowserClient: () => {
    throw new Error('route test reached the Supabase client')
  },
}))

vi.mock('../data/supabase/trips', () => ({
  fetchTripById: vi.fn(async () => ({
    id: harness.tripId,
    family_id: harness.familyId,
    title: 'Mexico',
    description: null,
    start_date: '2026-12-01',
    end_date: '2026-12-02',
    cover_image: null,
    is_archived: 0,
    currency: 'EUR',
    reminder_days: 0,
    status: 'planning',
  })),
}))

vi.mock('../data/supabase/tripDays', () => ({
  syncTripDays: vi.fn(async () => undefined),
  listTripDays: vi.fn(async (): Promise<FamilyTripDay[]> => ([
    { id: harness.dayId, tripId: harness.tripId, civilDay: '2026-12-01', dayIndex: 1, title: 'Harbor morning' },
  ])),
  updateTripDayTitle: harness.updateTripDayTitle,
}))

vi.mock('../data/supabase/tripPlaces', () => ({
  listTripPlaces: vi.fn(async (): Promise<FamilyTripPlace[]> => ([
    {
      id: harness.placeId,
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
    },
  ])),
  deleteTripPlace: vi.fn(),
  upsertTripPlace: vi.fn(),
}))

vi.mock('../data/supabase/tripTracks', () => ({
  listTripTracks: vi.fn(async () => []),
  deleteTripTrack: vi.fn(),
}))

vi.mock('../data/supabase/catalogPlaces', () => ({
  listTripCountryIds: vi.fn(async () => []),
}))

vi.mock('../data/supabase/scheduleItems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/scheduleItems')>()
  const items: FamilyScheduleItem[] = [
    {
      id: harness.itemA, tripId: harness.tripId, activity: 'Zócalo walk', placeId: null,
      startsAt: '2026-12-01T16:00:00.000Z', endsAt: null, address: null,
      timeZone: null, sortOrder: 0, experienceId: null, foodId: null, linkUrl: null,
    },
    {
      id: harness.itemB, tripId: harness.tripId, activity: 'Museum hour', placeId: harness.placeId,
      startsAt: '2026-12-01T16:00:00.000Z', endsAt: null, address: null,
      timeZone: null, sortOrder: 1, experienceId: null, foodId: null, linkUrl: null,
    },
  ]
  return {
    ...actual,
    listScheduleItems: vi.fn(async () => items),
    deleteScheduleItem: harness.deleteScheduleItem,
    updateScheduleSortOrders: harness.updateScheduleSortOrders,
    insertScheduleItem: vi.fn(),
  }
})

vi.mock('../data/supabase/dayNotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/dayNotes')>()
  const notes: FamilyDayNote[] = [{
    id: harness.noteId, tripId: harness.tripId, civilDay: '2026-12-01', body: 'Land before lunch', icon: null, sortOrder: 0,
  }]
  return {
    ...actual,
    listDayNotes: vi.fn(async () => notes),
    upsertDayNote: harness.upsertDayNote,
    deleteDayNote: harness.deleteDayNote,
  }
})

vi.mock('../data/supabase/capabilities', () => ({
  canMutateTrip: vi.fn(async () => harness.hof),
  canDraftTripChanges: vi.fn(async () => harness.canDraft),
}))

vi.mock('../data/supabase/familyPermissions', () => ({
  listTripActionOutcomes: vi.fn(async () => ({
    tripId: harness.tripId,
    familyId: harness.familyId,
    outcomes: {
      'trip.places.manage': harness.outcome,
      'trip.schedule.manage': harness.outcome,
      'trip.reservations.manage': harness.outcome,
      'trip.costs.manage': harness.outcome,
    },
  })),
}))

vi.mock('../data/supabase/tripChangeRequests', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/tripChangeRequests')>()
  return {
    ...actual,
    fetchMyTripChangeDraft: vi.fn(async () => ({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tripId: harness.tripId,
      ownerPersonId: harness.personId,
      title: null,
      notes: null,
      updatedAt: null,
    })),
    fetchTripChangeDraftOps: vi.fn(async () => []),
    fetchOpenTripChangeRequests: vi.fn(async () => []),
    fetchMySubmittedTripChangeRequests: vi.fn(async () => []),
    fetchTripChangeRequestOps: vi.fn(async () => []),
    upsertTripChangeDraftOp: harness.upsertTripChangeDraftOp,
  }
})

vi.mock('../data/supabase/familyPlaceCategories', () => ({
  listMemberFamilyPlaceCategories: vi.fn(async () => []),
}))

vi.mock('../data/supabase/tripReservations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/tripReservations')>()
  return {
    ...actual,
    listTripBookings: vi.fn(async () => []),
    listTripTransports: vi.fn(async () => []),
  }
})

function renderPlanner() {
  return render(
    <>
      <ToastContainer />
      <Routes>
        <Route path="/trips/:id" element={<TripPlannerPage />} />
      </Routes>
    </>,
    { initialEntries: [`/trips/${harness.tripId}`] },
  )
}

async function openDayEditor() {
  const head = await screen.findByText('Harbor morning')
  const card = head.closest('.dp-day-header')
  if (!(card instanceof HTMLElement)) throw new Error('missing day head')
  return card
}

async function confirmRemove() {
  await screen.findByText('Remove from Day')
  const confirm = screen.getAllByRole('button', { name: 'Delete' }).find(button => button.textContent?.trim() === 'Delete')
  if (!confirm) throw new Error('missing confirm delete')
  confirm.click()
}

describe('Family trip planner route', () => {
  let nestHits = 0

  beforeEach(() => {
    vi.clearAllMocks()
    harness.hof = true
    harness.canDraft = true
    harness.outcome = 'direct'
    harness.mapProps.current = null
    harness.updateTripDayTitle.mockResolvedValue(undefined)
    harness.deleteScheduleItem.mockResolvedValue(undefined)
    harness.updateScheduleSortOrders.mockResolvedValue(undefined)
    harness.upsertDayNote.mockImplementation(async (input: { body: string }) => ({
      id: harness.noteId, tripId: harness.tripId, civilDay: '2026-12-01', body: input.body, icon: null, sortOrder: 0,
    }))
    harness.upsertTripChangeDraftOp.mockResolvedValue({ draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', opId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
    vi.stubEnv('VITE_DATA_PLANE', '')
    nestHits = 0
    server.use(http.all('/api/*', () => {
      nestHits += 1
      return new HttpResponse(null, { status: 599 })
    }))
    resetAllStores()
    seedStore(useAuthStore, {
      isAuthenticated: true,
      isLoading: false,
      personId: harness.personId,
      familyId: harness.familyId,
      membershipLoaded: true,
      membershipStatus: 'active',
      membershipRole: 'parent',
      authGate: 'ok',
    })
  })

  it('renders the Family day rail and passes no driving route', async () => {
    renderPlanner()
    expect(await screen.findByText('Harbor morning')).toBeInTheDocument()
    expect(screen.getByText('Published')).toBeInTheDocument()
    expect(screen.getByText('My draft')).toBeInTheDocument()
    expect(screen.queryByTestId('day-plan-sidebar')).not.toBeInTheDocument()
    await waitFor(() => expect(harness.mapProps.current).not.toBeNull())
    expect(harness.mapProps.current?.route).toBeNull()
    expect(harness.mapProps.current?.routeSegments).toEqual([])
    expect(harness.mapProps.current?.showTransitRoutes).toBe(false)
    expect(Array.from(document.images).some(image => image.src.includes('supabase.co'))).toBe(false)
    expect(nestHits).toBe(0)
  })

  it('writes published schedule rows for a direct member', async () => {
    const user = userEvent.setup()
    renderPlanner()
    const head = await openDayEditor()
    await waitFor(() => expect(within(head).getByRole('button', { name: 'Edit' })).toBeInTheDocument())
    await user.click(within(head).getByRole('button', { name: 'Edit' }))
    const input = screen.getByRole('textbox', { name: 'Edit' })
    await user.clear(input)
    await user.type(input, 'Harbor evening')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(harness.updateTripDayTitle).toHaveBeenCalledWith(harness.dayId, 'Harbor evening'))

    await user.click(screen.getAllByRole('button', { name: 'Move down' })[0])
    await waitFor(() => expect(harness.updateScheduleSortOrders).toHaveBeenCalled())
    expect(harness.upsertTripChangeDraftOp).not.toHaveBeenCalled()

    await user.click(within(head).getByRole('button', { name: 'Add Note' }))
    await user.type(screen.getByPlaceholderText('Add Note'), ' extra')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(harness.upsertDayNote).toHaveBeenCalled())

    const card = head.parentElement as HTMLElement
    await user.click(within(card).getAllByRole('button', { name: 'Delete' })[0])
    await confirmRemove()
    await waitFor(() => expect(harness.deleteScheduleItem).toHaveBeenCalled())
    expect([harness.itemA, harness.itemB]).toContain(harness.deleteScheduleItem.mock.calls[0][0])
    expect(nestHits).toBe(0)
  })

  it('toasts a published nudge without opening a write', async () => {
    const user = userEvent.setup()
    harness.hof = false
    harness.canDraft = true
    harness.outcome = 'propose'
    renderPlanner()
    await screen.findByText('Harbor morning')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument())
    await user.click(screen.getAllByRole('button', { name: 'Move down' })[0])
    expect(await screen.findByText(/Switch to My draft/i)).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(screen.queryByText('Remove from Day')).not.toBeInTheDocument()
    expect(harness.updateScheduleSortOrders).not.toHaveBeenCalled()
    expect(harness.deleteScheduleItem).not.toHaveBeenCalled()
    expect(harness.upsertTripChangeDraftOp).not.toHaveBeenCalled()
  })

  it('toasts a hard denial without published or draft writes', async () => {
    const user = userEvent.setup()
    harness.hof = false
    harness.canDraft = false
    harness.outcome = 'deny'
    renderPlanner()
    await screen.findByText('Harbor morning')
    await user.click(screen.getAllByRole('button', { name: 'Move down' })[0])
    expect(await screen.findByText(/permission to change this/i)).toBeInTheDocument()
    expect(harness.updateTripDayTitle).not.toHaveBeenCalled()
    expect(harness.deleteScheduleItem).not.toHaveBeenCalled()
    expect(harness.updateScheduleSortOrders).not.toHaveBeenCalled()
    expect(harness.upsertDayNote).not.toHaveBeenCalled()
    expect(harness.upsertTripChangeDraftOp).not.toHaveBeenCalled()
  })

  it('stages draft notes and removals and keeps day titles off the published row', async () => {
    const user = userEvent.setup()
    harness.hof = true
    harness.outcome = 'direct'
    renderPlanner()
    await screen.findByText('Harbor morning')
    await user.click(screen.getByRole('button', { name: 'My draft' }))
    const head = await openDayEditor()
    await user.click(within(head).getByRole('button', { name: 'Edit' }))
    const input = screen.getByRole('textbox', { name: 'Edit' })
    await user.clear(input)
    await user.type(input, 'Draft title')
    await user.keyboard('{Enter}')
    expect(await screen.findByText(/Switch to Published/i)).toBeInTheDocument()
    expect(harness.updateTripDayTitle).not.toHaveBeenCalled()

    await user.click(within(head).getByRole('button', { name: 'Add Note' }))
    const noteBox = screen.getByPlaceholderText('Add Note')
    await user.clear(noteBox)
    await user.type(noteBox, 'Staged note')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(harness.upsertTripChangeDraftOp).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'day_note' }),
    ))
    expect(harness.upsertDayNote).not.toHaveBeenCalled()

    await user.click(screen.getAllByRole('button', { name: 'Delete' }).find(button => button.textContent?.trim() !== 'Delete') as HTMLElement)
    await confirmRemove()
    await waitFor(() => expect(harness.upsertTripChangeDraftOp).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'plan_item', op: 'remove' }),
    ))
    expect(harness.deleteScheduleItem).not.toHaveBeenCalled()
    expect(harness.updateScheduleSortOrders).not.toHaveBeenCalled()
  })

  it('shows the head-of-family error when a drafter edits a day title', async () => {
    const user = userEvent.setup()
    harness.hof = false
    harness.canDraft = true
    harness.outcome = 'propose'
    renderPlanner()
    await screen.findByText('Harbor morning')
    await user.click(screen.getByRole('button', { name: 'My draft' }))
    const head = await openDayEditor()
    await waitFor(() => expect(within(head).getByRole('button', { name: 'Edit' })).toBeInTheDocument())
    await user.click(within(head).getByRole('button', { name: 'Edit' }))
    const input = screen.getByRole('textbox', { name: 'Edit' })
    await user.clear(input)
    await user.type(input, 'Member title')
    await user.keyboard('{Enter}')
    expect(await screen.findByText(/Only the family head/i)).toBeInTheDocument()
    expect(harness.updateTripDayTitle).not.toHaveBeenCalled()
    expect(harness.upsertTripChangeDraftOp).not.toHaveBeenCalled()
  })
})

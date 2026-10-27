import React from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '../../../../tests/helpers/render'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/helpers/msw/server'
import { resetAllStores, seedStore } from '../../../../tests/helpers/store'
import { useAuthStore } from '../../../store/authStore'
import { ToastContainer } from '../../shared/Toast'
import TripPlannerPage from '../../../pages/TripPlannerPage'
import type { FamilyScheduleItem } from '../../../data/supabase/scheduleItems'
import type { FamilyTripReservation, FamilyTransportReservation } from '../../../data/supabase/tripReservations'
import type { FamilyTripExpense } from '../../../data/supabase/tripExpenses'

const harness = vi.hoisted(() => ({
  tripId: '11111111-1111-4111-8111-111111111111',
  familyId: '99999999-9999-4999-8999-999999999999',
  personId: '88888888-8888-4888-8888-888888888888',
  outcome: 'direct' as 'direct' | 'propose' | 'deny',
  hof: true,
  updateScheduleSortOrders: vi.fn(),
  deleteTripReservation: vi.fn(),
  upsertTripChangeDraftOp: vi.fn(),
  listTripBookings: vi.fn(),
  listTripTransports: vi.fn(),
  listTripExpenses: vi.fn(),
  unlinkExpenseReservation: vi.fn(),
  listTripFiles: vi.fn(),
}))

vi.mock('../../../components/Layout/Navbar', () => ({ default: () => React.createElement('nav') }))
vi.mock('../../../components/Map/MapViewAuto', () => ({ MapViewAuto: () => React.createElement('div') }))
vi.mock('../../../components/Map/useWorkspacePois', () => ({
  useWorkspacePois: () => ({
    pois: [], onViewportChange: () => {}, updatePlaceFocus: () => {}, usesFamilyCatalog: false,
    setUsesFamilyCatalog: () => {}, active: new Set<string>(), toggle: () => {}, loadingKeys: new Set<string>(),
    errorKeys: new Set<string>(), moved: false, searchArea: () => {}, showNearbyToggle: false,
    allowNearby: false, setAllowNearby: () => {}, isExploreEnabled: false, showBoundaryComingSoon: false,
  }),
}))
vi.mock('../../../hooks/useFamilyItineraryRealtime', () => ({ useFamilyItineraryRealtime: () => {} }))
vi.mock('../../../lib/map/placeFootprints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/map/placeFootprints')>()
  return { ...actual, findPlaceFootprint: vi.fn(async () => null) }
})
vi.mock('../../../data/supabase/client', () => ({ getSupabaseBrowserClient: () => { throw new Error('shell test reached Supabase') } }))
vi.mock('../../../components/Files/FamilyFileAttach', () => ({ default: () => null }))
vi.mock('../../../utils/fileDownload', () => ({ openFile: vi.fn(async () => undefined) }))

vi.mock('../../../data/supabase/trips', () => ({
  fetchTripById: vi.fn(async () => ({
    id: harness.tripId, family_id: harness.familyId, title: 'Mexico', description: null,
    start_date: '2026-12-01', end_date: '2026-12-01', cover_image: null, is_archived: 0,
    currency: 'EUR', reminder_days: 0, status: 'planning',
  })),
}))
vi.mock('../../../data/supabase/tripDays', () => ({
  syncTripDays: vi.fn(async () => undefined),
  listTripDays: vi.fn(async () => ([{ id: 'day-1', tripId: harness.tripId, civilDay: '2026-12-01', dayIndex: 0, title: 'Harbor morning' }])),
  updateTripDayTitle: vi.fn(),
}))
vi.mock('../../../data/supabase/tripPlaces', () => ({ listTripPlaces: vi.fn(async () => []), deleteTripPlace: vi.fn(), upsertTripPlace: vi.fn() }))
vi.mock('../../../data/supabase/tripTracks', () => ({ listTripTracks: vi.fn(async () => []), deleteTripTrack: vi.fn() }))
vi.mock('../../../data/supabase/catalogPlaces', () => ({ listTripCountryIds: vi.fn(async () => []) }))
vi.mock('../../../data/supabase/dayNotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../data/supabase/dayNotes')>()
  return { ...actual, listDayNotes: vi.fn(async () => []), upsertDayNote: vi.fn(), deleteDayNote: vi.fn() }
})
vi.mock('../../../data/supabase/scheduleItems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../data/supabase/scheduleItems')>()
  const item = (id: string, sortOrder: number, startsAt: string): FamilyScheduleItem => ({
    id, tripId: harness.tripId, activity: id, placeId: null, startsAt, endsAt: null, address: null,
    timeZone: null, sortOrder, experienceId: null, foodId: null, linkUrl: null,
  })
  return {
    ...actual,
    listScheduleItems: vi.fn(async () => [
      item('A', 0, '2026-12-01T00:00:00.000Z'),
      item('B', 1, '2026-12-01T00:00:00.000Z'),
      item('C', 3, '2026-12-01T00:00:00.000Z'),
      item('D', 4, '2026-12-01T00:00:00.000Z'),
      item('early', 0, '2026-12-01T10:00:00.000Z'),
      item('late', 1, '2026-12-01T18:00:00.000Z'),
    ]),
    updateScheduleSortOrders: harness.updateScheduleSortOrders,
    deleteScheduleItem: vi.fn(),
    insertScheduleItem: vi.fn(),
  }
})
vi.mock('../../../data/supabase/tripReservations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../data/supabase/tripReservations')>()
  return {
    ...actual,
    listTripBookings: harness.listTripBookings,
    listTripTransports: harness.listTripTransports,
    deleteTripReservation: harness.deleteTripReservation,
  }
})
vi.mock('../../../data/supabase/tripFiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../data/supabase/tripFiles')>()
  return { ...actual, listTripFiles: harness.listTripFiles, signedTripFileUrl: vi.fn(async () => 'https://signed.example/file') }
})
vi.mock('../../../data/supabase/tripExpenses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../data/supabase/tripExpenses')>()
  return { ...actual, listTripExpenses: harness.listTripExpenses, unlinkExpenseReservation: harness.unlinkExpenseReservation }
})
vi.mock('../../../data/supabase/capabilities', () => ({
  canMutateTrip: vi.fn(async () => harness.hof),
  canDraftTripChanges: vi.fn(async () => true),
}))
vi.mock('../../../data/supabase/familyPermissions', () => ({
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
vi.mock('../../../data/supabase/tripChangeRequests', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../data/supabase/tripChangeRequests')>()
  return {
    ...actual,
    fetchMyTripChangeDraft: vi.fn(async () => ({ id: 'draft-1', tripId: harness.tripId, ownerPersonId: harness.personId, title: null, notes: null, updatedAt: null })),
    fetchTripChangeDraftOps: vi.fn(async () => []),
    fetchOpenTripChangeRequests: vi.fn(async () => []),
    fetchMySubmittedTripChangeRequests: vi.fn(async () => []),
    fetchTripChangeRequestOps: vi.fn(async () => []),
    upsertTripChangeDraftOp: harness.upsertTripChangeDraftOp,
  }
})
vi.mock('../../../data/supabase/familyPlaceCategories', () => ({ listMemberFamilyPlaceCategories: vi.fn(async () => []) }))

function booking(): FamilyTripReservation {
  return {
    id: 'stay', tripId: harness.tripId, type: 'event', status: 'pending', title: 'Gap event',
    startTripDayId: null, endTripDayId: null, startsAt: '2026-12-01T00:00:00.000Z', endsAt: null,
    confirmationCode: null, notes: null, url: null, placeId: null, hotelId: null, scheduleItemId: null,
    metadata: {}, sortOrder: 2, createdAt: '2026-08-01T00:00:00.000Z',
  }
}

function flight(): FamilyTransportReservation {
  return {
    id: 'flight-1', tripId: harness.tripId, type: 'flight', status: 'pending', title: 'Night flight',
    startTripDayId: null, endTripDayId: null, startsAt: '2026-12-01T12:00:00.000Z', endsAt: null,
    confirmationCode: 'AB12', notes: null, url: null, metadata: {}, sortOrder: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    endpoints: [{
      id: 'rome', role: 'from', sequence: 0, name: 'Rome', code: null, airportId: null, placeId: null,
      latitude: null, longitude: null, timeZone: 'Europe/Rome', localDate: '2026-12-01', localTime: '12:00',
    }],
    legs: [],
  }
}

function fare(reservationId: string | null): FamilyTripExpense {
  return {
    id: 'fare-1', tripId: harness.tripId, name: 'Night fare', category: 'flights', totalAmount: 20,
    currencyCode: 'EUR', exchangeRate: 1, expenseDate: null, note: null, ticketLines: null,
    reservationId, sortOrder: 0, createdAt: '2026-08-01T00:00:00.000Z', shares: [], payers: [],
  }
}

function TripSwitch() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate('/trips/22222222-2222-4222-8222-222222222222')}>Other trip</button>
}

function renderPlanner(strict = false) {
  const page = (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/trips/:id" element={<TripPlannerPage />} />
      </Routes>
    </>
  )
  return render(strict ? <React.StrictMode>{page}</React.StrictMode> : page, { initialEntries: [`/trips/${harness.tripId}`] })
}

describe('Family day timeline shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.outcome = 'direct'
    harness.hof = true
    harness.updateScheduleSortOrders.mockResolvedValue(undefined)
    harness.deleteTripReservation.mockResolvedValue(undefined)
    harness.upsertTripChangeDraftOp.mockResolvedValue({ draftId: 'draft-1', opId: 'op-1' })
    harness.listTripBookings.mockResolvedValue([booking()])
    harness.listTripTransports.mockResolvedValue([flight()])
    harness.listTripExpenses.mockResolvedValue([])
    harness.unlinkExpenseReservation.mockResolvedValue(undefined)
    harness.listTripFiles.mockResolvedValue([])
    vi.stubEnv('VITE_DATA_PLANE', '')
    server.use(http.all('/api/*', () => new HttpResponse(null, { status: 599 })))
    resetAllStores()
    seedStore(useAuthStore, {
      isAuthenticated: true, isLoading: false, personId: harness.personId, familyId: harness.familyId,
      membershipLoaded: true, membershipStatus: 'active', membershipRole: 'parent', authGate: 'ok',
    })
  })

  it('swaps only the adjacent schedule pair and restores it on undo', async () => {
    const user = userEvent.setup()
    renderPlanner()
    expect(await screen.findByRole('button', { name: 'Gap event' })).toBeInTheDocument()
    const card = screen.getByText('Harbor morning').closest('.dp-day-header')?.parentElement as HTMLElement
    const names = () => Array.from(card.querySelectorAll('span,button')).map(node => node.textContent?.trim() ?? '')
    const before = names()
    expect(before.indexOf('A')).toBeLessThan(before.indexOf('B'))
    expect(before.indexOf('B')).toBeLessThan(before.indexOf('Gap event'))
    expect(before.indexOf('Gap event')).toBeLessThan(before.indexOf('C'))
    const moveDown = screen.getByText('A').parentElement?.querySelector('button[aria-label="Move down"]') as HTMLButtonElement
    await user.click(moveDown)
    await waitFor(() => expect(harness.updateScheduleSortOrders).toHaveBeenCalledWith([
      { id: 'A', sortOrder: 1 },
      { id: 'B', sortOrder: 0 },
    ]))
    await waitFor(() => {
      const after = names()
      expect(after.indexOf('B')).toBeLessThan(after.indexOf('A'))
      expect(after.indexOf('A')).toBeLessThan(after.indexOf('Gap event'))
      expect(after.indexOf('Gap event')).toBeLessThan(after.indexOf('C'))
    })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(harness.updateScheduleSortOrders).toHaveBeenLastCalledWith([
      { id: 'A', sortOrder: 0 },
      { id: 'B', sortOrder: 1 },
    ]))
  })

  it('does not write when the neighbor is a reservation or the clocks would not move', async () => {
    const user = userEvent.setup()
    renderPlanner()
    await screen.findByText('Harbor morning')
    const down = screen.getByText('B').parentElement?.querySelector('button[aria-label="Move down"]') as HTMLButtonElement
    expect(down).toBeDisabled()
    await user.click(down)
    const earlyDown = screen.getByText('early').parentElement?.querySelector('button[aria-label="Move down"]') as HTMLButtonElement
    expect(earlyDown).toBeDisabled()
    expect(harness.updateScheduleSortOrders).not.toHaveBeenCalled()
    expect(harness.upsertTripChangeDraftOp).not.toHaveBeenCalled()
  })

  it('opens booking and transport details without writing', async () => {
    const user = userEvent.setup()
    renderPlanner()
    await user.click(await screen.findByRole('button', { name: 'Gap event' }))
    expect(await screen.findByRole('dialog', { name: 'Gap event' })).toBeInTheDocument()
    expect(harness.deleteTripReservation).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: /Night flight/ }))
    expect(await screen.findByRole('dialog', { name: /Night flight/ })).toBeInTheDocument()
  })

  it('hides edit and delete when reservation writes are denied', async () => {
    const user = userEvent.setup()
    harness.outcome = 'deny'
    harness.hof = false
    renderPlanner()
    await user.click(await screen.findByRole('button', { name: 'Gap event' }))
    const dialog = await screen.findByRole('dialog', { name: 'Gap event' })
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('shows an expense error instead of an empty cost list', async () => {
    const user = userEvent.setup()
    harness.listTripExpenses.mockRejectedValue(new Error('down'))
    renderPlanner()
    await user.click(await screen.findByRole('button', { name: 'Gap event' }))
    const dialog = await screen.findByRole('dialog', { name: 'Gap event' })
    expect(await screen.findByText('Error')).toBeInTheDocument()
    expect(dialog.textContent).not.toContain('None')
  })

  it('returns focus to the booking row after edit and delete under StrictMode', async () => {
    const user = userEvent.setup()
    renderPlanner(true)
    const row = await screen.findByRole('button', { name: 'Gap event' })
    await user.click(row)
    await user.click(within(await screen.findByRole('dialog', { name: 'Gap event' })).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByRole('dialog', { name: 'Edit Reservation' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(row).toHaveFocus())
    await user.click(row)
    await user.click(within(await screen.findByRole('dialog', { name: 'Gap event' })).getByRole('button', { name: 'Delete' }))
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(row).toHaveFocus())
    expect(harness.deleteTripReservation).not.toHaveBeenCalled()
  })

  it('reloads reservations when Plan is entered after Costs', async () => {
    const user = userEvent.setup()
    renderPlanner()
    await screen.findByRole('button', { name: 'Gap event' })
    const initial = harness.listTripBookings.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Book' }))
    await user.click(screen.getByRole('button', { name: 'Costs' }))
    await user.click(screen.getByTitle('Map'))
    await waitFor(() => expect(harness.listTripBookings.mock.calls.length).toBeGreaterThan(initial))
    await waitFor(() => expect(harness.listTripTransports.mock.calls.length).toBeGreaterThan(1))
  })

  it('reloads reservations on each return to Plan', async () => {
    const user = userEvent.setup()
    renderPlanner()
    await screen.findByRole('button', { name: 'Gap event' })
    for (let visit = 0; visit < 2; visit++) {
      await user.click(screen.getByRole('button', { name: 'Book' }))
      const bookingsBefore = harness.listTripBookings.mock.calls.length
      const transportsBefore = harness.listTripTransports.mock.calls.length
      await user.click(screen.getByTitle('Map'))
      await waitFor(() => {
        expect(harness.listTripBookings.mock.calls.length).toBe(bookingsBefore + 1)
        expect(harness.listTripTransports.mock.calls.length).toBe(transportsBefore + 1)
      })
    }
  })

  it('retries a failed reservation load and still shows the schedule', async () => {
    const user = userEvent.setup()
    harness.listTripBookings.mockReset()
    harness.listTripBookings.mockRejectedValueOnce(new Error('down'))
    harness.listTripBookings.mockResolvedValue([booking()])
    renderPlanner()
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gap event' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Gap event' })).toBeInTheDocument()
  })

  it('drops a reservation result that finishes after the trip changes', async () => {
    const user = userEvent.setup()
    const nextTrip = '22222222-2222-4222-8222-222222222222'
    let hangNext = false
    let releaseReload: (rows: FamilyTripReservation[]) => void = () => {}
    harness.listTripBookings.mockImplementation((id: string) => {
      if (id === nextTrip) {
        return Promise.resolve([{ ...booking(), id: 'new-stay', title: 'New stay', tripId: id }])
      }
      if (hangNext) {
        hangNext = false
        return new Promise<FamilyTripReservation[]>(resolve => { releaseReload = resolve })
      }
      return Promise.resolve([booking()])
    })
    render(
      <>
        <ToastContainer />
        <Routes>
          <Route path="/trips/:id" element={<TripPlannerPage />} />
        </Routes>
        <TripSwitch />
      </>,
      { initialEntries: [`/trips/${harness.tripId}`] },
    )
    await screen.findByRole('button', { name: 'Gap event' })
    await user.click(screen.getByRole('button', { name: 'Book' }))
    const beforeReturn = harness.listTripBookings.mock.calls.length
    hangNext = true
    await user.click(screen.getByTitle('Map'))
    await waitFor(() => expect(harness.listTripBookings.mock.calls.length).toBe(beforeReturn + 1))
    await user.click(screen.getByRole('button', { name: 'Other trip' }))
    releaseReload([{ ...booking(), title: 'Old stay' }])
    expect(await screen.findByRole('button', { name: 'New stay' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Old stay' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gap event' })).not.toBeInTheDocument()
  })

  it('removes a booking link from the open editor after unlink', async () => {
    const user = userEvent.setup()
    harness.listTripExpenses.mockResolvedValueOnce([fare('stay')]).mockResolvedValue([fare(null)])
    renderPlanner()
    await user.click(await screen.findByRole('button', { name: 'Gap event' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Gap event' })).getByRole('button', { name: 'Edit' }))
    const editor = await screen.findByRole('dialog', { name: 'Edit Reservation' })
    expect(within(editor).getByText('Night fare')).toBeInTheDocument()
    await user.click(within(editor).getByTitle('Remove expense'))
    await waitFor(() => expect(within(editor).queryByText('Night fare')).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Edit Reservation' })).toBeInTheDocument()
    expect(harness.unlinkExpenseReservation).toHaveBeenCalled()
  })

  it('removes a transport link from the open editor after unlink', async () => {
    const user = userEvent.setup()
    harness.listTripExpenses.mockResolvedValueOnce([fare('flight-1')]).mockResolvedValue([fare(null)])
    renderPlanner()
    await user.click(await screen.findByRole('button', { name: /Night flight/ }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Night flight' })).getByRole('button', { name: 'Edit' }))
    const editor = await screen.findByRole('dialog', { name: 'Edit transport' })
    expect(within(editor).getByText('Night fare')).toBeInTheDocument()
    await user.click(within(editor).getByTitle('Remove expense'))
    await waitFor(() => expect(within(editor).queryByText('Night fare')).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Edit transport' })).toBeInTheDocument()
  })

  it('keeps an unsaved transport draft when unlink refreshes the same reservation', async () => {
    const user = userEvent.setup()
    harness.listTripExpenses.mockResolvedValueOnce([fare('flight-1')]).mockResolvedValue([fare(null)])
    renderPlanner()
    await user.click(await screen.findByRole('button', { name: /Night flight/ }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Night flight' })).getByRole('button', { name: 'Edit' }))
    const editor = await screen.findByRole('dialog', { name: 'Edit transport' })
    const title = within(editor).getByPlaceholderText('e.g. Lufthansa LH123, Hotel Adlon, ...')
    const notes = within(editor).getByPlaceholderText('Additional notes...')
    expect(title).toHaveValue('Night flight')
    await user.clear(title)
    await user.type(title, 'Unsaved custom flight title')
    await user.type(notes, 'Gate note')
    const refreshesBefore = harness.listTripTransports.mock.calls.length
    await user.click(within(editor).getByTitle('Remove expense'))
    await waitFor(() => expect(harness.listTripTransports.mock.calls.length).toBeGreaterThan(refreshesBefore))
    await waitFor(() => expect(within(editor).queryByText('Night fare')).not.toBeInTheDocument())
    expect(title).toHaveValue('Unsaved custom flight title')
    expect(notes).toHaveValue('Gate note')
    expect(screen.getByRole('dialog', { name: 'Edit transport' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: /Night flight/ }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Night flight' })).getByRole('button', { name: 'Edit' }))
    const reopened = await screen.findByRole('dialog', { name: 'Edit transport' })
    expect(within(reopened).getByPlaceholderText('e.g. Lufthansa LH123, Hotel Adlon, ...')).toHaveValue('Night flight')
    expect(within(reopened).getByPlaceholderText('Additional notes...')).toHaveValue('')
  })
})

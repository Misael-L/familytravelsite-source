import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '../../../tests/helpers/render'
import { canDraftTripChanges, canMutateTrip } from '../../data/supabase/capabilities'
import { listTripActionOutcomes } from '../../data/supabase/familyPermissions'
import {
  fetchMySubmittedTripChangeRequests,
  fetchMyTripChangeDraft,
  fetchOpenTripChangeRequests,
  fetchTripChangeDraftOps,
  submitTripChangeRequest,
  upsertTripChangeDraftOp,
  withdrawTripChangeRequest,
} from '../../data/supabase/tripChangeRequests'
import { useFamilyTripWorkspaceGovernance } from './useFamilyTripWorkspaceGovernance'

vi.mock('../../data/supabase/capabilities', () => ({
  canMutateTrip: vi.fn(),
  canDraftTripChanges: vi.fn(),
}))

vi.mock('../../data/supabase/familyPermissions', () => ({
  listTripActionOutcomes: vi.fn(),
}))

vi.mock('../../data/supabase/tripChangeRequests', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripChangeRequests')>()
  return {
    ...actual,
    fetchMyTripChangeDraft: vi.fn(),
    fetchTripChangeDraftOps: vi.fn(),
    fetchOpenTripChangeRequests: vi.fn(),
    fetchMySubmittedTripChangeRequests: vi.fn(),
    upsertTripChangeDraftOp: vi.fn(),
    submitTripChangeRequest: vi.fn(),
    withdrawTripChangeRequest: vi.fn(),
  }
})

describe('useFamilyTripWorkspaceGovernance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(canMutateTrip).mockResolvedValue(false)
    vi.mocked(canDraftTripChanges).mockResolvedValue(true)
    vi.mocked(listTripActionOutcomes).mockResolvedValue({
      tripId: 'trip-1',
      familyId: 'fam-1',
      outcomes: {
        'trip.places.manage': 'propose',
        'trip.schedule.manage': 'propose',
        'trip.reservations.manage': 'propose',
        'trip.costs.manage': 'propose',
        'trip.packing.manage': 'deny',
      },
    })
    vi.mocked(fetchMyTripChangeDraft).mockResolvedValue(null)
    vi.mocked(fetchTripChangeDraftOps).mockResolvedValue([])
    vi.mocked(fetchOpenTripChangeRequests).mockResolvedValue([])
    vi.mocked(fetchMySubmittedTripChangeRequests).mockResolvedValue([])
  })

  it('derives nudge on published for a traveler who is not HOF', async () => {
    const { result } = renderHook(() => useFamilyTripWorkspaceGovernance({
      tripId: 'trip-1',
      personId: 'p1',
      enabled: true,
    }))
    await waitFor(() => expect(result.current.canDraft).toBe(true))
    expect(result.current.writeMode).toBe('nudge')
    expect(result.current.canUseEditors).toBe(false)
    expect(result.current.writeModeFor('trip.places.manage')).toBe('nudge')
    expect(result.current.writeModeFor('trip.packing.manage')).toBe('deny')
  })

  it('stages, proposes, and withdraws through the lifecycle RPCs', async () => {
    vi.mocked(fetchMyTripChangeDraft).mockResolvedValue({
      id: 'draft-1',
      tripId: 'trip-1',
      ownerPersonId: 'p1',
      title: null,
      notes: null,
      updatedAt: null,
    })
    vi.mocked(fetchTripChangeDraftOps).mockResolvedValue([{
      id: 'op-1',
      draftId: 'draft-1',
      module: 'trip_place',
      op: 'add',
      tripDayId: null,
      civilDate: null,
      targetTable: 'trip_places',
      targetId: null,
      payload: { schema_version: 1, place_id: 'pl-1' },
      sortOrder: 0,
      createdAt: null,
    }])
    vi.mocked(upsertTripChangeDraftOp).mockResolvedValue({ draftId: 'draft-1', opId: 'op-2' })
    vi.mocked(submitTripChangeRequest).mockResolvedValue({ requestId: 'req-1', opCount: 1, tripId: 'trip-1' })
    vi.mocked(withdrawTripChangeRequest).mockResolvedValue({ requestId: 'req-1', status: 'withdrawn' })

    const { result } = renderHook(() => useFamilyTripWorkspaceGovernance({
      tripId: 'trip-1',
      personId: 'p1',
      enabled: true,
    }))
    await waitFor(() => expect(result.current.draftOps).toHaveLength(1))

    result.current.setLayer('myDraft')
    await waitFor(() => expect(result.current.writeMode).toBe('draft'))

    await act(async () => {
      await result.current.addDraftOp({
        module: 'trip_place',
        op: 'add',
        payload: { schema_version: 1, place_id: 'pl-2' },
      })
    })
    expect(upsertTripChangeDraftOp).toHaveBeenCalledWith(expect.objectContaining({
      tripId: 'trip-1',
      module: 'trip_place',
      payload: { schema_version: 1, place_id: 'pl-2' },
    }))

    await act(async () => {
      await result.current.proposeDraftChanges('hello')
    })
    expect(submitTripChangeRequest).toHaveBeenCalledWith('draft-1', 'hello')
    await waitFor(() => expect(result.current.layer).toBe('published'))

    await act(async () => {
      await result.current.withdrawRequest('req-1')
    })
    expect(withdrawTripChangeRequest).toHaveBeenCalledWith('req-1')
  })
})

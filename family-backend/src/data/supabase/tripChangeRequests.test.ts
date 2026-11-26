import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  bookingDraftHasUnstagedFields,
  deleteTripChangeDraftOp,
  emptyChangePayload,
  expenseDraftHasBlockingUnstagedFields,
  fetchOpenTripChangeRequests,
  nextDraftSortOrder,
  payloadDayNote,
  payloadExpenseUpsert,
  payloadPlanItem,
  payloadReservationUpsert,
  payloadTripPlaceAdd,
  payloadTripPlaceRemove,
  payloadTripPlaceUpdateCategory,
  resolveTripChangeOp,
  resolveTripChangeRequest,
  submitTripChangeRequest,
  upsertTripChangeDraftOp,
  withdrawTripChangeRequest,
} from './tripChangeRequests'
import type { FamilyBookingDraft } from './tripReservations'
import type { TripExpenseDraft } from './tripExpenses'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

function thenable(result: { data: unknown; error: unknown }) {
  const t: Record<string, unknown> = {}
  const self = () => t
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle']) {
    t[m] = vi.fn(self)
  }
  t.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return t
}

function expenseDraft(partial: Partial<TripExpenseDraft> = {}): TripExpenseDraft {
  return {
    name: 'Dinner',
    category: 'food',
    totalAmount: 40,
    currencyCode: 'EUR',
    note: '',
    participantIds: ['a', 'b'],
    splitMode: 'equally',
    customAmounts: {},
    ticketLines: [],
    ...partial,
  }
}

function bookingDraft(partial: Partial<FamilyBookingDraft> = {}): FamilyBookingDraft {
  return {
    title: 'Hotel Erba',
    type: 'hotel',
    status: 'pending',
    ...partial,
  }
}

describe('change-request payloads', () => {
  it('emits schema_version 1 snake_case keys for every module', () => {
    expect(payloadPlanItem({
      activity: 'Duomo',
      placeId: 'pl-1',
      experienceId: 'ex-1',
      startsAt: '2026-08-12T00:00:00.000Z',
      sortOrder: 2,
    })).toMatchObject({
      schema_version: 1,
      activity: 'Duomo',
      place_id: 'pl-1',
      experience_id: 'ex-1',
      starts_at: '2026-08-12T00:00:00.000Z',
      sort_order: 2,
    })
    expect(payloadTripPlaceAdd('pl-9')).toEqual({
      schema_version: 1,
      place_id: 'pl-9',
      is_primary: false,
    })
    expect(payloadTripPlaceUpdateCategory('pl-9', 'cat-1')).toEqual({
      schema_version: 1,
      place_id: 'pl-9',
      family_place_category_id: 'cat-1',
    })
    expect(payloadTripPlaceUpdateCategory('pl-9', null)).toEqual({
      schema_version: 1,
      place_id: 'pl-9',
      clear_family_place_category: true,
    })
    expect(payloadTripPlaceUpdateCategory('pl-9', null)).not.toHaveProperty('is_primary')
    expect(payloadTripPlaceRemove('pl-9')).toEqual({
      schema_version: 1,
      place_id: 'pl-9',
    })
    expect(payloadDayNote({ body: 'Pack coats' })).toMatchObject({
      schema_version: 1,
      body: 'Pack coats',
      sort_order: 0,
    })
    expect(payloadReservationUpsert(bookingDraft({
      confirmationCode: 'ABC',
      notes: 'late',
      startTripDayId: 'd1',
      hotelId: 'h1',
    }))).toMatchObject({
      schema_version: 1,
      title: 'Hotel Erba',
      type: 'hotel',
      confirmation_code: 'ABC',
      notes: 'late',
      start_trip_day_id: 'd1',
      end_trip_day_id: 'd1',
      hotel_id: 'h1',
    })
    expect(payloadExpenseUpsert(expenseDraft({ expenseDate: '2026-08-12' }), 1.1)).toMatchObject({
      schema_version: 1,
      name: 'Dinner',
      category: 'food',
      total_amount: 40,
      currency_code: 'EUR',
      expense_date: '2026-08-12',
      exchange_rate: 1.1,
    })
    expect(emptyChangePayload()).toEqual({ schema_version: 1 })
  })

  it('uses the same snake_case keys as iOS TripChangeOpPayload CodingKeys', () => {
    const keys = Object.keys(payloadReservationUpsert(bookingDraft({
      confirmationCode: 'ABC',
      startTripDayId: 'd1',
      hotelId: 'h1',
    })))
    expect(keys).toEqual(expect.arrayContaining([
      'schema_version',
      'title',
      'type',
      'status',
      'start_trip_day_id',
      'end_trip_day_id',
      'starts_at',
      'ends_at',
      'confirmation_code',
      'notes',
      'url',
      'place_id',
      'hotel_id',
    ]))
    expect(keys.some(k => k.includes('-') || /[A-Z]/.test(k))).toBe(false)
    expect(Object.keys(payloadExpenseUpsert(expenseDraft(), 1))).toEqual(expect.arrayContaining([
      'schema_version', 'name', 'category', 'total_amount', 'currency_code', 'exchange_rate', 'expense_date', 'note',
    ]))
  })

  it('flags booking metadata / plan links and expense extras that apply-v1 cannot store', () => {
    expect(bookingDraftHasUnstagedFields(bookingDraft())).toBe(false)
    expect(bookingDraftHasUnstagedFields(bookingDraft({ metadata: { location: 'Como' } }))).toBe(true)
    expect(bookingDraftHasUnstagedFields(bookingDraft({ scheduleItemId: 'si-1' }))).toBe(true)
    expect(expenseDraftHasBlockingUnstagedFields(expenseDraft())).toBe(false)
    expect(expenseDraftHasBlockingUnstagedFields(expenseDraft({ splitMode: 'ticket', ticketLines: [{ id: 't', name: 'A', price: 10, personIds: ['a'] }] }))).toBe(true)
    expect(expenseDraftHasBlockingUnstagedFields(expenseDraft({ reservationId: 'r1' }))).toBe(true)
    expect(expenseDraftHasBlockingUnstagedFields(expenseDraft({ splitMode: 'custom', customAmounts: { a: 10 } }))).toBe(true)
  })

  it('assigns the next draft sort order after the current max', () => {
    expect(nextDraftSortOrder([])).toBe(0)
    expect(nextDraftSortOrder([{ sortOrder: 0 }, { sortOrder: 4 }])).toBe(5)
  })
})

describe('change-request RPCs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts a draft op with RPC param names and throws on error', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { draft_id: 'draft-1', op_id: 'op-1' },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    const payload = payloadTripPlaceAdd('pl-1')
    await expect(upsertTripChangeDraftOp({
      tripId: 'trip-1',
      module: 'trip_place',
      op: 'add',
      targetTable: 'trip_places',
      payload,
      sortOrder: 0,
    })).resolves.toEqual({ draftId: 'draft-1', opId: 'op-1' })
    expect(rpc).toHaveBeenCalledWith('upsert_trip_change_draft_op', expect.objectContaining({
      p_trip_id: 'trip-1',
      p_module: 'trip_place',
      p_op: 'add',
      p_target_table: 'trip_places',
      p_payload: payload,
      p_sort_order: 0,
    }))

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(upsertTripChangeDraftOp({
      tripId: 'trip-1',
      module: 'trip_place',
      op: 'add',
      payload,
    })).rejects.toMatchObject({ message: 'boom' })
  })

  it('submits, deletes, and resolves with the documented result shapes', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { request_id: 'req-1', op_count: 2, trip_id: 'trip-1' }, error: null })
      .mockResolvedValueOnce({ data: { deleted: true, op_id: 'op-2' }, error: null })
      .mockResolvedValueOnce({
        data: { op_id: 'op-3', status: 'rejected', error_code: 'apply_failed' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          request_id: 'req-1',
          results: [{ op_id: 'op-4', status: 'applied', published_id: 'row-1' }],
        },
        error: null,
      })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)

    await expect(submitTripChangeRequest('draft-1', '  tweaks  ')).resolves.toEqual({
      requestId: 'req-1',
      opCount: 2,
      tripId: 'trip-1',
    })
    expect(rpc).toHaveBeenNthCalledWith(1, 'submit_trip_change_request', {
      p_draft_id: 'draft-1',
      p_summary: 'tweaks',
    })

    await expect(deleteTripChangeDraftOp('op-2')).resolves.toEqual({ deleted: true, opId: 'op-2' })
    await expect(resolveTripChangeOp({ opId: 'op-3', accept: true })).resolves.toEqual({
      opId: 'op-3',
      status: 'rejected',
      publishedId: null,
      errorCode: 'apply_failed',
    })
    await expect(resolveTripChangeRequest({ requestId: 'req-1', acceptAll: true })).resolves.toEqual({
      requestId: 'req-1',
      results: [{ opId: 'op-4', status: 'applied', publishedId: 'row-1', errorCode: null }],
    })
    expect(rpc.mock.calls.map(c => c[0])).toEqual([
      'submit_trip_change_request',
      'delete_trip_change_draft_op',
      'resolve_trip_change_op',
      'resolve_trip_change_request',
    ])
  })

  it('withdraws with the documented RPC name and never exposes apply_v1', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { request_id: 'req-1', status: 'withdrawn' }, error: null })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    await expect(withdrawTripChangeRequest('req-1')).resolves.toEqual({ requestId: 'req-1', status: 'withdrawn' })
    expect(rpc).toHaveBeenCalledWith('withdraw_trip_change_request', { p_request_id: 'req-1' })
    expect(rpc.mock.calls.map(c => c[0]).join(',')).not.toMatch(/apply_trip_change_op/)
  })

  it('lists open requests with submitted and partially_applied only', async () => {
    const query = thenable({
      data: [{
        id: 'req-1',
        trip_id: 'trip-1',
        proposed_by_person_id: 'p1',
        status: 'submitted',
        summary: 'Places',
        submitted_at: '2026-08-20',
        resolved_at: null,
      }],
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from: vi.fn(() => query) } as never)
    const rows = await fetchOpenTripChangeRequests('trip-1')
    expect(query.in).toHaveBeenCalledWith('status', ['submitted', 'partially_applied'])
    expect(rows[0]).toMatchObject({ id: 'req-1', tripId: 'trip-1', proposedByPersonId: 'p1' })
  })
})

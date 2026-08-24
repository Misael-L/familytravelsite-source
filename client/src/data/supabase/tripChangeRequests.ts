/**
 * Workspace change-request adapters — consume FamilyTravelApp `trip_change_*`
 * RPCs. Do not call internal `apply_trip_change_op_v1`. Payload keys are
 * snake_case to match `apply_trip_change_op_v1` / iOS Codable.
 */
import { getSupabaseBrowserClient } from './client'
import type { CostCategory } from './tripExpenses'
import type { FamilyBookingDraft } from './tripReservations'
import type { TripExpenseDraft } from './tripExpenses'

export const TRIP_CHANGE_MODULES = [
  'plan_item',
  'day_note',
  'reservation',
  'expense',
  'trip_place',
] as const
export type TripChangeModule = (typeof TRIP_CHANGE_MODULES)[number]

export const TRIP_CHANGE_OP_KINDS = ['add', 'update', 'remove'] as const
export type TripChangeOpKind = (typeof TRIP_CHANGE_OP_KINDS)[number]

export const TRIP_CHANGE_REQUEST_STATUSES = [
  'submitted',
  'partially_applied',
  'applied',
  'rejected',
  'withdrawn',
] as const
export type TripChangeRequestStatus = (typeof TRIP_CHANGE_REQUEST_STATUSES)[number]

export const TRIP_CHANGE_OP_STATUSES = ['pending', 'applied', 'rejected', 'skipped'] as const
export type TripChangeOpStatus = (typeof TRIP_CHANGE_OP_STATUSES)[number]

export const OPEN_CHANGE_REQUEST_STATUSES = ['submitted', 'partially_applied'] as const

export type TripChangeOpPayload = {
  schema_version: 1
  activity?: string | null
  title?: string | null
  name?: string | null
  body?: string | null
  place_id?: string | null
  type?: string | null
  category?: string | null
  total_amount?: number | null
  currency_code?: string | null
  exchange_rate?: number | null
  expense_date?: string | null
  explanations?: string | null
  note?: string | null
  status?: string | null
  notes?: string | null
  confirmation_code?: string | null
  url?: string | null
  start_trip_day_id?: string | null
  end_trip_day_id?: string | null
  starts_at?: string | null
  ends_at?: string | null
  sort_order?: number | null
  experience_id?: string | null
  food_id?: string | null
  hotel_id?: string | null
  is_primary?: boolean | null
  icon?: string | null
  family_place_category_id?: string | null
  clear_family_place_category?: boolean
}

export type UpsertTripChangeDraftOpInput = {
  tripId: string
  opId?: string | null
  module: TripChangeModule
  op: TripChangeOpKind
  tripDayId?: string | null
  civilDate?: string | null
  targetTable?: string | null
  targetId?: string | null
  payload: TripChangeOpPayload
  sortOrder?: number
}

export type UpsertTripChangeDraftOpResult = {
  draftId: string
  opId: string
}

export type SubmitTripChangeRequestResult = {
  requestId: string
  opCount: number
  tripId: string
}

export type WithdrawTripChangeRequestResult = {
  requestId: string
  status: 'withdrawn'
}

export type ResolveTripChangeOpResult = {
  opId: string
  status: string
  publishedId?: string | null
  errorCode?: string | null
}

export type ResolveTripChangeRequestResult = {
  requestId: string
  results: ResolveTripChangeOpResult[]
}

export type TripChangeDraftRow = {
  id: string
  tripId: string
  ownerPersonId: string
  title: string | null
  notes: string | null
  updatedAt: string | null
}

export type TripChangeDraftOpRow = {
  id: string
  draftId: string
  module: TripChangeModule
  op: TripChangeOpKind
  tripDayId: string | null
  civilDate: string | null
  targetTable: string | null
  targetId: string | null
  payload: TripChangeOpPayload
  sortOrder: number
  createdAt: string | null
}

export type TripChangeRequestRow = {
  id: string
  tripId: string
  proposedByPersonId: string
  status: TripChangeRequestStatus
  summary: string | null
  submittedAt: string | null
  resolvedAt: string | null
}

export type TripChangeRequestOpRow = {
  id: string
  requestId: string
  module: TripChangeModule
  op: TripChangeOpKind
  tripDayId: string | null
  civilDate: string | null
  targetTable: string | null
  targetId: string | null
  payload: TripChangeOpPayload
  sortOrder: number
  status: TripChangeOpStatus
  hofNote: string | null
  errorCode: string | null
  createdAt: string | null
}

export function emptyChangePayload(): TripChangeOpPayload {
  return { schema_version: 1 }
}

export function payloadPlanItem(opts: {
  activity: string
  placeId?: string | null
  experienceId?: string | null
  foodId?: string | null
  startsAt?: string | null
  endsAt?: string | null
  sortOrder?: number | null
  explanations?: string | null
}): TripChangeOpPayload {
  return {
    schema_version: 1,
    activity: opts.activity,
    place_id: opts.placeId ?? null,
    experience_id: opts.experienceId ?? null,
    food_id: opts.foodId ?? null,
    starts_at: opts.startsAt ?? null,
    ends_at: opts.endsAt ?? null,
    sort_order: opts.sortOrder ?? null,
    explanations: opts.explanations ?? null,
  }
}

export function payloadTripPlaceAdd(placeId: string, isPrimary = false): TripChangeOpPayload {
  return { schema_version: 1, place_id: placeId, is_primary: isPrimary }
}

export function payloadTripPlaceRemove(placeId: string): TripChangeOpPayload {
  return { schema_version: 1, place_id: placeId }
}

/** Category-only patch. Omits is_primary so apply does not reset the primary flag. */
export function payloadTripPlaceUpdateCategory(
  placeId: string,
  familyPlaceCategoryId: string | null,
): TripChangeOpPayload {
  if (familyPlaceCategoryId) {
    return {
      schema_version: 1,
      place_id: placeId,
      family_place_category_id: familyPlaceCategoryId,
    }
  }
  return {
    schema_version: 1,
    place_id: placeId,
    clear_family_place_category: true,
  }
}

export function payloadDayNote(opts: {
  body: string
  icon?: string | null
  sortOrder?: number | null
}): TripChangeOpPayload {
  return {
    schema_version: 1,
    body: opts.body,
    icon: opts.icon ?? null,
    sort_order: opts.sortOrder ?? 0,
  }
}

export function payloadReservationUpsert(draft: FamilyBookingDraft): TripChangeOpPayload {
  const title = draft.title.trim()
  const conf = (draft.confirmationCode ?? '').trim()
  const notes = (draft.notes ?? '').trim()
  const url = (draft.url ?? '').trim()
  return {
    schema_version: 1,
    title: title || null,
    type: draft.type,
    status: draft.status,
    start_trip_day_id: draft.startTripDayId ?? null,
    end_trip_day_id: draft.endTripDayId ?? draft.startTripDayId ?? null,
    starts_at: draft.startsAt ?? null,
    ends_at: draft.endsAt ?? null,
    confirmation_code: conf,
    notes,
    url,
    place_id: draft.placeId ?? null,
    hotel_id: draft.hotelId ?? null,
  }
}

export function payloadExpenseUpsert(draft: TripExpenseDraft, exchangeRate?: number | null): TripChangeOpPayload {
  return {
    schema_version: 1,
    name: draft.name.trim(),
    category: draft.category,
    total_amount: draft.totalAmount,
    currency_code: draft.currencyCode,
    exchange_rate: exchangeRate ?? 1,
    expense_date: draft.expenseDate ?? null,
    note: draft.note || null,
  }
}

export function payloadRemoveMarker(): TripChangeOpPayload {
  return { schema_version: 1 }
}

export function bookingDraftHasUnstagedFields(draft: FamilyBookingDraft): boolean {
  const meta = draft.metadata ?? {}
  return Boolean(draft.scheduleItemId) || Object.keys(meta).some(k => Boolean(meta[k]?.trim()))
}

export function expenseDraftHasBlockingUnstagedFields(draft: TripExpenseDraft): boolean {
  if (draft.reservationId) return true
  if (draft.splitMode === 'ticket' || draft.splitMode === 'custom') return true
  if (draft.ticketLines.length > 0) return true
  return Object.values(draft.customAmounts).some(v => Number.isFinite(v) && v > 0)
}

export function nextDraftSortOrder(ops: Array<{ sortOrder: number }>): number {
  if (ops.length === 0) return 0
  return Math.max(...ops.map(o => o.sortOrder)) + 1
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function asPayload(raw: unknown): TripChangeOpPayload {
  if (!raw || typeof raw !== 'object') return emptyChangePayload()
  const row = raw as Record<string, unknown>
  const version = Number(row.schema_version)
  return {
    schema_version: version === 1 ? 1 : 1,
    activity: asString(row.activity),
    title: asString(row.title),
    name: asString(row.name),
    body: typeof row.body === 'string' ? row.body : null,
    place_id: asString(row.place_id),
    type: asString(row.type),
    category: asString(row.category) as CostCategory | string | null,
    total_amount: typeof row.total_amount === 'number' ? row.total_amount : Number(row.total_amount) || null,
    currency_code: asString(row.currency_code),
    exchange_rate: typeof row.exchange_rate === 'number' ? row.exchange_rate : null,
    expense_date: asString(row.expense_date),
    explanations: asString(row.explanations),
    note: asString(row.note),
    status: asString(row.status),
    notes: typeof row.notes === 'string' ? row.notes : null,
    confirmation_code: asString(row.confirmation_code),
    url: asString(row.url),
    start_trip_day_id: asString(row.start_trip_day_id),
    end_trip_day_id: asString(row.end_trip_day_id),
    starts_at: asString(row.starts_at),
    ends_at: asString(row.ends_at),
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : null,
    experience_id: asString(row.experience_id),
    food_id: asString(row.food_id),
    hotel_id: asString(row.hotel_id),
    is_primary: typeof row.is_primary === 'boolean' ? row.is_primary : null,
    icon: asString(row.icon),
  }
}

function mapDraft(row: {
  id: string
  trip_id: string
  owner_person_id: string
  title: string | null
  notes: string | null
  updated_at: string | null
}): TripChangeDraftRow {
  return {
    id: row.id,
    tripId: row.trip_id,
    ownerPersonId: row.owner_person_id,
    title: row.title,
    notes: row.notes,
    updatedAt: row.updated_at,
  }
}

function mapDraftOp(row: {
  id: string
  draft_id: string
  module: TripChangeModule
  op: TripChangeOpKind
  trip_day_id: string | null
  civil_date: string | null
  target_table: string | null
  target_id: string | null
  payload: unknown
  sort_order: number | null
  created_at: string | null
}): TripChangeDraftOpRow {
  return {
    id: row.id,
    draftId: row.draft_id,
    module: row.module,
    op: row.op,
    tripDayId: row.trip_day_id,
    civilDate: row.civil_date,
    targetTable: row.target_table,
    targetId: row.target_id,
    payload: asPayload(row.payload),
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  }
}

function mapRequest(row: {
  id: string
  trip_id: string
  proposed_by_person_id: string
  status: TripChangeRequestStatus
  summary: string | null
  submitted_at: string | null
  resolved_at: string | null
}): TripChangeRequestRow {
  return {
    id: row.id,
    tripId: row.trip_id,
    proposedByPersonId: row.proposed_by_person_id,
    status: row.status,
    summary: row.summary,
    submittedAt: row.submitted_at,
    resolvedAt: row.resolved_at,
  }
}

function mapRequestOp(row: {
  id: string
  request_id: string
  module: TripChangeModule
  op: TripChangeOpKind
  trip_day_id: string | null
  civil_date: string | null
  target_table: string | null
  target_id: string | null
  payload: unknown
  sort_order: number | null
  status: TripChangeOpStatus
  hof_note: string | null
  error_code: string | null
  created_at: string | null
}): TripChangeRequestOpRow {
  return {
    id: row.id,
    requestId: row.request_id,
    module: row.module,
    op: row.op,
    tripDayId: row.trip_day_id,
    civilDate: row.civil_date,
    targetTable: row.target_table,
    targetId: row.target_id,
    payload: asPayload(row.payload),
    sortOrder: row.sort_order ?? 0,
    status: row.status,
    hofNote: row.hof_note,
    errorCode: row.error_code,
    createdAt: row.created_at,
  }
}

function mapResolveOp(raw: unknown): ResolveTripChangeOpResult {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    opId: String(row.op_id ?? ''),
    status: String(row.status ?? ''),
    publishedId: row.published_id == null ? null : String(row.published_id),
    errorCode: row.error_code == null ? null : String(row.error_code),
  }
}

export async function ensureTripChangeDraft(tripId: string): Promise<string> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('ensure_trip_change_draft', { p_trip_id: tripId })
  if (error) throw error
  if (!data) throw new Error('ensure_trip_change_draft returned no id')
  return String(data)
}

export async function upsertTripChangeDraftOp(
  input: UpsertTripChangeDraftOpInput,
): Promise<UpsertTripChangeDraftOpResult> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('upsert_trip_change_draft_op', {
      p_trip_id: input.tripId,
      p_op_id: input.opId ?? null,
      p_module: input.module,
      p_op: input.op,
      p_trip_day_id: input.tripDayId ?? null,
      p_civil_date: input.civilDate ?? null,
      p_target_table: input.targetTable ?? null,
      p_target_id: input.targetId ?? null,
      p_payload: input.payload,
      p_sort_order: input.sortOrder ?? 0,
    })
  if (error) throw error
  const row = (data ?? {}) as { draft_id?: string; op_id?: string }
  if (!row.draft_id || !row.op_id) throw new Error('upsert_trip_change_draft_op returned an incomplete result')
  return { draftId: row.draft_id, opId: row.op_id }
}

export async function deleteTripChangeDraftOp(opId: string): Promise<{ deleted: true; opId: string }> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('delete_trip_change_draft_op', { p_op_id: opId })
  if (error) throw error
  const row = (data ?? {}) as { deleted?: boolean; op_id?: string }
  return { deleted: true, opId: row.op_id ?? opId }
}

export async function submitTripChangeRequest(
  draftId: string,
  summary?: string | null,
): Promise<SubmitTripChangeRequestResult> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('submit_trip_change_request', {
      p_draft_id: draftId,
      p_summary: summary?.trim() ? summary.trim() : null,
    })
  if (error) throw error
  const row = (data ?? {}) as { request_id?: string; op_count?: number; trip_id?: string }
  if (!row.request_id || !row.trip_id) throw new Error('submit_trip_change_request returned an incomplete result')
  return {
    requestId: row.request_id,
    opCount: Number(row.op_count ?? 0),
    tripId: row.trip_id,
  }
}

export async function withdrawTripChangeRequest(requestId: string): Promise<WithdrawTripChangeRequestResult> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('withdraw_trip_change_request', { p_request_id: requestId })
  if (error) throw error
  const row = (data ?? {}) as { request_id?: string; status?: string }
  return { requestId: row.request_id ?? requestId, status: 'withdrawn' }
}

export async function resolveTripChangeOp(opts: {
  opId: string
  accept: boolean
  note?: string | null
}): Promise<ResolveTripChangeOpResult> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('resolve_trip_change_op', {
      p_op_id: opts.opId,
      p_accept: opts.accept,
      p_note: opts.note ?? null,
    })
  if (error) throw error
  return mapResolveOp(data)
}

export async function resolveTripChangeRequest(opts: {
  requestId: string
  acceptAll: boolean
}): Promise<ResolveTripChangeRequestResult> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('resolve_trip_change_request', {
      p_request_id: opts.requestId,
      p_accept_all: opts.acceptAll,
    })
  if (error) throw error
  const row = (data ?? {}) as { request_id?: string; results?: unknown }
  const results = Array.isArray(row.results) ? row.results.map(mapResolveOp) : []
  return { requestId: row.request_id ?? opts.requestId, results }
}

export async function fetchMyTripChangeDraft(
  tripId: string,
  ownerPersonId: string,
): Promise<TripChangeDraftRow | null> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_change_drafts')
    .select('id,trip_id,owner_person_id,title,notes,updated_at')
    .eq('trip_id', tripId)
    .eq('owner_person_id', ownerPersonId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? mapDraft(data as never) : null
}

export async function fetchTripChangeDraftOps(draftId: string): Promise<TripChangeDraftOpRow[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_change_draft_ops')
    .select('id,draft_id,module,op,trip_day_id,civil_date,target_table,target_id,payload,sort_order,created_at')
    .eq('draft_id', draftId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return ((data ?? []) as never[]).map(mapDraftOp)
}

export async function fetchOpenTripChangeRequests(tripId: string): Promise<TripChangeRequestRow[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_change_requests')
    .select('id,trip_id,proposed_by_person_id,status,summary,submitted_at,resolved_at')
    .eq('trip_id', tripId)
    .in('status', [...OPEN_CHANGE_REQUEST_STATUSES])
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as never[]).map(mapRequest)
}

export async function fetchMySubmittedTripChangeRequests(
  tripId: string,
  personId: string,
): Promise<TripChangeRequestRow[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_change_requests')
    .select('id,trip_id,proposed_by_person_id,status,summary,submitted_at,resolved_at')
    .eq('trip_id', tripId)
    .eq('proposed_by_person_id', personId)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as never[]).map(mapRequest)
}

export async function fetchTripChangeRequestOps(requestId: string): Promise<TripChangeRequestOpRow[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_change_request_ops')
    .select('id,request_id,module,op,trip_day_id,civil_date,target_table,target_id,payload,sort_order,status,hof_note,error_code,created_at')
    .eq('request_id', requestId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return ((data ?? []) as never[]).map(mapRequestOp)
}

export function draftOpSummary(op: Pick<TripChangeDraftOpRow, 'module' | 'op' | 'payload'>): string {
  const p = op.payload
  return p.activity || p.title || p.name || p.body || p.place_id || op.module
}

export function targetTableForModule(module: TripChangeModule): string {
  switch (module) {
    case 'plan_item': return 'schedule_items'
    case 'day_note': return 'day_notes'
    case 'reservation': return 'trip_reservations'
    case 'expense': return 'trip_expenses'
    case 'trip_place': return 'trip_places'
  }
}

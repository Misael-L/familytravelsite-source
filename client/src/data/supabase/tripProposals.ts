import { getSupabaseBrowserClient } from './client'

export const TRIP_OCCASIONS = ['trip', 'vacation', 'weekend', 'other'] as const
export type TripOccasion = (typeof TRIP_OCCASIONS)[number]

const CIVIL = /^\d{4}-\d{2}-\d{2}$/

export type CreateTripProposalInput = {
  familyId: string
  title: string
  notes: string | null
  startDate: string
  endDate: string
  dayCount: number
  countryIds: string[]
  placeIds: string[]
  travelerPersonIds: string[]
  primaryCountryId: string | null
  occasion: TripOccasion
  coverUrl: string | null
  reminderDays: number
}

export type CreateTripProposalResult = {
  proposalId: string
  tripId: string
}

export type CreateTripProposalRpcArgs = {
  p_family_id: string
  p_title: string
  p_notes: string | null
  p_start_at: string
  p_end_at: string
  p_country_ids: string[]
  p_place_ids: string[]
  p_traveler_person_ids: string[]
  p_primary_country_id: string
  p_occasion: TripOccasion
  p_cover_url: string | null
  p_reminder_days: number
}

export type ProposalValidationError = 'title' | 'dates' | 'countries'

export type UpdateTripProposalInput = Omit<CreateTripProposalInput, 'familyId'> & {
  proposalId: string
}

export type UpdateTripProposalRpcArgs = {
  p_proposal_id: string
  p_title: string
  p_notes: string | null
  p_start_at: string
  p_end_at: string
  p_country_ids: string[]
  p_place_ids: string[]
  p_traveler_person_ids: string[]
  p_primary_country_id: string
  p_occasion: TripOccasion
  p_cover_url: string | null
  p_reminder_days: number
}

export type OpenTripProposal = {
  proposalId: string
  tripId: string
  proposedByPersonId: string
  status: string
  title: string
}

export type OpenHubProposal = {
  proposalId: string
  proposedByPersonId: string
}

export type HubPencilAction =
  | { kind: 'edit'; proposalId: string }
  | { kind: 'vote'; proposalId: string }
  | { kind: 'published' }

export type TripProposalEditSource = {
  tripId: string
  title: string
  notes: string | null
  startDate: string
  endDate: string
  coverUrl: string | null
  occasion: TripOccasion
  reminderDays: number
  primaryCountryId: string | null
  countryIds: string[]
  placeIds: string[]
  travelerPersonIds: string[]
}

export function civilToTimestamptz(civil: string): string {
  return `${civil}T00:00:00.000Z`
}

export function addCivilDays(civil: string, days: number): string {
  const d = new Date(`${civil}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function todayCivilUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Start/end as UTC midnight timestamptz, matching hub `toDateOnly`. */
export function resolveProposalDates(opts: {
  startDate: string
  endDate: string
  dayCount: number
  now?: Date
}): { startAt: string; endAt: string } | null {
  const start = opts.startDate.trim()
  const end = opts.endDate.trim()
  if (start && end) {
    if (!CIVIL.test(start) || !CIVIL.test(end) || end < start) return null
    return { startAt: civilToTimestamptz(start), endAt: civilToTimestamptz(end) }
  }
  const n = Math.floor(Number(opts.dayCount))
  if (!Number.isInteger(n) || n < 1 || n > 365) return null
  const s = CIVIL.test(start) ? start : todayCivilUtc(opts.now)
  const e = addCivilDays(s, n - 1)
  return { startAt: civilToTimestamptz(s), endAt: civilToTimestamptz(e) }
}

export function canAdvanceFromBasics(title: string, dates: { startAt: string; endAt: string } | null): boolean {
  return title.trim().length > 0 && dates != null
}

export function clampReminderDays(value: number): number {
  if (!Number.isFinite(value)) return 3
  return Math.max(0, Math.min(30, Math.floor(value)))
}

export function normalizeOccasion(value: string): TripOccasion {
  return (TRIP_OCCASIONS as readonly string[]).includes(value) ? (value as TripOccasion) : 'trip'
}

type ProposalFieldArgs = Omit<CreateTripProposalRpcArgs, 'p_family_id'>

function buildProposalFieldArgs(
  input: Omit<CreateTripProposalInput, 'familyId'>,
  now?: Date,
): { ok: true; fields: ProposalFieldArgs } | { ok: false; error: ProposalValidationError } {
  const title = input.title.trim()
  if (!title) return { ok: false, error: 'title' }
  const dates = resolveProposalDates({
    startDate: input.startDate,
    endDate: input.endDate,
    dayCount: input.dayCount,
    now,
  })
  if (!dates) return { ok: false, error: 'dates' }
  if (input.countryIds.length === 0) return { ok: false, error: 'countries' }
  const primary = input.primaryCountryId || input.countryIds[0]
  const notes = input.notes?.trim() || null
  return {
    ok: true,
    fields: {
      p_title: title,
      p_notes: notes,
      p_start_at: dates.startAt,
      p_end_at: dates.endAt,
      p_country_ids: input.countryIds,
      p_place_ids: input.placeIds,
      p_traveler_person_ids: input.travelerPersonIds,
      p_primary_country_id: primary,
      p_occasion: normalizeOccasion(input.occasion),
      p_cover_url: input.coverUrl?.trim() || null,
      p_reminder_days: clampReminderDays(input.reminderDays),
    },
  }
}

export function buildCreateTripProposalRpcArgs(
  input: CreateTripProposalInput,
  now?: Date,
): { ok: true; args: CreateTripProposalRpcArgs } | { ok: false; error: ProposalValidationError } {
  const built = buildProposalFieldArgs(input, now)
  if (built.ok === false) return built
  return { ok: true, args: { p_family_id: input.familyId, ...built.fields } }
}

export function buildUpdateTripProposalRpcArgs(
  input: UpdateTripProposalInput,
  now?: Date,
): { ok: true; args: UpdateTripProposalRpcArgs } | { ok: false; error: ProposalValidationError } {
  const built = buildProposalFieldArgs(input, now)
  if (built.ok === false) return built
  return { ok: true, args: { p_proposal_id: input.proposalId, ...built.fields } }
}

/** YYYY-MM-DD from timestamptz / date string. */
export function civilFromIso(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

export function inclusiveDayCount(startCivil: string, endCivil: string): number {
  const a = Date.parse(`${startCivil}T00:00:00.000Z`)
  const b = Date.parse(`${endCivil}T00:00:00.000Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 7
  return Math.round((b - a) / 86400000) + 1
}

export function indexOpenProposalsByTripId(rows: OpenTripProposal[]): Record<string, OpenHubProposal> {
  const map: Record<string, OpenHubProposal> = {}
  for (const row of rows) {
    if (!row.tripId || map[row.tripId]) continue
    map[row.tripId] = { proposalId: row.proposalId, proposedByPersonId: row.proposedByPersonId }
  }
  return map
}

export function hubPencilAction(
  tripId: string,
  personId: string | null | undefined,
  openByTripId: Record<string, OpenHubProposal>,
): HubPencilAction {
  const open = openByTripId[tripId]
  if (!open) return { kind: 'published' }
  if (personId && open.proposedByPersonId === personId) {
    return { kind: 'edit', proposalId: open.proposalId }
  }
  return { kind: 'vote', proposalId: open.proposalId }
}

function parseRpcResult(raw: unknown): CreateTripProposalResult {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const proposalId = typeof row.proposal_id === 'string' ? row.proposal_id : ''
  const tripId = typeof row.trip_id === 'string' ? row.trip_id : ''
  if (!proposalId || !tripId) throw new Error('Trip proposal RPC returned an incomplete payload')
  return { proposalId, tripId }
}

function throwValidation(error: ProposalValidationError): never {
  const err = new Error(error)
  err.name = 'ProposalValidationError'
  throw err
}

export async function createTripProposal(input: CreateTripProposalInput): Promise<CreateTripProposalResult> {
  const built = buildCreateTripProposalRpcArgs(input)
  if (built.ok === false) throwValidation(built.error)
  const { data, error } = await getSupabaseBrowserClient().rpc('create_trip_proposal', built.args)
  if (error) throw error
  return parseRpcResult(data)
}

/** Hub Duplicate: copy source hub envelope into a new submitted proposal. */
export async function duplicateTrip(sourceTripId: string): Promise<CreateTripProposalResult> {
  const { data, error } = await getSupabaseBrowserClient().rpc('duplicate_trip', {
    p_source_trip_id: sourceTripId,
  })
  if (error) throw error
  return parseRpcResult(data)
}

export async function updateTripProposal(input: UpdateTripProposalInput): Promise<CreateTripProposalResult> {
  const built = buildUpdateTripProposalRpcArgs(input)
  if (built.ok === false) throwValidation(built.error)
  const { data, error } = await getSupabaseBrowserClient().rpc('update_trip_proposal', built.args)
  if (error) throw error
  return parseRpcResult(data)
}

type OpenProposalRow = {
  id: string
  title: string | null
  proposed_by_person_id: string | null
  target_trip_id: string | null
  status: string | null
}

function mapOpenProposal(r: OpenProposalRow): OpenTripProposal | null {
  if (!r.id || !r.target_trip_id || !r.proposed_by_person_id) return null
  return {
    proposalId: r.id,
    tripId: r.target_trip_id,
    proposedByPersonId: r.proposed_by_person_id,
    status: r.status ?? 'submitted',
    title: r.title?.trim() || 'Untitled trip',
  }
}

const OPEN_PROPOSAL_SELECT = 'id,family_id,title,proposal_type,proposed_by_person_id,target_trip_id,status,submitted_at,decision_at,decision_summary,created_at'

/** iOS `fetchOpenProposals`: trip proposals still `submitted` or `in_review`. */
export async function listOpenTripProposals(familyId: string): Promise<OpenTripProposal[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('proposals')
    .select(OPEN_PROPOSAL_SELECT)
    .eq('family_id', familyId)
    .eq('proposal_type', 'trip')
    .in('status', ['submitted', 'in_review'])
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as OpenProposalRow[]).map(mapOpenProposal).filter((r): r is OpenTripProposal => r != null)
}

export async function fetchTripProposal(proposalId: string): Promise<OpenTripProposal | null> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('proposals')
    .select(OPEN_PROPOSAL_SELECT)
    .eq('id', proposalId)
    .maybeSingle()
  if (error) throw error
  return data ? mapOpenProposal(data as OpenProposalRow) : null
}

type TripEditRow = {
  id: string
  name: string | null
  start_at: string | null
  end_at: string | null
  notes: string | null
  cover_url: string | null
  occasion: string | null
  reminder_days: number | null
  primary_country_id: string | null
}

/** iOS `fetchTripProposalEditSource`: trip fields + country/place/traveler ids. */
export async function fetchTripProposalEditSource(tripId: string): Promise<TripProposalEditSource | null> {
  const sb = getSupabaseBrowserClient()
  const { data: trip, error: tripErr } = await sb
    .from('trips')
    .select('id,name,start_at,end_at,notes,cover_url,occasion,reminder_days,primary_country_id')
    .eq('id', tripId)
    .maybeSingle()
  if (tripErr) throw tripErr
  if (!trip) return null

  const [{ data: countries, error: countryErr }, { data: places, error: placeErr }, { data: travelers, error: travelerErr }] = await Promise.all([
    sb.from('trip_countries').select('country_id').eq('trip_id', tripId),
    sb.from('trip_places').select('place_id').eq('trip_id', tripId),
    sb.from('trip_travelers').select('person_id').eq('trip_id', tripId),
  ])
  if (countryErr) throw countryErr
  if (placeErr) throw placeErr
  if (travelerErr) throw travelerErr

  const row = trip as TripEditRow
  return {
    tripId: row.id,
    title: row.name?.trim() || '',
    notes: row.notes,
    startDate: civilFromIso(row.start_at),
    endDate: civilFromIso(row.end_at),
    coverUrl: row.cover_url,
    occasion: normalizeOccasion(row.occasion ?? 'trip'),
    reminderDays: clampReminderDays(row.reminder_days ?? 3),
    primaryCountryId: row.primary_country_id,
    countryIds: ((countries ?? []) as { country_id: string | null }[])
      .map(r => r.country_id)
      .filter((id): id is string => Boolean(id)),
    placeIds: ((places ?? []) as { place_id: string | null }[])
      .map(r => r.place_id)
      .filter((id): id is string => Boolean(id)),
    travelerPersonIds: ((travelers ?? []) as { person_id: string | null }[])
      .map(r => r.person_id)
      .filter((id): id is string => Boolean(id)),
  }
}

export const VOTE_CHOICES = ['yes', 'no', 'abstain'] as const
export type VoteChoice = (typeof VOTE_CHOICES)[number]
export type VoteRole = 'deciding' | 'advisory'

export type CastProposalVoteRpcArgs = {
  p_proposal_id: string
  p_vote: VoteChoice
}

export type DecideTripProposalRpcArgs = {
  p_proposal_id: string
  p_accept: boolean
  p_decision_summary: string | null
  p_confirm_advisory_all_no: boolean
}

export type EscalateTripProposalRpcArgs = {
  p_proposal_id: string
  p_branch_ids: string[]
  p_person_ids: string[]
  p_note: string | null
}

export type ProposalVote = {
  id: string
  voterPersonId: string
  voterName: string
  vote: VoteChoice
  voteRole: VoteRole
}

export type EligibleVoter = {
  personId: string
  voteRole: VoteRole
}

export type ProposalTally = {
  decidingYes: number
  decidingNo: number
  decidingAbstain: number
  decidingEligible: number
  decidingNeed: number
  majorityYes: boolean
  decided: number
  advisoryYes: number
  advisoryNo: number
  advisoryAbstain: number
}

export function isVoteChoice(value: string): value is VoteChoice {
  return (VOTE_CHOICES as readonly string[]).includes(value)
}

export function normalizeVoteRole(value: string | null | undefined): VoteRole {
  return value === 'advisory' ? 'advisory' : 'deciding'
}

export function buildCastProposalVoteRpcArgs(proposalId: string, vote: VoteChoice): CastProposalVoteRpcArgs {
  return { p_proposal_id: proposalId, p_vote: vote }
}

export function buildDecideTripProposalRpcArgs(opts: {
  proposalId: string
  accept: boolean
  summary?: string | null
  confirmAdvisoryAllNo?: boolean
}): DecideTripProposalRpcArgs {
  return {
    p_proposal_id: opts.proposalId,
    p_accept: opts.accept,
    p_decision_summary: opts.summary ?? (opts.accept ? 'Approved by reviewer' : 'Rejected by reviewer'),
    p_confirm_advisory_all_no: opts.confirmAdvisoryAllNo === true,
  }
}

export function buildEscalateTripProposalRpcArgs(opts: {
  proposalId: string
  branchIds: string[]
  personIds: string[]
  note?: string | null
}): EscalateTripProposalRpcArgs {
  const note = opts.note?.trim() || null
  return {
    p_proposal_id: opts.proposalId,
    p_branch_ids: opts.branchIds,
    p_person_ids: opts.personIds,
    p_note: note,
  }
}

export function isAdvisoryAllNoConfirmRequired(err: unknown): boolean {
  const message =
    err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
      ? (err as { message: string }).message
      : err instanceof Error
        ? err.message
        : ''
  return message.includes('advisory_all_no_confirm_required')
}

export function tallyProposalVotes(votes: ProposalVote[], eligible: EligibleVoter[]): ProposalTally {
  const deciding = votes.filter(v => v.voteRole === 'deciding')
  const advisory = votes.filter(v => v.voteRole === 'advisory')
  const decidingYes = deciding.filter(v => v.vote === 'yes').length
  const decidingNo = deciding.filter(v => v.vote === 'no').length
  const decidingAbstain = deciding.filter(v => v.vote === 'abstain').length
  const decidingEligible = eligible.filter(v => v.voteRole === 'deciding').length
  const decidingNeed = Math.max(1, Math.floor(decidingEligible / 2) + 1)
  return {
    decidingYes,
    decidingNo,
    decidingAbstain,
    decidingEligible,
    decidingNeed,
    majorityYes: decidingEligible > 0 && decidingYes > decidingNo && decidingYes >= decidingNeed,
    decided: decidingYes + decidingNo,
    advisoryYes: advisory.filter(v => v.vote === 'yes').length,
    advisoryNo: advisory.filter(v => v.vote === 'no').length,
    advisoryAbstain: advisory.filter(v => v.vote === 'abstain').length,
  }
}

async function rpcBool(name: string, args: Record<string, string>): Promise<boolean> {
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args)
  if (error) throw error
  return data === true
}

export async function canDecideProposal(proposalId: string): Promise<boolean> {
  return rpcBool('can_decide_proposal', { p_proposal_id: proposalId })
}

export async function canEscalateProposal(proposalId: string): Promise<boolean> {
  return rpcBool('can_escalate_proposal', { p_proposal_id: proposalId })
}

export async function fetchEligibleVoters(proposalId: string): Promise<EligibleVoter[]> {
  const { data, error } = await getSupabaseBrowserClient().rpc('proposal_eligible_voters', { p_proposal_id: proposalId })
  if (error) throw error
  return ((data ?? []) as { person_id: string | null; vote_role: string | null }[])
    .filter(r => r.person_id)
    .map(r => ({
      personId: r.person_id as string,
      voteRole: normalizeVoteRole(r.vote_role),
    }))
}

export async function fetchProposalVotes(proposalId: string): Promise<ProposalVote[]> {
  const sb = getSupabaseBrowserClient()
  const { data, error } = await sb
    .from('proposal_votes')
    .select('id,proposal_id,voter_person_id,vote,vote_role,weight,voted_at')
    .eq('proposal_id', proposalId)
    .order('voted_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as {
    id: string
    voter_person_id: string | null
    vote: string | null
    vote_role: string | null
  }[]
  const voterIds = [...new Set(rows.map(r => r.voter_person_id).filter((id): id is string => Boolean(id)))]
  const names = new Map<string, string>()
  if (voterIds.length > 0) {
    const { data: people, error: peopleErr } = await sb
      .from('people')
      .select('id,display_name')
      .in('id', voterIds)
    if (peopleErr) throw peopleErr
    for (const p of (people ?? []) as { id: string; display_name: string | null }[]) {
      names.set(p.id, p.display_name?.trim() || 'Member')
    }
  }
  return rows
    .filter(r => r.id && r.voter_person_id && r.vote && isVoteChoice(r.vote))
    .map(r => ({
      id: r.id,
      voterPersonId: r.voter_person_id as string,
      voterName: names.get(r.voter_person_id as string) || 'Member',
      vote: r.vote as VoteChoice,
      voteRole: normalizeVoteRole(r.vote_role),
    }))
}

export async function castProposalVote(proposalId: string, vote: VoteChoice): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('cast_proposal_vote', buildCastProposalVoteRpcArgs(proposalId, vote))
  if (error) throw error
}

export async function decideTripProposal(opts: {
  proposalId: string
  accept: boolean
  summary?: string | null
  confirmAdvisoryAllNo?: boolean
}): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('decide_trip_proposal', buildDecideTripProposalRpcArgs(opts))
  if (error) throw error
}

export async function escalateTripProposal(opts: {
  proposalId: string
  branchIds: string[]
  personIds: string[]
  note?: string | null
}): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('escalate_trip_proposal', buildEscalateTripProposalRpcArgs(opts))
  if (error) throw error
}

export async function fetchProposalAudience(proposalId: string): Promise<{ branchIds: string[]; personIds: string[] }> {
  const sb = getSupabaseBrowserClient()
  const [{ data: branches, error: branchErr }, { data: people, error: peopleErr }] = await Promise.all([
    sb.from('proposal_audience_branches').select('branch_id').eq('proposal_id', proposalId),
    sb.from('proposal_audience_people').select('person_id').eq('proposal_id', proposalId),
  ])
  if (branchErr) throw branchErr
  if (peopleErr) throw peopleErr
  return {
    branchIds: ((branches ?? []) as { branch_id: string | null }[]).map(r => r.branch_id).filter((id): id is string => Boolean(id)),
    personIds: ((people ?? []) as { person_id: string | null }[]).map(r => r.person_id).filter((id): id is string => Boolean(id)),
  }
}

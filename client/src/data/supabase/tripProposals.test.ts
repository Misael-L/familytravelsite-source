import { describe, expect, it } from 'vitest'
import {
  buildCastProposalVoteRpcArgs,
  buildCreateTripProposalRpcArgs,
  buildDecideTripProposalRpcArgs,
  buildEscalateTripProposalRpcArgs,
  buildUpdateTripProposalRpcArgs,
  canAdvanceFromBasics,
  clampReminderDays,
  civilFromIso,
  civilToTimestamptz,
  hubPencilAction,
  inclusiveDayCount,
  indexOpenProposalsByTripId,
  isAdvisoryAllNoConfirmRequired,
  normalizeOccasion,
  resolveProposalDates,
  tallyProposalVotes,
  type CreateTripProposalInput,
  type ProposalVote,
  type UpdateTripProposalInput,
} from './tripProposals'
import { countryIlikePattern } from './catalogCountries'
import { isPermissionDenied } from './trips'

const base: CreateTripProposalInput = {
  familyId: 'fam-1',
  title: '  Mexico Spring  ',
  notes: '  beach  ',
  startDate: '2026-08-20',
  endDate: '2026-08-27',
  dayCount: 7,
  countryIds: ['c-mx'],
  placeIds: ['p-cdmx'],
  travelerPersonIds: ['me', 'sis'],
  primaryCountryId: null,
  occasion: 'vacation',
  coverUrl: ' https://images.unsplash.com/x ',
  reminderDays: 3,
}

describe('resolveProposalDates', () => {
  it('uses civil start/end as UTC midnight', () => {
    expect(resolveProposalDates({ startDate: '2026-08-20', endDate: '2026-08-27', dayCount: 7 })).toEqual({
      startAt: '2026-08-20T00:00:00.000Z',
      endAt: '2026-08-27T00:00:00.000Z',
    })
  })

  it('rejects inverted or malformed ranges', () => {
    expect(resolveProposalDates({ startDate: '2026-08-27', endDate: '2026-08-20', dayCount: 7 })).toBeNull()
    expect(resolveProposalDates({ startDate: '20.08.2026', endDate: '27.08.2026', dayCount: 7 })).toBeNull()
  })

  it('anchors day-count-only from today UTC', () => {
    const now = new Date('2026-08-13T15:00:00.000Z')
    expect(resolveProposalDates({ startDate: '', endDate: '', dayCount: 3, now })).toEqual({
      startAt: '2026-08-13T00:00:00.000Z',
      endAt: '2026-08-15T00:00:00.000Z',
    })
  })
})

describe('buildCreateTripProposalRpcArgs', () => {
  it('maps Family fields to create_trip_proposal params and omits currency', () => {
    const built = buildCreateTripProposalRpcArgs(base)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.args).toEqual({
      p_family_id: 'fam-1',
      p_title: 'Mexico Spring',
      p_notes: 'beach',
      p_start_at: '2026-08-20T00:00:00.000Z',
      p_end_at: '2026-08-27T00:00:00.000Z',
      p_country_ids: ['c-mx'],
      p_place_ids: ['p-cdmx'],
      p_traveler_person_ids: ['me', 'sis'],
      p_primary_country_id: 'c-mx',
      p_occasion: 'vacation',
      p_cover_url: 'https://images.unsplash.com/x',
      p_reminder_days: 3,
    })
    expect(built.args).not.toHaveProperty('p_currency_code')
    expect(built.args).not.toHaveProperty('currency')
  })

  it('requires title, dates, and at least one country', () => {
    expect(buildCreateTripProposalRpcArgs({ ...base, title: '  ' }).ok).toBe(false)
    expect(buildCreateTripProposalRpcArgs({ ...base, startDate: '', endDate: '', dayCount: 0 }).ok).toBe(false)
    expect(buildCreateTripProposalRpcArgs({ ...base, countryIds: [] }).ok).toBe(false)
  })
})

describe('buildUpdateTripProposalRpcArgs', () => {
  const updateBase: UpdateTripProposalInput = {
    proposalId: 'prop-1',
    title: base.title,
    notes: base.notes,
    startDate: base.startDate,
    endDate: base.endDate,
    dayCount: base.dayCount,
    countryIds: base.countryIds,
    placeIds: base.placeIds,
    travelerPersonIds: base.travelerPersonIds,
    primaryCountryId: base.primaryCountryId,
    occasion: base.occasion,
    coverUrl: base.coverUrl,
    reminderDays: base.reminderDays,
  }

  it('maps the same payload as create with p_proposal_id and no p_family_id', () => {
    const built = buildUpdateTripProposalRpcArgs(updateBase)
    expect(built.ok).toBe(true)
    if (built.ok === false) return
    expect(built.args).toEqual({
      p_proposal_id: 'prop-1',
      p_title: 'Mexico Spring',
      p_notes: 'beach',
      p_start_at: '2026-08-20T00:00:00.000Z',
      p_end_at: '2026-08-27T00:00:00.000Z',
      p_country_ids: ['c-mx'],
      p_place_ids: ['p-cdmx'],
      p_traveler_person_ids: ['me', 'sis'],
      p_primary_country_id: 'c-mx',
      p_occasion: 'vacation',
      p_cover_url: 'https://images.unsplash.com/x',
      p_reminder_days: 3,
    })
    expect(built.args).not.toHaveProperty('p_family_id')
    expect(built.args).not.toHaveProperty('p_currency_code')
  })

  it('still requires title, dates, and a country', () => {
    expect(buildUpdateTripProposalRpcArgs({ ...updateBase, title: '  ' }).ok).toBe(false)
    expect(buildUpdateTripProposalRpcArgs({ ...updateBase, countryIds: [] }).ok).toBe(false)
  })
})

describe('hubPencilAction', () => {
  const open = indexOpenProposalsByTripId([
    { proposalId: 'p1', tripId: 'trip-1', proposedByPersonId: 'me', status: 'submitted', title: 'Mexico' },
    { proposalId: 'p2', tripId: 'trip-1', proposedByPersonId: 'other', status: 'in_review', title: 'Dup' },
  ])

  it('keeps the first open proposal per trip', () => {
    expect(open['trip-1']).toEqual({ proposalId: 'p1', proposedByPersonId: 'me' })
  })

  it('opens the editor for the creator of an open proposal', () => {
    expect(hubPencilAction('trip-1', 'me', open)).toEqual({ kind: 'edit', proposalId: 'p1' })
  })

  it('opens vote when someone else proposed', () => {
    expect(hubPencilAction('trip-1', 'sis', open)).toEqual({ kind: 'vote', proposalId: 'p1' })
  })

  it('toasts when the trip is published / has no open proposal', () => {
    expect(hubPencilAction('trip-2', 'me', open)).toEqual({ kind: 'published' })
  })
})

describe('vote / decide RPC args', () => {
  it('casts p_vote without writing proposal_votes', () => {
    expect(buildCastProposalVoteRpcArgs('p1', 'yes')).toEqual({ p_proposal_id: 'p1', p_vote: 'yes' })
    expect(buildCastProposalVoteRpcArgs('p1', 'abstain')).not.toHaveProperty('vote_role')
  })

  it('decides with p_accept and advisory confirm flag', () => {
    expect(buildDecideTripProposalRpcArgs({ proposalId: 'p1', accept: true })).toEqual({
      p_proposal_id: 'p1',
      p_accept: true,
      p_decision_summary: 'Approved by reviewer',
      p_confirm_advisory_all_no: false,
    })
    expect(buildDecideTripProposalRpcArgs({ proposalId: 'p1', accept: false, confirmAdvisoryAllNo: true })).toEqual({
      p_proposal_id: 'p1',
      p_accept: false,
      p_decision_summary: 'Rejected by reviewer',
      p_confirm_advisory_all_no: true,
    })
  })

  it('escalates with branch/person ids and optional note', () => {
    expect(buildEscalateTripProposalRpcArgs({
      proposalId: 'p1',
      branchIds: ['b1'],
      personIds: [],
      note: '  family  ',
    })).toEqual({
      p_proposal_id: 'p1',
      p_branch_ids: ['b1'],
      p_person_ids: [],
      p_note: 'family',
    })
  })

  it('detects advisory-all-no confirm from RPC errors', () => {
    expect(isAdvisoryAllNoConfirmRequired({ message: 'advisory_all_no_confirm_required' })).toBe(true)
    expect(isAdvisoryAllNoConfirmRequired(new Error('Only the proposal creator can edit this proposal'))).toBe(false)
  })
})

describe('tallyProposalVotes', () => {
  const votes: ProposalVote[] = [
    { id: '1', voterPersonId: 'a', voterName: 'A', vote: 'yes', voteRole: 'deciding' },
    { id: '2', voterPersonId: 'b', voterName: 'B', vote: 'no', voteRole: 'deciding' },
    { id: '3', voterPersonId: 'c', voterName: 'C', vote: 'no', voteRole: 'advisory' },
  ]

  it('counts deciding votes only toward majority and need (eligible/2)+1', () => {
    const tally = tallyProposalVotes(votes, [
      { personId: 'a', voteRole: 'deciding' },
      { personId: 'b', voteRole: 'deciding' },
      { personId: 'd', voteRole: 'deciding' },
      { personId: 'c', voteRole: 'advisory' },
    ])
    expect(tally.decidingYes).toBe(1)
    expect(tally.decidingNo).toBe(1)
    expect(tally.decidingEligible).toBe(3)
    expect(tally.decidingNeed).toBe(2)
    expect(tally.majorityYes).toBe(false)
    expect(tally.advisoryNo).toBe(1)
  })
})

describe('civilFromIso / inclusiveDayCount', () => {
  it('strips timestamptz to civil and counts inclusive days', () => {
    expect(civilFromIso('2026-08-20T00:00:00.000Z')).toBe('2026-08-20')
    expect(civilFromIso(null)).toBe('')
    expect(inclusiveDayCount('2026-08-20', '2026-08-27')).toBe(8)
  })
})

describe('proposal helpers', () => {
  it('canAdvanceFromBasics matches iOS (title + dates)', () => {
    const dates = resolveProposalDates({ startDate: '2026-08-20', endDate: '2026-08-21', dayCount: 7 })
    expect(canAdvanceFromBasics('Go', dates)).toBe(true)
    expect(canAdvanceFromBasics('  ', dates)).toBe(false)
    expect(canAdvanceFromBasics('Go', null)).toBe(false)
  })

  it('clamps reminder and drops getaway from chips', () => {
    expect(clampReminderDays(99)).toBe(30)
    expect(clampReminderDays(-2)).toBe(0)
    expect(normalizeOccasion('getaway')).toBe('trip')
    expect(normalizeOccasion('weekend')).toBe('weekend')
  })

  it('civilToTimestamptz is date-only UTC', () => {
    expect(civilToTimestamptz('2026-01-02')).toBe('2026-01-02T00:00:00.000Z')
  })
})

describe('countryIlikePattern', () => {
  it('matches iOS fetchCountries: empty = no filter, else wrapped ilike', () => {
    expect(countryIlikePattern('')).toBeNull()
    expect(countryIlikePattern('  ')).toBeNull()
    expect(countryIlikePattern(' Mex ')).toBe('%Mex%')
  })
})

describe('isPermissionDenied', () => {
  it('detects Postgres RLS / privilege codes used by hub archive-delete', () => {
    expect(isPermissionDenied({ code: '42501' })).toBe(true)
    expect(isPermissionDenied({ code: 'PGRST301' })).toBe(true)
    expect(isPermissionDenied({ message: 'new row violates row-level security policy' })).toBe(true)
    expect(isPermissionDenied({ message: 'permission denied' })).toBe(true)
    expect(isPermissionDenied({ code: '23505' })).toBe(false)
    expect(isPermissionDenied(new Error('network'))).toBe(false)
  })
})

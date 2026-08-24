import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  fetchCalendarSettings,
  holidayCalendarLabel,
  insertHolidayCalendar,
  listCalendarEntries,
  listPtoYears,
  loadVacayTripWindows,
  loadVacayYear,
  toggleCalendarEntry,
  updateHolidayCalendarRow,
  upsertCalendarSettings,
} from './vacay'
import { listFamilyPeopleByIds, listTravelerPresetBranches } from './familyRoster'
import { listOpenTripProposals } from './tripProposals'
import { listHubTripTravelers } from './tripTravelers'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

vi.mock('./familyRoster', () => ({
  listFamilyPeople: vi.fn(),
  listFamilyPeopleByIds: vi.fn(),
  listTravelerPresetBranches: vi.fn(),
}))

vi.mock('./tripProposals', () => ({
  listOpenTripProposals: vi.fn(),
}))

vi.mock('./tripTravelers', () => ({
  listHubTripTravelers: vi.fn(),
}))

function thenable(result: { data: unknown; error: unknown }) {
  const t: Record<string, unknown> = {}
  const self = () => t
  for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'is', 'not', 'neq', 'order', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'single']) {
    t[m] = vi.fn(self)
  }
  t.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return t
}

describe('vacay adapter', () => {
  const from = vi.fn()
  const rpc = vi.fn()

  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from, rpc } as never)
    vi.mocked(listFamilyPeopleByIds).mockReset()
    vi.mocked(listTravelerPresetBranches).mockReset()
    vi.mocked(listOpenTripProposals).mockReset()
    vi.mocked(listHubTripTravelers).mockReset()
  })

  it('lists entries with .gte/.lte on entry_date for the year', async () => {
    const chain = thenable({
      data: [{ id: 'e1', family_id: 'fam-1', person_id: 'p1', entry_date: '2026-06-01', kind: 'away', note: null }],
      error: null,
    })
    from.mockReturnValue(chain)

    const rows = await listCalendarEntries('fam-1', 2026)
    expect(from).toHaveBeenCalledWith('family_calendar_entries')
    expect(chain.gte).toHaveBeenCalledWith('entry_date', '2026-01-01')
    expect(chain.lte).toHaveBeenCalledWith('entry_date', '2026-12-31')
    expect(rows).toEqual([{ date: '2026-06-01', user_id: 'p1', plan_id: 'fam-1', kind: 'away' }])
  })

  it('toggle inserts when no matching row', async () => {
    const selectChain = thenable({ data: [], error: null })
    const insertChain = thenable({ data: null, error: null })
    from
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(insertChain)

    await expect(toggleCalendarEntry({
      familyId: 'fam-1', personId: 'p1', date: '2026-08-15', kind: 'away',
    })).resolves.toBe('inserted')
    expect(insertChain.insert).toHaveBeenCalledWith({
      family_id: 'fam-1',
      person_id: 'p1',
      entry_date: '2026-08-15',
      kind: 'away',
    })
  })

  it('toggle deletes when a matching row exists', async () => {
    const selectChain = thenable({ data: [{ id: 'row-1' }], error: null })
    const deleteChain = thenable({ data: null, error: null })
    from
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(deleteChain)

    await expect(toggleCalendarEntry({
      familyId: 'fam-1', personId: 'p1', date: '2026-08-15', kind: 'school_break',
    })).resolves.toBe('deleted')
    expect(deleteChain.delete).toHaveBeenCalled()
    expect(deleteChain.eq).toHaveBeenCalledWith('id', 'row-1')
  })

  it('throws on settings upsert { error }', async () => {
    from
      .mockReturnValueOnce(thenable({ data: null, error: null }))
      .mockReturnValueOnce(thenable({ data: null, error: { message: 'row-level security' } }))

    await expect(upsertCalendarSettings('fam-1', { blockWeekends: false })).rejects.toMatchObject({
      message: 'row-level security',
    })
  })

  it('returns default settings when no row exists', async () => {
    from.mockReturnValue(thenable({ data: null, error: null }))
    await expect(fetchCalendarSettings('fam-1')).resolves.toMatchObject({
      familyId: 'fam-1',
      blockWeekends: true,
      familyDaysEnabled: true,
      visibleYears: [],
    })
  })

  it('lists PTO years with .in(year)', async () => {
    const chain = thenable({
      data: [{ family_id: 'fam-1', person_id: 'p1', year: 2026, entitled_days: 30, carried_over: 2 }],
      error: null,
    })
    from.mockReturnValue(chain)
    const rows = await listPtoYears('fam-1', [2025, 2026])
    expect(from).toHaveBeenCalledWith('family_pto_years')
    expect(chain.in).toHaveBeenCalledWith('year', [2025, 2026])
    expect(rows[0]).toEqual({ personId: 'p1', year: 2026, entitledDays: 30, carriedOver: 2 })
  })

  it('keeps the calendar when trip overlay enrichment fails', async () => {
    vi.mocked(listFamilyPeopleByIds).mockResolvedValue([
      { personId: 'p1', displayName: 'Ada', color: '#111' },
    ])
    vi.mocked(listTravelerPresetBranches).mockResolvedValue([])
    rpc.mockImplementation(async (name: string) => {
      if (name === 'list_viewable_person_ids') return { data: [{ person_id: 'p1' }], error: null }
      if (name === 'list_overlayable_branch_ids') return { data: [], error: null }
      return { data: null, error: null }
    })
    from.mockImplementation((table: string) => {
      if (table === 'family_calendar_settings') return thenable({ data: null, error: null })
      if (table === 'family_holiday_calendars') return thenable({ data: [], error: null })
      if (table === 'family_calendar_entries') return thenable({ data: [], error: null })
      if (table === 'family_blocked_dates') return thenable({ data: [], error: null })
      if (table === 'family_pto_years') return thenable({ data: [], error: null })
      if (table === 'person_vacay_overlay_people') return thenable({ data: [], error: null })
      if (table === 'person_vacay_overlay_branches') return thenable({ data: [], error: null })
      if (table === 'person_calendar_access') return thenable({ data: [], error: null })
      if (table === 'trips') return thenable({ data: null, error: { message: 'trips down' } })
      return thenable({ data: [], error: null })
    })

    const loaded = await loadVacayYear('fam-1', 2026, 'p1')
    expect(loaded.users[0].username).toBe('Ada')
    expect(loaded.tripWindows).toEqual([])
    expect(loaded.plan.company_holidays_enabled).toBe(true)
    expect(loaded.overlay.visiblePersonIds).toEqual(['p1'])
  })

  it('classifies open-proposal trips as proposed overlay', async () => {
    from.mockReturnValue(thenable({
      data: [{
        id: 't1',
        name: 'Como',
        start_at: '2026-06-01',
        end_at: '2026-06-10',
        status: 'planning',
      }],
      error: null,
    }))
    vi.mocked(listOpenTripProposals).mockResolvedValue([
      { proposalId: 'pr1', tripId: 't1', proposedByPersonId: 'p1', status: 'submitted', title: 'Como' },
    ])
    vi.mocked(listHubTripTravelers).mockResolvedValue([
      { tripId: 't1', personId: 'p1', displayName: 'Ada', color: null, avatarUrl: null },
    ])

    const windows = await loadVacayTripWindows('fam-1')
    expect(windows).toEqual([{
      tripId: 't1',
      name: 'Como',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      overlay: 'proposed',
      travelerIds: ['p1'],
    }])
  })

  it('falls back holiday label to region when empty or null', () => {
    expect(holidayCalendarLabel(null, 'US-CA')).toBe('US-CA')
    expect(holidayCalendarLabel('   ', 'DE')).toBe('DE')
    expect(holidayCalendarLabel('US Holidays', 'US')).toBe('US Holidays')
  })

  it('insertHolidayCalendar never writes a null label', async () => {
    const chain = thenable({
      data: [{ id: 'c1', family_id: 'fam-1', region: 'US-CA', label: 'US-CA', color: '#fecaca', sort_order: 0 }],
      error: null,
    })
    from.mockReturnValue(chain)
    await insertHolidayCalendar('fam-1', { region: 'US-CA', label: '  ' })
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      family_id: 'fam-1',
      region: 'US-CA',
      label: 'US-CA',
    }))
  })

  it('updateHolidayCalendarRow omits null label and uses region when provided', async () => {
    const chain = thenable({
      data: [{ id: 'c1', family_id: 'fam-1', region: 'DE', label: 'DE', color: '#fecaca', sort_order: 0 }],
      error: null,
    })
    from.mockReturnValue(chain)
    await updateHolidayCalendarRow('c1', { label: null, region: 'DE' })
    expect(chain.update).toHaveBeenCalledWith({ region: 'DE', label: 'DE' })
  })
})

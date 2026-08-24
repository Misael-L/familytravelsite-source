import { describe, expect, it } from 'vitest'
import {
  adjacentVisibleYear,
  buildPtoStats,
  cellHasSchoolBreak,
  civilDatesInYear,
  clampPaintTarget,
  clampVisibleYear,
  collectTripDateSets,
  countAwayDays,
  entriesForCellFill,
  filterTripWindowsForOverlay,
  intersectVisibleWithViewable,
  nextYearCarry,
  paintablePersonIds,
  personKindsOnDate,
  resolvePersonPaintClick,
  resolveVisibleYears,
  rosterToVacayUsers,
  tripOverlayKind,
  vacayOverlayMode,
  visiblePersonIdSet,
  VACAY_PERSON_PALETTE,
  vacayColorForPerson,
  type VacayTripWindow,
} from './vacayModel'
import type { VacayEntry, VacayUser } from '../../types'

const windows = (partial: Partial<VacayTripWindow> & Pick<VacayTripWindow, 'tripId' | 'overlay'>): VacayTripWindow => ({
  name: 'Trip',
  startDate: '2026-06-01',
  endDate: '2026-06-03',
  travelerIds: [],
  ...partial,
})

describe('resolveVisibleYears', () => {
  it('falls back to the current year when stored is empty', () => {
    expect(resolveVisibleYears([], 2026)).toEqual([2026])
    expect(resolveVisibleYears(null, 2026)).toEqual([2026])
  })

  it('sorts unique persisted years', () => {
    expect(resolveVisibleYears([2028, 2026, 2026], 2027)).toEqual([2026, 2028])
  })

  it('empty stored years while loading 2027 still resolve to civil current year', () => {
    expect(resolveVisibleYears([], 2026)).toEqual([2026])
    expect(clampVisibleYear(resolveVisibleYears([], 2026), 2027, 2026)).toBe(2026)
  })
})

describe('clampVisibleYear', () => {
  it('keeps selected when it is in the list', () => {
    expect(clampVisibleYear([2026, 2027], 2027, 2026)).toBe(2027)
  })

  it('prefers civil current year when selected is missing', () => {
    expect(clampVisibleYear([2026], 2027, 2026)).toBe(2026)
  })

  it('uses max year when current year is also missing', () => {
    expect(clampVisibleYear([2027, 2028], 2026, 2026)).toBe(2028)
  })
})

describe('adjacentVisibleYear', () => {
  it('walks the sorted list', () => {
    expect(adjacentVisibleYear([2026, 2027], 2027, -1)).toBe(2026)
    expect(adjacentVisibleYear([2026, 2027], 2026, 1)).toBe(2027)
    expect(adjacentVisibleYear([2026, 2027], 2026, -1)).toBeNull()
    expect(adjacentVisibleYear([2026, 2027], 2027, 1)).toBeNull()
  })

  it('disables both directions when selected is not in the list', () => {
    expect(adjacentVisibleYear([2026], 2027, -1)).toBeNull()
    expect(adjacentVisibleYear([2026], 2027, 1)).toBeNull()
  })
})

describe('person paint click', () => {
  const entries: VacayEntry[] = [
    { date: '2026-06-08', user_id: 'p1', kind: 'away' },
    { date: '2026-06-08', user_id: 'p1', kind: 'school_break' },
    { date: '2026-06-10', user_id: 'p1', kind: 'school_break' },
    { date: '2026-06-11', user_id: 'p1', kind: 'away' },
  ]

  it('detects kinds for the selected person and date', () => {
    expect(personKindsOnDate(entries, 'p1', '2026-06-08')).toEqual({ away: true, school: true })
    expect(personKindsOnDate(entries, 'p1', '2026-06-10')).toEqual({ away: false, school: true })
    expect(personKindsOnDate(entries, 'p1', '2026-06-11')).toEqual({ away: true, school: false })
  })

  it('blocks Away on school-only and School on away-only', () => {
    expect(resolvePersonPaintClick('away', { away: false, school: true })).toBe('blocked-other-kind')
    expect(resolvePersonPaintClick('school', { away: true, school: false })).toBe('blocked-other-kind')
  })

  it('toggles the matching kind, including mixed cells', () => {
    expect(resolvePersonPaintClick('away', { away: true, school: false })).toBe('toggle')
    expect(resolvePersonPaintClick('school', { away: false, school: true })).toBe('toggle')
    expect(resolvePersonPaintClick('away', { away: true, school: true })).toBe('toggle')
    expect(resolvePersonPaintClick('school', { away: true, school: true })).toBe('toggle')
    expect(resolvePersonPaintClick('away', { away: false, school: false })).toBe('toggle')
  })

  it('flags school_break on a cell', () => {
    expect(cellHasSchoolBreak([{ date: '2026-06-10', user_id: 'p1', kind: 'school_break' }])).toBe(true)
    expect(cellHasSchoolBreak([{ date: '2026-06-11', user_id: 'p1', kind: 'away' }])).toBe(false)
    expect(cellHasSchoolBreak([{ date: '2026-06-11', user_id: 1 }])).toBe(false)
  })
})

describe('civilDatesInYear', () => {
  it('clips a multi-year range to hubDay-style inclusive bounds', () => {
    expect(civilDatesInYear('2025-12-30', '2026-01-02', 2026)).toEqual(['2026-01-01', '2026-01-02'])
    expect(civilDatesInYear('2026-12-30', '2027-01-02', 2026)).toEqual(['2026-12-30', '2026-12-31'])
  })

  it('returns [] when dates are missing or inverted', () => {
    expect(civilDatesInYear(null, '2026-01-02', 2026)).toEqual([])
    expect(civilDatesInYear('2026-06-10', '2026-06-01', 2026)).toEqual([])
  })
})

describe('trip overlay dots', () => {
  it('marks open-proposal ids as proposed and others approved', () => {
    expect(tripOverlayKind('t1', ['t1'])).toBe('proposed')
    expect(tripOverlayKind('t2', ['t1'])).toBe('approved')
  })

  it('splits civil dates into approved vs proposed sets', () => {
    const { approvedTripDates, proposedTripDates } = collectTripDateSets([
      windows({ tripId: 'a', overlay: 'approved', startDate: '2026-06-01', endDate: '2026-06-02' }),
      windows({ tripId: 'p', overlay: 'proposed', startDate: '2026-06-02', endDate: '2026-06-02' }),
    ], 2026)
    expect([...approvedTripDates].sort()).toEqual(['2026-06-01', '2026-06-02'])
    expect([...proposedTripDates]).toEqual(['2026-06-02'])
  })
})

describe('PTO used is away-only', () => {
  const entries: VacayEntry[] = [
    { date: '2026-06-01', user_id: 'p1', kind: 'away' },
    { date: '2026-06-02', user_id: 'p1', kind: 'away' },
    { date: '2026-06-03', user_id: 'p1', kind: 'school_break' },
    { date: '2026-06-01', user_id: 'p2', kind: 'away' },
  ]

  it('does not count school_break toward used', () => {
    expect(countAwayDays(entries, 'p1', 2026)).toBe(2)
  })

  it('builds stats with away used and default 30 entitlement', () => {
    const users: VacayUser[] = [
      { id: 'p1', username: 'Ada', color: '#111' },
    ]
    const stats = buildPtoStats({
      users,
      entries,
      ptoRows: [],
      year: 2026,
      carryOverEnabled: true,
    })
    expect(stats[0].used).toBe(2)
    expect(stats[0].vacation_days).toBe(30)
    expect(stats[0].remaining).toBe(28)
  })

  it('zeros displayed carry when carry-over is disabled', () => {
    const stats = buildPtoStats({
      users: [{ id: 'p1', username: 'Ada', color: '#111' }],
      entries: [],
      ptoRows: [{ personId: 'p1', year: 2026, entitledDays: 20, carriedOver: 5 }],
      year: 2026,
      carryOverEnabled: false,
    })
    expect(stats[0].carried_over).toBe(0)
    expect(stats[0].total_available).toBe(20)
  })
})

describe('nextYearCarry', () => {
  it('mirrors Nest max(0, entitled + prev carry − used)', () => {
    expect(nextYearCarry(30, 4, 10)).toBe(24)
    expect(nextYearCarry(10, 0, 12)).toBe(0)
  })
})

describe('vacayColorForPerson', () => {
  it('uses palette[0] and palette[1] when stored color is null', () => {
    expect(vacayColorForPerson(null, 0)).toBe(VACAY_PERSON_PALETTE[0])
    expect(vacayColorForPerson(null, 1)).toBe(VACAY_PERSON_PALETTE[1])
  })

  it('prefers a stored hex over the palette', () => {
    expect(vacayColorForPerson('#ff00aa', 0)).toBe('#ff00aa')
    expect(vacayColorForPerson('  #112233  ', 4)).toBe('#112233')
  })

  it('wraps the palette at index 6', () => {
    expect(vacayColorForPerson(null, 6)).toBe(VACAY_PERSON_PALETTE[0])
    expect(vacayColorForPerson(undefined, 7)).toBe(VACAY_PERSON_PALETTE[1])
  })

  it('treats an empty string as null', () => {
    expect(vacayColorForPerson('', 0)).toBe(VACAY_PERSON_PALETTE[0])
    expect(vacayColorForPerson('   ', 1)).toBe(VACAY_PERSON_PALETTE[1])
  })
})

describe('rosterToVacayUsers', () => {
  it('maps null colors by roster index without changing order', () => {
    const users = rosterToVacayUsers([
      { personId: 'a', displayName: 'Ada', color: null },
      { personId: 'b', displayName: 'Ben', color: '' },
      { personId: 'c', displayName: 'Cam', color: '#abcdef' },
    ])
    expect(users.map(u => u.color)).toEqual([
      VACAY_PERSON_PALETTE[0],
      VACAY_PERSON_PALETTE[1],
      '#abcdef',
    ])
  })
})

describe('vacay overlay set', () => {
  it('defaults to self and unions extra people with enabled branch members', () => {
    expect(visiblePersonIdSet({
      currentPersonId: 'me',
      extraPersonIds: [],
      enabledBranchMemberIds: [],
    })).toEqual(['me'])
    expect(visiblePersonIdSet({
      currentPersonId: 'me',
      extraPersonIds: ['alvin'],
      enabledBranchMemberIds: [['me', 'sara'], ['alvin']],
    }).sort()).toEqual(['alvin', 'me', 'sara'])
  })

  it('intersects with can_view and always keeps self', () => {
    expect(intersectVisibleWithViewable(['me', 'sara', 'alvin'], ['me', 'sara'], 'me').sort())
      .toEqual(['me', 'sara'])
    expect(intersectVisibleWithViewable(['me'], [], 'me')).toEqual(['me'])
  })

  it('paint targets exclude household category members', () => {
    expect(paintablePersonIds('me', ['alvin'])).toEqual(['me', 'alvin'])
    expect(clampPaintTarget('sara', 'me', ['me', 'alvin'])).toBe('me')
    expect(clampPaintTarget('alvin', 'me', ['me', 'alvin'])).toBe('alvin')
  })

  it('HOF/parent add individuals; child/guest request access', () => {
    expect(vacayOverlayMode('patriarch', false)).toBe('add')
    expect(vacayOverlayMode('parent', false)).toBe('add')
    expect(vacayOverlayMode('child', false)).toBe('request')
    expect(vacayOverlayMode('guest', true)).toBe('add')
  })

  it('keeps trip dots only for overlaid travelers', () => {
    const trips: VacayTripWindow[] = [
      windows({ tripId: 'mine', overlay: 'approved', travelerIds: ['me'] }),
      windows({ tripId: 'sara', overlay: 'approved', travelerIds: ['sara'] }),
    ]
    expect(filterTripWindowsForOverlay(trips, ['me']).map(w => w.tripId)).toEqual(['mine'])
    expect(filterTripWindowsForOverlay(trips, ['me', 'sara']).map(w => w.tripId).sort()).toEqual(['mine', 'sara'])
  })
})

describe('entriesForCellFill', () => {
  it('leaves Nest entries (no kind) unchanged', () => {
    const entries = [
      { date: '2026-06-01', user_id: 1, person_color: '#111' },
      { date: '2026-06-01', user_id: 1, person_color: '#222' },
    ]
    expect(entriesForCellFill(entries)).toHaveLength(2)
  })

  it('dedupes away + school for the same person', () => {
    const filled = entriesForCellFill([
      { date: '2026-06-01', user_id: 'p1', kind: 'away', person_color: '#111' },
      { date: '2026-06-01', user_id: 'p1', kind: 'school_break', person_color: '#111' },
      { date: '2026-06-01', user_id: 'p2', kind: 'away', person_color: '#222' },
    ])
    expect(filled.map(e => e.user_id)).toEqual(['p1', 'p2'])
  })
})

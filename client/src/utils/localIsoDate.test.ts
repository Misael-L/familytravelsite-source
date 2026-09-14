import { afterEach, describe, expect, it, vi } from 'vitest'
import { addLocalIsoDays, eachLocalIsoDay, localIsoDate } from './localIsoDate'

describe('localIsoDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats the wall-clock calendar date, not UTC', () => {
    vi.useFakeTimers()
    // 29 Aug 2026 00:30 in UTC-4 is still the 29th locally, but already the 29th
    // 04:30Z — pick a time that would flip UTC relative to a typical US evening.
    vi.setSystemTime(new Date(2026, 7, 29, 23, 30, 0))
    expect(localIsoDate()).toBe('2026-08-29')
  })

  it('pads month and day', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 8, 0, 0))).toBe('2026-01-05')
  })

  it('shifts civil dates across month boundaries', () => {
    expect(addLocalIsoDays('2026-08-01', -30)).toBe('2026-07-02')
    expect(addLocalIsoDays('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('iterates inclusive civil ranges without UTC conversion', () => {
    expect(eachLocalIsoDay('2026-08-29', '2026-08-31')).toEqual([
      '2026-08-29', '2026-08-30', '2026-08-31',
    ])
  })

  it('does not skip a local calendar day at midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 30, 0, 0, 0))
    expect(eachLocalIsoDay('2026-08-29', '2026-08-30')).toEqual([
      '2026-08-29', '2026-08-30',
    ])
    expect(eachLocalIsoDay(localIsoDate(), localIsoDate())).toEqual(['2026-08-30'])
  })

  it('returns empty when the range is inverted or blank', () => {
    expect(eachLocalIsoDay('2026-08-31', '2026-08-29')).toEqual([])
    expect(eachLocalIsoDay('', '2026-08-29')).toEqual([])
  })
})

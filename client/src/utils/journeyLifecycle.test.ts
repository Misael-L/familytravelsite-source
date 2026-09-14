import { describe, expect, it } from 'vitest'
import { computeJourneyLifecycle } from './journeyLifecycle'

describe('computeJourneyLifecycle', () => {
  it('classifies live / upcoming / completed against a civil today', () => {
    expect(computeJourneyLifecycle('active', '2026-08-20', '2026-08-29', '2026-08-29')).toBe('live')
    expect(computeJourneyLifecycle('active', '2026-08-30', '2026-09-04', '2026-08-29')).toBe('upcoming')
    expect(computeJourneyLifecycle('active', '2026-08-01', '2026-08-28', '2026-08-29')).toBe('completed')
  })

  it('does not flip at local midnight when today is injected (UTC-safe)', () => {
    // If this used toISOString(), a UTC+ offset just after local midnight could
    // still be the previous UTC day. The injected civil today is authoritative.
    expect(computeJourneyLifecycle('active', '2026-08-29', '2026-08-29', '2026-08-29')).toBe('live')
    expect(computeJourneyLifecycle('active', '2026-08-29', '2026-08-29', '2026-08-28')).toBe('upcoming')
    expect(computeJourneyLifecycle('active', '2026-08-29', '2026-08-29', '2026-08-30')).toBe('completed')
  })

  it('treats date-only ranges as inclusive on both ends', () => {
    expect(computeJourneyLifecycle('draft', '2026-08-01', '2026-08-10', '2026-08-01')).toBe('live')
    expect(computeJourneyLifecycle('draft', '2026-08-01', '2026-08-10', '2026-08-10')).toBe('live')
  })

  it('returns archived regardless of dates, and draft when both bounds are missing', () => {
    expect(computeJourneyLifecycle('archived', '2026-08-01', '2026-08-10', '2026-08-05')).toBe('archived')
    expect(computeJourneyLifecycle('draft', null, null, '2026-08-29')).toBe('draft')
  })
})

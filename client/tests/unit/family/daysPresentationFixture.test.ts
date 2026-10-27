import { describe, expect, it } from 'vitest'
import {
  DAYS_ITEM_A,
  DAYS_TRIP_ID,
  decideDaysRequest,
  isDraftRemovePayload,
} from '../../../e2e/family/days-presentation.fixture'

const origin = 'http://127.0.0.1:5199'
const app = 'http://127.0.0.1:5178'

const removeBody = {
  p_trip_id: DAYS_TRIP_ID,
  p_op_id: null,
  p_module: 'plan_item',
  p_op: 'remove',
  p_trip_day_id: '22222222-2222-4222-8222-222222222222',
  p_civil_date: '2026-12-01',
  p_target_table: 'schedule_items',
  p_target_id: DAYS_ITEM_A,
  p_payload: { schema_version: 1 },
  p_sort_order: 0,
}

describe('Family Days fixture request allowlist', () => {
  it('rejects unexpected legacy API calls', () => {
    expect(decideDaysRequest({
      method: 'DELETE',
      href: `${app}/api/trips/123`,
      member: 'direct',
    }).action).toBe('reject')
    expect(decideDaysRequest({
      method: 'POST',
      href: `${app}/api/map-markers/${DAYS_TRIP_ID}`,
      member: 'direct',
    }).action).toBe('reject')
    expect(decideDaysRequest({
      method: 'GET',
      href: `${app}/api/trips/123`,
      member: 'direct',
    }).action).toBe('reject')
  })

  it('allows only the shaped map and photo reads the shell already issues', () => {
    const markers = decideDaysRequest({
      method: 'GET',
      href: `${app}/api/map-markers/${DAYS_TRIP_ID}`,
      member: 'direct',
    })
    expect(markers.action).toBe('fulfill')
    const photo = decideDaysRequest({
      method: 'GET',
      href: `${app}/api/maps/place-photo/coords%3A19.43%3A-99.13?lat=19.43&lng=-99.13&name=City+museum`,
      member: 'direct',
    })
    expect(photo.action).toBe('fulfill')
    if (photo.action === 'fulfill') {
      expect(JSON.parse(photo.body)).toEqual({ photoUrl: null, attribution: null })
    }
  })

  it('rejects an unlisted mutating RPC and published table writes', () => {
    expect(decideDaysRequest({
      method: 'POST',
      href: `${origin}/rest/v1/rpc/unlisted_mutating_rpc`,
      member: 'draft',
      jsonBody: { p_trip_id: DAYS_TRIP_ID },
    }).action).toBe('reject')
    expect(decideDaysRequest({
      method: 'PATCH',
      href: `${origin}/rest/v1/trip_days?id=eq.${DAYS_TRIP_ID}`,
      member: 'direct',
      jsonBody: { title: 'Renamed' },
    }).action).toBe('reject')
    expect(decideDaysRequest({
      method: 'DELETE',
      href: `${origin}/rest/v1/schedule_items?id=eq.${DAYS_ITEM_A}`,
      member: 'direct',
    }).action).toBe('reject')
    expect(decideDaysRequest({
      method: 'POST',
      href: `${origin}/rest/v1/day_notes`,
      member: 'direct',
      jsonBody: { body: 'note' },
    }).action).toBe('reject')
  })

  it('accepts a draft removal RPC only when the payload matches the Family contract', () => {
    expect(isDraftRemovePayload(removeBody)).toBe(true)
    const allowed = decideDaysRequest({
      method: 'POST',
      href: `${origin}/rest/v1/rpc/upsert_trip_change_draft_op`,
      member: 'draft',
      jsonBody: removeBody,
    })
    expect(allowed.action).toBe('fulfill')
    expect(decideDaysRequest({
      method: 'POST',
      href: `${origin}/rest/v1/rpc/upsert_trip_change_draft_op`,
      member: 'draft',
      jsonBody: { ...removeBody, p_module: 'day_title', p_op: 'update' },
    }).action).toBe('reject')
    expect(decideDaysRequest({
      method: 'GET',
      href: `${origin}/auth/v1/health`,
      member: 'direct',
    }).action).toBe('fulfill')
    expect(decideDaysRequest({
      method: 'POST',
      href: `${origin}/auth/v1/health`,
      member: 'direct',
    }).action).toBe('reject')
  })
})

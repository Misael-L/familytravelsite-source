import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FAMILY_REALTIME_COALESCE_MS,
  FAMILY_REALTIME_ITINERARY_TABLES,
  FAMILY_REALTIME_NOTIFICATION_TABLE,
  buildFamilyRealtimeChangeSpecs,
  createBurstCoalescer,
  createFamilyRealtimeController,
  isFamilyRealtimeUuid,
} from './familyRealtime'

const FAMILY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const PERSON_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const TRIP_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
const OTHER_PERSON = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'

type MockChannel = {
  topic: string
  handlers: Array<{ spec: { event: string; table: string; filter: string }; cb: (payload: { table: string }) => void }>
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  emitSubscribe?: (status: string) => void
}

function createMockClient() {
  const channels: MockChannel[] = []
  const client = {
    channel: vi.fn((name: string) => {
      const handlers: MockChannel['handlers'] = []
      let subscribeCb: ((status: string) => void) | undefined
      const ch: MockChannel = {
        topic: `realtime:${name}`,
        handlers,
        on: vi.fn((_type: string, spec: MockChannel['handlers'][number]['spec'], cb: MockChannel['handlers'][number]['cb']) => {
          handlers.push({ spec, cb })
          return ch
        }),
        subscribe: vi.fn((cb?: (status: string) => void) => {
          subscribeCb = cb
          cb?.('SUBSCRIBED')
          return ch
        }),
      }
      ch.emitSubscribe = (status: string) => subscribeCb?.(status)
      channels.push(ch)
      return ch
    }),
    removeChannel: vi.fn(async (ch: MockChannel) => {
      const i = channels.indexOf(ch)
      if (i >= 0) channels.splice(i, 1)
    }),
    getChannels: vi.fn(() => [...channels]),
  }
  return { client: client as unknown as SupabaseClient, channels, raw: client }
}

describe('familyRealtime specs', () => {
  it('builds recipient filters for notifications and trip_id filters for itinerary tables', () => {
    const specs = buildFamilyRealtimeChangeSpecs({ personId: PERSON_ID, tripId: TRIP_ID })
    const notif = specs.filter(s => s.table === FAMILY_REALTIME_NOTIFICATION_TABLE)
    expect(notif).toHaveLength(2)
    expect(notif.every(s => s.filter === `recipient_person_id=eq.${PERSON_ID}`)).toBe(true)
    expect(notif.map(s => s.event).sort()).toEqual(['INSERT', 'UPDATE'])

    for (const table of FAMILY_REALTIME_ITINERARY_TABLES) {
      const rows = specs.filter(s => s.table === table)
      expect(rows).toHaveLength(2)
      const expected = table === 'trips' ? `id=eq.${TRIP_ID}` : `trip_id=eq.${TRIP_ID}`
      expect(rows.every(s => s.filter === expected)).toBe(true)
    }
  })

  it('omits itinerary specs when no trip is bound', () => {
    const specs = buildFamilyRealtimeChangeSpecs({ personId: PERSON_ID })
    expect(specs.every(s => s.table === FAMILY_REALTIME_NOTIFICATION_TABLE)).toBe(true)
    expect(specs).toHaveLength(2)
  })

  it('accepts UUID-shaped ids', () => {
    expect(isFamilyRealtimeUuid(FAMILY_ID)).toBe(true)
    expect(isFamilyRealtimeUuid('fam-1')).toBe(false)
  })
})

describe('createBurstCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces a burst into one run', () => {
    const run = vi.fn()
    const c = createBurstCoalescer(run, FAMILY_REALTIME_COALESCE_MS)
    c.trigger()
    c.trigger()
    c.trigger()
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(FAMILY_REALTIME_COALESCE_MS)
    expect(run).toHaveBeenCalledTimes(1)
    c.cancel()
    c.trigger()
    c.cancel()
    vi.advanceTimersByTime(FAMILY_REALTIME_COALESCE_MS)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('FamilyRealtimeController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('subscribes once for the same family/person and removes the channel on stop', () => {
    const { client, raw, channels } = createMockClient()
    const rt = createFamilyRealtimeController({ getClient: () => client })
    const onNotificationChange = vi.fn()
    rt.startSession({ familyId: FAMILY_ID, personId: PERSON_ID, onNotificationChange })
    rt.startSession({ familyId: FAMILY_ID, personId: PERSON_ID, onNotificationChange })
    expect(raw.channel).toHaveBeenCalledTimes(1)
    expect(rt.getStatus()).toBe('subscribed')
    expect(channels[0].handlers).toHaveLength(2)
    rt.stopSession()
    expect(raw.removeChannel).toHaveBeenCalledTimes(1)
    expect(rt.getStatus()).toBe('idle')
    expect(rt.getActiveKey()).toBeNull()
  })

  it('treats StrictMode start/stop/start as a single live channel', () => {
    const { client, raw } = createMockClient()
    const rt = createFamilyRealtimeController({ getClient: () => client })
    const onNotificationChange = vi.fn()
    rt.startSession({ familyId: FAMILY_ID, personId: PERSON_ID, onNotificationChange })
    rt.stopSession()
    rt.startSession({ familyId: FAMILY_ID, personId: PERSON_ID, onNotificationChange })
    expect(raw.channel).toHaveBeenCalledTimes(2)
    expect(raw.removeChannel).toHaveBeenCalledTimes(1)
    expect(client.getChannels()).toHaveLength(1)
  })

  it('rebinds on family/person switch and ignores stale notification events', () => {
    const { client, channels } = createMockClient()
    const rt = createFamilyRealtimeController({ getClient: () => client })
    const first = vi.fn()
    const second = vi.fn()
    rt.startSession({ familyId: FAMILY_ID, personId: PERSON_ID, onNotificationChange: first })
    const staleHandlers = [...channels[0].handlers]
    rt.startSession({ familyId: FAMILY_ID, personId: OTHER_PERSON, onNotificationChange: second })
    expect(client.getChannels()).toHaveLength(1)
    staleHandlers.forEach(h => h.cb({ table: 'notifications' }))
    vi.advanceTimersByTime(FAMILY_REALTIME_COALESCE_MS)
    expect(first).not.toHaveBeenCalled()
    channels[channels.length - 1]?.handlers.forEach(h => h.cb({ table: 'notifications' }))
    vi.advanceTimersByTime(FAMILY_REALTIME_COALESCE_MS)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('binds itinerary filters only for an active UUID trip and coalesces bursts', () => {
    const { client, raw, channels } = createMockClient()
    const rt = createFamilyRealtimeController({ getClient: () => client })
    const onNotificationChange = vi.fn()
    const onItinerary = vi.fn()
    rt.startSession({ familyId: FAMILY_ID, personId: PERSON_ID, onNotificationChange })
    rt.bindItinerary({ tripId: TRIP_ID, onChange: onItinerary })
    expect(raw.channel).toHaveBeenCalledTimes(2)
    const itineraryHandlers = channels[channels.length - 1]?.handlers.filter(h => h.spec.table !== 'notifications') ?? []
    expect(itineraryHandlers).toHaveLength(FAMILY_REALTIME_ITINERARY_TABLES.length * 2)
    expect(itineraryHandlers.every(h => h.spec.filter.includes(TRIP_ID))).toBe(true)
    itineraryHandlers[0].cb({ table: 'trip_places' })
    itineraryHandlers[1].cb({ table: 'schedule_items' })
    itineraryHandlers[2].cb({ table: 'day_notes' })
    expect(onItinerary).not.toHaveBeenCalled()
    vi.advanceTimersByTime(FAMILY_REALTIME_COALESCE_MS)
    expect(onItinerary).toHaveBeenCalledTimes(1)
    rt.bindItinerary(null)
    expect(channels[channels.length - 1]?.handlers.every(h => h.spec.table === 'notifications')).toBe(true)
  })

  it('does not subscribe when ids are not UUIDs', () => {
    const { client, raw } = createMockClient()
    const rt = createFamilyRealtimeController({ getClient: () => client })
    rt.startSession({ familyId: 'fam-1', personId: 'p-1', onNotificationChange: vi.fn() })
    expect(raw.channel).not.toHaveBeenCalled()
    expect(rt.getStatus()).toBe('error')
  })

  it('maps CHANNEL_ERROR and TIMED_OUT to error without dropping later poll fallback', () => {
    const { client, channels } = createMockClient()
    const statuses: string[] = []
    const rt = createFamilyRealtimeController({ getClient: () => client })
    rt.startSession({
      familyId: FAMILY_ID,
      personId: PERSON_ID,
      onNotificationChange: vi.fn(),
      onStatus: s => statuses.push(s),
    })
    channels[0].emitSubscribe?.('CHANNEL_ERROR')
    expect(rt.getStatus()).toBe('error')
    channels[0].emitSubscribe?.('TIMED_OUT')
    expect(rt.getStatus()).toBe('error')
    expect(client.getChannels()).toHaveLength(1)
  })

  it('logout stopAll removes the channel and drops a late event', () => {
    const { client, channels, raw } = createMockClient()
    const onNotificationChange = vi.fn()
    const rt = createFamilyRealtimeController({ getClient: () => client })
    rt.startSession({ familyId: FAMILY_ID, personId: PERSON_ID, onNotificationChange })
    rt.bindItinerary({ tripId: TRIP_ID, onChange: vi.fn() })
    const handlers = [...(channels[channels.length - 1]?.handlers ?? [])]
    rt.stopAll()
    expect(raw.removeChannel).toHaveBeenCalled()
    expect(rt.getActiveKey()).toBeNull()
    handlers.forEach(h => h.cb({ table: 'notifications' }))
    vi.advanceTimersByTime(FAMILY_REALTIME_COALESCE_MS)
    expect(onNotificationChange).not.toHaveBeenCalled()
  })
})

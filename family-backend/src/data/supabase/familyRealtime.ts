/**
 * Family-plane Postgres Changes invalidation (§43 / W9.2).
 * Events are signals only — notification RPCs and workspace adapters remain SoR.
 * Nest WebSocket stays in useInAppNotificationListener / useTripWebSocket.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from './client'

export type FamilyRealtimeStatus = 'idle' | 'subscribed' | 'error' | 'closed'

export const FAMILY_REALTIME_CHANNEL_PREFIX = 'family-realtime'
export const FAMILY_REALTIME_COALESCE_MS = 80
export const FAMILY_REALTIME_NOTIFICATION_TABLE = 'notifications'
export const FAMILY_REALTIME_ITINERARY_TABLES = [
  'trips',
  'trip_places',
  'trip_days',
  'schedule_items',
  'day_notes',
] as const

export type FamilyRealtimeItineraryTable = (typeof FAMILY_REALTIME_ITINERARY_TABLES)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isFamilyRealtimeUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export type FamilyRealtimeChangeSpec = {
  event: 'INSERT' | 'UPDATE'
  schema: 'public'
  table: string
  filter: string
}

export function buildFamilyRealtimeChangeSpecs(opts: {
  personId: string
  tripId?: string | null
}): FamilyRealtimeChangeSpec[] {
  const specs: FamilyRealtimeChangeSpec[] = [
    {
      event: 'INSERT',
      schema: 'public',
      table: FAMILY_REALTIME_NOTIFICATION_TABLE,
      filter: `recipient_person_id=eq.${opts.personId}`,
    },
    {
      event: 'UPDATE',
      schema: 'public',
      table: FAMILY_REALTIME_NOTIFICATION_TABLE,
      filter: `recipient_person_id=eq.${opts.personId}`,
    },
  ]
  if (!opts.tripId) return specs
  for (const table of FAMILY_REALTIME_ITINERARY_TABLES) {
    const filter = table === 'trips' ? `id=eq.${opts.tripId}` : `trip_id=eq.${opts.tripId}`
    specs.push(
      { event: 'INSERT', schema: 'public', table, filter },
      { event: 'UPDATE', schema: 'public', table, filter },
    )
  }
  return specs
}

export function createBurstCoalescer(run: () => void, waitMs = FAMILY_REALTIME_COALESCE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    trigger() {
      if (timer != null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        run()
      }, waitMs)
    },
    cancel() {
      if (timer != null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

export type FamilyRealtimeSessionOpts = {
  familyId: string
  personId: string
  onNotificationChange: () => void
  onStatus?: (status: FamilyRealtimeStatus) => void
}

export type FamilyRealtimeItineraryBind = {
  tripId: string
  onChange: () => void
}

type Desired = {
  familyId: string | null
  personId: string | null
  tripId: string | null
  onNotificationChange: (() => void) | null
  onItineraryChange: (() => void) | null
  onStatus: ((status: FamilyRealtimeStatus) => void) | null
}

function sessionKey(familyId: string, personId: string, tripId: string | null): string {
  return `${familyId}:${personId}:${tripId ?? ''}`
}

function channelName(familyId: string, personId: string, tripId: string | null): string {
  return `${FAMILY_REALTIME_CHANNEL_PREFIX}:${familyId}:${personId}:${tripId ?? 'none'}`
}

function isOwnedTopic(topic: string): boolean {
  return topic.includes(FAMILY_REALTIME_CHANNEL_PREFIX)
}

export type FamilyRealtimeController = {
  startSession: (opts: FamilyRealtimeSessionOpts) => void
  stopSession: () => void
  stopAll: () => void
  bindItinerary: (bind: FamilyRealtimeItineraryBind | null) => void
  getStatus: () => FamilyRealtimeStatus
  getActiveKey: () => string | null
}

export function createFamilyRealtimeController(deps?: {
  getClient?: () => SupabaseClient
}): FamilyRealtimeController {
  const getClient = deps?.getClient ?? getSupabaseBrowserClient
  const desired: Desired = {
    familyId: null,
    personId: null,
    tripId: null,
    onNotificationChange: null,
    onItineraryChange: null,
    onStatus: null,
  }
  let sessionGen = 0
  let channel: RealtimeChannel | null = null
  let activeKey: string | null = null
  let status: FamilyRealtimeStatus = 'idle'
  let notifyCoalesce = createBurstCoalescer(() => desired.onNotificationChange?.())
  let itineraryCoalesce = createBurstCoalescer(() => desired.onItineraryChange?.())

  function emit(next: FamilyRealtimeStatus): void {
    status = next
    desired.onStatus?.(next)
  }

  function removeOwned(client: SupabaseClient): void {
    for (const ch of client.getChannels()) {
      if (isOwnedTopic(ch.topic)) void client.removeChannel(ch)
    }
  }

  function teardown(client: SupabaseClient | null): void {
    notifyCoalesce.cancel()
    itineraryCoalesce.cancel()
    const owned = channel
    channel = null
    activeKey = null
    if (owned && client) void client.removeChannel(owned)
    else if (client) removeOwned(client)
  }

  function reconcile(): void {
    const familyId = desired.familyId
    const personId = desired.personId
    if (!familyId || !personId) {
      sessionGen += 1
      let client: SupabaseClient | null = null
      try {
        client = getClient()
      } catch {
        client = null
      }
      teardown(client)
      emit(status === 'idle' ? 'idle' : 'closed')
      return
    }
    if (!isFamilyRealtimeUuid(familyId) || !isFamilyRealtimeUuid(personId)) {
      sessionGen += 1
      teardown(null)
      emit('error')
      return
    }
    const tripId = desired.tripId && isFamilyRealtimeUuid(desired.tripId) ? desired.tripId : null
    const key = sessionKey(familyId, personId, tripId)
    if (key === activeKey && channel) return

    const gen = ++sessionGen
    let client: SupabaseClient
    try {
      client = getClient()
    } catch {
      emit('error')
      return
    }

    teardown(client)
    notifyCoalesce = createBurstCoalescer(() => {
      if (gen !== sessionGen) return
      desired.onNotificationChange?.()
    })
    itineraryCoalesce = createBurstCoalescer(() => {
      if (gen !== sessionGen) return
      desired.onItineraryChange?.()
    })

    const ch = client.channel(channelName(familyId, personId, tripId))
    for (const spec of buildFamilyRealtimeChangeSpecs({ personId, tripId })) {
      ch.on(
        'postgres_changes',
        { event: spec.event, schema: spec.schema, table: spec.table, filter: spec.filter },
        payload => {
          if (gen !== sessionGen) return
          if (payload.table === FAMILY_REALTIME_NOTIFICATION_TABLE) notifyCoalesce.trigger()
          else itineraryCoalesce.trigger()
        },
      )
    }

    channel = ch
    activeKey = key
    ch.subscribe(next => {
      if (gen !== sessionGen) return
      if (next === 'SUBSCRIBED') emit('subscribed')
      else if (next === 'CHANNEL_ERROR' || next === 'TIMED_OUT') emit('error')
      else if (next === 'CLOSED') emit('closed')
    })
  }

  function stopSessionInner(): void {
    desired.familyId = null
    desired.personId = null
    desired.onNotificationChange = null
    reconcile()
    desired.onStatus = null
    status = 'idle'
  }

  return {
    startSession(opts) {
      desired.familyId = opts.familyId
      desired.personId = opts.personId
      desired.onNotificationChange = opts.onNotificationChange
      desired.onStatus = opts.onStatus ?? desired.onStatus
      reconcile()
    },
    stopSession: stopSessionInner,
    stopAll() {
      desired.tripId = null
      desired.onItineraryChange = null
      stopSessionInner()
    },
    bindItinerary(bind) {
      if (!bind) {
        desired.tripId = null
        desired.onItineraryChange = null
      } else {
        desired.tripId = bind.tripId
        desired.onItineraryChange = bind.onChange
      }
      reconcile()
    },
    getStatus() {
      return status
    },
    getActiveKey() {
      return activeKey
    },
  }
}

export const familyRealtime = createFamilyRealtimeController()

export function resetFamilyRealtimeForTests(): void {
  familyRealtime.stopAll()
}

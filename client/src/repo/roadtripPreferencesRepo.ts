import { roadtripPreferencesResponseSchema, roadtripPreferencesUpdateSchema, type RoadtripPreferences } from '@trek/shared'
import { apiClient } from '../api/client'
import { offlineDb } from '../db/offlineDb'
import { hasReadOnlyBuild } from '../db/readOnlySession'
import { isFamilyRoutePlanningPreview, isHostedRoadtripToursReadOnly } from '../integrations/family/routePlanningPreview'
import { routePreferencesSnapshotSchema } from '../integrations/family/routePreferencesContract'
import { generateUUID, mutationQueue } from '../sync/mutationQueue'
import { isEffectivelyOffline } from '../sync/networkMode'
import { hostedPlannerRead } from './sessionRead'
import { onlineThenCache } from './withOfflineFallback'

export async function cachedRoadtripPreferences(tripId: number, excludeMutation?: string, db = offlineDb): Promise<RoadtripPreferences> {
  const cached = await db.roadtripPreferences.get(tripId)
  if (!cached) throw new Error('Driving settings are not available offline.')
  if (isFamilyRoutePlanningPreview()) return cached.preferences
  const pending = await db.mutationQueue.where('tripId').equals(tripId).sortBy('createdAt')
  return pending.reduce((preferences, mutation) => {
    if (mutation.resource !== 'roadtripPreferences' || mutation.id === excludeMutation || !['pending', 'syncing'].includes(mutation.status)) return preferences
    return { ...preferences, ...roadtripPreferencesUpdateSchema.parse(mutation.body) }
  }, cached.preferences)
}

function assertPreviewOwner(cacheName: string, db = offlineDb) {
  if (db.name !== cacheName || !isFamilyRoutePlanningPreview()) throw new Error('Trip or account changed.')
}

async function storePreviewSnapshot(tripId: number, value: unknown, cacheName: string, db = offlineDb) {
  assertPreviewOwner(cacheName, db)
  const { tripId: returnedTripId } = roadtripPreferencesResponseSchema.parse(value)
  if (returnedTripId !== tripId) throw new Error('Driving settings belong to a different trip.')
  const snapshot = routePreferencesSnapshotSchema.parse(value)
  // A read that started before a save may finish after it. Keep the newer revision.
  return db.transaction('rw', db.roadtripPreferences, async () => {
    assertPreviewOwner(cacheName, db)
    const current = await db.roadtripPreferences.get(tripId)
    if (current?.revision !== undefined && current.revision > snapshot.revision) return current
    await db.roadtripPreferences.put({ tripId, ...snapshot })
    return snapshot
  })
}

async function savePreviewSettings(tripId: number, preferences: RoadtripPreferences, cacheName: string) {
  assertPreviewOwner(cacheName)
  if (isEffectivelyOffline()) throw new Error('Reconnect to save driving settings.')
  const current = await offlineDb.roadtripPreferences.get(tripId)
  if (current?.revision === undefined || !current.editable) throw new Error('Load editable driving settings first.')
  assertPreviewOwner(cacheName)
  try {
    const saved = await apiClient.put(`/trips/${tripId}/family/route-preferences`, {
      revision: current.revision, preferences,
    })
    return (await storePreviewSnapshot(tripId, saved.data, cacheName)).preferences
  } catch (error) {
    // Refresh the displayed values after a conflict or uncertain response. Do not
    // reapply an old patch over values that another session may have just changed.
    const status = (error as { response?: { status?: number } } | null)?.response?.status
    assertPreviewOwner(cacheName)
    const fresh = await apiClient.get(`/trips/${tripId}/family/route-preferences`)
      .then(saved => storePreviewSnapshot(tripId, saved.data, cacheName))
      .catch(() => null)
    if ((!status || status >= 500) && fresh && (fresh.revision ?? 0) > current.revision &&
        Object.entries(preferences).every(([key, value]) => fresh.preferences[key as keyof RoadtripPreferences] === value)) {
      return fresh.preferences
    }
    throw error
  }
}

const writes = new Map<number, Promise<RoadtripPreferences>>()

export const roadtripPreferencesRepo = {
  async read(tripId: number, db = offlineDb): Promise<RoadtripPreferences> {
    const cacheName = db.name
    const preview = isFamilyRoutePlanningPreview()
    if (isHostedRoadtripToursReadOnly()) {
      const fetched = await hostedPlannerRead(() => apiClient.get(`/trips/${tripId}/family/route-preferences`))
      const { tripId: returnedTripId } = roadtripPreferencesResponseSchema.parse(fetched.data)
      if (returnedTripId !== tripId) throw new Error('Driving settings belong to a different trip.')
      return routePreferencesSnapshotSchema.parse(fetched.data).preferences
    }
    return onlineThenCache(async () => {
      const resource = preview ? 'family/route-preferences' : 'roadtrip/preferences'
      const fetched = await apiClient.get(`/trips/${tripId}/${resource}`)
      if (db.name !== cacheName) throw new Error('Account changed.')
      if (preview) return (await storePreviewSnapshot(tripId, fetched.data, cacheName, db)).preferences
      const saved = roadtripPreferencesResponseSchema.parse(fetched.data)
      await db.roadtripPreferences.put(saved)
      return cachedRoadtripPreferences(tripId, undefined, db)
    }, () => cachedRoadtripPreferences(tripId, undefined, db))
  },

  update(tripId: number, patch: RoadtripPreferences): Promise<RoadtripPreferences> {
    if (hasReadOnlyBuild() || isHostedRoadtripToursReadOnly()) return Promise.reject(new Error('Changes are paused.'))
    const cacheName = offlineDb.name
    const preview = isFamilyRoutePlanningPreview()
    const previous = writes.get(tripId) ?? Promise.resolve({})
    // A coordinated preview save must not replay a queued edit after a conflict.
    const ready = preview ? previous : previous.catch(() => ({}))
    const save = ready.then(async () => {
      if (offlineDb.name !== cacheName) throw new Error('Account changed.')
      const validated = roadtripPreferencesUpdateSchema.parse(patch)
      if (preview) return savePreviewSettings(tripId, validated, cacheName)
      if (!(await mutationQueue.mustQueue('roadtripPreferences', tripId))) {
        const saved = await apiClient.put(`/trips/${tripId}/roadtrip/preferences`, validated)
        if (offlineDb.name !== cacheName) throw new Error('Account changed.')
        await offlineDb.roadtripPreferences.put(roadtripPreferencesResponseSchema.parse(saved.data))
      } else {
        // Online and behind an older queued write: the trip may have left the
        // cache since that write was made, so read the settings in first.
        if (!isEffectivelyOffline() && !(await offlineDb.roadtripPreferences.get(tripId))) await roadtripPreferencesRepo.read(tripId)
        const next = { ...await cachedRoadtripPreferences(tripId), ...validated }
        if (next.roadtrip_day_start && next.roadtrip_day_end && next.roadtrip_day_end <= next.roadtrip_day_start) throw new Error('Day end must be later than day start.')
        await mutationQueue.enqueue({
          id: generateUUID(), tripId, method: 'PUT', url: `/trips/${tripId}/roadtrip/preferences`,
          body: validated, resource: 'roadtripPreferences', entityId: tripId,
        })
        mutationQueue.sendSoon()
      }
      return cachedRoadtripPreferences(tripId)
    })
    writes.set(tripId, save)
    void save.finally(() => { if (writes.get(tripId) === save) writes.delete(tripId) }).catch(() => {})
    return save
  },
}

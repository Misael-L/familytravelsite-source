import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { roadtripPreferencesRepo } from './roadtripPreferencesRepo'
import { offlineDb, clearAll } from '../db/offlineDb'
import { isEffectivelyOffline } from '../sync/networkMode'
import { isFamilyRoutePlanningPreview, isHostedRoadtripToursReadOnly } from '../integrations/family/routePlanningPreview'
import { mutationQueue } from '../sync/mutationQueue'
import { apiClient } from '../api/client'

vi.mock('../sync/networkMode', () => ({ onNetworkModeChange: () => () => {}, isEffectivelyOffline: vi.fn(() => true) }))
vi.mock('../integrations/family/routePlanningPreview', async importOriginal => ({
  ...await importOriginal<typeof import('../integrations/family/routePlanningPreview')>(),
  isFamilyRoutePlanningPreview: vi.fn(() => false),
  isHostedRoadtripToursReadOnly: vi.fn(() => false),
}))
vi.mock('../sync/authGate', () => ({ isAuthed: () => true }))
vi.mock('../api/client', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), request: vi.fn() } }))

beforeEach(async () => {
  await clearAll()
  vi.clearAllMocks()
  vi.mocked(isEffectivelyOffline).mockReturnValue(true)
  vi.mocked(isFamilyRoutePlanningPreview).mockReturnValue(false)
  vi.mocked(isHostedRoadtripToursReadOnly).mockReturnValue(false)
  await offlineDb.roadtripPreferences.put({ tripId: 9, preferences: { roadtrip_day_start: '08:00', roadtrip_day_end: '18:00', roadtrip_range_km: 120 } })
})

describe('trip driving preferences offline cache', () => {
  it('does not queue a settings change from the hosted saved Road trip view', async () => {
    vi.mocked(isHostedRoadtripToursReadOnly).mockReturnValue(true)
    await expect(roadtripPreferencesRepo.update(9, { roadtrip_range_km: 200 })).rejects.toThrow('Changes are paused')
    expect(apiClient.put).not.toHaveBeenCalled()
    expect(await offlineDb.mutationQueue.count()).toBe(0)
    expect((await offlineDb.roadtripPreferences.get(9))?.preferences.roadtrip_range_km).toBe(120)
  })

  it('overlays queued changes and replays into the same trip', async () => {
    await roadtripPreferencesRepo.update(9, { roadtrip_range_km: 200 })
    expect((await roadtripPreferencesRepo.read(9)).roadtrip_range_km).toBe(200)
    expect((await offlineDb.roadtripPreferences.get(9))?.preferences.roadtrip_range_km).toBe(120)
    expect(await offlineDb.mutationQueue.toArray()).toEqual([expect.objectContaining({ tripId: 9, url: '/trips/9/roadtrip/preferences', method: 'PUT', body: { roadtrip_range_km: 200 } })])
    vi.mocked(isEffectivelyOffline).mockReturnValue(false)
    vi.mocked(apiClient.request).mockResolvedValue({ data: { tripId: 9, preferences: { roadtrip_range_km: 200 } } })
    await mutationQueue.flush()
    expect(await offlineDb.mutationQueue.count()).toBe(0)
    expect((await offlineDb.roadtripPreferences.get(9))?.preferences.roadtrip_range_km).toBe(200)
    expect(await offlineDb.roadtripPreferences.get(10)).toBeUndefined()
  })
  it('refuses an uncached trip and an invalid merged day window', async () => {
    await expect(roadtripPreferencesRepo.read(10)).rejects.toThrow('not available offline')
    await expect(roadtripPreferencesRepo.update(9, { roadtrip_day_end: '07:00' })).rejects.toThrow('Day end')
    expect(await offlineDb.mutationQueue.count()).toBe(0)
  })
  it('keeps cached preferences on a rejected online update', async () => {
    vi.mocked(isEffectivelyOffline).mockReturnValue(false)
    vi.mocked(apiClient.put).mockRejectedValue(new Error('Denied'))
    await expect(roadtripPreferencesRepo.update(9, { roadtrip_range_km: 999 })).rejects.toThrow('Denied')
    expect((await offlineDb.roadtripPreferences.get(9))?.preferences.roadtrip_range_km).toBe(120)
  })
  it('queues an online change behind an older one that is parked, reading the settings in if the cache lost them', async () => {
    await roadtripPreferencesRepo.update(9, { roadtrip_range_km: 200 })
    await offlineDb.mutationQueue.toCollection().modify({ status: 'failed', attempts: 8 })
    await offlineDb.roadtripPreferences.delete(9)
    vi.mocked(isEffectivelyOffline).mockReturnValue(false)
    vi.mocked(apiClient.get).mockResolvedValue({ data: { tripId: 9, preferences: { roadtrip_day_start: '08:00', roadtrip_day_end: '18:00', roadtrip_range_km: 150 } } })

    expect((await roadtripPreferencesRepo.update(9, { roadtrip_range_km: 300 })).roadtrip_range_km).toBe(300)

    expect(apiClient.put).not.toHaveBeenCalled()
    expect((await offlineDb.mutationQueue.toArray()).map(m => [m.status, (m.body as { roadtrip_range_km: number }).roadtrip_range_km]).sort())
      .toEqual([['failed', 200], ['pending', 300]])
  })
})


describe('Family Road trip preview settings', () => {
  beforeEach(async () => {
    vi.mocked(isFamilyRoutePlanningPreview).mockReturnValue(true)
    await offlineDb.roadtripPreferences.put({ tripId: 9, preferences: { roadtrip_leg_minutes: 60 }, revision: 3, editable: true })
  })

  it('keeps the saved setting and queues nothing when offline', async () => {
    await expect(roadtripPreferencesRepo.update(9, { roadtrip_leg_minutes: 90 })).rejects.toThrow('Reconnect')
    expect(apiClient.put).not.toHaveBeenCalled()
    expect(await offlineDb.mutationQueue.count()).toBe(0)
    expect((await offlineDb.roadtripPreferences.get(9))?.preferences.roadtrip_leg_minutes).toBe(60)
  })

  it('refreshes a concurrent save without replaying edits queued behind a conflict', async () => {
    vi.mocked(isEffectivelyOffline).mockReturnValue(false)
    const conflict = { response: { status: 409 } }
    vi.mocked(apiClient.put).mockRejectedValue(conflict)
    vi.mocked(apiClient.get).mockResolvedValue({ data: { tripId: 9, preferences: { roadtrip_leg_minutes: 75 }, revision: 4, editable: true } })
    const first = roadtripPreferencesRepo.update(9, { roadtrip_leg_minutes: 90 })
    const next = roadtripPreferencesRepo.update(9, { roadtrip_day_minutes: 240 })
    await expect(first).rejects.toBe(conflict)
    await expect(next).rejects.toBe(conflict)
    expect(apiClient.put).toHaveBeenCalledExactlyOnceWith('/trips/9/family/route-preferences', {
      revision: 3, preferences: { roadtrip_leg_minutes: 90 },
    })
    expect((await offlineDb.roadtripPreferences.get(9))?.preferences.roadtrip_leg_minutes).toBe(75)
  })

  it('confirms a lost response without sending the write again', async () => {
    vi.mocked(isEffectivelyOffline).mockReturnValue(false)
    vi.mocked(apiClient.put).mockRejectedValue(new Error('lost response'))
    vi.mocked(apiClient.get).mockResolvedValue({ data: { tripId: 9, preferences: { roadtrip_leg_minutes: 90 }, revision: 4, editable: true } })
    await expect(roadtripPreferencesRepo.update(9, { roadtrip_leg_minutes: 90 })).resolves.toEqual({ roadtrip_leg_minutes: 90 })
    expect(apiClient.put).toHaveBeenCalledTimes(1)
    expect((await offlineDb.roadtripPreferences.get(9))?.revision).toBe(4)
  })
})

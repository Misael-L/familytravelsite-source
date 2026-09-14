/**
 * Family Journal adapters — UUID RPCs + runtime signed URLs.
 * Not Nest `/api/journeys`. Do not persist signed URLs.
 */
import { getSupabaseBrowserClient } from './client'
import { getMapboxAccessToken } from './env'
import { finalizePrivateUpload } from './privateUploads'
import { normalizeImageFile } from '../../utils/convertHeic'
import type {
  GalleryPhoto,
  Journey,
  JourneyContributor,
  JourneyDetail,
  JourneyEntry,
  JourneyPhoto,
  JourneyTrip,
} from '../../store/journeyStore'

export const JOURNEY_MEDIA_BUCKET = 'journey-media'
export const JOURNEY_IMAGE_MAX_BYTES = 8 * 1024 * 1024
export const JOURNEY_IMAGE_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
] as const
export const JOURNEY_SIGNED_EXPIRES_SEC = 3600

export type FamilyJourneyUpdatePatch = {
  title?: string
  subtitle?: string | null
  status?: Journey['status']
}

/** Null title/status/subtitle = omit. Empty or explicit-null subtitle clears. */
export function familyJourneyUpdateArgs(
  journeyId: string,
  patch: FamilyJourneyUpdatePatch,
): {
  p_journey_id: string
  p_title: string | null
  p_subtitle: string | null
  p_status: Journey['status'] | null
} {
  return {
    p_journey_id: journeyId,
    p_title: patch.title ?? null,
    p_subtitle: patch.subtitle === undefined ? null : (patch.subtitle ?? ''),
    p_status: patch.status ?? null,
  }
}

function throwIfError(error: { message?: string } | null): void {
  if (error) throw error
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function unixMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000
  if (typeof value === 'string' && value) {
    const t = Date.parse(value)
    return Number.isFinite(t) ? t : 0
  }
  return 0
}

function civilDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  return value.slice(0, 10)
}

function numOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function strOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t || null
}

function coverExt(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/avif') return 'avif'
  return 'jpg'
}

async function rpcJson(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args)
  throwIfError(error)
  const row = asRecord(data)
  if (!row) throw new Error(`${name} returned no payload`)
  return row
}

async function signPaths(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))]
  const out: Record<string, string> = {}
  if (unique.length === 0) return out
  const { data, error } = await getSupabaseBrowserClient()
    .storage.from(JOURNEY_MEDIA_BUCKET)
    .createSignedUrls(unique, JOURNEY_SIGNED_EXPIRES_SEC)
  if (error) throw error
  for (let i = 0; i < unique.length; i++) {
    const url = data?.[i]?.signedUrl?.trim()
    if (url && !data[i]?.error) out[unique[i]] = url
  }
  return out
}

function collectPaths(raw: Record<string, unknown>): string[] {
  const paths: string[] = []
  const cover = strOrNull(raw.cover_storage_path)
  if (cover) paths.push(cover)
  for (const item of asArray(raw.gallery)) {
    const rec = asRecord(item)
    const path = rec ? strOrNull(rec.storage_path) : null
    if (path) paths.push(path)
  }
  for (const item of asArray(raw.entries)) {
    const rec = asRecord(item)
    if (!rec) continue
    for (const photo of asArray(rec.photos)) {
      const p = asRecord(photo)
      const path = p ? strOrNull(p.storage_path) : null
      if (path) paths.push(path)
    }
  }
  return paths
}

function mapPhoto(
  raw: Record<string, unknown>,
  entryId: string | number,
  signed: Record<string, string>,
): JourneyPhoto {
  const path = strOrNull(raw.storage_path)
  const url = path ? signed[path] ?? null : null
  const mediaId = String(raw.media_id ?? raw.photo_id ?? '')
  return {
    id: String(raw.id ?? ''),
    entry_id: entryId,
    photo_id: mediaId,
    caption: strOrNull(raw.caption),
    sort_order: Number(raw.sort_order ?? 0),
    shared: 0,
    created_at: unixMs(raw.created_at),
    file_path: url,
    thumbnail_path: url,
    media_type: strOrNull(raw.media_type) || 'image',
    width: numOrNull(raw.width),
    height: numOrNull(raw.height),
  }
}

function mapGallery(raw: Record<string, unknown>, signed: Record<string, string>): GalleryPhoto {
  const path = strOrNull(raw.storage_path)
  const url = path ? signed[path] ?? null : null
  return {
    id: String(raw.id ?? ''),
    journey_id: String(raw.journey_id ?? ''),
    photo_id: String(raw.media_id ?? ''),
    caption: strOrNull(raw.caption),
    shared: 0,
    sort_order: Number(raw.sort_order ?? 0),
    created_at: unixMs(raw.created_at),
    file_path: url,
    thumbnail_path: url,
    media_type: strOrNull(raw.media_type) || 'image',
    width: numOrNull(raw.width),
    height: numOrNull(raw.height),
  }
}

function mapEntry(raw: Record<string, unknown>, signed: Record<string, string>): JourneyEntry {
  const id = String(raw.id ?? '')
  const kind = strOrNull(raw.kind) || strOrNull(raw.type) || 'entry'
  const photos = asArray(raw.photos)
    .map(item => asRecord(item))
    .filter((item): item is Record<string, unknown> => item != null)
    .map(photo => mapPhoto(photo, id, signed))
  const tags = asArray(raw.tags).filter((t): t is string => typeof t === 'string')
  const pros = asArray(raw.pros).filter((t): t is string => typeof t === 'string')
  const cons = asArray(raw.cons).filter((t): t is string => typeof t === 'string')
  return {
    id,
    journey_id: String(raw.journey_id ?? ''),
    source_trip_id: raw.source_trip_id ? String(raw.source_trip_id) : null,
    source_place_id: raw.place_id ? String(raw.place_id) : null,
    author_id: String(raw.author_person_id ?? raw.author_id ?? ''),
    type: kind as JourneyEntry['type'],
    title: strOrNull(raw.title),
    story: strOrNull(raw.story),
    entry_date: civilDate(raw.entry_date) || '',
    entry_time: strOrNull(raw.entry_time),
    location_name: strOrNull(raw.location_name),
    location_lat: numOrNull(raw.location_lat),
    location_lng: numOrNull(raw.location_lng),
    mood: strOrNull(raw.mood),
    weather: strOrNull(raw.weather),
    tags,
    pros_cons: (pros.length || cons.length) ? { pros, cons } : null,
    visibility: 'family',
    sort_order: Number(raw.sort_order ?? 0),
    photos,
    created_at: unixMs(raw.created_at),
    updated_at: unixMs(raw.updated_at),
  }
}

function mapTrip(raw: Record<string, unknown>): JourneyTrip {
  return {
    trip_id: String(raw.trip_id ?? raw.id ?? ''),
    added_at: unixMs(raw.added_at),
    title: strOrNull(raw.title) || 'Trip',
    start_date: civilDate(raw.start_date),
    end_date: civilDate(raw.end_date),
    cover_image: strOrNull(raw.cover_image),
    currency: strOrNull(raw.currency) || undefined,
    place_count: Number(raw.place_count ?? 0),
  }
}

function mapContributor(raw: Record<string, unknown>): JourneyContributor {
  return {
    journey_id: String(raw.journey_id ?? ''),
    user_id: String(raw.person_id ?? raw.user_id ?? ''),
    role: (strOrNull(raw.role) || 'viewer') as JourneyContributor['role'],
    added_at: unixMs(raw.added_at),
    username: strOrNull(raw.display_name) || strOrNull(raw.username) || 'Member',
    avatar: strOrNull(raw.avatar),
  }
}

export function mapFamilyJourneyDetail(
  raw: Record<string, unknown>,
  signed: Record<string, string> = {},
): JourneyDetail {
  const coverPath = strOrNull(raw.cover_storage_path)
  const stats = asRecord(raw.stats) || {}
  const myRole = strOrNull(raw.my_role)
  return {
    id: String(raw.id ?? ''),
    user_id: String(raw.owner_person_id ?? raw.user_id ?? ''),
    title: strOrNull(raw.title) || 'Untitled',
    subtitle: strOrNull(raw.subtitle),
    cover_image: coverPath ? signed[coverPath] ?? null : null,
    status: (strOrNull(raw.status) || 'draft') as Journey['status'],
    created_at: unixMs(raw.created_at),
    updated_at: unixMs(raw.updated_at),
    my_role: myRole as JourneyDetail['my_role'],
    hide_skeletons: raw.hide_skeletons === true,
    trip_date_min: civilDate(raw.trip_date_min),
    trip_date_max: civilDate(raw.trip_date_max),
    entries: asArray(raw.entries)
      .map(item => asRecord(item))
      .filter((item): item is Record<string, unknown> => item != null)
      .map(item => mapEntry(item, signed)),
    gallery: asArray(raw.gallery)
      .map(item => asRecord(item))
      .filter((item): item is Record<string, unknown> => item != null)
      .map(item => mapGallery(item, signed)),
    trips: asArray(raw.trips)
      .map(item => asRecord(item))
      .filter((item): item is Record<string, unknown> => item != null)
      .map(mapTrip),
    contributors: asArray(raw.contributors)
      .map(item => asRecord(item))
      .filter((item): item is Record<string, unknown> => item != null)
      .map(mapContributor),
    stats: {
      entries: Number(stats.entries ?? 0),
      photos: Number(stats.photos ?? 0),
      places: Number(stats.places ?? 0),
    },
  }
}

export function mapFamilyJourneySummary(
  raw: Record<string, unknown>,
  signed: Record<string, string> = {},
): Journey {
  const coverPath = strOrNull(raw.cover_storage_path)
  const stats = asRecord(raw.stats) || {}
  const linkedTripIds = asArray(raw.trips).flatMap(item => {
    const rec = asRecord(item)
    if (!rec) return []
    const id = rec.trip_id ?? rec.id
    return id != null && String(id) ? [String(id)] : []
  })
  return {
    id: String(raw.id ?? ''),
    user_id: String(raw.owner_person_id ?? raw.user_id ?? ''),
    title: strOrNull(raw.title) || 'Untitled',
    subtitle: strOrNull(raw.subtitle),
    cover_image: coverPath ? signed[coverPath] ?? null : null,
    status: (strOrNull(raw.status) || 'draft') as Journey['status'],
    created_at: unixMs(raw.created_at),
    updated_at: unixMs(raw.updated_at),
    my_role: strOrNull(raw.my_role) as Journey['my_role'],
    trip_date_min: civilDate(raw.trip_date_min),
    trip_date_max: civilDate(raw.trip_date_max),
    entry_count: Number(stats.entries ?? 0),
    photo_count: Number(stats.photos ?? 0),
    place_count: Number(stats.places ?? 0),
    linked_trip_ids: linkedTripIds,
  }
}

async function hydrateDetail(raw: Record<string, unknown>): Promise<JourneyDetail> {
  const signed = await signPaths(collectPaths(raw))
  return mapFamilyJourneyDetail(raw, signed)
}

export async function listFamilyJourneys(familyId: string): Promise<Journey[]> {
  const row = await rpcJson('list_family_journeys', { p_family_id: familyId })
  const journeys = asArray(row.journeys)
    .map(item => asRecord(item))
    .filter((item): item is Record<string, unknown> => item != null)
  const signed = await signPaths(journeys.flatMap(collectPaths))
  return journeys.map(item => mapFamilyJourneySummary(item, signed))
}

export async function getFamilyJourney(journeyId: string): Promise<JourneyDetail> {
  const row = await rpcJson('get_family_journey', { p_journey_id: journeyId })
  return hydrateDetail(row)
}

export async function createFamilyJourney(opts: {
  familyId: string
  title: string
  subtitle?: string
  tripIds?: string[]
}): Promise<JourneyDetail> {
  const row = await rpcJson('create_family_journey', {
    p_family_id: opts.familyId,
    p_title: opts.title,
    p_subtitle: opts.subtitle ?? null,
    p_trip_ids: opts.tripIds ?? [],
  })
  return hydrateDetail(row)
}

export async function updateFamilyJourney(
  journeyId: string,
  patch: FamilyJourneyUpdatePatch,
): Promise<JourneyDetail> {
  const row = await rpcJson('update_family_journey', familyJourneyUpdateArgs(journeyId, patch))
  return hydrateDetail(row)
}

export async function archiveFamilyJourney(journeyId: string, archived = true): Promise<JourneyDetail> {
  const row = await rpcJson('archive_family_journey', { p_journey_id: journeyId, p_archived: archived })
  return hydrateDetail(row)
}

export async function deleteFamilyJourney(journeyId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .rpc('delete_family_journey', { p_journey_id: journeyId })
  throwIfError(error)
}

export async function linkFamilyJourneyTrip(journeyId: string, tripId: string): Promise<JourneyDetail> {
  const row = await rpcJson('link_family_journey_trip', {
    p_journey_id: journeyId,
    p_trip_id: tripId,
  })
  return hydrateDetail(row)
}

export async function unlinkFamilyJourneyTrip(journeyId: string, tripId: string): Promise<JourneyDetail> {
  const row = await rpcJson('unlink_family_journey_trip', {
    p_journey_id: journeyId,
    p_trip_id: tripId,
  })
  return hydrateDetail(row)
}

export function familyEntryPayload(data: Record<string, unknown>): Record<string, unknown> {
  const pc = data.pros_cons as { pros?: unknown; cons?: unknown } | undefined
  const out: Record<string, unknown> = { ...data }
  delete out.pros_cons
  delete out.type
  if (out.kind == null && data.type != null) out.kind = data.type
  if (pc) {
    out.pros = pc.pros ?? []
    out.cons = pc.cons ?? []
  }
  return out
}

export async function upsertFamilyJourneyEntry(
  journeyId: string,
  payload: Record<string, unknown>,
  entryId?: string | null,
): Promise<JourneyDetail> {
  const row = await rpcJson('upsert_family_journey_entry', {
    p_journey_id: journeyId,
    p_entry_id: entryId ?? null,
    p_payload: familyEntryPayload(payload),
  })
  return hydrateDetail(row)
}

export async function deleteFamilyJourneyEntry(entryId: string): Promise<JourneyDetail> {
  const row = await rpcJson('delete_family_journey_entry', { p_entry_id: entryId })
  return hydrateDetail(row)
}

export async function reorderFamilyJourneyEntries(
  journeyId: string,
  orderedIds: string[],
): Promise<JourneyDetail> {
  const row = await rpcJson('reorder_family_journey_entries', {
    p_journey_id: journeyId,
    p_ordered_ids: orderedIds,
  })
  return hydrateDetail(row)
}

export async function addFamilyJourneyMember(
  journeyId: string,
  personId: string,
  role: 'editor' | 'viewer',
): Promise<JourneyDetail> {
  const row = await rpcJson('add_family_journey_member', {
    p_journey_id: journeyId,
    p_person_id: personId,
    p_role: role,
  })
  return hydrateDetail(row)
}

export async function removeFamilyJourneyMember(
  journeyId: string,
  personId: string,
): Promise<JourneyDetail> {
  const row = await rpcJson('remove_family_journey_member', {
    p_journey_id: journeyId,
    p_person_id: personId,
  })
  return hydrateDetail(row)
}

export async function setFamilyJourneyMemberPreferences(
  journeyId: string,
  hideSkeletons: boolean,
): Promise<JourneyDetail> {
  const row = await rpcJson('set_family_journey_member_preferences', {
    p_journey_id: journeyId,
    p_hide_skeletons: hideSkeletons,
  })
  return hydrateDetail(row)
}

export async function reorderFamilyJourneyEntryMedia(
  entryId: string,
  orderedIds: string[],
): Promise<JourneyDetail> {
  const row = await rpcJson('reorder_family_journey_entry_media', {
    p_entry_id: entryId,
    p_ordered_ids: orderedIds,
  })
  return hydrateDetail(row)
}

export async function attachFamilyJourneyEntryMedia(
  entryId: string,
  journeyMediaId: string,
): Promise<JourneyDetail> {
  const row = await rpcJson('attach_family_journey_entry_media', {
    p_entry_id: entryId,
    p_journey_media_id: journeyMediaId,
  })
  return hydrateDetail(row)
}

export async function detachFamilyJourneyEntryMedia(
  entryId: string,
  journeyMediaId: string,
): Promise<JourneyDetail> {
  const row = await rpcJson('detach_family_journey_entry_media', {
    p_entry_id: entryId,
    p_journey_media_id: journeyMediaId,
  })
  return hydrateDetail(row)
}

export async function deleteFamilyJourneyMedia(journeyMediaId: string): Promise<JourneyDetail> {
  const row = await rpcJson('delete_family_journey_media', { p_journey_media_id: journeyMediaId })
  return hydrateDetail(row)
}

export async function setFamilyJourneyCover(journeyId: string, mediaId: string | null): Promise<JourneyDetail> {
  const row = await rpcJson('set_family_journey_cover', {
    p_journey_id: journeyId,
    p_media_id: mediaId,
  })
  return hydrateDetail(row)
}

export async function listFamilyJourneyAvailableTrips(
  familyId: string,
  journeyId?: string | null,
): Promise<Array<{
  id: string
  title: string
  start_date: string | null
  end_date: string | null
  cover_image: string | null
  place_count: number
  linked: boolean
}>> {
  const row = await rpcJson('list_family_journey_available_trips', {
    p_family_id: familyId,
    p_journey_id: journeyId ?? null,
  })
  return asArray(row.trips).flatMap(item => {
    const rec = asRecord(item)
    if (!rec) return []
    return [{
      id: String(rec.id ?? ''),
      title: strOrNull(rec.title) || 'Trip',
      start_date: civilDate(rec.start_date),
      end_date: civilDate(rec.end_date),
      cover_image: strOrNull(rec.cover_image),
      place_count: Number(rec.place_count ?? 0),
      linked: rec.linked === true,
    }]
  })
}

export async function uploadJourneyImage(opts: {
  familyId: string
  journeyId: string
  file: File
  entryId?: string | null
}): Promise<Record<string, unknown>> {
  const file = await normalizeImageFile(opts.file)
  if (file.size > JOURNEY_IMAGE_MAX_BYTES) throw new Error('too-large')
  const mime = (file.type || '').toLowerCase()
  if (!(JOURNEY_IMAGE_MIME as readonly string[]).includes(mime)) throw new Error('bad-type')
  const filename = `${crypto.randomUUID()}.${coverExt(mime)}`
  const path = `${opts.familyId}/journeys/${opts.journeyId}/${filename}`
  const sb = getSupabaseBrowserClient()
  const { error: upErr } = await sb.storage.from(JOURNEY_MEDIA_BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  })
  if (upErr) throw upErr
  try {
    return await finalizePrivateUpload({
      kind: 'journey_image',
      path,
      journeyId: opts.journeyId,
      entryId: opts.entryId ?? undefined,
      filename,
    })
  } catch (err) {
    await sb.storage.from(JOURNEY_MEDIA_BUCKET).remove([path]).catch(() => {})
    throw err
  }
}

export type MapboxPlaceHit = {
  name: string
  address?: string
  lat: number
  lng: number
}

export async function searchMapboxPlaces(query: string): Promise<MapboxPlaceHit[]> {
  const token = getMapboxAccessToken()
  if (!token) return []
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q(query))}.json`)
  url.searchParams.set('access_token', token)
  url.searchParams.set('limit', '6')
  url.searchParams.set('types', 'place,poi,address,locality,neighborhood')
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('geocode_failed')
  const data = await res.json() as { features?: Array<{
    text?: string
    place_name?: string
    center?: [number, number]
  }> }
  return (data.features || []).flatMap(f => {
    const lng = f.center?.[0]
    const lat = f.center?.[1]
    if (typeof lat !== 'number' || typeof lng !== 'number') return []
    return [{
      name: f.text || f.place_name || query,
      address: f.place_name,
      lat,
      lng,
    }]
  })
}

function q(value: string): string {
  return value.trim()
}

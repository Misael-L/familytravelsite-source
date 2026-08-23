import { getSupabaseBrowserClient } from './client'

/** UUID trip destination — not `@trek/shared` Place. */
export type FamilyTripPlace = {
  id: string
  name: string
  lat: number | null
  lng: number | null
  notes: string | null
  timeZone: string | null
  countryId: string | null
  placeTypeId: string | null
  isPrimary: boolean
  imageUrl: string | null
  familyPlaceCategoryId: string | null
  familyPlaceCategoryName: string | null
  familyPlaceCategoryColor: string | null
  familyPlaceCategoryIcon: string | null
}

/** Map pin subset — coords required. */
export type FamilyTripPlacePin = {
  id: string
  title: string
  lat: number
  lng: number
  isPrimary: boolean
}

type CoverMediaRow = { public_url?: string | null }
type CoverEmbed = CoverMediaRow | CoverMediaRow[] | null

type PlaceEmbed = {
  id: string
  name: string | null
  latitude: number | string | null
  longitude: number | string | null
  notes: string | null
  time_zone: string | null
  country_id: string | null
  place_type_id: string | null
  cover_media?: CoverEmbed
}

type CategoryEmbed = {
  id?: string | null
  name?: string | null
  color_hex?: string | null
  icon_key?: string | null
}

type TripPlaceJoinRow = {
  place_id: string
  is_primary: boolean | null
  family_place_category_id?: string | null
  places: PlaceEmbed | PlaceEmbed[] | null
  family_place_categories?: CategoryEmbed | CategoryEmbed[] | null
}

const COVER_EMBED = 'cover_media:media_assets!cover_media_id(public_url)'
const PLACE_EMBED =
  `id,name,latitude,longitude,notes,time_zone,country_id,place_type_id,${COVER_EMBED}`
const PLACE_EMBED_FALLBACK =
  'id,name,latitude,longitude,notes,time_zone,country_id,place_type_id'
const CATEGORY_EMBED = 'family_place_categories(id,name,color_hex,icon_key)'

function embedPlace(raw: PlaceEmbed | PlaceEmbed[] | null): PlaceEmbed | null {
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

function embedCategory(raw: CategoryEmbed | CategoryEmbed[] | null | undefined): CategoryEmbed | null {
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

function coverPublicUrl(embed: CoverEmbed | undefined): string | null {
  if (!embed) return null
  const row: CoverMediaRow | undefined = Array.isArray(embed) ? embed[0] : embed
  const url = row?.public_url?.trim()
  return url || null
}

function toCoord(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

type HubPlaceJoinRow = {
  trip_id: string | null
  place_id: string | null
  places: PlaceEmbed | PlaceEmbed[] | null
}

export type FamilyHubPlaceRow = {
  tripId: string
  placeId: string
  name: string | null
  lat: number | null
  lng: number | null
  imageUrl: string | null
}

const HUB_PLACE_EMBED = 'name,latitude,longitude'
const HUB_PLACE_EMBED_COVER = `${HUB_PLACE_EMBED},${COVER_EMBED}`

function mapHubRows(data: unknown): FamilyHubPlaceRow[] {
  const out: FamilyHubPlaceRow[] = []
  for (const row of (data ?? []) as unknown as HubPlaceJoinRow[]) {
    if (!row.trip_id || !row.place_id) continue
    const place = embedPlace(row.places)
    out.push({
      tripId: row.trip_id,
      placeId: row.place_id,
      name: place?.name?.trim() || null,
      lat: toCoord(place?.latitude ?? null),
      lng: toCoord(place?.longitude ?? null),
      imageUrl: coverPublicUrl(place?.cover_media),
    })
  }
  return out
}

/**
 * Hub-light destinations — name + coords + catalog cover.
 * Cover embed failure retries name/coords so place_count never zeros.
 */
export async function listHubTripPlaces(tripIds: string[]): Promise<FamilyHubPlaceRow[]> {
  if (tripIds.length === 0) return []

  const sb = getSupabaseBrowserClient()
  const { data, error } = await sb
    .from('trip_places')
    .select(`trip_id,place_id,places(${HUB_PLACE_EMBED_COVER})`)
    .in('trip_id', tripIds)

  if (!error) return mapHubRows(data)

  const retry = await sb
    .from('trip_places')
    .select(`trip_id,place_id,places(${HUB_PLACE_EMBED})`)
    .in('trip_id', tripIds)
  if (retry.error) throw retry.error
  return mapHubRows(retry.data)
}

function rowToFamilyTripPlace(row: TripPlaceJoinRow): FamilyTripPlace | null {
  const place = embedPlace(row.places)
  if (!place?.id) return null
  const category = embedCategory(row.family_place_categories)
  const categoryId = row.family_place_category_id ?? category?.id ?? null
  return {
    id: place.id,
    name: place.name?.trim() || 'Untitled place',
    lat: toCoord(place.latitude),
    lng: toCoord(place.longitude),
    notes: place.notes ?? null,
    timeZone: place.time_zone ?? null,
    countryId: place.country_id ?? null,
    placeTypeId: place.place_type_id ?? null,
    isPrimary: Boolean(row.is_primary),
    imageUrl: coverPublicUrl(place.cover_media),
    familyPlaceCategoryId: categoryId,
    familyPlaceCategoryName: category?.name?.trim() || null,
    familyPlaceCategoryColor: category?.color_hex?.trim() || null,
    familyPlaceCategoryIcon: category?.icon_key?.trim() || null,
  }
}

/** All trip destinations, including rows without coordinates (sidebar can list them). */
export async function listTripPlaces(tripId: string): Promise<FamilyTripPlace[]> {
  const sb = getSupabaseBrowserClient()
  const { data, error } = await sb
    .from('trip_places')
    .select(`place_id,is_primary,family_place_category_id,places(${PLACE_EMBED}),${CATEGORY_EMBED}`)
    .eq('trip_id', tripId)

  const rows = !error
    ? data
    : (await (async () => {
        const retry = await sb
          .from('trip_places')
          .select(`place_id,is_primary,family_place_category_id,places(${PLACE_EMBED_FALLBACK})`)
          .eq('trip_id', tripId)
        if (retry.error) throw retry.error
        return retry.data
      })())

  return ((rows ?? []) as unknown as TripPlaceJoinRow[])
    .map(rowToFamilyTripPlace)
    .filter((p): p is FamilyTripPlace => p != null)
}

export function tripPlacesToPins(places: FamilyTripPlace[]): FamilyTripPlacePin[] {
  return places
    .filter((p): p is FamilyTripPlace & { lat: number; lng: number } =>
      p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map(p => ({
      id: p.id,
      title: p.name,
      lat: p.lat,
      lng: p.lng,
      isPrimary: p.isPrimary,
    }))
}

/** Destination pins with valid lat/lng — map source. */
export async function listTripPlacePins(tripId: string): Promise<FamilyTripPlacePin[]> {
  return tripPlacesToPins(await listTripPlaces(tripId))
}

/**
 * Insert `{ trip_id, place_id, is_primary: false }` if missing.
 * Returns whether a row was inserted (mirror iOS `upsertTripPlace`).
 */
export async function upsertTripPlace(
  tripId: string,
  placeId: string,
  isPrimary = false,
): Promise<boolean> {
  const sb = getSupabaseBrowserClient()
  const { data: existing, error: selErr } = await sb
    .from('trip_places')
    .select('place_id')
    .eq('trip_id', tripId)
    .eq('place_id', placeId)
    .limit(1)
  if (selErr) throw selErr
  if (existing && existing.length > 0) return false

  const { error } = await sb
    .from('trip_places')
    .insert({ trip_id: tripId, place_id: placeId, is_primary: isPrimary })
  if (error) throw error
  return true
}

/** Patch only the Family palette FK. Does not touch is_primary or catalog place_type_id. */
export async function updateTripPlaceCategory(
  tripId: string,
  placeId: string,
  familyPlaceCategoryId: string | null,
): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('trip_places')
    .update({ family_place_category_id: familyPlaceCategoryId })
    .eq('trip_id', tripId)
    .eq('place_id', placeId)
  if (error) throw error
}

/**
 * Clear `schedule_items` for this place, then delete `trip_places`.
 * Same order as iOS `deleteTripPlace` so W5 does not inherit orphans.
 */
export async function deleteTripPlace(tripId: string, placeId: string): Promise<void> {
  const sb = getSupabaseBrowserClient()
  const { error: schedErr } = await sb
    .from('schedule_items')
    .delete()
    .eq('trip_id', tripId)
    .eq('place_id', placeId)
  if (schedErr) throw schedErr

  const { error } = await sb
    .from('trip_places')
    .delete()
    .eq('trip_id', tripId)
    .eq('place_id', placeId)
  if (error) throw error
}

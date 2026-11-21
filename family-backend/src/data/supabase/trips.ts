import { getSupabaseBrowserClient } from './client'
import { listHubTripPlaces } from './tripPlaces'
import { listHubTripTravelers } from './tripTravelers'
import {
  attachHubMemberAvatars,
  listPeopleAvatarRefs,
  signAvatarUrls,
} from './personAvatars'
import {
  type FamilyDashboardTrip,
  applyHubEnrichment,
  familyTripRowToDashboardTrip,
} from '../../pages/dashboard/familyDashboardModel'

export type FamilyTripRow = {
  id: string
  family_id: string
  name: string
  primary_country_id: string | null
  start_at: string | null
  end_at: string | null
  status: string
  cover_url: string | null
  notes: string | null
  occasion: string | null
  reminder_days: number | null
  archived_at: string | null
  currency_code: string | null
}

const TRIP_SELECT =
  'id,family_id,name,primary_country_id,start_at,end_at,status,cover_url,notes,occasion,reminder_days,archived_at,currency_code'

/** Active trips for a family — mirrors iOS TripsService.fetchTrips. */
export async function listActiveTrips(familyId: string): Promise<FamilyDashboardTrip[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trips')
    .select(TRIP_SELECT)
    .eq('family_id', familyId)
    .is('archived_at', null)
    .order('start_at', { ascending: true })

  if (error) throw error
  return ((data ?? []) as FamilyTripRow[]).map(familyTripRowToDashboardTrip)
}

/** Archived trips for a family — mirrors iOS TripsService.fetchArchivedTrips. */
export async function listArchivedTrips(familyId: string): Promise<FamilyDashboardTrip[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trips')
    .select(TRIP_SELECT)
    .eq('family_id', familyId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as FamilyTripRow[]).map(familyTripRowToDashboardTrip)
}

export async function listFamilyTrips(familyId: string): Promise<{
  trips: FamilyDashboardTrip[]
  archivedTrips: FamilyDashboardTrip[]
}> {
  const [active, archived] = await Promise.all([
    listActiveTrips(familyId),
    listArchivedTrips(familyId),
  ])
  const archivedIds = new Set(archived.map(t => t.id))
  const enriched = await enrichFamilyHubTrips([...active, ...archived], familyId)
  return {
    trips: enriched.filter(t => !archivedIds.has(t.id)),
    archivedTrips: enriched.filter(t => archivedIds.has(t.id)),
  }
}

/** Best-effort iOS-style hub enrichment. Each query fails independently. */
export async function enrichFamilyHubTrips(
  trips: FamilyDashboardTrip[],
  familyId?: string,
): Promise<FamilyDashboardTrip[]> {
  const tripIds = trips.map(t => t.id)
  if (tripIds.length === 0) return trips

  const [travelerResult, placeResult] = await Promise.allSettled([
    listHubTripTravelers(tripIds),
    listHubTripPlaces(tripIds),
  ])
  const travelers = travelerResult.status === 'fulfilled' ? travelerResult.value : []
  const places = placeResult.status === 'fulfilled' ? placeResult.value : []
  const enriched = applyHubEnrichment(trips, travelers, places)

  if (!familyId) return enriched
  const personIds = [...new Set(enriched.flatMap(t => (t.hub_members ?? []).map(m => m.personId)))]
  if (personIds.length === 0) return enriched
  try {
    const refs = await listPeopleAvatarRefs(familyId)
    const urls = await signAvatarUrls(refs, personIds)
    return attachHubMemberAvatars(enriched, urls)
  } catch {
    return enriched
  }
}

/** Postgres RLS / privilege denial (archive/delete for non-reviewers). */
export function isPermissionDenied(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  if (e.code === '42501' || e.code === 'PGRST301') return true
  const msg = (e.message ?? '').toLowerCase()
  return msg.includes('row-level security') || msg.includes('permission denied')
}

function denied(): Error {
  return Object.assign(new Error('permission denied'), { code: '42501' })
}

/** Family-wide archive — `trips.archived_at`. Reviewer RLS. */
export async function archiveTrip(tripId: string): Promise<FamilyDashboardTrip> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trips')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', tripId)
    .select(TRIP_SELECT)

  if (error) throw error
  const row = (data ?? [])[0] as FamilyTripRow | undefined
  if (!row) throw denied()
  return familyTripRowToDashboardTrip(row)
}

export async function unarchiveTrip(tripId: string): Promise<FamilyDashboardTrip> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trips')
    .update({ archived_at: null })
    .eq('id', tripId)
    .select(TRIP_SELECT)

  if (error) throw error
  const row = (data ?? [])[0] as FamilyTripRow | undefined
  if (!row) throw denied()
  return familyTripRowToDashboardTrip(row)
}

/** Family-wide hard delete. Reviewer RLS. Empty result = denied (PostgREST RLS). */
export async function deleteTrip(tripId: string): Promise<void> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trips')
    .delete()
    .eq('id', tripId)
    .select('id')

  if (error) throw error
  if (!data?.length) throw denied()
}

/** Single trip by UUID — workspace shell header (RLS). */
export async function fetchTripById(tripId: string): Promise<FamilyDashboardTrip | null> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trips')
    .select(TRIP_SELECT)
    .eq('id', tripId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return familyTripRowToDashboardTrip(data as FamilyTripRow)
}

import { getSupabaseBrowserClient } from './client'
import { captureFamilyOperation } from './operationContext'
import { signedTripFileUrls } from './tripFiles'

export const TRIP_COVER_LIMIT = 8 * 1024 * 1024
export const TRIP_COVER_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
export const TRIP_COVER_SIGN_SECONDS = 3600
const uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'
export const TRIP_COVER_PATH = new RegExp(`^${uuid}/${uuid}/cover-[0-9a-f]{64}\\.(jpg|png|webp|gif|avif)$`)

export async function uploadNewTripCover(operationId: string, tripId: string, file: File): Promise<void> {
  const { data, error } = await getSupabaseBrowserClient().functions.invoke<{ trip_id?: string }>('save-trip-cover', {
    body: file,
    headers: { 'Content-Type': file.type, 'x-family-operation-id': operationId },
  })
  if (error || data?.trip_id !== tripId) throw new Error('The trip was created but its cover could not be saved.')
}

export async function readTripCoverUrls(tripIds: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  const scope = captureFamilyOperation()
  for (let offset = 0; offset < tripIds.length; offset += 100) {
    const ids = new Set(tripIds.slice(offset, offset + 100))
    const { data, error } = await scope.perform(async () =>
      getSupabaseBrowserClient().rpc('list_family_trip_cover_paths_v1', { p_trip_ids: [...ids] })
    )
    if (error) throw error
    const paths = new Map<string, string>()
    for (const row of (data ?? []) as { trip_id: string; storage_path: string }[]) {
      if (ids.has(row.trip_id) && TRIP_COVER_PATH.test(row.storage_path) && row.storage_path.split('/')[1] === row.trip_id) {
        paths.set(row.trip_id, row.storage_path)
      }
    }
    if (!paths.size) continue
    const signed = await scope.perform(() => signedTripFileUrls([...paths.values()], TRIP_COVER_SIGN_SECONDS))
    for (const [trip, path] of paths) {
      const url = signed.get(path)
      if (url) urls.set(trip, url)
    }
  }
  return urls
}

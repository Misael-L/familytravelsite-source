import { getSupabaseBrowserClient } from './client'

export type PrivateUploadKind = 'trip_file' | 'person_avatar' | 'list_cover'

export async function finalizePrivateUpload(body: {
  kind: PrivateUploadKind
  path: string
  tripId?: string
  personId?: string
  listId?: string
  originalName?: string
  filename?: string
}): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabaseBrowserClient().functions.invoke<
    { ok?: boolean; error?: string; result?: Record<string, unknown> }
  >('finalize-private-upload', {
    body: {
      kind: body.kind,
      path: body.path,
      trip_id: body.tripId,
      person_id: body.personId,
      list_id: body.listId,
      original_name: body.originalName,
      filename: body.filename,
    },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return (data?.result ?? data ?? {}) as Record<string, unknown>
}

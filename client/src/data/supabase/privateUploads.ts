import { getSupabaseBrowserClient } from './client'

export type PrivateUploadKind = 'trip_file' | 'person_avatar' | 'list_cover'

/** Prefer the Edge Function's stable `error` code; never dump response bodies. */
export async function readFunctionsErrorMessage(
  error: unknown,
  data?: { error?: string } | null,
): Promise<string> {
  if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim()
  const ctx = error && typeof error === 'object' && 'context' in error
    ? (error as { context?: { json?: () => Promise<unknown> } }).context
    : undefined
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
        const code = (body as { error: string }).error.trim()
        if (code) return code
      }
    } catch { /* ignore non-JSON bodies */ }
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return 'finalize_failed'
}

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
  if (error || data?.error) {
    throw new Error(await readFunctionsErrorMessage(error, data))
  }
  return (data?.result ?? data ?? {}) as Record<string, unknown>
}

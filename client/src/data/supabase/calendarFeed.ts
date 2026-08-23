import { getSupabaseBrowserClient } from './client'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

const MANAGE_FN = 'manage-calendar-feed'

type TokenResponse = {
  feed_url?: string | null
  error?: string
}

function requireIds(familyId: string, personId: string): { familyId: string; personId: string } {
  const f = familyId.trim()
  const p = personId.trim()
  if (!f || !p) throw new Error('family_id and person_id are required')
  return { familyId: f, personId: p }
}

async function throwIfFunctionError(error: unknown, data: TokenResponse | null | undefined): Promise<never> {
  if (data?.error) throw new Error(data.error)
  const ctx = error && typeof error === 'object' && 'context' in error
    ? (error as { context: unknown }).context
    : null
  if (ctx && typeof ctx === 'object' && ctx !== null && 'json' in ctx && typeof (ctx as Response).json === 'function') {
    const body = await (ctx as Response).clone().json().catch(() => null) as TokenResponse | null
    if (body?.error) throw new Error(body.error)
  }
  if (error != null) throw error
  throw new Error('Calendar feed request failed')
}

/**
 * Family Edge `manage-calendar-feed` GET — JWT + query ids. JS invoke has no query option.
 * Opening the modal must not mint a token.
 */
export async function fetchCalendarFeedUrl(familyId: string, personId: string): Promise<string | null> {
  const ids = requireIds(familyId, personId)
  const client = getSupabaseBrowserClient()
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Sign in and join a family to subscribe.')

  const url = new URL(`${getSupabaseUrl().replace(/\/$/, '')}/functions/v1/${MANAGE_FN}`)
  url.searchParams.set('family_id', ids.familyId)
  url.searchParams.set('person_id', ids.personId)

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: getSupabaseAnonKey(),
    },
  })
  const body = await res.json().catch(() => null) as TokenResponse | null
  if (!res.ok || body?.error) {
    throw new Error(body?.error || `Calendar feed request failed (${res.status})`)
  }
  return body?.feed_url ?? null
}

async function mutateCalendarFeed(
  method: 'POST' | 'PUT' | 'DELETE',
  familyId: string,
  personId: string,
): Promise<string | null> {
  const ids = requireIds(familyId, personId)
  const { data, error } = await getSupabaseBrowserClient().functions.invoke<TokenResponse>(MANAGE_FN, {
    method,
    body: { family_id: ids.familyId, person_id: ids.personId },
  })
  if (error) await throwIfFunctionError(error, data)
  if (data?.error) throw new Error(data.error)
  return data?.feed_url ?? null
}

export async function enableCalendarFeed(familyId: string, personId: string): Promise<string> {
  const feedUrl = await mutateCalendarFeed('POST', familyId, personId)
  if (!feedUrl) throw new Error('No feed URL returned')
  return feedUrl
}

export async function regenerateCalendarFeed(familyId: string, personId: string): Promise<string> {
  const feedUrl = await mutateCalendarFeed('PUT', familyId, personId)
  if (!feedUrl) throw new Error('No feed URL returned')
  return feedUrl
}

export async function disableCalendarFeed(familyId: string, personId: string): Promise<void> {
  await mutateCalendarFeed('DELETE', familyId, personId)
}

/** TREK / iOS SubscribeLinks: https feed → webcal:// for Apple/Outlook + Google cid. */
export function webcalUrlFromHttps(httpsUrl: string): string {
  if (httpsUrl.startsWith('https://')) return 'webcal://' + httpsUrl.slice('https://'.length)
  if (httpsUrl.startsWith('http://')) return 'webcal://' + httpsUrl.slice('http://'.length)
  return httpsUrl
}

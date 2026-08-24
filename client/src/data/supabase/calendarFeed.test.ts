import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  disableCalendarFeed,
  enableCalendarFeed,
  fetchCalendarFeedUrl,
  regenerateCalendarFeed,
  webcalUrlFromHttps,
} from './calendarFeed'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

vi.mock('./env', () => ({
  getSupabaseUrl: () => 'https://example.supabase.co',
  getSupabaseAnonKey: () => 'anon-key',
}))

const FAMILY = 'fam-1'
const PERSON = 'per-1'
const FEED = 'https://example.supabase.co/functions/v1/calendar-feed?token=abc&apikey=anon-key'

const getSession = vi.fn()
const invoke = vi.fn()
const fetchMock = vi.fn()

beforeEach(() => {
  getSession.mockReset()
  invoke.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({
    auth: { getSession },
    functions: { invoke },
  } as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('webcalUrlFromHttps', () => {
  it('rewrites https and http to webcal', () => {
    expect(webcalUrlFromHttps('https://host/feed')).toBe('webcal://host/feed')
    expect(webcalUrlFromHttps('http://host/feed')).toBe('webcal://host/feed')
    expect(webcalUrlFromHttps('webcal://host/feed')).toBe('webcal://host/feed')
  })
})

describe('fetchCalendarFeedUrl', () => {
  it('GETs manage-calendar-feed with query ids and does not invoke', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } }, error: null })
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ feed_url: FEED }),
    })

    await expect(fetchCalendarFeedUrl(FAMILY, PERSON)).resolves.toBe(FEED)

    expect(invoke).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/functions/v1/manage-calendar-feed?')
    expect(url).toContain('family_id=fam-1')
    expect(url).toContain('person_id=per-1')
    expect(init.method).toBe('GET')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer jwt',
      apikey: 'anon-key',
    })
  })

  it('returns null when the feed is disabled', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } }, error: null })
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ feed_url: null }),
    })
    await expect(fetchCalendarFeedUrl(FAMILY, PERSON)).resolves.toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('throws on JSON error without POSTing', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } }, error: null })
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'You can only manage your own calendar feed' }),
    })
    await expect(fetchCalendarFeedUrl(FAMILY, PERSON)).rejects.toThrow(
      'You can only manage your own calendar feed',
    )
    expect(invoke).not.toHaveBeenCalled()
  })

  it('throws when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(fetchCalendarFeedUrl(FAMILY, PERSON)).rejects.toThrow(
      'Sign in and join a family to subscribe.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('throws when ids are missing', async () => {
    await expect(fetchCalendarFeedUrl('  ', PERSON)).rejects.toThrow(
      'family_id and person_id are required',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('calendarFeed mutations', () => {
  it('enable POSTs body and returns feed_url', async () => {
    invoke.mockResolvedValue({ data: { feed_url: FEED }, error: null })
    await expect(enableCalendarFeed(FAMILY, PERSON)).resolves.toBe(FEED)
    expect(invoke).toHaveBeenCalledWith('manage-calendar-feed', {
      method: 'POST',
      body: { family_id: FAMILY, person_id: PERSON },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('regenerate PUTs body', async () => {
    invoke.mockResolvedValue({ data: { feed_url: FEED }, error: null })
    await expect(regenerateCalendarFeed(FAMILY, PERSON)).resolves.toBe(FEED)
    expect(invoke).toHaveBeenCalledWith('manage-calendar-feed', {
      method: 'PUT',
      body: { family_id: FAMILY, person_id: PERSON },
    })
  })

  it('disable DELETEs body', async () => {
    invoke.mockResolvedValue({ data: { feed_url: null }, error: null })
    await disableCalendarFeed(FAMILY, PERSON)
    expect(invoke).toHaveBeenCalledWith('manage-calendar-feed', {
      method: 'DELETE',
      body: { family_id: FAMILY, person_id: PERSON },
    })
  })

  it('throws on invoke { error }', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'nope' } })
    await expect(enableCalendarFeed(FAMILY, PERSON)).rejects.toMatchObject({ message: 'nope' })
  })

  it('throws on JSON error in data', async () => {
    invoke.mockResolvedValue({ data: { error: 'Person not found in this family' }, error: null })
    await expect(enableCalendarFeed(FAMILY, PERSON)).rejects.toThrow('Person not found in this family')
  })

  it('throws when POST returns no feed_url', async () => {
    invoke.mockResolvedValue({ data: { feed_url: null }, error: null })
    await expect(enableCalendarFeed(FAMILY, PERSON)).rejects.toThrow('No feed URL returned')
  })
})

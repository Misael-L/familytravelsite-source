// FE-SYNC-CONNECTIVITY: probeNow must tell a genuine offline (network error —
// never tear down the SW) apart from an edge-proxy auth wall (#1346).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { probeNow, startConnectivityProbe, stopConnectivityProbe } from '../../../src/sync/connectivity'

function setOnline(v: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
}

function fetchReturns(res: Partial<Response>): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res as Response))
}

afterEach(() => {
  stopConnectivityProbe()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setOnline(true)
  vi.stubEnv('VITE_DATA_PLANE', 'nest')
})

describe('FE-SYNC-CONNECTIVITY: probeNow offline vs proxy-wall (#1346)', () => {
  it('FE-SYNC-CONNECTIVITY-001: navigator.onLine false → "offline"', async () => {
    setOnline(false)
    expect(await probeNow()).toBe('offline')
  })

  it('FE-SYNC-CONNECTIVITY-002: fetch throws (network error) → "offline" (must NOT unregister the SW)', async () => {
    setOnline(true)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(await probeNow()).toBe('offline')
  })

  it('FE-SYNC-CONNECTIVITY-003: ok JSON health → "online"', async () => {
    setOnline(true)
    fetchReturns({ type: 'basic', ok: true, headers: new Headers({ 'content-type': 'application/json' }) })
    expect(await probeNow()).toBe('online')
  })

  it('FE-SYNC-CONNECTIVITY-004: cross-origin auth redirect (CF Access) → "proxy-wall"', async () => {
    setOnline(true)
    fetchReturns({ type: 'opaqueredirect', ok: false, headers: new Headers() })
    expect(await probeNow()).toBe('proxy-wall')
  })

  it('FE-SYNC-CONNECTIVITY-005: HTML auth wall (Pangolin 200) → "proxy-wall"', async () => {
    setOnline(true)
    fetchReturns({ type: 'basic', ok: true, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }) })
    expect(await probeNow()).toBe('proxy-wall')
  })

  it('FE-SYNC-CONNECTIVITY-006: edge 401/403 (non-JSON) → "proxy-wall"', async () => {
    setOnline(true)
    fetchReturns({ type: 'basic', ok: false, headers: new Headers({ 'content-type': 'text/html' }) })
    expect(await probeNow()).toBe('proxy-wall')
  })

  it('Family plane probes Supabase Auth health instead of Nest /api/health', async () => {
    vi.stubEnv('VITE_DATA_PLANE', 'supabase')
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const fetchMock = vi.fn().mockResolvedValue({
      type: 'basic',
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    setOnline(true)
    expect(await probeNow()).toBe('online')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/v1/health')
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('/api/health')
  })
})

describe('connectivity probe lifecycle', () => {
  it('start is idempotent and stop clears the interval', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      type: 'basic',
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    startConnectivityProbe()
    startConnectivityProbe()
    await probeNow()
    const callsAfterStart = fetchMock.mock.calls.length
    stopConnectivityProbe()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fetchMock.mock.calls.length).toBe(callsAfterStart)
    stopConnectivityProbe()
  })
})

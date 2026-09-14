import { isSupabaseDataPlane } from '../data/supabase/auth'
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseEnv } from '../data/supabase/env'

const PROBE_INTERVAL_MS = 30_000
const PROBE_TIMEOUT_MS = 1_500

// Three distinct outcomes so callers can tell a genuine offline (the request
// never reached a server — never tear down offline infrastructure) apart from an
// edge-proxy auth wall (CF Access / Pangolin intercept /api — a top-level reload
// is needed so the proxy can run its auth flow).
export type ProbeState = 'online' | 'offline' | 'proxy-wall'

let reachable = true
let probeState: ProbeState = 'online'
let started = false
let intervalId: ReturnType<typeof setInterval> | null = null
let onOnline: (() => void) | null = null
let onOffline: (() => void) | null = null
const listeners = new Set<(v: boolean) => void>()
const stateListeners = new Set<(v: ProbeState) => void>()

function setReachable(v: boolean): void {
  if (reachable === v) return
  reachable = v
  listeners.forEach(fn => fn(v))
}

function setProbeState(next: ProbeState): void {
  if (probeState !== next) {
    probeState = next
    stateListeners.forEach(fn => fn(next))
  }
  setReachable(next === 'online')
}

function supabaseHealthTarget(): { url: string; headers: HeadersInit } | null {
  if (!hasSupabaseEnv()) return null
  try {
    const base = getSupabaseUrl().replace(/\/$/, '')
    return {
      url: `${base}/auth/v1/health`,
      headers: { apikey: getSupabaseAnonKey() },
    }
  } catch {
    return null
  }
}

async function classifyResponse(res: Response): Promise<ProbeState> {
  if (res.type === 'opaqueredirect') return 'proxy-wall'
  const ct = res.headers.get('content-type') || ''
  if (res.ok && ct.includes('application/json')) return 'online'
  return 'proxy-wall'
}

async function probe(): Promise<ProbeState> {
  if (!navigator.onLine) {
    setProbeState('offline')
    return 'offline'
  }

  const familyPlane = isSupabaseDataPlane()
  const target = familyPlane
    ? supabaseHealthTarget()
    : { url: '/api/health', headers: {} as HeadersInit }

  if (!target) {
    // Family plane without env cannot probe Nest /api/health. Trust navigator.onLine.
    setProbeState('online')
    return 'online'
  }

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
    const res = await fetch(target.url, {
      method: 'GET',
      credentials: familyPlane ? 'omit' : 'include',
      cache: 'no-store',
      headers: target.headers,
      redirect: 'manual',
      signal: ctrl.signal,
    })
    clearTimeout(t)
    const state = await classifyResponse(res)
    setProbeState(state)
    return state
  } catch {
    // fetch threw → the request never completed: genuinely offline (or the server
    // is down). Must NOT be treated as a proxy wall — that would unregister the SW.
    setProbeState('offline')
    return 'offline'
  }
}

export function startConnectivityProbe(): void {
  if (started) return
  started = true
  void probe()
  intervalId = setInterval(() => { void probe() }, PROBE_INTERVAL_MS)
  onOnline = () => { void probe() }
  onOffline = () => { setProbeState('offline') }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
}

export function stopConnectivityProbe(): void {
  if (!started) return
  started = false
  if (intervalId != null) {
    clearInterval(intervalId)
    intervalId = null
  }
  if (onOnline) window.removeEventListener('online', onOnline)
  if (onOffline) window.removeEventListener('offline', onOffline)
  onOnline = null
  onOffline = null
}

export function isReachable(): boolean { return reachable }
export function getProbeState(): ProbeState { return probeState }
export function probeNow(): Promise<ProbeState> { return probe() }
export function onChange(fn: (v: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function onProbeStateChange(fn: (v: ProbeState) => void): () => void {
  stateListeners.add(fn)
  return () => stateListeners.delete(fn)
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopConnectivityProbe()
  })
}

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { normalize, resolve } from 'node:path'

export type Fta47rEnv = Record<string, string>

export const FTA47R_CURRENT_STACK_API_PORT = '54321'
export const FTA47R_CURRENT_STACK_DB_PORT = '54322'

const PROD_HOST = /gdqywxjlkcrsuylqdhmc|supabase\.co/i

export function loadFta47rEnvFile(filePath: string): Fta47rEnv {
  if (!filePath) throw new Error('FTA47R_E2E_ENV_FILE is required')
  if (!existsSync(filePath)) throw new Error(`FTA47R_E2E_ENV_FILE missing: ${filePath}`)
  const out: Fta47rEnv = {}
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return out
}

export function canonicalizePath(p: string): string {
  const abs = resolve(normalize(p))
  try {
    if (existsSync(abs)) return realpathSync(abs)
  } catch {
    /* ignore missing/unreadable targets */
  }
  return abs
}

function readConfigToml(workdir: string): string {
  const cfg = `${workdir.replace(/\/$/, '')}/supabase/config.toml`
  if (!existsSync(cfg)) {
    throw new Error('disposable workdir missing supabase/config.toml')
  }
  return readFileSync(cfg, 'utf8')
}

export function readConfigProjectId(workdir: string): string {
  const match = readConfigToml(workdir).match(/^\s*project_id\s*=\s*"?([^"\n]+)"?/m)
  return (match?.[1] || '').trim()
}

/** Authoritative local API port from `[api]` (not `[db]` / nested tables). */
export function readConfigApiPort(workdir: string): string {
  const lines = readConfigToml(workdir).split(/\r?\n/)
  let inApi = false
  for (const line of lines) {
    const header = line.match(/^\[([^\]]+)\]/)
    if (header) {
      inApi = header[1] === 'api'
      continue
    }
    if (!inApi) continue
    const port = line.match(/^\s*port\s*=\s*"?(\d+)"?/)
    if (port) return port[1]
  }
  return ''
}

export function isCheckoutWorkdir(dir: string): boolean {
  const n = canonicalizePath(dir)
  return /(?:^|\/)FamilyTravelApp(?:\/|$)/.test(n)
    || /(?:^|\/)FamilyTravelSite(?:\/|$)/.test(n)
}

/** Classify JWT iss/ref without returning the token. */
export function jwtIdentity(token: string): 'prod' | string {
  const parts = token.split('.')
  if (parts.length < 2) return ''
  const pad = '='.repeat((4 - (parts[1].length % 4)) % 4)
  try {
    const payload = JSON.parse(Buffer.from(parts[1] + pad, 'base64url').toString('utf8')) as {
      iss?: unknown
      ref?: unknown
    }
    const iss = String(payload.iss || '')
    const ref = String(payload.ref || '')
    const blob = `${iss} ${ref}`.toLowerCase()
    if (PROD_HOST.test(blob)) return 'prod'
    if (!iss) return ''
    const parsed = new URL(iss)
    return parsed.port ? String(parsed.port) : ''
  } catch {
    return ''
  }
}

export type Fta47rRuntime = {
  FTA47R_DISPOSABLE_REQUIRED?: string
  FTA47R_PROJECT_ID?: string
  FTA47R_DISPOSABLE_WORKDIR?: string
  FTA47R_E2E_ENV_FILE?: string
}

function firstDefined(...vals: Array<string | undefined>): string {
  for (const v of vals) {
    if (v != null && v !== '') return v
  }
  return ''
}

export function assertFta47rEnvIdentity(env: Fta47rEnv, runtime: Fta47rRuntime = process.env): Fta47rEnv {
  const url = env.VITE_SUPABASE_URL || ''
  if (!url || PROD_HOST.test(url)) {
    throw new Error('§47R Playwright refused a production-looking VITE_SUPABASE_URL')
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('§47R Playwright VITE_SUPABASE_URL is not a URL')
  }
  if (parsed.hostname !== '127.0.0.1') {
    throw new Error('§47R Playwright VITE_SUPABASE_URL must be 127.0.0.1')
  }

  const disposable = runtime.FTA47R_DISPOSABLE_REQUIRED === '1' || env.FTA47R_DISPOSABLE_REQUIRED === '1'
  const projectId = firstDefined(runtime.FTA47R_PROJECT_ID, env.FTA47R_PROJECT_ID)
  const workdir = firstDefined(runtime.FTA47R_DISPOSABLE_WORKDIR, env.FTA47R_DISPOSABLE_WORKDIR)

  if (runtime.FTA47R_PROJECT_ID && env.FTA47R_PROJECT_ID && runtime.FTA47R_PROJECT_ID !== env.FTA47R_PROJECT_ID) {
    throw new Error('§47R disposable FTA47R_PROJECT_ID disagrees between process and env file')
  }
  if (runtime.FTA47R_DISPOSABLE_WORKDIR && env.FTA47R_DISPOSABLE_WORKDIR
    && canonicalizePath(runtime.FTA47R_DISPOSABLE_WORKDIR) !== canonicalizePath(env.FTA47R_DISPOSABLE_WORKDIR)) {
    throw new Error('§47R disposable FTA47R_DISPOSABLE_WORKDIR disagrees between process and env file')
  }
  if (runtime.FTA47R_E2E_ENV_FILE && env.FTA47R_E2E_ENV_FILE
    && canonicalizePath(runtime.FTA47R_E2E_ENV_FILE) !== canonicalizePath(env.FTA47R_E2E_ENV_FILE)) {
    throw new Error('§47R disposable FTA47R_E2E_ENV_FILE disagrees between process and env file')
  }

  if (disposable) {
    if (!projectId) {
      throw new Error('§47R disposable FTA47R_PROJECT_ID is required')
    }
    if (!workdir) {
      throw new Error('§47R disposable FTA47R_DISPOSABLE_WORKDIR is required')
    }
    if (!existsSync(workdir)) {
      throw new Error('§47R disposable workdir does not exist')
    }
    if (isCheckoutWorkdir(workdir)) {
      throw new Error('§47R disposable workdir must not be inside a git checkout')
    }
    if (!existsSync(`${workdir.replace(/\/$/, '')}/supabase`)) {
      throw new Error('§47R disposable workdir has no supabase/ directory')
    }
    const cfgId = readConfigProjectId(workdir)
    if (cfgId !== projectId) {
      throw new Error('§47R disposable config.toml project_id does not match FTA47R_PROJECT_ID')
    }
    if (parsed.port === FTA47R_CURRENT_STACK_API_PORT || parsed.port === FTA47R_CURRENT_STACK_DB_PORT) {
      throw new Error('§47R disposable Playwright refused current-stack port')
    }
    const apiPort = readConfigApiPort(workdir)
    if (!apiPort) {
      throw new Error('§47R disposable config.toml missing [api] port')
    }
    if (parsed.port !== apiPort) {
      throw new Error('§47R disposable VITE_SUPABASE_URL does not match config.toml [api] port')
    }
    const jwt = jwtIdentity(env.VITE_SUPABASE_ANON_KEY || '')
    if (jwt === 'prod') {
      throw new Error('§47R disposable refused production-looking JWT iss/ref')
    }
    if (jwt && jwt === FTA47R_CURRENT_STACK_API_PORT) {
      throw new Error('§47R disposable JWT iss port is the current-stack API port')
    }
    if (jwt && jwt !== parsed.port) {
      throw new Error('§47R disposable JWT iss port does not match VITE_SUPABASE_URL')
    }
  }

  env.FTA47R_PERMITTED_ORIGIN = parsed.origin
  if (projectId) env.FTA47R_PROJECT_ID = projectId
  if (workdir) env.FTA47R_DISPOSABLE_WORKDIR = workdir
  return env
}

export function loadFta47rEnv(runtime: Fta47rRuntime = process.env): Fta47rEnv {
  const path = runtime.FTA47R_E2E_ENV_FILE
  if (!path) {
    throw new Error('FTA47R_E2E_ENV_FILE is required for §47R Playwright')
  }
  const env = loadFta47rEnvFile(path)
  return assertFta47rEnvIdentity(env, runtime)
}

export function vitePublicEnv(env: Fta47rEnv): Record<string, string> {
  return {
    VITE_DATA_PLANE: 'supabase',
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || '',
    VITE_MAPBOX_ACCESS_TOKEN: '',
    FAMILY_E2E_EMAIL: '',
    FAMILY_E2E_PASSWORD: '',
    FAMILY_E2E_TRIP_ID: '',
  }
}

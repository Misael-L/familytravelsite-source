import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertFta47rEnvIdentity,
  loadFta47rEnv,
  loadFta47rEnvFile,
} from '../../../e2e/family/load47rEnv'

function jwtForIss(iss: string): string {
  const header = Buffer.from('{"alg":"none"}').toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iss, role: 'anon' })).toString('base64url')
  return `${header}.${payload}.x`
}

function writeEnv(dir: string, extra: Record<string, string> = {}) {
  const path = join(dir, '.env.47r.e2e')
  const rows: Record<string, string> = {
    VITE_SUPABASE_URL: 'http://127.0.0.1:54331',
    VITE_SUPABASE_ANON_KEY: jwtForIss('http://127.0.0.1:54331/auth/v1'),
    FTA47R_DISPOSABLE_REQUIRED: '1',
    FTA47R_DISPOSABLE_WORKDIR: dir,
    FTA47R_PROJECT_ID: 'fta47r11deadbeef',
    FTA47R_E2E_ENV_FILE: path,
    ...extra,
  }
  writeFileSync(path, Object.entries(rows).map(([k, v]) => `${k}=${v}`).join('\n'))
  return path
}

describe('loadFta47rEnv disposable identity', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  function disposableWorkdir(projectId = 'fta47r11deadbeef', apiPort = '54331') {
    const dir = mkdtempSync(join(tmpdir(), 'fta-47r11-ts-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'supabase'))
    writeFileSync(
      join(dir, 'supabase/config.toml'),
      `project_id = "${projectId}"\n\n[api]\nport = ${apiPort}\n`,
    )
    return dir
  }

  it('loads a matching disposable identity', () => {
    const dir = disposableWorkdir()
    const path = writeEnv(dir)
    const env = loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })
    expect(env.FTA47R_PERMITTED_ORIGIN).toBe('http://127.0.0.1:54331')
    expect(env.FTA47R_PROJECT_ID).toBe('fta47r11deadbeef')
  })

  it('accepts a portless demo JWT when VITE_SUPABASE_URL matches config.toml [api] port', () => {
    const dir = disposableWorkdir()
    const path = writeEnv(dir, { VITE_SUPABASE_ANON_KEY: jwtForIss('supabase-demo') })
    const env = loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })
    expect(env.FTA47R_PERMITTED_ORIGIN).toBe('http://127.0.0.1:54331')
  })

  it('fails when FTA47R_E2E_ENV_FILE is missing', () => {
    expect(() => loadFta47rEnv({})).toThrow(/FTA47R_E2E_ENV_FILE is required/)
  })

  it('fails when the env file does not exist', () => {
    expect(() => loadFta47rEnv({ FTA47R_E2E_ENV_FILE: join(tmpdir(), 'fta-47r11-missing.env') }))
      .toThrow(/FTA47R_E2E_ENV_FILE missing/)
  })

  it('fails when disposable workdir is missing', () => {
    const dir = disposableWorkdir()
    const path = writeEnv(dir, { FTA47R_DISPOSABLE_WORKDIR: '' })
    const env = loadFta47rEnvFile(path)
    env.FTA47R_DISPOSABLE_WORKDIR = ''
    expect(() => assertFta47rEnvIdentity(env, {
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_E2E_ENV_FILE: path,
    })).toThrow(/WORKDIR is required/)
  })

  it('fails when disposable workdir does not exist', () => {
    const dir = disposableWorkdir()
    const path = writeEnv(dir, { FTA47R_DISPOSABLE_WORKDIR: join(tmpdir(), 'fta-47r11-no-such-dir') })
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: join(tmpdir(), 'fta-47r11-no-such-dir'),
    })).toThrow(/workdir does not exist/)
  })

  it('fails when project id is missing', () => {
    const dir = disposableWorkdir()
    const path = writeEnv(dir, { FTA47R_PROJECT_ID: '' })
    const env = loadFta47rEnvFile(path)
    env.FTA47R_PROJECT_ID = ''
    expect(() => assertFta47rEnvIdentity(env, {
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_DISPOSABLE_WORKDIR: dir,
      FTA47R_E2E_ENV_FILE: path,
    })).toThrow(/PROJECT_ID is required/)
  })

  it('fails when config.toml project_id mismatches FTA47R_PROJECT_ID', () => {
    const dir = disposableWorkdir('other-id')
    const path = writeEnv(dir)
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })).toThrow(/project_id does not match/)
  })

  it('fails when process project id disagrees with the env file', () => {
    const dir = disposableWorkdir()
    const path = writeEnv(dir)
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'someone-else',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })).toThrow(/PROJECT_ID disagrees/)
  })

  it('fails when process workdir disagrees with the env file', () => {
    const dir = disposableWorkdir()
    const other = disposableWorkdir()
    const path = writeEnv(dir)
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: other,
    })).toThrow(/WORKDIR disagrees/)
  })

  it('fails when process env-file path disagrees with the file-declared path', () => {
    const dir = disposableWorkdir()
    const declared = join(tmpdir(), 'fta-47r11-other.env')
    const path = writeEnv(dir, { FTA47R_E2E_ENV_FILE: declared })
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })).toThrow(/E2E_ENV_FILE disagrees/)
  })

  it('fails when JWT iss port disagrees with VITE_SUPABASE_URL', () => {
    const dir = disposableWorkdir()
    const path = writeEnv(dir, {
      VITE_SUPABASE_ANON_KEY: jwtForIss('http://127.0.0.1:54399/auth/v1'),
    })
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })).toThrow(/JWT iss port does not match/)
  })

  it('refuses current-stack API port 54321', () => {
    const dir = disposableWorkdir()
    const path = writeEnv(dir, {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: jwtForIss('http://127.0.0.1:54321/auth/v1'),
    })
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })).toThrow(/current-stack port/)
  })

  it('refuses current-stack DB port used as API 54322', () => {
    const dir = disposableWorkdir()
    const path = writeEnv(dir, {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54322',
      VITE_SUPABASE_ANON_KEY: jwtForIss('http://127.0.0.1:54322/auth/v1'),
    })
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })).toThrow(/current-stack port/)
  })

  it('refuses a checkout workdir', () => {
    expect(() => assertFta47rEnvIdentity({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54331',
      VITE_SUPABASE_ANON_KEY: jwtForIss('http://127.0.0.1:54331/auth/v1'),
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: '/Users/Misael/Desktop/FamilyTravelApp',
    }, { FTA47R_DISPOSABLE_REQUIRED: '1', FTA47R_PROJECT_ID: 'fta47r11deadbeef' }))
      .toThrow(/git checkout/)
  })

  it('refuses localhost routing', () => {
    const dir = disposableWorkdir()
    const path = writeEnv(dir, { VITE_SUPABASE_URL: 'http://localhost:54331' })
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })).toThrow(/must be 127\.0\.0\.1/)
  })

  it('fails when supabase/config.toml is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fta-47r11-ts-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'supabase'))
    const path = writeEnv(dir)
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })).toThrow(/config\.toml/)
  })

  it('refuses a production-looking JWT iss', () => {
    const dir = disposableWorkdir()
    const path = writeEnv(dir, {
      VITE_SUPABASE_ANON_KEY: jwtForIss('https://gdqywxjlkcrsuylqdhmc.supabase.co/auth/v1'),
    })
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })).toThrow(/production-looking JWT/)
  })

  it('refuses VITE_SUPABASE_URL that does not match config.toml [api] port even with a portless demo JWT', () => {
    const dir = disposableWorkdir('fta47r11deadbeef', '54331')
    const path = writeEnv(dir, {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54341',
      VITE_SUPABASE_ANON_KEY: jwtForIss('supabase-demo'),
    })
    expect(() => loadFta47rEnv({
      FTA47R_E2E_ENV_FILE: path,
      FTA47R_DISPOSABLE_REQUIRED: '1',
      FTA47R_PROJECT_ID: 'fta47r11deadbeef',
      FTA47R_DISPOSABLE_WORKDIR: dir,
    })).toThrow(/does not match config\.toml \[api\] port/)
  })
})

import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ALLOWED_CARTO_KEYS,
  ALLOWED_MAPBOX_PK,
  PROD_HOST,
  artifactScanFailed,
  classifyLine,
  classifyTouchedRel,
  exactRepoRel,
  formatFinding,
  is47rScanRel,
  isRejectionContext,
  parseScanRepoId,
  parseArtifactKind,
  parseTaggedScanPath,
  rcScanFailed,
  scanArtifactRoot,
  scanRcManifest,
  scanText,
  scanTouchedWorktrees,
  tryReadScanTarget,
  unreviewedHits,
} from './secretScan'

/** Build needles at runtime so this file is safe to RC-scan as a complete blob. */
function glue(...parts: string[]): string {
  return parts.join('')
}

const SUPABASE_CO = glue('supabase', '.co')
const BAD_PK = glue('pk.', 'thisisnotafixturetokenxx')
const BAD_PK_SCANTEXT = glue('pk.', 'notanallowedfixturetoken')
const BAD_CARTO_SHAPED = glue('phase47live', 'cartokeyzzzz')
const BAD_CARTO_FIELD = glue('livecarto', 'rasterkeyxx')
const BAD_SERVICE = glue('static', 'servicevalue')
const BAD_JWT = glue(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  '.',
  'eyJzdWIiOiIxMjM0In0',
  '.',
  'abcdevfxyz0123456789',
)
const BAD_JWT_SHORT = glue(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  '.',
  'eyJzdWIiOiIxIn0',
  '.',
  'signaturexx',
)

const APP_SCHEMA = 'FamilyTravelApp:index:docs/schema-design.md'
const APP_GOVERNANCE = 'FamilyTravelApp:index:docs/admin-governance.md'
const APP_TOML = 'FamilyTravelApp:index:supabase/config.toml'
const SITE_LOCKS = 'FamilyTravelSite:index:docs/web-trek-supabase-locks.md'
const SITE_PLAN = 'FamilyTravelSite:index:.cursor/plans/47r.11_maps_closure_210afcde.plan.md'
const SITE_LOAD47R = 'FamilyTravelSite:index:client/e2e/family/load47rEnv.ts'

function prodOrigin(rest = ''): string {
  return glue('https://', PROD_HOST, '.', SUPABASE_CO, rest)
}

function tickRef(): string {
  return glue('`', PROD_HOST, '`')
}

function fetchTickRef(): string {
  return glue('fetch(', '`', PROD_HOST, '`', ')')
}

function curlTickRef(): string {
  return glue('curl ', '`', PROD_HOST, '`')
}

function wgetTickRef(): string {
  return glue('wget ', '`', PROD_HOST, '`')
}

describe('isRejectionContext', () => {
  it('allows includes() of the production hostname', () => {
    expect(isRejectionContext(`url.includes('${PROD_HOST}')`, PROD_HOST)).toBe(true)
  })

  it('does not treat a comment or prose mention as rejection', () => {
    expect(isRejectionContext(`// do not use ${PROD_HOST} in fixtures`, PROD_HOST)).toBe(false)
    expect(isRejectionContext(`throw new Error('refused'); const h = '${PROD_HOST}'`, PROD_HOST)).toBe(false)
  })

  it('does not treat a string assignment as rejection even when throw is nearby', () => {
    const line = `const host = '${PROD_HOST}'; throw new Error('bad')`
    expect(isRejectionContext(line, PROD_HOST)).toBe(false)
    expect(unreviewedHits(classifyLine(line)).map((f) => f.kind)).toContain('PROD_HOST')
  })
})

describe('classifyLine fixtures and negatives', () => {
  it('allows exact Mapbox fixture tokens only', () => {
    for (const tok of ALLOWED_MAPBOX_PK) {
      const hits = unreviewedHits(classifyLine(`const t = '${tok}'`))
      expect(hits, tok).toEqual([])
    }
  })

  it('fails a Mapbox token that is not on the exact allowlist', () => {
    const hits = unreviewedHits(classifyLine("const t = '" + BAD_PK + "'"))
    expect(hits.some((f) => f.kind === 'MAPBOX_PK')).toBe(true)
  })

  it('allows exact CARTO fixture keys only', () => {
    for (const tok of ALLOWED_CARTO_KEYS) {
      expect(unreviewedHits(classifyLine(`carto: '${tok}'`))).toEqual([])
    }
  })

  it('fails a CARTO-shaped key that is not on the exact allowlist', () => {
    const hits = unreviewedHits(classifyLine("carto: '" + BAD_CARTO_SHAPED + "'"))
    expect(hits.some((f) => f.kind === 'CARTO_KEY')).toBe(true)
  })

  it('fails a non-fixture CARTO literal in a credential-bearing field', () => {
    const hits = unreviewedHits(classifyLine("cartoApiKey: '" + BAD_CARTO_FIELD + "'"))
    expect(hits.some((f) => f.kind === 'CARTO_KEY')).toBe(true)
    const snake = unreviewedHits(classifyLine("carto_api_key: '" + BAD_CARTO_FIELD + "'"))
    expect(snake.some((f) => f.kind === 'CARTO_KEY')).toBe(true)
  })

  it('fails case-insensitive CARTO env fields, unquoted values, and spaced assignments', () => {
    expect(
      unreviewedHits(classifyLine('CARTO_API_KEY=' + BAD_CARTO_FIELD)).some((f) => f.kind === 'CARTO_KEY'),
    ).toBe(true)
    expect(
      unreviewedHits(classifyLine("VITE_CARTO_API_KEY='" + BAD_CARTO_FIELD + "'")).some((f) => f.kind === 'CARTO_KEY'),
    ).toBe(true)
    expect(
      unreviewedHits(classifyLine('cartoApiKey = "' + BAD_CARTO_FIELD + '"')).some((f) => f.kind === 'CARTO_KEY'),
    ).toBe(true)
    expect(
      unreviewedHits(classifyLine('cartoKey: ' + BAD_CARTO_FIELD)).some((f) => f.kind === 'CARTO_KEY'),
    ).toBe(true)
  })

  it('does not flag identifier names like cartoApiKey without a key literal', () => {
    expect(unreviewedHits(classifyLine('const cartoApiKey = input.carto'))).toEqual([])
    expect(unreviewedHits(classifyLine('cartoApiKey: family?.cartoApiKey ?? null'))).toEqual([])
    expect(unreviewedHits(classifyLine('carto: FAKE_CARTO'))).toEqual([])
    expect(unreviewedHits(classifyLine('cartoApiKey: string | null'))).toEqual([])
    expect(unreviewedHits(classifyLine('onReplace={value => void save({ cartoApiKey: value })}'))).toEqual([])
    expect(unreviewedHits(classifyLine('cartoApiKey: looksSecret(carto) ? null : carto'))).toEqual([])
  })

  it('allows the Vite 47r.e2e resolved-URL deny line', () => {
    const line = `if (!loopback || url.includes('${PROD_HOST}') || /supabase\\.co/i.test(url)) {`
    expect(unreviewedHits(classifyLine(line))).toEqual([])
  })

  it('fails a generic deny-list regex assignment without a path fixture or .test()', () => {
    const line = `const DENY = /${PROD_HOST}|supabase\\.co/i`
    expect(unreviewedHits(classifyLine(line)).length).toBeGreaterThan(0)
  })

  it('allows the exact load47rEnv deny-list regex only on the Site repo and exact path', () => {
    const line = `const PROD_HOST = /${PROD_HOST}|supabase\\.co/i`
    expect(unreviewedHits(classifyLine(line)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(line, 'client/e2e/family/load47rEnv.ts', 9)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(line, SITE_LOAD47R, 9))).toEqual([])
    expect(unreviewedHits(classifyLine(line, 'FamilyTravelSite:client/e2e/family/load47rEnv.ts', 9))).toEqual([])
    expect(
      unreviewedHits(classifyLine(line, 'FamilyTravelApp:index:client/e2e/family/load47rEnv.ts', 9)).length,
    ).toBeGreaterThan(0)
    expect(
      unreviewedHits(classifyLine(line, 'FamilyTravelSite:index:client/e2e/family/load47rEnv.ts.bak', 9)).length,
    ).toBeGreaterThan(0)
  })

  it('fails when the production hostname is only present in the line', () => {
    const hits = unreviewedHits(classifyLine("fetch('" + prodOrigin() + "')"))
    expect(hits.length).toBeGreaterThan(0)
  })

  it('does not let includes() exempt a sibling production request', () => {
    const line = `if (url.includes('${PROD_HOST}')) fetch('` + prodOrigin('/rest/v1') + "')"
    const hits = unreviewedHits(classifyLine(line))
    expect(hits.some((f) => f.kind === 'PROD_HOST' || f.kind === 'SUPABASE_CO')).toBe(true)
  })

  it('does not let indexOf() exempt a sibling credential assignment', () => {
    const line = `blob.indexOf('${BAD_PK}'); const t = '${BAD_PK}'`
    const hits = unreviewedHits(classifyLine(line))
    expect(hits.filter((f) => f.kind === 'MAPBOX_PK').length).toBeGreaterThanOrEqual(1)
  })

  it('fails a three-part JWT literal', () => {
    const hits = unreviewedHits(classifyLine("const jwt = '" + BAD_JWT + "'"))
    expect(hits.some((f) => f.kind === 'JWT_LIKE')).toBe(true)
  })

  it('allows grep -Eq and bash glob denials of the production hostname', () => {
    expect(unreviewedHits(classifyLine(`if echo "$STATUS_ENV" | grep -Eq '${PROD_HOST}|supabase\\.co'; then`))).toEqual([])
    expect(unreviewedHits(classifyLine(
      `if [[ "\${DBURL}" == *"${PROD_HOST}"* ]] || [[ "\${DBURL}" == *"${SUPABASE_CO}"* ]]; then`,
    ))).toEqual([])
  })

  it('does not treat https:// as a comment when classifying jwtForIss', () => {
    expect(isRejectionContext(
      `jwtForIss('` + prodOrigin('/auth/v1') + "')",
      PROD_HOST,
    )).toBe(true)
  })

  it('allows a jwtForIss deny-case fixture URL', () => {
    expect(unreviewedHits(classifyLine(
      `VITE_SUPABASE_ANON_KEY: jwtForIss('` + prodOrigin('/auth/v1') + "'),",
    ))).toEqual([])
  })

  it('allows a jwt_for_iss shell deny-case fixture URL', () => {
    expect(unreviewedHits(classifyLine(
      `PROD_JWT="$(jwt_for_iss "` + prodOrigin('/auth/v1') + `")"`,
    ))).toEqual([])
  })

  it('allows an identity-deny production API_URL assignment only with expect_fail', () => {
    expect(unreviewedHits(classifyLine(
      `API_URL="` + prodOrigin() + `"; expect_fail "production API_URL" fta47r_assert_stack_identity`,
    ))).toEqual([])
  })

  it('fails a production API_URL assignment without expect_fail or a path fixture', () => {
    const hits = unreviewedHits(classifyLine(`API_URL="` + prodOrigin() + `"`))
    expect(hits.some((f) => f.kind === 'PROD_HOST' || f.kind === 'SUPABASE_CO')).toBe(true)
  })

  it('does not let API_URL deny-assignment exempt a sibling fetch', () => {
    const line = `API_URL="` + prodOrigin() + `"; fetch('` + prodOrigin('/auth/v1') + `')`
    const hits = unreviewedHits(classifyLine(line))
    expect(hits.some((f) => f.kind === 'PROD_HOST' || f.kind === 'SUPABASE_CO')).toBe(true)
  })

  it('does not let expect_fail exempt a sibling fetch or curl', () => {
    const line = `API_URL="` + prodOrigin() + `"; fetch('` + prodOrigin('/auth/v1') + `'); expect_fail "production API_URL"`
    const hits = unreviewedHits(classifyLine(line))
    expect(hits.some((f) => f.kind === 'PROD_HOST' || f.kind === 'SUPABASE_CO')).toBe(true)
  })

  it('allows SERVICE_ROLE_KEY copied from an env expansion', () => {
    expect(unreviewedHits(classifyLine('echo "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"'))).toEqual([])
    expect(unreviewedHits(classifyLine('const key = e.SERVICE_ROLE_KEY'))).toEqual([])
    expect(unreviewedHits(classifyLine('SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY'))).toEqual([])
    expect(unreviewedHits(classifyLine(
      'SERVICE_ROLE_KEY="$(fta47r_parse_status_var SERVICE_ROLE_KEY "$blob")"',
    ))).toEqual([])
    expect(unreviewedHits(classifyLine('SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY'))).toEqual([])
    expect(unreviewedHits(classifyLine('SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'))).toEqual([])
    expect(unreviewedHits(classifyLine('SERVICE_ROLE_KEY=""'))).toEqual([])
  })

  it('fails a quoted service-role value even when it looks like an identifier', () => {
    const hits = unreviewedHits(classifyLine("SERVICE_ROLE_KEY='notajwtquotedsecret'"))
    expect(hits.some((f) => f.kind === 'SERVICE_ROLE_ASSIGN')).toBe(true)
  })

  it('fails unquoted identifier-like service-role values and object-property static assignments', () => {
    expect(
      unreviewedHits(classifyLine('SERVICE_ROLE_KEY=mysecret')).some((f) => f.kind === 'SERVICE_ROLE_ASSIGN'),
    ).toBe(true)
    expect(
      unreviewedHits(classifyLine("serviceRoleKey: '" + BAD_SERVICE + "'")).some((f) => f.kind === 'SERVICE_ROLE_ASSIGN'),
    ).toBe(true)
    expect(
      unreviewedHits(classifyLine("service_role_key: '" + BAD_SERVICE + "'")).some((f) => f.kind === 'SERVICE_ROLE_ASSIGN'),
    ).toBe(true)
  })

  it('does not let includes() exempt a sibling service-role assignment', () => {
    const line = glue(
      'blob.includes(',
      "'SERVICE_ROLE_KEY'",
      '); ',
      'SERVICE_ROLE_KEY',
      '=',
      "'",
      BAD_SERVICE,
      "'",
    )
    expect(unreviewedHits(classifyLine(line)).some((f) => f.kind === 'SERVICE_ROLE_ASSIGN')).toBe(true)
  })

  it('fails a quoted service_role JWT-like assignment', () => {
    const hits = unreviewedHits(classifyLine(
      "SERVICE_ROLE_KEY='" + BAD_JWT_SHORT + "'",
    ))
    expect(hits.some((f) => f.kind === 'JWT_LIKE' || f.kind === 'SERVICE_ROLE_ASSIGN')).toBe(true)
  })

  it('scanText is fail-closed: any HIT keeps the file from passing', () => {
    const findings = scanText(
      `url.includes('${PROD_HOST}')\n` + BAD_PK_SCANTEXT + `\n`,
      'virtual.ts',
    )
    expect(unreviewedHits(findings).length).toBeGreaterThan(0)
  })

  it('classifications are sanitized and do not echo secret values', () => {
    const line = "SERVICE_ROLE_KEY='" + BAD_JWT_SHORT + "'"
    for (const f of classifyLine(line, 'virtual.ts', 1)) {
      const shown = formatFinding(f)
      expect(shown).not.toMatch(/eyJ/)
      expect(shown).not.toMatch(/signaturexx/)
      expect(shown).toMatch(/^(ALLOW_|HIT )/)
    }
  })
})

describe('touched-file inventory coverage', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function initRepo(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'fta-wt-scan-'))
    tmpDirs.push(dir)
    execFileSync('git', ['init', '-b', 'main'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 'Worktree Scan Test'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 'wt-scan@invalid'], { cwd: dir })
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir })
    return dir
  }

  function writeRel(root: string, rel: string, body: string): void {
    const abs = path.join(root, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }

  it('scans MapView, Atlas, and MobileMapTimeline instead of omitting them', () => {
    expect(classifyTouchedRel('client/src/components/Map/MapView.tsx')).toBe('scan')
    expect(classifyTouchedRel('client/src/components/Map/MapViewAuto.tsx')).toBe('scan')
    expect(classifyTouchedRel('client/src/components/Map/MapViewGL.tsx')).toBe('scan')
    expect(classifyTouchedRel('client/src/pages/AtlasPage.tsx')).toBe('scan')
    expect(classifyTouchedRel('client/src/pages/atlas/useAtlas.ts')).toBe('scan')
    expect(classifyTouchedRel('client/src/components/Map/AtlasMapGL.tsx')).toBe('scan')
    expect(classifyTouchedRel('client/src/components/Journey/MobileMapTimeline.tsx')).toBe('scan')
    expect(classifyTouchedRel('client/src/components/Journey/MobileMapTimeline.test.tsx')).toBe('scan')
    expect(is47rScanRel('client/src/components/Map/MapView.tsx')).toBe(true)
  })

  it('scans staging-allowlist text files regardless of extension', () => {
    expect(classifyTouchedRel('docs/web-trek-supabase-locks.md')).toBe('scan')
    expect(classifyTouchedRel('.cursor/plans/47r.11_maps_closure_210afcde.plan.md')).toBe('scan')
    expect(classifyTouchedRel('client/package.json')).toBe('scan')
    expect(classifyTouchedRel('FamilyTravelApp/Features/Trips/Workspace/FamilyPermissionOutcomes.swift')).toBe('scan')
    expect(classifyTouchedRel('FamilyTravelAppTests/FamilyPermissionOutcomesTests.swift')).toBe('scan')
  })

  it('keeps unrelated markdown, JSON, and binary/data trees out of scope', () => {
    expect(classifyTouchedRel('docs/product-plan.md')).toBe('out_of_scope')
    expect(classifyTouchedRel('docs/schema-design.md')).toBe('out_of_scope')
    expect(classifyTouchedRel('package-lock.json')).toBe('out_of_scope')
    expect(classifyTouchedRel('tmp/mig_list.json')).toBe('out_of_scope')
    expect(classifyTouchedRel('server/uploads/avatars/foo.jpg')).toBe('out_of_scope')
    expect(classifyTouchedRel('server/data/.jwt_secret')).toBe('out_of_scope')
    expect(classifyTouchedRel('client/dist/sw.js')).toBe('out_of_scope')
    expect(classifyTouchedRel('supabase/.temp/cli-latest')).toBe('out_of_scope')
    expect(classifyTouchedRel('scripts/__pycache__/fill_workspace_es419.cpython-314.pyc')).toBe('out_of_scope')
    expect(classifyTouchedRel('client/.env.47r.e2e.local')).toBe('out_of_scope')
  })

  it('records the negative-corpus test and classifier as reviewed exclusions', () => {
    expect(classifyTouchedRel('client/tests/unit/family/secretScan.test.ts')).toBe('reviewed_exclusion')
    expect(classifyTouchedRel('client/tests/unit/family/secretScan.ts')).toBe('reviewed_exclusion')
    expect(is47rScanRel('client/tests/unit/family/secretScan.test.ts')).toBe(false)
    expect(classifyTouchedRel('scripts/verify_cleanup_dispatch.sh')).toBe('reviewed_exclusion')
  })

  it('fails an unexpected missing scan target as a read error', () => {
    const missing = path.join(tmpdir(), 'no-such-47r11-scan-target.ts')
    const got = tryReadScanTarget(missing, 'virtual:missing.ts')
    expect(got).toEqual({ error: { path: 'virtual:missing.ts', code: 'ENOENT' } })
  })

  it('scans in-scope synthetic worktree files and records reviewed exclusions', () => {
    const site = initRepo()
    const app = initRepo()
    writeRel(site, 'client/src/components/Map/MapView.tsx', 'export {}\n')
    writeRel(site, 'client/src/pages/AtlasPage.tsx', 'export {}\n')
    writeRel(site, 'client/src/pages/atlas/useAtlas.ts', 'export {}\n')
    writeRel(site, 'client/src/components/Journey/MobileMapTimeline.tsx', 'export {}\n')
    writeRel(site, 'docs/web-trek-supabase-locks.md', '# locks\n')
    writeRel(site, '.cursor/plans/47r.11_maps_closure_210afcde.plan.md', '# plan\n')
    writeRel(site, 'client/package.json', '{"name":"synthetic"}\n')
    writeRel(site, 'client/tests/unit/family/secretScan.test.ts', 'export {}\n')
    writeRel(app, 'FamilyTravelApp/Features/Trips/Workspace/FamilyPermissionOutcomes.swift', 'enum X {}\n')
    const result = scanTouchedWorktrees([
      { label: 'FamilyTravelSite', cwd: site },
      { label: 'FamilyTravelApp', cwd: app },
    ])
    expect(result.readErrors, result.readErrors.map((e) => `${e.path} ${e.code}`).join('\n')).toEqual([])
    expect(result.hits, result.hits.map(formatFinding).join('\n')).toEqual([])
    const scanned = result.scanned.join('\n')
    expect(scanned).toMatch(/MapView\.tsx/)
    expect(scanned).toMatch(/AtlasPage\.tsx/)
    expect(scanned).toMatch(/useAtlas\.ts/)
    expect(scanned).toMatch(/MobileMapTimeline\.tsx/)
    expect(scanned).toMatch(/web-trek-supabase-locks\.md/)
    expect(scanned).toMatch(/47r\.11_maps_closure_210afcde\.plan\.md/)
    expect(scanned).toMatch(/client\/package\.json/)
    expect(scanned).toMatch(/FamilyPermissionOutcomes\.swift/)
    expect(result.excluded.some((e) => e.path.includes('secretScan.test.ts'))).toBe(true)
  })

  it('fails closed when a synthetic in-scope file has an unreviewed HIT', () => {
    const site = initRepo()
    writeRel(site, 'client/src/components/Map/MapView.tsx', BAD_PK + '\n')
    const result = scanTouchedWorktrees([{ label: 'FamilyTravelSite', cwd: site }])
    expect(result.hits.some((f) => f.kind === 'MAPBOX_PK')).toBe(true)
  })
})

describe('RC source mode', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function initRepo(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'fta-rc-scan-'))
    tmpDirs.push(dir)
    execFileSync('git', ['init', '-b', 'main'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 'RC Scan Test'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 'rc-scan@invalid'], { cwd: dir })
    return dir
  }

  function writeAndStage(root: string, rel: string, body: string): void {
    const abs = path.join(root, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, body)
    execFileSync('git', ['add', '--', rel], { cwd: root })
  }

  it('scans an ordinarily excluded historical migration when it is manifested', () => {
    expect(
      classifyTouchedRel('supabase/migrations/20260828015138_storage_cleanup_safety.sql'),
    ).toBe('reviewed_exclusion')
    const app = initRepo()
    writeAndStage(
      app,
      'supabase/migrations/20260828015138_storage_cleanup_safety.sql',
      '-- synthetic historical migration\nselect 1;\n',
    )
    const result = scanRcManifest(
      [
        {
          repo: 'FamilyTravelApp',
          source: 'index',
          path: 'supabase/migrations/20260828015138_storage_cleanup_safety.sql',
        },
      ],
      { FamilyTravelSite: initRepo(), FamilyTravelApp: app },
    )
    expect(result.unclassified).toEqual([])
    expect(result.readErrors).toEqual([])
    expect(result.hits).toEqual([])
    expect(result.scanned).toEqual([
      'FamilyTravelApp:index:supabase/migrations/20260828015138_storage_cleanup_safety.sql',
    ])
  })

  it('scans manifested JSON and Markdown even when worktree mode would skip them', () => {
    expect(classifyTouchedRel('package-lock.json')).toBe('out_of_scope')
    expect(classifyTouchedRel('docs/corresponding-source.md')).toBe('out_of_scope')
    const site = initRepo()
    writeAndStage(site, 'package-lock.json', '{"name":"synthetic-lock"}\n')
    writeAndStage(site, 'docs/corresponding-source.md', '# corresponding source\n')
    const result = scanRcManifest(
      [
        { repo: 'FamilyTravelSite', source: 'index', path: 'package-lock.json' },
        { repo: 'FamilyTravelSite', source: 'index', path: 'docs/corresponding-source.md' },
      ],
      { FamilyTravelSite: site, FamilyTravelApp: initRepo() },
    )
    expect(result.unclassified).toEqual([])
    expect(result.readErrors).toEqual([])
    expect(result.hits).toEqual([])
    expect(result.scanned).toEqual([
      'FamilyTravelSite:index:package-lock.json',
      'FamilyTravelSite:index:docs/corresponding-source.md',
    ])
  })

  it('scans a manifested textual path under an ordinarily excluded directory', () => {
    expect(classifyTouchedRel('tmp/rc-excluded-dir.js')).toBe('out_of_scope')
    expect(classifyTouchedRel('server/data/note.md')).toBe('out_of_scope')
    const site = initRepo()
    writeAndStage(site, 'tmp/rc-excluded-dir.js', BAD_PK + '\n')
    writeAndStage(site, 'server/data/note.md', '# no secret\n')
    const result = scanRcManifest(
      [
        { repo: 'FamilyTravelSite', source: 'index', path: 'tmp/rc-excluded-dir.js' },
        { repo: 'FamilyTravelSite', source: 'index', path: 'server/data/note.md' },
      ],
      { FamilyTravelSite: site, FamilyTravelApp: initRepo() },
    )
    expect(result.unclassified).toEqual([])
    expect(result.readErrors).toEqual([])
    expect(result.scanned).toEqual([
      'FamilyTravelSite:index:tmp/rc-excluded-dir.js',
      'FamilyTravelSite:index:server/data/note.md',
    ])
    expect(result.hits.some((f) => f.path.includes('tmp/rc-excluded-dir.js') && f.kind === 'MAPBOX_PK')).toBe(true)
  })

  it('reads the index blob and never falls back to the dirty worktree', () => {
    const dir = initRepo()
    writeFileSync(path.join(dir, 'token.json'), '{"ok":true}\n')
    execFileSync('git', ['add', '--', 'token.json'], { cwd: dir })
    execFileSync('git', ['commit', '-m', 'safe'], { cwd: dir })
    writeFileSync(path.join(dir, 'token.json'), BAD_PK + '\n')
    const result = scanRcManifest(
      [{ repo: 'FamilyTravelSite', source: 'index', path: 'token.json' }],
      { FamilyTravelSite: dir, FamilyTravelApp: initRepo() },
    )
    expect(result.readErrors).toEqual([])
    expect(result.hits).toEqual([])
    expect(result.scanned).toEqual(['FamilyTravelSite:index:token.json'])
  })

  it('scans a committed SHA blob with a HIT and rejects generated dist as a SHA blob', () => {
    const dir = initRepo()
    mkdirSync(path.join(dir, 'docs'), { recursive: true })
    writeFileSync(path.join(dir, 'docs', 'note.md'), BAD_PK + '\n')
    execFileSync('git', ['add', '--', 'docs/note.md'], { cwd: dir })
    execFileSync('git', ['commit', '-m', 'md'], { cwd: dir })
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
    const hit = scanRcManifest(
      [{ repo: 'FamilyTravelSite', source: sha, path: 'docs/note.md' }],
      { FamilyTravelSite: dir, FamilyTravelApp: initRepo() },
    )
    expect(hit.readErrors).toEqual([])
    expect(hit.hits.some((f) => f.kind === 'MAPBOX_PK')).toBe(true)
    const dist = scanRcManifest(
      [{ repo: 'FamilyTravelSite', source: sha, path: 'client/dist/sw.js' }],
      { FamilyTravelSite: dir, FamilyTravelApp: initRepo() },
    )
    expect(dist.unclassified).toEqual([
      { path: `FamilyTravelSite:${sha}:client/dist/sw.js`, code: 'not_sha_blob' },
    ])
    expect(dist.scanned).toEqual([])
  })

  it('fails closed on a missing manifested blob', () => {
    const result = scanRcManifest(
      [{ repo: 'FamilyTravelSite', source: 'index', path: 'no-such-manifested-file.ts' }],
      { FamilyTravelSite: initRepo(), FamilyTravelApp: initRepo() },
    )
    expect(result.readErrors.some((e) => e.code === 'ENOENT')).toBe(true)
    expect(rcScanFailed(result)).toBe(true)
  })
})

describe('archive/artifact mode', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('scans textual files under node_modules and does not treat that path as binary', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fta-art-nm-'))
    tmpDirs.push(root)
    mkdirSync(path.join(root, 'node_modules'), { recursive: true })
    writeFileSync(path.join(root, 'node_modules', 'secret.js'), BAD_PK + '\n')
    const result = scanArtifactRoot(root, { repo: 'FamilyTravelSite', kind: 'archive' })
    expect(result.escapes).toEqual([])
    expect(result.readErrors).toEqual([])
    expect(result.scanned).toContain('node_modules/secret.js')
    expect(result.hits.some((f) => f.path === 'node_modules/secret.js' && f.kind === 'MAPBOX_PK')).toBe(true)
    expect(artifactScanFailed(result)).toBe(true)
  })

  it('scans textual source maps and fails a Mapbox HIT inside them', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fta-art-scan-'))
    tmpDirs.push(root)
    writeFileSync(
      path.join(root, 'app.js.map'),
      '{"file":"app.js","mappings":"' + BAD_PK + '"}\n',
    )
    const result = scanArtifactRoot(root, { repo: 'FamilyTravelSite', kind: 'archive' })
    expect(result.escapes).toEqual([])
    expect(result.readErrors).toEqual([])
    expect(result.scanned).toContain('app.js.map')
    expect(result.hits.some((f) => f.kind === 'MAPBOX_PK')).toBe(true)
    expect(artifactScanFailed(result)).toBe(true)
  })

  it('rejects a symlink that escapes the approved artifact root', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fta-art-esc-'))
    const outside = mkdtempSync(path.join(tmpdir(), 'fta-art-out-'))
    tmpDirs.push(root, outside)
    writeFileSync(path.join(outside, 'secret.txt'), 'x\n')
    symlinkSync(outside, path.join(root, 'outside-link'))
    const result = scanArtifactRoot(root, { repo: 'FamilyTravelSite', kind: 'archive' })
    expect(result.escapes.length + result.readErrors.length).toBeGreaterThan(0)
    expect(artifactScanFailed(result)).toBe(true)
  })

  it('fails an unreadable artifact file and never scans the operator worktree by fallback', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fta-art-read-'))
    tmpDirs.push(root)
    const hidden = path.join(root, 'blocked.txt')
    writeFileSync(hidden, BAD_PK + '\n')
    chmodSync(hidden, 0)
    const result = scanArtifactRoot(root, { repo: 'FamilyTravelSite', kind: 'archive' })
    chmodSync(hidden, 0o600)
    const blocked = result.readErrors.some((e) => e.path === 'blocked.txt') || result.hits.length > 0
    expect(blocked).toBe(true)
    expect(result.scanned.every((p) => !p.includes('client/src'))).toBe(true)
  })
})

describe('exact repo identity, metadata, and RC-safe scanner blobs', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function initRepo(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'fta-rc-self-'))
    tmpDirs.push(dir)
    execFileSync('git', ['init', '-b', 'main'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 'RC Scan Test'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 'rc-scan@invalid'], { cwd: dir })
    return dir
  }

  it('parses RC and worktree tags and rejects untagged or unsafe relatives', () => {
    expect(parseTaggedScanPath(APP_SCHEMA)).toEqual({
      repo: 'FamilyTravelApp',
      rel: 'docs/schema-design.md',
      sourceKind: 'index',
    })
    expect(parseTaggedScanPath('FamilyTravelSite:docs/web-trek-supabase-locks.md')).toEqual({
      repo: 'FamilyTravelSite',
      rel: 'docs/web-trek-supabase-locks.md',
      sourceKind: 'worktree',
    })
    expect(parseTaggedScanPath('docs/schema-design.md')).toEqual({
      repo: null,
      rel: 'docs/schema-design.md',
      sourceKind: null,
    })
    expect(parseTaggedScanPath('FamilyTravelSite:archive:client/.env.example')).toEqual({
      repo: 'FamilyTravelSite',
      rel: 'client/.env.example',
      sourceKind: 'archive',
    })
    expect(parseTaggedScanPath('FamilyTravelSite:dist:assets/app.js')).toEqual({
      repo: 'FamilyTravelSite',
      rel: 'assets/app.js',
      sourceKind: 'dist',
    })
    expect(exactRepoRel(APP_SCHEMA, 'FamilyTravelApp', 'docs/schema-design.md')).toBe(true)
    expect(exactRepoRel('FamilyTravelApp:index:evil/docs/schema-design.md', 'FamilyTravelApp', 'docs/schema-design.md')).toBe(false)
  })

  it('allows approved App metadata forms only on the exact repo and relative path', () => {
    expect(unreviewedHits(classifyLine(tickRef(), APP_SCHEMA, 1))).toEqual([])
    expect(unreviewedHits(classifyLine(tickRef(), APP_GOVERNANCE, 1))).toEqual([])
    expect(unreviewedHits(classifyLine('--project-ref ' + PROD_HOST, APP_SCHEMA, 1))).toEqual([])
    expect(unreviewedHits(classifyLine('# Project ref: ' + PROD_HOST, APP_TOML, 1))).toEqual([])
    expect(unreviewedHits(classifyLine(tickRef(), 'FamilyTravelApp:docs/schema-design.md', 1))).toEqual([])
  })

  it('rejects near-match paths and the wrong repository for metadata exceptions', () => {
    const near = [
      'FamilyTravelApp:index:docs/schema-design.md.bak',
      'FamilyTravelApp:index:docs/schema-design.mdx',
      'FamilyTravelApp:index:prefix/docs/schema-design.md',
      'FamilyTravelApp:index:evil/docs/schema-design.md',
      'FamilyTravelApp:index:not-docs/schema-design.md',
      'FamilyTravelSite:index:docs/schema-design.md',
      'docs/schema-design.md',
      'FamilyTravelApp:index:docs/admin-governance.md.bak',
      'FamilyTravelApp:index:not-docs/admin-governance.md',
      'FamilyTravelApp:index:supabase/config.toml.orig',
      'FamilyTravelSite:index:supabase/config.toml',
      'FamilyTravelApp:index:supabase/config.toml/',
    ]
    for (const p of near) {
      expect(unreviewedHits(classifyLine(tickRef(), p, 1)).some((f) => f.kind === 'PROD_HOST'), p).toBe(true)
    }
  })

  it('HITs fetch, curl, wget, and Request uses even without a URL scheme or host suffix', () => {
    const lines = [
      fetchTickRef(),
      curlTickRef(),
      wgetTickRef(),
      glue('new Request(', '`', PROD_HOST, '`', ')'),
      glue('axios.get(', '`', PROD_HOST, '`', ')'),
      glue('curl -H ', "'Authorization: Bearer x' ", PROD_HOST),
    ]
    for (const line of lines) {
      expect(unreviewedHits(classifyLine(line, APP_SCHEMA, 1)).length, line).toBeGreaterThan(0)
      expect(unreviewedHits(classifyLine(line, SITE_LOCKS, 1)).length, line).toBeGreaterThan(0)
      expect(unreviewedHits(classifyLine(line, SITE_PLAN, 1)).length, line).toBeGreaterThan(0)
      expect(unreviewedHits(classifyLine(line, SITE_LOAD47R, 1)).length, line).toBeGreaterThan(0)
    }
  })

  it('still HITs equivalent unsafe URL/request/credential uses on approved metadata paths', () => {
    expect(unreviewedHits(classifyLine("fetch('" + prodOrigin() + "')", APP_SCHEMA, 1)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine('curl ' + prodOrigin('/rest/v1'), APP_SCHEMA, 1)).length).toBeGreaterThan(0)
    expect(
      unreviewedHits(classifyLine(glue('https://user:pass@', PROD_HOST, '.', SUPABASE_CO), APP_SCHEMA, 1)).length,
    ).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(prodOrigin() + '/rest/v1?apikey=x', APP_SCHEMA, 1)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine('SERVICE_ROLE_KEY=' + PROD_HOST, APP_SCHEMA, 1)).length).toBeGreaterThan(0)
    expect(
      unreviewedHits(classifyLine(tickRef(), 'docs/product-plan.md', 1)).some((f) => f.kind === 'PROD_HOST'),
    ).toBe(true)
    expect(
      unreviewedHits(classifyLine('# Project ref: ' + PROD_HOST, 'other.toml', 1)).some((f) => f.kind === 'PROD_HOST'),
    ).toBe(true)
    expect(unreviewedHits(classifyLine('`' + prodOrigin() + '`', APP_SCHEMA, 1)).length).toBeGreaterThan(0)
    expect(
      unreviewedHits(classifyLine('project_id = "' + PROD_HOST + '"', APP_TOML, 1)).some((f) => f.kind === 'PROD_HOST'),
    ).toBe(true)
    expect(unreviewedHits(classifyLine(`url.includes('${PROD_HOST}')`, APP_SCHEMA, 1))).toEqual([])
  })

  it('HITs a hostile URL, credential, or request on Site locks and plan paths', () => {
    expect(unreviewedHits(classifyLine(tickRef(), SITE_LOCKS, 1))).toEqual([])
    expect(unreviewedHits(classifyLine(tickRef(), SITE_PLAN, 1))).toEqual([])
    expect(unreviewedHits(classifyLine("fetch('" + prodOrigin() + "')", SITE_LOCKS, 1)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(fetchTickRef(), SITE_LOCKS, 1)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine('curl ' + prodOrigin(), SITE_PLAN, 1)).length).toBeGreaterThan(0)
    expect(
      unreviewedHits(classifyLine(glue('https://user:pass@', PROD_HOST, '.', SUPABASE_CO), SITE_LOCKS, 1)).length,
    ).toBeGreaterThan(0)
    expect(
      unreviewedHits(classifyLine(tickRef(), 'FamilyTravelSite:index:docs/web-trek-supabase-locks.md.bak', 1)).some(
        (f) => f.kind === 'PROD_HOST',
      ),
    ).toBe(true)
  })

  it('RC-scans complete secretScan.ts and secretScan.test.ts blobs with zero HITs', () => {
    const dir = initRepo()
    const dest = path.join(dir, 'client/tests/unit/family')
    mkdirSync(dest, { recursive: true })
    const here = path.dirname(fileURLToPath(import.meta.url))
    copyFileSync(path.join(here, 'secretScan.ts'), path.join(dest, 'secretScan.ts'))
    copyFileSync(path.join(here, 'secretScan.test.ts'), path.join(dest, 'secretScan.test.ts'))
    execFileSync('git', ['add', '--', 'client/tests/unit/family/secretScan.ts', 'client/tests/unit/family/secretScan.test.ts'], {
      cwd: dir,
    })
    const result = scanRcManifest(
      [
        { repo: 'FamilyTravelSite', source: 'index', path: 'client/tests/unit/family/secretScan.ts' },
        { repo: 'FamilyTravelSite', source: 'index', path: 'client/tests/unit/family/secretScan.test.ts' },
      ],
      { FamilyTravelSite: dir, FamilyTravelApp: initRepo() },
    )
    expect(result.readErrors).toEqual([])
    expect(result.unclassified).toEqual([])
    expect(result.hits.map(formatFinding)).toEqual([])
    expect(result.scanned).toEqual([
      'FamilyTravelSite:index:client/tests/unit/family/secretScan.ts',
      'FamilyTravelSite:index:client/tests/unit/family/secretScan.test.ts',
    ])
    expect(rcScanFailed(result)).toBe(false)
  })

  it('fails synthetic secrets in TypeScript, Markdown, TOML, JSON, migrations, and source maps', () => {
    const line = "const t = '" + BAD_PK + "'\n"
    for (const p of ['x.ts', 'x.md', 'x.toml', 'x.json', 'supabase/migrations/x.sql', 'app.js.map']) {
      expect(unreviewedHits(scanText(line, p)).some((f) => f.kind === 'MAPBOX_PK'), p).toBe(true)
    }
    const root = mkdtempSync(path.join(tmpdir(), 'fta-art-syn-'))
    tmpDirs.push(root)
    writeFileSync(path.join(root, 'app.js.map'), '{"file":"app.js","mappings":"' + BAD_PK + '"}\n')
    const art = scanArtifactRoot(root, { repo: 'FamilyTravelSite', kind: 'archive' })
    expect(art.readErrors).toEqual([])
    expect(art.hits.some((f) => f.kind === 'MAPBOX_PK')).toBe(true)
  })

  it('does not apply REVIEWED_SCAN_EXCLUSIONS in RC mode and never falls back to the worktree', () => {
    expect(classifyTouchedRel('client/tests/unit/family/secretScan.ts')).toBe('reviewed_exclusion')
    const dir = initRepo()
    const dest = path.join(dir, 'client/tests/unit/family')
    mkdirSync(dest, { recursive: true })
    writeFileSync(path.join(dest, 'secretScan.ts'), 'export const ok = true\n')
    execFileSync('git', ['add', '--', 'client/tests/unit/family/secretScan.ts'], { cwd: dir })
    writeFileSync(path.join(dest, 'secretScan.ts'), BAD_PK + '\n')
    const result = scanRcManifest(
      [{ repo: 'FamilyTravelSite', source: 'index', path: 'client/tests/unit/family/secretScan.ts' }],
      { FamilyTravelSite: dir, FamilyTravelApp: initRepo() },
    )
    expect(result.readErrors).toEqual([])
    expect(result.unclassified).toEqual([])
    expect(result.hits).toEqual([])
    expect(result.scanned).toEqual(['FamilyTravelSite:index:client/tests/unit/family/secretScan.ts'])
  })
})

const SITE_DIST_JS = 'FamilyTravelSite:dist:assets/client-sdk.js'
const SITE_ARCHIVE_ENV = 'FamilyTravelSite:archive:client/.env.example'
const SITE_ARCHIVE_LOAD47R = 'FamilyTravelSite:archive:client/e2e/family/load47rEnv.ts'
const SITE_DIST_LOAD47R = 'FamilyTravelSite:dist:client/e2e/family/load47rEnv.ts'
const SITE_ARCHIVE_TS = 'FamilyTravelSite:archive:client/src/demo.ts'

function envExampleAssignment(label: string): string {
  return glue('VITE_SUPABASE_URL=https://', label, '.', SUPABASE_CO)
}

function runArtifactCli(args: string[]): number {
  const scannerCli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'secretScan.ts')
  try {
    execFileSync(
      process.execPath,
      ['--experimental-strip-types', scannerCli, '--mode=artifact', ...args],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      },
    )
    return 0
  } catch (err) {
    const status = (err as { status?: number }).status
    return typeof status === 'number' ? status : 1
  }
}

describe('artifact identity and kind', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('parses only exact repo and kind tokens', () => {
    expect(parseScanRepoId('FamilyTravelSite')).toBe('FamilyTravelSite')
    expect(parseScanRepoId('FamilyTravelApp')).toBe('FamilyTravelApp')
    expect(parseScanRepoId('FamilyTravelWeb')).toBeNull()
    expect(parseScanRepoId('')).toBeNull()
    expect(parseArtifactKind('archive')).toBe('archive')
    expect(parseArtifactKind('dist')).toBe('dist')
    expect(parseArtifactKind('bundle')).toBeNull()
    expect(parseArtifactKind('Archive')).toBeNull()
  })

  it('fails closed when artifact identity is missing or malformed', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fta-art-id-'))
    tmpDirs.push(root)
    writeFileSync(path.join(root, 'ok.txt'), 'safe\n')
    const missing = scanArtifactRoot(root, undefined as never)
    expect(missing.readErrors.some((e) => e.code === 'missing_identity' || e.code === 'bad_repo' || e.code === 'bad_kind')).toBe(
      true,
    )
    expect(artifactScanFailed(missing)).toBe(true)
    const badRepo = scanArtifactRoot(root, { repo: 'Other' as never, kind: 'archive' })
    expect(badRepo.readErrors.some((e) => e.code === 'bad_repo')).toBe(true)
    expect(artifactScanFailed(badRepo)).toBe(true)
    const badKind = scanArtifactRoot(root, { repo: 'FamilyTravelSite', kind: 'bundle' as never })
    expect(badKind.readErrors.some((e) => e.code === 'bad_kind')).toBe(true)
    expect(artifactScanFailed(badKind)).toBe(true)
    expect(runArtifactCli(['--root', root])).not.toBe(0)
    expect(runArtifactCli(['--root', root, '--repo=FamilyTravelSite'])).not.toBe(0)
    expect(runArtifactCli(['--root', root, '--kind=archive'])).not.toBe(0)
    expect(runArtifactCli(['--root', root, '--repo=Other', '--kind=archive'])).not.toBe(0)
    expect(runArtifactCli(['--root', root, '--repo=FamilyTravelSite', '--kind=bundle'])).not.toBe(0)
  })

  it('does not let dist inherit archive/source path fixtures', () => {
    const line = `const PROD_HOST = /${PROD_HOST}|supabase\\.co/i`
    expect(unreviewedHits(classifyLine(line, SITE_ARCHIVE_LOAD47R, 9))).toEqual([])
    expect(unreviewedHits(classifyLine(line, SITE_DIST_LOAD47R, 9)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(tickRef(), 'FamilyTravelSite:dist:docs/web-trek-supabase-locks.md', 1)).length).toBeGreaterThan(0)
  })
})

describe('exact .env.example placeholder and dist SDK suffix', () => {
  it('allows only the exact archive YOUR_* VITE_SUPABASE_URL placeholder form', () => {
    const ok = envExampleAssignment('YOUR_PROJECT')
    expect(unreviewedHits(classifyLine(ok, SITE_ARCHIVE_ENV, 16))).toEqual([])
    expect(unreviewedHits(classifyLine(ok, 'FamilyTravelSite:index:client/.env.example', 16)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(ok, 'FamilyTravelSite:dist:client/.env.example', 16)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(ok, 'client/.env.example', 16)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(envExampleAssignment(PROD_HOST), SITE_ARCHIVE_ENV, 16)).length).toBeGreaterThan(0)
    expect(
      unreviewedHits(classifyLine(glue('VITE_SUPABASE_ANON_KEY=https://YOUR_PROJECT.', SUPABASE_CO), SITE_ARCHIVE_ENV, 16))
        .length,
    ).toBeGreaterThan(0)
    expect(
      unreviewedHits(classifyLine(glue(ok, '/auth/v1'), SITE_ARCHIVE_ENV, 16)).length,
    ).toBeGreaterThan(0)
  })

  it('allows only the exact dist SDK .push of the official star-glob pair', () => {
    const pretty = glue('targets.push("*.', SUPABASE_CO, '", "*.', 'supabase.in', '")')
    const minified = glue('e.push(`*.', SUPABASE_CO, '`,`*.', 'supabase.in', '`)')
    expect(unreviewedHits(classifyLine(pretty, SITE_DIST_JS, 1))).toEqual([])
    expect(unreviewedHits(classifyLine(minified, SITE_DIST_JS, 1))).toEqual([])
    expect(unreviewedHits(classifyLine(pretty, SITE_ARCHIVE_TS, 1)).length).toBeGreaterThan(0)
    const suffix = glue('".', SUPABASE_CO, '"')
    expect(unreviewedHits(classifyLine(glue('if (h.endsWith(', suffix, ')) {}'), SITE_DIST_JS, 1)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(glue('if (h.includes(', suffix, ')) {}'), SITE_DIST_JS, 1)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(glue('const s=[', suffix, ']'), SITE_DIST_JS, 1)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(glue('const s=["*.', SUPABASE_CO, '"]'), SITE_DIST_JS, 1)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(glue('ok(`*.', SUPABASE_CO, '`)'), SITE_DIST_JS, 1)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(glue('custom(`*.', SUPABASE_CO, '`)'), SITE_DIST_JS, 1)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(glue('e+".', SUPABASE_CO, '"'), SITE_DIST_JS, 1)).length).toBeGreaterThan(0)
    expect(unreviewedHits(classifyLine(glue('`${e}.', SUPABASE_CO, '`'), SITE_DIST_JS, 1)).length).toBeGreaterThan(0)
    expect(
      unreviewedHits(classifyLine(glue('e.push(`*.', SUPABASE_CO, '`)'), SITE_DIST_JS, 1)).length,
    ).toBeGreaterThan(0)
    expect(
      unreviewedHits(
        classifyLine(glue('custom(`*.', SUPABASE_CO, '`,`*.', 'supabase.in', '`)'), SITE_DIST_JS, 1),
      ).length,
    ).toBeGreaterThan(0)
  })

  it('HITs adversarial dist near-matches outside the SDK suffix expression', () => {
    const dist = SITE_DIST_JS
    const cases = [
      glue('const u="https://acme.', SUPABASE_CO, '"'),
      glue('const u="https://', PROD_HOST, '.', SUPABASE_CO, '"'),
      glue('const h=ref+".', SUPABASE_CO, '"'),
      glue('const u="https://unknownhost.', SUPABASE_CO, '"'),
      glue('fetch("https://acme.', SUPABASE_CO, '")'),
      glue('new URL("https://acme.', SUPABASE_CO, '")'),
      glue('const u="https://u:p@acme.', SUPABASE_CO, '"'),
      glue('const u="https://acme.', SUPABASE_CO, '/rest/v1"'),
      glue('const u="https://acme.', SUPABASE_CO, '?x=1"'),
      glue('const u="https://acme.', SUPABASE_CO, '#frag"'),
      glue('VITE_SUPABASE_URL="https://acme.', SUPABASE_CO, '"'),
      glue('SERVICE_ROLE_KEY="', BAD_SERVICE, '"'),
      glue('const t="', BAD_PK, '"'),
      glue('const jwt="', BAD_JWT, '"'),
    ]
    for (const line of cases) {
      expect(unreviewedHits(classifyLine(line, dist, 1)).length, line).toBeGreaterThan(0)
    }
  })

  it('fail-closed adversarial counts used in the security-review report', () => {
    const shortIdentConcat = unreviewedHits(classifyLine(glue('e+".', SUPABASE_CO, '"'), SITE_DIST_JS, 1)).length
    const shortIdentTemplate = unreviewedHits(classifyLine(glue('`${e}.', SUPABASE_CO, '`'), SITE_DIST_JS, 1)).length
    const arbitraryCall = unreviewedHits(classifyLine(glue('custom(`*.', SUPABASE_CO, '`)'), SITE_DIST_JS, 1)).length
    const arraySuffix = unreviewedHits(classifyLine(glue('const s=[".', SUPABASE_CO, '"]'), SITE_DIST_JS, 1)).length
    const quotedEmbeddedPk = unreviewedHits(
      classifyLine(glue('"value=pk.', 'verifyTripAccess', '"'), SITE_ARCHIVE_TS, 1),
    ).length
    expect(shortIdentConcat).toBeGreaterThan(0)
    expect(shortIdentTemplate).toBeGreaterThan(0)
    expect(arbitraryCall).toBeGreaterThan(0)
    expect(arraySuffix).toBeGreaterThan(0)
    expect(quotedEmbeddedPk).toBeGreaterThan(0)
  })
})

describe('unquoted JS member access vs Mapbox tokens', () => {
  const memberIdent = 'verifyTripAccess'
  const member = glue('expect(pk.', memberIdent, ').toHaveBeenCalled()')

  it('allows unquoted camelCase member access only on JS/TS paths', () => {
    expect(unreviewedHits(classifyLine(member, SITE_ARCHIVE_TS, 1))).toEqual([])
    const afterComma = glue('foo(),pk.', memberIdent, '()')
    expect(unreviewedHits(classifyLine(afterComma, 'FamilyTravelSite:dist:assets/index.js', 1))).toEqual([])
    const minifiedPrefix = 'var a=/["\']+/g,b="say \\"hi\\"",c=\'q\';if(n)/x"y/.test(n);'
    expect(
      unreviewedHits(
        classifyLine(glue(minifiedPrefix, '),x(),pk.', memberIdent, '('), 'FamilyTravelSite:dist:assets/index.js', 1),
      ),
    ).toEqual([])
    const divThenRegex = glue('var x=1/2,y=a / /"[^"]+"/g,z(),pk.', memberIdent, '(')
    expect(unreviewedHits(classifyLine(divThenRegex, 'FamilyTravelSite:dist:assets/index.js', 1))).toEqual([])
    const ofRegex = glue('for(const k of /"/g),pk.', memberIdent, '(')
    expect(unreviewedHits(classifyLine(ofRegex, SITE_ARCHIVE_TS, 1))).toEqual([])
    const pureAnno = glue('/*#__PURE__*/', '/*#__PURE__*/n(),pk.', memberIdent, '(')
    expect(unreviewedHits(classifyLine(pureAnno, 'FamilyTravelSite:dist:assets/index.js', 1))).toEqual([])
    const joinCloser = glue('const s=parts.join(`', '\n`),pk.', memberIdent, '(')
    expect(unreviewedHits(scanText(joinCloser, SITE_ARCHIVE_TS))).toEqual([])
    const schemeThenJoin = glue('const u="https://example.invalid";const s=parts.join(`', '\n`),pk.', memberIdent, '(')
    expect(unreviewedHits(scanText(schemeThenJoin, SITE_ARCHIVE_TS))).toEqual([])
    const tmplTextNextLine = glue('const t=`foo\npk.', memberIdent, ' bar`')
    expect(unreviewedHits(scanText(tmplTextNextLine, SITE_ARCHIVE_TS)).some((f) => f.kind === 'MAPBOX_PK')).toBe(true)
    expect(unreviewedHits(classifyLine(member, 'FamilyTravelSite:archive:readme.md', 1)).length).toBeGreaterThan(0)
    expect(
      unreviewedHits(classifyLine(glue('`pre ${pk.', memberIdent, '} post`'), SITE_ARCHIVE_TS, 1)),
    ).toEqual([])
  })

  it('HITs quoted embeddings of a Mapbox-shaped member token in URL, JSON, array, and template text', () => {
    const quotedCases = [
      glue('"value=pk.', memberIdent, '"'),
      glue("'value=pk.", memberIdent, "'"),
      glue('`value=pk.', memberIdent, '`'),
      glue('"https://example.invalid/?t=pk.', memberIdent, '"'),
      glue('{"k":"pk.', memberIdent, '"}'),
      glue('const a=["pk.', memberIdent, '"]'),
      glue('const t=`pk.', memberIdent, '`'),
      glue('"x,pk.', memberIdent, '"'),
    ]
    for (const line of quotedCases) {
      expect(unreviewedHits(classifyLine(line, SITE_ARCHIVE_TS, 1)).some((f) => f.kind === 'MAPBOX_PK'), line).toBe(
        true,
      )
    }
  })

  it('HITs quoted, env, credential, unknown, and JWT-shaped Mapbox values', () => {
    expect(unreviewedHits(classifyLine(glue("const t='", BAD_PK, "'"), SITE_ARCHIVE_TS, 1)).some((f) => f.kind === 'MAPBOX_PK')).toBe(
      true,
    )
    expect(
      unreviewedHits(classifyLine(glue('MAPBOX_ACCESS_TOKEN=', BAD_PK), 'FamilyTravelSite:archive:client/.env.local', 1)).some(
        (f) => f.kind === 'MAPBOX_PK',
      ),
    ).toBe(true)
    expect(
      unreviewedHits(classifyLine(glue('const t=`', BAD_PK, '`'), SITE_ARCHIVE_TS, 1)).some((f) => f.kind === 'MAPBOX_PK'),
    ).toBe(true)
    expect(
      unreviewedHits(classifyLine(glue('pk.', 'thisisnotafixturetokenxx'), SITE_ARCHIVE_TS, 1)).some((f) => f.kind === 'MAPBOX_PK'),
    ).toBe(true)
    expect(unreviewedHits(classifyLine(glue("const jwt='", BAD_JWT, "'"), SITE_ARCHIVE_TS, 1)).some((f) => f.kind === 'JWT_LIKE')).toBe(
      true,
    )
  })
})

describe('artifact CLI fail-closed files and escapes', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails an unreadable file and a root-escaping symlink with explicit identity', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fta-art-cli-'))
    const outside = mkdtempSync(path.join(tmpdir(), 'fta-art-cli-out-'))
    tmpDirs.push(root, outside)
    writeFileSync(path.join(outside, 'secret.txt'), 'x\n')
    symlinkSync(outside, path.join(root, 'outside-link'))
    expect(
      runArtifactCli(['--root', root, '--repo=FamilyTravelSite', '--kind=archive']),
    ).not.toBe(0)
    const blockedRoot = mkdtempSync(path.join(tmpdir(), 'fta-art-cli-block-'))
    tmpDirs.push(blockedRoot)
    const hidden = path.join(blockedRoot, 'blocked.txt')
    writeFileSync(hidden, BAD_PK + '\n')
    chmodSync(hidden, 0)
    const blocked = scanArtifactRoot(blockedRoot, { repo: 'FamilyTravelSite', kind: 'dist' })
    chmodSync(hidden, 0o600)
    expect(blocked.readErrors.some((e) => e.path === 'blocked.txt') || blocked.hits.length > 0).toBe(true)
    expect(artifactScanFailed(blocked)).toBe(true)
  })
})

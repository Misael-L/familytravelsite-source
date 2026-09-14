/**
 * §47R.11 secret scan — fail-closed, sanitized classifications.
 * Never returns secret values; findings are pattern-class + path + line.
 */

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PROD_HOST = 'gdqywxjlkcrsuylqdhmc'

/** Exact Mapbox fixture / placeholder tokens allowed in-tree. */
export const ALLOWED_MAPBOX_PK = new Set([
  'pk.phase47rfixturemapboxxxxxxxxx',
  'pk.phase47rfixturemapboxrotatedxxx',
  'pk.phase47fixturemapbox',
  'pk.should-never-upload',
  'pk.family-public-fixture',
  'pk.phase47rconcmapboxaaa',
  'pk.phase47rconcmapboxbbb',
  'pk.public-token-ok',
  'pk.phase47publicmapboxtokenxx',
  'pk.test_token',
  'pk.eyJ1Ijoi...',
  'pk.eyJ…',
  'pk.phase47rfixture',
  'pk.phase47r',
])

/** Exact CARTO fixture keys allowed in-tree. */
export const ALLOWED_CARTO_KEYS = new Set([
  'phase47rfixturecartokeyxxxx',
  'phase47fixturecartokey',
  'phase47rconccartokeyxx',
])

/** Paths that are in-scope but must not be scanned. Match is suffix or prefix of the repo-relative path. */
export const REVIEWED_SCAN_EXCLUSIONS: { suffix?: string; prefix?: string; reason: string }[] = [
  {
    suffix: 'client/tests/unit/family/secretScan.test.ts',
    reason: 'negative corpus; contains intentional HIT strings',
  },
  {
    suffix: 'client/tests/unit/family/secretScan.ts',
    reason: 'classifier implementation; needle literals are reject-span logic',
  },
  {
    suffix: 'scripts/verify_cleanup_dispatch.sh',
    reason: 'unrelated dirty tree (cleanup dispatch probe); not §47R.11 maps slice',
  },
  {
    suffix: 'scripts/verify_export_dispatch.sh',
    reason: 'unrelated dirty tree (export dispatch probe); not §47R.11 maps slice',
  },
  {
    suffix: 'scripts/rehearse_phase35_enforcement.sh',
    reason: 'unrelated dirty tree (phase35 enforcement); not §47R.11 maps slice',
  },
  {
    prefix: 'supabase/functions/dispatch-storage-cleanup/',
    reason: 'unrelated dirty tree (storage cleanup worker); not §47R.11 maps slice',
  },
  {
    prefix: 'supabase/tests/phase35c_',
    reason: 'unrelated dirty tree (phase35c SQL tests); not §47R.11 maps slice',
  },
  {
    suffix: 'supabase/tests/phase3_realtime_publication.sql',
    reason: 'unrelated dirty tree (phase3 realtime SQL); not §47R.11 maps slice',
  },
  {
    suffix: 'supabase/migrations/20260828015138_storage_cleanup_safety.sql',
    reason: 'unrelated dirty tree (cleanup-safety migration); not §47R.11 maps slice',
  },
  {
    suffix: 'supabase/migrations/20260828201624_register_person_avatar_reconciliation.sql',
    reason: 'unrelated dirty tree (avatar reconciliation migration); not §47R.11 maps slice',
  },
  {
    suffix: 'supabase/migrations/20260829222052_family_realtime_publication.sql',
    reason: 'unrelated dirty tree (realtime publication migration); not §47R.11 maps slice',
  },
]

export type ScanClass =
  | 'ALLOW_FIXTURE'
  | 'ALLOW_PLACEHOLDER'
  | 'ALLOW_REJECT_GUARD'
  | 'ALLOW_ENV_REF'
  | 'ALLOW_METADATA'
  | 'HIT'

export type ScanRepoId = 'FamilyTravelSite' | 'FamilyTravelApp'

export type ArtifactKind = 'archive' | 'dist'

export type ScanSourceKind = 'index' | 'sha' | 'worktree' | 'archive' | 'dist'

export type ArtifactScanIdentity = {
  repo: ScanRepoId
  kind: ArtifactKind
}

export function parseScanRepoId(value: string | undefined | null): ScanRepoId | null {
  if (value === 'FamilyTravelSite' || value === 'FamilyTravelApp') return value
  return null
}

export function parseArtifactKind(value: string | undefined | null): ArtifactKind | null {
  if (value === 'archive' || value === 'dist') return value
  return null
}

/** Concatenate so classifier source does not contain a contiguous supabase + ".co" needle. */
const SUPABASE_CO = 'supabase' + '.co'

/**
 * Exact App repo + repo-relative paths where the production project ref may appear
 * as non-secret metadata. Not a suffix, Markdown, TOML, or hostname blanket.
 */
export const APP_PROJECT_REF_METADATA_PATHS: { repo: ScanRepoId; rel: string }[] = [
  { repo: 'FamilyTravelApp', rel: 'docs/admin-governance.md' },
  { repo: 'FamilyTravelApp', rel: 'docs/schema-design.md' },
  { repo: 'FamilyTravelApp', rel: 'supabase/config.toml' },
]

export type ScanFinding = {
  cls: ScanClass
  kind: string
  path: string
  line: number
}

export type TouchedClass = 'scan' | 'reviewed_exclusion' | 'out_of_scope'

export type WorktreeScanResult = {
  scanned: string[]
  excluded: { path: string; reason: string }[]
  outOfScope: string[]
  hits: ScanFinding[]
  readErrors: { path: string; code: string }[]
}

/** Exact repo + relative path + optional line fixtures. URLs/requests still HIT. */
export const PATH_MATCH_FIXTURES: {
  repo: ScanRepoId
  rel: string
  kinds: string[]
  lineIncludes?: string
  reason: string
}[] = [
  {
    repo: 'FamilyTravelSite',
    rel: 'client/e2e/family/load47rEnv.ts',
    kinds: ['PROD_HOST', 'SUPABASE_CO'],
    lineIncludes: 'const PROD_HOST = /' + PROD_HOST + '|supabase\\.co/i',
    reason: 'exact deny-list regex later used with PROD_HOST.test',
  },
  {
    repo: 'FamilyTravelSite',
    rel: 'docs/web-trek-supabase-locks.md',
    kinds: ['PROD_HOST', 'SUPABASE_CO'],
    reason: 'locks may name the project ref as non-request metadata; URLs and requests still HIT',
  },
  {
    repo: 'FamilyTravelSite',
    rel: '.cursor/plans/47r.11_maps_closure_210afcde.plan.md',
    kinds: ['PROD_HOST', 'SUPABASE_CO'],
    reason: 'plan may name the project ref as non-request metadata; URLs and requests still HIT',
  },
]

/** Staging-allowlist text paths scanned even when the extension is not a code suffix. */
export const STAGING_ALLOWLIST_SUFFIXES = [
  'docs/web-trek-supabase-locks.md',
  '.cursor/plans/47r.11_maps_closure_210afcde.plan.md',
  'client/package.json',
  'FamilyPermissionOutcomes.swift',
  'FamilyPermissionOutcomesTests.swift',
]

const MAPBOX_PK = /pk\.[A-Za-z0-9._…-]{8,}/g
const JWT_THREE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g
const CARTO_FIXTURE_SHAPE = /phase47[a-z0-9]*cartokey[a-z0-9]*/gi
const CARTO_STRONG_FIELD =
  /^(?:(?:VITE_)?CARTO_API_KEY|cartoApiKey|carto_api_key|cartoKey|FAKE_CARTO)$/i
const CARTO_FIELD =
  /(?:^|[\s,{;])(?:export\s+)?((?:VITE_)?CARTO_API_KEY|cartoApiKey|carto_api_key|cartoKey|FAKE_CARTO|\bcarto)\s*[:=]\s*(?:(['"`])([^'"`]*)\2|([^\s,;}]+))/gi
const SERVICE_ROLE_FIELD =
  /(?:^|[\s,{;])(?:export\s+)?((?:SUPABASE_)?SERVICE_ROLE_KEY|serviceRoleKey|service_role_key|serviceRole)\s*[:=]\s*(?:(['"`])([^'"`]*)\2|([^\s,;}]+))/gi

type Span = [number, number]

function escapeRe(needle: string): string {
  return needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function spansFor(code: string, re: RegExp): Span[] {
  const copy = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  const out: Span[] = []
  for (const m of code.matchAll(copy)) {
    if (m.index == null) continue
    out.push([m.index, m.index + m[0].length])
  }
  return out
}

function inSpans(index: number, spans: Span[]): boolean {
  return spans.some(([a, b]) => index >= a && index < b)
}

/** Character spans of reviewed rejection/fixture constructs for this needle only. */
export function rejectionSpans(line: string, needle: string): Span[] {
  const code = stripComments(line)
  const escaped = escapeRe(needle)
  const spans: Span[] = []
  const add = (re: RegExp) => {
    spans.push(...spansFor(code, re))
  }
  add(new RegExp(`includes\\(\\s*['"\`]${escaped}['"\`]\\s*\\)`, 'g'))
  add(new RegExp(`indexOf\\(\\s*['"\`]${escaped}['"\`]\\s*\\)`, 'g'))
  add(new RegExp(`grep\\s+-[A-Za-z]*E[A-Za-z]*\\s*['"\`][^'"\`]*${escaped}[^'"\`]*['"\`]`, 'g'))
  add(new RegExp(`==\\s*\\*['"\`]${escaped}['"\`]\\*`, 'g'))
  add(new RegExp(`['"\`]${escaped}['"\`]\\s+in\\s+`, 'g'))
  add(new RegExp(`jwt(?:For|_for_)iss\\s*\\(?\\s*['"\`][^'"\`]*?${escaped}[^'"\`]*['"\`]`, 'gi'))
  add(new RegExp(`\\bPROD_HOST\\b\\s*=\\s*['"\`]${escaped}['"\`]`, 'g'))
  if (/\bexpect_fail\b/.test(code) && !/\b(?:fetch|curl|wget)\b/.test(code)) {
    const needleRe = new RegExp(escaped, 'g')
    for (const m of code.matchAll(needleRe)) {
      if (m.index == null) continue
      spans.push([m.index, m.index + needle.length])
    }
  }
  if (code.includes(needle) && /\bin\s+blob\b/.test(code)) {
    const blobAt = code.search(/\bin\s+blob\b/)
    const needleAt = code.indexOf(needle)
    if (blobAt >= 0 && needleAt >= 0 && Math.abs(blobAt - needleAt) < 80) {
      spans.push([Math.min(needleAt, blobAt), Math.max(needleAt + needle.length, blobAt + 7)])
    }
  }
  const regexLit = /\/((?:\\\/|[^/])+)\/[gimsuy]*/g
  for (const m of code.matchAll(regexLit)) {
    if (m.index == null) continue
    const body = m[1] || ''
    const escapedDot = needle.replace(/\./g, '\\.')
    if (!body.includes(needle) && !body.includes(escapedDot)) continue
    const after = code.slice(m.index + m[0].length)
    if (/\.test|\.exec/.test(after.slice(0, 12))) {
      spans.push([m.index, m.index + m[0].length])
    }
  }
  return spans
}

export function isRejectionContext(line: string, needle: string): boolean {
  const code = stripComments(line)
  if (!code.includes(needle) && !code.includes(needle.replace(/\./g, '\\.'))) return false
  const idx = code.indexOf(needle)
  if (idx >= 0 && inSpans(idx, rejectionSpans(line, needle))) return true
  const escapedIdx = code.indexOf(needle.replace(/\./g, '\\.'))
  if (escapedIdx >= 0 && inSpans(escapedIdx, rejectionSpans(line, needle))) return true
  return rejectionSpans(line, needle).length > 0 && (
    code.includes(needle) || /supabase\\\.co/.test(code)
  )
}

const SHA1_RE = /^[0-9a-f]{40}$/i

function normalizeScanRel(rel: string): string {
  return rel.replace(/\\/g, '/').replace(/^\.\//, '')
}

function isUnsafeRel(rel: string): boolean {
  return !rel || rel.includes('\0') || rel.includes('..') || rel.startsWith('/') || path.posix.isAbsolute(rel)
}

/**
 * Split a tagged scan path into repo identity, source kind, and relative path.
 * Artifact: `FamilyTravelSite:archive:rel` or `FamilyTravelSite:dist:rel`.
 * RC: `FamilyTravelApp:index:docs/schema-design.md` or `FamilyTravelSite:<sha>:rel`.
 * Worktree: `FamilyTravelSite:docs/web-trek-supabase-locks.md`.
 * Untagged paths have no repo identity and cannot receive security exceptions.
 * Dist relatives are artifact paths, never candidate-source paths.
 */
export function parseTaggedScanPath(pathText: string): {
  repo: ScanRepoId | null
  rel: string
  sourceKind: ScanSourceKind | null
} {
  const n = normalizeScanRel(pathText)
  const art = n.match(/^(FamilyTravelSite|FamilyTravelApp):(archive|dist):(.+)$/)
  if (art) {
    const rel = art[3]
    if (isUnsafeRel(rel)) return { repo: null, rel: n, sourceKind: null }
    const repo: ScanRepoId = art[1] === 'FamilyTravelApp' ? 'FamilyTravelApp' : 'FamilyTravelSite'
    const sourceKind: ArtifactKind = art[2] === 'dist' ? 'dist' : 'archive'
    return { repo, rel, sourceKind }
  }
  const rc = n.match(/^(FamilyTravelSite|FamilyTravelApp):(index|[0-9a-f]{40}):(.+)$/i)
  if (rc) {
    const rel = rc[3]
    if (isUnsafeRel(rel)) return { repo: null, rel: n, sourceKind: null }
    const repo: ScanRepoId = rc[1] === 'FamilyTravelApp' ? 'FamilyTravelApp' : 'FamilyTravelSite'
    const sourceKind: ScanSourceKind = rc[2].toLowerCase() === 'index' ? 'index' : 'sha'
    return { repo, rel, sourceKind }
  }
  const wt = n.match(/^(FamilyTravelSite|FamilyTravelApp):(.+)$/)
  if (wt) {
    const rel = wt[2]
    if (isUnsafeRel(rel) || rel === 'index' || rel === 'archive' || rel === 'dist' || SHA1_RE.test(rel)) {
      return { repo: null, rel: n, sourceKind: null }
    }
    const repo: ScanRepoId = wt[1] === 'FamilyTravelApp' ? 'FamilyTravelApp' : 'FamilyTravelSite'
    return { repo, rel, sourceKind: 'worktree' }
  }
  return { repo: null, rel: n, sourceKind: null }
}

export function exactRepoRel(pathText: string, repo: ScanRepoId, rel: string): boolean {
  const parsed = parseTaggedScanPath(pathText)
  return parsed.repo === repo && parsed.rel === rel
}

/** Inventory matching only: exact relative path or a slash-delimited suffix. Not a security exception. */
function exactRelOrSlashSuffix(rel: string, suffix: string): boolean {
  const n = normalizeScanRel(rel)
  return n === suffix || n.endsWith(`/${suffix}`)
}

function matchingCloseParen(line: string, openIndex: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = openIndex; i < line.length; i += 1) {
    const c = line[i]
    if (quote) {
      if (c === '\\') {
        i += 1
        continue
      }
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      continue
    }
    if (c === '(') depth += 1
    else if (c === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function occurrenceInsideCall(line: string, index: number, fnPattern: RegExp): boolean {
  const copy = new RegExp(fnPattern.source, fnPattern.flags.includes('g') ? fnPattern.flags : `${fnPattern.flags}g`)
  for (const m of line.matchAll(copy)) {
    if (m.index == null) continue
    const open = m.index + m[0].lastIndexOf('(')
    if (open < 0 || index <= open) continue
    const close = matchingCloseParen(line, open)
    if (close < 0 || index < close) return true
  }
  return false
}

function commandSegmentContaining(line: string, index: number): string {
  let quote: string | null = null
  let segStart = 0
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (quote) {
      if (c === '\\') {
        i += 1
        continue
      }
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      continue
    }
    let boundary = 0
    if (c === ';' || c === '\n') boundary = 1
    else if (c === '&' && line[i + 1] === '&') boundary = 2
    else if (c === '|' && line[i + 1] === '|') boundary = 2
    else if (c === '|') boundary = 1
    if (!boundary) continue
    if (i + boundary <= index) {
      segStart = i + boundary
      i += boundary - 1
      continue
    }
    return line.slice(segStart, i)
  }
  return line.slice(segStart)
}

function sourceKindMayUseSourcePathFixtures(sourceKind: ScanSourceKind | null): boolean {
  return sourceKind === 'index' || sourceKind === 'sha' || sourceKind === 'worktree' || sourceKind === 'archive'
}

function pathKindAllowed(pathText: string, kind: string, line: string, index: number, needle: string): boolean {
  if (!pathText) return false
  const parsed = parseTaggedScanPath(pathText)
  if (!parsed.repo || !sourceKindMayUseSourcePathFixtures(parsed.sourceKind)) return false
  for (const f of PATH_MATCH_FIXTURES) {
    if (parsed.repo !== f.repo || parsed.rel !== f.rel) continue
    if (!f.kinds.includes(kind)) continue
    if (f.lineIncludes && !line.includes(f.lineIncludes)) continue
    if (projectRefUseIsUnsafe(line, index, needle)) return false
    return true
  }
  return false
}

function pathIsAppProjectRefMetadataFile(pathText: string): boolean {
  const parsed = parseTaggedScanPath(pathText)
  if (!sourceKindMayUseSourcePathFixtures(parsed.sourceKind)) return false
  return APP_PROJECT_REF_METADATA_PATHS.some((row) => row.repo === parsed.repo && row.rel === parsed.rel)
}

const ENV_EXAMPLE_REL = 'client/.env.example'
const ENV_EXAMPLE_FIELD = 'VITE_SUPABASE_URL'
const ENV_EXAMPLE_PLACEHOLDER_LABEL = 'YOUR_PROJECT'

/** Exact archive YOUR_* placeholder assignment in client/.env.example. No other form. */
export function isApprovedEnvExamplePlaceholder(pathText: string, line: string, index: number): boolean {
  const parsed = parseTaggedScanPath(pathText)
  if (parsed.repo !== 'FamilyTravelSite' || parsed.sourceKind !== 'archive') return false
  if (parsed.rel !== ENV_EXAMPLE_REL) return false
  const expected = `${ENV_EXAMPLE_FIELD}=https://${ENV_EXAMPLE_PLACEHOLDER_LABEL}.${SUPABASE_CO}`
  if (line.trim() !== expected) return false
  const suffixAt = line.indexOf(SUPABASE_CO)
  if (suffixAt < 0 || suffixAt !== index) return false
  if (line.slice(index + SUPABASE_CO.length).trim() !== '') return false
  const fieldPrefix = `${ENV_EXAMPLE_FIELD}=https://${ENV_EXAMPLE_PLACEHOLDER_LABEL}.`
  if (!line.includes(fieldPrefix)) return false
  if (line.indexOf(fieldPrefix) > index) return false
  return true
}

function isJsTsOrGeneratedJsPath(pathText: string): boolean {
  const parsed = parseTaggedScanPath(pathText)
  const n = parsed.rel.replace(/\\/g, '/')
  if (parsed.sourceKind === 'dist') return /\.(?:[cm]?js)$/i.test(n)
  return /\.(?:[cm]?js|tsx|jsx|ts)$/i.test(n)
}

const SDK_STAR_GLOB_PREFIX = '*.'
const SDK_SIBLING_GLOB = '*.' + 'supabase' + '.in'
const JS_REGEX_KW = new Set([
  'return',
  'throw',
  'case',
  'typeof',
  'instanceof',
  'in',
  'of',
  'void',
  'new',
  'delete',
  'await',
  'yield',
  'else',
  'do',
])
const JS_IF_KW = new Set(['if', 'for', 'while', 'with'])

type JsLexKind = 'code' | 'string' | 'template_text' | 'comment' | 'regex'

type JsLexRunState = 'code' | 'squote' | 'dquote' | 'template' | 'line_comment' | 'block_comment' | 'regex'

type JsLexState = {
  state: JsLexRunState
  interpBraces: number[]
  parenIf: boolean[]
  regexInClass: boolean
  canRegex: boolean
  lastSig: string
  lastIdent: string
}

function freshJsLexState(): JsLexState {
  return {
    state: 'code',
    interpBraces: [],
    parenIf: [],
    regexInClass: false,
    canRegex: true,
    lastSig: '',
    lastIdent: '',
  }
}

function cloneJsLexState(s: JsLexState): JsLexState {
  return {
    state: s.state,
    interpBraces: s.interpBraces.slice(),
    parenIf: s.parenIf.slice(),
    regexInClass: s.regexInClass,
    canRegex: s.canRegex,
    lastSig: s.lastSig,
    lastIdent: s.lastIdent,
  }
}

function jsLexKindOf(s: JsLexState): JsLexKind {
  if (s.state === 'squote' || s.state === 'dquote') return 'string'
  if (s.state === 'template') return 'template_text'
  if (s.state === 'line_comment' || s.state === 'block_comment') return 'comment'
  if (s.state === 'regex') return 'regex'
  return 'code'
}

/** Consume at least one character at `i`. Returns the next index. */
function stepJsLex(s: JsLexState, line: string, i: number): number {
  const c = line[i]
  const n = i + 1 < line.length ? line[i + 1] : ''

  if (s.state === 'line_comment') {
    if (c === '\n') {
      s.state = 'code'
      s.canRegex = true
      s.lastSig = ''
      s.lastIdent = ''
    }
    return i + 1
  }
  if (s.state === 'block_comment') {
    if (c === '*' && n === '/') {
      s.state = 'code'
      s.canRegex = false
      s.lastSig = '/'
      s.lastIdent = ''
      return i + 2
    }
    return i + 1
  }
  if (s.state === 'squote' || s.state === 'dquote') {
    const q = s.state === 'squote' ? "'" : '"'
    if (c === '\\') return i + 2
    if (c === q) {
      s.state = 'code'
      s.canRegex = false
      s.lastSig = q
      s.lastIdent = ''
    }
    return i + 1
  }
  if (s.state === 'template') {
    if (c === '\\') return i + 2
    if (c === '`') {
      s.state = 'code'
      s.canRegex = false
      s.lastSig = '`'
      s.lastIdent = ''
      return i + 1
    }
    if (c === '$' && n === '{') {
      s.state = 'code'
      s.interpBraces.push(1)
      s.canRegex = true
      s.lastSig = '{'
      s.lastIdent = ''
      return i + 2
    }
    return i + 1
  }
  if (s.state === 'regex') {
    if (s.regexInClass) {
      if (c === '\\') return i + 2
      if (c === ']') s.regexInClass = false
      return i + 1
    }
    if (c === '\\') return i + 2
    if (c === '[') {
      s.regexInClass = true
      return i + 1
    }
    if (c === '/') {
      let j = i + 1
      while (j < line.length && /[A-Za-z]/.test(line[j])) j += 1
      s.state = 'code'
      s.canRegex = false
      s.lastSig = '/'
      s.lastIdent = ''
      return j
    }
    return i + 1
  }

  if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\v') {
    return i + 1
  }
  if (c === '/' && n === '/') {
    if (i > 0 && line[i - 1] === ':') {
      s.lastSig = '/'
      s.lastIdent = ''
      s.canRegex = true
      return i + 2
    }
    s.state = 'line_comment'
    return i + 2
  }
  if (c === '/' && n === '*') {
    s.state = 'block_comment'
    return i + 2
  }
  if (c === '/' && s.canRegex) {
    s.state = 'regex'
    s.regexInClass = false
    return i + 1
  }
  if (c === "'") {
    s.state = 'squote'
    return i + 1
  }
  if (c === '"') {
    s.state = 'dquote'
    return i + 1
  }
  if (c === '`') {
    s.state = 'template'
    return i + 1
  }
  if (c === '{') {
    if (s.interpBraces.length) s.interpBraces[s.interpBraces.length - 1] += 1
    s.lastSig = '{'
    s.lastIdent = ''
    s.canRegex = true
    return i + 1
  }
  if (c === '}') {
    if (s.interpBraces.length) {
      s.interpBraces[s.interpBraces.length - 1] -= 1
      if (s.interpBraces[s.interpBraces.length - 1] === 0) {
        s.interpBraces.pop()
        s.state = 'template'
        return i + 1
      }
    }
    s.lastSig = '}'
    s.lastIdent = ''
    s.canRegex = true
    return i + 1
  }
  if (/[A-Za-z_$]/.test(c)) {
    let j = i + 1
    while (j < line.length && /[\w$]/.test(line[j])) j += 1
    s.lastIdent = line.slice(i, j)
    s.lastSig = 'i'
    s.canRegex = JS_REGEX_KW.has(s.lastIdent)
    return j
  }
  if (c === '.' && n && /\d/.test(n) && s.lastSig !== 'i') {
    let j = i + 1
    while (j < line.length && /[\d.]/.test(line[j])) j += 1
    s.lastSig = 'n'
    s.lastIdent = ''
    s.canRegex = false
    return j
  }
  if (/\d/.test(c)) {
    let j = i + 1
    while (j < line.length && /[\w$.]/.test(line[j])) j += 1
    s.lastSig = 'n'
    s.lastIdent = ''
    s.canRegex = false
    return j
  }
  if (c === '(') {
    s.parenIf.push(JS_IF_KW.has(s.lastIdent))
    s.lastSig = '('
    s.lastIdent = ''
    s.canRegex = true
    return i + 1
  }
  if (c === ')') {
    const wasIf = s.parenIf.length ? s.parenIf.pop() === true : false
    s.lastSig = ')'
    s.lastIdent = ''
    s.canRegex = wasIf
    return i + 1
  }

  const prevSig = s.lastSig
  s.lastIdent = ''
  s.lastSig = c
  if ((c === '+' || c === '-') && prevSig === c) {
    s.canRegex = false
  } else {
    s.canRegex = '([{=:,;!&|?~+*%<>^/'.includes(c)
  }
  if (c === ']') s.canRegex = false
  return i + 1
}

function advanceJsLexLine(s: JsLexState, line: string): void {
  let i = 0
  while (i < line.length) i = stepJsLex(s, line, i)
  if (s.state === 'line_comment') {
    s.state = 'code'
    s.canRegex = true
    s.lastSig = ''
    s.lastIdent = ''
  }
}

/**
 * Walk JS/TS and report the lexical kind at `index`.
 * Template interpolations are `code`; template cooked text is `template_text`.
 * `start` continues a prior line (templates/strings/block comments).
 */
export function jsLexicalKindAt(line: string, index: number, start?: JsLexState): JsLexKind {
  if (index <= 0) return jsLexKindOf(start ?? freshJsLexState())
  const s = start ? cloneJsLexState(start) : freshJsLexState()
  let i = 0
  while (i < index && i < line.length) i = stepJsLex(s, line, i)
  return jsLexKindOf(s)
}

function skipHoriz(line: string, start: number, dir: 1 | -1): number {
  let i = start
  while (i >= 0 && i < line.length && (line[i] === ' ' || line[i] === '\t')) i += dir
  return i
}

/** True when the char before `end` (exclusive) is `.push(` with optional spaces. */
function endsWithDotPushCall(line: string, end: number): boolean {
  let i = skipHoriz(line, end - 1, -1)
  if (i < 0 || line[i] !== '(') return false
  i = skipHoriz(line, i - 1, -1)
  if (i < 3) return false
  if (line[i] !== 'h' || line[i - 1] !== 's' || line[i - 2] !== 'u' || line[i - 3] !== 'p') return false
  i = skipHoriz(line, i - 4, -1)
  return i >= 0 && line[i] === '.'
}

/**
 * Dist-only: the audited bundled-SDK expression
 * `<ident>.push(<star-glob-co>, <star-glob-in-sibling>)`.
 * No filename bind, no syntax-class suffix allowance.
 */
export function isApprovedDistSdkHostSuffix(pathText: string, line: string, index: number): boolean {
  const parsed = parseTaggedScanPath(pathText)
  if (parsed.repo !== 'FamilyTravelSite' || parsed.sourceKind !== 'dist') return false
  if (!isJsTsOrGeneratedJsPath(pathText)) return false
  if (index < 2 || line[index - 1] !== '.') return false
  const close = index + SUPABASE_CO.length
  if (close >= line.length) return false
  let innerStart = index - 1
  if (innerStart > 0 && line[innerStart - 1] === '*') innerStart -= 1
  if (innerStart <= 0) return false
  const quote = line[innerStart - 1]
  if (quote !== '"' && quote !== "'" && quote !== '`') return false
  if (line[close] !== quote) return false
  if (line.slice(innerStart, close) !== SDK_STAR_GLOB_PREFIX + SUPABASE_CO) return false
  if (!endsWithDotPushCall(line, innerStart - 1)) return false
  let i = skipHoriz(line, close + 1, 1)
  if (i >= line.length || line[i] !== ',') return false
  i = skipHoriz(line, i + 1, 1)
  const q2 = line[i]
  if (q2 !== '"' && q2 !== "'" && q2 !== '`') return false
  i += 1
  if (line.slice(i, i + SDK_SIBLING_GLOB.length) !== SDK_SIBLING_GLOB) return false
  i += SDK_SIBLING_GLOB.length
  if (line[i] !== q2) return false
  if (projectRefUseIsUnsafe(line, index, SUPABASE_CO)) return false
  if (occurrenceInsideCall(line, index, /\bnew\s+URL\s*\(/gi)) return false
  if (occurrenceInsideCall(line, index, /\b(?:fetch|axios(?:\.[A-Za-z]+)?)\s*\(/gi)) return false
  const beforeDot = line.slice(0, index - 1)
  if (beforeDot.endsWith(PROD_HOST + '.')) return false
  if (/:\/\//.test(line.slice(Math.max(0, innerStart - 24), i + 1))) return false
  return true
}

/** Unquoted executable JS/TS member access `pk.ident` — not quoted or template text. */
export function isUnquotedJsMemberAccess(
  line: string,
  index: number,
  match: string,
  pathText: string,
  lexStart?: JsLexState,
): boolean {
  if (!pathText || !isJsTsOrGeneratedJsPath(pathText)) return false
  if (!/^pk\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(match)) return false
  if (/^pk\.eyJ/i.test(match)) return false
  if (/[-…]/.test(match)) return false
  if (jsLexicalKindAt(line, index, lexStart) !== 'code') return false
  const prev = index > 0 ? line[index - 1] : ''
  if (prev && /[A-Za-z0-9_$]/.test(prev)) return false
  const before = line.slice(0, index)
  if (
    /(?:api[_-]?key|password|token|secret|service_role(?:_key)?|anon_key|authorization|bearer|mapbox(?:_access)?_token)\s*[:=]\s*(?:(['"`])(?:\\.|(?!\1).)*\1\s*\+\s*)*$/i.test(
      before,
    )
  ) {
    return false
  }
  const rest = match.slice(3)
  const camel = /[a-z][A-Z]|[A-Z][a-z]/.test(rest)
  if (!camel && rest.length > 18) return false
  return true
}

/**
 * URL / request / credential / userinfo / endpoint uses of the project ref.
 * Independent of path. Host-suffix and credential detectors stay separate.
 * fetch / curl / wget / Request construction HITs even without :// or a host suffix.
 */
export function projectRefUseIsUnsafe(line: string, index: number, needle: string): boolean {
  const before = line.slice(0, index)
  const after = line.slice(index + needle.length)
  if (after.toLowerCase().startsWith('.' + SUPABASE_CO)) return true
  if (/@$/.test(before)) return true
  if (/:\/\/[^\s'"`]*$/.test(before)) return true
  if (/^[/?#]/.test(after) && /:\/\//.test(before)) return true
  if (
    /(?:api[_-]?key|password|token|secret|service_role(?:_key)?|anon_key|authorization|bearer)\s*[:=]\s*(?:(['"`])(?:\\.|(?!\1).)*\1\s*\+\s*)*['"`]?$/i.test(
      before,
    )
  ) {
    return true
  }
  if (
    occurrenceInsideCall(
      line,
      index,
      /\b(?:fetch|axios(?:\.[A-Za-z]+)?|XMLHttpRequest|https?\.request|https?\.get|request)\s*\(/gi,
    )
  ) {
    return true
  }
  if (occurrenceInsideCall(line, index, /\bnew\s+Request\s*\(/gi)) return true
  if (/\b(?:curl|wget)\b/i.test(commandSegmentContaining(line, index))) return true
  if (/\b(?:endpoint|baseURL|base_url|apiUrl|API_URL|VITE_SUPABASE_URL|SUPABASE_URL)\s*[:=][^=]*$/i.test(before)) {
    return true
  }
  return false
}

function isApprovedBareProjectRefForm(rel: string, line: string, index: number): boolean {
  const before = line.slice(0, index)
  const after = line.slice(index + PROD_HOST.length)
  if (before.endsWith('`') && after.startsWith('`')) return true
  if (/--project-ref\s+$/.test(before) || /--project-ref\s+`$/.test(before)) return true
  if (rel === 'supabase/config.toml' && /^\s*#/.test(line) && /Project ref:\s+$/.test(before)) {
    return true
  }
  return false
}

/** Exact-repo, exact-path, and form-bound production project-ref metadata. */
export function isApprovedProjectRefMetadata(pathText: string, line: string, index: number): boolean {
  if (!pathIsAppProjectRefMetadataFile(pathText)) return false
  if (projectRefUseIsUnsafe(line, index, PROD_HOST)) return false
  return isApprovedBareProjectRefForm(parseTaggedScanPath(pathText).rel, line, index)
}

const TS_TYPE_IDENTS = new Set([
  'string',
  'number',
  'boolean',
  'bigint',
  'symbol',
  'object',
  'any',
  'unknown',
  'never',
  'void',
  'null',
  'undefined',
  'true',
  'false',
  'None',
  'nil',
])

function isRuntimeRef(value: string): boolean {
  let v = value.trim()
  if (!v) return true
  const q = v[0]
  if ((q === '"' || q === "'" || q === '`') && !v.includes(q, 1)) {
    v = v.slice(1)
  } else {
    v = v.replace(/^['"`]/, '').replace(/['"`]$/, '')
  }
  if (!v || TS_TYPE_IDENTS.has(v)) return true
  if (v.startsWith('$') || v.includes('$(')) return true
  if (/^process\.env\b/.test(v) || /^Deno\.env\.get\s*\(/.test(v)) return true
  if (/\?\.?/.test(v) && (v.includes('.') || v.includes('['))) return true
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$?]*)+/.test(v)) return true
  if (/^[A-Za-z_$][\w$]*\s*\(/.test(v)) return true
  return false
}

/** Unquoted JS/TS identifiers and types are not CARTO literals; env-style secrets are. */
function isCartoLiteralSecret(value: string, quoted: boolean): boolean {
  if (isRuntimeRef(value)) return false
  if (ALLOWED_CARTO_KEYS.has(value)) return false
  if (!quoted) {
    if (TS_TYPE_IDENTS.has(value)) return false
    if (/^[A-Z][A-Z0-9_]*$/.test(value)) return false
    if (/^[A-Z][A-Za-z0-9]*$/.test(value)) return false
    if (/[a-z][A-Z]/.test(value)) return false
    if (/^[A-Za-z_$][\w$]*$/.test(value) && value.length < 12) return false
  }
  return true
}

function occurrenceAllowed(line: string, index: number, needle: string): boolean {
  return inSpans(index, rejectionSpans(line, needle))
}

function stripComments(line: string): string {
  // Do not treat URL schemes (`https://`) as line comments.
  return line.replace(/(^|[^:])\/\/.*$/, '$1').replace(/\/\*[\s\S]*?\*\//g, '')
}

function classifyMapbox(
  match: string,
  line: string,
  index: number,
  pathText: string,
  lexStart?: JsLexState,
): ScanClass {
  if (ALLOWED_MAPBOX_PK.has(match)) {
    return match.startsWith('pk.eyJ') ? 'ALLOW_PLACEHOLDER' : 'ALLOW_FIXTURE'
  }
  if (occurrenceAllowed(line, index, match)) return 'ALLOW_REJECT_GUARD'
  if (isUnquotedJsMemberAccess(line, index, match, pathText, lexStart)) return 'ALLOW_FIXTURE'
  return 'HIT'
}

function classifyCartoValue(match: string, line: string, index: number): ScanClass {
  if (ALLOWED_CARTO_KEYS.has(match)) return 'ALLOW_FIXTURE'
  if (isRuntimeRef(match)) return 'ALLOW_ENV_REF'
  if (occurrenceAllowed(line, index, match)) return 'ALLOW_REJECT_GUARD'
  return 'HIT'
}

function classifyServiceRole(rawValue: string): ScanClass {
  if (!rawValue) return 'ALLOW_ENV_REF'
  if (isRuntimeRef(rawValue)) return 'ALLOW_ENV_REF'
  return 'HIT'
}

export function classifyLine(line: string, path = '', lineNo = 0, lexStart?: JsLexState): ScanFinding[] {
  const out: ScanFinding[] = []
  const push = (cls: ScanClass, kind: string) => {
    out.push({ cls, kind, path, line: lineNo })
  }
  const code = stripComments(line)

  MAPBOX_PK.lastIndex = 0
  for (const m of code.matchAll(MAPBOX_PK)) {
    if (m.index == null) continue
    const tok = m[0]
    if (/^pk\.[A-Za-z0-9]{6,}/.test(tok) === false && !ALLOWED_MAPBOX_PK.has(tok)) continue
    push(classifyMapbox(tok, code, m.index, path, lexStart), 'MAPBOX_PK')
  }

  JWT_THREE.lastIndex = 0
  for (const m of code.matchAll(JWT_THREE)) {
    if (m.index == null) continue
    const tok = m[0]
    if (tok.startsWith('eyJ1Ijoi') && tok.includes('...')) {
      push('ALLOW_PLACEHOLDER', 'JWT_LIKE')
      continue
    }
    if (occurrenceAllowed(line, m.index, tok)) {
      push('ALLOW_REJECT_GUARD', 'JWT_LIKE')
      continue
    }
    push('HIT', 'JWT_LIKE')
  }

  CARTO_FIXTURE_SHAPE.lastIndex = 0
  for (const m of code.matchAll(CARTO_FIXTURE_SHAPE)) {
    if (m.index == null) continue
    push(classifyCartoValue(m[0], line, m.index), 'CARTO_KEY')
  }

  CARTO_FIELD.lastIndex = 0
  for (const m of code.matchAll(CARTO_FIELD)) {
    if (m.index == null) continue
    const field = m[1] || ''
    const quoted = Boolean(m[2])
    const value = quoted ? (m[3] ?? '') : (m[4] ?? '')
    if (!value) continue
    if (/phase47[a-z0-9]*cartokey[a-z0-9]*/i.test(value)) continue
    const strong = CARTO_STRONG_FIELD.test(field)
    if (!strong && !quoted && /^[A-Za-z_$][\w$]*$/.test(value)) continue
    if (!strong && value.length < 12) continue
    if (!isCartoLiteralSecret(value, quoted)) continue
    const valueIndex = m.index + m[0].lastIndexOf(value)
    push(classifyCartoValue(value, line, valueIndex), 'CARTO_KEY')
  }

  SERVICE_ROLE_FIELD.lastIndex = 0
  for (const m of code.matchAll(SERVICE_ROLE_FIELD)) {
    if (m.index == null) continue
    const quoted = Boolean(m[2])
    const raw = quoted ? (m[3] ?? '') : (m[4] ?? '')
    push(classifyServiceRole(raw), 'SERVICE_ROLE_ASSIGN')
  }

  const hostRe = new RegExp(escapeRe(PROD_HOST), 'g')
  for (const m of code.matchAll(hostRe)) {
    if (m.index == null) continue
    if (
      occurrenceAllowed(line, m.index, PROD_HOST) ||
      pathKindAllowed(path, 'PROD_HOST', line, m.index, PROD_HOST)
    ) {
      push('ALLOW_REJECT_GUARD', 'PROD_HOST')
    } else if (isApprovedProjectRefMetadata(path, line, m.index)) {
      push('ALLOW_METADATA', 'PROD_HOST')
    } else {
      push('HIT', 'PROD_HOST')
    }
  }
  const coRe = /supabase\.co/gi
  for (const m of code.matchAll(coRe)) {
    if (m.index == null) continue
    if (
      occurrenceAllowed(line, m.index, SUPABASE_CO) ||
      occurrenceAllowed(line, m.index, PROD_HOST) ||
      pathKindAllowed(path, 'SUPABASE_CO', line, m.index, SUPABASE_CO)
    ) {
      push('ALLOW_REJECT_GUARD', 'SUPABASE_CO')
    } else if (isApprovedEnvExamplePlaceholder(path, line, m.index)) {
      push('ALLOW_PLACEHOLDER', 'SUPABASE_CO')
    } else if (isApprovedDistSdkHostSuffix(path, line, m.index)) {
      push('ALLOW_FIXTURE', 'SUPABASE_CO')
    } else {
      push('HIT', 'SUPABASE_CO')
    }
  }

  return out
}

export function scanText(text: string, path: string): ScanFinding[] {
  const findings: ScanFinding[] = []
  const lines = text.split(/\r?\n/)
  const lex = freshJsLexState()
  for (let i = 0; i < lines.length; i += 1) {
    findings.push(...classifyLine(lines[i], path, i + 1, lex))
    advanceJsLexLine(lex, lines[i])
  }
  return findings
}

export const IN_SCOPE_EXT = /\.(ts|tsx|js|mjs|cjs|sql|sh|env|e2e)$/i

export function isBinaryOrDataOutOfScope(rel: string): boolean {
  const n = rel.replace(/\\/g, '/')
  if (n.startsWith('tmp/') || n.includes('/tmp/')) return true
  if (n.startsWith('server/data/') || n.startsWith('server/uploads/')) return true
  if (n.includes('client/dist/') || n.endsWith('client/dist')) return true
  if (n.includes('supabase/.temp/') || n.includes('supabase/.branches/')) return true
  if (n.includes('node_modules/') || n.includes('scripts/__pycache__/')) return true
  if (n.endsWith('.env.47r.e2e.local')) return true
  return false
}

export function isStagingAllowlistText(rel: string): boolean {
  return STAGING_ALLOWLIST_SUFFIXES.some((suffix) => exactRelOrSlashSuffix(rel, suffix))
}

export function isInScopePath(rel: string): boolean {
  if (!rel) return false
  const n = rel.replace(/\\/g, '/')
  if (isBinaryOrDataOutOfScope(n)) return false
  if (isStagingAllowlistText(n)) return true
  if (n.endsWith('.md') || n.includes('.cursor/plans/')) return false
  if (n.endsWith('.json') && !n.endsWith('.webmanifest')) return false
  return IN_SCOPE_EXT.test(n) || n.endsWith('.env.47r.e2e') || n.endsWith('vite.config.js')
}

export function reviewedExclusion(rel: string): string | null {
  const n = rel.replace(/\\/g, '/')
  for (const row of REVIEWED_SCAN_EXCLUSIONS) {
    if (row.suffix && exactRelOrSlashSuffix(n, row.suffix)) {
      return row.reason
    }
    if (row.prefix && (n.startsWith(row.prefix) || n.includes(`/${row.prefix}`))) {
      return row.reason
    }
  }
  return null
}

export function classifyTouchedRel(rel: string): TouchedClass {
  if (reviewedExclusion(rel)) return 'reviewed_exclusion'
  if (!isInScopePath(rel)) return 'out_of_scope'
  return 'scan'
}

/** True when this relative path must be scanned (not excluded, not out of scope). */
export function is47rScanRel(rel: string): boolean {
  return classifyTouchedRel(rel) === 'scan'
}

function listTouchedRels(cwd: string): string[] {
  const tracked = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
  const extra = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
  return [...new Set([...tracked, ...extra])]
}

export function tryReadScanTarget(
  abs: string,
  tagged: string,
): { text: string } | { error: { path: string; code: string } } {
  if (!existsSync(abs)) return { error: { path: tagged, code: 'ENOENT' } }
  try {
    return { text: readFileSync(abs, 'utf8') }
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'READ'
    return { error: { path: tagged, code } }
  }
}

export function scanTouchedWorktrees(roots: { label: string; cwd: string }[]): WorktreeScanResult {
  const scanned: string[] = []
  const excluded: { path: string; reason: string }[] = []
  const outOfScope: string[] = []
  const hits: ScanFinding[] = []
  const readErrors: { path: string; code: string }[] = []

  for (const root of roots) {
    for (const rel of listTouchedRels(root.cwd)) {
      const tagged = `${root.label}:${rel}`
      const kind = classifyTouchedRel(rel)
      if (kind === 'out_of_scope') {
        outOfScope.push(tagged)
        continue
      }
      if (kind === 'reviewed_exclusion') {
        excluded.push({ path: tagged, reason: reviewedExclusion(rel) || 'reviewed' })
        continue
      }
      scanned.push(tagged)
      const got = tryReadScanTarget(`${root.cwd}/${rel}`, tagged)
      if ('error' in got) {
        readErrors.push(got.error)
        continue
      }
      hits.push(...unreviewedHits(scanText(got.text, tagged)))
    }
  }

  return { scanned, excluded, outOfScope, hits, readErrors }
}

export function unreviewedHits(findings: ScanFinding[]): ScanFinding[] {
  return findings.filter((f) => f.cls === 'HIT')
}

export function formatFinding(f: ScanFinding): string {
  return `${f.cls} ${f.kind} ${f.path}:${f.line}`
}

export type RcSourceKind = 'index' | string

export type RcManifestEntry = {
  repo: ScanRepoId
  /** `'index'` or an exact 40-character commit SHA. Never a worktree path. */
  source: RcSourceKind
  path: string
}

export type RcScanResult = {
  scanned: string[]
  hits: ScanFinding[]
  readErrors: { path: string; code: string }[]
  unclassified: { path: string; code: string }[]
}

export type ArtifactScanResult = {
  scanned: string[]
  hits: ScanFinding[]
  readErrors: { path: string; code: string }[]
  escapes: { path: string; code: string }[]
}

export type RepoRoots = Record<ScanRepoId, string>

const BINARY_EXT =
  /\.(?:png|jpe?g|gif|webp|ico|bmp|woff2?|ttf|eot|otf|wasm|zip|gz|tgz|br|7z|rar|mp[34]|webm|mov|pdf|sqlite3?|db|pyc|bin|dmg|exe|dll|so|dylib)$/i

export function isGeneratedDistPath(rel: string): boolean {
  const n = rel.replace(/\\/g, '/').replace(/^\.\//, '')
  return (
    n === 'client/dist' ||
    n.startsWith('client/dist/') ||
    n === 'dist' ||
    n.startsWith('dist/') ||
    n.includes('/client/dist/')
  )
}

export function isPositivelyBinaryPath(rel: string): boolean {
  return BINARY_EXT.test(rel.replace(/\\/g, '/'))
}

export function isPositivelyBinaryBytes(buf: Buffer): boolean {
  return buf.includes(0)
}

function taggedRc(entry: RcManifestEntry): string {
  return `${entry.repo}:${entry.source}:${entry.path}`
}

function validateRcEntry(entry: RcManifestEntry): string | null {
  if (entry.repo !== 'FamilyTravelSite' && entry.repo !== 'FamilyTravelApp') {
    return 'bad_repo'
  }
  if (!entry.path || entry.path.includes('\0') || path.isAbsolute(entry.path)) {
    return 'bad_path'
  }
  if (entry.path.split(/[\\/]/).includes('..')) {
    return 'bad_path'
  }
  if (entry.source !== 'index' && !SHA1_RE.test(entry.source)) {
    return 'bad_source'
  }
  if (isGeneratedDistPath(entry.path)) {
    return 'not_sha_blob'
  }
  return null
}

function gitBlobSpec(source: RcSourceKind, rel: string): string {
  return source === 'index' ? `:${rel}` : `${source}:${rel}`
}

export function readGitIndexOrShaBlob(
  cwd: string,
  source: RcSourceKind,
  rel: string,
): { bytes: Buffer } | { error: { path: string; code: string } } {
  const spec = gitBlobSpec(source, rel)
  try {
    const bytes = execFileSync('git', ['cat-file', 'blob', spec], {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return { bytes: Buffer.from(bytes) }
  } catch {
    return { error: { path: spec, code: 'ENOENT' } }
  }
}

/**
 * RC source mode: entire Git-index or `<SHA>:<path>` blobs only.
 * Reviewed dirty-tree exclusions do not apply. No worktree fallback.
 */
export function scanRcManifest(entries: RcManifestEntry[], roots: RepoRoots): RcScanResult {
  const scanned: string[] = []
  const hits: ScanFinding[] = []
  const readErrors: { path: string; code: string }[] = []
  const unclassified: { path: string; code: string }[] = []

  for (const entry of entries) {
    const tag = taggedRc(entry)
    const invalid = validateRcEntry(entry)
    if (invalid) {
      unclassified.push({ path: tag, code: invalid })
      continue
    }
    const cwd = roots[entry.repo]
    if (!cwd) {
      unclassified.push({ path: tag, code: 'missing_root' })
      continue
    }
    if (isPositivelyBinaryPath(entry.path)) {
      continue
    }
    const got = readGitIndexOrShaBlob(cwd, entry.source, entry.path)
    if ('error' in got) {
      readErrors.push({ path: tag, code: got.error.code })
      continue
    }
    if (isPositivelyBinaryBytes(got.bytes)) {
      continue
    }
    let text: string
    try {
      text = got.bytes.toString('utf8')
    } catch {
      readErrors.push({ path: tag, code: 'UTF8' })
      continue
    }
    scanned.push(tag)
    hits.push(...unreviewedHits(scanText(text, tag)))
  }

  return { scanned, hits, readErrors, unclassified }
}

function isInsideRoot(rootReal: string, candidateReal: string): boolean {
  const rel = path.relative(rootReal, candidateReal)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function listArtifactEntries(rootReal: string): { rel: string; abs: string }[] {
  const out: { rel: string; abs: string }[] = []
  const walk = (absDir: string) => {
    let names: string[]
    try {
      names = readdirSync(absDir)
    } catch {
      throw Object.assign(new Error('READDIR'), { code: 'READDIR', abs: absDir })
    }
    for (const name of names) {
      if (name === '.git') continue
      const abs = path.join(absDir, name)
      let st
      try {
        st = lstatSync(abs)
      } catch {
        throw Object.assign(new Error('LSTAT'), { code: 'LSTAT', abs })
      }
      if (st.isSymbolicLink()) {
        let target: string
        try {
          target = realpathSync(abs)
        } catch {
          throw Object.assign(new Error('SYMLINK'), { code: 'SYMLINK', abs })
        }
        if (!isInsideRoot(rootReal, target)) {
          throw Object.assign(new Error('ESCAPE'), { code: 'ESCAPE', abs })
        }
        let tst
        try {
          tst = lstatSync(target)
        } catch {
          throw Object.assign(new Error('SYMLINK'), { code: 'SYMLINK', abs })
        }
        if (tst.isDirectory()) {
          walk(target)
          continue
        }
        out.push({ rel: path.relative(rootReal, abs).replace(/\\/g, '/'), abs })
        continue
      }
      if (st.isDirectory()) {
        walk(abs)
        continue
      }
      if (st.isFile()) {
        out.push({ rel: path.relative(rootReal, abs).replace(/\\/g, '/'), abs })
      }
    }
  }
  walk(rootReal)
  return out
}

/**
 * Archive/artifact mode: textual files under an approved extract/build root.
 * Requires an explicit validated repo identity and artifact kind. Never infers
 * them from cwd, root name, or the operator worktree. Rejects symlink/root
 * escape, fails on unreadable files, never falls back to the operator worktree.
 */
export function scanArtifactRoot(root: string, identity: ArtifactScanIdentity): ArtifactScanResult {
  const scanned: string[] = []
  const hits: ScanFinding[] = []
  const readErrors: { path: string; code: string }[] = []
  const escapes: { path: string; code: string }[] = []

  const repo = parseScanRepoId(identity?.repo)
  const kind = parseArtifactKind(identity?.kind)
  if (!repo || !kind) {
    readErrors.push({
      path: '<identity>',
      code: !identity ? 'missing_identity' : !repo ? 'bad_repo' : 'bad_kind',
    })
    return { scanned, hits, readErrors, escapes }
  }

  if (!root || !existsSync(root)) {
    readErrors.push({ path: root || '<missing-root>', code: 'ENOENT' })
    return { scanned, hits, readErrors, escapes }
  }

  let rootReal: string
  try {
    rootReal = realpathSync(root)
  } catch {
    readErrors.push({ path: root, code: 'ENOENT' })
    return { scanned, hits, readErrors, escapes }
  }

  let entries: { rel: string; abs: string }[]
  try {
    entries = listArtifactEntries(rootReal)
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'READ'
    const abs =
      err && typeof err === 'object' && 'abs' in err ? String((err as { abs: unknown }).abs) : root
    const rel = path.relative(rootReal, abs).replace(/\\/g, '/') || abs
    if (code === 'ESCAPE' || code === 'SYMLINK') {
      escapes.push({ path: rel, code })
    } else {
      readErrors.push({ path: rel, code })
    }
    return { scanned, hits, readErrors, escapes }
  }

  for (const entry of entries) {
    const tagged = `${repo}:${kind}:${entry.rel}`
    if (isPositivelyBinaryPath(entry.rel)) continue
    let st
    try {
      st = lstatSync(entry.abs)
    } catch {
      readErrors.push({ path: entry.rel, code: 'LSTAT' })
      continue
    }
    if (st.isSymbolicLink()) {
      try {
        const target = realpathSync(entry.abs)
        if (!isInsideRoot(rootReal, target)) {
          escapes.push({ path: entry.rel, code: 'ESCAPE' })
          continue
        }
      } catch {
        escapes.push({ path: entry.rel, code: 'SYMLINK' })
        continue
      }
    }
    let bytes: Buffer
    try {
      bytes = readFileSync(entry.abs)
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'READ'
      readErrors.push({ path: entry.rel, code })
      continue
    }
    if (isPositivelyBinaryBytes(bytes)) continue
    scanned.push(entry.rel)
    hits.push(
      ...unreviewedHits(scanText(bytes.toString('utf8'), tagged)).map((f) => ({ ...f, path: entry.rel })),
    )
  }

  return { scanned, hits, readErrors, escapes }
}

export function artifactScanFailed(result: ArtifactScanResult): boolean {
  return result.hits.length > 0 || result.readErrors.length > 0 || result.escapes.length > 0
}

export function rcScanFailed(result: RcScanResult): boolean {
  return result.hits.length > 0 || result.readErrors.length > 0 || result.unclassified.length > 0
}

function isDirectCliRun(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return pathToFileURL(realpathSync(entry)).href === pathToFileURL(fileURLToPath(import.meta.url)).href
  } catch {
    return false
  }
}

function parseCliArg(name: string): string | undefined {
  const pref = `--${name}=`
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(pref)) return arg.slice(pref.length)
    if (arg === `--${name}`) {
      const i = process.argv.indexOf(arg)
      return process.argv[i + 1]
    }
  }
  return undefined
}

function runArtifactCli(): void {
  const root = parseCliArg('root')
  const repo = parseScanRepoId(parseCliArg('repo'))
  const kind = parseArtifactKind(parseCliArg('kind'))
  if (!root) {
    process.stderr.write('secretScan: --root is required for --mode=artifact\n')
    process.exit(2)
  }
  if (!repo) {
    process.stderr.write('secretScan: --repo must be FamilyTravelSite or FamilyTravelApp\n')
    process.exit(2)
  }
  if (!kind) {
    process.stderr.write('secretScan: --kind must be archive or dist\n')
    process.exit(2)
  }
  const result = scanArtifactRoot(root, { repo, kind })
  for (const f of result.hits) {
    process.stderr.write(`${formatFinding(f)}\n`)
  }
  for (const row of result.readErrors) {
    process.stderr.write(`READ ${row.code} ${row.path}\n`)
  }
  for (const row of result.escapes) {
    process.stderr.write(`ESCAPE ${row.code} ${row.path}\n`)
  }
  if (artifactScanFailed(result)) process.exit(1)
  process.stdout.write(`artifact_scan_ok files=${result.scanned.length}\n`)
}

if (isDirectCliRun()) {
  const mode = parseCliArg('mode')
  if (mode === 'artifact') {
    runArtifactCli()
  } else {
    process.stderr.write('secretScan: unknown or missing --mode (supported: artifact)\n')
    process.exit(2)
  }
}

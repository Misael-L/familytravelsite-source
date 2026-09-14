#!/usr/bin/env node
// Fails when §47 map strings in non-en locales are still English copies.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const i18nRoot = join(here, '..', 'src', 'i18n')
const PREFIXES = ['admin.familyMaps.', 'settings.mapSource.', 'settings.mapFamily', 'settings.mapResetToFamily']
const ALLOW = ['OpenStreetMap', 'OSM', 'Mapbox', 'CARTO', 'OpenFreeMap', 'TREK', 'pk.']
const KEY_LINE = /^\s*(['"])([a-z][a-zA-Z0-9.\-_]+)\1\s*:\s*(.*)$/
const STRING_LIT = /^(['"])((?:\\.|.)*)\1/

function isTarget(key) {
  return PREFIXES.some((p) => key.startsWith(p) || key === p.replace(/\.$/, ''))
}

function allowlistedOnly(value) {
  let rest = value
  for (const token of ALLOW) rest = rest.split(token).join('')
  return rest.replace(/[\s.,;:()/+-]/g, '') === ''
}

function unescapeString(raw) {
  return raw.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function extract(locale, file) {
  const lines = readFileSync(join(i18nRoot, locale, file), 'utf8').split('\n')
  const map = new Map()
  for (let i = 0; i < lines.length; i += 1) {
    const keyed = lines[i].match(KEY_LINE)
    if (!keyed) continue
    let rest = keyed[3].trim()
    if (!rest || rest === ',') {
      i += 1
      while (i < lines.length && !lines[i].trim()) i += 1
      rest = (lines[i] || '').trim()
    }
    const lit = rest.match(STRING_LIT)
    if (!lit) continue
    map.set(keyed[2], unescapeString(lit[2]))
  }
  return map
}

const locales = readdirSync(i18nRoot).filter((name) => {
  const p = join(i18nRoot, name)
  return statSync(p).isDirectory() && name !== 'externalNotifications'
})
const enAdmin = extract('en', 'admin.ts')
const enSettings = extract('en', 'settings.ts')
const failures = []

for (const locale of locales) {
  if (locale === 'en') continue
  const admin = extract(locale, 'admin.ts')
  const settings = extract(locale, 'settings.ts')
  for (const [key, enVal] of [...enAdmin, ...enSettings]) {
    if (!isTarget(key)) continue
    const got = key.startsWith('admin.') ? admin.get(key) : settings.get(key)
    if (got == null) {
      failures.push(`${locale}: missing ${key}`)
      continue
    }
    if (got === enVal && !allowlistedOnly(enVal)) {
      failures.push(`${locale}: ${key} equals English`)
    }
  }
}

if (failures.length) {
  console.error(`§47 English-equality: ${failures.length} failure(s)`)
  for (const line of failures.slice(0, 40)) console.error(`  ${line}`)
  if (failures.length > 40) console.error(`  … ${failures.length - 40} more`)
  process.exit(1)
}
console.log('§47 English-equality: OK')

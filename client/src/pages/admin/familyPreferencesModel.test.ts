import { describe, expect, it } from 'vitest'
import en from '@trek/shared/i18n/en'
import es from '@trek/shared/i18n/es'
import { BUILTIN_PREFERENCES, resolveEffectivePreferences } from './familyPreferencesModel'

describe('familyPreferencesModel', () => {
  it('resolves member override over family over builtin', () => {
    const { effective, sources } = resolveEffectivePreferences(
      {
        temperatureUnit: 'fahrenheit',
        distanceUnit: null,
        timeFormat: '12h',
        displayCurrency: 'EUR',
      },
      {
        temperatureUnit: null,
        distanceUnit: 'imperial',
        timeFormat: null,
        displayCurrency: 'trip',
      },
    )
    expect(effective).toEqual({
      temperatureUnit: 'fahrenheit',
      distanceUnit: 'imperial',
      timeFormat: '12h',
      displayCurrency: null,
    })
    expect(sources).toEqual({
      temperatureUnit: 'family',
      distanceUnit: 'member',
      timeFormat: 'family',
      displayCurrency: 'member',
    })
  })

  it('uses built-ins when family and member are unset', () => {
    const { effective, sources } = resolveEffectivePreferences(
      { temperatureUnit: null, distanceUnit: null, timeFormat: null, displayCurrency: null },
      { temperatureUnit: null, distanceUnit: null, timeFormat: null, displayCurrency: null },
    )
    expect(effective).toEqual(BUILTIN_PREFERENCES)
    expect(sources.temperatureUnit).toBe('builtin')
    expect(sources.displayCurrency).toBe('builtin')
  })
})

describe('admin.familyDefaults copy', () => {
  it('keeps English keys translated in Spanish with matching placeholders', () => {
    const keys = [
      ...Object.keys(en).filter(k => k.startsWith('admin.familyDefaults.')),
      ...Object.keys(en).filter(k => k.startsWith('settings.preference.')),
    ]
    expect(keys.length).toBeGreaterThan(6)
    const placeholder = /\{[a-zA-Z0-9_]+\}/g
    for (const key of keys) {
      const english = en[key]
      const spanish = es[key]
      expect(typeof spanish, key).toBe('string')
      expect(String(spanish).length, key).toBeGreaterThan(0)
      if (typeof english !== 'string' || typeof spanish !== 'string') continue
      const placeholders = english.match(placeholder) ?? []
      for (const token of new Set(placeholders)) {
        expect(spanish, key).toContain(token)
      }
    }
  })
})

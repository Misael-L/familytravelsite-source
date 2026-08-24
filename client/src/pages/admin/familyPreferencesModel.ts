import type { PreferenceFields, PreferenceSource } from '../../data/supabase/familyPreferences'
import { PORTABLE_SETTING_KEYS, isPortableSettingKey } from '../../data/supabase/familyPreferences'

export { PORTABLE_SETTING_KEYS, isPortableSettingKey }

export const BUILTIN_PREFERENCES: PreferenceFields = {
  temperatureUnit: 'celsius',
  distanceUnit: 'metric',
  timeFormat: '24h',
  displayCurrency: null,
}

export function resolveEffectivePreferences(
  family: PreferenceFields,
  member: PreferenceFields,
): { effective: PreferenceFields; sources: Record<keyof PreferenceFields, PreferenceSource> } {
  function pick<K extends keyof PreferenceFields>(
    key: K,
  ): { value: PreferenceFields[K]; source: PreferenceSource } {
    const memberVal = member[key]
    const familyVal = family[key]
    if (memberVal) {
      if (key === 'displayCurrency' && memberVal === 'trip') {
        return { value: null as PreferenceFields[K], source: 'member' }
      }
      return { value: memberVal, source: 'member' }
    }
    if (familyVal) return { value: familyVal, source: 'family' }
    return { value: BUILTIN_PREFERENCES[key], source: 'builtin' }
  }

  const temperature = pick('temperatureUnit')
  const distance = pick('distanceUnit')
  const time = pick('timeFormat')
  const currency = pick('displayCurrency')
  return {
    effective: {
      temperatureUnit: temperature.value,
      distanceUnit: distance.value,
      timeFormat: time.value,
      displayCurrency: currency.value,
    },
    sources: {
      temperatureUnit: temperature.source,
      distanceUnit: distance.source,
      timeFormat: time.source,
      displayCurrency: currency.source,
    },
  }
}

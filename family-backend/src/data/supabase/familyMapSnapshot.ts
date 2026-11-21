/**
 * Versioned family/person cache of the last successful effective map config.
 * Cache only. Wrong-family or corrupt → caller falls back to OSM.
 */

import { readLocal, removeLocal, writeLocal } from '../../startup/safeStorage'
import type { EffectiveMapSettings } from './familyMaps'
import { mapEffectiveMapSettings } from './familyMaps'

export const FAMILY_MAP_SNAPSHOT_VERSION = 1
const PREFIX = 'fta_family_map_v1:'

export function familyMapSnapshotKey(familyId: string, personId: string | null): string {
  return `${PREFIX}${familyId}:${personId ?? 'anon'}`
}

export function writeFamilyMapSnapshot(settings: EffectiveMapSettings): void {
  writeLocal(
    familyMapSnapshotKey(settings.familyId, settings.personId),
    JSON.stringify({
      v: FAMILY_MAP_SNAPSHOT_VERSION,
      familyId: settings.familyId,
      personId: settings.personId,
      payload: {
        family_id: settings.familyId,
        person_id: settings.personId,
        enabled_option_ids: settings.enabledOptionIds,
        default_option_id: settings.defaultOptionId,
        selected_option_id: settings.selectedOptionId,
        effective_option_id: settings.effectiveOptionId,
        source: settings.source,
        mapbox_public_token: settings.mapboxPublicToken,
        carto_api_key: settings.cartoApiKey,
        mapbox_configured: settings.mapboxConfigured,
        carto_configured: settings.cartoConfigured,
        credential_revision: settings.credentialRevision,
      },
    }),
  )
}

export function readFamilyMapSnapshot(
  familyId: string,
  personId: string | null,
): EffectiveMapSettings | null {
  const raw = readLocal(familyMapSnapshotKey(familyId, personId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as {
      v?: number
      familyId?: string
      personId?: string | null
      payload?: Record<string, unknown>
    }
    if (parsed.v !== FAMILY_MAP_SNAPSHOT_VERSION) return null
    if (parsed.familyId !== familyId) return null
    if ((parsed.personId ?? null) !== (personId ?? null)) return null
    if (!parsed.payload || typeof parsed.payload !== 'object') return null
    return mapEffectiveMapSettings(parsed.payload, familyId)
  } catch {
    return null
  }
}

export function clearFamilyMapSnapshot(familyId: string, personId: string | null): void {
  removeLocal(familyMapSnapshotKey(familyId, personId))
}

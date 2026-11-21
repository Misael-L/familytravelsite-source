import {
  getMyProfileDisplayPreferences,
  updateMyProfileDisplayPreferences,
} from '@family/backend/supabase/profileDisplayPreferences';
import { dateFormatSchema, weekStartSchema } from '@trek/shared';
import type { captureFamilyActor } from './actorContext';
import type { PreferencePatch } from './legacy/data/supabase/familyPreferences';
import type { Settings } from './legacy/types';

function parseDisplaySettings(value: unknown) {
  const row = value as Record<string, unknown> | null;
  return { date_format: dateFormatSchema.parse(row?.date_format), week_start: weekStartSchema.parse(row?.week_start) };
}

export async function readProfileDisplaySettings() {
  const result = await getMyProfileDisplayPreferences();
  return result === undefined ? {} : parseDisplaySettings(result);
}

export function hasProfileDisplaySettings(patch: Partial<Settings>) {
  return 'date_format' in patch || 'week_start' in patch;
}

export async function saveProfileDisplaySettings(
  patch: Partial<Settings>,
  portablePatch: PreferencePatch,
  familyId: string | null,
  actor: ReturnType<typeof captureFamilyActor>
) {
  const display = {
    ...('date_format' in patch && { date_format: dateFormatSchema.parse(patch.date_format) }),
    ...('week_start' in patch && { week_start: weekStartSchema.parse(patch.week_start) }),
  };
  const hasPortableFields = Object.keys(portablePatch).length > 0;
  if (hasPortableFields && !familyId) throw new Error('Family membership is required to save this setting');
  const result = await actor.perform(() =>
    updateMyProfileDisplayPreferences(
      display,
      familyId && hasPortableFields ? { id: familyId, patch: portablePatch } : undefined
    )
  );
  return { ...result, display: parseDisplaySettings(result.display) };
}

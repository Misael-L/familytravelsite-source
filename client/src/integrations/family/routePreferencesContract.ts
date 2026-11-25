import { roadtripPreferencesSchema, roadtripPreferencesUpdateSchema } from '@trek/shared';
import { z } from 'zod';

const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const routePreferencesSnapshotSchema = z.object({
  revision,
  preferences: roadtripPreferencesSchema,
  editable: z.boolean(),
});

export const routePreferencesSaveSchema = z.object({
  revision,
  preferences: roadtripPreferencesUpdateSchema,
}).strict();

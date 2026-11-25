import policy from '../../../corePlannerPackingProfile.json';
import combinedPolicy from '../../../coreTaskPlannerPackingProfile.json';
import { coreHttpsWriterProfileEnabled } from './coreHttpsWriterProfile';
import { primaryCoreMode } from './corePrimaryProfile';

export function coreHttpsPlannerPackingProfileEnabled(env: Record<string, unknown> = import.meta.env): boolean {
  return coreHttpsWriterProfileEnabled(policy, env) || coreHttpsCombinedProfileEnabled(env);
}

export function coreHttpsCombinedProfileEnabled(env: Record<string, unknown> = import.meta.env): boolean {
  const primary = primaryCoreMode(env);
  return primary === 'write' || primary === 'read' || coreHttpsWriterProfileEnabled(combinedPolicy, env);
}

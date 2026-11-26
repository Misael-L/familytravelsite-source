import policy from '../../../corePrimaryProfiles.json';
import { coreHttpsWriterProfileEnabled, writerOriginHash } from './coreHttpsWriterProfile';

declare const __FAMILY_HOSTED_DEVICE_RECOVERY__: boolean;

export function hostedDeviceRecoveryBuildQualified(env: Record<string, unknown>): boolean {
  return coreHttpsWriterProfileEnabled({ ...policy, value: policy.fallback }, env);
}

export function hostedDeviceRecoveryOriginQualified(origin: string | undefined): boolean {
  if (!origin) return false;
  const hash = writerOriginHash(origin);
  return hash === policy.previewSiteSha256 || hash === policy.productionSiteSha256;
}

/** Explicit build qualification only; never an account/source attribution rule. */
export function deviceRecoveryQualified(plane: unknown, qualification: unknown, source: unknown) {
  return (
    plane === 'supabase' &&
    qualification === 'local-v1' &&
    ['http://127.0.0.1:55331', 'http://localhost:55331'].includes(source as string)
  );
}
// Leave the source URL out of builds that cannot offer local device recovery.
export function familyDeviceRecoveryAvailable() {
  if (typeof __FAMILY_HOSTED_DEVICE_RECOVERY__ !== 'undefined' && __FAMILY_HOSTED_DEVICE_RECOVERY__)
    return hostedDeviceRecoveryOriginQualified(globalThis.location?.origin);
  return (
    import.meta.env.VITE_FAMILY_OFFLINE_READ_QUALIFICATION === 'local-v1' &&
    deviceRecoveryQualified(
      import.meta.env.VITE_DATA_PLANE,
      import.meta.env.VITE_FAMILY_OFFLINE_READ_QUALIFICATION,
      import.meta.env.VITE_SUPABASE_URL
    )
  );
}

/** Explicit build qualification only; never an account/source attribution rule. */
export function deviceRecoveryQualified(plane: unknown, qualification: unknown, source: unknown) {
  return (
    plane === 'supabase' &&
    qualification === 'local-v1' &&
    ['http://127.0.0.1:55331', 'http://localhost:55331'].includes(source as string)
  );
}
// Leave the source URL out of builds that cannot offer local device recovery.
export const familyDeviceRecoveryAvailable = () =>
  import.meta.env.VITE_FAMILY_OFFLINE_READ_QUALIFICATION === 'local-v1' &&
  deviceRecoveryQualified(
    import.meta.env.VITE_DATA_PLANE,
    import.meta.env.VITE_FAMILY_OFFLINE_READ_QUALIFICATION,
    import.meta.env.VITE_SUPABASE_URL
  );

/** Read source identifiers from the validated public build environment. */
export function familySourceEnvironment(key: 'VITE_DATA_PLANE' | 'VITE_SUPABASE_URL'): string | undefined {
  return import.meta.env[key];
}

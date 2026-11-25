import { afterEach, expect, it, vi } from 'vitest';
import { packingBagQualificationEnabled, packingRecoveryQualificationEnabled } from './offlineTripQualification';
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => import.meta.env.VITE_SUPABASE_URL }));
afterEach(() => vi.unstubAllEnvs());
for (const source of [
  'http://127.0.0.1:56041',
  'http://127.0.0.1:55931',
  'http://localhost:56041',
  'https://fixture.supabase.invalid',
])
  for (const flag of ['', 'local-v1', 'other'])
    it('admits only the separate exact128 source ' + source + ' ' + flag, () => {
      vi.stubEnv('VITE_SUPABASE_URL', source);
      vi.stubEnv('VITE_FAMILY_PACKING_RECOVERY_QUALIFICATION', flag);
      vi.stubEnv('VITE_FAMILY_PACKING_BAG_QUALIFICATION', '');
      expect(packingRecoveryQualificationEnabled()).toBe(source === 'http://127.0.0.1:56041' && flag === 'local-v1');
      expect(packingBagQualificationEnabled()).toBe(false);
    });
it('keeps accepted127 behavior independent', () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55931');
  vi.stubEnv('VITE_FAMILY_PACKING_BAG_QUALIFICATION', 'local-v1');
  vi.stubEnv('VITE_FAMILY_PACKING_RECOVERY_QUALIFICATION', '');
  expect(packingBagQualificationEnabled()).toBe(true);
  expect(packingRecoveryQualificationEnabled()).toBe(false);
});

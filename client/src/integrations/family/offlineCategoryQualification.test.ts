import { afterEach, expect, it, vi } from 'vitest';
import { offlineTripQualificationEnabled, packingCategoryQualificationEnabled } from './offlineTripQualification';
const source = vi.hoisted(() => ({ url: 'http://127.0.0.1:55331' }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => source.url }));
afterEach(() => vi.unstubAllEnvs());
it.each([
  'https://example.supabase.invalid',
  'http://localhost:55431',
  'http://127.0.0.1:55432',
  'http://127.0.0.1:55431/',
  'http://127.0.0.1:55331.evil.test',
])('rejects unqualified source %s', (url) => {
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
  source.url = url;
  expect(offlineTripQualificationEnabled()).toBe(false);
  expect(packingCategoryQualificationEnabled()).toBe(false);
});
it('admits122 only with the explicit local build flag and retains the old120 read-only qualification', () => {
  source.url = 'http://127.0.0.1:55431';
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', '');
  expect(offlineTripQualificationEnabled()).toBe(false);
  expect(packingCategoryQualificationEnabled()).toBe(false);
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
  expect(offlineTripQualificationEnabled()).toBe(true);
  expect(packingCategoryQualificationEnabled()).toBe(true);
  source.url = 'http://127.0.0.1:55331';
  expect(offlineTripQualificationEnabled()).toBe(true);
  expect(packingCategoryQualificationEnabled()).toBe(false);
});

it('qualified122 public image cache keeps its exact source identity and rejects unqualified aliases', async () => {
  const { createPublicVariantCache } = await import('./publicVariantCache');
  expect(() => createPublicVariantCache({ source: 'http://127.0.0.1:55431' })).not.toThrow();
  for (const value of ['https://example.supabase.invalid', 'http://localhost:55431', 'http://127.0.0.1:55432'])
    expect(() => createPublicVariantCache({ source: value })).toThrow();
});
it('native source ownership admits the explicit122 build without treating a locator as an authorization grant', async () => {
  const database = await import('../../db/sourceDatabase');
  const install = vi.spyOn(database, 'installSourcePolicy');
  const { installFamilyNativeSourceOwnership } = await import('./nativeSourceOwnership');
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
  source.url = 'http://127.0.0.1:55431';
  const release = installFamilyNativeSourceOwnership();
  expect(install).toHaveBeenCalledTimes(1);
  const policy = install.mock.calls[0][0];
  await expect(policy.select(123)).rejects.toThrow();
  release();
  install.mockRestore();
});

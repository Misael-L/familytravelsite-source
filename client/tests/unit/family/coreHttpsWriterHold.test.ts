import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPublicClientConfigReceipt } from '../../../publicClientConfig.mjs';
import { currentSourcePolicy } from '../../../src/db/sourceDatabase';
import { familyDeviceRecoveryAvailable } from '../../../src/integrations/family/deviceRecoveryGate';
import { installFamilyNativeSourceOwnership } from '../../../src/integrations/family/nativeSourceOwnership';
import { offlineTripQualificationEnabled } from '../../../src/integrations/family/offlineTripQualification';
import { resetOfflineTestDatabase } from '../../helpers/offlineDb';
import { resetAllStores } from '../../helpers/store';
const source = ['https://family-core-fixture.', 'supabase', '.co'].join('');
let release = () => {};
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', source);
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', '');
  vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', '');
});
afterEach(async () => {
  release();
  release = () => {};
  vi.unstubAllEnvs();
  localStorage.clear();
  await resetOfflineTestDatabase();
});
function install() {
  release = installFamilyNativeSourceOwnership();
  return currentSourcePolicy();
}
describe('ordinary HTTPS source stays held without the explicit isolated task selection', () => {
  it('an unselected HTTPS source cannot install a writable source policy', () => {
    expect(install()).toBeNull();
    expect(offlineTripQualificationEnabled()).toBe(false);
    expect(familyDeviceRecoveryAvailable()).toBe(false);
  });
  it('does not promote a forged cached locator into accepted bootstrap', () => {
    localStorage.setItem('family-native-current.v1', 'trek-offline-f1-unqualified-u1');
    expect(install()).toBeNull();
  });
  it('does not combine absent selection with old local markers to admit HTTPS', () => {
    vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
    vi.stubEnv('VITE_FAMILY_PACKING_BAG_QUALIFICATION', 'local-v1');
    expect(install()).toBeNull();
    expect(offlineTripQualificationEnabled()).toBe(false);
  });
  it.each([source + '/', source + '.invalid', 'http://127.0.0.1:55331'])(
    'holds an unselected writer profile on %s',
    (value) => {
      vi.stubEnv('VITE_SUPABASE_URL', value);
      expect(install()).toBeNull();
    }
  );
  it('keeps existing selected loopback ownership separate, requiring accepted bootstrap', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55331');
    vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
    const policy = install();
    if (!policy) throw Error('Expected existing local policy');
    await expect(policy.select(1)).rejects.toThrow();
  });
  it('the public configuration receipt refuses an unqualified writer profile value', () => {
    expect(() =>
      createPublicClientConfigReceipt({}, '5.1.4', 'a'.repeat(40), {
        VITE_DATA_PLANE: 'supabase',
        VITE_SUPABASE_URL: source,
        VITE_SUPABASE_ANON_KEY: ['sb_', 'publishable_', 'fixture_supported_core'].join(''),
        VITE_FAMILY_CORE_WRITER_PROFILE: 'isolated-task-v2',
      })
    ).toThrow('public_client_configuration_refused');
  });
});

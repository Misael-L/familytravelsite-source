import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { currentSourcePolicy } from '../../db/sourceDatabase';
import {
  coherentStayQualificationEnabled,
  nativeStayCommandQualificationEnabled,
  nativeStayControlsQualificationEnabled,
  nativeStayWriteQualificationEnabled,
} from './coherentStayQualification';
import { familyDeviceRecoveryAvailable } from './deviceRecoveryGate';
import { installFamilyNativeSourceOwnership } from './nativeSourceOwnership';
import {
  completePreparationSource,
  offlineTripQualificationEnabled,
  packingAggregateQualificationEnabled,
  packingBagQualificationEnabled,
  packingCategoryQualificationEnabled,
  packingIdentityQualificationEnabled,
  packingRecoveryQualificationEnabled,
  v4PrivateFileSource,
  v4PublicImageSource,
} from './offlineTripQualification';

const source = 'http://127.0.0.1:55331';
const advancedFlags = {
  VITE_FAMILY_PACKING_IDENTITY_QUALIFICATION: 'local-v2',
  VITE_FAMILY_PACKING_AGGREGATE_QUALIFICATION: 'local-v3',
  VITE_FAMILY_PACKING_BAG_QUALIFICATION: 'local-v1',
  VITE_FAMILY_PACKING_RECOVERY_QUALIFICATION: 'local-v1',
  VITE_FAMILY_STAY_READ_QUALIFICATION: 'local-v4',
  VITE_FAMILY_STAY_WRITE_QUALIFICATION: 'local-existing-v1',
  VITE_FAMILY_STAY_COMMAND_QUALIFICATION: 'local-native-v1',
  VITE_FAMILY_STAY_CONTROLS_QUALIFICATION: 'local-native-v1',
  VITE_FAMILY_PRIVATE_FILE_QUALIFICATION: 'local-v4',
};
let release = () => {};
function advanced() {
  return [
    packingCategoryQualificationEnabled(),
    packingIdentityQualificationEnabled(),
    packingAggregateQualificationEnabled(),
    packingBagQualificationEnabled(),
    packingRecoveryQualificationEnabled(),
    coherentStayQualificationEnabled(),
    nativeStayCommandQualificationEnabled(),
    nativeStayControlsQualificationEnabled(),
    nativeStayWriteQualificationEnabled(),
    v4PublicImageSource(source),
    v4PrivateFileSource(source),
  ];
}
function install() {
  release = installFamilyNativeSourceOwnership();
  return currentSourcePolicy();
}
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', source);
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', '');
  for (const key of Object.keys(advancedFlags)) vi.stubEnv(key, '');
});
afterEach(async () => {
  release();
  release = () => {};
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await resetOfflineTestDatabase();
});
describe('one bounded supported-core source profile; not authorization or App acceptance', () => {
  it('ordinary build does not acquire local-only ownership or advanced capabilities', () => {
    expect(install()).toBeNull();
    expect(offlineTripQualificationEnabled()).toBe(false);
    expect(familyDeviceRecoveryAvailable()).toBe(false);
    expect(advanced().every((value) => value === false)).toBe(true);
  });
  it('one existing marker admits the base profile with advanced features still off', () => {
    vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
    expect(install()).not.toBeNull();
    expect(offlineTripQualificationEnabled()).toBe(true);
    expect(familyDeviceRecoveryAvailable()).toBe(true);
    expect(completePreparationSource(source, 'family.offline-trip.v1')).toBe(true);
    expect(advanced().every((value) => value === false)).toBe(true);
  });
  it('the qualification marker alone cannot select a private writable owner', async () => {
    vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
    const policy = install();
    expect(policy).not.toBeNull();
    if (!policy) throw new Error('Expected the explicitly qualified local installer');
    await expect(policy.select(123)).rejects.toThrow();
  });
  it('the existing localhost ownership alias is not promoted into cold-read qualification', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:55331');
    vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
    expect(install()).not.toBeNull();
    expect(offlineTripQualificationEnabled()).toBe(false);
    expect(familyDeviceRecoveryAvailable()).toBe(true);
  });
  it.each(['https://core.example.invalid', 'http://127.0.0.1:55332', source + '/'])(
    'refuses an unqualified source: %s',
    (value) => {
      vi.stubEnv('VITE_SUPABASE_URL', value);
      vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
      expect(install()).toBeNull();
      expect(offlineTripQualificationEnabled()).toBe(false);
      expect(familyDeviceRecoveryAvailable()).toBe(false);
    }
  );
  it('extra markers cannot turn this core source into a different advanced rehearsal', () => {
    vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
    for (const [key, value] of Object.entries(advancedFlags)) vi.stubEnv(key, value);
    expect(install()).not.toBeNull();
    expect(advanced().every((value) => value === false)).toBe(true);
  });
  it('disposing the installer removes its source policy', () => {
    vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
    expect(install()).not.toBeNull();
    release();
    release = () => {};
    expect(currentSourcePolicy()).toBeNull();
  });
});

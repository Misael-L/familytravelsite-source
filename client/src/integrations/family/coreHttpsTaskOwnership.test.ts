import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { offlineSourceOwner, reopenForUser } from '../../db/offlineDb';
import { currentSourcePolicy } from '../../db/sourceDatabase';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { captureFamilyActor } from './actorContext';
import { CollectionCommandSession } from './collectionCommandSession';
import { familyDeviceRecoveryAvailable } from './deviceRecoveryGate';
import { acceptNativeSourceOwner, installFamilyNativeSourceOwnership } from './nativeSourceOwnership';
import {
  offlineTripQualificationEnabled,
  packingBagQualificationEnabled,
  v4PrivateFileSource,
} from './offlineTripQualification';
import { familyAuthStore } from './repository';

const source = ['https://family-core-fixture.', 'supabase', '.co'].join('');
const owner = {
  format: 'family.native-owner.v1' as const,
  source,
  user_id: 'd1230000-0000-4000-8000-000000000001',
  family_id: 'd1230000-0000-4000-8000-000000000002',
  person_id: 'd1230000-0000-4000-8000-000000000003',
  native_user: 123,
};
let release = () => {};
beforeEach(async () => {
  resetAllStores();
  _resetNetworkMode();
  await resetOfflineTestDatabase();
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', source);
  vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', 'isolated-task-v1');
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', '');
  familyAuthStore.setState({
    isAuthenticated: true,
    authUserId: owner.user_id,
    familyId: owner.family_id,
    personId: owner.person_id,
    authGate: 'ok',
    authCheckFailed: false,
  });
  setAuthed(true);
});
afterEach(async () => {
  release();
  release = () => {};
  setAuthed(false);
  vi.unstubAllEnvs();
  await resetOfflineTestDatabase();
});
function install() {
  release = installFamilyNativeSourceOwnership();
  const policy = currentSourcePolicy();
  if (!policy) throw Error('Expected explicitly selected isolated HTTPS ownership');
  return policy;
}
describe('actual isolated HTTPS source ownership installer', () => {
  it('selected: installs but refuses selection before accepted bootstrap', async () => {
    const policy = install();
    await expect(policy.select(owner.native_user)).rejects.toThrow();
  });
  it('selected: binds the original owner only after its current actor is accepted', async () => {
    const policy = install();
    acceptNativeSourceOwner(owner, captureFamilyActor());
    const binding = await policy.select(owner.native_user);
    expect(binding.owner).toEqual(owner);
    expect(binding.current()).toBe(true);
    expect(binding.initialize()).toBe(true);
    expect(binding.writable()).toBe(true);
    familyAuthStore.setState({ isAuthenticated: false });
    expect(binding.current()).toBe(false);
    expect(binding.writable()).toBe(false);
  });
  it('selected: refuses a stale bootstrap and preserves separate advanced gates', async () => {
    const policy = install(),
      actor = captureFamilyActor();
    familyAuthStore.setState({ personId: 'd1230000-0000-4000-8000-000000000004' });
    expect(() => acceptNativeSourceOwner(owner, actor)).toThrow();
    await expect(policy.select(owner.native_user)).rejects.toThrow();
    expect(offlineTripQualificationEnabled()).toBe(false);
    expect(packingBagQualificationEnabled()).toBe(false);
    expect(v4PrivateFileSource(source)).toBe(false);
    expect(familyDeviceRecoveryAvailable()).toBe(false);
  });
  it('selected: binds a real IDB owner, refuses wrong identity, and cannot initialize offline', async () => {
    const policy = install();
    await expect(policy.select(999)).rejects.toThrow();
    acceptNativeSourceOwner(owner, captureFamilyActor());
    await reopenForUser(owner.native_user);
    expect(offlineSourceOwner()).toEqual(owner);
    const binding = await policy.select(owner.native_user);
    setForcedOffline(true);
    expect(binding.initialize()).toBe(false);
    setForcedOffline(false);
    expect(binding.initialize()).toBe(true);
    release();
    release = () => {};
    expect(binding.current()).toBe(false);
  });
  it('selected: keeps direct Collection commands refused after accepting the real source owner', async () => {
    install();
    acceptNativeSourceOwner(owner, captureFamilyActor());
    await reopenForUser(owner.native_user);
    const rpc = vi.fn();
    expect(
      () =>
        new CollectionCommandSession(
          {
            scope: {
              version: 1,
              collection_id: 'd1230000-0000-4000-8000-000000000006',
              user_id: owner.user_id,
              family_id: owner.family_id,
              person_id: owner.person_id,
              session_id: 'd1230000-0000-4000-8000-000000000005',
            },
            source_url: source,
            assertCurrent: () => {},
            publish: () => {},
          },
          rpc
        )
    ).toThrow('read only');
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['', 'local-v1', 'isolated-task-v2'])('control: profile %s cannot install ownership', (value) => {
    vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', value);
    release = installFamilyNativeSourceOwnership();
    expect(currentSourcePolicy()).toBeNull();
  });
  it.each([
    source + '/',
    source + '?x=1',
    source + '#x',
    source.replace('https:', 'HTTPS:'),
    source.replace('https://', 'https://person@'),
    source + '.invalid',
    'http://127.0.0.1:55331',
  ])('control: refuses source variation %s', (value) => {
    vi.stubEnv('VITE_SUPABASE_URL', value);
    release = installFamilyNativeSourceOwnership();
    expect(currentSourcePolicy()).toBeNull();
  });
});

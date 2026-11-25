import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../tests/helpers/factories';
import { useAuthStore as familyAuthStore } from '../integrations/family/legacy/store/authStore';
import { useAuthStore } from '../store/authStore';
import { NATIVE_AUTH_SNAPSHOT_KEY, nativeAuthSnapshotUserId, readNativeAuthSnapshot } from './nativeAuthSnapshot';

const oldKey = 'trek_auth_snapshot';
const initialFamily = familyAuthStore.getState();
afterEach(() => {
  familyAuthStore.setState(initialFamily, true);
});
const native = (id = 503) => ({
  version: 0,
  state: {
    isAuthenticated: true,
    user: {
      id,
      username: 'Traveler',
      email: 'traveler@example.invalid',
      role: 'user',
      avatar_url: 'https://fixture.invalid/signed?token=private',
    },
  },
});
beforeEach(() => {
  localStorage.clear();
});
describe('native auth display cache ownership', () => {
  it('preserves the Family snapshot byte-for-byte during native hydration, updates and cache clearing', async () => {
    familyAuthStore.setState({
      isAuthenticated: true,
      user: buildUser({ id: 0 }),
      authUserId: 'family-user',
      personId: 'family-person',
      familyId: 'family-id',
    });
    const family = localStorage.getItem(oldKey);
    expect(JSON.parse(family ?? 'null').version).toBe(1);
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.persist.getOptions().name).toBe(NATIVE_AUTH_SNAPSHOT_KEY);
    useAuthStore.setState({
      user: buildUser({ id: 503, avatar_url: 'https://fixture.invalid/signed?token=private' }),
      isAuthenticated: true,
    });
    expect(nativeAuthSnapshotUserId(localStorage)).toBe(503);
    expect(localStorage.getItem(NATIVE_AUTH_SNAPSHOT_KEY)).not.toContain('avatar_url');
    expect(localStorage.getItem(NATIVE_AUTH_SNAPSHOT_KEY)).not.toContain('token=private');
    expect(localStorage.getItem(oldKey)).toBe(family);
    const nativeCache = localStorage.getItem(NATIVE_AUTH_SNAPSHOT_KEY);
    familyAuthStore.setState({ membershipRole: 'reviewer' });
    expect(localStorage.getItem(NATIVE_AUTH_SNAPSHOT_KEY)).toBe(nativeCache);
    expect(JSON.parse(localStorage.getItem(oldKey) ?? 'null').state.membershipRole).toBe('reviewer');
    const updatedFamily = localStorage.getItem(oldKey);
    useAuthStore.setState({ user: null, isAuthenticated: false });
    expect(nativeAuthSnapshotUserId(localStorage)).toBeNull();
    useAuthStore.persist.clearStorage();
    expect(localStorage.getItem(oldKey)).toBe(updatedFamily);
  });
  it('copies a recognized old native cache without overwriting its source or changing the database owner', () => {
    const raw = JSON.stringify(native());
    localStorage.setItem(oldKey, raw);
    expect(nativeAuthSnapshotUserId(localStorage)).toBe(503);
    expect(localStorage.getItem(oldKey)).toBe(raw);
    expect(readNativeAuthSnapshot(localStorage)).not.toContain('token=private');
    expect(JSON.parse(localStorage.getItem(NATIVE_AUTH_SNAPSHOT_KEY) ?? 'null').version).toBe(0);
  });
  it.each([0, 1])('does not interpret a version-%s Family snapshot as native cache', (version) => {
    const raw = JSON.stringify({
      ...native(),
      version,
      state: { ...native().state, authUserId: 'family-user', familyId: null, personId: null },
    });
    localStorage.setItem(oldKey, raw);
    expect(readNativeAuthSnapshot(localStorage)).toBeNull();
    expect(nativeAuthSnapshotUserId(localStorage)).toBeNull();
    expect(localStorage.getItem(oldKey)).toBe(raw);
    expect(localStorage.getItem(NATIVE_AUTH_SNAPSHOT_KEY)).toBeNull();
  });
  it('respects the native signed-out cache rather than resurrecting an old signed-in snapshot', () => {
    localStorage.setItem(oldKey, JSON.stringify(native()));
    const raw = JSON.stringify({ version: 0, state: { isAuthenticated: false, user: null } });
    localStorage.setItem(NATIVE_AUTH_SNAPSHOT_KEY, raw);
    expect(readNativeAuthSnapshot(localStorage)).toBe(raw);
    expect(nativeAuthSnapshotUserId(localStorage)).toBeNull();
  });
  it.each([
    'not-json',
    JSON.stringify(native(0)),
    JSON.stringify(native(-2)),
    JSON.stringify({ version: 2, state: native().state }),
  ])('retains an unrecognized old cache without using it (%s)', (raw) => {
    localStorage.setItem(oldKey, raw);
    expect(readNativeAuthSnapshot(localStorage)).toBeNull();
    expect(nativeAuthSnapshotUserId(localStorage)).toBeNull();
    expect(localStorage.getItem(oldKey)).toBe(raw);
  });
  it('keeps a readable old native cache usable when copying fails from a quota error', () => {
    const raw = JSON.stringify(native());
    localStorage.setItem(oldKey, raw);
    const store = {
      getItem: localStorage.getItem.bind(localStorage),
      removeItem: localStorage.removeItem.bind(localStorage),
      setItem: vi.fn(() => {
        throw new Error('quota');
      }),
    };
    expect(nativeAuthSnapshotUserId(store)).toBe(503);
    expect(localStorage.getItem(oldKey)).toBe(raw);
    expect(localStorage.getItem(NATIVE_AUTH_SNAPSHOT_KEY)).toBeNull();
  });
});

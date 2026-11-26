import Dexie from 'dexie';
import { detachOfflineDatabase } from '../../db/offlineDb';
import {
  installSourcePolicy,
  sourceOwner,
  sourceOwnerName,
  SourceOwnershipError,
  type SourceDatabaseBinding,
  type SourceDatabaseOwner,
} from '../../db/sourceDatabase';
import { isAuthed } from '../../sync/authGate';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { captureFamilyActor } from './actorContext';
import { coreHttpsPlannerPackingProfileEnabled } from './coreHttpsPlannerPackingProfile';
import { coreHttpsTaskProfileEnabled } from './coreHttpsTaskProfile';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { familyAuthStore } from './repository';

type Grant = { owner: SourceDatabaseOwner; actor: ReturnType<typeof captureFamilyActor> };
let accept: ((owner: SourceDatabaseOwner, actor: Grant['actor']) => void) | undefined;
/** Only called after the real Family bootstrap and every required hydration succeeded. */
export function acceptNativeSourceOwner(owner: SourceDatabaseOwner, actor: Grant['actor']) {
  accept?.(owner, actor);
}
export function installFamilyNativeSourceOwnership() {
  // Explicit bounded aliases qualify ownership only; the cold-read gate remains literal loopback.
  if (
    !coreHttpsTaskProfileEnabled() &&
    !coreHttpsPlannerPackingProfileEnabled() &&
    (import.meta.env.VITE_FAMILY_OFFLINE_READ_QUALIFICATION !== 'local-v1' ||
      !['http://127.0.0.1:55331', 'http://localhost:55331', 'http://127.0.0.1:55431'].includes(getSupabaseUrl()))
  )
    return () => {};
  let active = true,
    grant: Grant | undefined;
  const matches = (owner: SourceDatabaseOwner) => {
    const state = familyAuthStore.getState();
    return (
      active &&
      getSupabaseUrl() === owner.source &&
      state.isAuthenticated &&
      state.authUserId === owner.user_id &&
      state.familyId === owner.family_id &&
      state.personId === owner.person_id &&
      (state.authGate === null || state.authGate === 'ok')
    );
  };
  const key = (user: number) => 'family-native-locator.v1:' + JSON.stringify([getSupabaseUrl(), user]);
  const binding = async (owner: SourceDatabaseOwner, accepted?: Grant): Promise<SourceDatabaseBinding> => {
    const name = await sourceOwnerName(owner);
    const lifetime = accepted?.actor ?? captureFamilyActor();
    const current = () => matches(owner) && lifetime.current();
    const verified = () =>
      !!accepted &&
      grant === accepted &&
      current() &&
      accepted.actor.current() &&
      familyAuthStore.getState().authGate === 'ok' &&
      !isEffectivelyOffline();
    return {
      name,
      owner,
      current,
      initialize: verified,
      writable: () =>
        !!accepted &&
        grant === accepted &&
        current() &&
        accepted.actor.current() &&
        isAuthed() &&
        familyAuthStore.getState().authGate === 'ok' &&
        !familyAuthStore.getState().authCheckFailed,
      selected() {
        if (!current()) throw new SourceOwnershipError();
        // A locator is not permission. It is checked again against the immutable IDB marker on every use.
        try {
          localStorage.setItem(key(owner.native_user), JSON.stringify({ name, owner }));
          localStorage.setItem('family-native-current.v1', name);
        } catch {
          /* Storage-disabled browsers retain the current proven connection only. */
        }
      },
    };
  };
  const listener = (owner: SourceDatabaseOwner, actor: Grant['actor']) => {
    actor.assertCurrent();
    const checked = sourceOwner(owner);
    if (!matches(checked) || isEffectivelyOffline() || familyAuthStore.getState().authGate !== 'ok')
      throw new SourceOwnershipError();
    if (grant && grant.actor.current() && JSON.stringify(grant.owner) === JSON.stringify(checked)) return;
    grant = { owner: checked, actor };
  };
  accept = listener;
  const release = installSourcePolicy({
    async select(user) {
      const original = grant;
      if (
        !original ||
        Number(user) !== original.owner.native_user ||
        !matches(original.owner) ||
        !original.actor.current()
      )
        throw new SourceOwnershipError();
      return binding(original.owner, original);
    },
    async read() {
      const { nativeAuthSnapshotUserId } = await import('../../db/nativeAuthSnapshot');
      const user = nativeAuthSnapshotUserId(localStorage);
      if (!user || !isEffectivelyOffline()) throw new SourceOwnershipError();
      const raw = localStorage.getItem(key(Number(user)));
      if (!raw) throw new SourceOwnershipError();
      const value = JSON.parse(raw),
        owner = sourceOwner(value.owner);
      if (
        owner.native_user !== Number(user) ||
        !matches(owner) ||
        value.name !== (await sourceOwnerName(owner)) ||
        !(await Dexie.exists(value.name))
      )
        throw new SourceOwnershipError();
      return binding(owner);
    },
  });
  detachOfflineDatabase();
  return () => {
    active = false;
    grant = undefined;
    if (accept === listener) accept = undefined;
    release();
    detachOfflineDatabase();
  };
}

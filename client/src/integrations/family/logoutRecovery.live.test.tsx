import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { http, HttpResponse, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTrip, buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { isAuthed, setAuthed } from '../../sync/authGate';
import { waitForLogout } from '../../sync/logoutCoordinator';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyFrontendRepository } from './repository';
import { createFamilyFetch } from './transport';
vi.mock('../../sync/tripSyncManager', () => ({ tripSyncManager: { syncAll: vi.fn(async () => {}) } }));
vi.mock('../../sync/syncTriggers', () => ({ registerSyncTriggers: vi.fn(), unregisterSyncTriggers: vi.fn() }));
vi.mock('../../push/webPush', () => ({
  forgetPushDeviceOnLogout: vi.fn(async () => {}),
  resyncPushSubscription: vi.fn(async () => {}),
}));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({
  getDataPlane: () => 'supabase',
  getSupabaseUrl: () => live?.api,
  getSupabaseAnonKey: () => live?.anon_key,
}));
vi.mock('@family/backend/supabase/env', () => ({
  getDataPlane: () => 'supabase',
  getSupabaseUrl: () => live?.api,
  getSupabaseAnonKey: () => live?.anon_key,
}));
const path = process.env.FAMILY_LOGOUT_FIXTURE;
const live = path
  ? (JSON.parse(readFileSync(path, 'utf8')) as {
      api: string;
      anon_key: string;
      users: Array<{ email: string; password: string; id: string }>;
    })
  : null;
if (live && live.api !== 'http://127.0.0.1:55331') throw new Error('Refusing a non-disposable Auth test target');
let sdk: SupabaseClient;
const nativeFetch = globalThis.fetch;
beforeEach(async () => {
  if (!live) return;
  server.use(http.all(live.api + '/*', () => passthrough()));
  await waitForLogout();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  resetAllStores();
  _resetNetworkMode();
  sdk = createClient(live.api, live.anon_key, {
    auth: {
      persistSession: true,
      storage: localStorage,
      storageKey: 'p04v-auth-session',
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
});
afterEach(async () => {
  globalThis.fetch = nativeFetch;
  await waitForLogout();
  if (live && sdk) {
    await sdk.auth.signOut();
    await sdk.auth.dispose();
  }
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-u901');
  await Dexie.delete('trek-offline-u902');
  setAuthed(false);
});
describe.skipIf(!live)('P04v real local Supabase SDK and carried Family logout route', () => {
  it.each([false, true])(
    'real SDK session ends and original work survives (Auth response failure=%s)',
    async (fail) => {
      if (!live) throw new Error('Fixture absent');
      const first = await sdk.auth.signInWithPassword(live.users[0]);
      expect(first.error?.message).toBeUndefined();
      expect(first.data.user?.id).toBe(live.users[0].id);
      await reopenForUser(901);
      useAuthStore.setState({ user: buildUser({ id: 901 }), isAuthenticated: true, isLoading: false });
      setAuthed(true);
      await offlineDb.trips.put(buildTrip({ id: 1 }));
      const row = {
        id: crypto.randomUUID(),
        tripId: 1,
        method: 'POST' as const,
        url: '/trips/1/family/calendar',
        body: { scope: { user_id: live.users[0].id }, notes: 'Real Auth original' },
        createdAt: 1,
        status: 'pending' as const,
        attempts: 0,
        lastError: null,
      };
      await offlineDb.mutationQueue.put(row);
      if (fail)
        server.use(
          http.post(live.api + '/auth/v1/logout', () =>
            HttpResponse.json({ message: 'Synthetic server refusal' }, { status: 500 })
          )
        );
      const repo = new FamilyFrontendRepository();
      globalThis.fetch = createFamilyFetch(createFamilyApplicationHandler(repo), nativeFetch, location.origin);
      setForcedOffline(true);
      await useAuthStore.getState().logout();
      expect(Boolean((await sdk.auth.getSession()).data.session)).toBe(false);
      expect(Boolean(localStorage.getItem('p04v-auth-session'))).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
      expect(isAuthed()).toBe(false);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      await useAuthStore.getState().loadUser();
      expect(useAuthStore.getState().user).toBeNull();
      const second = await sdk.auth.signInWithPassword(live.users[1]);
      expect(second.error?.message).toBeUndefined();
      await reopenForUser(902);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(await offlineDb.trips.count()).toBe(0);
      await reopenForUser(901);
      expect(await offlineDb.mutationQueue.get(row.id)).toMatchObject({
        ...row,
        status: 'conflict',
        recoveryHold: { reason: 'signed-out', released: false },
      });
      expect(await offlineDb.trips.count()).toBe(0);
    }
  );
});

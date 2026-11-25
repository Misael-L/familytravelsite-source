import type { CollectionRpcName } from '@family/backend/supabase/collectionRpc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { familyRepositoryFixture } from '../../../tests/helpers/familyRepository';
import api from '../../api/client';
import { placeContribApi } from '../../api/placeContrib';
import { routeUsageApi } from '../../api/routeUsage';
import { serviceIdentityApi } from '../../api/serviceIdentity';
import { postValhallaRelay } from '../../api/valhallaRelay';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyIdentityRegistry } from './identity';
import { familyAuthStore, type FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter, createFamilyFetch } from './transport';
const backend = vi.hoisted(() => ({
  lists: vi.fn(),
  copy: vi.fn(),
  settings: vi.fn(),
  saveSettings: vi.fn(),
  addItem: vi.fn(),
}));
vi.mock('./legacy/data/supabase/familyLists', () => ({
  loadFamilyCollections: backend.lists,
  addFamilyListItem: backend.addItem,
}));
vi.mock('./legacy/data/supabase/copyFamilyListPlacesToTrip', () => ({ copyFamilyListPlacesToTrip: backend.copy }));
vi.mock('./legacy/data/supabase/vacay', () => ({
  fetchCalendarSettings: backend.settings,
  upsertCalendarSettings: backend.saveSettings,
}));
const uuid = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const family = uuid(1),
  list = uuid(2),
  item = uuid(3),
  trip = uuid(4);
const repositories: FamilyFrontendRepository[] = [];
const collectionSdk = vi.hoisted(() => ({ auth: { getSession: vi.fn() }, rpc: vi.fn() }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => collectionSdk }));
vi.mock('@family/backend/supabase/env', async (original) => ({
  ...(await original<typeof import('@family/backend/supabase/env')>()),
  getSupabaseUrl: () => 'https://fixture.invalid',
}));

const originalAdapter = api.defaults.adapter,
  originalAuth = familyAuthStore.getState();
async function fixture() {
  let ids = new FamilyIdentityRegistry(uuid(90));
  const repo = familyRepositoryFixture(family, () => ids, { core: async () => ({ places: [{ id: uuid(5) }] }) });
  const actor = await repo.session();
  ids = new FamilyIdentityRegistry(actor.userId);
  repositories.push(repo);
  const handler = createFamilyApplicationHandler(repo),
    forward = vi.fn(async () => {
      throw new Error('Unexpected provider request');
    });
  api.defaults.adapter = createFamilyAxiosAdapter(handler);
  vi.stubGlobal('fetch', createFamilyFetch(handler, forward, window.location.origin));
  return { repo, ids, forward, actor };
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  collectionSdk.rpc.mockReset();
  collectionSdk.auth.getSession.mockReset();
  familyAuthStore.setState({ membershipRole: 'member', isSuperAdmin: false });
  backend.lists.mockImplementation(() => {
    throw new Error('Retired Collection loader must not be used');
  });
  backend.settings.mockResolvedValue({ visibleYears: [2026, 2027] });
});
afterEach(() => {
  for (const repo of repositories.splice(0)) repo.clear();
  api.defaults.adapter = originalAdapter;
  familyAuthStore.setState(originalAuth, true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('5.1.4 service contracts through the actual Family adapter', () => {
  it('keeps provider enrichment, transformed photos and unsupported Trip add-ons disabled', async () => {
    const f = await fixture();
    const config = (await api.get('/auth/app-config')).data;
    expect(config).toMatchObject({
      places_photos_enabled: false,
      places_autocomplete_enabled: true,
      places_details_enabled: true,
      places_enrich_enabled: true,
      place_shadow_enabled: false,
      has_maps_key: false,
    });
    const { addons } = (await api.get('/addons')).data;
    for (const name of ['roadtrip', 'tours', 'collab'])
      expect(addons.some((row: { id: string }) => row.id === name)).toBe(false);
    expect(f.forward).not.toHaveBeenCalled();
  });
  it.each([
    ['service identity', () => serviceIdentityApi.status()],
    ['community contributions', () => placeContribApi.state()],
    ['routing usage', () => routeUsageApi.summary()],
    [
      'routing usage write',
      () =>
        routeUsageApi.report([
          { profile: 'driving', surface: 'route', selfHosted: false, requests: 1, waypoints: 2, km: 1, failed: 0 },
        ]),
    ],
  ])('%s is unavailable without falling through to a hosted provider', async (_name, run) => {
    const f = await fixture();
    await expect(run()).rejects.toMatchObject({ response: { status: 501 } });
    expect(f.forward).not.toHaveBeenCalled();
  });
  it('the native fetch-based Valhalla relay receives an explicit unavailable response locally', async () => {
    const f = await fixture(),
      response = await postValhallaRelay('route', {});
    expect(response.status).toBe(501);
    expect(f.forward).not.toHaveBeenCalled();
  });
  it('list projections preserve source identities while disconnected transfers refuse before writing', async () => {
    const f = await fixture(),
      nativeList = f.ids.register('collection', list),
      nativeItem = f.ids.register('collectionItem', item),
      nativeTrip = f.ids.register('trip', trip);
    const scope = {
      version: 1 as const,
      family_id: f.actor.familyId,
      user_id: f.actor.userId,
      person_id: f.actor.personId,
      session_id: uuid(93),
    };
    const cover = { id: null, availability: 'absent', thumb_url: null, hero_url: null };
    const root = {
      id: list,
      family_id: family,
      owner_person_id: scope.person_id,
      visibility: 'private',
      revision: 1,
      lifecycle_revision: 0,
      archived_at: null,
      deleted_at: null,
      name: 'Saved places',
      description: null,
      color: null,
      sort_order: 0,
      cover,
    };
    const at = '2026-11-15T00:00:00.123456Z';
    const page = {
      version: 1,
      scope: { ...scope, collection_id: list, lifecycle_revision: 0 },
      collection: root,
      content_revision: 1,
      next_cursor: null,
      items: [
        {
          id: item,
          collection_id: list,
          kind: 'food',
          source: { kind: 'food', id: uuid(5) },
          revision: 1,
          status: 'idea',
          sort_order: 0,
          deleted_at: null,
          content_mode: 'reference',
          content: {
            name: 'Original restaurant',
            description: 'Catalog description',
            latitude: 19,
            longitude: -99,
            address: null,
            website: null,
            phone: null,
          },
          notes: 'Trip-independent note',
          category: null,
          geography: null,
          source_observation: { kind: 'food', id: uuid(5), updated_at: null, digest: 'a'.repeat(64), archived: false },
          cover,
          native_location_compatible: true,
          added_at: at,
        },
      ],
    };
    const rpc = vi.fn<(name: CollectionRpcName, args: Record<string, unknown>) => unknown>((name) => {
      if (name === 'get_family_collection_library_v1')
        return {
          version: 1,
          scope,
          state: 'active',
          library_digest: 'a'.repeat(64),
          total_count: 1,
          offset: 0,
          next_cursor: null,
          collections: [
            {
              collection: root,
              content_revision: 1,
              active_item_count: 1,
              can_edit_items: true,
              can_admin: true,
              is_owner: true,
              created_at: at,
              updated_at: at,
            },
          ],
        };
      if (name === 'get_family_collection_page_v1') return structuredClone(page);
      throw new Error('Unexpected Collection RPC ' + name);
    });
    const token =
      'fixture.' +
      btoa(
        JSON.stringify({
          sub: scope.user_id,
          session_id: scope.session_id,
          role: 'authenticated',
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      ) +
      '.fixture';
    collectionSdk.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: scope.user_id }, access_token: token } },
      error: null,
    });
    const header = vi.fn();
    collectionSdk.rpc.mockImplementation((name: CollectionRpcName, args: Record<string, unknown>) => ({
      setHeader: (key: string, value: string) => {
        header(key, value);
        return Promise.resolve({ data: rpc(name, args), error: null });
      },
    }));
    const result = (await api.get(`/addons/collections/${nativeList}`)).data;
    expect(result.collection).toMatchObject({ id: nativeList, name: 'Saved places' });
    expect(result.places).toEqual([
      expect.objectContaining({ id: nativeItem, collection_id: nativeList, name: 'Original restaurant' }),
    ]);
    const write = vi.spyOn(f.repo, 'write');
    await expect(
      api.post('/addons/collections/copy-to-trip', { trip_id: nativeTrip, place_ids: [nativeItem] })
    ).rejects.toMatchObject({ response: { status: 422, data: { code: 'collection_transfer_unavailable' } } });
    expect(write).not.toHaveBeenCalled();
    expect(backend.copy).not.toHaveBeenCalled();
    expect(backend.lists).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'get_family_collection_library_v1',
      'get_family_collection_page_v1',
    ]);
    expect(rpc).toHaveBeenCalledWith(
      'get_family_collection_page_v1',
      expect.objectContaining({ p_collection_id: list })
    );
    expect(collectionSdk.auth.getSession).toHaveBeenCalled();
    expect(header).toHaveBeenCalledTimes(2);
    expect(header).toHaveBeenCalledWith('Authorization', 'Bearer ' + token);
    expect(result.places[0]).toMatchObject({ family_identity: { collection_id: list, item_id: item } });
  });
  it('even an apparently permitted copy cannot use the legacy geography writer', async () => {
    const f = await fixture(),
      nativeItem = f.ids.register('collectionItem', item),
      nativeTrip = f.ids.register('trip', trip);
    const write = vi.spyOn(f.repo, 'write').mockImplementation(async (_trip, _key, direct) => direct());
    await expect(
      api.post('/addons/collections/copy-to-trip', { trip_id: nativeTrip, place_ids: [nativeItem] })
    ).rejects.toMatchObject({ response: { status: 422, data: { code: 'collection_transfer_unavailable' } } });
    expect(write).not.toHaveBeenCalled();
    expect(backend.copy).not.toHaveBeenCalled();
  });
  it('a normalized Trip location cannot be passed as a shared catalog city to the old list writer', async () => {
    const f = await fixture(),
      nativeList = f.ids.register('collection', list),
      nativeTrip = f.ids.register('trip', trip),
      nativePlace = f.ids.register('place', uuid(5));
    await expect(
      api.post('/addons/collections/places/from-trip', {
        collection_id: nativeList,
        source_trip_id: nativeTrip,
        source_place_id: nativePlace,
      })
    ).rejects.toMatchObject({ response: { status: 422, data: { code: 'collection_transfer_unavailable' } } });
    expect(backend.addItem).not.toHaveBeenCalled();
  });
  it('calendar year reads retain existing years and membership denial prevents writes', async () => {
    await fixture();
    expect((await api.get('/addons/vacay/years')).data).toEqual({ years: [2026, 2027] });
    await expect(api.post('/addons/vacay/years/2028')).rejects.toMatchObject({ response: { status: 403 } });
    expect(backend.saveSettings).not.toHaveBeenCalled();
  });
});

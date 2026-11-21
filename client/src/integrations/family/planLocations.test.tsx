import { render, screen } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { familyRepositoryFixture } from '../../../tests/helpers/familyRepository';
import api, { mapsApi } from '../../api/client';
import PlaceInspector from '../../components/Planner/PlaceInspector';
import { useAddonStore } from '../../store/addonStore';
import { usePluginStore } from '../../store/pluginStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTripStore } from '../../store/tripStore';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyIdentityRegistry } from './identity';
import type { PlanLocation } from './planLocationContract';
import type { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>();
  return {
    ...original,
    mapsApi: {
      ...original.mapsApi,
      details: vi.fn(async () => ({ place: null })),
      placePhotoCredit: vi.fn(async () => ({ credit: null })),
      placeEnrichment: vi.fn(async () => ({ photos: [], facts: [], description: null })),
    },
  };
});
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, locale: 'en', language: 'en' }) }));
vi.mock('../../services/photoService', () => ({
  getCached: () => null,
  isLoading: () => false,
  fetchPhoto: vi.fn(),
  onThumbReady: () => () => {},
}));

const uuid = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1),
  family = uuid(2),
  identity = uuid(3),
  source = uuid(4),
  city = uuid(5),
  media = uuid(6);
const prefix = `/trips/${trip}/family/plan-locations`;
const hero = 'https://fixture.invalid/storage/v1/object/public/catalog/variants/v1/asset/hero-ready.webp';
const thumb = 'https://fixture.invalid/storage/v1/object/public/catalog/variants/v1/asset/thumb-ready.webp';
const canonical = 'https://fixture.invalid/storage/v1/object/public/catalog/original.jpg';
let row: PlanLocation | null,
  revision: number,
  deny: { code: string; message: string } | null,
  variantHero: string | null,
  recipe: string;
let client: ReturnType<typeof axios.create>, ids: FamilyIdentityRegistry;
const invalidated = vi.fn(),
  originalAdapter = api.defaults.adapter;
const receipts = new Map<
  string,
  { payload: string; result: { id: string; revision: number; deleted_at: string | null } }
>();
function fixture(): PlanLocation {
  return {
    id: identity,
    trip_id: trip,
    revision: 1,
    deleted_at: null,
    source: { kind: 'food', id: source },
    source_archived: false,
    name: 'Actual cafe',
    description: 'Catalog description appears once',
    notes: null,
    latitude: 19.05,
    longitude: -98.2,
    is_located: true,
    address: 'Cafe street 7',
    website: 'https://cafe.example',
    phone: null,
    context_place_id: city,
    context_place_name: 'Context city',
    country_id: uuid(7),
    country_name: 'Mexico',
    country_code: 'MX',
    time_zone: 'America/Mexico_City',
    source_type_label: null,
    cover_media_id: media,
    category: null,
    overrides: {},
    created_at: '2026-11-04T00:00:00Z',
    updated_at: '2026-11-04T00:00:00Z',
  };
}
beforeEach(() => {
  row = null;
  revision = 1;
  deny = null;
  variantHero = hero;
  recipe = 'v1';
  receipts.clear();
  invalidated.mockClear();
  ids = new FamilyIdentityRegistry(family);
  useTripStore.setState({ trip: null, assignments: {}, places: [], reservations: [], days: [], files: [] });
  useAddonStore.setState({ addons: [] });
  usePluginStore.setState({ plugins: [] });
  useSettingsStore.setState({ settings: useSettingsStore.getInitialState().settings });
  boundary.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (deny) return { data: null, error: deny };
    if (name === 'catalog_media_variants_for_assets')
      return {
        data: [
          {
            media_asset_id: media,
            public_url: canonical,
            thumb_url: thumb,
            hero_url: variantHero,
            recipe_version: recipe,
          },
        ],
        error: null,
      };
    if (name === 'get_family_trip_location_v1') return { data: { version: 1, location: row }, error: null };
    if (name === 'list_family_trip_locations_v1')
      return {
        data: {
          version: 1,
          locations: row && (args.p_state === 'trash') === Boolean(row.deleted_at) ? [row] : [],
          has_more: false,
          next_cursor: null,
        },
        error: null,
      };
    if (name === 'list_family_trip_visits_v1')
      return {
        data: {
          version: 1,
          visits: [
            {
              id: uuid(90),
              trip_id: trip,
              activity: 'Dinner',
              starts_at: '2027-04-01T00:00:00Z',
              ends_at: null,
              time_zone: 'America/Mexico_City',
              sort_order: 7,
              explanations: null,
              updated_at: '2026-11-04T00:00:00Z',
              plan_location_id: row?.id ?? null,
              location: row,
            },
          ],
          has_more: false,
          next_cursor: uuid(90),
        },
        error: null,
      };
    if (name !== 'mutate_family_trip_location_v1') throw new Error('Unexpected RPC ' + name);
    const key = String(args.p_operation_id),
      payload = JSON.stringify(args),
      existing = receipts.get(key);
    if (existing)
      return existing.payload === payload
        ? { data: existing.result, error: null }
        : { data: null, error: { code: '40001', message: 'Operation payload changed' } };
    if (args.p_action === 'create') row = fixture();
    else if (!row || args.p_expected_revision !== row.revision)
      return { data: null, error: { code: '40001', message: 'Reload current revision' } };
    else {
      revision++;
      row.revision = revision;
      if (args.p_action === 'update') Object.assign(row, args.p_payload);
      if (args.p_action === 'trash') row.deleted_at = '2026-11-04T12:00:00Z';
      if (args.p_action === 'restore') row.deleted_at = null;
    }
    if (!row) throw new Error('Test boundary expected a saved row');
    const result = { id: identity, revision: row.revision, deleted_at: row.deleted_at };
    receipts.set(key, { payload, result });
    return { data: result, error: null };
  });
  const repo = familyRepositoryFixture(family, () => ids, {
    tripUuid: async (value: string) => ids.uuid('trip', value),
    invalidate: invalidated,
  }) as unknown as FamilyFrontendRepository;
  const adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(repo));
  client = axios.create({ adapter });
  api.defaults.adapter = adapter;
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.clearAllMocks();
});
async function save() {
  return (await client.post(prefix, { operation_id: uuid(10), source: { kind: 'food', id: source } })).data as {
    location: PlanLocation & { native_place: import('../../types').Place; hero_url: string | null };
    operation: { id: string; revision: number };
  };
}

describe('Saved locations through full Family dispatcher and unchanged native inspector', () => {
  it('saves, reloads and renders actual venue data with description once and separate notes', async () => {
    const saved = await save();
    const detail = (await client.get(prefix + '/' + saved.location.id)).data as typeof saved;
    expect(detail.location.source.id).toBe(source);
    expect(detail.location.id).not.toBe(source);
    expect(detail.location.context_place_id).toBe(city);
    expect(detail.location.native_place.id).toBe(ids.register('place', identity));
    expect(detail.location.native_place.id).not.toBe(ids.register('place', city));
    expect(detail.location.native_place.lat).toBe(19.05);
    expect(detail.location.native_place.image_url).toBe(hero);
    expect(detail.location.native_place.notes).toBeNull();
    render(
      <MemoryRouter>
        <PlaceInspector
          place={detail.location.native_place}
          categories={[]}
          days={[]}
          assignments={{}}
          reservations={[]}
          files={[]}
          onClose={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Actual cafe')).toBeVisible();
    expect(screen.getByText('Cafe street 7')).toBeVisible();
    expect(screen.getAllByText('Catalog description appears once')).toHaveLength(1);
    const images = [...document.querySelectorAll('img')].map((img) => img.src);
    expect(images).toContain(hero);
    expect(images.some((url) => url.includes('/render/image/') || url === canonical)).toBe(false);
    expect(boundary.rpc).toHaveBeenCalledWith('catalog_media_variants_for_assets', {
      p_media_ids: [media],
      p_recipe: 'v1',
    });
    expect(invalidated).toHaveBeenCalledWith(trip);
    expect(mapsApi.details).toHaveBeenCalledWith(`catalog:food:${source}`, 'en');
  });
  it('binds native requests to one operation and returns current data after an older replay', async () => {
    const first = await save();
    await client.put(prefix + '/' + identity, {
      operation_id: uuid(11),
      expected_revision: 1,
      notes: 'Later personal note',
    });
    const replay = await save();
    expect(replay.operation).toEqual(first.operation);
    expect(replay.location.revision).toBe(2);
    expect(replay.location.notes).toBe('Later personal note');
    expect(receipts.size).toBe(2);
    await expect(
      client.post(prefix, { operation_id: uuid(10), source: { kind: 'food', id: source }, notes: 'Different' })
    ).rejects.toMatchObject({ response: { status: 409 } });
  });
  it('exercises Trash and Restore using persisted identity/revision', async () => {
    const saved = await save();
    const hidden = await client.post(prefix + '/' + identity + '/trash', {
      operation_id: uuid(12),
      expected_revision: saved.operation.revision,
    });
    expect((await client.get(prefix)).data.locations).toEqual([]);
    expect((await client.get(prefix, { params: { state: 'trash' } })).data.locations[0].id).toBe(identity);
    await client.post(prefix + '/' + identity + '/restore', {
      operation_id: uuid(13),
      expected_revision: hidden.data.operation.revision,
    });
    expect((await client.get(prefix)).data.locations[0].id).toBe(identity);
  });
  it.each([null, 'https://fixture.invalid/storage/v1/render/image/public/catalog/x.jpg?width=1200', canonical])(
    'uses a placeholder without a ready ordinary hero: %s',
    async (url) => {
      variantHero = url;
      const saved = await save();
      expect(saved.location.hero_url).toBeNull();
      expect(saved.location.native_place.image_url).toBeNull();
    }
  );
  it('rejects a different recipe instead of falling back to original bytes', async () => {
    recipe = 'v2';
    const saved = await save();
    expect(saved.location.native_place.image_url).toBeNull();
  });
  it('validates client payload/cursor before RPC', async () => {
    await expect(
      client.post(prefix, { operation_id: uuid(10), source: { kind: 'manual' }, label: 'Point', unknown: true })
    ).rejects.toMatchObject({ response: { status: 400 } });
    await expect(client.get(prefix, { params: { after_id: 'not-a-uuid' } })).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ['42501', 403],
    ['40001', 409],
    ['23503', 422],
    ['PGRST202', 503],
  ])('preserves %s failures and does not fake a save', async (code, status) => {
    deny = { code: String(code), message: 'Actual backend failure' };
    await expect(save()).rejects.toMatchObject({ response: { status } });
    expect(invalidated).not.toHaveBeenCalled();
    expect(receipts.size).toBe(0);
  });
  it('rejects a read completed after the Family session changes', async () => {
    await save();
    const original = boundary.rpc.getMockImplementation();
    boundary.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (!original) throw new Error('Missing boundary fixture');
      const result = await original(name, args);
      if (name === 'get_family_trip_location_v1') ids = new FamilyIdentityRegistry(uuid(80));
      return result;
    });
    await expect(client.get(prefix + '/' + identity)).rejects.toMatchObject({ response: { status: 409 } });
  });
  it('treats malformed service data as a gateway error', async () => {
    boundary.rpc.mockResolvedValue({
      data: { version: 1, locations: [{ id: 'broken' }], has_more: false, next_cursor: null },
      error: null,
    });
    await expect(client.get(prefix)).rejects.toMatchObject({ response: { status: 502 } });
  });
});

describe('Visit relationship read through full dispatcher', () => {
  const url = `/trips/${trip}/family/visits`;
  it('loads the actual venue into the unchanged native inspector and preserves genuine midnight data', async () => {
    await save();
    const page = (await client.get(url)).data;
    const visit = page.visits[0];
    expect(visit.id).toBe(uuid(90));
    expect(visit.starts_at).toBe('2027-04-01T00:00:00Z');
    expect(visit.plan_location_id).toBe(identity);
    expect(visit.location.source.id).toBe(source);
    expect(visit.location.native_place.id).not.toBe(ids.register('place', city));
    render(
      <MemoryRouter>
        <PlaceInspector
          place={visit.location.native_place}
          categories={[]}
          days={[]}
          assignments={{}}
          reservations={[]}
          files={[]}
          onClose={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Actual cafe')).toBeVisible();
    expect(screen.getByText('Cafe street 7')).toBeVisible();
    expect(screen.getAllByText('Catalog description appears once')).toHaveLength(1);
    expect([...document.querySelectorAll('img')].map((img) => img.src)).toContain(hero);
    expect(mapsApi.details).not.toHaveBeenCalled();
  });
  it('does not replace a missing hero with the thumbnail, original or provider image', async () => {
    await save();
    variantHero = null;
    const visit = (await client.get(url)).data.visits[0];
    expect(visit.location.native_place.image_url).toBeNull();
    expect(visit.location.thumb_url).toBe(thumb);
    expect(JSON.stringify(visit)).not.toContain('/render/image/');
    expect(JSON.stringify(visit)).not.toContain(canonical);
  });
  it('preserves an unlinked standalone activity rather than inventing a city relation', async () => {
    const visit = (await client.get(url)).data.visits[0];
    expect(visit.plan_location_id).toBeNull();
    expect(visit.location).toBeNull();
  });
  it('passes bounded keyset arguments and rejects bad query keys before any RPC', async () => {
    await client.get(url + '?limit=2&after_id=' + uuid(89));
    expect(boundary.rpc).toHaveBeenCalledWith('list_family_trip_visits_v1', {
      p_trip_id: trip,
      p_limit: 2,
      p_after_id: uuid(89),
    });
    boundary.rpc.mockClear();
    await expect(client.get(url + '?limit=0')).rejects.toMatchObject({ response: { status: 400 } });
    await expect(client.get(url + '?include_private=true')).rejects.toMatchObject({ response: { status: 400 } });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it('reports authorization and missing migrations instead of empty-success data', async () => {
    deny = { code: '42501', message: 'Current access lost' };
    await expect(client.get(url)).rejects.toMatchObject({ response: { status: 403 } });
    deny = { code: 'PGRST202', message: 'Not installed' };
    await expect(client.get(url)).rejects.toMatchObject({ response: { status: 503 } });
  });
  it('rejects legacy assignment payloads at the explicit command seam without a mutation RPC', async () => {
    boundary.rpc.mockClear();
    await expect(client.post(url, { place_id: identity })).rejects.toMatchObject({ response: { status: 400 } });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it('rejects a source relationship returned from a different Trip', async () => {
    await save();
    if (row) row.trip_id = uuid(99);
    await expect(client.get(url)).rejects.toMatchObject({ response: { status: 502 } });
  });
  it('fences a session switch during the database read', async () => {
    const original = boundary.rpc.getMockImplementation();
    if (!original) throw new Error('Missing Supabase test boundary');
    boundary.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      const result = await original(name, args);
      if (name === 'list_family_trip_visits_v1') ids = new FamilyIdentityRegistry(uuid(99));
      return result;
    });
    await expect(client.get(url)).rejects.toMatchObject({ response: { status: 409 } });
  });
});

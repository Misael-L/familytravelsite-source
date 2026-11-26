import * as catalog from '@family/backend/supabase/catalogDiscovery';
import * as familyClient from '@family/backend/supabase/client';
import { createClient } from '@supabase/supabase-js';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, { mapsApi } from '../../api/client';
import PoiCategoryPill from '../../components/Map/PoiCategoryPill';
import { usePoiExplore } from '../../components/Map/usePoiExplore';
import { creditOf } from '../../components/Planner/placePhotoCredit';
import { TranslationProvider } from '../../i18n';
import { useTripStore } from '../../store/tripStore';
import { handleFamilyCatalogMap } from './catalogMapHandler';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import * as runtime from './runtime';
import { createFamilyAxiosAdapter } from './transport';
vi.mock('@family/backend/supabase/catalogDiscovery', async (original) => ({
  ...(await original<typeof import('@family/backend/supabase/catalogDiscovery')>()),
  discoverCatalog: vi.fn(),
  catalogDetail: vi.fn(),
}));
const id = (n: number) => `f5000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session: FamilySession = {
  userId: id(1),
  personId: id(2),
  familyId: id(3),
  user: { username: 'Catalog member', email: 'member@example.invalid', avatar_url: null, created_at: '2026-01-01' },
};
const hit: catalog.CatalogHit = {
  id: id(9),
  kind: 'food',
  name: 'Puebla restaurant',
  latitude: 19.4,
  longitude: -99.1,
  address: 'Venue address',
  website: null,
  phone: null,
  description: 'Catalog description',
  contextPlaceId: id(8),
  countryId: id(7),
  typeLabel: 'Restaurant',
  thumbUrl: null,
  heroUrl: null,
};
const box = { south: 19, west: -100, north: 20, east: -99 };
let repo: FamilyFrontendRepository;
const originalAdapter = api.defaults.adapter;
const request = (
  pathname: string,
  method = 'GET',
  body?: unknown,
  query = new URLSearchParams(),
  signal?: AbortSignal
) => handleFamilyCatalogMap(repo, { pathname, method, body, query, signal });
beforeEach(() => {
  repo = new FamilyFrontendRepository(async () => session);
  useTripStore.setState({ trip: null });
  vi.mocked(catalog.discoverCatalog)
    .mockReset()
    .mockResolvedValue({ hits: [hit], truncated: false });
  vi.mocked(catalog.catalogDetail).mockReset().mockResolvedValue(hit);
  api.defaults.adapter = createFamilyAxiosAdapter((r) => handleFamilyCatalogMap(repo, r));
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
});
function CategoryControls({ phone }: { phone: boolean }) {
  const poi = usePoiExplore();
  return (
    <>
      <button type="button" onClick={() => poi.onViewportChange(box)}>
        Set map bounds
      </button>
      <button type="button" onClick={() => poi.onViewportChange({ ...box, west: -98, east: -97 })}>
        Move map
      </button>
      <PoiCategoryPill
        fullWidth={phone}
        phoneChrome={phone}
        categories={poi.categories}
        active={poi.active}
        onToggle={poi.toggle}
        loadingKeys={poi.loadingKeys}
        errorKeys={poi.errorKeys}
        moved={poi.moved}
        onSearchArea={poi.searchArea}
      />
      <output>{poi.pois.map((p) => p.name).join(', ')}</output>
    </>
  );
}

function catalogFixtureFetch(reads: URL[]) {
  return async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input);
    reads.push(url);
    if (url.pathname === '/rest/v1/establishment_types') {
      const cafes = url.searchParams.get('code')?.includes('COFFEE_SHOP');
      return Response.json([{ id: cafes ? id(12) : id(11) }]);
    }
    if (url.pathname === '/rest/v1/foods') {
      const cafe = url.searchParams.get('establishment_type_id') === `in.(${id(12)})`;
      const moved = url.searchParams.get('longitude') === 'gte.-98';
      const name = cafe ? 'Fixture café' : 'Fixture restaurant';
      return Response.json([
        { id: id(9), name: moved ? `Nearby ${name}` : name, latitude: 19.4, longitude: moved ? -97.5 : -99.1 },
        { id: id(10), name: 'Outside the viewport', latitude: 19.4, longitude: -110 },
      ]);
    }
    throw new Error(`Unexpected fixture request: ${url.pathname}`);
  };
}

describe('native catalog handler and consumers', () => {
  it.each([
    {
      layout: 'desktop',
      phone: false,
      label: 'Restaurants',
      code: 'RESTAURANT',
      typeId: id(11),
      result: 'Fixture restaurant',
    },
    { layout: 'phone', phone: true, label: 'Cafés', code: 'COFFEE_SHOP', typeId: id(12), result: 'Fixture café' },
  ])(
    'offers supported Family categories and searches the active viewport on $layout',
    async ({ phone, label, code, typeId, result }) => {
      vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
      const reads: URL[] = [];
      const sdk = createClient('https://map-catalog.fixture.invalid', 'fixture-public-key', {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: catalogFixtureFetch(reads) },
      });
      vi.spyOn(familyClient, 'getSupabaseBrowserClient').mockReturnValue(sdk);
      const actual = await vi.importActual<typeof catalog>('@family/backend/supabase/catalogDiscovery');
      vi.mocked(catalog.discoverCatalog).mockImplementation(actual.discoverCatalog);

      render(
        <TranslationProvider>
          <CategoryControls phone={phone} />
        </TranslationProvider>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Set map bounds' }));
      const chip = screen.getByRole('button', { name: label });
      fireEvent.click(chip);
      expect(await screen.findByText(result)).toBeDefined();
      expect(chip.getAttribute('aria-pressed')).toBe('true');
      expect(reads.map((url) => url.pathname)).toEqual(['/rest/v1/establishment_types', '/rest/v1/foods']);
      expect(reads[0].searchParams.get('code')).toContain(code);
      expect(reads[1].searchParams.get('establishment_type_id')).toBe(`in.(${typeId})`);
      expect(reads[1].searchParams.get('archived_at')).toBe('is.null');
      expect(reads[1].searchParams.getAll('latitude')).toEqual(['gte.19', 'lte.20']);
      expect(reads[1].searchParams.getAll('longitude')).toEqual(['gte.-100', 'lte.-99']);
      expect(screen.queryByText('Outside the viewport')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Move map' }));
      expect(reads).toHaveLength(2);
      fireEvent.click(screen.getByRole('button', { name: 'Search this area' }));
      expect(await screen.findByText(`Nearby ${result}`)).toBeDefined();
      expect(reads).toHaveLength(4);
      expect(reads[3].searchParams.getAll('longitude')).toEqual(['gte.-98', 'lte.-97']);
      const unsupported = ['Museums & culture', 'Groceries'].filter((name) => screen.queryByRole('button', { name }));
      expect(unsupported).toEqual([]);
    }
  );

  it('native category toggle consumes the real handler envelope and retains typed identity', async () => {
    const view = renderHook(() => usePoiExplore(), { wrapper: TranslationProvider });
    act(() => view.result.current.onViewportChange(box));
    act(() => view.result.current.toggle('restaurant'));
    await waitFor(() => expect(view.result.current.pois).toHaveLength(1));
    expect(view.result.current.pois[0]).toMatchObject({
      osm_id: 'catalog:food:' + id(9),
      source: 'family-catalog',
      lat: 19.4,
      lng: -99.1,
    });
    expect(catalog.discoverCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'restaurant', bounds: box, signal: expect.any(AbortSignal) })
    );
    act(() => view.result.current.onViewportChange({ ...box, east: -98 }));
    expect(view.result.current.moved).toBe(true);
    act(() => view.result.current.searchArea());
    await waitFor(() => expect(catalog.discoverCatalog).toHaveBeenCalledTimes(2));
  });
  it('native consumer distinguishes no matches from a retryable failure', async () => {
    vi.mocked(catalog.discoverCatalog).mockResolvedValueOnce({ hits: [], truncated: false });
    const view = renderHook(() => usePoiExplore(), { wrapper: TranslationProvider });
    act(() => view.result.current.onViewportChange(box));
    act(() => view.result.current.toggle('restaurant'));
    await waitFor(() => expect(view.result.current.loadingKeys.size).toBe(0));
    expect(view.result.current.errorKeys.size).toBe(0);
    vi.mocked(catalog.discoverCatalog).mockRejectedValueOnce(new Error('Catalog down'));
    act(() => view.result.current.searchArea());
    await waitFor(() => expect(view.result.current.errorKeys.has('restaurant')).toBe(true));
  });
  it('search/autocomplete/details use the same catalog key and real coordinates', async () => {
    expect((await mapsApi.search('Puebla')).places[0]).toMatchObject({
      osm_id: 'catalog:food:' + id(9),
      lat: 19.4,
      lng: -99.1,
    });
    const ac = await mapsApi.autocomplete('Puebla');
    expect(ac.suggestions[0].placeId).toBe('catalog:food:' + id(9));
    expect((await mapsApi.details(ac.suggestions[0].placeId)).place).toMatchObject({
      family_catalog_id: id(9),
      family_context_place_id: id(8),
    });
  });
  it('never asks a third-party provider or treats unknown source IDs as catalog rows', async () => {
    await expect(request('/maps/search', 'POST', { query: 'Puebla', provider: 'google' })).rejects.toMatchObject({
      status: 501,
    });
    await expect(request('/maps/details/node%2F12')).rejects.toMatchObject({ status: 404 });
    expect(catalog.catalogDetail).not.toHaveBeenCalled();
  });
  it('rejects malformed methods and absent bounds before a catalog read', async () => {
    await expect(request('/maps/pois')).rejects.toMatchObject({ status: 400 });
    await expect(request('/maps/pois', 'POST')).rejects.toMatchObject({ status: 405 });
    expect(catalog.discoverCatalog).not.toHaveBeenCalled();
  });
  it('cancels a delayed answer after a Trip switch or request cancellation', async () => {
    let done!: (r: Awaited<ReturnType<typeof catalog.discoverCatalog>>) => void;
    vi.mocked(catalog.discoverCatalog).mockReturnValueOnce(
      new Promise((resolve) => {
        done = resolve;
      })
    );
    const pending = request('/maps/search', 'POST', { query: 'Puebla' });
    await waitFor(() => expect(done).toBeDefined());
    useTripStore.setState({ trip: { id: 12 } as never });
    done({ hits: [hit], truncated: false });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(request('/maps/search', 'POST', { query: 'Puebla' }, undefined, ctrl.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
  it('rejects a late response after repository/source retirement', async () => {
    let done!: (r: Awaited<ReturnType<typeof catalog.discoverCatalog>>) => void;
    vi.mocked(catalog.discoverCatalog).mockReturnValueOnce(
      new Promise((resolve) => {
        done = resolve;
      })
    );
    const pending = request('/maps/search', 'POST', { query: 'Puebla' });
    await waitFor(() => expect(done).toBeDefined());
    repo.clear();
    done({ hits: [hit], truncated: false });
    await expect(pending).rejects.toMatchObject({ status: 409 });
  });
  it('drops an older category response even when the catalog source ignores cancellation', async () => {
    let done!: (v: Awaited<ReturnType<typeof catalog.discoverCatalog>>) => void;
    vi.mocked(catalog.discoverCatalog)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          done = resolve;
        })
      )
      .mockResolvedValueOnce({ hits: [{ ...hit, name: 'New cafe' }], truncated: false });
    const view = renderHook(() => usePoiExplore(), { wrapper: TranslationProvider });
    act(() => view.result.current.onViewportChange(box));
    act(() => view.result.current.toggle('restaurant'));
    await waitFor(() => expect(done).toBeDefined());
    act(() => view.result.current.toggle('cafe'));
    await waitFor(() => expect(view.result.current.pois[0]?.name).toBe('New cafe'));
    done({ hits: [hit], truncated: false });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(view.result.current.pois[0]?.name).toBe('New cafe');
  });
  it('requires a current Family session before issuing reads', async () => {
    repo = new FamilyFrontendRepository(async () => {
      throw new Error('No Family session');
    });
    await expect(request('/maps/search', 'POST', { query: 'Puebla' })).rejects.toThrow('No Family session');
    expect(catalog.discoverCatalog).not.toHaveBeenCalled();
  });
  it('provides stored-hero enrichment or a placeholder without inventing provider authorship', async () => {
    const url = 'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/x/hero-a.webp';
    vi.mocked(catalog.catalogDetail).mockResolvedValue({ ...hit, heroUrl: url });
    const r = await mapsApi.placeEnrichment({
      placeId: 'catalog:food:' + id(9),
      lat: 19.4,
      lng: -99.1,
      name: 'Puebla restaurant',
    });
    expect(r.photos[0]).toMatchObject({
      url,
      source: 'cached',
      attribution: 'Family Catalog · credit not recorded',
      license: null,
    });
    expect(r.description).toBeNull();
    expect(await mapsApi.placeEnrichment({ placeId: 'node/12', lat: 19.4, lng: -99.1, name: 'Unknown' })).toMatchObject(
      { disabled: true, photos: [] }
    );
  });
});

it('native photo credit never mislabels a Family object as Wikimedia or Google', async () => {
  vi.mocked(catalog.catalogDetail).mockResolvedValue({
    ...hit,
    heroUrl: 'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/fixture/hero.webp',
  });
  const r = (await request('/maps/enrichment', 'POST', {
    placeId: catalog.catalogKey(hit),
    lat: hit.latitude,
    lng: hit.longitude,
    name: hit.name,
  })) as { photos: import('@trek/shared').PlacePhotoCandidate[] };
  expect(creditOf(r.photos[0])).toBe('Family Catalog · credit not recorded');
  expect(r.photos[0].license).toBeNull();
});

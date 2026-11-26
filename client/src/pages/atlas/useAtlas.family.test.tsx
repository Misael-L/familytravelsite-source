import { http, HttpResponse } from 'msw';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lf, type MockGeoJson } from '../../../tests/helpers/atlasMap';
import { buildSettings } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { act, render, waitFor } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { useSettingsStore } from '../../store/settingsStore';
import { useAtlas } from './useAtlas';

// FE-HOOK-ATLAS-001 to FE-HOOK-ATLAS-035

import { buildUser } from '../../../tests/helpers/factories';
import { cleanup, fireEvent, screen } from '../../../tests/helpers/render';
import api from '../../api/client';
import { createFamilyApplicationHandler } from '../../integrations/family/applicationHandler';
import * as supabaseClient from '../../integrations/family/legacy/data/supabase/client';
import {
  FamilyApiError,
  familyAuthStore,
  FamilyFrontendRepository,
  familyReaders,
} from '../../integrations/family/repository';
import { createFamilyAxiosAdapter } from '../../integrations/family/transport';
import MAtlasBucketSheet from '../../mobile/screens/atlas/MAtlasBucketSheet';
import MAtlasStatsCard from '../../mobile/screens/atlas/MAtlasStatsCard';
import AtlasPage from '../../pages/AtlasPage';
import { useAuthStore as nativeAuth } from '../../store/authStore';

vi.mock('../../components/Layout/Navbar', () => ({ default: () => <nav /> }));
vi.mock('../../integrations/family/runtime', () => ({
  isFamilyFrontendActive: () => true,
  activateFamilyFrontend() {},
}));

const id = (n: number) => `f5b00000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session = {
  userId: id(1),
  personId: id(2),
  familyId: id(3),
  user: { username: 'Fixture member', email: 'member@example.invalid', avatar_url: null, created_at: '2026-01-01' },
};
const geo = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { ISO_A2: 'MX', ADM0_A3: 'MEX', NAME: 'Mexico' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-100, 18],
            [-98, 18],
            [-98, 20],
            [-100, 20],
            [-100, 18],
          ],
        ],
      },
    },
  ],
};
const originalAdapter = api.defaults.adapter;
const initialFamilyAuth = familyAuthStore.getState();
let atlas: ReturnType<typeof useAtlas>;
let statsRow: unknown;
let marksRows: unknown;
let countryRows: unknown;
let calls: { table: string; filters: unknown[] }[];
let handler: ReturnType<typeof createFamilyApplicationHandler>;

function fakeReadClient() {
  return {
    from(table: string) {
      const entry = { table, filters: [] as unknown[] };
      calls.push(entry);
      const result = () =>
        table === 'family_travel_stats'
          ? statsRow
          : table === 'family_country_visited'
            ? { data: marksRows, error: null }
            : table === 'countries'
              ? { data: countryRows, error: null }
              : (() => {
                  throw new Error('Unexpected table ' + table);
                })();
      const q = {
        select: (_columns: string) => q,
        eq: (key: string, value: unknown) => {
          entry.filters.push([key, value]);
          return q;
        },
        in: (key: string, value: unknown) => {
          entry.filters.push([key, value]);
          return q;
        },
        maybeSingle: () => Promise.resolve(result()),
        then: (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return q;
    },
  };
}
function Probe({ phone = false }: { phone?: boolean }) {
  const current = useAtlas();
  React.useLayoutEffect(() => {
    atlas = current;
  });
  return phone ? (
    <>
      <MAtlasStatsCard stats={current.stats} availability={current.availability} retryRead={current.retryRead} />
      <MAtlasBucketSheet atlas={current} open onClose={() => {}} />
    </>
  ) : (
    <output>{JSON.stringify({ data: current.data, loading: current.loading })}</output>
  );
}
async function mount(phone = false) {
  const view = render(<Probe phone={phone} />);
  await waitFor(() => expect(atlas.loading).toBe(false));
  await waitFor(() => expect(atlas.geoData?.features).toHaveLength(1));
  return view;
}
beforeEach(() => {
  lf.reset();
  resetAllStores();
  seedStore(useSettingsStore, { settings: buildSettings({ dark_mode: false, language: 'en' }) });
  seedStore(nativeAuth, { user: buildUser(), isAuthenticated: true });
  marksRows = [{ country_id: id(4) }];
  countryRows = [{ id: id(4), iso2: 'mx' }];
  familyAuthStore.setState({
    isAuthenticated: true,
    authUserId: session.userId,
    personId: session.personId,
    familyId: session.familyId,
    authGate: 'ok',
    authCheckFailed: false,
    user: { ...session.user, id: 1, role: 'admin', maps_api_key: null },
  });
  calls = [];
  statsRow = { data: { total_trips: 7, total_places: 8, total_days: 12 }, error: null };
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://atlas.example.invalid');
  vi.spyOn(supabaseClient, 'getSupabaseBrowserClient').mockReturnValue(
    fakeReadClient() as unknown as ReturnType<typeof supabaseClient.getSupabaseBrowserClient>
  );
  const currentSession = async () => {
    const state = familyAuthStore.getState();
    if (!state.isAuthenticated || !state.authUserId || !state.personId || !state.familyId || state.authGate !== 'ok')
      throw new FamilyApiError(401, 'session_required', 'Sign in');
    return { ...session, userId: state.authUserId, personId: state.personId, familyId: state.familyId };
  };
  const repo = new FamilyFrontendRepository(currentSession, familyReaders, () => {
    const state = familyAuthStore.getState();
    return state.isAuthenticated && state.authGate === 'ok' && state.authUserId && state.personId && state.familyId
      ? {
          source: String(import.meta.env.VITE_SUPABASE_URL),
          userId: state.authUserId,
          personId: state.personId,
          familyId: state.familyId,
        }
      : null;
  });
  handler = createFamilyApplicationHandler(repo);
  api.defaults.adapter = createFamilyAxiosAdapter(handler);
  server.use(http.get(/admin0\.geojson(?:\.gz)?.*$/, () => HttpResponse.json(geo)));
});
afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  familyAuthStore.setState(initialFamilyAuth, true);
  vi.unstubAllEnvs();
});

describe('Family Atlas availability through real reader/handler/native consumers', () => {
  it('unsupported Family bucket read must refuse instead of promising authoritative empty data', async () => {
    await expect(api.get('/addons/atlas/bucket-list')).rejects.toMatchObject({ response: { status: 501 } });
  });
  it('successful statistics must survive an unavailable independent bucket read', async () => {
    api.defaults.adapter = createFamilyAxiosAdapter((r) =>
      r.pathname === '/addons/atlas/bucket-list'
        ? Promise.reject(new FamilyApiError(501, 'atlas_unavailable', 'Unavailable'))
        : handler(r)
    );
    await mount();
    expect(atlas.stats.totalTrips).toBe(7);
  });
  it('the actual phone metric consumer must not display unknown city count as measured zero', async () => {
    await mount(true);
    const label = screen.getByText(atlas.t('atlas.cities', { count: 0 }));
    expect(label.previousElementSibling?.textContent?.trim()).not.toBe('0');
  });
});

function totals(trips: number) {
  return { data: { total_trips: trips, total_places: 8, total_days: 12 }, error: null };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function startDelayedRead(promise: Promise<unknown>) {
  const before = calls.filter((c) => c.table === 'family_travel_stats').length;
  statsRow = promise;
  act(() => atlas.reloadAfterDawarich());
  await waitFor(() => expect(calls.filter((c) => c.table === 'family_travel_stats').length).toBeGreaterThan(before));
}
function switchOwner(n: number) {
  familyAuthStore.setState({
    isAuthenticated: true,
    authUserId: id(n + 1),
    personId: id(n + 2),
    familyId: id(n + 3),
    authGate: 'ok',
    authCheckFailed: false,
    user: { ...session.user, id: 1, role: 'admin', maps_api_key: null },
  });
}

describe('Family Atlas independent reads, truthful native slots and ownership', () => {
  it('retains completed aggregate facts and visited marks without inventing country/city counts', async () => {
    const response = await api.get('/addons/atlas/stats');
    expect(response.data).toEqual({
      countries: [{ code: 'MX', status: 'visited' }],
      stats: { totalTrips: 7, totalPlaces: 8, totalDays: 12, totalCountries: 1 },
      continents: { 'North America': 1 },
    });
  });
  it('treats an absent completed-Trip aggregate group as a real zero, not a request failure', async () => {
    statsRow = { data: null, error: null };
    marksRows = [];
    const response = await api.get('/addons/atlas/stats');
    expect(response.data.stats).toEqual({ totalTrips: 0, totalPlaces: 0, totalDays: 0, totalCountries: 0 });
    expect(response.data.countries).toEqual([]);
  });
  it.each([
    undefined,
    { total_trips: null, total_places: 8, total_days: 12 },
    { total_trips: 'bad', total_places: 8, total_days: 12 },
    { total_trips: -1, total_places: 8, total_days: 12 },
  ])('refuses incomplete/invalid totals instead of coercing them to measured zero (%j)', async (row) => {
    statsRow = { data: row, error: null };
    await expect(api.get('/addons/atlas/stats')).rejects.toMatchObject({ response: { status: 502 } });
  });
  it('refuses an incomplete visited-country lookup rather than undercounting it', async () => {
    countryRows = [];
    await expect(api.get('/addons/atlas/stats')).rejects.toMatchObject({ response: { status: 502 } });
  });
  it('distinguishes unsupported bucket/regions/layers/details using stable501 codes', async () => {
    for (const [url, section] of [
      ['/addons/atlas/bucket-list', 'bucket'],
      ['/addons/atlas/regions', 'regions'],
      ['/addons/atlas/regions/geo/MX', 'regions'],
      ['/atlas-layers', 'layers'],
      ['/addons/atlas/country/MX', 'country'],
    ]) {
      await expect(api.get(url)).rejects.toMatchObject({
        response: { status: 501, data: { code: 'family_atlas_' + section + '_unavailable' } },
      });
    }
  });
  it('phone shows unavailable bucket without empty guidance or an unsupported Add button', async () => {
    await mount(true);
    await waitFor(() => expect(atlas.availability.bucket.status).toBe('unavailable'));
    expect(screen.queryByText(atlas.t('atlas.bucketEmpty'))).toBeNull();
    expect(screen.queryByText(atlas.t('atlas.bucketEmptyHint'))).toBeNull();
    expect(screen.queryByRole('button', { name: atlas.t('atlas.addPoi') })).toBeNull();
    expect(screen.getAllByText(atlas.t('atlas.unavailable')).length).toBeGreaterThan(0);
  });
  it('phone has actual error/Retry instead of zero totals, while country geography still loads', async () => {
    statsRow = { data: null, error: new Error('Stats fault') };
    await mount(true);
    await waitFor(() => expect(atlas.availability.stats.status).toBe('error'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(atlas.geoData?.features).toHaveLength(1);
    expect(screen.queryByText(atlas.t('atlas.trips', { count: 0 }))).toBeNull();
    statsRow = totals(9);
    fireEvent.click(screen.getByRole('button', { name: atlas.t('common.errorRetry') }));
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(9));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('geometry can fail and retry independently of successful statistics', async () => {
    let fail = true;
    api.defaults.adapter = createFamilyAxiosAdapter((r) =>
      fail && r.pathname === '/addons/atlas/countries/geo'
        ? Promise.reject(new FamilyApiError(503, 'geo_failed', 'Geo fault'))
        : handler(r)
    );
    render(<Probe phone />);
    await waitFor(() => expect(atlas.availability.geography.status).toBe('error'));
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(7));
    expect(atlas.geoData).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: atlas.t('common.errorRetry') }));
    await waitFor(() => expect(atlas.geoData?.features).toHaveLength(1));
    expect(atlas.stats.totalTrips).toBe(7);
  });
  it('bucket transport error is retryable and remains distinct from deliberate unavailability', async () => {
    let fail = true;
    api.defaults.adapter = createFamilyAxiosAdapter((r) =>
      fail && r.pathname === '/addons/atlas/bucket-list'
        ? Promise.reject(new FamilyApiError(503, 'bucket_failed', 'Bucket fault'))
        : handler(r)
    );
    await mount(true);
    await waitFor(() => expect(atlas.availability.bucket.status).toBe('error'));
    expect(atlas.stats.totalTrips).toBe(7);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: atlas.t('common.errorRetry') }));
    await waitFor(() => expect(atlas.availability.bucket.status).toBe('unavailable'));
    expect(atlas.stats.totalTrips).toBe(7);
  });
  it('independent region and layer errors cannot discard successful stats/geography', async () => {
    api.defaults.adapter = createFamilyAxiosAdapter((r) =>
      r.pathname === '/addons/atlas/regions' || r.pathname === '/atlas-layers'
        ? Promise.reject(new FamilyApiError(503, 'fault', 'Synthetic fault'))
        : handler(r)
    );
    await mount();
    await waitFor(() => expect(atlas.availability.regions.status).toBe('error'));
    expect(atlas.availability.layers.status).toBe('error');
    expect(atlas.stats.totalTrips).toBe(7);
  });
  it('desktop shows unknown metrics and unavailable bucket in its original native slots', async () => {
    render(
      <>
        <Probe />
        <AtlasPage />
      </>
    );
    await waitFor(() => expect(atlas.availability.bucket.status).toBe('unavailable'));
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(7));
    await waitFor(() => expect(screen.getAllByLabelText(atlas.t('atlas.unavailable')).length).toBeGreaterThan(1));
    fireEvent.click(screen.getByRole('button', { name: atlas.t('atlas.bucketTab') }));
    expect(screen.queryByText(atlas.t('atlas.bucketEmptyHint'))).toBeNull();
    expect(screen.getAllByText(atlas.t('atlas.unavailable')).length).toBeGreaterThan(0);
  });
  it('does not hide real aggregate totals just because no countries have explicit visit marks', async () => {
    marksRows = [];
    render(
      <>
        <Probe />
        <AtlasPage />
      </>
    );
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(7));
    await waitFor(() => expect(screen.queryByText(atlas.t('atlas.noData'))).toBeNull());
    expect(screen.getAllByText(atlas.t('atlas.trips', { count: 7 })).length).toBeGreaterThan(0);
  });
  it('unknown per-country counts cannot trigger native unmark and unsupported regions do not replace country outlines', async () => {
    const requests: string[] = [];
    api.defaults.adapter = createFamilyAxiosAdapter((r) => {
      requests.push(r.pathname);
      return handler(r);
    });
    const toast = vi.fn(() => 0);
    vi.stubGlobal('__addToast', toast);
    render(
      <>
        <Probe />
        <AtlasPage />
      </>
    );
    await waitFor(() => expect(lf.geoJson.some((entry) => Boolean((entry as MockGeoJson).entries.length))).toBe(true));
    await waitFor(() => expect(atlas.availability.regions.status).toBe('unavailable'));
    const layer = (lf.geoJson as MockGeoJson[])
      .flatMap((g) => g.entries)
      .find((e) => (e.feature.properties as Record<string, unknown>)?.ISO_A2 === 'MX')?.layer;
    expect(layer).toBeDefined();
    if (!layer) throw new Error('Country layer missing');
    expect(String(layer.bindTooltip.mock.calls[0][0])).toContain('—');
    expect(String(layer.bindTooltip.mock.calls[0][0])).not.toContain('undefined');
    await act(async () => {
      layer.handlers.click({});
    });
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(requests.some((p) => p.includes('/country/MX'))).toBe(true);
    expect(requests.some((p) => p.endsWith('/mark'))).toBe(false);
    lf.zoom = 7;
    act(() => {
      for (const cb of lf.mapHandlers.zoomend ?? []) cb();
      for (const cb of lf.mapHandlers.moveend ?? []) cb();
    });
    expect(lf.panes.overlayPane.style.opacity).toBe('1');
    expect(requests.some((p) => p.includes('/regions/geo/'))).toBe(false);
  });
  it('a slower previous reload cannot overwrite a later successful statistics reply', async () => {
    await mount();
    const old = deferred<unknown>();
    await startDelayedRead(old.promise);
    statsRow = totals(11);
    act(() => atlas.reloadAfterDawarich());
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(11));
    await act(async () => old.resolve(totals(8)));
    expect(atlas.stats.totalTrips).toBe(11);
    expect(atlas.availability.stats.status).toBe('ready');
  });
  it('logout and A→B→A retire an older same-identity reply permanently', async () => {
    await mount(true);
    const old = deferred<unknown>();
    await startDelayedRead(old.promise);
    act(() =>
      familyAuthStore.setState({
        isAuthenticated: false,
        authUserId: null,
        personId: null,
        familyId: null,
        authGate: null,
        user: null,
      })
    );
    await waitFor(() => expect(atlas.data).toBeNull());
    statsRow = totals(11);
    act(() => switchOwner(100));
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(11));
    statsRow = totals(13);
    act(() => switchOwner(0));
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(13));
    await act(async () => old.resolve(totals(8)));
    expect(atlas.stats.totalTrips).toBe(13);
  });
  it('old failures and retained callbacks cannot clear or interrupt a new owner read', async () => {
    await mount();
    const staleReload = atlas.reloadAfterDawarich,
      staleDetail = atlas.loadCountryDetail;
    const old = deferred<unknown>();
    await startDelayedRead(old.promise);
    const fresh = deferred<unknown>();
    statsRow = fresh.promise;
    act(() => switchOwner(100));
    await act(async () => {
      staleReload();
      await staleDetail('MX');
      old.reject(new Error('Retired failure'));
    });
    expect(atlas.selectedCountry).toBeNull();
    await act(async () => fresh.resolve(totals(17)));
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(17));
    expect(atlas.availability.stats.status).toBe('ready');
  });
  it('source replacement retires all prior facts and responses', async () => {
    await mount();
    const old = deferred<unknown>();
    await startDelayedRead(old.promise);
    statsRow = totals(19);
    act(() => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://other-atlas.example.invalid');
      familyAuthStore.setState({ authGate: 'ok' });
    });
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(19));
    await act(async () => old.resolve(totals(8)));
    expect(atlas.stats.totalTrips).toBe(19);
  });
  it('unmount retires delayed reads and React StrictMode replays still load once per active generation', async () => {
    const pending = deferred<unknown>();
    statsRow = pending.promise;
    const first = render(<Probe />);
    await waitFor(() => expect(calls.some((c) => c.table === 'family_travel_stats')).toBe(true));
    first.unmount();
    await act(async () => pending.resolve(totals(8)));
    statsRow = totals(23);
    render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>
    );
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(23));
    expect(atlas.availability.stats.status).toBe('ready');
  });
});

describe('retired Atlas search callbacks', () => {
  it('cannot move the new owner map or replace its country search state', async () => {
    await mount();
    const search = atlas.search_places;
    const select = atlas.select_place_from_search;
    statsRow = totals(29);
    act(() => switchOwner(100));
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(29));
    await act(async () => {
      search('Retired place');
      await select({ name: 'Retired place', address: null, lat: 19, lng: -99 });
    });
    expect(atlas.atlas_country_search).toBe('');
    expect(atlas.atlas_places_loading).toBe(false);
    expect(atlas.selectedCountry).toBeNull();
  });
});

describe('independent native Atlas geometry and retained map events', () => {
  it('still paints country geometry when statistics fail', async () => {
    statsRow = { data: null, error: new Error('Stats fault') };
    render(
      <>
        <Probe />
        <AtlasPage />
      </>
    );
    await waitFor(() => expect(atlas.availability.stats.status).toBe('error'));
    await waitFor(() => expect((lf.geoJson as MockGeoJson[]).some((g) => g.entries.length > 0)).toBe(true));
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });
  it('a retired map event cannot borrow the next owner detail reader', async () => {
    const requests: string[] = [];
    api.defaults.adapter = createFamilyAxiosAdapter((r) => {
      requests.push(r.pathname);
      return handler(r);
    });
    render(
      <>
        <Probe />
        <AtlasPage />
      </>
    );
    await waitFor(() => expect((lf.geoJson as MockGeoJson[]).some((g) => g.entries.length > 0)).toBe(true));
    const old = (lf.geoJson as MockGeoJson[])
      .flatMap((g) => g.entries)
      .find((e) => (e.feature.properties as Record<string, unknown>)?.ISO_A2 === 'MX')?.layer.handlers.click;
    expect(old).toBeDefined();
    statsRow = totals(31);
    act(() => switchOwner(100));
    await waitFor(() => expect(atlas.stats.totalTrips).toBe(31));
    await act(async () => {
      old?.({});
    });
    expect(requests.filter((p) => p.includes('/country/'))).toHaveLength(0);
  });
});

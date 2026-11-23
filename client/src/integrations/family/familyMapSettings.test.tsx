import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { act, cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { apiClient, settingsApi } from '../../api/client';
import JourneyMapAuto from '../../components/Journey/JourneyMapAuto';
import { MapViewAuto } from '../../components/Map/MapViewAuto';
import { ToastContainer } from '../../components/shared/Toast';
import MSettings from '../../mobile/screens/settings/MSettings';
import SettingsPage from '../../pages/SettingsPage';
import { useAuthStore as nativeAuth } from '../../store/authStore';
import { useSettingsStore as nativeSettings } from '../../store/settingsStore';
import { resetWebGLProbe, webGLFailures } from '../../utils/webgl';
import { createFamilyApplicationHandler } from './applicationHandler';
import { subscribeNativeFamilyMapSettings } from './familyMapProjection';
import { TranslationProvider as FamilyTranslationProvider } from './legacy/i18n';
import FamilyMapSettingsManager from './legacy/pages/admin/FamilyMapSettingsManager';
import { useAuthStore } from './legacy/store/authStore';
import { useFamilyMapStore } from './legacy/store/familyMapStore';
import { FamilyFrontendRepository, familySettingsStore, type FamilySession } from './repository';
import { activateFamilyFrontend } from './runtime';
import { createFamilyAxiosAdapter } from './transport';

const { rpc, webgl, previews } = vi.hoisted(() => ({
  rpc: vi.fn(),
  webgl: { available: true, failures: 0, refuseContext: false },
  previews: vi.fn(),
}));
vi.mock('@family/backend/supabase/client', async (original) => ({
  ...(await original<typeof import('@family/backend/supabase/client')>()),
  getSupabaseBrowserClient: () => ({ rpc }),
}));
vi.mock('../../components/Layout/PageShell', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../components/Map/MapView', () => ({
  MapView: () => <div data-testid="trip-leaflet" />,
}));
vi.mock('../../components/Map/glLazy', async (original) => ({
  ...(await original<typeof import('../../components/Map/glLazy')>()),
  MapViewGLMapbox: () => <div data-testid="trip-mapbox" />,
  MapViewGLMaplibre: () => <div data-testid="trip-maplibre" />,
  JourneyMapGLMapbox: () => <div data-testid="journey-mapbox" />,
  JourneyMapGLMaplibre: () => <div data-testid="journey-maplibre" />,
}));
vi.mock('../../components/Journey/JourneyMap', () => ({
  default: () => <div data-testid="journey-leaflet" />,
}));
class PreviewMap {
  private events: Record<string, () => void> = {};

  constructor(options: { container: HTMLElement }, provider: 'mapbox' | 'maplibre') {
    if (webgl.refuseContext) throw new Error('Failed to initialize WebGL');
    options.container.dataset.testid = 'gl-preview';
    previews(provider, options, this.events);
  }

  on(event: string, listener: () => void) {
    this.events[event] = listener;
  }

  jumpTo() {}
  remove() {}
  setTerrain() {}
}

vi.mock('../../components/Map/engines/mapbox', () => ({
  default: {
    accessToken: '',
    Map: class extends PreviewMap {
      constructor(options: { container: HTMLElement }) {
        super(options, 'mapbox');
      }
    },
  },
}));
vi.mock('../../components/Map/engines/maplibre', () => ({
  default: {
    Map: class extends PreviewMap {
      constructor(options: { container: HTMLElement }) {
        super(options, 'maplibre');
      }
    },
  },
}));
vi.mock('../../components/Map/useRoadtripHazards', () => ({ useRoadtripHazards: () => ({ feed: null }) }));
vi.mock('../../hooks/useNetworkMode', () => ({ useNetworkMode: () => ({ offline: false }) }));
vi.mock('../../utils/webgl', async (original) => {
  const actual = await original<typeof import('../../utils/webgl')>();
  return {
    ...actual,
    hasWebGL: () => webgl.available && actual.webGLFailures() === webgl.failures,
  };
});

const session: FamilySession = {
  userId: '0b930000-0000-4000-8000-000000000001',
  personId: '0b930000-0000-4000-8000-000000000002',
  familyId: '0b930000-0000-4000-8000-000000000003',
  user: {
    username: 'Fixture Family user',
    email: 'map-review@fixture.invalid',
    avatar_url: null,
    created_at: '2026-01-01',
  },
};

const tile = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
const originalAdapter = apiClient.defaults.adapter;
const origLegacyAuth = useAuthStore.getState();
const origNativeAuth = nativeAuth.getState();
const origLegacyPrefs = familySettingsStore.getState();
const traffic: Array<{ method: string; path: string; body: unknown }> = [];
let selected: string | null;
let defaultOption: string;
let adminCanManage: boolean;
let cartoKey: string | null;
let mapboxToken: string | null;
let releaseMap: () => void;
const bright = 'https://tiles.openfreemap.org/styles/bright';
const fixtureCartoKey = 'carto fixture & key';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function mapRow(familyDefault = 'osm') {
  return {
    family_id: session.familyId,
    person_id: session.personId,
    enabled_option_ids: ['osm', 'osm-de', 'openfreemap-bright', 'mapbox-standard', 'carto-dark'],
    default_option_id: familyDefault,
    selected_option_id: selected,
    effective_option_id: selected ?? familyDefault,
    source: selected ? 'member' : 'family',
    carto_api_key: cartoKey,
    carto_configured: !!cartoKey,
    mapbox_public_token: mapboxToken,
    mapbox_configured: !!mapboxToken,
  };
}

beforeEach(async () => {
  activateFamilyFrontend();
  resetWebGLProbe();
  webgl.available = true;
  webgl.failures = webGLFailures();
  webgl.refuseContext = false;
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '');
  localStorage.clear();
  selected = 'openfreemap-bright';
  defaultOption = 'openfreemap-bright';
  adminCanManage = false;
  cartoKey = null;
  mapboxToken = null;
  previews.mockClear();
  rpc.mockReset();
  rpc.mockImplementation(async (name, args) => {
    if (name === 'get_my_profile_display_preferences')
      return { data: { date_format: 'YYYY-MM-DD', week_start: 'monday' }, error: null };
    expect(args.p_family_id).toBe(session.familyId);
    if (name === 'get_my_effective_preferences') return { data: {}, error: null };
    if (name === 'get_my_effective_map_settings') return { data: mapRow(), error: null };
    if (name === 'get_family_map_settings') {
      return { data: { ...mapRow(defaultOption), can_manage: adminCanManage }, error: null };
    }
    if (name === 'update_family_map_settings') {
      expect(adminCanManage).toBe(true);
      defaultOption = args.p_patch.default_option_id;
      return { data: { ...mapRow(defaultOption), can_manage: true }, error: null };
    }
    if (name === 'update_my_map_preference') {
      selected = args.p_option_id;
      return { data: mapRow(), error: null };
    }
    throw new Error('Unexpected fixture RPC ' + name);
  });
  useAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    authGate: 'ok',
    authUserId: session.userId,
    personId: session.personId,
    familyId: session.familyId,
  });
  nativeAuth.setState({ isAuthenticated: true, user: buildUser(), managed: true });
  nativeSettings.getState().resetSettings();
  familySettingsStore.setState(origLegacyPrefs, true);
  await useFamilyMapStore.getState().hydrate(session.familyId);
  releaseMap = subscribeNativeFamilyMapSettings((map) =>
    nativeSettings.setState(({ settings }) => ({ settings: { ...settings, ...map } }))
  );
  const repo = new FamilyFrontendRepository(async () => session);
  const handle = createFamilyApplicationHandler(repo);
  apiClient.defaults.adapter = createFamilyAxiosAdapter((request) => {
    traffic.push({ method: request.method, path: request.pathname, body: request.body });
    return handle(request);
  });
});

function expectRaster(container: HTMLElement, host: string | RegExp) {
  const tile = container.querySelector<HTMLImageElement>('.leaflet-container img.leaflet-tile');
  if (!tile) throw new Error('The preview has no raster tiles');
  const url = new URL(tile.src);
  expect(url.hostname).toEqual(typeof host === 'string' ? host : expect.stringMatching(host));
  expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute(
    'href',
    'https://www.openstreetmap.org/copyright'
  );
  return url;
}

async function expectCartoRaster(container: HTMLElement) {
  await waitFor(() => {
    const url = expectRaster(container, /^[a-c]\.basemaps\.cartocdn\.com$/);
    expect(url.pathname).toMatch(/^\/dark_all\/16\/\d+\/\d+\.png$/);
    expect(url.searchParams.getAll('key')).toEqual([fixtureCartoKey]);
    expect(
      container.querySelector('.leaflet-control-attribution a[href="https://carto.com/attribution/"]')
    ).toHaveTextContent('CARTO');
  });
}

afterEach(() => {
  cleanup();
  releaseMap();
  apiClient.defaults.adapter = originalAdapter;
  nativeSettings.getState().resetSettings();
  useFamilyMapStore.getState().reset();
  useAuthStore.setState(origLegacyAuth, true);
  nativeAuth.setState(origNativeAuth, true);
  familySettingsStore.setState(origLegacyPrefs, true);
  traffic.length = 0;
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe.each([
  { shell: 'Desktop', Settings: SettingsPage },
  { shell: 'Phone', Settings: MSettings },
])('$shell Family map preferences', ({ Settings }) => {
  it('previews the built-in raster map when WebGL2 is unavailable', async () => {
    webgl.available = false;
    await nativeSettings.getState().loadSettings();
    const { container } = render(<Settings />, { initialEntries: ['/settings?tab=map'] });

    await waitFor(() => expectRaster(container, 'tile.openstreetmap.org'));
    expect(screen.queryByTestId('gl-preview')).toBeNull();
    expect(screen.getByRole('button', { name: 'OpenFreeMap Bright', pressed: true })).toBeInTheDocument();
    expect(rpc.mock.calls.some(([name]) => name === 'update_my_map_preference')).toBe(false);
  });

  it('saves a named map, reloads the stored selection, and can inherit the Family default', async () => {
    await nativeSettings.getState().loadSettings();
    expect(nativeSettings.getState().isLoaded).toBe(true);
    expect(nativeSettings.getState().settings).toMatchObject({
      map_provider: 'maplibre-gl',
      maplibre_style: bright,
    });
    const view = render(
      <>
        <Settings />
        <MapViewAuto places={[]} />
        <JourneyMapAuto checkins={[]} entries={[]} />
        <ToastContainer />
      </>,
      { initialEntries: ['/settings?tab=map'] }
    );
    expect(await screen.findByTestId('trip-maplibre')).toBeInTheDocument();
    expect(screen.getByTestId('journey-maplibre')).toBeInTheDocument();
    expect(await screen.findByTestId('gl-preview')).toBeInTheDocument();
    expect(previews).toHaveBeenCalledWith(
      'maplibre',
      expect.objectContaining({
        style: bright,
        center: [2.3522, 48.8566],
        zoom: 16,
      }),
      expect.any(Object)
    );
    expect(screen.getByRole('button', { name: 'OpenFreeMap Bright' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /mapbox/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'OpenStreetMap DE' }));
    expect(await screen.findByText('Map settings saved')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('update_my_map_preference', {
      p_family_id: session.familyId,
      p_option_id: 'osm-de',
    });
    expect(traffic.some((entry) => entry.path === '/settings/bulk')).toBe(false);
    expect(screen.getByTestId('trip-leaflet')).toBeInTheDocument();
    expect(screen.getByTestId('journey-leaflet')).toBeInTheDocument();
    await waitFor(() => expectRaster(view.container, 'tile.openstreetmap.de'));

    view.unmount();
    familySettingsStore.setState(origLegacyPrefs, true);
    nativeSettings.getState().resetSettings();
    useFamilyMapStore.getState().reset();
    await useFamilyMapStore.getState().hydrate(session.familyId);
    await nativeSettings.getState().loadSettings();
    expect(nativeSettings.getState().settings).toMatchObject({ map_provider: 'leaflet', map_tile_url: tile });
    render(<Settings />, { initialEntries: ['/settings?tab=map'] });
    expect(screen.getByRole('button', { name: 'OpenStreetMap DE' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Reset to family default' }));
    expect(await screen.findByRole('button', { name: 'OpenStreetMap', pressed: true })).toBeInTheDocument();
    expect(rpc).toHaveBeenLastCalledWith('update_my_map_preference', {
      p_family_id: session.familyId,
      p_option_id: null,
    });
  });

  it('previews CARTO even when the planner is using satellite imagery', async () => {
    cartoKey = fixtureCartoKey;
    selected = 'carto-dark';
    await useFamilyMapStore.getState().hydrate(session.familyId);
    await nativeSettings.getState().loadSettings();
    nativeSettings.setState(({ settings }) => ({ settings: { ...settings, map_base_layer: 'satellite' } }));
    const { container } = render(<Settings />, { initialEntries: ['/settings?tab=map'] });

    await expectCartoRaster(container);
    expect(screen.getByRole('button', { name: /carto.*dark/i, pressed: true })).toBeInTheDocument();
    expect(nativeSettings.getState().settings.map_base_layer).toBe('satellite');
    expect(rpc.mock.calls.some(([name]) => name === 'update_my_map_preference')).toBe(false);
  });

  it('uses the native Mapbox preview and keeps quality changes device-local', async () => {
    selected = 'mapbox-standard';
    mapboxToken = 'pk.local-map-fixture';
    await useFamilyMapStore.getState().hydrate(session.familyId);
    await nativeSettings.getState().loadSettings();
    render(<Settings />, { initialEntries: ['/settings?tab=map'] });

    await screen.findByTestId('gl-preview');
    expect(previews).toHaveBeenLastCalledWith(
      'mapbox',
      expect.objectContaining({
        style: 'mapbox://styles/mapbox/standard',
        pitch: 45,
        antialias: false,
        projection: 'mercator',
      }),
      expect.any(Object)
    );
    fireEvent.click(screen.getByRole('button', { name: /quality/i, pressed: false }));
    await waitFor(() =>
      expect(previews).toHaveBeenLastCalledWith(
        'mapbox',
        expect.objectContaining({
          antialias: true,
          projection: 'globe',
        }),
        expect.any(Object)
      )
    );
    expect(localStorage.getItem('fta_mapbox_quality_mode')).toBe('true');
    expect(rpc.mock.calls.some(([name]) => name === 'update_my_map_preference')).toBe(false);
  });
});

describe('Family admin preview', () => {
  it.each([
    { label: 'WebGL2 is unavailable', available: false, refuseContext: false },
    { label: 'the GPU refuses a context', available: true, refuseContext: true },
  ])('uses the built-in raster map when $label', async ({ available, refuseContext }) => {
    webgl.available = available;
    webgl.refuseContext = refuseContext;
    const { container } = render(
      <FamilyTranslationProvider>
        <FamilyMapSettingsManager />
      </FamilyTranslationProvider>
    );

    await waitFor(() => expectRaster(container, 'tile.openstreetmap.org'));
    expect(screen.queryByTestId('gl-preview')).toBeNull();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(rpc).toHaveBeenCalledWith('get_family_map_settings', { p_family_id: session.familyId });
    expect(rpc.mock.calls.some(([name]) => name === 'update_family_map_settings')).toBe(false);
  });

  it('credits the OpenStreetMap fallback if a saved CARTO default has no usable key', async () => {
    defaultOption = 'carto-dark';
    const { container } = render(
      <FamilyTranslationProvider>
        <FamilyMapSettingsManager />
      </FamilyTranslationProvider>
    );

    await waitFor(() => expectRaster(container, 'tile.openstreetmap.org'));
    expect(screen.getByRole('combobox')).toHaveValue('carto-dark');
    expect(container.querySelector('.leaflet-control-attribution')).not.toHaveTextContent('CARTO');
    expect(rpc.mock.calls.some(([name]) => name === 'update_family_map_settings')).toBe(false);
  });

  it('uses native startup feedback and previews the saved default through the admin command', async () => {
    cartoKey = fixtureCartoKey;
    adminCanManage = true;
    const { container } = render(
      <FamilyTranslationProvider>
        <FamilyMapSettingsManager />
      </FamilyTranslationProvider>
    );

    await screen.findByTestId('gl-preview');
    expect(previews).toHaveBeenCalledWith('maplibre', expect.objectContaining({ style: bright }), expect.any(Object));
    const events = previews.mock.lastCall?.[2];
    if (!events) throw new Error('The preview did not register its GL callbacks');
    await act(() => events.error());
    expect(screen.getByRole('alert')).toHaveTextContent('Map preview failed to load');
    await act(() => events.load());
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'carto-dark' } });
    await expectCartoRaster(container);
    expect(rpc).toHaveBeenCalledWith('update_family_map_settings', {
      p_family_id: session.familyId,
      p_patch: { default_option_id: 'carto-dark' },
    });
    expect(rpc.mock.calls.some(([name]) => name === 'update_my_map_preference')).toBe(false);
  });
});

it('rejects old provider writes at both settings boundaries while retaining device options', async () => {
  await expect(settingsApi.setBulk({ map_provider: 'leaflet', map_tile_url: tile })).rejects.toMatchObject({
    response: { status: 422, data: { code: 'family_map_option_required' } },
  });
  await expect(nativeSettings.getState().updateSettings({ map_tile_url: tile })).rejects.toMatchObject({
    code: 'family_map_option_required',
  });
  expect(nativeSettings.getState().settings.map_provider).toBe('maplibre-gl');
  await nativeSettings.getState().updateSettings({ mapbox_quality_mode: true });
  expect(localStorage.getItem('fta_mapbox_quality_mode')).toBe('true');
  expect(rpc.mock.calls.some(([name]) => name === 'update_my_map_preference')).toBe(false);
});

it('keeps the confirmed choice after a refusal and ignores a refresh that predates a save', async () => {
  rpc.mockImplementationOnce(async () => ({ data: null, error: { message: 'map option is not enabled' } }));
  await expect(useFamilyMapStore.getState().selectOption('osm-de')).rejects.toMatchObject({
    message: 'map option is not enabled',
  });
  expect(nativeSettings.getState().settings.maplibre_style).toBe(bright);

  const refresh = deferred<{ data: ReturnType<typeof mapRow>; error: null }>();
  rpc.mockImplementationOnce(() => refresh.promise);
  const older = mapRow();
  const loading = useFamilyMapStore.getState().hydrate(session.familyId);
  await useFamilyMapStore.getState().selectOption('osm-de');
  refresh.resolve({ data: older, error: null });
  await loading;
  expect(nativeSettings.getState().settings.map_tile_url).toBe(tile);
});

it('retires a pending selection and credentials on account change', async () => {
  const mapbox = {
    ...mapRow(),
    effective_option_id: 'mapbox-standard',
    selected_option_id: 'mapbox-standard',
    mapbox_public_token: 'pk.local-map-fixture',
    mapbox_configured: true,
  };
  rpc.mockImplementationOnce(async () => ({ data: mapbox, error: null }));
  await useFamilyMapStore.getState().hydrate(session.familyId);
  expect(nativeSettings.getState().settings.mapbox_access_token).toBe(mapbox.mapbox_public_token);
  const save = deferred<{ data: typeof mapbox; error: null }>();
  rpc.mockImplementationOnce(() => save.promise);
  const pending = useFamilyMapStore.getState().selectOption('osm-de');
  await expect(useFamilyMapStore.getState().selectOption(null)).rejects.toThrow('already being saved');
  const retired = expect(pending).rejects.toMatchObject({ code: 'stale_family_actor' });
  useAuthStore.setState({ isAuthenticated: false, authGate: null, authUserId: null, personId: null, familyId: null });
  save.resolve({ data: mapbox, error: null });
  await retired;
  expect(nativeSettings.getState().settings).toMatchObject({ map_provider: 'leaflet', mapbox_access_token: '' });
});

it('merges the latest confirmed map when an older general settings request replies', async () => {
  const pending = deferred<{ settings: Partial<ReturnType<typeof nativeSettings.getState>['settings']> }>();
  const read = vi.spyOn(settingsApi, 'get').mockReturnValueOnce(pending.promise);
  try {
    const loading = nativeSettings.getState().loadSettings();
    await useFamilyMapStore.getState().selectOption('osm-de');
    pending.resolve({ settings: { map_provider: 'maplibre-gl', map_tile_url: bright, maplibre_style: bright } });
    await loading;
    expect(nativeSettings.getState().settings).toMatchObject({ map_provider: 'leaflet', map_tile_url: tile });
  } finally {
    read.mockRestore();
  }
});

it('returns public map defaults for a settings read from a shared route', async () => {
  const path = window.location.pathname;
  window.history.replaceState({}, '', '/public/journey/fixture');
  try {
    const { settings } = await settingsApi.get();
    expect(settings).toMatchObject({
      map_provider: 'leaflet',
      map_tile_url: '',
      maplibre_style: '',
      carto_api_key: '',
    });
  } finally {
    window.history.replaceState({}, '', path);
  }
});

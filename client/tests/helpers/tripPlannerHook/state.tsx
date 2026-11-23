// organize-imports-ignore
// sort-imports-ignore
// Install original hoisted mocks before consumers and preserve dependency evaluation order.
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TranslationProvider } from '../../../src/i18n/TranslationContext';
import '../../../src/i18n';
import { useTripPlanner } from '../../../src/pages/tripPlanner/useTripPlanner';
import { useTripStore, type TripStoreState } from '../../../src/store/tripStore';
import { useAuthStore } from '../../../src/store/authStore';
import { useSettingsStore } from '../../../src/store/settingsStore';
import '../../../src/store/permissionsStore';
import { usePluginStore } from '../../../src/store/pluginStore';
import { useBackgroundTasksStore } from '../../../src/store/backgroundTasksStore';
import '../../../src/store/addonStore';
import { resetAllStores, seedStore } from '../store';
import { buildUser, buildTrip } from '../factories';
import { addonsApi, authApi, tripsApi, assignmentsApi, healthApi, airtrailApi, mapsApi } from '../../../src/api/client';
import { accommodationRepo } from '../../../src/repo/accommodationRepo';
import '../../../src/db/offlineDb';
import { getCached } from '../../../src/services/photoService';
import type { Settings } from '../../../src/types';
import '../../../src/mobile/useIsPhone';
import { makeActions, type PlannerActions } from '../plannerActions';

// ── Router ────────────────────────────────────────────────────────────────────
// Only useParams/useNavigate/useSearchParams are consumed by the hook, so the
// whole module is replaced — that keeps the ?create=… intents fully controllable.
const navigate = vi.fn();

let routeParams: { id?: string } = { id: '42' };

let searchParams = new URLSearchParams();

const setSearchParams = vi.fn((updater: (p: URLSearchParams) => URLSearchParams) => {
  const next = new URLSearchParams(searchParams);
  searchParams = typeof updater === 'function' ? updater(next) : next;
});

vi.mock('react-router', () => ({
  useParams: () => routeParams,
  useNavigate: () => navigate,
  useSearchParams: () => [searchParams, setSearchParams],
}));

vi.mock('../../../src/hooks/useTripWebSocket', () => ({ useTripWebSocket: vi.fn() }));

const updateRouteForDay = vi.fn(async (_dayId: number | null) => {});

vi.mock('../../../src/hooks/useRouteCalculation', () => ({
  useRouteCalculation: () => ({
    route: null,
    routeSegments: [],
    routeVias: [],
    routeInfo: null,
    setRoute: vi.fn(),
    setRouteInfo: vi.fn(),
    updateRouteForDay,
  }),
}));

// Hoisted so the module mocks below can read them at module-evaluation time.
const env = vi.hoisted(() => ({ airTrailAvailable: false, forcedOffline: false }));

vi.mock('../../../src/hooks/useAirtrailConnection', () => ({
  useAirtrailConnection: () => ({
    airtrailEnabled: env.airTrailAvailable,
    connected: env.airTrailAvailable,
    available: env.airTrailAvailable,
    loading: false,
  }),
}));

vi.mock('../../../src/sync/networkMode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/sync/networkMode')>();
  return {
    ...actual,
    isEffectivelyOffline: () => env.forcedOffline,
    isEffectivelyOnline: () => !env.forcedOffline,
  };
});

vi.mock('../../../src/repo/accommodationRepo', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/repo/accommodationRepo')>();
  return { accommodationRepo: { ...real.accommodationRepo, list: vi.fn(async () => ({ accommodations: [] })) } };
});

vi.mock('../../../src/services/photoService', () => ({
  getCached: vi.fn(() => undefined),
  fetchPhoto: vi.fn(),
}));

// ── Store fixtures ────────────────────────────────────────────────────────────

let actions: PlannerActions;

const toasts: Array<{ message: string; type: string }> = [];

function wrapper({ children }: { children: React.ReactNode }) {
  return <TranslationProvider>{children}</TranslationProvider>;
}

/** Mount the hook and let the bootstrap effects (addons, config, roster, …) settle. */
async function renderPlanner() {
  const rendered = renderHook(() => useTripPlanner(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  return rendered;
}

/** Patch settings without dropping the defaults the providers read (language, …). */
function setSettings(patch: Partial<Settings>) {
  useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, ...patch } });
}

/** Seed the trip store with a trip + the mocked actions the hook snapshots on mount. */
function seedTrip(extra: Partial<TripStoreState> = {}) {
  const trip = buildTrip({ id: 42, title: 'Kyoto' });
  useTripStore.setState({
    trip,
    isLoading: false,
    days: [],
    places: [],
    assignments: {},
    reservations: [],
    ...(actions as unknown as Partial<TripStoreState>),
    ...extra,
  } as Partial<TripStoreState>);
  return trip;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAllStores();
  routeParams = { id: '42' };
  searchParams = new URLSearchParams();
  env.airTrailAvailable = false;
  env.forcedOffline = false;
  toasts.length = 0;
  actions = makeActions();
  usePluginStore.setState({ plugins: [], loaded: true });
  useBackgroundTasksStore.setState({ tasks: [] });
  window.__addToast = ((message: string, type: string) => {
    toasts.push({ message, type });
    return 1;
  }) as unknown as typeof window.__addToast;
  seedStore(useAuthStore, { user: buildUser({ id: 1 }), isAuthenticated: true, placesPhotosEnabled: false });

  vi.spyOn(addonsApi, 'enabled').mockResolvedValue({ addons: [] });
  vi.spyOn(authApi, 'getAppConfig').mockResolvedValue({});
  vi.spyOn(healthApi, 'features').mockResolvedValue({ bookingImport: false, aiParsing: false });
  vi.spyOn(tripsApi, 'getMembers').mockResolvedValue({ owner: null, members: [] });
  vi.spyOn(assignmentsApi, 'updateTime').mockResolvedValue({});
  vi.spyOn(airtrailApi, 'sync').mockResolvedValue({ changed: 0 });
  vi.spyOn(mapsApi, 'reverse').mockResolvedValue({ name: '', address: '' } as never);
  vi.spyOn(mapsApi, 'search').mockResolvedValue({ places: [] } as never);
  vi.mocked(accommodationRepo.list).mockResolvedValue({ accommodations: [] });
  vi.mocked(getCached).mockReturnValue(undefined);
});

afterEach(() => {
  delete window.__addToast;
  vi.restoreAllMocks();
});

// These accessors retain the original mutable bindings, rather than copied snapshots.
export const fixtureState = {
  get routeParams() {
    return routeParams;
  },
  set routeParams(value: typeof routeParams) {
    routeParams = value;
  },
  get searchParams() {
    return searchParams;
  },
  set searchParams(value: typeof searchParams) {
    searchParams = value;
  },
  get actions() {
    return actions;
  },
  set actions(value: typeof actions) {
    actions = value;
  },
};

export { navigate, setSearchParams, updateRouteForDay, env, toasts, wrapper, renderPlanner, setSettings, seedTrip };

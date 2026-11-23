// organize-imports-ignore
// sort-imports-ignore
// Install original hoisted mocks before consumers and preserve dependency evaluation order.
import {
  fixtureState,
  navigate,
  setSearchParams,
  env,
  toasts,
  renderPlanner,
  setSettings,
  seedTrip,
} from '../../../tests/helpers/tripPlannerHook/state';
import 'react';
import { act, waitFor } from '@testing-library/react';
import '../../i18n/TranslationContext';
import '../../i18n';
import './useTripPlanner';
import { useTripStore } from '../../store/tripStore';
import { useAuthStore } from '../../store/authStore';
import '../../store/settingsStore';
import '../../store/permissionsStore';
import { usePluginStore } from '../../store/pluginStore';
import '../../store/backgroundTasksStore';
import { useAddonStore } from '../../store/addonStore';
import { seedStore } from '../../../tests/helpers/store';
import { buildPlace, buildAssignment, buildReservation } from '../../../tests/helpers/factories';
import { addonsApi, authApi, tripsApi, healthApi, airtrailApi, toursApi } from '../../api/client';
import axios from 'axios';
import { createFamilyApplicationHandler } from '../../integrations/family/applicationHandler';
import { FamilyFrontendRepository } from '../../integrations/family/repository';
import * as runtime from '../../integrations/family/runtime';
import { createFamilyAxiosAdapter } from '../../integrations/family/transport';
import { accommodationRepo } from '../../repo/accommodationRepo';
import { offlineDb } from '../../db/offlineDb';
import { getCached, fetchPhoto } from '../../services/photoService';
import type { TourListItem } from '@trek/shared';
import type { Place } from '../../types';
import '../../mobile/useIsPhone';
import '../../../tests/helpers/plannerActions';

describe('useTripPlanner — bootstrap', () => {
  it('FE-TP-HOOK-001: loads the trip, its accommodations and its roster for the route id', async () => {
    seedTrip();
    vi.mocked(accommodationRepo.list).mockResolvedValue({
      accommodations: [{ id: 5, trip_id: 42 }] as never,
    });
    vi.mocked(tripsApi.getMembers).mockResolvedValue({
      owner: { id: 1, username: 'owner' },
      members: [{ id: 2, username: 'bob' }],
    });

    const { result } = await renderPlanner();

    expect(result.current.tripId).toBe(42);
    expect(fixtureState.actions.loadTrip).toHaveBeenCalledWith(42);
    expect(fixtureState.actions.loadReservations).toHaveBeenCalledWith(42);
    await waitFor(() => expect(result.current.tripAccommodations).toHaveLength(1));
    await waitFor(() => expect(result.current.tripMembers).toHaveLength(2));
  });

  it('FE-TP-HOOK-002: a failing loadTrip toasts and bounces back to the dashboard', async () => {
    seedTrip();
    fixtureState.actions.loadTrip.mockRejectedValue(new Error('gone'));

    await renderPlanner();

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'));
    expect(toasts.some((t) => t.type === 'error')).toBe(true);
  });

  it('withholds the previously loaded trip when another Family trip fails to open', async () => {
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
    const previousTrip = seedTrip();
    const { result, rerender } = await renderPlanner();
    expect(result.current.trip).toBe(previousTrip);

    fixtureState.actions.loadTrip.mockRejectedValue(
      new Error('Retained records require explicit classification or bridging.')
    );
    fixtureState.routeParams = { id: '43' };
    await act(async () => rerender());

    expect(fixtureState.actions.loadTrip).toHaveBeenLastCalledWith(43);
    expect(result.current.trip).toBeNull();
    expect(useTripStore.getState().trip).toBe(previousTrip);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-003: an id-less route yields NaN and skips every trip-scoped load', async () => {
    fixtureState.routeParams = {};
    seedTrip();

    const { result } = await renderPlanner();

    expect(Number.isNaN(result.current.tripId)).toBe(true);
    expect(fixtureState.actions.loadTrip).not.toHaveBeenCalled();
    expect(accommodationRepo.list).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-004: offline reads the roster from the Dexie cache instead of the API', async () => {
    env.forcedOffline = true;
    seedTrip();
    await offlineDb.tripMembers.bulkPut([
      { tripId: 42, id: 9, user_id: 9, username: 'cached', role: 'member' } as never,
    ]);

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.tripMembers).toHaveLength(1));
    expect(result.current.tripMembers[0].username).toBe('cached');
    expect(tripsApi.getMembers).not.toHaveBeenCalled();
    await offlineDb.tripMembers.clear();
  });

  it('FE-TP-HOOK-005: refreshMembers is a no-op while offline', async () => {
    seedTrip();
    const { result } = await renderPlanner();
    await waitFor(() => expect(tripsApi.getMembers).toHaveBeenCalledTimes(1));

    env.forcedOffline = true;
    await act(async () => {
      await result.current.refreshMembers();
    });

    expect(tripsApi.getMembers).toHaveBeenCalledTimes(1);
  });

  it('FE-TP-HOOK-006: enabled addons and collab feature flags reach the returned state', async () => {
    vi.mocked(addonsApi.enabled).mockResolvedValue({
      addons: [{ id: 'packing' }, { id: 'budget' }, { id: 'collab' }],
      collabFeatures: { chat: true, notes: false, polls: false, whatsnext: true },
    });
    seedTrip();

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.enabledAddons.collab).toBe(true));
    expect(result.current.enabledAddons.documents).toBe(false);
    expect(result.current.collabFeatures.notes).toBe(false);
  });

  it('FE-TP-HOOK-007: the app config supplies the allowed upload types', async () => {
    vi.mocked(authApi.getAppConfig).mockResolvedValue({ allowed_file_types: 'pdf,png' });
    seedTrip();

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.allowedFileTypes).toBe('pdf,png'));
  });

  it('FE-TP-HOOK-008: the booking-import feature flag comes from /health/features', async () => {
    vi.mocked(healthApi.features).mockResolvedValue({ bookingImport: true, aiParsing: false });
    seedTrip();

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.bookingImportAvailable).toBe(true));
  });

  it('Family feature response and planner keep booking import closed', async () => {
    const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler()) });
    const response = await client.get<Awaited<ReturnType<typeof healthApi.features>>>('/health/features');
    vi.mocked(healthApi.features).mockResolvedValue(response.data);
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
    seedTrip();

    const { result } = await renderPlanner();

    expect(response.data).toEqual({ bookingImport: false, aiParsing: false });
    expect(result.current.bookingImportAvailable).toBe(false);
    act(() => result.current.setShowBookingImport(true));
    expect(result.current.showBookingImport).toBe(false);
  });

  it('Family planner closes import even when a stale parser response advertised it', async () => {
    vi.mocked(healthApi.features).mockResolvedValue({ bookingImport: true, aiParsing: true });
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
    seedTrip();

    const { result } = await renderPlanner();

    expect(healthApi.features).toHaveBeenCalled();
    expect(result.current.bookingImportAvailable).toBe(false);
    act(() => result.current.setShowBookingImport(true));
    expect(result.current.showBookingImport).toBe(false);
  });

  it('native planner still offers booking import on an AI-only server', async () => {
    vi.mocked(healthApi.features).mockResolvedValue({ bookingImport: false, aiParsing: true });
    seedTrip();

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.bookingImportAvailable).toBe(true));
    act(() => result.current.setShowBookingImport(true));
    expect(result.current.showBookingImport).toBe(true);
  });

  it('FE-TP-HOOK-009: opening the trip pulls AirTrail changes once and reloads bookings', async () => {
    env.airTrailAvailable = true;
    vi.mocked(airtrailApi.sync).mockResolvedValue({ changed: 3 });
    seedTrip();

    const { result } = await renderPlanner();

    await waitFor(() => expect(fixtureState.actions.loadReservations).toHaveBeenCalledTimes(2));
    expect(airtrailApi.sync).toHaveBeenCalledTimes(1);

    // A re-render must not fire a second sync for the same trip.
    act(() => {
      result.current.setFitKey(9);
    });
    expect(airtrailApi.sync).toHaveBeenCalledTimes(1);
  });

  it('FE-TP-HOOK-010: an AirTrail sync with no changes leaves the bookings alone', async () => {
    env.airTrailAvailable = true;
    seedTrip();

    await renderPlanner();

    await waitFor(() => expect(airtrailApi.sync).toHaveBeenCalled());
    expect(fixtureState.actions.loadReservations).toHaveBeenCalledTimes(1);
  });

  it('FE-TP-HOOK-011: stays booked elsewhere in one burst reload the stay list once and show in it', async () => {
    seedTrip();
    const { result } = await renderPlanner();
    const booked = [8, 9].map((id) => ({ id, trip_id: 42 }));
    vi.mocked(accommodationRepo.list).mockResolvedValue({ accommodations: booked as never });

    act(() =>
      booked.forEach((accommodation) =>
        useTripStore.getState().handleRemoteEvent({ type: 'accommodation:created', accommodation })
      )
    );
    await waitFor(() => expect(result.current.tripAccommodations.map((a) => a.id)).toEqual([8, 9]));
    expect(accommodationRepo.list).toHaveBeenCalledTimes(2);
  });

  it('FE-TP-HOOK-012: the splash gate opens once the trip finished loading', async () => {
    vi.useFakeTimers();
    seedTrip();

    const { result } = await renderPlanner();
    expect(result.current.splashDone).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(result.current.splashDone).toBe(true);

    vi.useRealTimers();
  });

  it('FE-TP-HOOK-013: place photos are prefetched only for places without an image', async () => {
    seedStore(useAuthStore, { placesPhotosEnabled: true });
    const withImage = buildPlace({ id: 1, image_url: '/uploads/a.jpg', lat: 1, lng: 2 });
    const withOsm = buildPlace({ id: 2, image_url: null, osm_id: 'node/7', lat: 3, lng: 4 });
    const coordsOnly = buildPlace({ id: 3, image_url: null, osm_id: null, google_place_id: null, lat: 5, lng: 6 });
    seedTrip({ places: [withImage, withOsm, coordsOnly] });

    await renderPlanner();

    await waitFor(() => expect(fetchPhoto).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetchPhoto).mock.calls[0][0]).toBe('node/7');
    expect(vi.mocked(fetchPhoto).mock.calls[1][1]).toBe('coords:5:6');
  });

  it('FE-TP-HOOK-014: an already cached photo is not fetched again', async () => {
    seedStore(useAuthStore, { placesPhotosEnabled: true });
    vi.mocked(getCached).mockReturnValue({ url: '/x.jpg' } as never);
    seedTrip({ places: [buildPlace({ id: 2, image_url: null, osm_id: 'node/7', lat: 3, lng: 4 })] });

    await renderPlanner();

    await waitFor(() => expect(getCached).toHaveBeenCalled());
    expect(fetchPhoto).not.toHaveBeenCalled();
  });
});

describe('useTripPlanner — tabs', () => {
  it('FE-TP-HOOK-015: addon tabs appear only for enabled addons', async () => {
    vi.mocked(addonsApi.enabled).mockResolvedValue({ addons: [{ id: 'packing' }, { id: 'documents' }] });
    seedTrip();

    const { result } = await renderPlanner();

    await waitFor(() => {
      expect(result.current.TRIP_TABS.map((t) => t.id)).toEqual([
        'plan',
        'transports',
        'buchungen',
        'listen',
        'dateien',
      ]);
    });
  });

  it('FE-TP-HOOK-016: switching to the Costs tab loads the budget items and persists the tab', async () => {
    vi.mocked(addonsApi.enabled).mockResolvedValue({ addons: [{ id: 'budget' }] });
    seedTrip();
    const { result } = await renderPlanner();
    await waitFor(() => expect(result.current.TRIP_TABS.map((t) => t.id)).toContain('finanzplan'));

    act(() => {
      result.current.handleTabChange('finanzplan');
    });

    expect(result.current.activeTab).toBe('finanzplan');
    expect(sessionStorage.getItem('trip-tab-42')).toBe('finanzplan');
    expect(fixtureState.actions.loadBudgetItems).toHaveBeenCalledWith(42);
  });

  it('FE-TP-HOOK-017: the Files tab loads files only while none are cached', async () => {
    seedTrip();
    const { result } = await renderPlanner();

    act(() => {
      result.current.handleTabChange('dateien');
    });
    expect(fixtureState.actions.loadFiles).toHaveBeenCalledTimes(1);

    act(() => {
      useTripStore.setState({ files: [{ id: 1 }] as never });
    });
    act(() => {
      result.current.handleTabChange('dateien');
    });
    expect(fixtureState.actions.loadFiles).toHaveBeenCalledTimes(1);
  });

  it('FE-TP-HOOK-018: a saved tab that no addon backs falls back to plan', async () => {
    sessionStorage.setItem('trip-tab-42', 'listen');
    seedTrip();

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.activeTab).toBe('plan'));
    expect(sessionStorage.getItem('trip-tab-42')).toBe('plan');
  });

  it('FE-TP-HOOK-018b: a tab set programmatically is re-validated on the spot', async () => {
    usePluginStore.setState({ plugins: [], loaded: true });
    seedTrip();

    const { result } = await renderPlanner();

    act(() => {
      result.current.setActiveTab('plugin:ghost');
    });

    await waitFor(() => expect(result.current.activeTab).toBe('plan'));
    expect(sessionStorage.getItem('trip-tab-42')).toBe('plan');
  });

  it('FE-TP-HOOK-019: a positioned trip-page plugin splices its tab and can replace a core tab', async () => {
    usePluginStore.setState({
      plugins: [
        {
          id: 'transit-pro',
          name: 'Transit Pro',
          type: 'trip-page',
          icon: null,
          tripPage: { replaces: ['transports'], position: 1 },
        },
        { id: 'tail', name: 'Tail', type: 'trip-page', icon: null, tripPage: {} },
      ] as never,
      loaded: true,
    });
    seedTrip();

    const { result } = await renderPlanner();

    await waitFor(() => {
      expect(result.current.TRIP_TABS.map((t) => t.id)).toEqual([
        'plan',
        'plugin:transit-pro',
        'buchungen',
        'plugin:tail',
      ]);
    });
  });

  it('FE-TP-HOOK-019b: two positioned plugin tabs keep their relative order', async () => {
    usePluginStore.setState({
      plugins: [
        { id: 'late', name: 'Late', type: 'trip-page', icon: null, tripPage: { position: 3 } },
        { id: 'early', name: 'Early', type: 'trip-page', icon: 'Map', tripPage: { position: 1 } },
      ] as never,
      loaded: true,
    });
    seedTrip();

    const { result } = await renderPlanner();

    await waitFor(() => {
      expect(result.current.TRIP_TABS.map((t) => t.id)).toEqual([
        'plan',
        'plugin:early',
        'transports',
        'plugin:late',
        'buchungen',
      ]);
    });
  });

  it('FE-TP-HOOK-020: jumping to a plugin-replaced core tab lands on plan instead', async () => {
    usePluginStore.setState({
      plugins: [
        {
          id: 'transit-pro',
          name: 'Transit Pro',
          type: 'trip-page',
          icon: null,
          tripPage: { replaces: ['buchungen'] },
        },
      ] as never,
      loaded: true,
    });
    seedTrip();

    const { result } = await renderPlanner();

    act(() => {
      result.current.handleTabChange('buchungen');
    });
    expect(result.current.activeTab).toBe('plan');
    expect(sessionStorage.getItem('trip-tab-42')).toBe('plan');
  });

  it('FE-TP-HOOK-021: a saved plugin tab survives until the plugin feed has loaded', async () => {
    sessionStorage.setItem('trip-tab-42', 'plugin:late');
    usePluginStore.setState({ plugins: [], loaded: false });
    seedTrip();

    const { result } = await renderPlanner();

    expect(result.current.activeTab).toBe('plugin:late');
  });

  // ── ?tab= deep link (startup destination, shortcuts, wrapper apps) ──────────

  it('FE-TP-HOOK-104: ?tab= opens that tab on the very first render and clears the param', async () => {
    vi.mocked(addonsApi.enabled).mockResolvedValue({ addons: [{ id: 'budget' }] });
    fixtureState.searchParams = new URLSearchParams('tab=finanzplan');
    seedTrip();

    const { result } = await renderPlanner();

    // No frame on 'plan' first — the tab is right from the initial state.
    expect(result.current.activeTab).toBe('finanzplan');
    await waitFor(() => expect(fixtureState.searchParams.get('tab')).toBeNull());
  });

  it('FE-TP-HOOK-105: ?tab= beats the tab the last session ended on', async () => {
    sessionStorage.setItem('trip-tab-42', 'buchungen');
    fixtureState.searchParams = new URLSearchParams('tab=transports');
    seedTrip();

    const { result } = await renderPlanner();

    expect(result.current.activeTab).toBe('transports');
    await waitFor(() => expect(sessionStorage.getItem('trip-tab-42')).toBe('transports'));
  });

  it('FE-TP-HOOK-106: a junk ?tab= is ignored rather than rendering a dead panel', async () => {
    fixtureState.searchParams = new URLSearchParams('tab=../../etc/passwd');
    seedTrip();

    const { result } = await renderPlanner();

    expect(result.current.activeTab).toBe('plan');
  });

  // The lazy loads live in handleTabChange, which a deep link never goes through.
  it('FE-TP-HOOK-107: starting on Costs still loads the budget items', async () => {
    vi.mocked(addonsApi.enabled).mockResolvedValue({ addons: [{ id: 'budget' }] });
    fixtureState.searchParams = new URLSearchParams('tab=finanzplan');
    seedTrip();

    await renderPlanner();

    await waitFor(() => expect(fixtureState.actions.loadBudgetItems).toHaveBeenCalledWith(42));
  });

  it('FE-TP-HOOK-108: starting on Files still loads the files', async () => {
    vi.mocked(addonsApi.enabled).mockResolvedValue({ addons: [{ id: 'documents' }] });
    fixtureState.searchParams = new URLSearchParams('tab=dateien');
    seedTrip();

    await renderPlanner();

    await waitFor(() => expect(fixtureState.actions.loadFiles).toHaveBeenCalledWith(42));
  });

  // enabledAddons is an optimistic guess until the feed answers, and 'collab'
  // is guessed off — evicting on that guess would drop a requested tab.
  it('FE-TP-HOOK-109: a requested collab tab survives until the addon feed answers', async () => {
    vi.mocked(addonsApi.enabled).mockResolvedValue({ addons: [{ id: 'collab' }] });
    fixtureState.searchParams = new URLSearchParams('tab=collab');
    seedTrip();

    const { result } = await renderPlanner();

    expect(result.current.activeTab).toBe('collab');
    await waitFor(() => expect(result.current.TRIP_TABS.map((t) => t.id)).toContain('collab'));
    expect(result.current.activeTab).toBe('collab');
  });

  it.each(['deep link', 'saved tab', 'programmatic navigation', 'direct setter'])(
    'Family leaves Collab unmounted while its addon feed is pending after a %s',
    async (entry) => {
      vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
      const repo = new FamilyFrontendRepository(async () => ({
        userId: '10000000-0000-4000-8000-000000000001',
        personId: '10000000-0000-4000-8000-000000000002',
        familyId: '10000000-0000-4000-8000-000000000003',
        user: {
          username: 'Planner member',
          email: 'planner@fixture.invalid',
          avatar_url: null,
          created_at: '2026-01-01',
        },
      }));
      const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
      const { data } = await client.get<{ addons: { id: string }[] }>('/addons');
      expect(data.addons.some((addon) => addon.id === 'collab')).toBe(false);

      let release = () => {};
      vi.mocked(addonsApi.enabled).mockReturnValue(
        new Promise((resolve) => {
          release = () => resolve(data);
        })
      );
      if (entry === 'deep link') fixtureState.searchParams = new URLSearchParams('tab=collab');
      if (entry === 'saved tab') sessionStorage.setItem('trip-tab-42', 'collab');
      seedTrip();

      const { result } = await renderPlanner();
      try {
        if (entry === 'programmatic navigation') act(() => result.current.handleTabChange('collab'));
        if (entry === 'direct setter') act(() => result.current.setActiveTab('collab'));
        expect(result.current.activeTab).toBe('plan');
        expect(sessionStorage.getItem('trip-tab-42')).toBe('plan');
        expect(result.current.TRIP_TABS.some((tab) => tab.id === 'collab')).toBe(false);
      } finally {
        await act(async () => release());
      }
      expect(result.current.activeTab).toBe('plan');
    }
  );

  it('FE-TP-HOOK-110: but a tab whose addon really is off still falls back to plan', async () => {
    vi.mocked(addonsApi.enabled).mockResolvedValue({ addons: [] });
    fixtureState.searchParams = new URLSearchParams('tab=finanzplan');
    seedTrip();

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.activeTab).toBe('plan'));
  });
});

describe('useTripPlanner — ?create intents', () => {
  it('FE-TP-HOOK-022: ?create=place opens an empty place form and clears the param', async () => {
    fixtureState.searchParams = new URLSearchParams('create=place');
    seedTrip();

    const { result } = await renderPlanner();

    expect(result.current.showPlaceForm).toBe(true);
    expect(result.current.editingPlace).toBeNull();
    expect(setSearchParams).toHaveBeenCalled();
    expect(fixtureState.searchParams.get('create')).toBeNull();
  });

  it('FE-TP-HOOK-023: ?create=reservation opens the booking modal', async () => {
    fixtureState.searchParams = new URLSearchParams('create=reservation');
    seedTrip();

    const { result } = await renderPlanner();

    expect(result.current.showReservationModal).toBe(true);
    expect(result.current.editingReservation).toBeNull();
  });

  it('FE-TP-HOOK-024: ?create=transport opens the transport modal', async () => {
    fixtureState.searchParams = new URLSearchParams('create=transport');
    seedTrip();

    const { result } = await renderPlanner();

    expect(result.current.showTransportModal).toBe(true);
    expect(result.current.transportModalDayId).toBeNull();
  });
});

describe('useTripPlanner — map derivations', () => {
  const geo = (id: number, extra: Partial<Place> = {}) => buildPlace({ id, lat: 10 + id, lng: 20 + id, ...extra });

  it('FE-TP-HOOK-025: places without coordinates never reach the map', async () => {
    seedTrip({ places: [geo(1), buildPlace({ id: 2, lat: null, lng: null })] });

    const { result } = await renderPlanner();

    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([1]);
  });

  it('FE-TP-HOOK-026: the tracks filter keeps only places with a route geometry', async () => {
    seedTrip({
      places: [geo(1), geo(2, { route_geometry: '[[1,2]]' })],
      placesFilter: 'tracks',
    });

    const { result } = await renderPlanner();

    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([2]);
  });

  it('FE-TP-HOOK-177: losing the last track moves the "Tracks" filter back to all', async () => {
    // The phone map has no places list mounted, so this hook is what keeps the
    // filter from pointing at a pool no control offers any more.
    seedTrip({
      places: [geo(1), geo(2, { route_geometry: '[[1,2]]' })],
      placesFilter: 'tracks',
    });

    const { result } = await renderPlanner();
    expect(useTripStore.getState().placesFilter).toBe('tracks');

    act(() => {
      useTripStore.setState({ places: [geo(1)] });
    });

    await waitFor(() => expect(useTripStore.getState().placesFilter).toBe('all'));
    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([1]);
  });

  it('Tours enabled clears a stale Tracks filter even while track geometry remains', async () => {
    const tour: TourListItem = {
      place_id: 7,
      name: 'Ridge walk',
      tour_type: 'hike',
      distance: 4,
      elevation_gain: 100,
      elevation_loss: 80,
      duration: null,
      difficulty: null,
      wanderer_ref: null,
      match_confidence: 1,
      max_hiking_difficulty: 2,
      planned: false,
      caution: false,
    };
    useAddonStore.setState({ addons: [{ id: 'tours', enabled: true } as never], loaded: true });
    vi.mocked(addonsApi.enabled).mockResolvedValue({ addons: [{ id: 'tours' }] });
    vi.spyOn(toursApi, 'list').mockResolvedValue({ tours: [tour] });
    seedTrip({
      places: [
        buildPlace({ id: 7, lat: 1, lng: 2, tour_place_id: 7, route_geometry: '[[1,2],[3,4]]' }),
        buildPlace({ id: 8, lat: 3, lng: 4, route_geometry: '[[5,6],[7,8]]' }),
      ],
      placesFilter: 'tracks',
    });

    const { result } = await renderPlanner();
    await waitFor(() => expect(useTripStore.getState().placesFilter).toBe('all'));

    expect(result.current.enabledAddons.tours).toBe(true);
    expect(result.current.mapPlaces.map((place) => place.id)).toEqual([7, 8]);
  });

  it('FE-TP-HOOK-027: the category filter honours the uncategorized bucket', async () => {
    seedTrip({
      places: [geo(1, { category_id: 3 }), geo(2, { category_id: null })],
      placesCategoryFilter: new Set(['uncategorized']),
    });

    const { result } = await renderPlanner();

    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([2]);

    act(() => {
      useTripStore.setState({ placesCategoryFilter: new Set(['3']) });
    });
    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([1]);
  });

  it('FE-TP-HOOK-176: the rating floor the lists set also thins the markers', async () => {
    seedTrip({
      places: [geo(1, { rating_avg: 4.5 }), geo(2, { rating_avg: 3 }), geo(3, { rating_avg: null })],
      placesRatingFilter: 4,
    });

    const { result } = await renderPlanner();

    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([1]);

    act(() => {
      useTripStore.getState().setPlacesRatingFilter('all');
    });
    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('FE-TP-HOOK-028: the unplanned filter drops places that sit on a day', async () => {
    const planned = geo(1);
    seedTrip({
      places: [planned, geo(2)],
      assignments: { '7': [buildAssignment({ id: 10, day_id: 7, place: planned })] },
      placesFilter: 'unplanned',
    });

    const { result } = await renderPlanner();

    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([2]);
  });

  it("FE-TP-HOOK-029: the planned filter keeps a collapsed day's stops on the map", async () => {
    const planned = geo(1);
    seedTrip({
      places: [planned, geo(2)],
      assignments: { '7': [buildAssignment({ id: 10, day_id: 7, place: planned })] },
      placesFilter: 'planned',
    });

    const { result } = await renderPlanner();
    act(() => {
      result.current.setExpandedDayIds(new Set([999]));
    });

    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([1]);
  });

  it('FE-TP-HOOK-111: the planned filter follows the selected day when one is selected', async () => {
    const onDay7 = geo(1);
    const onDay8 = geo(2);
    seedTrip({
      places: [onDay7, onDay8, geo(3)],
      assignments: {
        '7': [buildAssignment({ id: 10, day_id: 7, place: onDay7 })],
        '8': [buildAssignment({ id: 11, day_id: 8, place: onDay8 })],
      },
      placesFilter: 'planned',
      selectedDayId: 7,
    });

    const { result } = await renderPlanner();

    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([1]);

    // No day selected → back to the whole plan
    act(() => {
      useTripStore.setState({ selectedDayId: null });
    });
    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([1, 2]);
  });

  it('FE-TP-HOOK-030: collapsing a day hides its stops unless another expanded day shows them', async () => {
    const shared = geo(1);
    seedTrip({
      places: [shared],
      assignments: {
        '7': [buildAssignment({ id: 10, day_id: 7, place: shared })],
        '8': [buildAssignment({ id: 11, day_id: 8, place: shared })],
      },
    });

    const { result } = await renderPlanner();

    act(() => {
      result.current.setExpandedDayIds(new Set([999]));
    });
    expect(result.current.mapPlaces).toHaveLength(0);

    act(() => {
      result.current.setExpandedDayIds(new Set([8]));
    });
    expect(result.current.mapPlaces.map((p) => p.id)).toEqual([1]);
  });

  it('FE-TP-HOOK-031: the selected day drives the marker order map and the fit list', async () => {
    const a = geo(1);
    const b = geo(2);
    seedTrip({
      places: [a, b],
      selectedDayId: 7,
      assignments: {
        '7': [
          buildAssignment({ id: 11, day_id: 7, place: b, order_index: 1 }),
          buildAssignment({ id: 10, day_id: 7, place: a, order_index: 0 }),
          buildAssignment({ id: 12, day_id: 7, place: a, order_index: 2 }),
        ],
      },
    });

    const { result } = await renderPlanner();

    expect(result.current.dayOrderMap).toEqual({ 1: [1, 3], 2: [2] });
    expect(result.current.dayPlaces).toHaveLength(3);
  });

  it('FE-TP-HOOK-031b: an assignment whose place vanished is skipped in the order map', async () => {
    seedTrip({
      places: [],
      selectedDayId: 7,
      assignments: { '7': [{ id: 10, day_id: 7, place_id: 1, order_index: 0, notes: null }] as never },
    });

    const { result } = await renderPlanner();

    expect(result.current.dayOrderMap).toEqual({});
    expect(result.current.dayPlaces).toEqual([]);
  });

  it('FE-TP-HOOK-031c: a service stop on the selected day takes no number on the map', async () => {
    const hamburg = geo(1);
    const pump = geo(2, { stop_type: 'fuel' });
    const berlin = geo(3);
    seedTrip({
      places: [hamburg, pump, berlin],
      selectedDayId: 7,
      assignments: {
        '7': [
          buildAssignment({ id: 10, day_id: 7, place: hamburg, order_index: 0 }),
          buildAssignment({ id: 11, day_id: 7, place: pump, order_index: 1 }),
          buildAssignment({ id: 12, day_id: 7, place: berlin, order_index: 2 }),
        ],
      },
    });

    const { result } = await renderPlanner();

    // The pump is drawn without a badge and the rail gives it no number, so the stop
    // after it is the second, not the third. The pin and the rail have to agree.
    expect(result.current.dayOrderMap).toEqual({ 1: [1], 3: [2] });
    // Still on the map: what is skipped is the number, not the stop.
    expect(result.current.dayPlaces).toHaveLength(3);
  });

  it('FE-TP-HOOK-032: without a selected day both day derivations stay empty', async () => {
    seedTrip({ places: [geo(1)] });

    const { result } = await renderPlanner();

    expect(result.current.dayOrderMap).toEqual({});
    expect(result.current.dayPlaces).toEqual([]);
  });

  it('FE-TP-HOOK-033: the first trip with geo places bumps the map fit key exactly once', async () => {
    seedTrip({ places: [geo(1)] });

    const { result } = await renderPlanner();

    expect(result.current.fitKey).toBe(1);
    act(() => {
      useTripStore.setState({ places: [geo(1), geo(2)] });
    });
    expect(result.current.fitKey).toBe(1);
  });
});

describe('useTripPlanner — connection visibility', () => {
  const routable = (id: number) => buildReservation({ id, endpoints: [{ role: 'from' }, { role: 'to' }] as never });

  it('FE-TP-HOOK-034: with no stored preference the account default decides the mode', async () => {
    setSettings({ map_always_show_routes: true });
    seedTrip({ reservations: [routable(1), routable(2)] });

    const { result } = await renderPlanner();

    expect(result.current.allConnectionsShown).toBe(true);
    expect(result.current.visibleConnections).toEqual([1, 2]);
  });

  it('FE-TP-HOOK-035: toggling one leg writes the trip preference to localStorage', async () => {
    seedTrip({ reservations: [routable(1), routable(2)] });

    const { result } = await renderPlanner();
    expect(result.current.visibleConnections).toEqual([]);

    act(() => {
      result.current.toggleConnection(2);
    });

    expect(result.current.visibleConnections).toEqual([2]);
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('trek:visible-connections:42') || 'null')).toEqual({
        mode: 'only',
        ids: [2],
      });
    });
  });

  it('FE-TP-HOOK-036: the bulk toggle flips the whole trip and drops per-leg overrides', async () => {
    localStorage.setItem('trek:visible-connections:42', JSON.stringify({ mode: 'only', ids: [1] }));
    seedTrip({ reservations: [routable(1), routable(2)] });

    const { result } = await renderPlanner();
    expect(result.current.visibleConnections).toEqual([1]);

    act(() => {
      result.current.toggleAllConnections();
    });

    expect(result.current.allConnectionsShown).toBe(true);
    expect(result.current.visibleConnections).toEqual([1, 2]);
  });

  it('FE-TP-HOOK-037: non-routable bookings are excluded from the visible set', async () => {
    setSettings({ map_always_show_routes: true });
    seedTrip({ reservations: [routable(1), buildReservation({ id: 2, endpoints: [] })] });

    const { result } = await renderPlanner();

    expect(result.current.visibleConnections).toEqual([1]);
  });

  it('FE-TP-HOOK-115: a persisted route toggle keeps transit routes off the map until a day is selected (#2019)', async () => {
    localStorage.setItem('trek:day-route:42', 'true');
    // The fixture action is a no-op; the derivation reads the store, so this
    // one has to write the selection like the real slice does.
    fixtureState.actions.setSelectedDay.mockImplementation((dayId) => {
      useTripStore.setState({ selectedDayId: dayId as number | null });
    });
    seedTrip();

    const { result } = await renderPlanner();

    // Trip re-entry: the toggle rehydrated but nothing selected a day yet.
    expect(result.current.routeShown).toBe(true);
    expect(result.current.transitRoutesShown).toBe(false);

    act(() => {
      result.current.handleSelectDay(7);
    });
    expect(result.current.transitRoutesShown).toBe(true);

    // Clicking the selected day's header again deselects it — the whole trip's
    // automated transports must not flood back.
    act(() => {
      result.current.handleSelectDay(null);
    });
    expect(result.current.transitRoutesShown).toBe(false);

    localStorage.removeItem('trek:day-route:42');
  });
});

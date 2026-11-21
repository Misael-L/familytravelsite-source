import Dexie from 'dexie';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import api from '../../../src/api/client';
import { installRealtimeDriver } from '../../../src/api/websocket';
import { ToastContainer } from '../../../src/components/shared/Toast';
import { offlineDb } from '../../../src/db/offlineDb';
import { TranslationProvider } from '../../../src/i18n/TranslationContext';
import '../../../src/index.css';
import { createFamilyApplicationHandler } from '../../../src/integrations/family/applicationHandler';
import { FamilyTripBoundary } from '../../../src/integrations/family/FamilyTripBoundary';
import { FamilyNavigationBoundary } from '../../../src/integrations/family/navigation';
import { plannerCacheDb } from '../../../src/integrations/family/plannerCache';
import { createFamilyPlannerCohort } from '../../../src/integrations/family/plannerCohort';
import { FamilyFrontendRepository } from '../../../src/integrations/family/repository';
import { activateFamilyFrontend } from '../../../src/integrations/family/runtime';
import { createFamilyAxiosAdapter } from '../../../src/integrations/family/transport';
import { useFamilyUiPermissions } from '../../../src/integrations/family/uiPermissions';
import { useAuthStore } from '../../../src/store/authStore';
import { useSettingsStore } from '../../../src/store/settingsStore';
import { useTripStore } from '../../../src/store/tripStore';
import { setAuthed } from '../../../src/sync/authGate';
import { days, family, header, locations, session, state, trip } from '../planner-native/demo.mjs';
import { governance, locationContext, plannerView, saveLocation } from './boundary-data.mjs';

const { document, location, URLSearchParams } = globalThis;
const fixture = (globalThis.fixture = {
  ready: false,
  errors: [],
  unexpected: [],
  requests: [],
  rpc: [],
  readOnly: false,
  saves: [],
  snapshots: [],
});
const outcome = new URLSearchParams(location.search).get('outcome') ?? 'direct';
globalThis.p04asSdk = {
  async rpc(name, args) {
    if (Dexie.currentTransaction) fixture.errors.push('SDK RPC inherited an IndexedDB transaction');
    fixture.rpc.push({ name, args });
    if (name === 'get_family_trip_planner_view_v1') {
      const data = plannerView(args.p_layer);
      fixture.snapshots.push({ layer: args.p_layer, names: data.state.locations.map((l) => l.name) });
      return { data, error: null };
    }
    if (name === 'get_family_plan_governance_v1') return { data: governance(args.p_layer, outcome), error: null };
    if (name === 'get_family_trip_location_form_v1') return { data: locationContext(args), error: null };
    if (name === 'save_family_trip_location_form_v1') {
      fixture.saves.push(globalThis.structuredClone(args));
      return { data: saveLocation(args), error: null };
    }
    if (name === 'get_family_trip_booking_view_v1')
      return {
        data: {
          version: 1,
          trip_id: trip,
          family_id: family,
          user_id: session.userId,
          person_id: session.personId,
          trip_revision: 1,
          days: days.map((d) => ({
            id: d.id,
            revision: 1,
            civil_day: d.civil_day,
            day_index: d.day_index,
            title: d.title,
          })),
          bookings: [],
        },
        error: null,
      };
    if (name === 'catalog_media_variants_for_assets')
      return {
        data: locations
          .filter((l) => l.cover_media_id)
          .map((l) => ({
            media_asset_id: l.cover_media_id,
            public_url: `${location.origin}/storage/v1/object/public/catalog/original-${l.id}.jpg`,
            recipe_version: 'v1',
            thumb_url: `${location.origin}/storage/v1/object/public/catalog/variants/v1/${l.id}/thumb-fixture.webp`,
            hero_url: `${location.origin}/storage/v1/object/public/catalog/variants/v1/${l.id}/hero-fixture.webp`,
          })),
        error: null,
      };
    fixture.unexpected.push(`RPC ${name}`);
    throw new Error(`Unexpected fixture RPC ${name}`);
  },
};
await offlineDb.open();
await plannerCacheDb.snapshots.clear();
setAuthed(true);
activateFamilyFrontend();
installRealtimeDriver({ connect() {}, disconnect() {}, joinTrip() {}, leaveTrip() {} });
useAuthStore.setState({
  user: { id: 1, ...session.user },
  isAuthenticated: true,
  isLoading: false,
  placesPhotosEnabled: false,
  placesEnrichEnabled: false,
});
useSettingsStore.setState((s) => ({
  settings: {
    ...s.settings,
    language: 'en',
    map_provider: 'leaflet',
    map_tile_url: `${location.origin}/p04as-tiles/{z}/{x}/{y}.png`,
  },
}));
const repo = new FamilyFrontendRepository(async () => session);
await repo.session();
repo.readers = { ...repo.readers, trips: { ...repo.readers.trips, fetchTripById: async () => header } };
repo.categories = async () => {
  const registry = (await repo.views()).ids;
  const categories = [...new Map(locations.map((l) => [l.category.id, l.category])).values()];
  return { categories: categories.map((c) => ({ ...c, id: registry.register('category', c.id) })) };
};
repo.core = async () => {
  throw new Error('Legacy controller must not load the rehearsal');
};
const backend = createFamilyApplicationHandler(repo);
const application = async (request) => {
  const p = request.pathname;
  fixture.requests.push(`${request.method} ${p}`);
  if (p.includes('/family/')) return backend(request);
  if (request.method !== 'GET') {
    fixture.unexpected.push(`${request.method} ${p}`);
    throw new Error('Unsupported fixture writer');
  }
  if (/\/(packing|todo|budget)$/.test(p)) return { items: [] };
  if (/\/files$/.test(p)) return { files: [] };
  if (/\/members$/.test(p)) return { members: [] };
  if (/^\/day-tints\//.test(p)) return { tints: [] };
  if (p.endsWith('/tour-draft')) return { draft: null };
  if (p === '/notifications/in-app/unread-count') return { count: 0 };
  if (/^\/trip-warnings\//.test(p)) return { warnings: [] };
  if (/^\/view-contributions\//.test(p)) return { contributions: [] };
  if (/^\/day-schedule\//.test(p)) return { items: [] };
  if (/^\/map-markers\//.test(p)) return { markers: [] };
  if (/^\/map-layers\//.test(p)) return { layers: [] };
  if (/^\/place-details\//.test(p)) return { providers: [] };
  if (p === '/weather') return { temp: 20, main: 'Clear', description: 'Synthetic rehearsal weather', type: 'clear' };
  if (p === '/tags') return { tags: [] };
  if (p === '/addons') return { addons: [{ id: 'packing' }, { id: 'budget' }, { id: 'documents' }] };
  if (p === '/auth/app-config') return { places_photos_enabled: false, has_maps_key: false };
  if (p === '/health/features') return { bookingImport: false, aiParsing: false };
  if (p === '/health') return { status: 'ok' };
  fixture.unexpected.push(`GET ${p}`);
  throw new Error(`Unexpected fixture read ${p}`);
};
const cohort = createFamilyPlannerCohort(repo, {
  source: () => location.origin,
  application,
  reportError: (e) => fixture.errors.push(String(e)),
});
cohort.install();
api.defaults.adapter = createFamilyAxiosAdapter(cohort.handle);
const ids = (await repo.views()).ids,
  nativeTrip = ids.register('trip', trip);
fixture.model = () => ({
  trip: useTripStore.getState().trip,
  places: useTripStore.getState().places,
  days: useTripStore.getState().days,
  assignments: useTripStore.getState().assignments,
});
fixture.permission = () => ({
  allowed: useFamilyUiPermissions.getState().controller?.isCurrent?.() ?? false,
  layer: useFamilyUiPermissions.getState().controller?.gov.layer,
});
fixture.draft = () => useFamilyUiPermissions.getState().controller?.gov.setLayer('myDraft');
fixture.queue = () => offlineDb.mutationQueue.toArray();
fixture.expected = { locations: locations.length, visits: state.visits.length, days: days.length };
// Exercise native reads with explicit route-off and a fresh synthetic FX cache.
globalThis.localStorage.setItem(`trek:day-route:${nativeTrip}`, 'false');
globalThis.localStorage.setItem('trek_fx_EUR', JSON.stringify({ rates: { EUR: 1, USD: 1.1 }, ts: Date.now() }));
const phone = new URLSearchParams(location.search).has('phone');
const { default: Screen } = phone
  ? await import('../../../src/mobile/screens/trip/MTripShell')
  : await import('../../../src/pages/TripPlannerPage');
const h = React.createElement;
createRoot(document.getElementById('root')).render(
  h(
    TranslationProvider,
    null,
    h(
      MemoryRouter,
      { initialEntries: [`/trips/${trip}`] },
      h(
        FamilyNavigationBoundary,
        { repository: repo },
        h(Routes, null, h(Route, { path: '/trips/:id', element: h(FamilyTripBoundary, null, h(Screen)) }))
      ),
      h(ToastContainer)
    )
  )
);
fixture.ready = true;

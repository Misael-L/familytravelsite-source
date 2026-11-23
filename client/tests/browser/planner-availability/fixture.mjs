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
import { createFamilyAxiosAdapter, createFamilyFetch } from '../../../src/integrations/family/transport';
import { familyCanDo, useFamilyUiPermissions } from '../../../src/integrations/family/uiPermissions';
import { useAuthStore } from '../../../src/store/authStore';
import { useSettingsStore } from '../../../src/store/settingsStore';
import { useTripStore } from '../../../src/store/tripStore';
import { setAuthed } from '../../../src/sync/authGate';
import { setForcedOffline } from '../../../src/sync/networkMode';
import { registerSyncTriggers } from '../../../src/sync/syncTriggers';
import { days, family, header, locations, session, state, trip } from '../planner-native/demo.mjs';
import { packingSnapshot, query } from './ancillary-data.mjs';
import { governance, locationContext, plannerView, saveLocation } from './boundary-data.mjs';
import { taskService } from './task-commands.mjs';

const { document, location, URLSearchParams } = globalThis;
const fixture = (globalThis.fixture = {
  ready: false,
  errors: [],
  unexpected: [],
  requests: [],
  queries: [],
  rpc: [],
  readOnly: false,
  saves: [],
  snapshots: [],
});
const outcome = new URLSearchParams(location.search).get('outcome') ?? 'direct';
const startup = new URLSearchParams(location.search).get('startup');
let releaseTasks = () => {},
  taskHold = null,
  taskDenied = startup === 'fail-task';
fixture.taskHeld = false;
fixture.reservationStarts = 0;
fixture.reservationFinishes = 0;
fixture.holdTasks = () => {
  fixture.taskHeld = false;
  taskHold = new Promise((resolve) => {
    releaseTasks = resolve;
  });
};
fixture.releaseTasks = () => {
  taskHold = null;
  releaseTasks();
};
if (startup === 'reservations-first') fixture.holdTasks();
const loadReservations = useTripStore.getState().loadReservations;
useTripStore.setState({
  loadReservations: async (...args) => {
    fixture.reservationStarts++;
    try {
      return await loadReservations(...args);
    } finally {
      fixture.reservationFinishes++;
    }
  },
});
globalThis.p04asSdk = {
  from: (table) => query(table, fixture, () => Dexie.currentTransaction),
  async rpc(name, args) {
    if (Dexie.currentTransaction) fixture.errors.push('SDK RPC inherited an IndexedDB transaction');
    fixture.rpc.push({ name, args });
    if (name === 'get_family_trip_tasks_v1') {
      if (taskDenied) {
        taskDenied = false;
        return { data: null, error: { code: '42501' } };
      }
      if (taskHold !== null) {
        fixture.taskHeld = true;
        await taskHold;
      }
    }
    if (name === 'get_family_trip_packing_v1') return { data: packingSnapshot(), error: null };
    const taskResult = taskService(name, args);
    if (taskResult !== null) return taskResult;
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
  // Explicit external/service stubs only. Trip ancillary GETs always use the real handler.
  if (p === '/weather') return { temp: 20, main: 'Clear', description: 'Synthetic rehearsal weather', type: 'clear' };
  if (p === '/notifications/in-app/unread-count') return { count: 0 };
  return backend(request);
};
const cohort = createFamilyPlannerCohort(repo, {
  source: () => location.origin,
  application,
  reportError: (e) => fixture.errors.push(String(e)),
});
cohort.install();
api.defaults.adapter = createFamilyAxiosAdapter(cohort.handle);
globalThis.fetch = createFamilyFetch(cohort.handle, globalThis.fetch.bind(globalThis), location.origin);
const ids = (await repo.views()).ids,
  nativeTrip = ids.register('trip', trip);
if (startup) {
  useSettingsStore.setState({ isLoaded: true });
  registerSyncTriggers();
  fixture.reconnect = () => {
    setForcedOffline(true);
    fixture.holdTasks();
    setForcedOffline(false);
    globalThis.dispatchEvent(new globalThis.Event('accommodations:refresh'));
  };
}
if (startup === 'pending') {
  const row = {
    id: 'a0490000-0000-4000-8000-000000000999',
    tripId: nativeTrip,
    method: 'POST',
    url: `/trips/${trip}/family/planner-editor-command`,
    body: { operation_id: 'a0490000-0000-4000-8000-000000000999', private_form: 'Retain exactly' },
    schemaVersion: 2,
    status: 'conflict',
    retentionPolicy: 'family-original-v1',
    attempts: 3,
    createdAt: 1,
    lastError: 'Original conflict',
  };
  await offlineDb.mutationQueue.put(row);
  fixture.originalQueued = globalThis.structuredClone(row);
}
fixture.model = () => ({
  trip: useTripStore.getState().trip,
  places: useTripStore.getState().places,
  days: useTripStore.getState().days,
  error: useTripStore.getState().error,
  isLoading: useTripStore.getState().isLoading,
  assignments: useTripStore.getState().assignments,
});
fixture.transitions = [];
useTripStore.subscribe((next, before) => {
  const fields = [
    'trip',
    'days',
    'places',
    'assignments',
    'dayNotes',
    'packingItems',
    'todoItems',
    'budgetItems',
    'reservations',
    'files',
    'tags',
    'categories',
  ];
  const changed = fields.filter((key) => next[key] !== before[key]);
  if (changed.length || next.error !== before.error)
    fixture.transitions.push({ changed, error: next.error, trip: next.trip?.id ?? null, loading: next.isLoading });
});
fixture.permission = () => ({
  allowed: useFamilyUiPermissions.getState().controller?.isCurrent?.() ?? false,
  layer: useFamilyUiPermissions.getState().controller?.gov.layer,
});
fixture.draft = () => useFamilyUiPermissions.getState().controller?.gov.setLayer('myDraft');
fixture.readAncillary = async () => {
  const get = async (path) => (await api.get(path)).data;
  return Object.fromEntries(
    await Promise.all(
      [
        'packing',
        'todo',
        'budget',
        'files',
        'members',
        'budget/settlement',
        'docsync/status',
        'tour-draft',
        'tours',
        'accommodations',
      ].map(async (suffix) => [suffix, await get(`/trips/${nativeTrip}/${suffix}`)])
    )
  );
};
fixture.availability = () =>
  Object.fromEntries(
    [
      'place_edit',
      'day_edit',
      'reservation_edit',
      'packing_edit',
      'todo_edit',
      'budget_edit',
      'file_upload',
      'file_edit',
      'file_delete',
      'trip_edit',
      'trip_delete',
    ].map((action) => [action, familyCanDo(action, useFamilyUiPermissions.getState().controller)])
  );
fixture.queue = () => offlineDb.mutationQueue.toArray();
fixture.taskExercise = async () => {
  const store = useTripStore.getState(),
    first = store.todoItems[0];
  await store.toggleTodoItem(nativeTrip, first.id, true, first);
  const rows = useTripStore.getState().todoItems;
  await store.reorderTodoItems(nativeTrip, rows.map((r) => r.id).reverse(), rows);
  const target = useTripStore.getState().todoItems[0];
  await useTripStore.getState().deleteTodoItem(nativeTrip, target.id, cohort.tasks.bind(target));
  const page = await cohort.tasks.trashPage();
  await cohort.tasks.restore(page.tasks[0]);
  return { items: useTripStore.getState().todoItems, queue: await offlineDb.mutationQueue.toArray() };
};
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

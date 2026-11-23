import axios from 'axios';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, vi } from 'vitest';
import api from '../../../src/api/client';
import { createFamilyApplicationHandler } from '../../../src/integrations/family/applicationHandler';
import { plannerCacheDb } from '../../../src/integrations/family/plannerCache';
import type { CalendarChange } from '../../../src/integrations/family/plannerCalendarContract';
import { createFamilyPlannerCohort } from '../../../src/integrations/family/plannerCohort';
import { FamilyFrontendRepository } from '../../../src/integrations/family/repository';
import { createFamilyAxiosAdapter } from '../../../src/integrations/family/transport';
import { useTripStore } from '../../../src/store/tripStore';
import { setAuthed } from '../../../src/sync/authGate';
import { mutationQueue } from '../../../src/sync/mutationQueue';
import { _resetNetworkMode } from '../../../src/sync/networkMode';
import { canonicalPackingList } from '../familyPacking';
import { server } from '../msw/server';
import { resetOfflineTestDatabase } from '../offlineDb';
import { seedPlaceFormStores } from '../placeFormSetup';
import { cleanup } from '../render';
import { resetAllStores } from '../store';
import { fakeArrangementOutcome } from './arrangementOutcome';
import { fakeCalendar, fakeDayInsertion, fakeDayOrder, fakeDayRemoval } from './calendar';
import { fakeDayContents } from './contents';
import { initializeBoundary, poolContext, required, savePool, snapshot, visitRecord } from './core';
import { fakeArrangement, fakeCreation, fakeCreationReceipt } from './planning';
import {
  arrangementReceipts,
  arrangementRemoved,
  at,
  attachedFiles,
  attachmentHistory,
  bookingHistory,
  calendarResults,
  cohortState,
  contentHistory,
  contentNotes,
  creationReceipts,
  dayOrderHistory,
  db,
  errors,
  family,
  insertionHistory,
  location,
  original,
  receipts,
  removalHistory,
  toast,
  trip,
  uuid,
} from './state';

beforeEach(async () => {
  server.use(http.get('*/api/health', () => HttpResponse.json({ status: 'ok' })));
  resetAllStores();
  seedPlaceFormStores();
  await resetOfflineTestDatabase();
  localStorage.clear();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  cohortState.published = {
    id: location,
    trip_id: trip,
    revision: 1,
    deleted_at: null,
    source: { kind: 'food', id: uuid(4) },
    source_archived: false,
    name: 'Actual cafe',
    description: 'Shared catalog description',
    notes: null,
    latitude: 19.05,
    longitude: -98.2,
    is_located: true,
    address: 'Cafe street 7',
    website: 'https://cafe.example',
    phone: null,
    context_place_id: uuid(5),
    context_place_name: 'Puebla',
    country_id: uuid(6),
    country_name: 'Mexico',
    country_code: 'MX',
    time_zone: 'America/Mexico_City',
    source_type_label: null,
    cover_media_id: null,
    category: null,
    overrides: {},
    created_at: at,
    updated_at: at,
  };
  cohortState.session = {
    userId: uuid(90),
    familyId: family,
    personId: uuid(91),
    user: { username: 'Fixture', email: 'fixture@example.invalid', avatar_url: null, created_at: at },
  };
  cohortState.repo = new FamilyFrontendRepository(async () => cohortState.session);
  cohortState.bookingRows = [];
  bookingHistory.clear();
  cohortState.privateValues = null;
  cohortState.publishedVisit = visitRecord();
  cohortState.repeatVisit = { ...visitRecord(), id: uuid(9), explanations: 'Independent repeat note' };
  cohortState.extras = {};
  cohortState.taskRows = [];
  cohortState.draftIndex = 0;
  cohortState.loseAck = false;
  cohortState.switchScope = false;
  cohortState.deny = null;
  receipts.clear();
  insertionHistory.clear();
  removalHistory.clear();
  contentHistory.clear();
  attachedFiles.splice(0);
  attachmentHistory.clear();
  contentNotes.length = 0;
  cohortState.contentGuard = null;
  dayOrderHistory.clear();
  cohortState.calendarData = null;
  calendarResults.clear();
  toast.error.mockClear();
  cohortState.arrangementExtraDays = [];
  cohortState.arrangementPrivate = null;
  arrangementReceipts.clear();
  arrangementRemoved.clear();
  cohortState.creationRows = [];
  cohortState.creationOps = [];
  creationReceipts.clear();
  db.rpc.mockReset();
  initializeBoundary();
  await cohortState.repo.session();
  const baseRpc = required(db.rpc.getMockImplementation());
  const editorReceipts = new Map<string, { hash: string; result: unknown }>();
  db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (/^get_family_trip_(location|visit)_form_receipt_v1$/.test(name)) {
      if (cohortState.deny) return { data: null, error: cohortState.deny };
      const kind = name.includes('_location_') ? 'location' : 'visit',
        id = String(args.p_operation_id),
        prior = editorReceipts.get(id),
        saved = prior ?? receipts.get(id),
        hash = JSON.stringify([args.p_observation, args.p_form]);
      if (saved && saved.hash !== hash) return { data: null, error: { code: 'PT409' } };
      return {
        data: {
          version: 1,
          kind,
          trip_id: args.p_trip_id,
          target_id: args[kind === 'location' ? 'p_location_id' : 'p_visit_id'],
          operation_id: id,
          observation: args.p_observation,
          form: args.p_form,
          request_sha256: 'a'.repeat(64),
          status: saved ? 'committed' : 'unknown',
          result: saved?.result ?? null,
        },
        error: null,
      };
    }
    if (name === 'save_family_trip_location_form_v1' || name === 'save_family_trip_visit_form_v1') {
      if (cohortState.deny) return { data: null, error: cohortState.deny };
      const id = String(args.p_operation_id),
        hash = JSON.stringify([args.p_observation, args.p_form]),
        prior = editorReceipts.get(id);
      if (prior)
        return prior.hash === hash ? { data: prior.result, error: null } : { data: null, error: { code: '40001' } };
      const response = name === 'save_family_trip_location_form_v1' ? savePool(args) : await baseRpc(name, args);
      if (response.data && !response.error) editorReceipts.set(id, { hash, result: structuredClone(response.data) });
      if (name === 'save_family_trip_location_form_v1' && cohortState.loseAck && response.data && !response.error) {
        cohortState.loseAck = false;
        return { data: null, error: { code: '08006' } };
      }
      return response;
    }

    if (name === 'get_family_trip_packing_v1')
      return {
        data: canonicalPackingList(
          {
            trip_id: trip,
            family_id: family,
            user_id: cohortState.session.userId,
            person_id: cohortState.session.personId,
          },
          true
        ),
        error: null,
      };
    if (name === 'get_family_trip_tasks_v1')
      return {
        data: {
          version: 1,
          scope: {
            version: 1,
            trip_id: trip,
            family_id: family,
            user_id: cohortState.session.userId,
            person_id: cohortState.session.personId,
            layer: 'published',
            trip_lifecycle_revision: 0,
          },
          collection_revision: 0,
          tasks: structuredClone(cohortState.taskRows),
          trash_count: 0,
        },
        error: null,
      };
    if (name === 'get_family_trip_booking_view_v1') {
      const state = snapshot(cohortState.repo.getLayer(trip)).state;
      return {
        data: {
          version: 1,
          trip_id: trip,
          family_id: family,
          user_id: cohortState.session.userId,
          person_id: cohortState.session.personId,
          trip_revision: state.trip_revision,
          days: state.days.map((d) => ({
            id: d.id,
            revision: 'revision' in d ? d.revision : 1,
            civil_day: d.civil_day,
            day_index: d.day_index,
            title: d.title,
          })),
          bookings: cohortState.bookingRows.map((row) => ({
            ...row,
            visit_state:
              row.record.schedule_item_id && arrangementRemoved.has(row.record.schedule_item_id)
                ? 'retained'
                : row.visit_state,
          })),
        },
        error: null,
      };
    }
    if (name === 'get_family_trip_calendar_v1')
      return {
        data: {
          version: 1,
          trip_id: trip,
          family_id: family,
          user_id: cohortState.session.userId,
          person_id: cohortState.session.personId,
          observation: cohortState.calendarData,
        },
        error: null,
      };
    if (name === 'revise_family_trip_calendar_v1')
      return ['trash_day', 'restore_day'].includes((args.p_change as CalendarChange).action)
        ? fakeDayContents(args)
        : ['remove_day', 'restore_removed_day'].includes((args.p_change as CalendarChange).action)
          ? fakeDayRemoval(args)
          : ['insert', 'undo_insert'].includes((args.p_change as CalendarChange).action)
            ? fakeDayInsertion(args)
            : ['reorder', 'restore_order'].includes((args.p_change as CalendarChange).action)
              ? fakeDayOrder(args)
              : fakeCalendar(args);
    if (name === 'get_family_native_arrangement_receipt_v1') return fakeArrangementOutcome(args);
    if (name === 'arrange_family_native_visits_v1') return fakeArrangement(args);
    if (name === 'get_family_native_plan_receipt_v1') {
      if (cohortState.deny) return { data: null, error: cohortState.deny };
      const saved = creationReceipts.get(String(args.p_operation_id));
      if (saved && saved.hash !== JSON.stringify([args.p_form, args.p_scope]))
        return { data: null, error: { code: 'PT409' } };
      return {
        data: {
          version: 1,
          trip_id: args.p_trip_id,
          operation_id: args.p_operation_id,
          scope: args.p_scope,
          status: saved ? 'committed' : 'unknown',
          result: saved?.result ?? null,
        },
        error: null,
      };
    }
    if (name === 'get_family_native_plan_receipt_v1') return fakeCreationReceipt(args);
    if (name === 'create_family_native_plan_v1') return fakeCreation(args);
    if (name === 'get_family_trip_planner_view_v1')
      return { data: snapshot(String(args.p_layer)), error: null, status: 200 };
    if (name === 'get_family_trip_location_form_v1')
      return { data: poolContext(args.p_layer as 'published' | 'myDraft'), error: null, status: 200 };
    if (name === 'save_family_trip_location_form_v1') return savePool(args);
    return baseRpc(name, args);
  });
  vi.spyOn(cohortState.repo.readers.trips, 'fetchTripById').mockResolvedValue({
    id: trip,
    family_id: family,
    title: 'Mexico fixture',
    description: null,
    start_date: '2027-04-01',
    end_date: '2027-04-01',
    cover_image: null,
    is_archived: 0,
    currency: 'MXN',
    reminder_days: 0,
    status: 'planned',
  });
  vi.spyOn(cohortState.repo, 'categories').mockResolvedValue({ categories: [] });
  vi.spyOn(cohortState.repo, 'core').mockRejectedValue(new Error('Legacy planner core must not be used'));
  cohortState.readonlyFailure = false;
  cohortState.malformed = false;
  cohortState.source = 'https://fixture.supabase.invalid';
  cohortState.privateKind = 'visit';
  const app = createFamilyApplicationHandler(cohortState.repo);
  cohortState.cohort = createFamilyPlannerCohort(cohortState.repo, {
    source: () => cohortState.source,
    reportError: errors,
    application: async (request) => {
      if (request.method === 'GET') {
        if (request.pathname === '/tags') return cohortState.malformed ? { tags: 'bad shape' } : { tags: [] };
        if (request.pathname === '/health') return { status: 'ok' };
        if (/\/(packing|todo|budget)$/.test(request.pathname)) {
          if (cohortState.readonlyFailure) throw new Error('Required tab read failed');
          return { items: cohortState.extras[request.pathname.split('/').pop() ?? ''] ?? [] };
        }
        if (request.pathname.endsWith('/files') && attachedFiles.length) return app(request);
        if (/\/(files|reservations|members)$/.test(request.pathname))
          return {
            [request.pathname.split('/').pop() ?? '']:
              cohortState.extras[request.pathname.split('/').pop() ?? ''] ?? [],
          };
      }
      return app(request);
    },
  });
  const adapter = createFamilyAxiosAdapter(cohortState.cohort.handle);
  api.defaults.adapter = adapter;
  cohortState.client = axios.create({ adapter });
  cohortState.release = cohortState.cohort.install();
  await plannerCacheDb.snapshots.clear();
  errors.mockClear();
  const nativeLoad = useTripStore.getState().loadTrip;
  vi.spyOn(useTripStore.getState(), 'loadTrip').mockImplementation((value) => {
    cohortState.tripBeforeLoad = useTripStore.getState().trip;
    return nativeLoad(value);
  });
});

afterEach(async () => {
  cleanup();
  if (cohortState.release) cohortState.release();
  api.defaults.adapter = original;
  setAuthed(false);
  _resetNetworkMode();
  await resetOfflineTestDatabase();
  await plannerCacheDb.snapshots.clear();
  vi.restoreAllMocks();
});

import { act, cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { coherentTripData } from '../../../tests/helpers/familyCompleteTripV4';
import { buildPlanner, buildShell } from '../../../tests/helpers/mobileTrip';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { render } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { useDayDetail, writeStay } from '../../components/Planner/useDayDetail';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import MAccommodationSheet from '../../mobile/screens/trip/sheets/MAccommodationSheet';
import { accommodationRepo, FamilyAccommodationUnavailable } from '../../repo/accommodationRepo';
import { installPlannerReadPort } from '../../repo/plannerReadPort';
import { installPlannerStayWritePort } from '../../repo/plannerStayPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import type { Accommodation } from '../../types';
import { nativeStayWriteQualificationEnabled } from './coherentStayQualification';
import { createNativeStayLifecycle } from './nativeStayLifecycle';
import { observeNativeStays } from './nativeStayObservation';
import { nativeStayPatch } from './nativeStayPatch';
import { nativeStayReadiness } from './nativeStayReadiness';
import { createNativeStayWriter } from './nativeStayWriter';
import { createPlannerStayRecovery } from './plannerStayRecovery';
import { familyAuthStore, FamilyFrontendRepository } from './repository';
import { createStayHandler } from './stayHandler';
import { createFamilyAxiosAdapter } from './transport';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), auth: vi.fn(), source: 'http://127.0.0.1:56671' }));
vi.mock('@family/backend/supabase/stayRpc', () => ({
  stayRpc: (...a: unknown[]) => mocks.rpc(...a),
  stayAuthIdentity: () => mocks.auth(),
}));
vi.mock('@family/backend/supabase/nativeStayRpc', () => ({
  nativeStayRpc: (...a: unknown[]) => mocks.rpc(...a),
}));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => mocks.source }));
let core: ReturnType<typeof coherentTripData>['core'],
  repo: FamilyFrontendRepository,
  rows: Accommodation[],
  row: Accommodation,
  placeId: number,
  trip: number,
  sid: string,
  allowed: boolean,
  live: boolean,
  lost: boolean,
  revisionOffset: number,
  lastAck: unknown,
  lastArgs: Record<string, unknown>,
  generation: number;
const disposers: (() => void)[] = [];
const previous = api.defaults.adapter;
const beforeFamily = familyAuthStore.getState();
const hydrate = vi.fn();
function installObservation() {
  observeNativeStays(rows, core, async () => {
    if (!live) throw Error('Original observation ended');
  });
}
const saves = () => mocks.rpc.mock.calls.filter(([n]) => n === 'save_family_stay_v1');
beforeEach(async () => {
  resetAllStores();
  _resetNetworkMode();
  setAuthed(true);
  installTestLocks();
  core = coherentTripData().core;
  sid = crypto.randomUUID();
  allowed = true;
  live = true;
  lost = false;
  revisionOffset = 0;
  lastAck = null;
  generation = 1;
  mocks.source = 'http://127.0.0.1:56671';
  vi.stubEnv('VITE_FAMILY_STAY_READ_QUALIFICATION', 'local-v4');
  vi.stubEnv('VITE_FAMILY_STAY_WRITE_QUALIFICATION', 'local-existing-v1');
  repo = new FamilyFrontendRepository(
    async () => ({
      userId: core.user_id,
      familyId: core.family_id,
      personId: core.person_id,
      user: { username: 'Unit stay', email: 'unit@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
    }),
    undefined,
    () => ({ userId: core.user_id, familyId: core.family_id, personId: core.person_id, source: mocks.source })
  );
  await repo.session();
  const ids = (await repo.views()).ids;
  trip = ids.register('trip', core.trip_id);
  const person = ids.register('person', core.person_id);
  await reopenForUser(person);
  await resetOfflineTestDatabase();
  const n = nativeStayReadiness(core, ids);
  if (n.status !== 'ready') throw Error('Native fixture required');
  rows = n.accommodations;
  const observed = rows[0];
  if (!observed || observed.place_id == null) throw Error('A native stay with a saved place is required');
  row = observed;
  placeId = observed.place_id;
  installObservation();
  useTripStore.setState({
    trip: { id: trip } as never,
    days: core.days.map((d) => ({
      id: ids.register('day', d.id),
      trip_id: trip,
      date: d.civil_day,
      day_number: d.day_index,
    })) as never,
  });
  useAuthStore.setState({
    user: buildUser({ id: person }),
    isAuthenticated: true,
    isLoading: false,
    authCheckFailed: false,
    loggingOut: false,
  });
  familyAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    authUserId: core.user_id,
    familyId: core.family_id,
    personId: core.person_id,
    authGate: 'ok',
    authCheckFailed: false,
  });
  mocks.auth.mockReset().mockImplementation(async () => ({ user_id: core.user_id, session_id: sid }));
  mocks.rpc.mockReset().mockImplementation(async (name: string, args: Record<string, unknown>) => {
    const scope = {
      version: 1,
      layer: 'published',
      trip_id: core.trip_id,
      family_id: core.family_id,
      user_id: core.user_id,
      person_id: core.person_id,
      session_id: sid,
    };
    if (name === 'get_family_stay_command_context_v1')
      return {
        version: 1,
        scope,
        state: 'active',
        observation: {
          trip_revision: core.trip_revision + revisionOffset,
          stay: core.stays[0],
          candidate_location: core.planner.state.locations.find((l) => l.id === args.p_location_id),
          candidate_booking: null,
        },
        admission: { save: allowed, link: false, trash: false, restore: false },
        native_controls: false,
      };
    if (name === 'save_family_stay_v1') {
      lastArgs = structuredClone(args);
      lastAck = {
        version: 1,
        state: 'published',
        acknowledgement: true,
        read_current_required: true,
        trip_id: core.trip_id,
        stay_id: core.stays[0].stay.id,
        operation_id: args.p_operation_id,
        action: 'edit',
        changed: true,
        stay_revision_after: core.stays[0].stay.revision + 1,
        trip_revision_after: core.trip_revision + 1,
        event_sequence: 1,
        recorded_at: '2026-11-13T12:00:00Z',
      };
      if (lost) {
        lost = false;
        throw Error('Lost response');
      }
      return lastAck;
    }
    if (name === 'get_family_stay_command_outcome_v1' || name === 'cancel_family_stay_command_v1')
      return {
        version: 1,
        trip_id: core.trip_id,
        stay_id: args.p_stay_id,
        operation_id: args.p_operation_id,
        current_scope: scope,
        original_session_id: (args.p_scope as { session_id: string }).session_id,
        status: lastAck ? 'committed' : name.startsWith('cancel_') ? 'cancelled' : 'unknown',
        acknowledgement: lastAck,
        cancelled_at: !lastAck && name.startsWith('cancel_') ? '2026-11-13T12:00:00Z' : null,
      };
    throw Error('Unexpected RPC ' + name);
  });
  api.defaults.adapter = createFamilyAxiosAdapter(createStayHandler(repo, () => mocks.source));
  hydrate.mockReset().mockImplementation(async () => {
    rows = [{ ...row, notes: (lastArgs?.p_changes as { notes?: string })?.notes ?? row.notes }];
    generation++;
  });
  disposers.push(
    installPlannerReadPort({
      places: async () => ({ places: [] }),
      days: async () => ({ days: [] }),
      stays: async () => ({ accommodations: rows, reservations: [], generation: String(generation) }),
      currentStays: () => ({ accommodations: rows, reservations: [], generation: String(generation) }),
    }),
    installPlannerStayWritePort(
      createNativeStayWriter(repo, { source: () => mocks.source, disposed: () => !live, hydrate })
    ),
    installFamilyCommandRetention()
  );
});
afterEach(async () => {
  cleanup();
  for (const f of disposers.splice(0).reverse()) f();
  api.defaults.adapter = previous;
  setAuthed(false);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  _resetNetworkMode();
  familyAuthStore.setState(beforeFamily, true);
  await resetOfflineTestDatabase();
  await reopenAnonymous();
});
function qualifiedLifecycle() {
  mocks.source = 'http://127.0.0.1:57171';
  vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
  vi.stubEnv('VITE_FAMILY_STAY_CONTROLS_QUALIFICATION', 'local-native-v1');
  return createNativeStayLifecycle(repo, {
    source: () => mocks.source,
    disposed: () => !live,
    allowed: () => allowed,
    confirmCurrent: hydrate,
  });
}

it.each(['save', 'trash'] as const)(
  'keeps the captured lodging identity when a detached row changes during %s',
  async (action) => {
    const lifecycle = qualifiedLifecycle();
    const ids = (await repo.views()).ids;
    const selected = row;
    const id = selected.id;
    rows = structuredClone(rows);
    installObservation();
    const stop = new Error('Stop after observing the read-only context request');
    mocks.rpc.mockRejectedValue(stop);

    const pending =
      action === 'save'
        ? lifecycle.update(trip, id, { notes: 'Original stay' }, selected)
        : lifecycle.trash(trip, id, false, selected);
    selected.id = ids.register('stay', crypto.randomUUID());

    await expect(pending).rejects.toBe(stop);
    expect(mocks.rpc.mock.calls).toEqual([
      ['get_family_stay_command_context_v1', expect.objectContaining({ p_stay_id: core.stays[0].stay.id })],
    ]);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  }
);

it('keeps the captured Trash lodging identity when the displayed row changes during restore', async () => {
  const lifecycle = qualifiedLifecycle();
  const { stay, location } = core.stays[0];
  mocks.rpc.mockResolvedValueOnce({
    format: 'family.stay-trash.v1',
    trip_id: core.trip_id,
    items: [
      {
        id: stay.id,
        revision: stay.revision,
        arrival_date: stay.arrival_date,
        departure_date: stay.departure_date,
        deleted_at: '2026-11-18T00:00:00Z',
        name: location.name,
        restore_available: true,
      },
    ],
    has_more: false,
    next_cursor: null,
  });
  const [selected] = (await lifecycle.trashPage(trip)).items;
  const stop = new Error('Stop after observing the read-only context request');
  mocks.rpc.mockClear().mockRejectedValue(stop);

  const pending = lifecycle.restore(trip, selected);
  selected.id = crypto.randomUUID();

  await expect(pending).rejects.toBe(stop);
  expect(mocks.rpc.mock.calls).toEqual([
    ['get_family_stay_command_context_v1', expect.objectContaining({ p_stay_id: stay.id })],
  ]);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});

it('maps date-only, explicit midnight and clear without changing linked booking or inherited zone', async () => {
  const before = structuredClone(core.stays[0].booking);
  const r = await accommodationRepo.update(
    trip,
    row.id,
    { check_in: '00:00', check_out: null, notes: 'Private visit note' },
    row
  );
  expect(saves()).toHaveLength(1);
  expect(lastArgs.p_changes).toEqual({ check_in_time: '00:00', check_out_time: null, notes: 'Private visit note' });
  expect(lastArgs.p_changes).not.toHaveProperty('time_zone');
  expect(core.stays[0].booking).toEqual(before);
  expect(r.accommodation).toBe(rows[0]);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
  expect(hydrate).toHaveBeenCalledOnce();
});
it('coalesces double submit with one operation, including a lost reply retry', async () => {
  lost = true;
  await expect(accommodationRepo.update(trip, row.id, { notes: 'same' }, row)).rejects.toThrow();
  const queued = (await offlineDb.mutationQueue.toArray())[0];
  await Promise.all([
    accommodationRepo.update(trip, row.id, { notes: 'same' }, row),
    accommodationRepo.update(trip, row.id, { notes: 'same' }, row),
  ]);
  expect(new Set(saves().map(([, a]) => a.p_operation_id))).toEqual(new Set([queued.id]));
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it('offline retains exact intent, generic replay refuses it, then original retry confirms', async () => {
  setForcedOffline(true);
  await expect(accommodationRepo.update(trip, row.id, { notes: 'offline' }, row)).rejects.toThrow();
  const old = await offlineDb.mutationQueue.toArray();
  expect(old).toHaveLength(1);
  setForcedOffline(false);
  await mutationQueue.flush();
  expect(saves()).toHaveLength(0);
  expect(await offlineDb.mutationQueue.toArray()).toEqual(old);
  await accommodationRepo.update(trip, row.id, { notes: 'offline' }, row);
  expect(saves()[0][1].p_operation_id).toBe(old[0].id);
});
it('changed body cannot replace an unresolved original', async () => {
  lost = true;
  await expect(accommodationRepo.update(trip, row.id, { notes: 'first' }, row)).rejects.toThrow();
  const old = await offlineDb.mutationQueue.toArray();
  await expect(accommodationRepo.update(trip, row.id, { notes: 'second' }, row)).rejects.toThrow('original retained');
  expect(await offlineDb.mutationQueue.toArray()).toEqual(old);
});
it.each(['permission', 'revision', 'background', 'foreign', 'missing'] as const)(
  'refuses %s before mutation',
  async (kind) => {
    if (kind === 'permission') allowed = false;
    if (kind === 'revision') revisionOffset = 1;
    if (kind === 'background') rows = [{ ...row }];
    if (kind === 'foreign') core.trip_id = crypto.randomUUID();
    await expect(
      accommodationRepo.update(trip, row.id, { notes: 'never' }, kind === 'missing' ? undefined : row)
    ).rejects.toThrow();
    expect(saves()).toHaveLength(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  }
);
it.each([
  { confirmation: 'Different' },
  { check_in: '22:00', check_in_end: '02:00' },
  { check_in: '12:00:30' },
  { unknown: true },
  { start_day_id: -1 },
])('refuses lossy/unsupported native body %j', async (body) => {
  await expect(accommodationRepo.update(trip, row.id, body as never, row)).rejects.toThrow();
  expect(saves()).toHaveLength(0);
});
it('creation and deletion stay gated', async () => {
  await expect(
    accommodationRepo.create(trip, {
      place_id: placeId,
      start_day_id: row.start_day_id,
      end_day_id: row.end_day_id,
    })
  ).rejects.toBeInstanceOf(FamilyAccommodationUnavailable);
  await expect(accommodationRepo.delete(trip, row.id)).rejects.toBeInstanceOf(FamilyAccommodationUnavailable);
  expect(saves()).toHaveLength(0);
});
it('confirmed save with failed hydration retries the read, not the mutation', async () => {
  hydrate.mockRejectedValueOnce(Error('Read failed'));
  await expect(accommodationRepo.update(trip, row.id, { notes: 'confirmed' }, row)).rejects.toThrow();
  await accommodationRepo.update(trip, row.id, { notes: 'confirmed' }, row);
  expect(saves()).toHaveLength(1);
});
it('recovery checks a committed lost response without needing the native snapshot', async () => {
  lost = true;
  await expect(accommodationRepo.update(trip, row.id, { notes: 'recover' }, row)).rejects.toThrow();
  rows = [];
  const recovery = createPlannerStayRecovery(repo, core.trip_id, { source: () => mocks.source, current: () => true });
  const r = await recovery.inspect();
  expect(r?.domain).toBe('stay');
  expect(await r?.check()).toBe('committed');
  expect(saves()).toHaveLength(1);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it('fresh login can cancel unknown intent but cannot rebind its write', async () => {
  setForcedOffline(true);
  await expect(accommodationRepo.update(trip, row.id, { notes: 'old session' }, row)).rejects.toThrow();
  setForcedOffline(false);
  sid = crypto.randomUUID();
  await expect(accommodationRepo.update(trip, row.id, { notes: 'old session' }, row)).rejects.toThrow();
  const r = await createPlannerStayRecovery(repo, core.trip_id, {
    source: () => mocks.source,
    current: () => true,
  }).inspect();
  expect(r?.intent).toBe('cancel-command');
  expect(await r?.check()).toBe('unknown');
  expect(await r?.retry()).toBe('cancelled');
  expect(saves()).toHaveLength(0);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it('recovery refuses a modified queue row', async () => {
  setForcedOffline(true);
  await expect(accommodationRepo.update(trip, row.id, { notes: 'held' }, row)).rejects.toThrow();
  setForcedOffline(false);
  const r = await createPlannerStayRecovery(repo, core.trip_id, {
    source: () => mocks.source,
    current: () => true,
  }).inspect();
  const q = (await offlineDb.mutationQueue.toArray())[0];
  await offlineDb.mutationQueue.update(q.id, { attempts: 1 });
  await expect(r?.retry()).rejects.toThrow();
  expect(await offlineDb.mutationQueue.count()).toBe(1);
});
it('desktop hook keeps the editor-opening observation when a newer row replaces current data', async () => {
  const days = useTripStore.getState().days;
  const hook = renderHook(() => useDayDetail(days[0], days, trip, null, null, 'en'));
  await waitFor(() => expect(hook.result.current.accommodation).not.toBeNull());
  act(() => {
    hook.result.current.beginStayEdit(row);
    hook.result.current.setHotelForm({
      place_id: placeId,
      check_in: '',
      check_in_end: '',
      check_out: '',
      confirmation: row.confirmation ?? '',
    });
    hook.result.current.setHotelDayRange({ start: row.start_day_id, end: row.end_day_id });
    hook.result.current.setShowHotelPicker('edit');
  });
  core.stays[0].stay.notes = 'Refreshed lodging details';
  core.stays[0].stay.revision++;
  core.trip_revision++;
  rows = [{ ...row, notes: core.stays[0].stay.notes }];
  generation++;
  installObservation();
  const update = vi.spyOn(accommodationRepo, 'update');
  await expect(act(async () => hook.result.current.handleUpdateAccommodation())).rejects.toMatchObject({
    code: 'native_stay_edit_unavailable',
    message: 'The stay changed since this editor opened. Reopen it before saving.',
  });
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0][3]).toBe(row);
  expect(saves()).toHaveLength(0);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it('native writeStay uses the original lodging and dates and returns the current canonical row', async () => {
  const original = core.stays[0].stay;
  const { accommodation } = await writeStay(
    trip,
    row.id,
    {
      place_id: placeId,
      start_day_id: row.start_day_id,
      end_day_id: row.end_day_id,
      check_in: null,
      check_out: null,
    },
    row
  );
  expect(accommodation).toBe(rows[0]);
  expect(saves()).toHaveLength(1);
  expect(lastArgs.p_stay_id).toBe(original.id);
  expect(lastArgs.p_changes).toEqual({
    location_id: original.location_id,
    arrival_date: original.arrival_date,
    departure_date: original.departure_date,
    check_in_time: null,
    check_out_time: null,
  });
});
it('writer qualification is exact and never accepts hosted sources', () => {
  expect(nativeStayWriteQualificationEnabled()).toBe(true);
  mocks.source = 'https://example.supabase.invalid';
  expect(nativeStayWriteQualificationEnabled()).toBe(false);
  mocks.source = 'http://127.0.0.1:56571';
  expect(nativeStayWriteQualificationEnabled()).toBe(false);
});
it('optional named zone stays inherited, and omitted notes are not cleared', async () => {
  core.stays[0].stay.time_zone = 'America/Mexico_City';
  const p = nativeStayPatch({ check_in: '00:00' }, row, core, (await repo.views()).ids);
  expect(p).toEqual({ check_in_time: '00:00' });
});

it('staged imports refuse before retaining or sending a new stay mutation', async () => {
  await offlineDb.importFiles.put({
    jobId: 'pending-import',
    fileName: 'synthetic.txt',
    createdAt: Date.now(),
  } as never);
  await expect(accommodationRepo.update(trip, row.id, { notes: 'held' }, row)).rejects.toThrow('imports');
  expect(saves()).toHaveLength(0);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it('a delayed context cannot retain intent after its source changes', async () => {
  const run = mocks.rpc.getMockImplementation();
  if (!run) throw Error('Missing mock RPC');
  mocks.rpc.mockImplementation(async (name, args) => {
    const result = await run(name, args);
    if (name === 'get_family_stay_command_context_v1') mocks.source = 'http://127.0.0.1:59999';
    return result;
  });
  await expect(accommodationRepo.update(trip, row.id, { notes: 'obsolete' }, row)).rejects.toThrow();
  expect(saves()).toHaveLength(0);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});

it('clones the native body before any asynchronous context work', async () => {
  const body = { notes: 'Original draft' };
  const request = accommodationRepo.update(trip, row.id, body, row);
  body.notes = 'Borrowed mutation';
  await request;
  expect(lastArgs.p_changes).toEqual({ notes: 'Original draft' });
});
it('mutating a borrowed native observation cannot change the original facts', async () => {
  row.notes = 'Borrowed row mutation';
  await expect(accommodationRepo.update(trip, row.id, { notes: 'Save' }, row)).rejects.toThrow();
  expect(saves()).toHaveLength(0);
});

it('actual phone editor saves through the qualified native writer with its original observation', async () => {
  const planner = buildPlanner({
    tripId: trip,
    trip: useTripStore.getState().trip,
    days: useTripStore.getState().days,
    tripAccommodations: rows,
  });
  const shell = buildShell({ sheet: { id: 'accommodation', payload: { accId: row.id, dayId: row.start_day_id } } });
  const update = vi.spyOn(accommodationRepo, 'update');
  render(<MAccommodationSheet planner={planner} shell={shell} />);
  fireEvent.change(screen.getByPlaceholderText('14:00'), { target: { value: '14:40' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(update.mock.calls[0][3]).toBe(row);
  await expect(update.mock.results[0].value).resolves.toMatchObject({ accommodation: { id: row.id } });
  await waitFor(() => expect(shell.openSheet).toHaveBeenCalled());
  expect(saves()).toHaveLength(1);
});

it('desktop removal remains refused until a reachable native stay restore path is available', async () => {
  const days = useTripStore.getState().days;
  await offlineDb.accommodations.put(row);
  const original = await offlineDb.accommodations.get(row.id);
  const network = vi.spyOn(api, 'delete');
  const hook = renderHook(() => useDayDetail(days[0], days, trip, null, null, 'en'));
  await waitFor(() => expect(hook.result.current.accommodation).not.toBeNull());
  await expect(hook.result.current.handleRemoveAccommodation(row)).rejects.toThrow('not connected');
  expect(await offlineDb.accommodations.get(row.id)).toEqual(original);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
  expect(network).not.toHaveBeenCalled();
  await expect(accommodationRepo.delete(trip, row.id, { keepStop: true })).rejects.toThrow();
  expect(saves()).toHaveLength(0);
});
it('the actual phone stay editor exposes edit controls but has no native Trash, restore or Undo action', () => {
  const planner = buildPlanner({
    tripId: trip,
    trip: useTripStore.getState().trip,
    days: useTripStore.getState().days,
    tripAccommodations: rows,
  });
  const shell = buildShell({ sheet: { id: 'accommodation', payload: { accId: row.id, dayId: row.start_day_id } } });
  render(<MAccommodationSheet planner={planner} shell={shell} />);
  expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /remove|delete|trash|restore|undo/i })).not.toBeInTheDocument();
});

import 'fake-indexeddb/auto';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { act, cleanup, renderHook } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { reservationFieldsFrom } from '../../components/Planner/reservationFormModel';
import { useReservationForm } from '../../components/Planner/useReservationForm';
import { offlineDb } from '../../db/offlineDb';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import type { BookingDetailPacket } from './bookingDetailsContract';
import { asReservationMetadata } from './legacy/data/supabase/tripReservations';
import { bookingJson, nativeBookingBaseline } from './nativeBookingDetails';
import { openObservedBookingEditor } from './observedBookingEditor';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';
const boundary = vi.hoisted(() => ({ rpc: vi.fn(), source: 'https://fixture.supabase.invalid' }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => boundary.source }));
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, locale: 'en' }) }));
const uuid = (n: number) => `d0410000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1),
  booking = uuid(2),
  options = { accommodations: [], places: [], withCheckInEnd: true };
const originalAdapter = api.defaults.adapter;
let repo: FamilyFrontendRepository,
  session: FamilySession,
  current: ReturnType<typeof state>,
  saved: Map<string, unknown>;
function state() {
  return {
    record: {
      id: booking,
      trip_id: trip,
      type: 'restaurant',
      title: 'Repeat cafe',
      status: 'confirmed',
      starts_at: null as string | null,
      ends_at: null as string | null,
      start_trip_day_id: null,
      end_trip_day_id: null,
      confirmation_code: 'REF-1',
      notes: 'Personal',
      url: null,
      place_id: null,
      hotel_id: null,
      schedule_item_id: null,
      metadata: { price: 25, currency: 'MXN', keep: true },
      sort_order: 0,
      created_at: '2026-01-01T00:00:00+00:00',
    },
    dates: {
      reservation_id: booking,
      trip_id: trip,
      revision: 1,
      start_date: '2027-04-08',
      end_date: null as string | null,
      start_day_id: null,
      end_day_id: null,
    },
  };
}
async function native() {
  const r = current.record,
    views = await repo.views();
  return {
    ...views.reservation({
      id: r.id,
      tripId: r.trip_id,
      type: 'restaurant',
      title: r.title,
      status: 'confirmed',
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      startTripDayId: null,
      endTripDayId: null,
      confirmationCode: r.confirmation_code,
      notes: r.notes,
      url: r.url,
      placeId: null,
      hotelId: null,
      scheduleItemId: null,
      metadata: asReservationMetadata(r.metadata),
      sortOrder: 0,
      createdAt: r.created_at,
    }),
    reservation_time: r.starts_at ?? current.dates.start_date,
    reservation_end_time: r.ends_at ?? current.dates.end_date,
    family_booking_snapshot: structuredClone(current),
  };
}
async function open() {
  return openObservedBookingEditor(repo, trip, await native(), options);
}
function saves() {
  return boundary.rpc.mock.calls.filter(([name]) => name === 'save_family_booking_details_v1');
}
beforeEach(async () => {
  cleanup();
  resetAllStores();
  await resetOfflineTestDatabase();
  localStorage.clear();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  server.use(http.get('*/api/health', () => HttpResponse.json({ status: 'ok' })));
  boundary.source = 'https://fixture.supabase.invalid';
  boundary.rpc.mockReset();
  current = state();
  saved = new Map();
  session = {
    userId: uuid(3),
    familyId: uuid(4),
    personId: uuid(5),
    user: { username: 'Fixture', email: 'form@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(async () => session);
  (await repo.views()).ids.register('trip', trip);
  api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(repo));
  boundary.rpc.mockImplementation(async (name, args) => {
    if (name === 'get_family_booking_details_v1')
      return {
        data: {
          version: 1,
          trip_id: trip,
          family_id: session.familyId,
          user_id: session.userId,
          person_id: session.personId,
          observation: structuredClone(current),
        },
        error: null,
      };
    if (name !== 'save_family_booking_details_v1') throw new Error('Legacy fallback ' + name);
    if (!saved.has(args.p_operation_id)) {
      if (bookingJson(args.p_observation) !== bookingJson(current))
        return { data: null, error: { code: 'PT409', message: 'Stale original form' } };
      Object.assign(
        current.record,
        Object.fromEntries(Object.entries(args.p_changes).filter(([key]) => key !== 'dates'))
      );
      if (args.p_changes.dates)
        current.dates = { ...current.dates, ...args.p_changes.dates, revision: current.dates.revision + 1 };
      saved.set(args.p_operation_id, {
        version: 1,
        state: 'published',
        trip_id: trip,
        reservation_id: booking,
        operation_id: args.p_operation_id,
        changed: Object.keys(args.p_changes).length > 0,
        dates: structuredClone(current.dates),
      });
    }
    return { data: structuredClone(saved.get(args.p_operation_id)), error: null };
  });
});
afterEach(async () => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  setAuthed(false);
  _resetNetworkMode();
  await resetOfflineTestDatabase();
});
describe('observed native booking form through actual application/Axios/IndexedDB', () => {
  it('real shared form hook emits date-only and empty metadata; observed Save sends only intentional notes', async () => {
    const original = await native(),
      editor = await openObservedBookingEditor(repo, trip, original, options);
    const { result } = renderHook(() => useReservationForm(reservationFieldsFrom(original, [], [], true), [], []));
    expect(result.current.saveData({ assignmentId: '', isEdit: true, withCheckInEnd: true })).toMatchObject({
      reservation_time: '2027-04-08',
      metadata: {},
    });
    act(() => result.current.set('notes', 'Updated personal note'));
    await editor.save(result.current.saveData({ assignmentId: '', isEdit: true, withCheckInEnd: true }), []);
    expect(saves()[0][1].p_changes).toEqual({ notes: 'Updated personal note' });
    expect(current.record.metadata).toEqual({ price: 25, currency: 'MXN', keep: true });
    expect(current.record.starts_at).toBeNull();
  });
  it('real form untouched Save does not erase off-calendar dates or freeze metadata', async () => {
    const original = await native(),
      editor = await open();
    const { result } = renderHook(() => useReservationForm(reservationFieldsFrom(original, [], [], true), [], []));
    await editor.save(result.current.saveData({ assignmentId: '', isEdit: true, withCheckInEnd: true }), []);
    expect(saves()[0][1].p_changes).toEqual({});
    expect(current.dates.start_date).toBe('2027-04-08');
  });
  it('real date picker edit saves a civil date without starts_at', async () => {
    const original = await native(),
      editor = await open();
    const { result } = renderHook(() => useReservationForm(reservationFieldsFrom(original, [], [], true), [], []));
    act(() => result.current.setStartDate('2027-04-09'));
    await editor.save(result.current.saveData({ assignmentId: '', isEdit: true, withCheckInEnd: true }), []);
    expect(saves()[0][1].p_changes).toEqual({ dates: { start_date: '2027-04-09', end_date: null } });
    expect(JSON.stringify(saves())).not.toContain('2027-04-09T00:00');
  });
  it('real clock picker change refuses the entire notes/date save before RPC', async () => {
    const original = await native(),
      editor = await open();
    const { result } = renderHook(() => useReservationForm(reservationFieldsFrom(original, [], [], true), [], []));
    act(() => {
      result.current.set('notes', 'No partial');
      result.current.setStartTime('19:00', '2027-04-08');
    });
    await expect(
      editor.save(result.current.saveData({ assignmentId: '', isEdit: true, withCheckInEnd: true }), [])
    ).rejects.toThrow('timezone');
    expect(saves()).toHaveLength(0);
  });
  it('minute-truncated native unchanged timestamp preserves genuine midnight and microseconds', async () => {
    current.record.starts_at = '2027-04-08T00:00:00.123456+00:00';
    current.record.ends_at = '2027-04-08T01:15:00.654321+00:00';
    const original = await native(),
      editor = await open();
    const { result } = renderHook(() => useReservationForm(reservationFieldsFrom(original, [], [], true), [], []));
    act(() => result.current.set('notes', 'Clock stays'));
    await editor.save(result.current.saveData({ assignmentId: '', isEdit: true, withCheckInEnd: true }), []);
    expect(saves()[0][1].p_changes).toEqual({ notes: 'Clock stays' });
    expect(current.record.starts_at).toContain('.123456');
  });
  it('hotel shared form hides timestamps without clearing a confirmed booking on notes Save', async () => {
    current.record.type = 'hotel';
    current.record.starts_at = '2027-04-08T00:00:00.123456+00:00';
    const original = await native();
    original.type = 'hotel';
    const editor = await openObservedBookingEditor(repo, trip, original, options),
      { result } = renderHook(() => useReservationForm(reservationFieldsFrom(original, [], [], true), [], []));
    act(() => result.current.set('notes', 'Hotel notes'));
    const data = result.current.saveData({ assignmentId: '', isEdit: true, withCheckInEnd: true });
    expect(data.reservation_time).toBeNull();
    await editor.save(data, []);
    expect(saves()[0][1].p_changes).toEqual({ notes: 'Hotel notes' });
    expect(current.record.starts_at).toContain('.123456');
  });
  it('phone shared form leaves the desktop check-in window metadata intact', async () => {
    current.record.type = 'hotel';
    Object.assign(current.record.metadata, { check_in_time: '14:00', check_in_end_time: '22:00' });
    const original = await native();
    original.type = 'hotel';
    const editor = await openObservedBookingEditor(repo, trip, original, { ...options, withCheckInEnd: false }),
      { result } = renderHook(() => useReservationForm(reservationFieldsFrom(original, [], [], false), [], []));
    act(() => result.current.set('notes', 'Phone notes'));
    await editor.save(result.current.saveData({ assignmentId: '', isEdit: true, withCheckInEnd: false }), []);
    expect(saves()[0][1].p_changes).toEqual({ notes: 'Phone notes' });
    expect(current.record.metadata).toMatchObject({ check_in_end_time: '22:00', price: 25 });
  });
  it('explicit clearing of a date-only start sends null; omitted end remains unchanged', async () => {
    const editor = await open();
    await editor.save({ ...editor.baseline, reservation_time: null }, []);
    expect(saves()[0][1].p_changes).toEqual({ dates: { start_date: null, end_date: null } });
  });
  it('changing a confirmed time to a date or null refuses rather than deleting the appointment', async () => {
    current.record.starts_at = '2027-04-08T19:00:00+00:00';
    const editor = await open();
    await expect(editor.save({ ...editor.baseline, reservation_time: null }, [])).rejects.toThrow('timezone');
    expect(saves()).toHaveLength(0);
  });
  it.each([
    'metadata',
    'place_id',
    'assignment_id',
    'accommodation_id',
    'type',
    'location',
    'endpoints',
    'create_accommodation',
    'create_budget_entry',
  ])('changed companion %s refuses the entire Save', async (field) => {
    const editor = await open();
    await expect(
      editor.save({ ...editor.baseline, notes: 'No partial', [field]: { changed: true } }, [])
    ).rejects.toThrow('No partial');
    expect(saves()).toHaveLength(0);
  });
  it.each(['travelers', 'files', 'cost'])('explicit %s companion intent refuses before any Save', async (effect) => {
    const editor = await open();
    await expect(editor.save({ ...editor.baseline, notes: 'No partial' }, [effect])).rejects.toThrow('coordinated');
    expect(saves()).toHaveLength(0);
  });
  it('blank optional text means explicit clear; unchanged blanks mean no field write', async () => {
    const editor = await open();
    await editor.save({ ...editor.baseline, notes: '', confirmation_number: '' }, []);
    expect(saves()[0][1].p_changes).toEqual({ notes: null, confirmation_code: null });
  });
  it('lost acknowledgement reuses exact observation and operation', async () => {
    const editor = await open(),
      impl = boundary.rpc.getMockImplementation();
    boundary.rpc.mockImplementationOnce(async (...args) => {
      await impl?.(...args);
      throw new TypeError('Lost reply');
    });
    const data = { ...editor.baseline, notes: 'Retry once' };
    await expect(editor.save(data, [])).rejects.toThrow('Lost reply');
    await editor.save(data, []);
    expect(saves()[0]).toEqual(saves()[1]);
    expect(saved.size).toBe(1);
  });
  it('an uncertain Save cannot silently be replaced with different intent', async () => {
    const editor = await open();
    boundary.rpc.mockRejectedValueOnce(new TypeError('Lost reply'));
    await expect(editor.save({ ...editor.baseline, notes: 'First' }, [])).rejects.toThrow();
    await expect(editor.save({ ...editor.baseline, notes: 'Second' }, [])).rejects.toThrow('original booking save');
    expect(saves()).toHaveLength(1);
  });
  it('stale displayed source cannot be silently rebased when opening a form', async () => {
    const original = await native();
    current.record.notes = 'Other writer';
    await expect(openObservedBookingEditor(repo, trip, original, options)).rejects.toThrow('stale');
    expect(saves()).toHaveLength(0);
  });
  it('later independent edits refuse the original form save', async () => {
    const editor = await open();
    current.record.notes = 'Later';
    await expect(editor.save({ ...editor.baseline, notes: 'Old' }, [])).rejects.toMatchObject({
      response: { status: 409 },
    });
    expect(current.record.notes).toBe('Later');
  });
  it('historical acknowledgement never overwrites newer native cache state', async () => {
    const editor = await open(),
      data = { ...editor.baseline, notes: 'First' };
    await editor.save(data, []);
    current.record.notes = 'Later';
    const invalidate = vi.spyOn(repo, 'invalidate');
    await editor.save(data, []);
    expect(current.record.notes).toBe('Later');
    expect(invalidate).toHaveBeenCalledWith(trip);
  });
  it.each(['account', 'source', 'layer', 'close'])('original %s fence refuses before saving', async (kind) => {
    const editor = await open();
    if (kind === 'account') {
      session = { ...session, userId: uuid(90) };
      repo.acceptSession(session);
    }
    if (kind === 'source') boundary.source = 'https://other.supabase.invalid';
    if (kind === 'layer') repo.setLayer(trip, 'myDraft');
    if (kind === 'close') editor.close();
    await expect(editor.save({ ...editor.baseline, notes: 'Wrong scope' }, [])).rejects.toThrow();
    expect(saves()).toHaveLength(0);
  });
  it('late identity registry replacement refuses acknowledgement without invalidation', async () => {
    const editor = await open(),
      impl = boundary.rpc.getMockImplementation(),
      invalidate = vi.spyOn(repo, 'invalidate');
    boundary.rpc.mockImplementationOnce(async (...args) => {
      const answer = await impl?.(...args);
      repo.clear();
      return answer;
    });
    await expect(editor.save({ ...editor.baseline, notes: 'Late' }, [])).rejects.toMatchObject({
      response: { status: 409 },
    });
    expect(saved.size).toBe(1);
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('ordinary HTTP handler replays a prepared packet from actual IndexedDB queue after editor disposal', async () => {
    const editor = await open(),
      command = await editor.prepare({ ...editor.baseline, notes: 'Queued original' }, []);
    editor.close();
    await mutationQueue.enqueue({
      id: command.packet.operation_id,
      tripId: (await repo.views()).ids.register('trip', trip),
      method: 'POST',
      url: command.url,
      body: command.packet,
    });
    await mutationQueue.flush();
    expect(current.record.notes).toBe('Queued original');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(saves()[0][1].p_operation_id).toBe(command.packet.operation_id);
  });
  it('foreign queued source parks original payload without an RPC or re-signing', async () => {
    const editor = await open(),
      command = await editor.prepare({ ...editor.baseline, notes: 'Queued' }, []);
    editor.close();
    command.packet.source_url = 'https://foreign.supabase.invalid';
    await mutationQueue.enqueue({
      id: command.packet.operation_id,
      tripId: (await repo.views()).ids.register('trip', trip),
      method: 'POST',
      url: command.url,
      body: command.packet,
    });
    await mutationQueue.flush();
    const row = await offlineDb.mutationQueue.get(command.packet.operation_id);
    expect(row?.body).toEqual(command.packet);
    expect(saves()).toHaveLength(0);
  });
  it('older raw booking queue work is preserved and blocks opening a new edit', async () => {
    await mutationQueue.enqueue({
      id: uuid(99),
      tripId: (await repo.views()).ids.register('trip', trip),
      method: 'PUT',
      url: `/trips/${trip}/reservations/8`,
      body: { notes: 'Old' },
    });
    await expect(open()).rejects.toThrow('Older booking');
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it('offline open refuses without producing an empty successful context', async () => {
    setForcedOffline(true);
    await expect(open()).rejects.toThrow('online');
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it('unsupported query or malformed packet never falls through to legacy writers', async () => {
    const editor = await open(),
      command = await editor.prepare(editor.baseline, []);
    boundary.rpc.mockClear();
    await expect(api.post(command.url + '?partial=1', command.packet)).rejects.toMatchObject({
      response: { status: 405 },
    });
    await expect(api.post(command.url, { ...command.packet, changes: { metadata: {} } })).rejects.toThrow();
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it('foreign successful acknowledgement refuses before cache invalidation', async () => {
    const editor = await open(),
      impl = boundary.rpc.getMockImplementation(),
      invalidate = vi.spyOn(repo, 'invalidate');
    boundary.rpc.mockImplementationOnce(async (...args) => {
      const answer = await impl?.(...args);
      return { ...answer, data: { ...answer?.data, reservation_id: uuid(90) } };
    });
    await expect(editor.save({ ...editor.baseline, notes: 'X' }, [])).rejects.toMatchObject({
      response: { status: 502 },
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('incomplete native form refuses instead of silently omitting fields', async () => {
    const editor = await open();
    await expect(editor.save({ title: 'Partial' }, [])).rejects.toThrow('complete');
    expect(saves()).toHaveLength(0);
  });
  it('invalid native nullable text refuses rather than converting a number to null', async () => {
    const editor = await open();
    await expect(editor.save({ ...editor.baseline, notes: 0 }, [])).rejects.toThrow('text');
    expect(saves()).toHaveLength(0);
  });
  it('packet preparation exposes original typed scope and no accidental timestamp or metadata patch', async () => {
    const editor = await open(),
      command = await editor.prepare({ ...editor.baseline, title: 'Updated' }, []),
      p: BookingDetailPacket = command.packet;
    expect(p.scope).toMatchObject({
      trip_id: trip,
      user_id: session.userId,
      person_id: session.personId,
      layer: 'published',
    });
    expect(p.changes).toEqual({ title: 'Updated' });
    expect(p.observation.record.metadata.keep).toBe(true);
  });
  it('object key order in a canonical observation is not a false version conflict', async () => {
    const original = await native();
    original.family_booking_snapshot = {
      ...original.family_booking_snapshot,
      record: Object.fromEntries(Object.entries(current.record).reverse()) as typeof current.record,
    };
    const editor = await openObservedBookingEditor(repo, trip, original, options);
    await editor.save(nativeBookingBaseline(original, options), []);
    expect(saves()).toHaveLength(1);
  });
});

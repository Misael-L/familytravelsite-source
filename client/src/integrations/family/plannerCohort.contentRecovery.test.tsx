// organize-imports-ignore
// sort-imports-ignore
// Initialize the original hoisted SDK mocks before loading suite consumers.
import '../../../tests/helpers/familyPlannerCohort/state';
import { fileLinksResponseSchema, tripFilesResponseSchema } from '@trek/shared';
import axios from 'axios';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { calendarCalls } from '../../../tests/helpers/familyPlannerCohort/calendar';
import {
  bookingFixture,
  contentSetup,
  fileLinks,
  fileSetup,
  installBookingDetailBoundary,
} from '../../../tests/helpers/familyPlannerCohort/contents';
import { load, required } from '../../../tests/helpers/familyPlannerCohort/core';
import { removalHook } from '../../../tests/helpers/familyPlannerCohort/formActions';
import { NativeBookingCohortForm } from '../../../tests/helpers/familyPlannerCohort/forms';
import '../../../tests/helpers/familyPlannerCohort/setup';
import {
  arrangementRemoved,
  at,
  attachedFiles,
  attachmentHistory,
  cohortState,
  contentHistory,
  contentNotes,
  day,
  db,
  trip,
  uuid,
  visit,
} from '../../../tests/helpers/familyPlannerCohort/state';
import { act, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import api from '../../api/client';
import BookingDetailHost from '../../components/Planner/bookings/BookingDetailHost';
import { offlineDb } from '../../db/offlineDb';
import { currentPlannerBookingPort } from '../../repo/plannerBookingPort';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { createFamilyApplicationHandler } from './applicationHandler';
import { createPlannerBookingHandler, createPlannerBookingReader } from './plannerBookings';
import type { CalendarChange } from './plannerCalendarContract';
import { createPlannerViewReader } from './plannerView';
import { createFamilyAxiosAdapter } from './transport';

describe('P04m native visit and note aggregate retention', () => {
  it('actual native confirmation retains populated-day children and exact Undo restores their original identities', async () => {
    const v = await contentSetup(),
      h = removalHook(),
      before = structuredClone({
        assignments: useTripStore.getState().assignments,
        notes: useTripStore.getState().dayNotes,
        places: useTripStore.getState().places,
      });
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days.slice(1));
    expect(Object.values(useTripStore.getState().assignments).flat()).toHaveLength(0);
    expect(contentNotes.map((n) => n.id)).toEqual([uuid(9101)]);
    expect(useTripStore.getState().places).toEqual(before.places);
    expect(h.result.current.history.canUndo).toBe(true);
    expect(calendarCalls()[0][1].p_change.action).toBe('trash_day');
    await act(async () => {
      expect(await h.result.current.history.undo()).toBe(true);
    });
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    expect(useTripStore.getState().assignments).toEqual(before.assignments);
    expect(useTripStore.getState().dayNotes).toEqual(before.notes);
    expect(calendarCalls()[1][1].p_change.action).toBe('restore_day');
  });
  it('a visit already independently removed stays removed after day recovery', async () => {
    const v = await contentSetup();
    arrangementRemoved.add(cohortState.repeatVisit.id);
    await load();
    const h = removalHook(),
      before = structuredClone(useTripStore.getState().assignments);
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    await act(async () => h.result.current.confirmDeleteDay());
    await act(async () => {
      await h.result.current.history.undo();
    });
    expect(arrangementRemoved.has(cohortState.repeatVisit.id)).toBe(true);
    expect(arrangementRemoved.has(visit)).toBe(false);
    expect(useTripStore.getState().assignments).toEqual(before);
  });
  it('surviving-day notes follow the surviving UUID rather than appearing as the removed day note', async () => {
    const v = await contentSetup(),
      out = await cohortState.cohort.calendar.trashDay(v.trip, v.days[0]);
    expect(contentNotes).toHaveLength(1);
    expect(contentNotes[0].body).toBe('Other day note');
    expect(contentNotes[0].civil_day).toBe('2027-04-01');
    expect(useTripStore.getState().dayNotes[v.days[1]]).toHaveLength(1);
    await out.undo();
    expect(contentNotes.find((n) => n.id === uuid(9101))?.civil_day).toBe('2027-04-02');
    expect(contentNotes.find((n) => n.id === uuid(9100))?.body).toContain('Original **family**');
  });
  it('legacy removal remains guarded while the explicit aggregate command supports visits', async () => {
    const v = await contentSetup();
    await expect(cohortState.cohort.calendar.remove(v.trip, v.days[0])).rejects.toThrow();
    await load();
    const out = await cohortState.cohort.calendar.trashDay(v.trip, v.days[0]);
    await out.undo();
    expect(contentNotes).toHaveLength(2);
  });
  it.each(['armed-file', 'booking-permission', 'pending'] as const)(
    'protected %s leave the real native store and history intact',
    async (guard) => {
      const v = await contentSetup(),
        h = removalHook(),
        before = structuredClone({
          days: useTripStore.getState().days,
          visits: useTripStore.getState().assignments,
          notes: useTripStore.getState().dayNotes,
        });
      cohortState.contentGuard = guard;
      act(() => h.result.current.handleDeleteDay(v.days[0]));
      await act(async () => h.result.current.confirmDeleteDay());
      expect({
        days: useTripStore.getState().days,
        visits: useTripStore.getState().assignments,
        notes: useTripStore.getState().dayNotes,
      }).toEqual(before);
      expect(h.removed).not.toHaveBeenCalled();
      expect(h.result.current.history.canUndo).toBe(false);
      expect(contentHistory.size).toBe(0);
    }
  );
  it('lost aggregate acknowledgement retains children once and retries the original packet', async () => {
    const v = await contentSetup(),
      h = removalHook();
    cohortState.loseAck = true;
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(contentHistory.size).toBe(1);
    expect(h.removed).not.toHaveBeenCalled();
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(calendarCalls()[1][1]).toEqual(calendarCalls()[0][1]);
    expect(contentNotes).toHaveLength(1);
    await act(async () => {
      await h.result.current.history.undo();
    });
    expect(contentNotes).toHaveLength(2);
  });
  it('lost aggregate recovery acknowledgement is retained by actual native history', async () => {
    const v = await contentSetup(),
      h = removalHook();
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    await act(async () => h.result.current.confirmDeleteDay());
    cohortState.loseAck = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      expect(await h.result.current.history.undo()).toBe(false);
    });
    expect(h.result.current.history.canUndo).toBe(true);
    await act(async () => {
      expect(await h.result.current.history.undo()).toBe(true);
    });
    expect(calendarCalls()[2][1]).toEqual(calendarCalls()[1][1]);
    expect(contentNotes).toHaveLength(2);
  });
  it('later edits refuse aggregate recovery without replacing retained children', async () => {
    const v = await contentSetup(),
      out = await cohortState.cohort.calendar.trashDay(v.trip, v.days[0]);
    await cohortState.cohort.calendar.rename(v.trip, v.days[1], 'Later name');
    await expect(out.undo()).rejects.toThrow();
    expect(contentHistory.size).toBe(1);
    expect(contentNotes).toHaveLength(1);
    expect(arrangementRemoved.has(visit)).toBe(true);
  });
  it.each(['trash_day', 'restore_day'] as const)(
    'forged %s identities are rejected while the original request remains retryable',
    async (action) => {
      const v = await contentSetup(),
        impl = required(db.rpc.getMockImplementation());
      let bad = true;
      db.rpc.mockImplementation(async (name, args) => {
        const a = await impl(name, args);
        if (name === 'revise_family_trip_calendar_v1' && (args.p_change as CalendarChange).action === action && bad) {
          bad = false;
          return {
            ...a,
            data: { ...a.data, [action === 'trash_day' ? 'removed_day_id' : 'restored_day_id']: uuid(999) },
          };
        }
        return a;
      });
      if (action === 'trash_day') {
        await expect(cohortState.cohort.calendar.trashDay(v.trip, v.days[0])).rejects.toThrow();
        await cohortState.cohort.calendar.trashDay(v.trip, v.days[0]);
        expect(calendarCalls()[1][1]).toEqual(calendarCalls()[0][1]);
      } else {
        const out = await cohortState.cohort.calendar.trashDay(v.trip, v.days[0]);
        await expect(out.undo()).rejects.toThrow();
        await out.undo();
        expect(calendarCalls()[2][1]).toEqual(calendarCalls()[1][1]);
      }
    }
  );
  it('queued aggregate commands replay through the actual ordinary HTTP handler without a selected cohort', async () => {
    const v = await contentSetup();
    cohortState.bookingRows = [bookingFixture({ start_trip_day_id: v.order[2] })];
    const beforeBooking = structuredClone(cohortState.bookingRows[0]),
      p = (await cohortState.cohort.calendar.prepare(v.trip, { action: 'trash_day', day_id: v.order[0] })).packet;
    cohortState.release();
    api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(cohortState.repo));
    setAuthed(true);
    await mutationQueue.enqueue({
      id: p.operation_id,
      tripId: Number(v.trip),
      resource: 'days',
      entityId: Number(v.trip),
      method: 'POST',
      url: '/trips/' + trip + '/family/calendar',
      body: p,
    });
    await mutationQueue.flush();
    expect(cohortState.bookingRows[0].dates.start_date).toBe('2027-04-03');
    expect(cohortState.bookingRows[0].dates.start_day_id).toBeNull();
    expect(arrangementRemoved.has(visit)).toBe(true);
    expect(contentNotes).toHaveLength(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    const restore = {
      ...p,
      operation_id: uuid(9200),
      observation: structuredClone(required(cohortState.calendarData)),
      change: { action: 'restore_day' as const, day_id: v.order[0], operation_id: p.operation_id },
    };
    await mutationQueue.enqueue({
      id: restore.operation_id,
      tripId: Number(v.trip),
      resource: 'days',
      entityId: Number(v.trip),
      method: 'POST',
      url: '/trips/' + trip + '/family/calendar',
      body: restore,
    });
    await mutationQueue.flush();
    expect(cohortState.bookingRows[0]).toEqual(beforeBooking);
    expect(arrangementRemoved.has(visit)).toBe(false);
    expect(contentNotes).toHaveLength(2);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('foreign aggregate queued scope is parked intact before RPC', async () => {
    const v = await contentSetup(),
      p = (await cohortState.cohort.calendar.prepare(v.trip, { action: 'trash_day', day_id: v.order[0] })).packet;
    p.source_url = 'https://foreign.supabase.invalid';
    cohortState.release();
    api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(cohortState.repo));
    setAuthed(true);
    await mutationQueue.enqueue({
      id: p.operation_id,
      tripId: Number(v.trip),
      resource: 'days',
      entityId: Number(v.trip),
      method: 'POST',
      url: '/trips/' + trip + '/family/calendar',
      body: p,
    });
    await mutationQueue.flush();
    expect(calendarCalls()).toHaveLength(0);
    expect((await offlineDb.mutationQueue.get(p.operation_id))?.body).toEqual(p);
    expect(contentNotes).toHaveLength(2);
  });
  it('a non-retriable aggregate database conflict is HTTP 409 and leaves native content untouched', async () => {
    const v = await contentSetup(),
      p = (await cohortState.cohort.calendar.prepare(v.trip, { action: 'trash_day', day_id: v.order[0] })).packet;
    cohortState.deny = { code: 'PT409' };
    await expect(
      api.post('/trips/' + trip + '/family/calendar', p, {
        headers: { 'X-Idempotency-Key': p.operation_id },
      })
    ).rejects.toMatchObject({ response: { status: 409 } });
    expect(calendarCalls()).toHaveLength(1);
    expect(contentNotes).toHaveLength(2);
    expect(contentHistory.size).toBe(0);
    expect(arrangementRemoved.has(visit)).toBe(false);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('an extra cascade/purge field is rejected by the real HTTP contract before RPC', async () => {
    const v = await contentSetup(),
      p = (await cohortState.cohort.calendar.prepare(v.trip, { action: 'trash_day', day_id: v.order[0] })).packet;
    await expect(
      api.post(
        '/trips/' + trip + '/family/calendar',
        { ...p, change: { ...p.change, purge: true } },
        { headers: { 'X-Idempotency-Key': p.operation_id } }
      )
    ).rejects.toThrow();
    expect(calendarCalls()).toHaveLength(0);
  });
});

describe('P04n native day attachment recovery through real file and calendar coordinators', () => {
  it('native confirmation and actual Undo retain the document and restore original day attachment identities', async () => {
    const v = await fileSetup(),
      h = removalHook(),
      before = await fileLinks(v.nativeFile);
    tripFilesResponseSchema.parse((await cohortState.client.get('/trips/' + trip + '/files')).data);
    fileLinksResponseSchema.parse(
      (await cohortState.client.get('/trips/' + trip + '/files/' + v.nativeFile + '/links')).data
    );
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    expect(h.result.current.deleteDayLines.map((l) => l.text).join(' ')).toContain('Linked documents stay in Files');
    await act(async () => h.result.current.confirmDeleteDay());
    expect(await fileLinks(v.nativeFile)).toEqual([before[1]]);
    expect(useTripStore.getState().files).toHaveLength(1);
    expect(useTripStore.getState().files[0].original_name).toBe('Original document.txt');
    await act(async () => {
      expect(await h.result.current.history.undo()).toBe(true);
    });
    expect(await fileLinks(v.nativeFile)).toHaveLength(before.length);
    expect(await fileLinks(v.nativeFile)).toEqual(expect.arrayContaining(before));
    expect(useTripStore.getState().files).toHaveLength(1);
  });
  it('explicit file open resolves the same original path through actual HTTP after day removal', async () => {
    const v = await fileSetup();
    await cohortState.cohort.calendar.trashDay(v.trip, v.days[0]);
    const reply = await cohortState.client.get('/family/files/' + v.nativeFile + '/open');
    expect(await (reply.data as Response).text()).toBe('original bytes');
    expect(v.signed).toHaveBeenCalledWith(v.path, 120);
    expect(v.path).not.toContain('/render/image/');
  });
  it('a previously trashed document is not resurrected by recovery', async () => {
    const v = await fileSetup();
    attachedFiles[0].deletedAt = at;
    cohortState.repo.invalidate(trip);
    await load();
    const out = await cohortState.cohort.calendar.trashDay(v.trip, v.days[0]);
    await out.undo();
    expect(attachedFiles[0].deletedAt).toBe(at);
    expect(useTripStore.getState().files).toHaveLength(0);
    expect((await cohortState.repo.fileList(trip, true)).files).toHaveLength(1);
  });
  it('lost removal acknowledgement retains attachment links once and retries the same original request', async () => {
    const v = await fileSetup(),
      h = removalHook();
    cohortState.loseAck = true;
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(attachedFiles[0].links).toHaveLength(1);
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(calendarCalls()[1][1]).toEqual(calendarCalls()[0][1]);
    expect(attachmentHistory.size).toBe(1);
    await act(async () => {
      expect(await h.result.current.history.undo()).toBe(true);
    });
    expect(attachedFiles[0].links).toHaveLength(2);
  });
  it('lost restoration acknowledgement stays retryable in actual native history without duplicating attachments', async () => {
    const v = await fileSetup(),
      h = removalHook();
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    await act(async () => h.result.current.confirmDeleteDay());
    cohortState.loseAck = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      expect(await h.result.current.history.undo()).toBe(false);
    });
    expect(h.result.current.history.canUndo).toBe(true);
    await act(async () => {
      expect(await h.result.current.history.undo()).toBe(true);
    });
    expect(calendarCalls()[2][1]).toEqual(calendarCalls()[1][1]);
    expect(await fileLinks(v.nativeFile)).toHaveLength(2);
  });
  it.each(['file-permission', 'armed-file'] as const)(
    '%s refusal leaves the native calendar, document and links intact',
    async (guard) => {
      const v = await fileSetup(),
        h = removalHook(),
        before = structuredClone(useTripStore.getState().days),
        links = await fileLinks(v.nativeFile);
      cohortState.contentGuard = guard;
      act(() => h.result.current.handleDeleteDay(v.days[0]));
      await act(async () => h.result.current.confirmDeleteDay());
      expect(useTripStore.getState().days).toEqual(before);
      expect(await fileLinks(v.nativeFile)).toEqual(links);
      expect(h.removed).not.toHaveBeenCalled();
      expect(h.result.current.history.canUndo).toBe(false);
      expect(attachmentHistory.size).toBe(0);
    }
  );
  it('ordinary IndexedDB replay after cohort release removes and restores attachments through the real handlers', async () => {
    const v = await fileSetup(),
      before = await fileLinks(v.nativeFile),
      p = (await cohortState.cohort.calendar.prepare(v.trip, { action: 'trash_day', day_id: v.order[0] })).packet;
    cohortState.release();
    api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(cohortState.repo));
    setAuthed(true);
    await mutationQueue.enqueue({
      id: p.operation_id,
      tripId: Number(v.trip),
      resource: 'days',
      entityId: Number(v.trip),
      method: 'POST',
      url: '/trips/' + trip + '/family/calendar',
      body: p,
    });
    await mutationQueue.flush();
    expect(attachedFiles[0].links).toHaveLength(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    const restore = {
      ...p,
      operation_id: uuid(9499),
      observation: structuredClone(required(cohortState.calendarData)),
      change: { action: 'restore_day' as const, day_id: v.order[0], operation_id: p.operation_id },
    };
    await mutationQueue.enqueue({
      id: restore.operation_id,
      tripId: Number(v.trip),
      resource: 'days',
      entityId: Number(v.trip),
      method: 'POST',
      url: '/trips/' + trip + '/family/calendar',
      body: restore,
    });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    const after = (await api.get('/trips/' + trip + '/files/' + v.nativeFile + '/links')).data.links;
    expect(after).toHaveLength(before.length);
    expect(after).toEqual(expect.arrayContaining(before));
  });
  it('later independent document edits refuse exact Undo and preserve the later data', async () => {
    const v = await fileSetup(),
      out = await cohortState.cohort.calendar.trashDay(v.trip, v.days[0]);
    attachedFiles[0].description = 'Later private document edit';
    required(cohortState.calendarData).trip_revision++;
    cohortState.repo.invalidate(trip);
    await expect(out.undo()).rejects.toThrow();
    expect(attachedFiles[0].description).toBe('Later private document edit');
    expect(attachedFiles[0].links).toHaveLength(1);
  });
});

describe('P04p booking reader through real native planner/history/HTTP consumers', () => {
  it('native removal and Undo preserve the booking and render an outside-calendar date without midnight', async () => {
    const v = await contentSetup();
    cohortState.bookingRows = [
      bookingFixture({ type: 'hotel', start_trip_day_id: required(cohortState.calendarData).days[2].id }),
    ];
    await load();
    const original = structuredClone(cohortState.bookingRows[0]),
      h = removalHook();
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(h.result.current.history.canUndo).toBe(true);
    const state = useTripStore.getState(),
      b = state.reservations[0];
    expect(b.reservation_time).toBe('2027-04-03');
    expect(b.day_id).toBeNull();
    render(
      <BookingDetailHost
        r={b}
        tripId={required(state.trip).id}
        days={state.days}
        assignments={state.assignments}
        files={[]}
        canEdit={false}
        contributions={[]}
        onClose={() => {}}
        onDelete={() => {}}
        onNavigateToFiles={() => {}}
      />
    );
    expect(screen.getAllByText(/Apr 3|3 Apr/).length).toBeGreaterThan(0);
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();
    await act(async () => {
      expect(await h.result.current.history.undo()).toBe(true);
    });
    expect(cohortState.bookingRows[0]).toEqual(original);
    expect(useTripStore.getState().reservations[0].day_id).toBe(
      (await cohortState.repo.views()).ids.register('day', required(original.record.start_trip_day_id))
    );
  });
  it('a retained visit relationship stays canonical while the native booking has no dangling assignment', async () => {
    const v = await contentSetup();
    cohortState.bookingRows = [bookingFixture({ schedule_item_id: visit, start_trip_day_id: day })];
    await load();
    const h = removalHook();
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(useTripStore.getState().reservations[0].assignment_id).toBeNull();
    expect(cohortState.bookingRows[0].record.schedule_item_id).toBe(visit);
    await act(async () => {
      expect(await h.result.current.history.undo()).toBe(true);
    });
    expect(useTripStore.getState().reservations[0].assignment_id).toBe(
      (await cohortState.repo.views()).ids.register('assignment', visit)
    );
  });
  it('individual native booking GET uses the new reader and never a cached legacy booking list', async () => {
    await contentSetup();
    cohortState.bookingRows = [bookingFixture()];
    const legacy = vi.spyOn(cohortState.repo, 'reservationList');
    const result = await cohortState.client.get(`/trips/${trip}/reservations`);
    expect(result.data.reservations).toHaveLength(1);
    expect(legacy).not.toHaveBeenCalled();
  });
  it('a mixed booking/calendar revision refuses a native bundle without publishing partial state', async () => {
    const impl = required(db.rpc.getMockImplementation());
    db.rpc.mockImplementation(async (name, args) => {
      const out = await impl(name, args);
      return name === 'get_family_trip_booking_view_v1' ? { ...out, data: { ...out.data, trip_revision: 999 } } : out;
    });
    await expect(load()).rejects.toMatchObject({ code: 'booking_calendar_changed' });
    expect(useTripStore.getState().trip).toBe(cohortState.tripBeforeLoad);
  });
  it('raw native booking writes remain guarded instead of turning a supplied date into midnight', async () => {
    await contentSetup();
    cohortState.bookingRows = [bookingFixture()];
    await load();
    const before = structuredClone(cohortState.bookingRows);
    await expect(
      cohortState.client.put(`/trips/${trip}/reservations/${uuid(9700)}`, { reservation_time: '2027-04-03' })
    ).rejects.toMatchObject({ response: { status: 409 } });
    expect(cohortState.bookingRows).toEqual(before);
    expect(db.rpc.mock.calls.some(([name]) => name === 'set_family_booking_calendar_v1')).toBe(false);
  });
  it('unknown endpoint coordinates are retained canonically without inventing map geometry or the wrong day', async () => {
    await contentSetup();
    const row = bookingFixture({ type: 'flight' });
    row.endpoints = [
      {
        id: uuid(9710),
        reservation_id: row.record.id,
        role: 'from',
        sequence: 0,
        name: 'Airport',
        code: 'FROM',
        airport_id: null,
        place_id: null,
        latitude: null,
        longitude: null,
        time_zone: 'America/Los_Angeles',
        local_date: '2027-03-31',
        local_time: '23:45:00',
      },
    ];
    row.legs = [
      {
        id: uuid(9711),
        reservation_id: row.record.id,
        sequence: 0,
        from_endpoint_id: uuid(9710),
        to_endpoint_id: null,
        carrier_name: 'Carrier',
        service_number: '123',
        platform: null,
        seat: null,
      },
    ];
    cohortState.bookingRows = [row];
    await load();
    const booking = useTripStore.getState().reservations[0];
    expect(booking.endpoints).toEqual([]);
    const meta = JSON.parse(booking.metadata || '{}');
    expect(meta.legs[0].dep_day_id).toBeNull();
    expect(meta.legs[0].from).toBe('FROM');
    expect(cohortState.bookingRows[0].endpoints[0].local_time).toBe('23:45:00');
  });
  it('keeps saved place and leg identities distinct for matching station names and refuses raw edits', async () => {
    await contentSetup();
    const row = bookingFixture({ type: 'train' });
    row.endpoints = (['from', 'to'] as const).map((role, sequence) => ({
      id: uuid(9710 + sequence),
      reservation_id: row.record.id,
      role,
      sequence,
      name: 'Central',
      code: null,
      airport_id: null,
      place_id: uuid(9720 + sequence),
      latitude: 19 + sequence,
      longitude: -99,
      time_zone: null,
      local_date: null,
      local_time: null,
    }));
    row.legs = [
      {
        id: uuid(9730),
        reservation_id: row.record.id,
        sequence: 0,
        from_endpoint_id: row.endpoints[0].id,
        to_endpoint_id: row.endpoints[1].id,
        carrier_name: null,
        service_number: 'TRAIN-7',
        platform: '4',
        seat: '18B',
      },
    ];
    cohortState.bookingRows = [row];

    const { data } = await cohortState.client.get(`/trips/${trip}/reservations`);
    const saved = data.reservations[0];
    expect(saved.family_booking_snapshot.endpoints).toEqual(row.endpoints);
    expect(saved.family_record.endpoints).toMatchObject(
      row.endpoints.map((station) => ({ id: station.id, placeId: station.place_id }))
    );
    expect(saved.family_record.legs).toMatchObject([
      {
        fromEndpointId: row.endpoints[0].id,
        toEndpointId: row.endpoints[1].id,
        serviceNumber: 'TRAIN-7',
        platform: '4',
        seat: '18B',
      },
    ]);

    const before = structuredClone(cohortState.bookingRows);
    const queued = await offlineDb.mutationQueue.count();
    db.rpc.mockClear();
    await expect(
      cohortState.client.put(`/trips/${trip}/reservations/${saved.id}`, { endpoints: [saved.endpoints[1]] })
    ).rejects.toMatchObject({ response: { status: 409, data: { code: 'planner_writer_not_cut_over' } } });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(cohortState.bookingRows).toEqual(before);
    expect(await offlineDb.mutationQueue.count()).toBe(queued);
  });
  it('a foreign endpoint and inconsistent date/day association refuse before native publication', async () => {
    await contentSetup();
    const row = bookingFixture({ start_trip_day_id: day });
    row.dates.start_date = '2027-04-03';
    cohortState.bookingRows = [row];
    await expect(load()).rejects.toMatchObject({ code: 'booking_view_identity' });
  });
});

describe('P04p booking snapshot failure fences', () => {
  it.each(['source', 'account', 'layer'] as const)(
    'late %s change cannot publish a native booking view',
    async (kind) => {
      const impl = required(db.rpc.getMockImplementation());
      db.rpc.mockImplementation(async (name, args) => {
        const result = await impl(name, args);
        if (name === 'get_family_trip_booking_view_v1') {
          if (kind === 'source') cohortState.source = 'https://foreign.supabase.invalid';
          else if (kind === 'account') cohortState.repo.clear();
          else cohortState.repo.setLayer(trip, 'myDraft');
        }
        return result;
      });
      await expect(load()).rejects.toThrow();
      expect(useTripStore.getState().trip).toBe(cohortState.tripBeforeLoad);
    }
  );
  it('a failed required booking snapshot cannot become an empty successful native list', async () => {
    const impl = required(db.rpc.getMockImplementation());
    db.rpc.mockImplementation((name, args) =>
      name === 'get_family_trip_booking_view_v1' ? Promise.reject(new Error('Booking read failed')) : impl(name, args)
    );
    await expect(load()).rejects.toThrow('Booking read failed');
    expect(useTripStore.getState().trip).toBe(cohortState.tripBeforeLoad);
  });
  it('a genuine midnight is kept as an actual instant rather than being classified as date-only', async () => {
    cohortState.bookingRows = [
      bookingFixture({ starts_at: '2027-04-01T00:00:00.123456Z', ends_at: '2027-04-02T00:00:00.654321Z' }),
    ];
    await load();
    const row = useTripStore.getState().reservations[0];
    expect(row.reservation_time).toBe('2027-04-01T00:00:00.123456Z');
    expect(row.reservation_end_time).toBe('2027-04-02T00:00:00.654321Z');
  });
  it('another booking cannot supply an endpoint to a native transport', async () => {
    const row = bookingFixture({ type: 'flight' });
    row.endpoints = [
      {
        id: uuid(9710),
        reservation_id: uuid(9999),
        role: 'from',
        sequence: 0,
        name: 'Foreign',
        code: 'BAD',
        airport_id: null,
        place_id: null,
        latitude: 1,
        longitude: 2,
        time_zone: null,
        local_date: null,
        local_time: null,
      },
    ];
    cohortState.bookingRows = [row];
    await expect(load()).rejects.toMatchObject({ code: 'booking_view_identity' });
    expect(useTripStore.getState().trip).toBe(cohortState.tripBeforeLoad);
  });
});

describe('P04p original booking read invalidation', () => {
  it('an invalidation after the planner read completes cannot publish an older booking reply', async () => {
    const reader = createPlannerViewReader(cohortState.repo, { source: () => cohortState.source });
    try {
      const shown = await reader.read(trip, 'published');
      vi.spyOn(reader, 'read').mockResolvedValue(shown);
      const book = createPlannerBookingReader(
          cohortState.repo,
          () => false,
          () => cohortState.source
        ),
        handle = createPlannerBookingHandler(cohortState.repo, reader, book),
        client = axios.create({ adapter: createFamilyAxiosAdapter(handle) }),
        impl = required(db.rpc.getMockImplementation());
      db.rpc.mockImplementation(async (name, args) => {
        const value = await impl(name, args);
        if (name === 'get_family_trip_booking_view_v1') cohortState.repo.invalidate(trip);
        return value;
      });
      await expect(client.get(`/trips/${trip}/reservations`)).rejects.toMatchObject({ response: { status: 409 } });
    } finally {
      reader.dispose();
    }
  });
});

describe('P04r actual installed native booking port', () => {
  it('native desktop Update saves through the checked command and hydrates the real cohort bundle', async () => {
    await contentSetup();
    cohortState.bookingRows = [bookingFixture()];
    cohortState.bookingRows[0].dates.start_date = '2027-04-08';
    await load();
    const saved = installBookingDetailBoundary(),
      legacy = vi.fn(async () => undefined),
      closed = vi.fn();
    expect(currentPlannerBookingPort()).not.toBeNull();
    render(
      <Routes>
        <Route path="/trips/:id" element={<NativeBookingCohortForm onLegacy={legacy} onClosed={closed} />} />
      </Routes>,
      { initialEntries: ['/trips/' + trip] }
    );
    await screen.findByDisplayValue('Retained booking');
    fireEvent.change(screen.getByPlaceholderText(/notes/i), { target: { value: 'Native saved booking note' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(closed).toHaveBeenCalledOnce());
    expect(legacy).not.toHaveBeenCalled();
    expect(saved.size).toBe(1);
    expect(useTripStore.getState().reservations[0].notes).toBe('Native saved booking note');
    expect(useTripStore.getState().reservations[0].reservation_time).toBe('2027-04-08');
    expect(cohortState.bookingRows[0].record.starts_at).toBeNull();
  });
  it('releasing the cohort removes the native booking port', async () => {
    expect(currentPlannerBookingPort()).not.toBeNull();
    cohortState.release();
    expect(currentPlannerBookingPort()).toBeNull();
  });
});

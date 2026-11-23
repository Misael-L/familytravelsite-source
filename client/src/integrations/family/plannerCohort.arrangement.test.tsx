// organize-imports-ignore
// sort-imports-ignore
// Initialize the original hoisted SDK mocks before loading suite consumers.
import '../../../tests/helpers/familyPlannerCohort/state';
import { describe, expect, it, vi } from 'vitest';
import {
  calendarCalls,
  calendarPacketFor,
  calendarSetup,
  dayOrderSetup,
  postCalendar,
} from '../../../tests/helpers/familyPlannerCohort/calendar';
import { load, required } from '../../../tests/helpers/familyPlannerCohort/core';
import { nativeDayHook } from '../../../tests/helpers/familyPlannerCohort/formActions';
import { assignmentSetup } from '../../../tests/helpers/familyPlannerCohort/planning';
import '../../../tests/helpers/familyPlannerCohort/setup';
import {
  arrangementReceipts,
  arrangementRemoved,
  calendarResults,
  cohortState,
  day,
  dayOrderHistory,
  db,
  errors,
  toast,
  trip,
  uuid,
  visit,
} from '../../../tests/helpers/familyPlannerCohort/state';
import { act, renderHook, waitFor } from '../../../tests/helpers/render';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { useDayClear } from '../../pages/tripPlanner/useDayClear';
import { currentPlannerAssignmentPort, installPlannerAssignmentPort } from '../../repo/plannerAssignmentPort';
import { currentPlannerCalendarPort, installPlannerCalendarPort } from '../../repo/plannerCalendarPort';
import { bindPlannerUndo } from '../../repo/plannerAssignmentPort';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { setForcedOffline } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import type { ArrangementPlan } from './plannerArrangementContract';
import type { CalendarChange, CalendarPacket } from './plannerCalendarContract';
import { createFamilyPlannerCohort } from './plannerCohort';
import { createFamilyAxiosAdapter } from './transport';

describe('P04h native observed assignment arrangement cohort', () => {
  it('failed assignment-port installation unwinds all earlier cohort ports and can retry', () => {
    cohortState.release();
    const blocker = installPlannerAssignmentPort({ execute: async () => ({ state: 'published' }) });
    const other = createFamilyPlannerCohort(cohortState.repo, {
      source: () => cohortState.source,
      reportError: errors,
    });
    expect(() => other.install()).toThrow('A planner assignment port is already installed');
    blocker();
    const done = other.install();
    done();
    expect(currentPlannerAssignmentPort()).toBeNull();
  });

  it('invalid post-commit response retains the original operation for a safe retry', async () => {
    const v = await assignmentSetup(),
      original = required(db.rpc.getMockImplementation());
    let corrupt = true;
    db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      const out = await original(name, args);
      if (name === 'arrange_family_native_visits_v1' && corrupt) {
        corrupt = false;
        return { ...out, data: { ...out.data, result: { ...out.data.result, rows: [] } } };
      }
      return out;
    });
    await expect(useTripStore.getState().removeAssignment(v.trip, v.day, v.a)).rejects.toThrow();
    await useTripStore.getState().removeAssignment(v.trip, v.day, v.a);
    expect(arrangementReceipts.size).toBe(1);
  });
  it('a Family session change during the RPC cannot publish the old completion', async () => {
    const v = await assignmentSetup(),
      before = JSON.stringify(useTripStore.getState().assignments),
      original = required(db.rpc.getMockImplementation());
    db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      const out = await original(name, args);
      if (name === 'arrange_family_native_visits_v1') {
        cohortState.session = { ...cohortState.session, personId: uuid(970) };
        cohortState.repo.acceptSession(cohortState.session);
      }
      return out;
    });
    await expect(useTripStore.getState().removeAssignment(v.trip, v.day, v.a)).rejects.toThrow();
    expect(JSON.stringify(useTripStore.getState().assignments)).toBe(before);
  });
  it('native Clear failure keeps its confirmation and never advertises a false Undo', async () => {
    const v = await assignmentSetup(),
      undo = vi.fn();
    const h = renderHook(() =>
      useDayClear({
        tripId: v.trip,
        days: useTripStore.getState().days,
        canEditDays: true,
        t: (k: string) => k,
        locale: 'en',
        toast,
        roadtripVias: { byDay: {}, reanchor: vi.fn() },
        updateRouteForDay: vi.fn(),
        pushUndo: undo,
      })
    );
    act(() => h.result.current.handleClearDay(v.day));
    cohortState.deny = { code: '42501' };
    await act(async () => h.result.current.confirmClearDay());
    expect(h.result.current.clearDayId).toBe(v.day);
    expect(undo).not.toHaveBeenCalled();
    expect(arrangementRemoved.size).toBe(0);
  });
  it('queued private intent is retained without dispatch after the visible layer changes', async () => {
    const v = await assignmentSetup('myDraft'),
      intent = await cohortState.cohort.assignments.prepare({ action: 'remove', trip: v.trip, day: v.day, visit: v.a });
    cohortState.repo.setLayer(trip, 'published');
    setAuthed(true);
    await mutationQueue.enqueue({
      id: intent.packet.operation_id,
      tripId: v.trip,
      resource: 'assignments',
      entityId: v.a,
      method: 'POST',
      url: '/trips/' + trip + '/family/planner-arrange-command',
      body: intent.packet,
    });
    await mutationQueue.flush();
    expect(arrangementRemoved.size).toBe(0);
    expect(cohortState.arrangementPrivate).toBeNull();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });

  it('native Move and store preserve the occurrence across day save/reload', async () => {
    const v = await assignmentSetup(),
      h = nativeDayHook();
    await act(async () => h.result.current.handleMoveToDay(v.a, v.day, v.next, 0));
    expect(useTripStore.getState().assignments[v.next][0].id).toBe(v.a);
    expect(cohortState.publishedVisit.id).toBe(visit);
    expect(h.reanchor).not.toHaveBeenCalled();
    await load();
    expect(useTripStore.getState().assignments[v.next][0].id).toBe(v.a);
  });
  it('native Remove and Undo restore the same visit without legacy recreate/time writes', async () => {
    const v = await assignmentSetup(),
      h = nativeDayHook();
    await act(async () => h.result.current.handleRemoveAssignment(v.day, v.a));
    expect(useTripStore.getState().assignments[v.day].map((a) => a.id)).toEqual([v.b]);
    expect(h.undo).toHaveBeenCalledTimes(1);
    await act(async () => h.undo.mock.calls[0][1]());
    expect(useTripStore.getState().assignments[v.day].map((a) => a.id)).toEqual([v.a, v.b]);
    expect(cohortState.publishedVisit.id).toBe(visit);
    expect(h.reanchor).not.toHaveBeenCalled();
    expect(cohortState.creationRows).toHaveLength(0);
  });
  it('native Reorder and Undo retain all repeat occurrences', async () => {
    const v = await assignmentSetup(),
      h = nativeDayHook();
    await act(async () => h.result.current.handleReorder(v.day, [v.b, v.a]));
    expect(h.undo).not.toHaveBeenCalled(); // The unchanged native Sidebar owns this entry after awaiting.
    expect(useTripStore.getState().assignments[v.day].map((a) => a.id)).toEqual([v.b, v.a]);
    const nativeUndo = bindPlannerUndo(
      () => useTripStore.getState().reorderAssignments(v.trip, v.day, [v.a, v.b]),
      [v.day]
    );
    await act(async () => nativeUndo());
    expect(useTripStore.getState().assignments[v.day].map((a) => a.id)).toEqual([v.a, v.b]);
    expect(h.route).not.toHaveBeenCalled();
  });
  it('native Clear confirmation uses one command without split legacy undo or routing', async () => {
    const v = await assignmentSetup(),
      undo = vi.fn(),
      reanchor = vi.fn(),
      route = vi.fn();
    const h = renderHook(() =>
      useDayClear({
        tripId: v.trip,
        days: useTripStore.getState().days,
        canEditDays: true,
        t: (k: string) => k,
        locale: 'en',
        toast,
        roadtripVias: { byDay: {}, reanchor },
        updateRouteForDay: route,
        pushUndo: undo,
      })
    );
    act(() => h.result.current.handleClearDay(v.day));
    await act(async () => h.result.current.confirmClearDay());
    expect(useTripStore.getState().assignments[v.day]).toEqual([]);
    expect(undo).not.toHaveBeenCalled();
    expect(reanchor).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
    expect(arrangementRemoved.size).toBe(2);
  });
  it.each(['move', 'remove', 'reorder', 'clear'] as const)(
    'actual store %s delegates before optimistic cache/queue writes',
    async (action) => {
      const v = await assignmentSetup(),
        st = useTripStore.getState();
      if (action === 'move') await st.moveAssignment(v.trip, v.a, v.day, v.next, 0);
      if (action === 'remove') await st.removeAssignment(v.trip, v.day, v.a);
      if (action === 'reorder') await st.reorderAssignments(v.trip, v.day, [v.b, v.a]);
      if (action === 'clear') await st.clearDayAssignments(v.trip, v.day);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(await offlineDb.days.count()).toBe(0);
      expect(arrangementReceipts.size).toBe(1);
    }
  );
  it('sends displayed revisions rather than silently replacing them with newer data', async () => {
    const v = await assignmentSetup(),
      before = JSON.stringify(useTripStore.getState().assignments);
    cohortState.publishedVisit.revision++;
    await expect(useTripStore.getState().removeAssignment(v.trip, v.day, v.a)).rejects.toThrow();
    expect(JSON.stringify(useTripStore.getState().assignments)).toBe(before);
    const calls = db.rpc.mock.calls.filter(([n]) => n === 'arrange_family_native_visits_v1');
    expect((calls[0][1].p_plan as ArrangementPlan).visit?.revision).toBe(1);
    expect(arrangementRemoved.size).toBe(0);
  });
  it('lost acknowledgement confirms the identical move read-only without revising twice', async () => {
    const v = await assignmentSetup();
    cohortState.loseAck = true;
    await expect(useTripStore.getState().moveAssignment(v.trip, v.a, v.day, v.next, 0)).rejects.toThrow();
    await useTripStore.getState().moveAssignment(v.trip, v.a, v.day, v.next, 0);
    const calls = db.rpc.mock.calls.filter(([n]) => n === 'arrange_family_native_visits_v1');
    expect(calls).toHaveLength(1);
    const checks = db.rpc.mock.calls.filter(([n]) => n === 'get_family_native_arrangement_receipt_v1');
    expect(checks.length).toBeGreaterThanOrEqual(2);
    expect(checks.every((c) => c[1].p_operation_id === calls[0][1].p_operation_id)).toBe(true);
    expect(arrangementReceipts.size).toBe(1);
  });
  it('a differing gesture cannot replace an uncertain arrangement', async () => {
    const v = await assignmentSetup();
    cohortState.loseAck = true;
    await expect(useTripStore.getState().removeAssignment(v.trip, v.day, v.a)).rejects.toThrow();
    await expect(useTripStore.getState().reorderAssignments(v.trip, v.day, [v.b, v.a])).rejects.toThrow();
    expect(arrangementReceipts.size).toBe(1);
  });
  it('private move projects only in My draft and never generic offline tables', async () => {
    const v = await assignmentSetup('myDraft');
    await useTripStore.getState().moveAssignment(v.trip, v.a, v.day, v.next, 0);
    expect(cohortState.publishedVisit.trip_day_id).toBe(day);
    expect(useTripStore.getState().assignments[v.next][0].id).toBe(v.a);
    expect(await offlineDb.days.count()).toBe(0);
    await load('published');
    expect(useTripStore.getState().assignments[v.next]).toEqual([]);
  });
  it('private Remove never advertises a legacy recreation Undo', async () => {
    const v = await assignmentSetup('myDraft'),
      h = nativeDayHook();
    await act(async () => h.result.current.handleRemoveAssignment(v.day, v.a));
    expect(h.undo).not.toHaveBeenCalled();
    expect(arrangementRemoved.size).toBe(0);
    expect(useTripStore.getState().assignments[v.day].map((a) => a.id)).toEqual([v.b]);
  });
  it('permission rejection keeps visible rows and pending work intact', async () => {
    const v = await assignmentSetup(),
      before = JSON.stringify(useTripStore.getState().assignments);
    cohortState.deny = { code: '42501' };
    await expect(useTripStore.getState().removeAssignment(v.trip, v.day, v.a)).rejects.toThrow();
    expect(JSON.stringify(useTripStore.getState().assignments)).toBe(before);
    expect(arrangementReceipts.size).toBe(0);
  });
  it('offline attempts leave visible rows and generic queue intact', async () => {
    const v = await assignmentSetup(),
      before = JSON.stringify(useTripStore.getState().assignments);
    setForcedOffline(true);
    await expect(useTripStore.getState().clearDayAssignments(v.trip, v.day)).rejects.toThrow();
    expect(JSON.stringify(useTripStore.getState().assignments)).toBe(before);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('stale Undo rejects rather than overwriting another edit or recreating a visit', async () => {
    const v = await assignmentSetup(),
      outcome = await required(currentPlannerAssignmentPort()).execute({
        action: 'remove',
        trip: v.trip,
        day: v.day,
        visit: v.a,
      });
    cohortState.repeatVisit.revision++;
    await expect(required(outcome.undo)()).rejects.toThrow();
    expect(arrangementRemoved.has(visit)).toBe(true);
    expect(cohortState.creationRows).toHaveLength(0);
  });
  it('generic queue retains an arrangement for explicit recovery without the cohort selected', async () => {
    const v = await assignmentSetup(),
      intent = await cohortState.cohort.assignments.prepare({ action: 'remove', trip: v.trip, day: v.day, visit: v.a });
    cohortState.release();
    api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(cohortState.repo));
    setAuthed(true);
    await mutationQueue.enqueue({
      id: intent.packet.operation_id,
      tripId: v.trip,
      resource: 'assignments',
      entityId: v.a,
      method: 'POST',
      url: '/trips/' + trip + '/family/planner-arrange-command',
      body: intent.packet,
    });
    await mutationQueue.flush();
    expect(arrangementRemoved.has(visit)).toBe(false);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it.each(['source', 'account', 'person', 'family'])(
    'a changed original %s parks the exact queued arrangement before RPC',
    async (kind) => {
      const v = await assignmentSetup(),
        intent = await cohortState.cohort.assignments.prepare({
          action: 'remove',
          trip: v.trip,
          day: v.day,
          visit: v.a,
        });
      if (kind === 'source') intent.packet.source_url = 'https://other.supabase.invalid';
      if (kind === 'account') cohortState.session = { ...cohortState.session, userId: uuid(990) };
      if (kind === 'person') cohortState.session = { ...cohortState.session, personId: uuid(991) };
      if (kind === 'family') cohortState.session = { ...cohortState.session, familyId: uuid(992) };
      if (kind !== 'source') cohortState.repo.acceptSession(cohortState.session);
      setAuthed(true);
      await mutationQueue.enqueue({
        id: intent.packet.operation_id,
        tripId: v.trip,
        resource: 'assignments',
        entityId: v.a,
        method: 'POST',
        url: '/trips/' + trip + '/family/planner-arrange-command',
        body: intent.packet,
      });
      await mutationQueue.flush();
      expect(arrangementReceipts.size).toBe(0);
      expect((await offlineDb.mutationQueue.get(intent.packet.operation_id))?.body).toEqual(intent.packet);
    }
  );
  it('a previously queued arrangement blocks competing creation', async () => {
    const v = await assignmentSetup(),
      intent = await cohortState.cohort.assignments.prepare({ action: 'remove', trip: v.trip, day: v.day, visit: v.a });
    await mutationQueue.enqueue({
      id: intent.packet.operation_id,
      tripId: v.trip,
      resource: 'assignments',
      entityId: v.a,
      method: 'POST',
      url: '/trips/' + trip + '/family/planner-arrange-command',
      body: intent.packet,
    });
    const c = { tripId: v.trip, dayId: null, position: null };
    const originalRows = await offlineDb.mutationQueue.toArray();
    await expect(cohortState.cohort.creation.beginForm(c)).rejects.toMatchObject({ code: 'planner_local_work' });
    expect(await offlineDb.mutationQueue.toArray()).toEqual(originalRows);
    expect(cohortState.creationRows).toHaveLength(0);
  });
  it('query parameters and a mismatched retry header are rejected before SQL', async () => {
    const v = await assignmentSetup(),
      intent = await cohortState.cohort.assignments.prepare({ action: 'remove', trip: v.trip, day: v.day, visit: v.a });
    await expect(
      cohortState.client.post('/trips/' + trip + '/family/planner-arrange-command?wrong=1', intent.packet)
    ).rejects.toThrow();
    await expect(
      cohortState.client.post('/trips/' + trip + '/family/planner-arrange-command', intent.packet, {
        headers: { 'X-Idempotency-Key': uuid(999) },
      })
    ).rejects.toThrow();
    expect(arrangementReceipts.size).toBe(0);
  });
});

describe('P04i native observed lossless calendar contract', () => {
  it('native day-title hook uses the checked command and retains the canonical trimmed title', async () => {
    const v = await calendarSetup(),
      before = structuredClone(cohortState.publishedVisit),
      h = nativeDayHook();
    await act(async () => h.result.current.handleUpdateDayTitle(v.day, '  Arrival  '));
    expect(useTripStore.getState().days[0].title).toBe('Arrival');
    expect(cohortState.publishedVisit).toEqual(before);
    expect(calendarCalls()).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('native append hydrates the extended Trip and stable days without recreating assignments', async () => {
    const v = await calendarSetup(),
      before = structuredClone(useTripStore.getState().assignments);
    const added = await useTripStore.getState().appendDatedDay(v.trip);
    expect(added.date).toBe('2027-04-02');
    expect(useTripStore.getState().days[0].id).toBe(v.day);
    expect(useTripStore.getState().trip?.end_date).toBe('2027-04-02');
    expect(useTripStore.getState().assignments[v.day]).toEqual(before[v.day]);
    expect(calendarCalls()).toHaveLength(1);
  });
  it('native insert at the end uses the recoverable insertion contract', async () => {
    const v = await calendarSetup();
    await useTripStore.getState().insertDay(v.trip, 2);
    expect(calendarCalls()[0][1].p_change).toEqual({ action: 'insert', position: 2 });
  });
  it('native Trip update explicitly extends the end without split legacy writes', async () => {
    const v = await calendarSetup();
    await useTripStore.getState().updateTrip(v.trip, { end_date: '2027-04-03', date_shift_mode: 'keep_bookings' });
    expect(useTripStore.getState().days).toHaveLength(3);
    expect(calendarCalls()[0][1].p_change).toEqual({ action: 'extend', end_date: '2027-04-03' });
  });
  it('an observed server calendar change refuses the original displayed title instead of refreshing it silently', async () => {
    const v = await calendarSetup();
    required(cohortState.calendarData).days[0].revision++;
    await expect(useTripStore.getState().updateDayTitle(v.trip, v.day, 'Stale')).rejects.toThrow('stale');
    expect(useTripStore.getState().days[0].title).toBe('First day');
    expect(calendarCalls()).toHaveLength(0);
  });
  it('a pre-upgrade day without a revision refuses calendar authoring', async () => {
    const v = await calendarSetup();
    const days = useTripStore.getState().days.map((d) => ({ ...d, family_day: { id: day } }));
    useTripStore.setState({ days });
    await expect(useTripStore.getState().updateDayTitle(v.trip, v.day, 'Unknown')).rejects.toThrow();
    expect(calendarCalls()).toHaveLength(0);
  });
  it('lost-ack append retries the exact original request and adds only one day', async () => {
    const v = await calendarSetup();
    cohortState.loseAck = true;
    await expect(useTripStore.getState().appendDatedDay(v.trip)).rejects.toThrow();
    await useTripStore.getState().appendDatedDay(v.trip);
    expect(calendarCalls()).toHaveLength(2);
    expect(calendarCalls()[1][1]).toEqual(calendarCalls()[0][1]);
    expect(useTripStore.getState().days).toHaveLength(2);
  });
  it('a different intent cannot replace an uncertain title save', async () => {
    const v = await calendarSetup();
    cohortState.loseAck = true;
    await expect(useTripStore.getState().updateDayTitle(v.trip, v.day, 'Saved')).rejects.toThrow();
    await expect(useTripStore.getState().appendDatedDay(v.trip)).rejects.toThrow('original calendar');
    expect(calendarCalls()).toHaveLength(1);
  });
  it('simultaneous native append calls coalesce to one operation', async () => {
    const v = await calendarSetup();
    await Promise.all([useTripStore.getState().appendDatedDay(v.trip), useTripStore.getState().appendDatedDay(v.trip)]);
    expect(calendarCalls()).toHaveLength(1);
    expect(useTripStore.getState().days).toHaveLength(2);
  });
  it('offline title saves retain displayed content without producing a legacy queued write', async () => {
    const v = await calendarSetup();
    setForcedOffline(true);
    await expect(useTripStore.getState().updateDayTitle(v.trip, v.day, 'Offline')).rejects.toThrow();
    expect(useTripStore.getState().days[0].title).toBe('First day');
    expect(calendarCalls()).toHaveLength(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('MyDraft title edits cannot fall back to published calendar writes', async () => {
    const v = await calendarSetup('myDraft');
    await expect(useTripStore.getState().updateDayTitle(v.trip, v.day, 'Private')).rejects.toThrow('Private calendar');
    expect(calendarCalls()).toHaveLength(0);
  });
  it.each(['delete'] as const)('native %s refuses before optimistic date or assignment changes', async (mode) => {
    const v = await calendarSetup(),
      before = structuredClone({
        days: useTripStore.getState().days,
        assignments: useTripStore.getState().assignments,
      });
    const st = useTripStore.getState();
    await expect(mode === 'delete' ? st.deleteDay(v.trip, v.day) : st.insertDay(v.trip, 1)).rejects.toThrow();
    expect({ days: useTripStore.getState().days, assignments: useTripStore.getState().assignments }).toEqual(before);
    expect(calendarCalls()).toHaveLength(0);
  });
  it.each([
    { title: 'Unexpected title', end_date: '2027-04-03' },
    { start_date: '2027-04-02', end_date: '2027-04-03' },
    { end_date: '2027-04-03', date_shift_mode: 'shift_all' },
  ] as const)('mixed or date-shifting Trip edits refuse the entire save: %j', async (patch) => {
    const v = await calendarSetup();
    await expect(useTripStore.getState().updateTrip(v.trip, patch)).rejects.toThrow();
    expect(calendarCalls()).toHaveLength(0);
  });
  it('the HTTP coordinator enforces the original idempotency header and strict payload', async () => {
    await calendarSetup();
    const p = await calendarPacketFor();
    await expect(
      cohortState.client.post('/trips/' + trip + '/family/calendar', p, { headers: { 'X-Idempotency-Key': uuid(999) } })
    ).rejects.toThrow();
    await expect(
      postCalendar({ ...p, change: { action: 'append', title: 'Lost' } } as unknown as CalendarPacket)
    ).rejects.toThrow();
    expect(calendarCalls()).toHaveLength(0);
  });
  it.each(['source', 'family', 'person', 'user', 'trip'] as const)(
    'the HTTP coordinator rejects a foreign original %s',
    async (key) => {
      await calendarSetup();
      const p = await calendarPacketFor();
      if (key === 'source') p.source_url = 'https://foreign.supabase.invalid';
      else p.scope[`${key}_id`] = uuid(999);
      await expect(postCalendar(p)).rejects.toThrow();
      expect(calendarCalls()).toHaveLength(0);
    }
  );
  it('SQL permission refusal reaches the native title hook without changing displayed data', async () => {
    const v = await calendarSetup();
    cohortState.deny = { code: '42501' };
    const h = nativeDayHook();
    await act(async () => h.result.current.handleUpdateDayTitle(v.day, 'Forbidden'));
    expect(toast.error).toHaveBeenCalled();
    expect(useTripStore.getState().days[0].title).toBe('First day');
  });
  it('a changed Family session after context fetch prevents dispatch', async () => {
    const v = await calendarSetup(),
      impl = required(db.rpc.getMockImplementation());
    db.rpc.mockImplementation(async (name, args) => {
      const out = await impl(name, args);
      if (name === 'get_family_trip_calendar_v1') {
        cohortState.session = { ...cohortState.session, personId: uuid(998) };
        cohortState.repo.acceptSession(cohortState.session);
      }
      return out;
    });
    await expect(useTripStore.getState().appendDatedDay(v.trip)).rejects.toThrow();
    expect(calendarCalls()).toHaveLength(0);
  });
  it('a malformed post-commit receipt retains the original operation for retry', async () => {
    const v = await calendarSetup(),
      impl = required(db.rpc.getMockImplementation());
    let bad = true;
    db.rpc.mockImplementation(async (name, args) => {
      const out = await impl(name, args);
      if (name === 'revise_family_trip_calendar_v1' && bad) {
        bad = false;
        return { ...out, data: { ...out.data, added_day_ids: [uuid(999)] } };
      }
      return out;
    });
    await expect(useTripStore.getState().appendDatedDay(v.trip)).rejects.toThrow();
    await useTripStore.getState().appendDatedDay(v.trip);
    expect(calendarCalls()[1][1]).toEqual(calendarCalls()[0][1]);
    expect(useTripStore.getState().days).toHaveLength(2);
  });
});

describe('P04i calendar queue ownership and installation', () => {
  async function enqueueCalendar(p: CalendarPacket, nativeTrip: number | string) {
    await mutationQueue.enqueue({
      id: p.operation_id,
      tripId: Number(nativeTrip),
      resource: 'days',
      entityId: Number(nativeTrip),
      method: 'POST',
      url: '/trips/' + trip + '/family/calendar',
      body: p,
    });
  }
  it('native IndexedDB queue replays the exact checked calendar with no cohort selected', async () => {
    const v = await calendarSetup(),
      p = await calendarPacketFor();
    cohortState.release();
    api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(cohortState.repo));
    await enqueueCalendar(p, v.trip);
    await mutationQueue.flush();
    expect(calendarCalls()[0][1].p_observation).toEqual(p.observation);
    expect(required(cohortState.calendarData).days).toHaveLength(2);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it.each(['source', 'account', 'family', 'person'] as const)(
    'changed %s parks the original queued calendar intact',
    async (key) => {
      const v = await calendarSetup(),
        p = await calendarPacketFor();
      if (key === 'source') p.source_url = 'https://foreign.supabase.invalid';
      else {
        cohortState.session = { ...cohortState.session, [key === 'account' ? 'userId' : key + 'Id']: uuid(997) };
        cohortState.repo.acceptSession(cohortState.session);
      }
      await enqueueCalendar(p, v.trip);
      await mutationQueue.flush();
      expect(calendarCalls()).toHaveLength(0);
      expect((await offlineDb.mutationQueue.get(p.operation_id))?.body).toEqual(p);
    }
  );
  it('stale calendar observation parks queued intent without dropping its body', async () => {
    const v = await calendarSetup(),
      p = await calendarPacketFor();
    required(cohortState.calendarData).days[0].revision++;
    await enqueueCalendar(p, v.trip);
    await mutationQueue.flush();
    expect(calendarResults.size).toBe(0);
    expect((await offlineDb.mutationQueue.get(p.operation_id))?.body).toEqual(p);
  });
  it('an older queued native edit blocks calendar authoring and remains intact', async () => {
    const v = await calendarSetup();
    const pending = {
      id: uuid(990),
      tripId: Number(v.trip),
      resource: 'days' as const,
      entityId: v.day,
      method: 'PUT' as const,
      url: '/trips/' + v.trip + '/days/' + v.day,
      body: { title: 'Original work' },
    };
    await mutationQueue.enqueue(pending);
    await expect(useTripStore.getState().appendDatedDay(v.trip)).rejects.toThrow('Older planner work');
    expect(calendarCalls()).toHaveLength(0);
    expect((await offlineDb.mutationQueue.get(pending.id))?.body).toEqual(pending.body);
  });
  it('a queued calendar blocks competing creation instead of silently reordering original work', async () => {
    const v = await calendarSetup(),
      p = await calendarPacketFor();
    await enqueueCalendar(p, v.trip);
    const c = { tripId: v.trip, dayId: null, position: null };
    const originalRows = await offlineDb.mutationQueue.toArray();
    await expect(cohortState.cohort.creation.beginForm(c)).rejects.toMatchObject({ code: 'planner_local_work' });
    expect(await offlineDb.mutationQueue.toArray()).toEqual(originalRows);
    expect(cohortState.creationRows).toHaveLength(0);
  });
  it('calendar port collision unwinds the earlier read/edit/create/assignment ports', () => {
    cohortState.release();
    const occupied = installPlannerCalendarPort({
      prepareTrash: async () => {
        throw new Error('occupied');
      },
      prepareRemove: async () => {
        throw new Error('occupied');
      },
      remove: async () => {
        throw new Error('occupied');
      },
      insert: async () => {
        throw new Error('occupied');
      },
      reorder: async () => ({}),
      rename: async () => {},
      append: async () => {
        throw new Error('unused');
      },
      extendTrip: async () => {
        throw new Error('unused');
      },
    });
    const other = createFamilyPlannerCohort(cohortState.repo, {
      source: () => cohortState.source,
      reportError: errors,
    });
    expect(() => other.install()).toThrow('already installed');
    occupied();
    const done = other.install();
    done();
    expect(currentPlannerCalendarPort()).toBeNull();
  });
});

describe('P04j native recoverable whole-day reorder', () => {
  it('actual native reorder hook hydrates stable day identities and supplies exact server-backed Undo', async () => {
    const v = await dayOrderSetup(),
      before = structuredClone(useTripStore.getState().assignments),
      h = nativeDayHook();
    act(() => h.result.current.handleReorderDays([...v.days].reverse()));
    await waitFor(() => expect(useTripStore.getState().days.map((d) => d.id)).toEqual([...v.days].reverse()));
    await waitFor(() => expect(h.undo).toHaveBeenCalledTimes(1));
    expect(useTripStore.getState().assignments[v.days[0]].map((a) => a.id)).toEqual(before[v.days[0]].map((a) => a.id));
    expect(h.route).not.toHaveBeenCalled();
    expect(h.reanchor).not.toHaveBeenCalled();
    const undo = h.undo.mock.calls[0][1] as () => Promise<void>;
    await act(async () => undo());
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    expect(calendarCalls()[1][1].p_change.action).toBe('restore_order');
    expect(calendarCalls()[1][1].p_observation).toEqual(dayOrderHistory.values().next().value?.after);
  });
  it('store reorder delegates before native optimistic cache and legacy queue writes', async () => {
    const v = await dayOrderSetup();
    await useTripStore.getState().reorderDays(v.trip, [...v.days].reverse());
    expect(calendarCalls()).toHaveLength(1);
    expect(await offlineDb.days.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('same-order native gesture has no fake Undo or mutation', async () => {
    const v = await dayOrderSetup(),
      h = nativeDayHook();
    act(() => h.result.current.handleReorderDays(v.days));
    await waitFor(() => expect(calendarCalls()).toHaveLength(1));
    await act(async () => {});
    expect(h.undo).not.toHaveBeenCalled();
    expect(dayOrderHistory.size).toBe(0);
  });
  it('lost reorder acknowledgement reuses the complete original operation', async () => {
    const v = await dayOrderSetup();
    cohortState.loseAck = true;
    await expect(useTripStore.getState().reorderDays(v.trip, [...v.days].reverse())).rejects.toThrow();
    await useTripStore.getState().reorderDays(v.trip, [...v.days].reverse());
    expect(calendarCalls()[1][1]).toEqual(calendarCalls()[0][1]);
    expect(dayOrderHistory.size).toBe(1);
  });
  it('simultaneous reorder gestures coalesce rather than reordering twice', async () => {
    const v = await dayOrderSetup();
    await Promise.all([
      cohortState.cohort.calendar.reorder(v.trip, [...v.days].reverse()),
      cohortState.cohort.calendar.reorder(v.trip, [...v.days].reverse()),
    ]);
    expect(calendarCalls()).toHaveLength(1);
  });
  it('Undo lost acknowledgement reuses its original recovery operation', async () => {
    const v = await dayOrderSetup(),
      out = await cohortState.cohort.calendar.reorder(v.trip, [...v.days].reverse());
    cohortState.loseAck = true;
    await expect(required(out.undo)()).rejects.toThrow();
    await required(out.undo)();
    expect(calendarCalls()[2][1]).toEqual(calendarCalls()[1][1]);
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
  });
  it('stale Undo cannot overwrite a later title even when the new calendar is visible', async () => {
    const v = await dayOrderSetup(),
      out = await cohortState.cohort.calendar.reorder(v.trip, [...v.days].reverse());
    await useTripStore.getState().updateDayTitle(v.trip, v.days[0], 'Later');
    await expect(required(out.undo)()).rejects.toThrow();
    expect(useTripStore.getState().days.find((d) => d.id === v.days[0])?.title).toBe('Later');
  });
  it.each(['person', 'family', 'account', 'source', 'layer'] as const)(
    'changed %s fences original Undo before RPC',
    async (key) => {
      const v = await dayOrderSetup(),
        out = await cohortState.cohort.calendar.reorder(v.trip, [...v.days].reverse());
      if (key === 'source') cohortState.source = 'https://changed.supabase.invalid';
      else if (key === 'layer') cohortState.repo.setLayer(trip, 'myDraft');
      else {
        cohortState.session = { ...cohortState.session, [key === 'account' ? 'userId' : key + 'Id']: uuid(996) };
        cohortState.repo.acceptSession(cohortState.session);
      }
      await expect(required(out.undo)()).rejects.toThrow();
      expect(calendarCalls()).toHaveLength(1);
    }
  );
  it('a superseding Trip load fences Undo rather than adapting its original observation', async () => {
    const v = await dayOrderSetup(),
      out = await cohortState.cohort.calendar.reorder(v.trip, [...v.days].reverse());
    await load();
    await expect(required(out.undo)()).rejects.toThrow();
    expect(calendarCalls()).toHaveLength(1);
  });
  it('private reorder refuses without a published write or Undo', async () => {
    const v = await dayOrderSetup('myDraft');
    await expect(cohortState.cohort.calendar.reorder(v.trip, [...v.days].reverse())).rejects.toThrow(
      'Private calendar'
    );
    expect(calendarCalls()).toHaveLength(0);
  });
  it('DST or reservation-permission refusal leaves the native day order intact', async () => {
    const v = await dayOrderSetup();
    cohortState.deny = { code: '22008' };
    await expect(useTripStore.getState().reorderDays(v.trip, [...v.days].reverse())).rejects.toThrow();
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    cohortState.deny = { code: '42501' };
    await expect(useTripStore.getState().reorderDays(v.trip, [...v.days].reverse())).rejects.toThrow();
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
  });
  it('native reorder stays offline-blocked with no cache optimism', async () => {
    const v = await dayOrderSetup();
    setForcedOffline(true);
    await expect(useTripStore.getState().reorderDays(v.trip, [...v.days].reverse())).rejects.toThrow();
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    expect(calendarCalls()).toHaveLength(0);
  });
  it('HTTP result validation rejects a forged reorder Undo identity, preserving safe retry', async () => {
    const v = await dayOrderSetup(),
      impl = required(db.rpc.getMockImplementation());
    let corrupt = true;
    db.rpc.mockImplementation(async (name, args) => {
      const out = await impl(name, args);
      if (name === 'revise_family_trip_calendar_v1' && corrupt) {
        corrupt = false;
        return { ...out, data: { ...out.data, undo_operation_id: uuid(995) } };
      }
      return out;
    });
    await expect(cohortState.cohort.calendar.reorder(v.trip, [...v.days].reverse())).rejects.toThrow();
    await cohortState.cohort.calendar.reorder(v.trip, [...v.days].reverse());
    expect(calendarCalls()[1][1]).toEqual(calendarCalls()[0][1]);
  });
  it('duplicate and incomplete day orders fail the coordinator transaction atomically', async () => {
    const v = await dayOrderSetup();
    await expect(cohortState.cohort.calendar.reorder(v.trip, [v.days[0], v.days[0]])).rejects.toThrow();
    await expect(cohortState.cohort.calendar.reorder(v.trip, [v.days[0]])).rejects.toThrow();
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    expect(dayOrderHistory.size).toBe(0);
  });
  it('the actual native queue replays reorder and recovery through the regular handler without a selected cohort', async () => {
    const v = await dayOrderSetup(),
      p = (await cohortState.cohort.calendar.prepare(v.trip, { action: 'reorder', order: [...v.order].reverse() }))
        .packet;
    cohortState.release();
    api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(cohortState.repo));
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
    expect(required(cohortState.calendarData).days.map((d) => d.id)).toEqual([...v.order].reverse());
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    const recovery = {
      ...p,
      operation_id: uuid(994),
      observation: structuredClone(required(cohortState.calendarData)),
      change: { action: 'restore_order' as const, operation_id: p.operation_id },
    };
    await mutationQueue.enqueue({
      id: recovery.operation_id,
      tripId: Number(v.trip),
      resource: 'days',
      entityId: Number(v.trip),
      method: 'POST',
      url: '/trips/' + trip + '/family/calendar',
      body: recovery,
    });
    await mutationQueue.flush();
    expect(required(cohortState.calendarData).days.map((d) => d.id)).toEqual(v.order);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
});

describe('P04j recovery response identity', () => {
  it('a foreign day returned by Undo is rejected and the original recovery remains retryable', async () => {
    const v = await dayOrderSetup(),
      out = await cohortState.cohort.calendar.reorder(v.trip, [...v.days].reverse()),
      impl = required(db.rpc.getMockImplementation());
    let bad = true;
    db.rpc.mockImplementation(async (name, args) => {
      const answer = await impl(name, args);
      if (
        name === 'revise_family_trip_calendar_v1' &&
        (args.p_change as CalendarChange).action === 'restore_order' &&
        bad
      ) {
        bad = false;
        return {
          ...answer,
          data: {
            ...answer.data,
            observation: {
              ...answer.data.observation,
              days: answer.data.observation.days.map((d: Record<string, unknown>, i: number) => ({
                ...d,
                id: i === 0 ? uuid(993) : d.id,
              })),
            },
          },
        };
      }
      return answer;
    });
    await expect(required(out.undo)()).rejects.toThrow();
    await required(out.undo)();
    expect(calendarCalls()[2][1]).toEqual(calendarCalls()[1][1]);
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
  });
});

it('saves an admissible mixed day through the Family visit receipt and bound Undo', async () => {
  const { bookingFixture } = await import('../../../tests/helpers/familyPlannerCohort/contents');
  const { at, contentNotes } = await import('../../../tests/helpers/familyPlannerCohort/state');
  const { saveFamilyTimelineOrder } = await import('../../components/Planner/familyTimelineReorder');
  const { getMergedItems, getTransportForDay } = await import('../../utils/dayMerge');
  const v = await assignmentSetup();
  const booking = bookingFixture({ type: 'bus', start_trip_day_id: day, sort_order: 7 });
  booking.dates.start_date = '2027-04-01';
  cohortState.bookingRows = [booking];
  contentNotes.push({
    id: uuid(9910),
    trip_id: trip,
    civil_day: '2027-04-01',
    body: 'Keep this note',
    icon: null,
    sort_order: 8,
    created_at: at,
    updated_at: at,
  });
  await load();
  const beforeBookings = structuredClone(cohortState.bookingRows);
  const beforeNotes = structuredClone(contentNotes);
  const state = useTripStore.getState();
  const before = getMergedItems({
    dayId: v.day,
    dayAssignments: state.assignments[v.day],
    dayNotes: state.dayNotes[v.day],
    dayTransports: getTransportForDay({
      reservations: state.reservations,
      days: state.days,
      dayId: v.day,
      dayAssignmentIds: [v.a, v.b],
    }),
  });
  expect(before.map((row) => row.type)).toEqual(['place', 'place', 'transport', 'note']);
  const undo = vi.fn<(callback: () => Promise<void> | void) => void>();
  await saveFamilyTimelineOrder(
    {
      tripId: v.trip,
      dayId: v.day,
      before,
      requested: [before[1], before[0], ...before.slice(2)],
      storedAssignments: state.assignments,
    },
    {
      toast: { info: vi.fn(), error: errors },
      t: (key) => key,
      pushUndo: (_label, callback, days) => undo(bindPlannerUndo(callback, days)),
    }
  );
  expect(errors).not.toHaveBeenCalled();
  expect(useTripStore.getState().assignments[v.day].map((a) => a.id)).toEqual([v.b, v.a]);
  expect(arrangementReceipts.size).toBe(1);
  expect(undo).toHaveBeenCalledOnce();
  await undo.mock.calls[0][0]();
  expect(useTripStore.getState().assignments[v.day].map((a) => a.id)).toEqual([v.a, v.b]);
  expect(cohortState.bookingRows).toEqual(beforeBookings);
  expect(contentNotes).toEqual(beforeNotes);
});

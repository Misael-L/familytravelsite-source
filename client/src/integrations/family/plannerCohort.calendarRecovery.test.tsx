// organize-imports-ignore
// sort-imports-ignore
// Initialize the original hoisted SDK mocks before loading suite consumers.
import '../../../tests/helpers/familyPlannerCohort/state';
import { describe, expect, it, vi } from 'vitest';
import {
  calendarCalls,
  dayOrderSetup,
  postCalendar,
  removalSetup,
} from '../../../tests/helpers/familyPlannerCohort/calendar';
import { load, required, snapshot } from '../../../tests/helpers/familyPlannerCohort/core';
import {
  addWithNativeHistory,
  nativeAddHook,
  removalHook,
} from '../../../tests/helpers/familyPlannerCohort/formActions';
import '../../../tests/helpers/familyPlannerCohort/setup';
import {
  cohortState,
  db,
  insertionHistory,
  removalHistory,
  toast,
  trip,
  uuid,
} from '../../../tests/helpers/familyPlannerCohort/state';
import { act, waitFor } from '../../../tests/helpers/render';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { setForcedOffline } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import type { CalendarChange, CalendarPacket } from './plannerCalendarContract';
import { createFamilyAxiosAdapter } from './transport';

describe('P04k actual native day insertion and empty-day Undo', () => {
  it('native middle-insert callback preserves original day/visit identity and exposes exact Undo', async () => {
    const v = await dayOrderSetup(),
      before = useTripStore.getState().assignments[v.days[1]]?.map((a) => a.id),
      h = nativeAddHook();
    act(() => h.result.current.handleAddDay(2));
    await waitFor(() => expect(useTripStore.getState().days).toHaveLength(3));
    await waitFor(() => expect(h.undo).toHaveBeenCalledTimes(1));
    expect(useTripStore.getState().days[0].id).toBe(v.days[0]);
    expect(useTripStore.getState().days[2].id).toBe(v.days[1]);
    expect(useTripStore.getState().assignments[v.days[1]]?.map((a) => a.id)).toEqual(before);
    await act(async () => {
      await (h.undo.mock.calls[0][1] as () => Promise<void>)();
    });
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    expect(useTripStore.getState().trip?.end_date).toBe('2027-04-02');
    expect(calendarCalls()[1][1].p_change.action).toBe('undo_insert');
  });
  it('native Add with date uses recoverable end insertion and restores the original end on Undo', async () => {
    const v = await dayOrderSetup(),
      h = nativeAddHook();
    act(() => h.result.current.dayAdd.onAddDated());
    await waitFor(() => expect(useTripStore.getState().trip?.end_date).toBe('2027-04-03'));
    await waitFor(() => expect(h.undo).toHaveBeenCalledTimes(1));
    await act(async () => {
      await (h.undo.mock.calls[0][1] as () => Promise<void>)();
    });
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    expect(toast.success).toHaveBeenCalled();
  });
  it('native busy guard coalesces double clicks before a rerender', async () => {
    await dayOrderSetup();
    const h = nativeAddHook();
    act(() => {
      h.result.current.dayAdd.onAddDated();
      h.result.current.dayAdd.onAddDated();
    });
    await waitFor(() => expect(useTripStore.getState().days).toHaveLength(3));
    expect(calendarCalls()).toHaveLength(1);
  });
  it('native undated choice refuses instead of inventing a civil date', async () => {
    await dayOrderSetup();
    const h = nativeAddHook();
    act(() => h.result.current.handleAddDay());
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Undated days'));
    expect(calendarCalls()).toHaveLength(0);
    expect(useTripStore.getState().days).toHaveLength(2);
  });
  it('native disabled permissions prevent dispatch entirely', async () => {
    await dayOrderSetup();
    const h = nativeAddHook(false);
    act(() => {
      h.result.current.handleAddDay(1);
      h.result.current.dayAdd.onAddDated();
    });
    expect(calendarCalls()).toHaveLength(0);
  });
  it('store insert delegates before native optimistic cache/queue writes', async () => {
    const v = await dayOrderSetup(),
      d = await useTripStore.getState().insertDay(v.trip, 1);
    expect(d?.date).toBe('2027-04-01');
    expect(await offlineDb.days.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('lost insertion reply retries the same complete original request and creates one day', async () => {
    const v = await dayOrderSetup();
    cohortState.loseAck = true;
    await expect(cohortState.cohort.calendar.insert(v.trip, 2)).rejects.toThrow();
    await cohortState.cohort.calendar.insert(v.trip, 2);
    expect(calendarCalls()[1][1]).toEqual(calendarCalls()[0][1]);
    expect(insertionHistory.size).toBe(1);
    expect(useTripStore.getState().days).toHaveLength(3);
  });
  it('lost Undo reply reuses its original recovery request', async () => {
    const v = await dayOrderSetup(),
      out = await cohortState.cohort.calendar.insert(v.trip, 2);
    cohortState.loseAck = true;
    await expect(out.undo()).rejects.toThrow();
    await out.undo();
    expect(calendarCalls()[2][1]).toEqual(calendarCalls()[1][1]);
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
  });
  it('a later day-title edit blocks Undo without losing the edit or created day', async () => {
    const v = await dayOrderSetup(),
      out = await cohortState.cohort.calendar.insert(v.trip, 2);
    await useTripStore.getState().updateDayTitle(v.trip, out.day.id, 'Later intentional title');
    await expect(out.undo()).rejects.toThrow();
    expect(useTripStore.getState().days.find((d) => d.id === out.day.id)?.title).toBe('Later intentional title');
  });
  it.each(['person', 'family', 'account', 'source', 'layer', 'load'] as const)(
    'changed %s fences insertion Undo before dispatch',
    async (key) => {
      const v = await dayOrderSetup(),
        out = await cohortState.cohort.calendar.insert(v.trip, 2);
      if (key === 'source') cohortState.source = 'https://changed.supabase.invalid';
      else if (key === 'layer') cohortState.repo.setLayer(trip, 'myDraft');
      else if (key === 'load') await load();
      else {
        cohortState.session = { ...cohortState.session, [key === 'account' ? 'userId' : key + 'Id']: uuid(9991) };
        cohortState.repo.acceptSession(cohortState.session);
      }
      await expect(out.undo()).rejects.toThrow();
      expect(calendarCalls()).toHaveLength(1);
    }
  );
  it('private insertion never falls back to published creation', async () => {
    const v = await dayOrderSetup('myDraft');
    await expect(cohortState.cohort.calendar.insert(v.trip, 2)).rejects.toThrow('Private calendar');
    expect(calendarCalls()).toHaveLength(0);
  });
  it('native insertion stays offline without placeholder days or queued optimism', async () => {
    const v = await dayOrderSetup();
    setForcedOffline(true);
    await expect(useTripStore.getState().insertDay(v.trip, 2)).rejects.toThrow();
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    expect(calendarCalls()).toHaveLength(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('reservation permission and DST errors preserve the displayed calendar', async () => {
    const v = await dayOrderSetup();
    for (const code of ['42501', '22008']) {
      cohortState.deny = { code };
      await expect(cohortState.cohort.calendar.insert(v.trip, 2)).rejects.toThrow();
      expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    }
  });
  it('a reversed creation replay returns lifecycle state instead of creating a second day', async () => {
    const v = await dayOrderSetup(),
      intent = await cohortState.cohort.calendar.prepare(v.trip, { action: 'insert', position: 2 });
    const r = await postCalendar(intent.packet);
    const recovery = {
      ...intent.packet,
      operation_id: uuid(9992),
      observation: r.data.observation,
      change: {
        action: 'undo_insert' as const,
        operation_id: intent.packet.operation_id,
        day_id: r.data.added_day_ids[0],
      },
    };
    await postCalendar(recovery);
    const replay = await postCalendar(intent.packet);
    expect(replay.data.creation_reversed).toBe(true);
    expect(replay.data.archived_day_id).toBe(r.data.added_day_ids[0]);
    expect(required(cohortState.calendarData).days.map((d) => d.id)).toEqual(v.order);
  });
  it('malformed created-day recovery identity is rejected, retaining exact safe retry', async () => {
    const v = await dayOrderSetup(),
      impl = required(db.rpc.getMockImplementation());
    let corrupt = true;
    db.rpc.mockImplementation(async (name, args) => {
      const answer = await impl(name, args);
      if (name === 'revise_family_trip_calendar_v1' && corrupt) {
        corrupt = false;
        return { ...answer, data: { ...answer.data, undo_operation_id: uuid(9993) } };
      }
      return answer;
    });
    await expect(cohortState.cohort.calendar.insert(v.trip, 2)).rejects.toThrow();
    await cohortState.cohort.calendar.insert(v.trip, 2);
    expect(calendarCalls()[1][1]).toEqual(calendarCalls()[0][1]);
    expect(insertionHistory.size).toBe(1);
  });
  it('wrong removed-day identity is rejected before publishing success, retaining Undo retry', async () => {
    const v = await dayOrderSetup(),
      out = await cohortState.cohort.calendar.insert(v.trip, 2),
      impl = required(db.rpc.getMockImplementation());
    let corrupt = true;
    db.rpc.mockImplementation(async (name, args) => {
      const answer = await impl(name, args);
      if (name === 'revise_family_trip_calendar_v1' && corrupt) {
        corrupt = false;
        return { ...answer, data: { ...answer.data, removed_day_id: uuid(9994) } };
      }
      return answer;
    });
    await expect(out.undo()).rejects.toThrow();
    await out.undo();
    expect(calendarCalls()[2][1]).toEqual(calendarCalls()[1][1]);
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
  });
  it('the native queue replays original insertion and Undo through the normal coordinator', async () => {
    const v = await dayOrderSetup(),
      p = (await cohortState.cohort.calendar.prepare(v.trip, { action: 'insert', position: 2 })).packet;
    cohortState.release();
    api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(cohortState.repo));
    const enqueue = async (packet: CalendarPacket) => {
      await mutationQueue.enqueue({
        id: packet.operation_id,
        tripId: Number(v.trip),
        resource: 'days',
        entityId: Number(v.trip),
        method: 'POST',
        url: '/trips/' + trip + '/family/calendar',
        body: packet,
      });
      await mutationQueue.flush();
    };
    await enqueue(p);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    const h = required(insertionHistory.get(p.operation_id));
    const undo = {
      ...p,
      operation_id: uuid(9995),
      observation: h.after,
      change: { action: 'undo_insert' as const, operation_id: p.operation_id, day_id: h.id },
    };
    await enqueue(undo);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(required(cohortState.calendarData).days.map((d) => d.id)).toEqual(v.order);
  });
  it('foreign queued insertion remains parked intact without contacting the RPC', async () => {
    const v = await dayOrderSetup(),
      p = (await cohortState.cohort.calendar.prepare(v.trip, { action: 'insert', position: 2 })).packet;
    p.source_url = 'https://foreign.supabase.invalid';
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
  });
});

describe('P04k real native history retry and removed-day selection', () => {
  it('lost Undo acknowledgement stays in native history and retries the identical operation', async () => {
    const v = await dayOrderSetup(),
      h = addWithNativeHistory();
    act(() => h.result.current.handleAddDay(2));
    await waitFor(() => expect(h.result.current.history.canUndo).toBe(true));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cohortState.loseAck = true;
    let first: boolean | null = null;
    await act(async () => {
      first = await h.result.current.history.undo();
    });
    expect(first).toBe(false);
    expect(h.result.current.history.canUndo).toBe(true);
    expect(h.removed).not.toHaveBeenCalled();
    let second: boolean | null = null;
    await act(async () => {
      second = await h.result.current.history.undo();
    });
    expect(second).toBe(true);
    expect(h.result.current.history.canUndo).toBe(false);
    expect(calendarCalls()[2][1]).toEqual(calendarCalls()[1][1]);
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    expect(h.removed).toHaveBeenCalledTimes(1);
  });
  it('a terminal permission refusal is not re-added as a permanently retrying Undo', async () => {
    await dayOrderSetup();
    const h = addWithNativeHistory();
    act(() => h.result.current.handleAddDay(2));
    await waitFor(() => expect(h.result.current.history.canUndo).toBe(true));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cohortState.deny = { code: '42501' };
    await act(async () => {
      await h.result.current.history.undo();
    });
    expect(h.result.current.history.canUndo).toBe(false);
    expect(useTripStore.getState().days).toHaveLength(3);
    expect(h.removed).not.toHaveBeenCalled();
  });
  it('offline Undo remains available until the original operation can be sent', async () => {
    const v = await dayOrderSetup(),
      h = addWithNativeHistory();
    act(() => h.result.current.handleAddDay(2));
    await waitFor(() => expect(h.result.current.history.canUndo).toBe(true));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => setForcedOffline(true));
    await act(async () => {
      await h.result.current.history.undo();
    });
    expect(h.result.current.history.canUndo).toBe(true);
    expect(calendarCalls()).toHaveLength(1);
    act(() => setForcedOffline(false));
    await act(async () => {
      await h.result.current.history.undo();
    });
    expect(h.result.current.history.canUndo).toBe(false);
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
  });
  it('valid selection survives insertion and removed-day selection clears only after successful Undo', async () => {
    const v = await dayOrderSetup();
    act(() => useTripStore.setState({ selectedDayId: v.days[0] }));
    const h = addWithNativeHistory();
    act(() => h.result.current.handleAddDay(2));
    await waitFor(() => expect(h.result.current.history.canUndo).toBe(true));
    expect(useTripStore.getState().selectedDayId).toBe(v.days[0]);
    const created = useTripStore.getState().days[1];
    act(() => useTripStore.setState({ selectedDayId: created.id }));
    await act(async () => {
      await h.result.current.history.undo();
    });
    expect(useTripStore.getState().selectedDayId).toBeNull();
    expect(h.removed).toHaveBeenCalledWith(created.id);
  });
});

describe('P04k native Undo stale reload protection', () => {
  it('a stale post-commit snapshot does not report success or discard native Undo', async () => {
    const v = await dayOrderSetup(),
      h = addWithNativeHistory();
    act(() => h.result.current.handleAddDay(2));
    await waitFor(() => expect(h.result.current.history.canUndo).toBe(true));
    const stale = structuredClone(snapshot('published')),
      impl = required(db.rpc.getMockImplementation());
    let committed = false,
      served = false;
    db.rpc.mockImplementation(async (name, args) => {
      const answer = await impl(name, args);
      if (name === 'revise_family_trip_calendar_v1' && (args.p_change as CalendarChange).action === 'undo_insert')
        committed = true;
      if (name === 'get_family_trip_planner_view_v1' && committed && !served) {
        served = true;
        return { ...answer, data: stale };
      }
      return answer;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let first: boolean | null = null;
    await act(async () => {
      first = await h.result.current.history.undo();
    });
    expect(first).toBe(false);
    expect(h.result.current.history.canUndo).toBe(true);
    expect(h.removed).not.toHaveBeenCalled();
    await act(async () => {
      await h.result.current.history.undo();
    });
    expect(h.result.current.history.canUndo).toBe(false);
    expect(h.removed).toHaveBeenCalledTimes(1);
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    expect(calendarCalls()[2][1]).toEqual(calendarCalls()[1][1]);
  });
});

describe('P04l actual native deletion confirmation and exact recovery', () => {
  it('opening and cancelling the native question performs no mutation and explains recovery accurately', async () => {
    const v = await removalSetup(),
      h = removalHook();
    act(() => h.result.current.handleDeleteDay(v.days[1]));
    expect(h.result.current.deleteDayQuestion).not.toBeNull();
    expect(calendarCalls()).toHaveLength(0);
    expect(h.result.current.deleteDayLines.map((l) => l.key)).toEqual(['calendar', 'recovery', 'retained']);
    expect(h.result.current.deleteDayLines.some((l) => l.text.includes('Undo'))).toBe(true);
    act(() => h.result.current.deleteDayQuestion?.onCancel());
    expect(h.result.current.deleteDayQuestion).toBeNull();
    expect(calendarCalls()).toHaveLength(0);
  });
  it('native confirmation removes only its day and native Undo restores the identical day set', async () => {
    const v = await removalSetup(),
      h = removalHook(),
      before = structuredClone(useTripStore.getState().assignments);
    act(() => h.result.current.handleDeleteDay(v.days[1]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual([v.days[0], v.days[2]]);
    expect(h.removed).toHaveBeenCalledWith(v.days[1]);
    expect(h.result.current.history.canUndo).toBe(true);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    await act(async () => {
      expect(await h.result.current.history.undo()).toBe(true);
    });
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
    expect(useTripStore.getState().assignments).toEqual(before);
    expect(calendarCalls().map((c) => c[1].p_change.action)).toEqual(['trash_day', 'restore_day']);
  });
  it('unsupported file links refuse without cleanup or fake Undo', async () => {
    const v = await removalSetup(),
      h = removalHook(),
      before = useTripStore.getState().days;
    cohortState.contentGuard = 'armed-file';
    act(() => h.result.current.handleDeleteDay(v.days[0]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(useTripStore.getState().days).toEqual(before);
    expect(h.removed).not.toHaveBeenCalled();
    expect(h.result.current.history.canUndo).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });
  it('a calendar refreshed after opening the question must be confirmed again', async () => {
    const v = await removalSetup(),
      h = removalHook();
    act(() => h.result.current.handleDeleteDay(v.days[1]));
    await load();
    await act(async () => h.result.current.confirmDeleteDay());
    expect(calendarCalls()).toHaveLength(0);
    expect(h.removed).not.toHaveBeenCalled();
  });
  it('duplicate native confirm calls coalesce before writes and history', async () => {
    const v = await removalSetup(),
      h = removalHook();
    act(() => h.result.current.handleDeleteDay(v.days[1]));
    await act(async () => {
      await Promise.all([h.result.current.confirmDeleteDay(), h.result.current.confirmDeleteDay()]);
    });
    expect(calendarCalls()).toHaveLength(1);
    expect(h.removed).toHaveBeenCalledTimes(1);
    await act(async () => {
      await h.result.current.history.undo();
    });
    expect(calendarCalls()).toHaveLength(2);
  });
  it('lost removal acknowledgement retries the original packet rather than deleting another day', async () => {
    const v = await removalSetup(),
      h = removalHook();
    cohortState.loseAck = true;
    act(() => h.result.current.handleDeleteDay(v.days[1]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(h.result.current.history.canUndo).toBe(false);
    expect(h.removed).not.toHaveBeenCalled();
    act(() => h.result.current.handleDeleteDay(v.days[1]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(calendarCalls()[1][1]).toEqual(calendarCalls()[0][1]);
    expect(removalHistory.size).toBe(1);
    expect(h.removed).toHaveBeenCalledTimes(1);
  });
  it('lost restore acknowledgement retains the same recovery in real native history', async () => {
    const v = await removalSetup(),
      h = removalHook();
    act(() => h.result.current.handleDeleteDay(v.days[1]));
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
    expect(useTripStore.getState().days.map((d) => d.id)).toEqual(v.days);
  });
  it.each(['denied', 'offline', 'private'] as const)('%s cannot bypass native or cohort fences', async (mode) => {
    const v = await removalSetup(mode === 'private' ? 'myDraft' : 'published'),
      h = removalHook(mode !== 'denied');
    if (mode === 'offline') act(() => setForcedOffline(true));
    act(() => h.result.current.handleDeleteDay(v.days[1]));
    await act(async () => h.result.current.confirmDeleteDay());
    expect(calendarCalls()).toHaveLength(0);
    expect(h.removed).not.toHaveBeenCalled();
    expect(h.result.current.history.canUndo).toBe(false);
  });
  it('current denial during restore drops native history without reusing another actor', async () => {
    const v = await removalSetup(),
      h = removalHook();
    act(() => h.result.current.handleDeleteDay(v.days[1]));
    await act(async () => h.result.current.confirmDeleteDay());
    cohortState.deny = { code: '42501' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      expect(await h.result.current.history.undo()).toBe(false);
    });
    expect(h.result.current.history.canUndo).toBe(false);
  });
  it('superseding Trip load blocks stale recovery before RPC', async () => {
    const v = await removalSetup(),
      out = await cohortState.cohort.calendar.remove(v.trip, v.days[1]);
    await load();
    await expect(out.undo()).rejects.toThrow();
    expect(calendarCalls()).toHaveLength(1);
  });
  it('an original removal replay after restore never removes that day again', async () => {
    const v = await removalSetup(),
      out = await cohortState.cohort.calendar.remove(v.trip, v.days[1]),
      p = calendarCalls()[0][1];
    await out.undo();
    const replay = await api.post(
      '/trips/' + trip + '/family/calendar',
      {
        version: 1,
        source_url: cohortState.source,
        operation_id: p.p_operation_id,
        scope: p.p_scope,
        observation: p.p_observation,
        change: p.p_change,
      },
      { headers: { 'X-Idempotency-Key': p.p_operation_id } }
    );
    expect(replay.data.removal_reversed).toBe(true);
    expect(required(cohortState.calendarData).days.map((d) => d.id)).toEqual(v.order);
  });
  it.each(['remove_day', 'restore_removed_day'] as const)(
    'forged %s result identities are rejected with original intent retained',
    async (action) => {
      const v = await removalSetup(),
        impl = required(db.rpc.getMockImplementation());
      let bad = true;
      db.rpc.mockImplementation(async (name, args) => {
        const a = await impl(name, args);
        if (name === 'revise_family_trip_calendar_v1' && (args.p_change as CalendarChange).action === action && bad) {
          bad = false;
          return {
            ...a,
            data: { ...a.data, [action === 'remove_day' ? 'removed_day_id' : 'restored_day_id']: uuid(999) },
          };
        }
        return a;
      });
      if (action === 'remove_day') {
        await expect(cohortState.cohort.calendar.remove(v.trip, v.days[1])).rejects.toThrow();
        await cohortState.cohort.calendar.remove(v.trip, v.days[1]);
        expect(calendarCalls()[1][1]).toEqual(calendarCalls()[0][1]);
      } else {
        const out = await cohortState.cohort.calendar.remove(v.trip, v.days[1]);
        await expect(out.undo()).rejects.toThrow();
        await out.undo();
        expect(calendarCalls()[2][1]).toEqual(calendarCalls()[1][1]);
      }
    }
  );
  it('the real original-scope queue replays a parked removal through HTTP without an installed cohort', async () => {
    const v = await removalSetup(),
      intent = await cohortState.cohort.calendar.prepare(v.trip, { action: 'remove_day', day_id: v.order[1] });
    cohortState.release();
    api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(cohortState.repo));
    setAuthed(true);
    await mutationQueue.enqueue({
      id: intent.packet.operation_id,
      tripId: Number(v.trip),
      resource: 'days',
      entityId: Number(v.trip),
      method: 'POST',
      url: '/trips/' + trip + '/family/calendar',
      body: intent.packet,
    });
    await mutationQueue.flush();
    expect(required(cohortState.calendarData).days.map((d) => d.id)).toEqual([v.order[0], v.order[2]]);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('foreign queued removal remains intact without reaching the RPC', async () => {
    const v = await removalSetup(),
      intent = await cohortState.cohort.calendar.prepare(v.trip, { action: 'remove_day', day_id: v.order[1] });
    intent.packet.source_url = 'https://other.supabase.invalid';
    cohortState.release();
    api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(cohortState.repo));
    setAuthed(true);
    await mutationQueue.enqueue({
      id: intent.packet.operation_id,
      tripId: Number(v.trip),
      resource: 'days',
      entityId: Number(v.trip),
      method: 'POST',
      url: '/trips/' + trip + '/family/calendar',
      body: intent.packet,
    });
    await mutationQueue.flush();
    expect(calendarCalls()).toHaveLength(0);
    expect((await offlineDb.mutationQueue.get(intent.packet.operation_id))?.body).toEqual(intent.packet);
  });
});

describe('P04l original confirmation scope', () => {
  it.each(['account', 'source', 'layer'] as const)(
    'a changed %s after opening cannot authorize another removal',
    async (kind) => {
      const v = await removalSetup(),
        h = removalHook();
      act(() => h.result.current.handleDeleteDay(v.days[1]));
      await waitFor(() => expect(db.rpc.mock.calls.some((c) => c[0] === 'get_family_trip_calendar_v1')).toBe(true));
      await act(async () => {
        await Promise.resolve();
      });
      if (kind === 'source') cohortState.source = 'https://other.supabase.invalid';
      if (kind === 'account') {
        cohortState.session = { ...cohortState.session, userId: uuid(999) };
        cohortState.repo.acceptSession(cohortState.session);
      }
      if (kind === 'layer') cohortState.repo.setLayer(trip, 'myDraft');
      await act(async () => h.result.current.confirmDeleteDay());
      expect(calendarCalls()).toHaveLength(0);
      expect(h.removed).not.toHaveBeenCalled();
    }
  );
});

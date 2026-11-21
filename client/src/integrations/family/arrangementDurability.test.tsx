// organize-imports-ignore
// sort-imports-ignore
import '../../../tests/helpers/familyPlannerCohort/state';
import { describe, expect, it, vi } from 'vitest';
import { load, required } from '../../../tests/helpers/familyPlannerCohort/core';
import { nativeDayHook } from '../../../tests/helpers/familyPlannerCohort/formActions';
import { assignmentSetup } from '../../../tests/helpers/familyPlannerCohort/planning';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { cohortState, db, trip, uuid } from '../../../tests/helpers/familyPlannerCohort/state';
import { act, renderHook, waitFor } from '../../../tests/helpers/render';
import { offlineDb, currentOfflineDatabase } from '../../db/offlineDb';
import { usePlannerHistory } from '../../hooks/usePlannerHistory';
import { useDayClear } from '../../pages/tripPlanner/useDayClear';
import type { PlannerAssignmentRequest } from '../../repo/plannerAssignmentPort';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { createPlannerCommandRecovery } from './plannerCommandRecovery';
import type { ArrangementPacket } from './plannerArrangementContract';
import { PlannerCohortAssignments } from './plannerCohortAssignments';
const rows = () => offlineDb.mutationQueue.toArray();
const writes = () => db.rpc.mock.calls.filter((c) => c[0] === 'arrange_family_native_visits_v1');
const recovery = () =>
  createPlannerCommandRecovery(cohortState.repo, trip, { source: () => cohortState.source, current: () => true });
type Action = 'move' | 'remove' | 'reorder' | 'clear';
async function open(action: Action = 'move', layer: 'published' | 'myDraft' = 'published') {
  const v = await assignmentSetup(layer);
  const request: PlannerAssignmentRequest =
    action === 'move'
      ? { action, trip: v.trip, visit: v.a, from: v.day, to: v.next, position: 0 }
      : action === 'remove'
        ? { action, trip: v.trip, visit: v.a, day: v.day }
        : action === 'reorder'
          ? { action, trip: v.trip, day: v.day, order: [v.b, v.a] }
          : { action, trip: v.trip, day: v.day };
  return { v, request, save: () => cohortState.cohort.assignments.execute(request) };
}
function beforeLoss() {
  const raw = required(db.rpc.getMockImplementation());
  let refuse = true;
  db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) =>
    n === 'arrange_family_native_visits_v1' && refuse ? { data: null, error: { code: '08006' } } : raw(n, a)
  );
  return () => {
    refuse = false;
  };
}
describe('native arrangement durable original foundation', () => {
  it.each(['move', 'remove', 'reorder', 'clear'] as const)(
    '%s native hook retains the original before any RPC',
    async (action) => {
      const f = await open(action),
        raw = required(db.rpc.getMockImplementation());
      let seen = 0;
      db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) => {
        if (n === 'get_family_native_arrangement_receipt_v1' || n === 'arrange_family_native_visits_v1') {
          const row = required((await rows())[0]),
            p = row.body as ArrangementPacket;
          expect(row.id).toBe(a.p_operation_id);
          expect(row.retentionPolicy).toBe('family-original-v1');
          expect(p.scope).toEqual(a.p_scope);
          expect(p.plan).toEqual(a.p_plan);
          seen++;
        }
        return raw(n, a);
      });
      const h = nativeDayHook();
      if (action === 'move') await act(async () => h.result.current.handleMoveToDay(f.v.a, f.v.day, f.v.next, 0));
      else if (action === 'remove') await act(async () => h.result.current.handleRemoveAssignment(f.v.day, f.v.a));
      else if (action === 'reorder') {
        await act(async () => h.result.current.handleReorder(f.v.day, [f.v.b, f.v.a]));
        expect(h.undo).not.toHaveBeenCalled(); // The awaiting native Sidebar owns reorder history.
      } else {
        const state = useTripStore.getState(),
          clear = renderHook(() =>
            useDayClear({
              tripId: f.v.trip,
              days: state.days,
              canEditDays: true,
              t: (k) => k,
              locale: 'en',
              toast: { error: vi.fn() },
              pushUndo: vi.fn(),
              updateRouteForDay: vi.fn(),
              roadtripVias: { byDay: {}, reanchor: vi.fn() },
            })
          );
        act(() => clear.result.current.handleClearDay(f.v.day));
        await act(async () => clear.result.current.confirmClearDay());
      }
      await waitFor(async () => expect(await rows()).toEqual([]));
      expect(seen).toBe(3);
      expect(writes()).toHaveLength(1);
    }
  );
  it.each([null, undefined, '2027-4-01'])(
    'reorder with date %s stops before a receipt, command, or queue write and can be retried',
    async (date) => {
      const f = await open('reorder');
      const days = useTripStore.getState().days;
      useTripStore.setState({ days: days.map((day) => (day.id === f.v.day ? { ...day, date } : day)) });
      const count = db.rpc.mock.calls.length;

      await expect(f.save()).rejects.toMatchObject({ status: 409, code: 'arrangement_day_date' });
      expect(db.rpc.mock.calls).toHaveLength(count);
      expect(await rows()).toEqual([]);

      useTripStore.setState({ days });
      await expect(f.save()).resolves.toMatchObject({ state: 'published' });
      expect(writes()).toHaveLength(1);
      expect(await rows()).toEqual([]);
    }
  );
  it('a move to a day without a date stops before any RPC or queue write', async () => {
    const f = await open();
    const days = useTripStore.getState().days;
    useTripStore.setState({
      days: days.map((day) => (day.id === f.v.next ? { ...day, date: null } : day)),
    });
    const count = db.rpc.mock.calls.length;

    await expect(f.save()).rejects.toMatchObject({ status: 409, code: 'arrangement_day_date' });
    expect(db.rpc.mock.calls).toHaveLength(count);
    expect(await rows()).toEqual([]);
  });
  it.each(['move', 'remove', 'reorder', 'clear'] as const)('%s storage failure sends no RPC', async (action) => {
    const f = await open(action),
      start = db.rpc.mock.calls.length;
    vi.spyOn(offlineDb.mutationQueue, 'add').mockRejectedValueOnce(new DOMException('Quota', 'QuotaExceededError'));
    await expect(f.save()).rejects.toThrow();
    expect(db.rpc.mock.calls.slice(start)).toEqual([]);
    expect(await rows()).toEqual([]);
  });
  it.each(['published', 'myDraft'] as const)('%s slow saves coalesce duplicate gestures', async (layer) => {
    const f = await open('move', layer),
      raw = required(db.rpc.getMockImplementation());
    let release = () => {},
      sent = false;
    const held = new Promise<void>((r) => {
      release = r;
    });
    db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) => {
      if (n === 'arrange_family_native_visits_v1') {
        sent = true;
        await held;
      }
      return raw(n, a);
    });
    const first = f.save();
    await waitFor(() => expect(sent).toBe(true));
    const second = f.save();
    expect(await rows()).toHaveLength(1);
    expect(writes()).toHaveLength(1);
    release();
    await Promise.all([first, second]);
    expect(await rows()).toEqual([]);
  });
  it.each(['move', 'remove', 'reorder', 'clear'] as const)(
    '%s cold discovery Check never writes and Retry keeps exact original',
    async (action) => {
      const f = await open(action),
        allow = beforeLoss();
      await expect(f.save()).rejects.toThrow();
      const row = required((await rows())[0]);
      cohortState.cohort.assignments.reset();
      useTripStore.setState({ trip: null, isLoading: false });
      const task = required(await recovery().inspect()),
        count = writes().length;
      expect(await task.check()).toBe('unknown');
      expect(writes()).toHaveLength(count);
      expect(await rows()).toEqual([row]);
      allow();
      expect(await task.retry()).toBe('committed');
      expect(await rows()).toEqual([]);
      expect(writes().every((c) => c[1].p_operation_id === row.id)).toBe(true);
      expect(
        writes().every((c) => JSON.stringify(c[1].p_plan) === JSON.stringify((row.body as ArrangementPacket).plan))
      ).toBe(true);
    }
  );
  it.each(['published', 'myDraft'] as const)(
    '%s lost committed reply Check preserves later data without resending',
    async (layer) => {
      const f = await open('move', layer);
      cohortState.loseAck = true;
      await expect(f.save()).rejects.toThrow();
      const row = required((await rows())[0]),
        count = writes().length;
      cohortState.publishedVisit.explanations = 'Later independent note';
      cohortState.publishedVisit.revision++;
      cohortState.cohort.assignments.reset();
      const task = required(await recovery().inspect());
      expect(await task.check()).toBe('committed');
      expect(writes()).toHaveLength(count);
      expect(await rows()).toEqual([]);
      expect(cohortState.publishedVisit.explanations).toBe('Later independent note');
      expect(writes()[0][1].p_operation_id).toBe(row.id);
    }
  );
  it.each(['remove', 'reorder'] as const)(
    'invoked %s Undo is durable even after the native history callback is consumed',
    async (action) => {
      const f = await open(action),
        result = await f.save(),
        undo = required(result.undo);
      const history = renderHook(() => usePlannerHistory());
      act(() => history.result.current.pushUndo('Native arrangement', undo));
      cohortState.loseAck = true;
      await act(async () => expect(await history.result.current.undo()).toBe(false));
      expect(history.result.current.canUndo).toBe(false);
      const row = required((await rows())[0]);
      expect((row.body as ArrangementPacket).plan.action).toBe(action === 'remove' ? 'restore' : 'reorder');
      await expect(f.save()).rejects.toMatchObject({ code: 'arrangement_pending' });
      cohortState.cohort.assignments.reset();
      useTripStore.setState({ trip: null, isLoading: false });
      const count = writes().length,
        task = required(await recovery().inspect());
      expect(await task.check()).toBe('committed');
      expect(await rows()).toEqual([]);
      expect(writes()).toHaveLength(count);
      await load();
      expect(useTripStore.getState().assignments[f.v.day].map((v) => v.id)).toEqual([f.v.a, f.v.b]);
    }
  );
  it('a historical committed outcome refreshes current state without reconstructing Undo from newer revisions', async () => {
    const f = await open('reorder');
    cohortState.loseAck = true;
    await expect(f.save()).rejects.toThrow();
    cohortState.publishedVisit.revision++;
    cohortState.publishedVisit.explanations = 'Later note';
    const result = await f.save();
    expect(result.undo).toBeUndefined();
    expect(await rows()).toEqual([]);
    expect(cohortState.publishedVisit.explanations).toBe('Later note');
    expect(writes()).toHaveLength(1);
  });
  it('a receipt for an earlier civil date cannot issue Undo for the refreshed day', async () => {
    const f = await open('reorder');
    const assignments = new PlannerCohortAssignments(
      cohortState.repo,
      async (tripId) => {
        await cohortState.cohort.refreshPlanner(tripId);
        useTripStore.setState(({ days }) => ({
          days: days.map((day) => (day.id === f.v.day ? { ...day, date: '2027-03-31' } : day)),
        }));
      },
      () => cohortState.source,
      () => false
    );

    const outcome = await assignments.execute(f.request);
    expect(outcome.state).toBe('published');
    expect(outcome.undo).toBeUndefined();
    expect(writes()).toHaveLength(1);
    expect(await rows()).toEqual([]);
  });
  it('denial keeps the original and restored authority retries the same operation', async () => {
    const f = await open(),
      allow = beforeLoss();
    await expect(f.save()).rejects.toThrow();
    const row = required((await rows())[0]);
    cohortState.deny = { code: '42501' };
    await expect(required(await recovery().inspect()).check()).rejects.toMatchObject({ status: 403 });
    expect(await rows()).toEqual([row]);
    cohortState.deny = null;
    allow();
    expect(await required(await recovery().inspect()).retry()).toBe('committed');
    expect(writes().every((c) => c[1].p_operation_id === row.id)).toBe(true);
  });
  it.each(['person', 'family', 'user', 'source', 'layer', 'trip', 'logout'])(
    '%s retirement cannot acknowledge a held save',
    async (change) => {
      const f = await open(),
        owned = currentOfflineDatabase(),
        raw = required(db.rpc.getMockImplementation());
      let release = () => {},
        sent = false;
      const held = new Promise<void>((r) => {
        release = r;
      });
      db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) => {
        if (n === 'arrange_family_native_visits_v1') {
          sent = true;
          await held;
        }
        return raw(n, a);
      });
      const saving = f.save();
      void saving.catch((error) => {
        expect(error).toBeDefined();
      });
      await waitFor(() => expect(sent).toBe(true));
      const row = required((await owned.mutationQueue.toArray())[0]);
      if (['person', 'family', 'user'].includes(change)) {
        cohortState.session = {
          ...cohortState.session,
          [change === 'person' ? 'personId' : change === 'user' ? 'userId' : 'familyId']: uuid(98),
        };
        cohortState.repo.acceptSession(cohortState.session);
      } else if (change === 'source') cohortState.source += 'changed';
      else if (change === 'layer') cohortState.repo.setLayer(trip, 'myDraft');
      else if (change === 'trip')
        useTripStore.setState({ trip: { ...required(useTripStore.getState().trip), id: 999 } });
      else setAuthed(false);
      release();
      await expect(saving).rejects.toThrow();
      expect(await owned.mutationQueue.toArray()).toEqual([row]);
    }
  );
  it('generic queue flushing cannot replay a retained arrangement unchecked', async () => {
    const f = await open();
    beforeLoss();
    await expect(f.save()).rejects.toThrow();
    const row = required((await rows())[0]),
      count = writes().length;
    await mutationQueue.flush();
    expect(writes()).toHaveLength(count);
    expect((await rows())[0].body).toEqual(row.body);
    expect(await recovery().inspect()).not.toBeNull();
  });
  it('changed observed queue metadata is not removed by a late acknowledgement', async () => {
    const f = await open(),
      raw = required(db.rpc.getMockImplementation());
    let release = () => {},
      sent = false;
    const held = new Promise<void>((r) => {
      release = r;
    });
    db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) => {
      if (n === 'arrange_family_native_visits_v1') {
        sent = true;
        await held;
      }
      return raw(n, a);
    });
    const saving = f.save();
    void saving.catch((error) => {
      expect(error).toBeDefined();
    });
    await waitFor(() => expect(sent).toBe(true));
    const row = required((await rows())[0]);
    await offlineDb.mutationQueue.update(row.id, { createdAt: row.createdAt + 1 });
    release();
    await expect(saving).rejects.toThrow();
    expect((await rows())[0].createdAt).toBe(row.createdAt + 1);
  });
  it.each(['echo', 'digest', 'acknowledgement'] as const)(
    'unconfirmed %s retains the original after a successful write',
    async (kind) => {
      const f = await open(),
        raw = required(db.rpc.getMockImplementation());
      let calls = 0;
      db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) => {
        const result = await raw(n, a);
        if (n === 'get_family_native_arrangement_receipt_v1' && ++calls === 2) {
          if (kind === 'echo')
            return { ...result, data: { ...result.data, scope: { ...(a.p_scope as object), user_id: uuid(99) } } };
          if (kind === 'digest') return { ...result, data: { ...result.data, request_sha256: 'b'.repeat(64) } };
          return {
            ...result,
            data: { ...result.data, result: { ...result.data.result, changed: !result.data.result.changed } },
          };
        }
        return result;
      });
      await expect(f.save()).rejects.toThrow();
      const row = required((await rows())[0]);
      expect(writes()).toHaveLength(1);
      expect(await required(await recovery().inspect()).check()).toBe('committed');
      expect(writes()).toHaveLength(1);
      expect(await rows()).toEqual([]);
      expect(writes()[0][1].p_operation_id).toBe(row.id);
    }
  );
  it('a replaced original and a blocked owner cannot be borrowed by startup discovery', async () => {
    const f = await open();
    beforeLoss();
    await expect(f.save()).rejects.toThrow();
    const row = required((await rows())[0]);
    await offlineDb.mutationQueue.update(row.id, { body: { ...(row.body as object), operation_id: uuid(99) } });
    expect(await recovery().inspect()).toBeNull();
    expect(await rows()).toHaveLength(1);
  });
  it('no Web Locks sends nothing and leaves existing work intact', async () => {
    const f = await open(),
      old = navigator.locks,
      start = db.rpc.mock.calls.length;
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    try {
      await expect(f.save()).rejects.toThrow();
      expect(db.rpc.mock.calls.slice(start)).toEqual([]);
    } finally {
      Object.defineProperty(navigator, 'locks', { value: old, configurable: true });
    }
  });
});

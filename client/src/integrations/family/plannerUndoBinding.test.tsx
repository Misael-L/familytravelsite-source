// organize-imports-ignore
// sort-imports-ignore
import '../../../tests/helpers/familyPlannerCohort/state';
import { describe, expect, it } from 'vitest';
import { required } from '../../../tests/helpers/familyPlannerCohort/core';
import { assignmentSetup } from '../../../tests/helpers/familyPlannerCohort/planning';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { cohortState, db, trip, uuid } from '../../../tests/helpers/familyPlannerCohort/state';
import { act, renderHook } from '../../../tests/helpers/render';
import { offlineDb } from '../../db/offlineDb';
import { usePlannerHistory } from '../../hooks/usePlannerHistory';
import { bindPlannerUndo } from '../../repo/plannerAssignmentPort';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { createPlannerCommandRecovery } from './plannerCommandRecovery';
const writes = () => db.rpc.mock.calls.filter((c) => c[0] === 'arrange_family_native_visits_v1');
async function recorded(kind: 'move' | 'reorder') {
  const v = await assignmentSetup();
  if (kind === 'move') await useTripStore.getState().moveAssignment(v.trip, v.a, v.day, v.next, 0);
  else await useTripStore.getState().reorderAssignments(v.trip, v.day, [v.b, v.a]);
  const callback =
    kind === 'move'
      ? () => useTripStore.getState().moveAssignment(v.trip, v.a, v.next, v.day, 0)
      : () => useTripStore.getState().reorderAssignments(v.trip, v.day, [v.a, v.b]);
  return { v, undo: bindPlannerUndo(callback, kind === 'move' ? [v.day, v.next] : [v.day]) };
}
describe('backend binding for native planner history', () => {
  it.each(['move', 'reorder'] as const)(
    '%s older Undo refuses newly refreshed revisions before any RPC or queue row',
    async (kind) => {
      const f = await recorded(kind);
      cohortState.publishedVisit.revision++;
      cohortState.publishedVisit.explanations = 'Later native edit';
      await cohortState.cohort.refreshPlanner(f.v.trip);
      const count = db.rpc.mock.calls.length;
      await expect(f.undo()).rejects.toMatchObject({ code: 'arrangement_undo_changed' });
      expect(db.rpc.mock.calls).toHaveLength(count);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(cohortState.publishedVisit.explanations).toBe('Later native edit');
    }
  );
  it.each(['move', 'reorder'] as const)(
    '%s unchanged original Undo remains functional and durable after consumed history',
    async (kind) => {
      const f = await recorded(kind),
        history = renderHook(() => usePlannerHistory());
      act(() => history.result.current.pushUndo('Native action', f.undo));
      cohortState.loseAck = true;
      await act(async () => expect(await history.result.current.undo()).toBe(false));
      expect(history.result.current.canUndo).toBe(false);
      const row = required((await offlineDb.mutationQueue.toArray())[0]),
        count = writes().length;
      const task = required(
        await createPlannerCommandRecovery(cohortState.repo, trip, {
          source: () => cohortState.source,
          current: () => true,
        }).inspect()
      );
      expect(await task.check()).toBe('committed');
      expect(writes()).toHaveLength(count);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(writes().slice(-1)[0]?.[1].p_operation_id).toBe(row.id);
    }
  );
  it.each(['source', 'person', 'family', 'user', 'layer', 'trip', 'logout'])(
    '%s retirement cannot invoke the old native callback',
    async (change) => {
      const f = await recorded('move');
      const count = db.rpc.mock.calls.length;
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
      await expect(f.undo()).rejects.toThrow();
      expect(db.rpc.mock.calls).toHaveLength(count);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('benign day focus and identical canonical refresh do not invalidate the captured Undo', async () => {
    const f = await recorded('move');
    useTripStore.setState({ selectedDayId: f.v.next });
    await cohortState.cohort.refreshPlanner(f.v.trip);
    await f.undo();
    expect(cohortState.publishedVisit.trip_day_id).not.toBe(cohortState.arrangementExtraDays[0].id);
    expect(writes()).toHaveLength(2);
  });
  it.each([null, undefined, '2027-4-01'])('cannot bind Undo on a day observed with date %s', async (date) => {
    const v = await assignmentSetup();
    useTripStore.setState(({ days }) => ({
      days: days.map((day) => (day.id === v.day ? { ...day, date } : day)),
    }));
    const count = db.rpc.mock.calls.length;
    let invoked = false;
    const undo = bindPlannerUndo(() => {
      invoked = true;
    }, [v.day]);

    await expect(async () => undo()).rejects.toMatchObject({ status: 409, code: 'arrangement_undo_changed' });
    expect(invoked).toBe(false);
    expect(db.rpc.mock.calls).toHaveLength(count);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('Undo bound on a dated day refuses if the date disappears', async () => {
    const f = await recorded('reorder');
    useTripStore.setState(({ days }) => ({
      days: days.map((day) => (day.id === f.v.day ? { ...day, date: null } : day)),
    }));
    const count = db.rpc.mock.calls.length;

    await expect(f.undo()).rejects.toMatchObject({ status: 409, code: 'arrangement_undo_changed' });
    expect(db.rpc.mock.calls).toHaveLength(count);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('a Trip change while history is bound refuses before dispatch', async () => {
    await assignmentSetup();
    cohortState.cohort.assignments.reset();
    useTripStore.setState({ trip: null });
    let invoked = false;
    const undo = bindPlannerUndo(() => {
      invoked = true;
    });
    await expect(undo()).rejects.toThrow();
    expect(invoked).toBe(false);
  });
  it('without a Family port, native history keeps its original callback', () => {
    cohortState.release();
    const native = () => {};
    expect(bindPlannerUndo(native, [1])).toBe(native);
  });
});

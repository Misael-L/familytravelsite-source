// organize-imports-ignore
// sort-imports-ignore
import '../../../tests/helpers/familyPlannerCohort/state';
import { expect, it } from 'vitest';
import { required } from '../../../tests/helpers/familyPlannerCohort/core';
import { nativeDayHook } from '../../../tests/helpers/familyPlannerCohort/formActions';
import { assignmentSetup } from '../../../tests/helpers/familyPlannerCohort/planning';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { cohortState, db } from '../../../tests/helpers/familyPlannerCohort/state';
import { act, renderHook, waitFor } from '../../../tests/helpers/render';
import { offlineDb } from '../../db/offlineDb';
import { usePlannerHistory } from '../../hooks/usePlannerHistory';
import { bindPlannerUndo } from '../../repo/plannerAssignmentPort';
import { useTripStore } from '../../store/tripStore';
const writes = () => db.rpc.mock.calls.filter((c) => c[0] === 'arrange_family_native_visits_v1');

it('the native Sidebar awaits the real reorder before recording one functional original-bound Undo', async () => {
  const v = await assignmentSetup(),
    h = nativeDayHook(),
    history = renderHook(() => usePlannerHistory());
  const raw = required(db.rpc.getMockImplementation());
  let release = () => {},
    entered = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) => {
    if (n === 'arrange_family_native_visits_v1') {
      entered = true;
      await held;
    }
    return raw(n, a);
  });
  let returned: unknown,
    done = false;
  // The exact unchanged Sidebar sequence: await onReorder, then pushUndo.
  const caller = (async () => {
    await act(async () => {
      returned = h.result.current.handleReorder(v.day, [v.b, v.a]);
      await returned;
      history.result.current.pushUndo(
        'Native reorder',
        bindPlannerUndo(() => useTripStore.getState().reorderAssignments(v.trip, v.day, [v.a, v.b]), [v.day]),
        [v.day]
      );
      done = true;
    });
  })();
  await waitFor(() => expect(entered).toBe(true));
  expect(returned).toBeInstanceOf(Promise);
  expect(done).toBe(false);
  expect(history.result.current.canUndo).toBe(false);
  expect(h.undo).not.toHaveBeenCalled();
  expect(await offlineDb.mutationQueue.count()).toBe(1);
  release();
  await caller;
  expect(h.undo).not.toHaveBeenCalled();
  expect(history.result.current.canUndo).toBe(true);
  await act(async () => expect(await history.result.current.undo()).toBe(true));
  expect(history.result.current.canUndo).toBe(false); // No duplicate entry from the backend hook.
  expect(useTripStore.getState().assignments[v.day].map((a) => a.id)).toEqual([v.a, v.b]);
  expect(writes()).toHaveLength(2);
  expect(writes()[0][1].p_operation_id).not.toBe(writes()[1][1].p_operation_id);
});
it('a refused native reorder rejects to its awaiting caller without phantom or duplicate history', async () => {
  const v = await assignmentSetup(),
    h = nativeDayHook();
  cohortState.deny = { code: '42501' };
  await act(async () => expect(h.result.current.handleReorder(v.day, [v.b, v.a])).rejects.toThrow());
  expect(h.undo).not.toHaveBeenCalled();
  expect(useTripStore.getState().assignments[v.day].map((a) => a.id)).toEqual([v.a, v.b]);
  expect(await offlineDb.mutationQueue.count()).toBe(1);
});

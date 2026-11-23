import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlannerAssignmentRequest } from '../../repo/plannerAssignmentPort';
import { useTripStore } from '../../store/tripStore';
import type { Assignment, Day } from '../../types';
import {
  guardNativeStayArrangement,
  guardNativeStayCalendar,
  guardNativeStayVisitClocks,
} from './nativeStayActionGuard';
import type { CalendarChange } from './plannerCalendarContract';
import { PlannerCohortAssignments } from './plannerCohortAssignments';
import { PlannerCohortCalendar } from './plannerCohortCalendar';
const ids = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
];
const arrival = {
  id: 20,
  day_id: 2,
  assignment_time: null,
  assignment_end_time: null,
  family_visit: { owning_stay_id: '20000000-0000-4000-8000-000000000001' },
} as unknown as Assignment;
const other = { id: 21, day_id: 2 } as Assignment;
const state = () => ({
  days: ids.map((id, i) => ({ id: i + 1, family_day: { id } }) as unknown as Day),
  assignments: { '1': [] as Assignment[], '2': [arrival, other], '3': [] as Assignment[] },
});
describe('native lodging arrival action contracts', () => {
  it.each<PlannerAssignmentRequest>([
    { action: 'move', trip: 1, visit: 20, from: 2, to: 3 },
    { action: 'remove', trip: 1, visit: 20, day: 2 },
    { action: 'clear', trip: 1, day: 2 },
  ])('refuses unsafe $action before a generic command', (r) =>
    expect(() => guardNativeStayArrangement(r, state())).toThrow('lodging')
  );
  it.each<PlannerAssignmentRequest>([
    { action: 'move', trip: 1, visit: 20, from: 2, to: 2, position: 1 },
    { action: 'reorder', trip: 1, day: 2, order: [21, 20] },
    { action: 'remove', trip: 1, visit: 21, day: 2 },
    { action: 'move', trip: 1, visit: 21, from: 2, to: 3 },
    { action: 'clear', trip: 1, day: 1 },
  ])('preserves safe $action behavior', (r) => expect(() => guardNativeStayArrangement(r, state())).not.toThrow());
  it.each<CalendarChange>([
    { action: 'title', day_id: ids[1], title: 'New day name' },
    { action: 'append' },
    { action: 'extend', end_date: '2027-04-06' },
    { action: 'insert', position: 3 },
    { action: 'remove_day', day_id: ids[2] },
    { action: 'trash_day', day_id: ids[2] },
    { action: 'undo_insert', day_id: ids[2], operation_id: ids[0] },
    { action: 'reorder', order: ids },
  ])('allows calendar $action retaining the lodging civil day', (r) =>
    expect(() => guardNativeStayCalendar(r, state())).not.toThrow()
  );
  it.each<CalendarChange>([
    { action: 'insert', position: 1 },
    { action: 'insert', position: 2 },
    { action: 'remove_day', day_id: ids[0] },
    { action: 'trash_day', day_id: ids[1] },
    { action: 'reorder', order: [ids[1], ids[0], ids[2]] },
    { action: 'restore_order', operation_id: ids[0] },
    { action: 'restore_day', day_id: ids[0], operation_id: ids[2] },
    { action: 'restore_removed_day', day_id: ids[0], operation_id: ids[2] },
    { action: 'undo_insert', day_id: ids[0], operation_id: ids[2] },
  ])('refuses calendar $action that can move an owned arrival date', (r) =>
    expect(() => guardNativeStayCalendar(r, state())).toThrow('lodging')
  );
  it('does not restrict an ordinary Trip without owned arrivals', () => {
    const s = state();
    s.assignments['2'] = [other];
    expect(() => guardNativeStayCalendar({ action: 'insert', position: 1 }, s)).not.toThrow();
  });
  it('does not guess an unavailable archived day placement', () =>
    expect(() =>
      guardNativeStayCalendar({ action: 'remove_day', day_id: '30000000-0000-4000-8000-000000000001' }, state())
    ).toThrow('lodging'));
  it.each(['place_time', 'end_time'])('refuses %s appointment conversion on a lodging arrival', (k) =>
    expect(() => guardNativeStayVisitClocks(arrival, { [k]: '00:00' } as never)).toThrow('untimed')
  );
  it.each([{}, { place_time: '', end_time: '' }, { assignment_notes: 'An independent note' }])(
    'preserves notes and empty clock inputs',
    (data) => expect(() => guardNativeStayVisitClocks(arrival, data as never)).not.toThrow()
  );
  it('does not restrict another occurrence at the same lodging', () =>
    expect(() => guardNativeStayVisitClocks(other, { place_time: '12:00' } as never)).not.toThrow());
});

describe('native planner adapter guard placement', () => {
  afterEach(() => vi.restoreAllMocks());
  function observed() {
    vi.spyOn(useTripStore, 'getState').mockReturnValue({ ...useTripStore.getState(), ...state() });
    return {
      session: vi.fn(() => {
        throw new Error('Unexpected repository access');
      }),
    };
  }
  it.each<PlannerAssignmentRequest>([
    { action: 'move', trip: 1, visit: 20, from: 2, to: 3 },
    { action: 'remove', trip: 1, visit: 20, day: 2 },
    { action: 'clear', trip: 1, day: 2 },
  ])('refuses owned $action before fetching or preparing a write', async (request) => {
    const repo = observed();
    const adapter = new PlannerCohortAssignments(
      repo as never,
      vi.fn(),
      () => 'test',
      () => false
    );
    await expect(adapter.prepare(request)).rejects.toMatchObject({ code: 'native_stay_arrival_action' });
    expect(repo.session).not.toHaveBeenCalled();
  });
  it('refuses calendar preparation before fetching a write context', async () => {
    const repo = observed();
    const adapter = new PlannerCohortCalendar(
      repo as never,
      vi.fn(),
      () => 'test',
      () => false
    );
    await expect(adapter.prepare(1, { action: 'insert', position: 1 })).rejects.toMatchObject({
      code: 'native_stay_arrival_action',
    });
    expect(repo.session).not.toHaveBeenCalled();
  });
  it('rechecks an earlier calendar intent when a lodging arrival now owns the date', async () => {
    observed();
    const adapter = new PlannerCohortCalendar(
      {} as never,
      vi.fn(),
      () => 'test',
      () => false
    );
    const fence = vi.fn(async () => undefined);
    const replay = adapter as unknown as {
      execute(trip: number, change: CalendarChange, intent: unknown): Promise<unknown>;
    };
    await expect(
      replay.execute(
        1,
        { action: 'insert', position: 1 },
        { packet: { operation_id: ids[0], change: { action: 'insert', position: 1 } }, fence }
      )
    ).rejects.toMatchObject({ code: 'native_stay_arrival_action' });
    expect(fence).toHaveBeenCalledOnce();
  });
});

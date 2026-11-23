import { vi } from 'vitest';
import type { CalendarChange, CalendarPacket } from '../../../src/integrations/family/plannerCalendarContract';
import { useTripStore } from '../../../src/store/tripStore';
import { load, required } from './core';
import {
  at,
  calendarResults,
  cohortState,
  day,
  dayOrderHistory,
  db,
  insertionHistory,
  removalHistory,
  trip,
  uuid,
} from './state';

export function withCalendar<T extends { state: { trip_revision: number; days: unknown[]; visits: unknown[] } }>(
  base: T
): T {
  return cohortState.calendarData
    ? {
        ...base,
        state: {
          ...base.state,
          trip_revision: cohortState.calendarData.trip_revision,
          days: cohortState.calendarData.days.map((d) => ({ ...d, trip_id: trip, updated_at: at })),
          visits: base.state.visits.map((value) => {
            const v = value as Record<string, unknown>;
            return {
              ...v,
              planning_day: cohortState.calendarData?.days.find((d) => d.id === v.trip_day_id)?.civil_day ?? null,
            };
          }),
        },
      }
    : base;
}

export function fakeCalendar(args: Record<string, unknown>) {
  if (cohortState.deny) return { data: null, error: cohortState.deny };
  const observation = required(cohortState.calendarData),
    change = args.p_change as CalendarChange,
    key = String(args.p_operation_id),
    hash = JSON.stringify([args.p_scope, args.p_observation, change]);
  const old = calendarResults.get(key);
  if (old && old.hash !== hash) return { data: null, error: { code: '40001' } };
  if (!old) {
    if (JSON.stringify(args.p_observation) !== JSON.stringify(observation))
      return { data: null, error: { code: '40001' } };
    const next = structuredClone(observation),
      added: string[] = [];
    if (change.action === 'title') {
      const d = required(next.days.find((d) => d.id === change.day_id));
      d.title = change.title?.trim() || null;
      d.revision++;
      next.trip_revision++;
    } else if (change.action === 'append' || change.action === 'extend') {
      const last = required(next.days[next.days.length - 1]),
        date = new Date(last.civil_day + 'T00:00Z');
      const end =
        change.action === 'append' ? new Date(date.getTime() + 86400000).toISOString().slice(0, 10) : change.end_date;
      while (date.toISOString().slice(0, 10) < end) {
        date.setUTCDate(date.getUTCDate() + 1);
        const id = uuid(800 + next.days.length);
        added.push(id);
        next.days.push({
          id,
          revision: 1,
          civil_day: date.toISOString().slice(0, 10),
          day_index: next.days.length + 1,
          title: null,
        });
      }
      next.end_at = end + 'T00:00:00Z';
      next.trip_revision++;
    }
    cohortState.calendarData = next;
    calendarResults.set(key, {
      hash,
      result: {
        version: 1,
        state: 'published',
        changed: true,
        day_id: change.action === 'title' ? change.day_id : null,
        added_day_ids: added,
        observation: next,
      },
    });
  }
  if (cohortState.loseAck) {
    cohortState.loseAck = false;
    return { data: null, error: { code: '08006', message: 'Lost reply after calendar commit' } };
  }
  return { data: calendarResults.get(key)?.result, error: null };
}

export async function calendarSetup(layer: 'published' | 'myDraft' = 'published') {
  cohortState.calendarData = {
    trip_revision: 1,
    start_at: '2027-04-01T00:00:00Z',
    end_at: '2027-04-01T00:00:00Z',
    days: [{ id: day, revision: 1, civil_day: '2027-04-01', day_index: 1, title: 'First day' }],
  };
  const header = await cohortState.repo.readers.trips.fetchTripById(trip);
  vi.mocked(cohortState.repo.readers.trips.fetchTripById).mockImplementation(async () => ({
    ...required(header),
    end_date: required(cohortState.calendarData).end_at?.slice(0, 10) ?? null,
  }));
  await load(layer);
  const st = useTripStore.getState();
  return { trip: required(st.trip).id, day: st.days[0].id };
}

export function calendarCalls() {
  return db.rpc.mock.calls.filter((c) => c[0] === 'revise_family_trip_calendar_v1');
}

export async function calendarPacketFor(): Promise<CalendarPacket> {
  return (await cohortState.cohort.calendar.prepare(trip, { action: 'append' })).packet;
}

export function postCalendar(p: CalendarPacket) {
  return cohortState.client.post('/trips/' + trip + '/family/calendar', p, {
    headers: { 'X-Idempotency-Key': p.operation_id },
  });
}

export function fakeDayOrder(args: Record<string, unknown>) {
  if (cohortState.deny) return { data: null, error: cohortState.deny };
  const p = args.p_change as CalendarChange,
    key = String(args.p_operation_id),
    hash = JSON.stringify([args.p_scope, args.p_observation, p]),
    old = calendarResults.get(key),
    before = structuredClone(required(cohortState.calendarData));
  if (old && old.hash !== hash) return { data: null, error: { code: '40001' } };
  if (!old) {
    if (JSON.stringify(args.p_observation) !== JSON.stringify(before)) return { data: null, error: { code: '40001' } };
    const history = p.action === 'restore_order' ? dayOrderHistory.get(p.operation_id) : null;
    if (p.action === 'restore_order' && (!history || JSON.stringify(history.after) !== JSON.stringify(before)))
      return { data: null, error: { code: '40001' } };
    const ids = p.action === 'reorder' ? p.order : required(history).before.days.map((d) => d.id);
    if (
      new Set(ids).size !== before.days.length ||
      ids.length !== before.days.length ||
      ids.some((id) => !before.days.some((d) => d.id === id))
    )
      return { data: null, error: { code: '22023' } };
    const changed = ids.join() !== before.days.map((d) => d.id).join(),
      next = structuredClone(before);
    if (changed) {
      next.days = ids.map((id, i) => {
        const d = required(before.days.find((d) => d.id === id));
        return {
          ...d,
          civil_day: before.days[i].civil_day,
          day_index: i + 1,
          revision: d.revision + (d.day_index === i + 1 ? 0 : 2),
        };
      });
      next.trip_revision++;
    }
    cohortState.calendarData = next;
    if (changed && p.action === 'reorder') dayOrderHistory.set(key, { before, after: structuredClone(next) });
    calendarResults.set(key, {
      hash,
      result: {
        version: 1,
        state: 'published',
        changed,
        day_id: null,
        added_day_ids: [],
        observation: next,
        undo_operation_id: changed && p.action === 'reorder' ? key : null,
      },
    });
  }
  if (cohortState.loseAck) {
    cohortState.loseAck = false;
    return { data: null, error: { code: '08006', message: 'Lost order acknowledgement' } };
  }
  return { data: calendarResults.get(key)?.result, error: null };
}

export async function dayOrderSetup(layer: 'published' | 'myDraft' = 'published') {
  await calendarSetup(layer);
  const c = required(cohortState.calendarData);
  c.end_at = '2027-04-02T00:00:00Z';
  c.days.push({ id: uuid(880), revision: 1, civil_day: '2027-04-02', day_index: 2, title: 'Second day' });
  await load(layer);
  const st = useTripStore.getState();
  return { trip: required(st.trip).id, days: st.days.map((d) => d.id), order: c.days.map((d) => d.id) };
}

export function fakeDayInsertion(args: Record<string, unknown>) {
  if (cohortState.deny) return { data: null, error: cohortState.deny };
  const p = args.p_change as CalendarChange,
    key = String(args.p_operation_id),
    hash = JSON.stringify([args.p_scope, args.p_observation, p]),
    old = calendarResults.get(key),
    current = structuredClone(required(cohortState.calendarData));
  if (old && old.hash !== hash) return { data: null, error: { code: '40001' } };
  if (old) {
    const history = insertionHistory.get(key);
    if (p.action === 'insert' && history?.undone)
      return {
        data: {
          version: 1,
          state: 'published',
          changed: false,
          day_id: null,
          added_day_ids: [],
          undo_operation_id: null,
          creation_reversed: true,
          archived_day_id: history.id,
          observation: current,
        },
        error: null,
      };
  } else {
    if (JSON.stringify(args.p_observation) !== JSON.stringify(current)) return { data: null, error: { code: '40001' } };
    let result: Record<string, unknown>;
    if (p.action === 'insert') {
      if (p.position < 1 || p.position > current.days.length + 1) return { data: null, error: { code: '22023' } };
      const id = uuid(9000 + insertionHistory.size),
        ordered = [...current.days];
      ordered.splice(p.position - 1, 0, {
        id,
        revision: 1,
        civil_day: '2027-04-01',
        day_index: p.position,
        title: null,
      });
      const start = new Date(current.days[0].civil_day + 'T00:00Z');
      const next = {
        ...current,
        trip_revision: current.trip_revision + 1,
        days: ordered.map((d, i) => ({
          ...d,
          day_index: i + 1,
          civil_day: new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10),
          revision: d.revision + (d.day_index === i + 1 ? 0 : 2),
        })),
      };
      next.end_at =
        new Date(start.getTime() + (ordered.length - 1) * 86400000).toISOString().slice(0, 10) +
        required(current.end_at).slice(10);
      cohortState.calendarData = next;
      insertionHistory.set(key, { before: current, after: structuredClone(next), id, undone: false });
      result = {
        version: 1,
        state: 'published',
        changed: true,
        day_id: null,
        added_day_ids: [id],
        undo_operation_id: key,
        creation_reversed: false,
        observation: next,
      };
    } else if (p.action === 'undo_insert') {
      const h = insertionHistory.get(p.operation_id);
      if (!h || h.id !== p.day_id) return { data: null, error: { code: '42501' } };
      if (h.undone || JSON.stringify(h.after) !== JSON.stringify(current))
        return { data: null, error: { code: '40001' } };
      h.undone = true;
      const next = { ...structuredClone(h.before), trip_revision: current.trip_revision + 1 };
      cohortState.calendarData = next;
      result = {
        version: 1,
        state: 'published',
        changed: true,
        day_id: null,
        added_day_ids: [],
        undo_operation_id: null,
        removed_day_id: h.id,
        observation: next,
      };
    } else throw new Error('Unexpected insertion fake action');
    calendarResults.set(key, { hash, result });
  }
  if (cohortState.loseAck) {
    cohortState.loseAck = false;
    return { data: null, error: { code: '08006', message: 'Lost insertion acknowledgement' } };
  }
  return { data: calendarResults.get(key)?.result, error: null };
}

export function fakeDayRemoval(args: Record<string, unknown>, retain = false) {
  if (cohortState.deny) return { data: null, error: cohortState.deny };
  const p = args.p_change as CalendarChange,
    key = String(args.p_operation_id),
    hash = JSON.stringify([args.p_scope, args.p_observation, p]),
    old = calendarResults.get(key),
    current = structuredClone(required(cohortState.calendarData));
  if (old && old.hash !== hash) return { data: null, error: { code: '40001' } };
  if (old && (p.action === 'remove_day' || p.action === 'trash_day') && removalHistory.get(key)?.restored)
    return {
      data: {
        version: 1,
        state: 'published',
        changed: false,
        day_id: null,
        added_day_ids: [],
        undo_operation_id: null,
        removal_reversed: true,
        restored_day_id: p.day_id,
        observation: current,
      },
      error: null,
    };
  if (!old) {
    if (JSON.stringify(args.p_observation) !== JSON.stringify(current)) return { data: null, error: { code: '40001' } };
    let result: Record<string, unknown>;
    if (p.action === 'remove_day' || p.action === 'trash_day') {
      if (current.days.length <= 1 || !current.days.some((d) => d.id === p.day_id))
        return { data: null, error: { code: '22023' } };
      if (!retain && p.day_id === cohortState.publishedVisit.trip_day_id)
        return { data: null, error: { code: '40001', message: 'Day contains retained visits' } };
      const start = new Date(current.days[0].civil_day + 'T00:00Z'),
        days = current.days
          .filter((d) => d.id !== p.day_id)
          .map((d, i) => ({
            ...d,
            day_index: i + 1,
            civil_day: new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10),
            revision: d.revision + (d.day_index === i + 1 ? 0 : 2),
          }));
      const next = {
        ...current,
        trip_revision: current.trip_revision + 1,
        days,
        end_at:
          new Date(start.getTime() + (days.length - 1) * 86400000).toISOString().slice(0, 10) +
          required(current.end_at).slice(10),
      };
      cohortState.calendarData = next;
      removalHistory.set(key, { before: current, after: structuredClone(next), id: p.day_id, restored: false });
      result = {
        version: 1,
        state: 'published',
        changed: true,
        day_id: null,
        added_day_ids: [],
        removed_day_id: p.day_id,
        undo_operation_id: key,
        removal_reversed: false,
        observation: next,
      };
    } else if (p.action === 'restore_removed_day' || p.action === 'restore_day') {
      const h = removalHistory.get(p.operation_id);
      if (!h || h.id !== p.day_id) return { data: null, error: { code: '42501' } };
      if (h.restored || JSON.stringify(h.after) !== JSON.stringify(current))
        return { data: null, error: { code: '40001' } };
      h.restored = true;
      const next = {
        ...structuredClone(h.before),
        trip_revision: current.trip_revision + 1,
        days: h.before.days.map((d) => ({ ...d, revision: d.revision + 2 })),
      };
      cohortState.calendarData = next;
      result = {
        version: 1,
        state: 'published',
        changed: true,
        day_id: null,
        added_day_ids: [h.id],
        restored_day_id: h.id,
        undo_operation_id: null,
        observation: next,
      };
    } else throw new Error('Unexpected removal fake action');
    calendarResults.set(key, { hash, result });
  }
  if (cohortState.loseAck) {
    cohortState.loseAck = false;
    return { data: null, error: { code: '08006', message: 'Lost day removal acknowledgement' } };
  }
  return { data: calendarResults.get(key)?.result, error: null };
}

export async function removalSetup(layer: 'published' | 'myDraft' = 'published') {
  await dayOrderSetup(layer);
  const c = required(cohortState.calendarData);
  c.days.push({ id: uuid(881), revision: 1, civil_day: '2027-04-03', day_index: 3, title: 'Last day' });
  c.end_at = '2027-04-03T00:00:00Z';
  await load(layer);
  const st = useTripStore.getState();
  return { trip: required(st.trip).id, days: st.days.map((d) => d.id), order: c.days.map((d) => d.id) };
}

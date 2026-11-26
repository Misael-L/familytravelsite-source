import type { TripUpdateRequest } from '@trek/shared';
import { isAxiosError } from 'axios';
import { z } from 'zod';
import api from '../../api/client';
import { RetryableCalendarUndoError } from '../../repo/plannerCalendarPort';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { guardNativeStayCalendar } from './nativeStayActionGuard';
import { savedLocationResponse } from './planLocations';
import {
  calendarContext,
  calendarDay,
  calendarPacket,
  calendarReceipt,
  type CalendarChange,
  type CalendarObservation,
  type CalendarPacket,
  type CalendarReceipt,
} from './plannerCalendarContract';
import { refuseOlderQueue } from './plannerCohortEditor';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
type Applied = {
  state: ReturnType<typeof useTripStore.getState>;
  receipt: CalendarReceipt;
  packet: CalendarPacket;
  fence: () => Promise<void>;
};
type Intent = { packet: CalendarPacket; fence: () => Promise<void> };
const root = z.object({
  trip_revision: z.number().int().positive().safe(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
});
export class PlannerCohortCalendar {
  private epoch = 0;
  private pending: { key: string; intent: Promise<Intent> } | null = null;
  private inFlight = new Map<string, Promise<Applied>>();
  constructor(
    private repo: FamilyFrontendRepository,
    private hydrate: (trip: number | string) => Promise<void>,
    private source: () => string,
    private disposed: () => boolean
  ) {}
  reset() {
    this.epoch++;
    this.pending = null;
  }
  async prepare(tripValue: number | string, change: CalendarChange): Promise<Intent> {
    const state = useTripStore.getState();
    guardNativeStayCalendar(change, state);
    const shown = structuredClone({ trip: state.trip, days: state.days }),
      session = await this.repo.session(),
      ids = (await this.repo.views()).ids,
      trip = await this.repo.tripUuid(tripValue),
      layer = this.repo.getLayer(trip),
      origin = this.source(),
      epoch = this.epoch;
    const fence = async () => {
      const current = await this.repo.session();
      if (
        this.disposed() ||
        epoch !== this.epoch ||
        origin !== this.source() ||
        (await this.repo.views()).ids !== ids ||
        current.userId !== session.userId ||
        current.familyId !== session.familyId ||
        current.personId !== session.personId ||
        this.repo.getLayer(trip) !== layer ||
        String(useTripStore.getState().trip?.id) !== String(ids.register('trip', trip))
      )
        throw new FamilyApiError(409, 'calendar_changed', 'Original calendar session changed. Reload.');
    };
    await fence();
    if (layer !== 'published')
      throw new FamilyApiError(
        409,
        'calendar_private_pending',
        'Private calendar authorship is not connected. No published fallback was attempted.'
      );
    const c = savedLocationResponse(calendarContext, (await api.get('/trips/' + trip + '/family/calendar')).data);
    await fence();
    assertShownCalendar(shown, c.observation);
    return {
      fence,
      packet: calendarPacket.parse({
        version: 1,
        source_url: origin,
        operation_id: crypto.randomUUID(),
        scope: {
          version: 1,
          trip_id: trip,
          family_id: session.familyId,
          user_id: session.userId,
          person_id: session.personId,
          layer,
        },
        observation: c.observation,
        change,
      }),
    };
  }
  private async execute(trip: number | string, change: CalendarChange, prepared?: Intent) {
    const key = JSON.stringify([trip, change]);
    if (this.pending && this.pending.key !== key)
      throw new FamilyApiError(409, 'calendar_pending', 'Resolve the original calendar save first.');
    if (this.pending === null) {
      const next = { key, intent: prepared ? Promise.resolve(prepared) : this.prepare(trip, change) };
      this.pending = next;
      void next.intent.catch(() => {
        if (this.pending === next) this.pending = null;
      });
    }
    const intent = await this.pending.intent,
      old = this.inFlight.get(intent.packet.operation_id);
    if (old !== undefined) return old;
    const call = this.send(intent);
    this.inFlight.set(intent.packet.operation_id, call);
    const clear = () => {
      this.inFlight.delete(intent.packet.operation_id);
    };
    void call.then(clear, clear);
    return call;
  }
  private async send(intent: Intent) {
    if (isEffectivelyOffline())
      throw new FamilyApiError(409, 'calendar_offline', 'Calendar edits need a connection; original work is retained.');
    await intent.fence();
    const p = intent.packet;
    guardNativeStayCalendar(p.change, useTripStore.getState());
    await refuseOlderQueue(this.repo, p.scope.trip_id, p.operation_id);
    let answer;
    try {
      answer = await api.post('/trips/' + p.scope.trip_id + '/family/calendar', p, {
        headers: { 'X-Idempotency-Key': p.operation_id },
      });
    } catch (error) {
      if (isAxiosError(error) && [400, 403, 422].includes(error.response?.status ?? 0)) this.pending = null;
      throw error;
    }
    const out = savedLocationResponse(calendarReceipt, answer.data);
    await intent.fence();
    this.repo.invalidate(p.scope.trip_id);
    try {
      await this.hydrate(p.scope.trip_id);
    } catch (error) {
      await intent.fence();
      if (error instanceof FamilyApiError && error.code === 'booking_calendar_changed')
        throw new FamilyApiError(
          409,
          'calendar_refresh',
          'Saved booking/calendar snapshots disagree. Retry the original save.'
        );
      throw error;
    }
    await intent.fence();
    const state = useTripStore.getState();
    if (
      out.added_day_ids.some(
        (id) => !state.days.some((d) => (d as unknown as { family_day?: { id?: string } }).family_day?.id === id)
      )
    )
      throw new FamilyApiError(409, 'calendar_refresh', 'Saved days are not visible; retry the original save.');
    if (
      out.removed_day_id &&
      state.days.some((d) => (d as unknown as { family_day?: { id?: string } }).family_day?.id === out.removed_day_id)
    )
      throw new FamilyApiError(409, 'calendar_refresh', 'The removed day is still visible. Retry the original Undo.');
    this.pending = null;
    return { state, receipt: out, packet: p, fence: intent.fence };
  }
  async reorder(trip: number | string, ordered: number[]) {
    const ids = (await this.repo.views()).ids;
    const applied = await this.execute(trip, { action: 'reorder', order: ordered.map((id) => ids.uuid('day', id)) });
    if (!applied.receipt.changed || !applied.receipt.undo_operation_id) return {};
    const change: CalendarChange = { action: 'restore_order', operation_id: applied.receipt.undo_operation_id };
    return { undo: this.recovery(applied, trip, change) };
  }
  private recovery(applied: Applied, trip: number | string, change: CalendarChange) {
    const intent: Intent = {
      packet: {
        ...applied.packet,
        operation_id: crypto.randomUUID(),
        observation: applied.receipt.observation,
        change,
      },
      fence: applied.fence,
    };
    return async () => {
      try {
        await this.execute(trip, change, intent);
      } catch (error) {
        const transport = isAxiosError(error) && (!error.response || error.response.status >= 500);
        const unavailable =
          error instanceof FamilyApiError &&
          (error.status >= 500 || ['calendar_offline', 'calendar_refresh'].includes(error.code));
        if (transport || unavailable) throw new RetryableCalendarUndoError(error);
        throw error;
      }
    };
  }
  async insert(trip: number | string, position: number) {
    const applied = await this.execute(trip, { action: 'insert', position });
    if (applied.receipt.creation_reversed)
      throw new FamilyApiError(
        409,
        'calendar_creation_reversed',
        'This day was already removed by its insertion Undo. No new day was created.'
      );
    const id = applied.receipt.added_day_ids[0],
      day = applied.state.days.find((d) => (d as unknown as { family_day?: { id?: string } }).family_day?.id === id);
    if (!day || !applied.receipt.undo_operation_id)
      throw new FamilyApiError(
        502,
        'calendar_insert_result',
        'Created day or its recovery identity is missing. Retry the original insertion.'
      );
    return {
      day,
      undo: this.recovery(applied, trip, {
        action: 'undo_insert',
        operation_id: applied.receipt.undo_operation_id,
        day_id: id,
      }),
    };
  }
  async prepareRemove(trip: number | string, day: number) {
    return this.prepareRemoval(trip, day, 'remove_day');
  }
  async prepareTrash(trip: number | string, day: number) {
    return this.prepareRemoval(trip, day, 'trash_day');
  }
  private async prepareRemoval(trip: number | string, day: number, action: 'remove_day' | 'trash_day') {
    const id = (await this.repo.views()).ids.uuid('day', day),
      change: CalendarChange = { action, day_id: id };
    if (this.pending) return () => this.executeRemoval(trip, day, action);
    const original = await this.prepare(trip, change);
    return () => this.executeRemoval(trip, day, action, original);
  }
  async remove(trip: number | string, day: number, original?: Intent) {
    return this.executeRemoval(trip, day, 'remove_day', original);
  }
  async trashDay(trip: number | string, day: number, original?: Intent) {
    return this.executeRemoval(trip, day, 'trash_day', original);
  }
  private async executeRemoval(
    trip: number | string,
    day: number,
    action: 'remove_day' | 'trash_day',
    original?: Intent
  ) {
    const id = (await this.repo.views()).ids.uuid('day', day),
      applied = await this.execute(trip, { action, day_id: id }, original);
    if (applied.receipt.removal_reversed)
      throw new FamilyApiError(
        409,
        'calendar_removal_reversed',
        'This day was already restored. No second removal was performed.'
      );
    if (!applied.receipt.undo_operation_id)
      throw new FamilyApiError(
        502,
        'calendar_removal_result',
        'Removal recovery identity is missing. Retry the original request.'
      );
    return {
      undo: this.recovery(applied, trip, {
        action: action === 'trash_day' ? 'restore_day' : 'restore_removed_day',
        day_id: id,
        operation_id: applied.receipt.undo_operation_id,
      }),
    };
  }
  async rename(trip: number | string, day: number, title: string | null) {
    const ids = (await this.repo.views()).ids;
    await this.execute(trip, { action: 'title', day_id: ids.uuid('day', day), title });
  }
  async append(trip: number | string, position?: number) {
    if (position !== undefined && position !== useTripStore.getState().days.length + 1)
      throw new FamilyApiError(409, 'calendar_insert_pending', 'Insertion that shifts existing days is not connected.');
    const { state } = await this.execute(trip, { action: 'append' }),
      d = state.days[state.days.length - 1];
    if (!d) throw new FamilyApiError(502, 'calendar_missing_day', 'Added day unavailable.');
    return d;
  }
  async extendTrip(trip: number | string, data: TripUpdateRequest) {
    const before = useTripStore.getState().trip;
    if (!before) throw new FamilyApiError(409, 'calendar_no_trip', 'Open the Trip first.');
    if (!before.start_date && !before.end_date) {
      const { start_date, end_date, date_shift_mode, ...other } = data;
      if (typeof start_date !== 'string' || Object.entries(other).some(([k,v]) =>
        v !== undefined && JSON.stringify(v) !== JSON.stringify((before as unknown as Record<string,unknown>)[k])))
        throw new FamilyApiError(409, 'calendar_assignment_fields', 'Save trip details separately before choosing dates.');
      const expectedEnd = new Date(Date.parse(start_date + 'T00:00:00Z') + (useTripStore.getState().days.length - 1) * 86400000).toISOString().slice(0,10);
      if (end_date != null && end_date !== expectedEnd)
        throw new FamilyApiError(409, 'calendar_assignment_duration', 'The date range must match the itinerary day count.');
      const { state } = await this.execute(trip, { action: 'assign_dates', start_date });
      if (!state.trip) throw new FamilyApiError(502, 'calendar_trip', 'Refreshed Trip unavailable.');
      return state.trip;
    }
    for (const [k, v] of Object.entries(data)) {
      if (k === 'end_date' || k === 'date_shift_mode') continue;
      if (v !== undefined && JSON.stringify(v) !== JSON.stringify((before as unknown as Record<string, unknown>)[k]))
        throw new FamilyApiError(409, 'calendar_mixed_edit', 'This calendar save cannot discard other Trip edits.');
    }
    if (data.date_shift_mode !== undefined && data.date_shift_mode !== 'keep_bookings')
      throw new FamilyApiError(
        409,
        'calendar_shift_pending',
        'Rescheduling confirmed content needs a separate command.'
      );
    if (typeof data.end_date !== 'string')
      throw new FamilyApiError(409, 'calendar_end_required', 'This writer requires an explicit end-date extension.');
    const { state } = await this.execute(trip, { action: 'extend', end_date: data.end_date });
    if (!state.trip) throw new FamilyApiError(502, 'calendar_trip', 'Refreshed Trip unavailable.');
    return state.trip;
  }
}
function utcDate(value: string | null) {
  return value === null ? null : new Date(value).toISOString().slice(0, 10);
}
function assertShownCalendar(shown: { trip: unknown; days: unknown[] }, obs: CalendarObservation) {
  const trip = z.object({ family_calendar: root }).safeParse(shown.trip);
  if (!trip.success)
    throw new FamilyApiError(409, 'calendar_not_observed', 'Reload the checked calendar before editing it.');
  const days = shown.days
    .map((d) => {
      const m = z.object({ family_day: z.record(z.string(), z.unknown()) }).parse(d).family_day;
      return calendarDay.parse({
        id: m.id,
        revision: m.revision,
        civil_day: m.civil_day,
        day_index: m.day_index,
        title: m.title,
      });
    })
    .sort((a, b) => a.day_index - b.day_index);
  if (
    trip.data.family_calendar.trip_revision !== obs.trip_revision ||
    trip.data.family_calendar.start_date !== utcDate(obs.start_at) ||
    trip.data.family_calendar.end_date !== utcDate(obs.end_at) ||
    JSON.stringify(days) !== JSON.stringify(obs.days)
  )
    throw new FamilyApiError(409, 'calendar_stale_display', 'The displayed calendar is stale. Reload before saving.');
}

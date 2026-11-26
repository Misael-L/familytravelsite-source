import { z } from 'zod';
import { locationId } from './planLocationContract';
import { calendarObservation } from './plannerCalendarContract';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { NOT_HANDLED } from './listHandler';
import { locationRpc, savedLocationResponse } from './planLocations';
import {
  calendarContext,
  calendarPacket,
  calendarReceipt,
  type CalendarPacket,
  type CalendarReceipt,
} from './plannerCalendarContract';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
import { visitCommandBody, visitCommandFailure } from './visitCommands';
export async function handleFamilyPlannerCalendar(repo: FamilyFrontendRepository, r: FamilyRequest) {
  const m = r.pathname.match(/^\/trips\/([^/]+)\/family\/calendar$/);
  if (!m) return NOT_HANDLED;
  if (!['GET', 'POST'].includes(r.method) || r.query.size)
    throw new FamilyApiError(405, 'calendar_method', 'Use a complete calendar GET or POST.');
  try {
    const session = await repo.session(),
      trip = await repo.tripUuid(m[1]),
      ids = (await repo.views()).ids;
    const fence = async () => {
      const current = await repo.session();
      if (r.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (
        current.userId !== session.userId ||
        current.familyId !== session.familyId ||
        current.personId !== session.personId ||
        (await repo.views()).ids !== ids
      )
        throw new FamilyApiError(409, 'calendar_session', 'Calendar Family session changed.');
    };
    if (r.method === 'GET') {
      const c = savedLocationResponse(
        calendarContext,
        await locationRpc('get_family_trip_calendar_v1', { p_trip_id: trip })
      );
      await fence();
      if (
        c.trip_id !== trip ||
        c.family_id !== session.familyId ||
        c.user_id !== session.userId ||
        c.person_id !== session.personId
      )
        throw new FamilyApiError(502, 'calendar_scope', 'Invalid calendar context.');
      return c;
    }
    const p = calendarPacket.parse(visitCommandBody(r));
    if (new TextEncoder().encode(JSON.stringify(p)).length > 1100000)
      throw new FamilyApiError(400, 'calendar_bound', 'Calendar command exceeds its bound.');
    if (
      p.source_url.replace(/\/$/, '') !== getSupabaseUrl().replace(/\/$/, '') ||
      p.scope.trip_id !== trip ||
      p.scope.family_id !== session.familyId ||
      p.scope.user_id !== session.userId ||
      p.scope.person_id !== session.personId
    )
      throw new FamilyApiError(409, 'calendar_origin', 'Original calendar source or scope changed.');
    await fence();
    const flexible = p.observation.start_at === null && p.observation.end_at === null &&
      ['append', 'reorder', 'assign_dates'].includes(p.change.action);
    const raw = await locationRpc(flexible ? 'revise_family_trip_calendar_v2' : 'revise_family_trip_calendar_v1', {
      p_trip_id: trip, p_operation_id: p.operation_id,
      ...(flexible ? {} : { p_scope: p.scope }), p_observation: p.observation, p_change: p.change,
    });
    const out = flexible ? flexibleCalendarReceipt(p, raw, trip) : savedLocationResponse(calendarReceipt, raw);
    await fence();
    validateCalendarIdentities(p, out);
    if (!flexible) validateOrderRecovery(p, out);
    validateInsertionRecovery(p, out);
    validateInsertionUndo(p, out);
    validateDayRemoval(p, out);
    validateRemovedDayRestore(p, out);
    repo.invalidate(trip);
    return out;
  } catch (error) {
    return visitCommandFailure(error);
  }
}

function validateCalendarIdentities(p: CalendarPacket, out: CalendarReceipt) {
  if (
    new Set(out.added_day_ids).size !== out.added_day_ids.length ||
    out.added_day_ids.some((id) => !out.observation.days.some((d) => d.id === id)) ||
    out.day_id !== (p.change.action === 'title' ? p.change.day_id : null)
  )
    throw new FamilyApiError(502, 'calendar_result', 'Calendar result returned inconsistent identities.');
  if (
    (p.change.action === 'reorder' || p.change.action === 'restore_order') &&
    (out.observation.start_at !== p.observation.start_at ||
      out.observation.end_at !== p.observation.end_at ||
      out.observation.days.length !== p.observation.days.length ||
      new Set(out.observation.days.map((d) => d.id)).size !== p.observation.days.length ||
      out.observation.days.some((d) => !p.observation.days.some((before) => before.id === d.id)))
  )
    throw new FamilyApiError(
      502,
      'calendar_order_scope',
      'Day ordering returned inconsistent calendar membership or bounds.'
    );
}

function validateOrderRecovery(p: CalendarPacket, out: CalendarReceipt) {
  if (
    p.change.action === 'reorder' &&
    (out.added_day_ids.length ||
      out.observation.days.map((d) => d.id).join() !== p.change.order.join() ||
      out.undo_operation_id !== (out.changed ? p.operation_id : null))
  )
    throw new FamilyApiError(502, 'calendar_order_result', 'Inconsistent saved day order or Undo identity.');
  if (p.change.action === 'restore_order' && (out.added_day_ids.length || out.undo_operation_id !== null))
    throw new FamilyApiError(502, 'calendar_restore_result', 'Inconsistent recovered calendar.');
}

function validateInsertionRecovery(p: CalendarPacket, out: CalendarReceipt) {
  if (p.change.action === 'insert') {
    if (out.creation_reversed) {
      if (
        out.changed ||
        out.added_day_ids.length ||
        out.undo_operation_id !== null ||
        !out.archived_day_id ||
        out.observation.days.some((d) => d.id === out.archived_day_id)
      )
        throw new FamilyApiError(502, 'calendar_insert_reversed', 'Inconsistent already-reversed insertion.');
      return;
    }
    const added = out.added_day_ids[0],
      before = p.observation.days.map((d) => d.id),
      after = out.observation.days.map((d) => d.id),
      expected = [...before];
    expected.splice(p.change.position - 1, 0, added);
    if (
      !out.changed ||
      out.creation_reversed !== false ||
      out.added_day_ids.length !== 1 ||
      before.includes(added) ||
      out.undo_operation_id !== p.operation_id ||
      expected.join() !== after.join() ||
      out.observation.start_at !== p.observation.start_at
    )
      throw new FamilyApiError(
        502,
        'calendar_insert_result',
        'Insertion returned inconsistent calendar or recovery identities.'
      );
  }
}

function validateInsertionUndo(p: CalendarPacket, out: CalendarReceipt) {
  if (p.change.action === 'undo_insert') {
    const removed = p.change.day_id,
      expected = p.observation.days.filter((d) => d.id !== removed).map((d) => d.id),
      after = out.observation.days.map((d) => d.id);
    if (
      !out.changed ||
      out.removed_day_id !== p.change.day_id ||
      out.added_day_ids.length ||
      out.undo_operation_id !== null ||
      after.length !== expected.length ||
      new Set(after).size !== expected.length ||
      after.some((id) => !expected.includes(id)) ||
      out.observation.start_at !== p.observation.start_at
    )
      throw new FamilyApiError(
        502,
        'calendar_undo_insert_result',
        'Insertion Undo returned inconsistent surviving day identities.'
      );
  }
}

function validateDayRemoval(p: CalendarPacket, out: CalendarReceipt) {
  if (p.change.action === 'remove_day' || p.change.action === 'trash_day') {
    if (out.removal_reversed) {
      if (
        out.changed ||
        out.added_day_ids.length ||
        out.undo_operation_id !== null ||
        out.restored_day_id !== p.change.day_id
      )
        throw new FamilyApiError(502, 'calendar_remove_reversed', 'Inconsistent already-restored removal.');
      return;
    }
    const removed = p.change.day_id,
      expected = p.observation.days.filter((d) => d.id !== removed).map((d) => d.id);
    if (
      !out.changed ||
      out.removal_reversed !== false ||
      out.removed_day_id !== removed ||
      out.added_day_ids.length ||
      out.undo_operation_id !== p.operation_id ||
      out.observation.days.map((d) => d.id).join() !== expected.join() ||
      out.observation.start_at !== p.observation.start_at
    )
      throw new FamilyApiError(
        502,
        'calendar_remove_result',
        'Removal returned inconsistent surviving days or Undo identity.'
      );
  }
}
function validateRemovedDayRestore(p: CalendarPacket, out: CalendarReceipt) {
  if (p.change.action === 'restore_removed_day' || p.change.action === 'restore_day') {
    const restored = p.change.day_id,
      after = out.observation.days.map((d) => d.id),
      expected = [...p.observation.days.map((d) => d.id), restored];
    if (
      !out.changed ||
      out.restored_day_id !== restored ||
      out.added_day_ids.length !== 1 ||
      out.added_day_ids[0] !== restored ||
      out.undo_operation_id !== null ||
      new Set(after).size !== expected.length ||
      after.length !== expected.length ||
      after.some((id) => !expected.includes(id)) ||
      out.observation.start_at !== p.observation.start_at
    )
      throw new FamilyApiError(
        502,
        'calendar_day_restore_result',
        'Recovery returned inconsistent restored day identities.'
      );
  }
}

function flexibleCalendarReceipt(p: CalendarPacket, raw: unknown, trip: string): CalendarReceipt {
  const value = z.object({ version: z.literal(2), trip_id: locationId, operation_id: locationId,
    added_day_id: locationId.nullable(), observation: calendarObservation }).parse(raw);
  if (value.trip_id !== trip || value.operation_id !== p.operation_id)
    throw new FamilyApiError(502, 'calendar_result_scope', 'The calendar result belongs to another save.');
  const before = p.observation.days.map((d) => d.id), after = value.observation.days.map((d) => d.id);
  if (new Set(after).size !== after.length || before.some((id) => !after.includes(id)) ||
      (p.change.action === 'append' ? !value.added_day_id || after.length !== before.length + 1 || before.includes(value.added_day_id)
        : value.added_day_id !== null || after.length !== before.length))
    throw new FamilyApiError(502, 'calendar_result_identity', 'The calendar changed day identities unexpectedly.');
  if (p.change.action === 'reorder' && after.join() !== p.change.order.join())
    throw new FamilyApiError(502, 'calendar_result_order', 'The saved day order is inconsistent.');
  if (p.change.action === 'assign_dates') {
    const start = Date.parse(p.change.start_date + 'T00:00:00Z');
    if (after.join() !== before.join() || value.observation.days.some((d, i) =>
      d.civil_day !== new Date(start + i * 86400000).toISOString().slice(0, 10)) ||
      value.observation.start_at?.slice(0,10) !== p.change.start_date ||
      value.observation.end_at?.slice(0,10) !== value.observation.days[value.observation.days.length - 1]?.civil_day)
      throw new FamilyApiError(502, 'calendar_result_dates', 'The saved calendar assignment is inconsistent.');
  }
  return { version: 1, state: 'published', changed: JSON.stringify(p.observation) !== JSON.stringify(value.observation),
    day_id: null, added_day_ids: value.added_day_id ? [value.added_day_id] : [],
    undo_operation_id: null, observation: value.observation };
}

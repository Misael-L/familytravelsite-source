import type { FamilyIdentityRegistry } from './identity';
import { NOT_HANDLED } from './listHandler';
import { locationRpc, savedLocationResponse } from './planLocations';
import { projectPlannerState, type ProjectedPlannerState } from './plannerProjection';
import { plannerStateSchema } from './plannerStateContract';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

export async function readPlannerState(repo: FamilyFrontendRepository, selector: string, signal?: AbortSignal) {
  const session = await repo.session(),
    trip = await repo.tripUuid(selector),
    views = await repo.views();
  const scope = `${session.userId}:${session.familyId}:${session.personId}`;
  let invalidated = false;
  const unsubscribe = repo.subscribe((changed) => {
    if (changed === trip) invalidated = true;
  });
  try {
    const raw = await locationRpc('get_family_trip_planner_state_v1', { p_trip_id: trip });
    if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > 8388608)
      throw new FamilyApiError(502, 'planner_response_too_large', 'The planner response exceeds its bound.');
    const state = savedLocationResponse(plannerStateSchema, raw);
    if (state.trip_id !== trip || state.family_id !== session.familyId)
      throw new FamilyApiError(502, 'invalid_planner_scope', 'The planner service returned another Trip or Family.');
    const fence = async () => {
      const current = await repo.session();
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (
        invalidated ||
        (await repo.views()).ids !== views.ids ||
        `${current.userId}:${current.familyId}:${current.personId}` !== scope
      )
        throw new FamilyApiError(409, 'stale_planner_read', 'The Family session or Trip changed. Reload the planner.');
    };
    await fence();
    const result = await projectPlannerState(state, views.ids, fence);
    await fence();
    return result;
  } catch (error) {
    if (error instanceof FamilyApiError || error instanceof DOMException) throw error;
    const e = error as { code?: string };
    const status =
      e.code === '42501'
        ? 403
        : e.code === '23514'
          ? 409
          : ['22023', '22P02', 'invalid_uuid', 'unknown_view_key'].includes(e.code ?? '')
            ? 400
            : 503;
    throw new FamilyApiError(
      status,
      'planner_' + (e.code ?? 'unavailable'),
      'The planner read is unavailable. No legacy fallback was used.'
    );
  } finally {
    unsubscribe();
  }
}
export async function handleFamilyPlannerState(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(/^\/trips\/([^/]+)\/family\/planner-state$/);
  if (!match) return NOT_HANDLED;
  if (request.method !== 'GET') throw new FamilyApiError(405, 'planner_read_only', 'Planner state is read-only.');
  if (request.query.size)
    throw new FamilyApiError(400, 'invalid_planner_query', 'Planner snapshot does not accept filters.');
  return readPlannerState(repo, match[1], request.signal);
}

/** Explicit rehearsal composition only. Never installed by the default application handler.
 * Blocks native planner writes until their revisions, proposals and offline queues cut over together.
 * No resolved result cache: every new read rechecks DB authority. Concurrent reads share one snapshot.
 */
export function createPlannerReadCoordinator(repo: FamilyFrontendRepository) {
  const pending = new Map<string, Promise<ProjectedPlannerState>>();
  return async (request: FamilyRequest) => {
    const match = request.pathname.match(/^\/trips\/([^/]+)\/(places|days|assignments)(?:\/(.*))?$/);
    if (!match) return NOT_HANDLED;
    if (request.method !== 'GET')
      throw new FamilyApiError(
        409,
        'planner_writes_not_cut_over',
        'Native planner writes are not yet connected to the new identities.'
      );
    if (request.query.size)
      throw new FamilyApiError(400, 'invalid_planner_query', 'Filtered planner reads are not connected.');
    const session = await repo.session(),
      ids = (await repo.views()).ids;
    const scope = `${session.userId}:${session.familyId}:${session.personId}`;
    const trip = await repo.tripUuid(match[1]),
      key = `${scope}:${trip}`;
    let task = pending.get(key);
    if (task === undefined) {
      task = readPlannerState(repo, trip);
      pending.set(key, task);
    }
    let state: ProjectedPlannerState;
    try {
      state = await task;
    } finally {
      if (pending.get(key) === task) pending.delete(key);
    }
    if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const current = await repo.session();
    if (`${current.userId}:${current.familyId}:${current.personId}` !== scope || (await repo.views()).ids !== ids)
      throw new FamilyApiError(409, 'stale_planner_read', 'The Family session changed.');
    return nativeReadResult(state, ids, match[2], match[3]);
  };
}

export function nativeReadResult(
  state: ProjectedPlannerState,
  ids: FamilyIdentityRegistry,
  resource: string,
  suffix?: string
) {
  if (!state.readiness.ready)
    throw new FamilyApiError(
      409,
      'planner_readiness_blocked',
      'Retained planner records require an explicit bridge or classification before cutover.'
    );
  if (!suffix && resource === 'places') return { places: state.native.places };
  if (!suffix && resource === 'days') return { days: state.native.days };
  if (resource === 'places') {
    const id = ids.uuid('place', suffix ?? '');
    const place = state.native.places.find((p) => p.family_location_id === id);
    if (place) return { place };
  }
  if (resource === 'days') {
    const parts = suffix?.split('/') ?? [],
      dayId = ids.uuid('day', parts[0] ?? '');
    const day = state.native.days.find((d) => ids.uuid('day', d.id) === dayId);
    if (day && parts.length === 2 && parts[1] === 'assignments') return { assignments: day.assignments };
  }
  throw new FamilyApiError(404, 'planner_resource_unavailable', 'This planner resource is unavailable.');
}

import { stayAuthIdentity, type StayAuthIdentity, type StayRpc } from '@family/backend/supabase/stayRpc';
import { useTripStore } from '../../store/tripStore';
import { captureReadSession } from '../../sync/readSession';
import { captureWriteSession } from '../../sync/writeSession';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { NOT_HANDLED } from './listHandler';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { stayIdentity, stayScope } from './stayContract';
import { createStayTransport, originalStay } from './stayTransport';
import type { FamilyRequest } from './transport';
function routeShape(request: FamilyRequest, suffix: string | undefined, hasId: boolean) {
  const verb = suffix ?? (hasId ? 'editor' : 'list'),
    write = ['commands', 'outcome', 'cancel'].includes(verb);
  if (request.method !== (write ? 'POST' : 'GET') || request.headers?.['x-base-updated-at'])
    throw new FamilyApiError(400, 'stay_request_shape', 'Use a versioned original stay request.');
  const allowed = verb === 'context' ? ['location', 'booking'] : verb === 'history' ? ['before', 'limit'] : [];
  if ([...request.query.keys()].some((k) => !allowed.includes(k) || request.query.getAll(k).length !== 1))
    throw new FamilyApiError(400, 'stay_query', 'Unknown or duplicate stay query.');
  return { verb, write };
}
function historyNumber(query: URLSearchParams, key: string, fallback: number | null) {
  const raw = query.get(key);
  if (raw === null) return fallback;
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    throw new FamilyApiError(400, 'stay_history_cursor', 'Use a positive bounded history cursor.');
  return Number(raw);
}
function validateOriginal(
  p: ReturnType<typeof originalStay>,
  id: string,
  scope: ReturnType<typeof stayScope.parse>,
  context: { origin: string; request: FamilyRequest; verb: string }
) {
  const { origin, request, verb } = context;
  const c = p.command,
    trip = scope.trip_id,
    e = scope,
    initialAuth = { session_id: scope.session_id };
  if (
    p.source_url !== origin ||
    c.stay_id !== id ||
    c.scope.trip_id !== trip ||
    c.scope.user_id !== e.user_id ||
    c.scope.family_id !== e.family_id ||
    c.scope.person_id !== e.person_id ||
    request.headers?.['x-idempotency-key'] !== c.operation_id ||
    (verb === 'commands' && c.scope.session_id !== initialAuth.session_id)
  )
    throw new FamilyApiError(409, 'stay_original_context', 'The original stay operation cannot be rebound.');
}
/** Versioned private stay protocol only. Native accommodations/compound creates stay refused. */
export function createStayHandler(
  repo: FamilyFrontendRepository,
  source = getSupabaseUrl,
  rpc?: StayRpc,
  auth = stayAuthIdentity
) {
  const transport = createStayTransport(rpc);
  return async (request: FamilyRequest) => {
    const m = request.pathname.match(
      /^\/trips\/([^/]+)\/family\/stays(?:\/([^/]+)(?:\/(context|history|commands|outcome|cancel))?)?$/
    );
    if (!m) return NOT_HANDLED;
    const { verb, write } = routeShape(request, m[3], !!m[2]);
    const owner = write ? captureWriteSession() : captureReadSession(),
      origin = source(),
      actor = repo.captureContext(undefined, { revision: false }),
      openingTrip = useTripStore.getState().trip?.id;
    let checkTrip = () => {};
    const check = () => {
      owner.assertCurrent();
      actor.assertCurrent();
      checkTrip();
      if (source() !== origin || request.signal?.aborted || useTripStore.getState().trip?.id !== openingTrip)
        throw new FamilyApiError(409, 'stay_context_changed', 'The original stay context changed.');
    };
    check();
    const initialAuth = await auth();
    check();
    const session = await repo.session();
    check();
    const trip = await repo.tripUuid(m[1]);
    check();
    checkTrip = repo.captureContext(trip, { revision: false }).assertCurrent;
    const ids = (await repo.views()).ids;
    check();
    const id = m[2] ? ids.uuid('stay', m[2]) : '';
    const selected = (kind: 'place' | 'reservation', key: string) => {
      const value = request.query.get(key);
      return value === null ? null : ids.uuid(kind, value);
    };
    const e = stayIdentity.parse({
      trip_id: trip,
      family_id: session.familyId,
      user_id: session.userId,
      person_id: session.personId,
    });
    const currentScope = () =>
      stayScope.parse({ ...e, version: 1, layer: 'published', session_id: initialAuth.session_id });
    const fence = async () => {
      check();
      const a: StayAuthIdentity = await auth();
      check();
      const s = await repo.session();
      check();
      if (
        a.user_id !== initialAuth.user_id ||
        a.session_id !== initialAuth.session_id ||
        a.user_id !== e.user_id ||
        s.userId !== e.user_id ||
        s.familyId !== e.family_id ||
        s.personId !== e.person_id ||
        ids !== repo.knownViews()?.ids ||
        repo.getLayer(trip) !== 'published' ||
        (openingTrip !== undefined && String(openingTrip) !== String(ids.register('trip', trip)))
      )
        throw new FamilyApiError(409, 'stay_session_changed', 'The original stay session ended.');
    };
    await fence();
    let result: unknown;
    if (write) {
      const p = originalStay(request.body);
      validateOriginal(p, id, currentScope(), { origin, request, verb });
      result =
        verb === 'commands'
          ? await transport.execute(p)
          : await transport.outcome(p, currentScope(), verb === 'cancel');
    } else if (verb === 'list') result = await transport.list(e);
    else if (verb === 'editor') result = await transport.editor(e, id);
    else if (verb === 'context')
      result = await transport.context(
        currentScope(),
        id,
        selected('place', 'location'),
        selected('reservation', 'booking')
      );
    else {
      result = await transport.history(
        e,
        id,
        historyNumber(request.query, 'before', null),
        historyNumber(request.query, 'limit', 50) ?? 50
      );
    }
    await fence();
    if (write) repo.invalidate(trip); // Invalidate only; old receipt contents never populate current caches.
    return result;
  };
}
export async function handleFamilyStays(repo: FamilyFrontendRepository, request: FamilyRequest) {
  return createStayHandler(repo)(request);
}

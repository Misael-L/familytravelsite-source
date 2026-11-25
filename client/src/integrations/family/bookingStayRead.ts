import { bookingStayReadRpc } from '@family/backend/supabase/bookingStayReadRpc';
import { nativeStayRpc } from '@family/backend/supabase/nativeStayRpc';
import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { checkedBookingStayView } from './bookingStayContract';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { NOT_HANDLED } from './listHandler';
import { checkedNativeStayView } from './nativeStayReadContract';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { stayIdentity, stayJson } from './stayContract';
import type { FamilyRequest } from './transport';
type Dependencies = { source?: () => string; auth?: typeof stayAuthIdentity; rpc?: typeof bookingStayReadRpc };
type NativeDependencies = Omit<Dependencies, 'rpc'> & { rpc?: (trip: string) => Promise<unknown> };
/** No independent stay/booking requests, optimistic publication, cache fallback or native activation. */
function createReader(
  repo: FamilyFrontendRepository,
  dependencies: Dependencies,
  native: false
): (selector: number | string, signal?: AbortSignal) => Promise<ReturnType<typeof checkedBookingStayView>>;
function createReader(
  repo: FamilyFrontendRepository,
  dependencies: Dependencies,
  native: true
): (selector: number | string, signal?: AbortSignal) => Promise<ReturnType<typeof checkedNativeStayView>>;
function createReader(repo: FamilyFrontendRepository, dependencies: Dependencies, native: boolean) {
  const source = dependencies.source ?? getSupabaseUrl,
    auth = dependencies.auth ?? stayAuthIdentity,
    rpc = dependencies.rpc ?? bookingStayReadRpc;
  return async (selector: number | string, signal?: AbortSignal) => {
    const owner = captureReadSession(),
      actor = repo.captureContext(undefined, { revision: false }),
      origin = source(),
      openingTrip = useTripStore.getState().trip?.id;
    const check = () => {
      owner.assertCurrent();
      actor.assertCurrent();
      if (origin !== source() || signal?.aborted || openingTrip !== useTripStore.getState().trip?.id)
        throw new FamilyApiError(409, 'booking_stay_scope', 'The original coherent read scope ended.');
      if (isEffectivelyOffline())
        throw new FamilyApiError(503, 'booking_stay_offline', 'A complete booking/stay read needs a connection.');
    };
    check();
    const opening = await auth();
    check();
    const session = await repo.session();
    check();
    const trip = await repo.tripUuid(selector);
    check();
    const context = repo.captureContext(trip);
    const ids = (await repo.views()).ids;
    check();
    const expected = stayIdentity.parse({
      trip_id: trip,
      family_id: session.familyId,
      user_id: session.userId,
      person_id: session.personId,
    });
    const fence = async () => {
      check();
      context.assertCurrent();
      const current = await auth();
      check();
      context.assertCurrent();
      const now = await repo.session();
      check();
      context.assertCurrent();
      if (
        stayJson(current) !== stayJson(opening) ||
        current.user_id !== expected.user_id ||
        now.userId !== expected.user_id ||
        now.familyId !== expected.family_id ||
        now.personId !== expected.person_id ||
        ids !== repo.knownViews()?.ids ||
        repo.getLayer(trip) !== 'published'
      )
        throw new FamilyApiError(409, 'booking_stay_session', 'The original coherent read session changed.');
    };
    await fence();
    let raw: unknown;
    try {
      raw = await rpc(trip);
    } catch (e) {
      await fence();
      const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
      const statuses: Record<string, number> = {
        '42501': 403,
        PGRST301: 401,
        PGRST302: 401,
        PGRST303: 401,
        PGRST202: 503,
        '54000': 413,
        '23514': 422,
        PT409: 409,
      };
      if (Object.prototype.hasOwnProperty.call(statuses, code))
        throw new FamilyApiError(
          statuses[code],
          'booking_stay_refused',
          'The complete booking/stay read was refused or unavailable.'
        );
      throw e;
    }
    await fence();
    return native ? checkedNativeStayView(raw, expected) : checkedBookingStayView(raw, expected);
  };
}
export function createBookingStayReader(repo: FamilyFrontendRepository, dependencies: Dependencies = {}) {
  return createReader(repo, dependencies, false);
}
/** Explicit service only; no native loader, default route or feature switch is installed here. */
export function createNativeStayReader(repo: FamilyFrontendRepository, dependencies: NativeDependencies = {}) {
  return createReader(
    repo,
    {
      ...dependencies,
      rpc: dependencies.rpc ?? ((trip) => nativeStayRpc('get_family_native_stay_view_v1', { p_trip_id: trip })),
    },
    true
  );
}
export async function handleFamilyBookingStayView(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const m = request.pathname.match(/^\/trips\/([^/]+)\/family\/booking-stay-view-v2$/);
  if (!m) return NOT_HANDLED;
  if (request.method !== 'GET' || request.query.size || request.body != null)
    throw new FamilyApiError(400, 'booking_stay_request', 'Use a complete published booking/stay read.');
  return createBookingStayReader(repo)(m[1], request.signal);
}

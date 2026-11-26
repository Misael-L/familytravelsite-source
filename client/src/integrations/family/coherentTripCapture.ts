import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import type { BookingStayView } from './bookingStayContract';
import { createBookingStayReader, createNativeStayReader } from './bookingStayRead';
import { coherentStayQualificationEnabled } from './coherentStayQualification';
import { serializeCompleteTripV4, type CompleteTripV4, type CompleteTripV4Data } from './completeTripV4';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { checkedNativeStayView } from './nativeStayReadContract';
import { guardedPlannerCache, plannerCacheDb } from './plannerCache';
import { withdrawCompleteTripGeneration } from './plannerCompleteStorage';
import { guardedPlannerRead, type PlannerReadGuard } from './plannerReadGuard';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { stayJson } from './stayContract';
type Ancillary = Omit<CompleteTripV4Data, 'core' | 'native_stay_format'>;
type Loader = (core: BookingStayView, fence: () => Promise<void>, guard: PlannerReadGuard) => Promise<Ancillary>;
/** Explicit producer for one canonical core plus independently validated ancillary modules. Does not install native ports. */
export function createCoherentTripCapture(
  repo: FamilyFrontendRepository,
  options: {
    source?: () => string;
    now?: () => number;
    read?: ReturnType<typeof createBookingStayReader>;
    nativeRead?: ReturnType<typeof createNativeStayReader>;
    auth?: typeof stayAuthIdentity;
  } = {}
) {
  if (options.read && options.nativeRead) throw new Error('Select exactly one coherent core dialect.');
  const source = options.source ?? getSupabaseUrl,
    now = options.now ?? Date.now,
    read = options.read ?? createBookingStayReader(repo),
    auth = options.auth ?? stayAuthIdentity;
  return async (selector: number | string, load: Loader, signal?: AbortSignal, inherited?: PlannerReadGuard) => {
    if (!coherentStayQualificationEnabled())
      throw new Error('Coherent capture requires the explicit local qualification build.');
    const readSession = captureReadSession(),
      origin = source(),
      actor = repo.captureContext(undefined, { revision: false });
    const opening = await auth(),
      selectedTrip = useTripStore.getState().trip?.id;
    const session = await repo.session(),
      trip = await repo.tripUuid(selector),
      ids = (await repo.views()).ids,
      context = repo.captureContext(trip),
      capturedAt = now();
    const blocked = () =>
      new FamilyApiError(409, 'coherent_capture_changed', 'The original coherent Trip capture ended.');
    const localScope = (selection = selectedTrip) => {
      readSession.assertCurrent();
      actor.assertCurrent();
      context.assertCurrent();
      if (
        signal?.aborted ||
        !coherentStayQualificationEnabled() ||
        origin !== source() ||
        origin !== getSupabaseUrl() ||
        selection !== useTripStore.getState().trip?.id ||
        ids !== repo.knownViews()?.ids ||
        repo.getLayer(trip) !== 'published'
      )
        throw blocked();
    };
    const local = () => {
      localScope();
      if (isEffectivelyOffline()) throw blocked();
    };
    const checkIdentity = async (check: () => void) => {
      check();
      const currentAuth = await auth();
      check();
      if (stayJson(currentAuth) !== stayJson(opening) || currentAuth.user_id !== session.userId) throw blocked();
      const current = await repo.session();
      check();
      if (
        current.userId !== session.userId ||
        current.familyId !== session.familyId ||
        current.personId !== session.personId
      )
        throw blocked();
    };
    const fence = () => checkIdentity(local);
    // Only retain original local intent after an already accepted online read. No offline capture/read authority.
    const originalIntentFence = () => checkIdentity(() => localScope(ids.register('trip', trip)));
    await fence();
    return guardedPlannerRead(
      readSession,
      { uuid: trip, native: ids.register('trip', trip) },
      blocked,
      async (guard) => {
        const scope = {
          trip_id: trip,
          family_id: session.familyId,
          person_id: session.personId,
          user_id: session.userId,
          layer: 'published' as const,
        };
        const lease = await guardedPlannerCache(guard, origin, scope, { now, blocked, fence: local });
        let committed: CompleteTripV4 | undefined;
        try {
          const native = options.nativeRead
            ? checkedNativeStayView(await options.nativeRead(trip, signal), scope)
            : null;
          const core = structuredClone(native ? native.core : await read(trip, signal));
          await fence();
          const ancillary = await load(structuredClone(core), fence, guard);
          await fence();
          if ('core' in ancillary || 'native_stay_format' in ancillary)
            throw new Error('Ancillary reads cannot replace the canonical core.');
          const envelope = await serializeCompleteTripV4({
            source: origin,
            scope,
            ownership: lease.completeOwnership(),
            capturedAt,
            verifiedAt: now(),
            data: { ...ancillary, core, ...(native ? { native_stay_format: native.format } : {}) },
          });
          await fence();
          await lease.commitComplete(envelope);
          committed = envelope;
          await fence();
          return { envelope, fence, originalIntentFence };
        } catch (error) {
          if (committed) await withdrawCompleteTripGeneration(plannerCacheDb, committed);
          const e = error as { status?: number; code?: string };
          if (!committed && (e?.status === 401 || e?.status === 403 || ['42501', 'PGRST301'].includes(e?.code ?? '')))
            await lease.evict();
          throw error;
        }
      },
      inherited
    );
  };
}

import { offlineSessionEpoch } from '../../db/offlineDb';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { NOT_HANDLED } from './listHandler';
import { checkedCachedPlanner, guardedPlannerCache, plannerCacheKey, type CachedPlanner } from './plannerCache';
import { completeTripCapture } from './plannerCompleteCapture';
import { projectPlannerState } from './plannerProjection';
import { guardedPlannerRead, type PlannerReadGuard } from './plannerReadGuard';
import { nativeReadResult } from './plannerState';
import { checkedPlannerView, plannerLayer, type PlannerScope } from './plannerViewContract';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

class NetworkUnavailable extends Error {}
type Options = { source?: () => string; now?: () => number; offline?: () => boolean };
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await getSupabaseBrowserClient().rpc(name, args);
  if (r.error) {
    if (r.status === 0) throw new NetworkUnavailable();
    const status = r.status >= 400 ? r.status : r.error.code === '42501' ? 403 : r.error.code === '54000' ? 409 : 503;
    throw new FamilyApiError(status, 'planner_' + r.error.code, 'The planner service refused the read.');
  }
  return r.data as unknown;
}
async function fetchPlannerView(scope: PlannerScope): Promise<CachedPlanner> {
  const raw = await rpc('get_family_trip_planner_view_v1', { p_trip_id: scope.trip_id, p_layer: scope.layer });
  if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > 8388608)
    throw new FamilyApiError(502, 'planner_response_too_large', 'The planner response exceeds its bound.');
  const view = checkedPlannerView(raw, scope);
  if (!view.readiness.ready)
    throw new FamilyApiError(
      409,
      'planner_private_intent_blocked',
      'Pending planner work requires explicit resolution.'
    );
  const media = [...new Set(view.state.locations.flatMap((l) => (l.cover_media_id ? [l.cover_media_id] : [])))];
  const rows = media.length
    ? await rpc('catalog_media_variants_for_assets', { p_media_ids: media, p_recipe: 'v1' })
    : [];
  if (!Array.isArray(rows)) throw new FamilyApiError(502, 'invalid_planner_media', 'Invalid variant response.');
  return checkedCachedPlanner(
    {
      view,
      variants: rows.map((v: Record<string, unknown>) => ({
        mediaAssetId: v.media_asset_id,
        canonicalUrl: v.public_url,
        thumbUrl: v.thumb_url,
        heroUrl: v.hero_url,
        recipeVersion: v.recipe_version,
      })),
    },
    scope
  );
}
function readScope(
  session: { userId: string; familyId: string; personId: string },
  trip: string,
  layer: PlannerScope['layer']
): PlannerScope {
  return { user_id: session.userId, family_id: session.familyId, person_id: session.personId, trip_id: trip, layer };
}
type PlannerRead = ReturnType<typeof createPlannerViewReader>['read'];
async function plannerViewRequest(read: PlannerRead, request: FamilyRequest) {
  const m = request.pathname.match(/^\/trips\/([^/]+)\/family\/planner-view$/);
  if (!m) return NOT_HANDLED;
  if (request.method !== 'GET') throw new FamilyApiError(405, 'planner_read_only', 'Planner views are read-only.');
  if ([...request.query.keys()].some((k) => k !== 'layer') || request.query.getAll('layer').length > 1)
    throw new FamilyApiError(400, 'invalid_planner_query', 'Only one layer is accepted.');
  const l = plannerLayer.safeParse(request.query.get('layer') ?? 'published');
  if (!l.success) throw new FamilyApiError(400, 'invalid_planner_layer', 'Unknown planner layer.');
  return read(m[1], l.data, request.signal);
}
async function plannerNativeRequest(repo: FamilyFrontendRepository, read: PlannerRead, request: FamilyRequest) {
  const m = request.pathname.match(/^\/trips\/([^/]+)\/(places|days|assignments)(?:\/(.*))?$/);
  if (!m) return NOT_HANDLED;
  if (request.method !== 'GET')
    throw new FamilyApiError(409, 'planner_writes_not_cut_over', 'Native planner writes are not cut over.');
  if (request.query.size) throw new FamilyApiError(400, 'invalid_planner_query', 'Filtered reads are not connected.');
  const result = await read(m[1], undefined, request.signal);
  return nativeReadResult(result.state, (await repo.views()).ids, m[2], m[3]);
}
type GuardedCache = Awaited<ReturnType<typeof guardedPlannerCache>>;
async function currentCachedPlanner(cache: GuardedCache, fence: () => Promise<void>) {
  const pair = await cache.read();
  await fence();
  if (!pair)
    throw new FamilyApiError(503, 'planner_offline_unavailable', 'No current snapshot exists for this planner scope.');
  return pair;
}
async function currentProjectedPlanner({
  pair,
  views,
  fence,
  repo,
  trip,
  cache,
}: {
  pair: CachedPlanner;
  views: Awaited<ReturnType<FamilyFrontendRepository['views']>>;
  fence: () => Promise<void>;
  repo: FamilyFrontendRepository;
  trip: string;
  cache: GuardedCache;
}) {
  const state = await projectPlannerState(
    pair.view.state,
    views.ids,
    fence,
    new Map(pair.variants.map((v) => [v.mediaAssetId, v]))
  );
  await fence();
  if (!state.readiness.ready) {
    repo.invalidate(trip);
    await cache.evict();
    throw new FamilyApiError(
      409,
      'planner_readiness_blocked',
      'Retained records require explicit classification or bridging.'
    );
  }
  return state;
}
/** Read-only cutover rehearsal. Never installs itself in native lists or bundle/writer dispatch. */
export function createPlannerViewReader(repo: FamilyFrontendRepository, options: Options = {}) {
  const pending = new Map<string, Promise<CachedPlanner>>(),
    epochs = new Map<string, number>(),
    cleanEpoch = new Map<string, number>();
  const source = options.source ?? getSupabaseUrl,
    now = options.now ?? Date.now,
    offline = options.offline ?? isEffectivelyOffline;
  let disposed = false;
  const unsubscribe = repo.subscribe((trip) => {
    epochs.set(trip, (epochs.get(trip) ?? 0) + 1);
  });
  async function read(
    selector: string | number,
    layer?: PlannerScope['layer'],
    signal?: AbortSignal,
    inherited?: PlannerReadGuard
  ) {
    const privateSession = captureReadSession(),
      privateEpoch = offlineSessionEpoch();
    let releaseTask = () => {};
    const session = await repo.session(),
      trip = await repo.tripUuid(selector),
      views = await repo.views();
    const scope = readScope(session, trip, layer ?? repo.getLayer(trip));
    const origin = source(),
      key = plannerCacheKey(origin, scope),
      epoch = epochs.get(trip) ?? 0;
    const repositoryContext = repo.captureContext(undefined, { revision: false });
    const localFence = (checkInvalidation = true) => {
      privateSession.assertCurrent();
      repositoryContext.assertCurrent();
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (
        disposed ||
        source() !== origin ||
        (checkInvalidation && (epochs.get(trip) ?? 0) !== epoch) ||
        repo.knownViews()?.ids !== views.ids ||
        (!layer && repo.getLayer(trip) !== scope.layer)
      )
        throw new FamilyApiError(409, 'stale_planner_view', 'The planner scope changed. Reload it.');
    };
    const fence = async () => {
      localFence();
      const current = await repo.session();
      assertPlannerSession(current, scope);
      localFence();
    };
    const blocked = () =>
      new FamilyApiError(
        409,
        'planner_local_work',
        'Planner refresh is held to preserve local work. Resolve pending commands or retry after editing.'
      );
    return guardedPlannerRead(
      privateSession,
      { uuid: trip, native: views.ids.register('trip', trip) },
      blocked,
      async (guard) => {
        const cache = await guardedPlannerCache(guard, origin, scope, { now, blocked, fence: () => localFence(false) });

        const capturedAt = now();
        await fence();
        const cached = () => currentCachedPlanner(cache, fence);
        let pair: CachedPlanner,
          fresh = false;
        // Invalidation is checked before every cache access, including the offline path.
        if (epoch > 0 && cleanEpoch.get(key) !== epoch) {
          await cache.evict();
          await fence();
          cleanEpoch.set(key, epoch);
        }
        if (offline()) pair = await cached();
        else {
          const taskKey = key + ':' + epoch + ':' + privateEpoch;
          let task = pending.get(taskKey);
          if (task === undefined) {
            task = fetchPlannerView(scope);
            pending.set(taskKey, task);
          }
          releaseTask = () => {
            if (pending.get(taskKey) === task) pending.delete(taskKey);
          };
          try {
            pair = await task;
            fresh = true;
          } catch (error) {
            await fence();
            if (error instanceof NetworkUnavailable) pair = await cached();
            else {
              repo.invalidate(trip);
              await cache.evict();
              throw error;
            }
          }
        }
        await fence();
        const state = await currentProjectedPlanner({ pair, views, fence, repo, trip, cache });
        // One transaction plus a final fence prevents a late write from surviving a scope change.
        if (fresh) {
          await cache.write(pair, localFence);
          cleanEpoch.set(key, epoch);
        }
        return {
          ...pair.view,
          state,
          cache_scope: key,
          [completeTripCapture]: fresh ? { pair, lease: cache, capturedAt } : undefined,
        };
      },
      inherited
    ).finally(() => releaseTask());
  }

  return {
    read,
    handle: (request: FamilyRequest) => plannerViewRequest(read, request),
    native: (request: FamilyRequest) => plannerNativeRequest(repo, read, request),
    dispose: () => {
      disposed = true;
      unsubscribe();
      pending.clear();
    },
  };
}
const readers = new WeakMap<FamilyFrontendRepository, ReturnType<typeof createPlannerViewReader>>();
export async function handleFamilyPlannerView(repo: FamilyFrontendRepository, request: FamilyRequest) {
  if (!/^\/trips\/[^/]+\/family\/planner-view$/.test(request.pathname)) return NOT_HANDLED;
  let reader = readers.get(repo);
  if (!reader) {
    reader = createPlannerViewReader(repo);
    readers.set(repo, reader);
  }
  return reader.handle(request);
}

function assertPlannerSession(current: import('./repository').FamilySession, scope: PlannerScope) {
  if (current.userId !== scope.user_id || current.familyId !== scope.family_id || current.personId !== scope.person_id)
    throw new FamilyApiError(409, 'stale_planner_view', 'The planner scope changed. Reload it.');
}

import { createNativeStayReader } from './bookingStayRead';
import { coherentStayQualificationEnabled, nativeStayCommandQualificationEnabled } from './coherentStayQualification';
import { createCoherentTripCapture } from './coherentTripCapture';
import { completeTripHeader, readCompleteTripCompanions } from './completeTripCompanions';
import { projectCompleteTrip } from './completeTripProjection';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import { observeNativeStays } from './nativeStayObservation';
import { nativeStayReadiness } from './nativeStayReadiness';
import { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import { plannerCacheDb } from './plannerCache';
import { withdrawCompleteTripGeneration } from './plannerCompleteStorage';
import { createPlannerPackingReader } from './plannerPacking';
import type { PlannerReadGuard } from './plannerReadGuard';
import { createPlannerTaskReader } from './plannerTasks';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

const withdrawals = new WeakMap<object, () => Promise<void>>();
/** Retract only this bundle's exact generation if its native publication fails. */
export async function withdrawCoherentPlannerBundle(bundle: object) {
  await withdrawals.get(bundle)?.();
}

/** Actual Family loaders, one canonical core flight, one v4 generation. No native markup or write admission. */
export function createCoherentPlannerBundle(
  repo: FamilyFrontendRepository,
  disposed: () => boolean,
  source: () => string
) {
  const nativeArrivals = nativeStayCommandQualificationEnabled(),
    capture = createCoherentTripCapture(repo, {
      source,
      ...(nativeArrivals ? { nativeRead: createNativeStayReader(repo, { source }) } : {}),
    }),
    tasks = createPlannerTaskReader(repo, disposed, source),
    packing = createPlannerPackingReader(repo, disposed, source, undefined, createPackingCategoryV2Transport());
  return async (selector: number | string, signal?: AbortSignal, inherited?: PlannerReadGuard) => {
    const captured = await capture(
      selector,
      async (core, fence, guard) => {
        const check = async () => {
          await fence();
          if (disposed()) throw new FamilyApiError(409, 'coherent_bundle_disposed', 'The planner read ended.');
        };
        const ids = (await repo.views()).ids;
        const ready = nativeStayReadiness(core, ids, { nativeArrivals });
        if (ready.status === 'unsupported')
          throw Object.assign(
            new FamilyApiError(
              409,
              'native_stay_unrepresentable',
              'These stays need native date/clock support before they can be displayed without losing facts.'
            ),
            { blockers: ready.blockers }
          );
        const [rawHeader, todo, bag, companions] = await Promise.all([
          repo.readers.trips.fetchTripById(core.trip_id),
          tasks.read(core.trip_id, signal, guard),
          packing.read(core.trip_id, signal, guard),
          readCompleteTripCompanions(core.trip_id, core.family_id, check),
        ]);
        await check();
        await todo.fence();
        await bag.fence();
        if (!rawHeader)
          throw new FamilyApiError(403, 'coherent_header_missing', 'The original Trip header is unavailable.');
        const header = completeTripHeader.parse(
          Object.fromEntries(
            Object.keys(completeTripHeader.shape).map((k) => [k, (rawHeader as unknown as Record<string, unknown>)[k]])
          )
        );
        if (bag.categoryPacket?.version !== 2) throw new Error('A coupled packing category v2 packet is required.');
        const media = [
          ...new Set(core.planner.state.locations.flatMap((l) => (l.cover_media_id ? [l.cover_media_id] : []))),
        ];
        const rows = media.length
          ? await getSupabaseBrowserClient().rpc('catalog_media_variants_for_assets', {
              p_media_ids: media,
              p_recipe: 'v1',
            })
          : { data: [], error: null };
        await check();
        if (rows.error) throw rows.error;
        if (!Array.isArray(rows.data)) throw new Error('Complete stored variant descriptors required.');
        const variants = rows.data.map((v) => ({
          mediaAssetId: v.media_asset_id,
          canonicalUrl: v.public_url ?? null,
          thumbUrl: v.thumb_url ?? null,
          heroUrl: v.hero_url ?? null,
          recipeVersion: v.recipe_version ?? null,
        }));
        return {
          header,
          tasks: todo.packet,
          packing: bag.packet,
          packing_categories_v2: bag.categoryPacket,
          companions,
          variants,
        };
      },
      signal,
      inherited
    );
    try {
      await captured.fence();
      const projected = await projectCompleteTrip(captured.envelope, () => {
        if (disposed() || !coherentStayQualificationEnabled() || signal?.aborted)
          throw new Error('The coherent planner projection ended.');
      });
      await captured.fence();
      const ids = (await repo.views()).ids;
      for (const b of captured.envelope.bindings)
        if (ids.register(b.kind as import('./identity').IdentityKind, b.uuid) !== b.key)
          throw new Error('Coherent identities changed.');
      if (!projected.accommodations) throw new Error('Coherent native stay read admission is missing.');
      observeNativeStays(projected.accommodations, captured.envelope.data.core, captured.originalIntentFence);
      const result = {
        ...projected.bundle,
        familyPackingProjection: projected.packing,
        familyStayProjection: { accommodations: projected.accommodations, generation: captured.envelope.generation },
      };
      withdrawals.set(result, () => withdrawCompleteTripGeneration(plannerCacheDb, captured.envelope));
      return result;
    } catch (error) {
      await withdrawCompleteTripGeneration(plannerCacheDb, captured.envelope);
      throw error;
    }
  };
}

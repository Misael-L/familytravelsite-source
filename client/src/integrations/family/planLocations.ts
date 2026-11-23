import { catalogKey } from '@family/backend/supabase/catalogDiscovery';
import { ZodError, type ZodType } from 'zod';
import type { Place } from '../../types';
import type { FamilyIdentityRegistry } from './identity';
import {
  listCatalogVariantsForAssets,
  type CatalogVariantDescriptor,
} from './legacy/data/supabase/catalogExploreMedia';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import { locationDetailSchema, locationPageSchema, type PlanLocation } from './planLocationContract';
import type { PublicVariantResolver } from './publicVariantImages';
import { FamilyApiError } from './repository';

export async function locationRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
}
export function savedLocationResponse<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError)
      throw new FamilyApiError(
        502,
        'invalid_saved_location_response',
        'The saved location service returned an invalid response.'
      );
    throw error;
  }
}
function readyV1(url: string | null | undefined, recipe: string | null | undefined): string | null {
  if (!url || recipe !== 'v1') return null;
  try {
    const parsed = new URL(url),
      path = parsed.pathname;
    return ['http:', 'https:'].includes(parsed.protocol) &&
      path.includes('/object/public/catalog/variants/v1/') &&
      !path.includes('/render/image/')
      ? url
      : null;
  } catch {
    return null;
  }
}
export async function projectPlanLocations(
  rows: PlanLocation[],
  ids: FamilyIdentityRegistry,
  beforeRegister?: () => Promise<void>,
  suppliedVariants?: Map<string, CatalogVariantDescriptor>,
  display?: PublicVariantResolver
) {
  const variants =
    suppliedVariants ??
    (await listCatalogVariantsForAssets(rows.flatMap((row) => (row.cover_media_id ? [row.cover_media_id] : []))));
  const displays = new Map<string, string | null>();
  if (display) {
    for (const row of rows) {
      const variant = row.cover_media_id ? variants.get(row.cover_media_id) : undefined;
      const hero = readyV1(variant?.heroUrl, variant?.recipeVersion);
      displays.set(
        row.id,
        hero && row.cover_media_id
          ? await display({ mediaAssetId: row.cover_media_id, recipe: 'v1', role: 'hero', url: hero })
          : null
      );
    }
  }
  await beforeRegister?.();
  return rows.map((row) => {
    const variant = row.cover_media_id ? variants.get(row.cover_media_id) : undefined;
    const hero = readyV1(variant?.heroUrl, variant?.recipeVersion),
      thumb = readyV1(variant?.thumbUrl, variant?.recipeVersion);
    const category = row.category
      ? {
          id: ids.register('category', row.category.id),
          name: row.category.name,
          color: row.category.color,
          icon: row.category.icon,
        }
      : null;
    const native: Place = {
      id: ids.register('place', row.id),
      trip_id: ids.register('trip', row.trip_id),
      name: row.name,
      osm_id:
        row.source.kind !== 'manual' && row.source.id ? catalogKey({ kind: row.source.kind, id: row.source.id }) : null,
      description: row.description,
      notes: row.notes,
      lat: row.latitude,
      lng: row.longitude,
      address: row.address,
      website: row.website,
      phone: row.phone,
      image_url: display ? (displays.get(row.id) ?? null) : hero,
      category_id: category?.id ?? null,
      category,
      tags: [],
    };
    return { ...row, thumb_url: thumb, hero_url: hero, native_place: native };
  });
}
export async function listPlanLocations(
  trip: string,
  ids: FamilyIdentityRegistry,
  options: { state: string; after: string | null; limit: number }
) {
  const page = savedLocationResponse(
    locationPageSchema,
    await locationRpc('list_family_trip_locations_v1', {
      p_trip_id: trip,
      p_state: options.state,
      p_limit: options.limit,
      p_after_id: options.after,
    })
  );
  return { ...page, locations: await projectPlanLocations(page.locations, ids) };
}
export async function getPlanLocation(trip: string, id: string, ids: FamilyIdentityRegistry) {
  const detail = savedLocationResponse(
    locationDetailSchema,
    await locationRpc('get_family_trip_location_v1', { p_trip_id: trip, p_location_id: id })
  );
  return { ...detail, location: (await projectPlanLocations([detail.location], ids))[0] };
}

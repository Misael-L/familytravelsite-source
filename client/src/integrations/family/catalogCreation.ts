import { catalogDetail, parseCatalogKey, type CatalogHit } from '@family/backend/supabase/catalogDiscovery';
import type { PlaceSubmitData } from '../../types/placeForm';
import type { FamilyIdentityRegistry } from './identity';
import type { FormValues } from './locationFormContract';
import { nativeLocationValues } from './nativeLocationForm';
import { FamilyApiError } from './repository';

export { catalogDetail, parseCatalogKey };
/** Catalog identity is authoritative; unedited fields continue inheriting catalog data. */
export function catalogLocationCreate(
  data: Omit<PlaceSubmitData, 'place_time' | 'end_time' | 'assignment_notes'>,
  hit: CatalogHit,
  ids: FamilyIdentityRegistry,
  blank: FormValues
) {
  const values = nativeLocationValues(
    { ...data, osm_id: undefined },
    { shown: blank },
    { image_url: hit.heroUrl },
    ids
  );
  const result: Record<string, unknown> = {
    source: { kind: hit.kind, id: hit.id },
    notes: values.notes || null,
    family_place_category_id: values.family_place_category_id,
  };
  const fields = [
    ['label', 'name', hit.name],
    ['description_override', 'description', hit.description],
    ['address', 'address', hit.address],
    ['website', 'website', hit.website],
    ['phone', 'phone', hit.phone],
    ['latitude', 'latitude', hit.latitude],
    ['longitude', 'longitude', hit.longitude],
  ] as const;
  for (const [target, key, inherited] of fields) {
    const value = values[key],
      originKey = key === 'latitude' ? 'lat' : key === 'longitude' ? 'lng' : key;
    const intentional = data.fieldOrigins?.[originKey as keyof typeof data.fieldOrigins] === 'user';
    if (value !== inherited && (intentional || (value !== null && value !== ''))) result[target] = value;
  }
  return result;
}
export function requireCatalogHit(hit: CatalogHit | null): CatalogHit {
  if (!hit)
    throw new FamilyApiError(409, 'catalog_unavailable', 'The selected catalog location is no longer available.');
  return hit;
}

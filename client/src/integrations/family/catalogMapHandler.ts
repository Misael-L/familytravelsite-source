import {
  catalogDetail,
  CatalogDiscoveryError,
  catalogKey,
  discoverCatalog,
  parseCatalogKey,
  type CatalogHit,
} from '@family/backend/supabase/catalogDiscovery';
import { z } from 'zod';
import { useTripStore } from '../../store/tripStore';
import { NOT_HANDLED } from './listHandler';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { scopeFamilyOperations } from './requestContext';
import type { FamilyRequest } from './transport';

const bounds = z
  .object({
    south: z.number().finite(),
    west: z.number().finite(),
    north: z.number().finite(),
    east: z.number().finite(),
  })
  .strict();
const point = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radius: z.number().positive().optional(),
  })
  .strict();
const search = z
  .object({
    query: z.string().trim().min(2).max(200),
    locationBias: point.optional(),
    provider: z.enum(['google']).optional(),
  })
  .strict();
const autocomplete = z
  .object({
    input: z.string().trim().min(2).max(200),
    lang: z.string().optional(),
    locationBias: z.object({ low: point, high: point }).strict().optional(),
    sessionToken: z.string().optional(),
  })
  .strict();
const enrichment = z
  .object({
    placeId: z.string().max(300).optional(),
    lat: z.number().finite(),
    lng: z.number().finite(),
    name: z.string().max(500),
    lang: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export function nativeCatalogPlace(hit: CatalogHit, category?: string) {
  return {
    osm_id: catalogKey(hit),
    source: 'family-catalog',
    family_catalog_kind: hit.kind,
    family_catalog_id: hit.id,
    family_identity: { kind: hit.kind, id: hit.id },
    family_context_place_id: hit.contextPlaceId,
    name: hit.name,
    lat: hit.latitude,
    lng: hit.longitude,
    address: hit.address,
    website: hit.website,
    phone: hit.phone,
    description: hit.description,
    type_label: hit.typeLabel,
    category: category ?? null,
    poi_type: category ?? hit.typeLabel ?? hit.kind,
    image_url: hit.heroUrl,
    thumb_url: hit.thumbUrl,
    opening_hours: null,
    cuisine: null,
  };
}
function catalogMapMethod(r: FamilyRequest, details: RegExpMatchArray | null, photo: RegExpMatchArray | null) {
  return details || photo || r.pathname === '/maps/pois'
    ? 'GET'
    : ['/maps/search', '/maps/autocomplete', '/maps/enrichment'].includes(r.pathname)
      ? 'POST'
      : null;
}

function catalogMapViewport(r: FamilyRequest) {
  if ([...r.query.keys()].some((k) => !['category', 'south', 'west', 'north', 'east', 'lang'].includes(k)))
    throw new FamilyApiError(400, 'catalog_query', 'Invalid catalog bounds.');
  const box = Object.fromEntries(
    ['south', 'west', 'north', 'east'].map((k) => {
      const v = r.query.get(k);
      if (v === null || !v.trim()) throw new FamilyApiError(400, 'catalog_query', 'Viewport bounds are required.');
      return [k, Number(v)];
    })
  );
  return box;
}

function rethrowCatalogMapError(e: unknown): never {
  if (e instanceof FamilyApiError || (e instanceof DOMException && e.name === 'AbortError')) throw e;
  if (e instanceof z.ZodError) throw new FamilyApiError(400, 'catalog_query', 'Invalid catalog request.');
  if (e instanceof CatalogDiscoveryError)
    throw new FamilyApiError(
      e.code === 'unsupported_category' ? 501 : e.code === 'invalid_query' ? 400 : 502,
      'catalog_' + e.code,
      e.code === 'unsupported_category'
        ? 'This category is not connected to Family Catalog.'
        : 'The catalog response or request was invalid.'
    );
  if ((e as { code?: string })?.code === '42501')
    throw new FamilyApiError(403, 'catalog_access', 'Catalog access was refused.');
  throw e;
}

/** Native maps requests read Family catalog only; no request can choose a provider or network target. */
export async function handleFamilyCatalogMap(repo: FamilyFrontendRepository, r: FamilyRequest) {
  const details = r.pathname.match(/^\/maps\/details\/([^/]+)$/),
    photo = r.pathname.match(/^\/maps\/place-photo\/([^/]+)$/);
  const method = catalogMapMethod(r, details, photo);
  if (!method) return NOT_HANDLED;
  if (r.method !== method) throw new FamilyApiError(405, 'catalog_method', 'Invalid catalog request method.');
  const trip = useTripStore.getState().trip?.id ?? null;
  const fence = () => {
    if (r.signal?.aborted || (useTripStore.getState().trip?.id ?? null) !== trip)
      throw new DOMException('Aborted', 'AbortError');
  };
  fence();
  await repo.session();
  fence();
  const ops = scopeFamilyOperations(repo, { discoverCatalog, catalogDetail });
  const detail = async (key: string) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(key);
    } catch {
      throw new FamilyApiError(400, 'catalog_key', 'Invalid catalog identity.');
    }
    const ref = parseCatalogKey(decoded);
    if (!ref) throw new FamilyApiError(404, 'catalog_key', 'This source is unavailable in Family Catalog.');
    const hit = await ops.catalogDetail(ref, r.signal);
    fence();
    return hit;
  };
  try {
    if (r.pathname === '/maps/pois') {
      const box = catalogMapViewport(r);
      const category = r.query.get('category') ?? '',
        result = await ops.discoverCatalog({ category, bounds: bounds.parse(box), signal: r.signal });
      fence();
      return {
        pois: result.hits.map((h) => nativeCatalogPlace(h, category)),
        source: 'family-catalog',
        truncated: result.truncated,
      };
    }
    if (r.pathname === '/maps/search') {
      const body = search.parse(r.body);
      if (body.provider)
        throw new FamilyApiError(501, 'catalog_provider_unavailable', 'Only Family Catalog search is connected.');
      const result = await ops.discoverCatalog({ query: body.query, limit: 40, signal: r.signal });
      fence();
      return {
        places: result.hits.map((h) => nativeCatalogPlace(h)),
        source: 'family-catalog',
        truncated: result.truncated,
      };
    }
    if (r.pathname === '/maps/autocomplete') {
      const body = autocomplete.parse(r.body),
        b = body.locationBias;
      const result = await ops.discoverCatalog({
        query: body.input,
        limit: 20,
        signal: r.signal,
        ...(b ? { bounds: { south: b.low.lat, west: b.low.lng, north: b.high.lat, east: b.high.lng } } : {}),
      });
      fence();
      return {
        suggestions: result.hits.map((h) => ({
          placeId: catalogKey(h),
          mainText: h.name,
          secondaryText: h.address ?? h.typeLabel ?? '',
          source: 'family-catalog',
          lat: h.latitude,
          lng: h.longitude,
        })),
        source: 'family-catalog',
      };
    }
    if (details) {
      const hit = await detail(details[1]);
      return { place: hit ? nativeCatalogPlace(hit) : null };
    }
    if (photo) {
      const hit = await detail(photo[1]);
      return { photoUrl: hit?.heroUrl ?? null, attribution: null };
    }
    const body = enrichment.parse(r.body),
      ref = parseCatalogKey(body.placeId);
    if (!ref) return { photos: [], description: null, facts: [], disabled: true };
    const hit = await ops.catalogDetail(ref, r.signal);
    fence();
    if (!hit) throw new FamilyApiError(404, 'catalog_unavailable', 'This catalog location is unavailable.');
    // Native's photo enum has a cached source; do not claim Google/OSM/community authorship.
    return {
      photos: hit.heroUrl
        ? [
            {
              key: catalogKey(hit) + '~cover',
              url: hit.heroUrl,
              attribution: 'Family Catalog · credit not recorded',
              license: null,
              licenseUrl: null,
              sourceUrl: null,
              source: 'cached',
            },
          ]
        : [],
      description: null,
      facts: [],
      source: 'family-catalog',
    };
  } catch (e) {
    rethrowCatalogMapError(e);
  }
}

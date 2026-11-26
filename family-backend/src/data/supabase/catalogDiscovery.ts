import { getSupabaseBrowserClient } from "./client";
import { getSupabaseUrl } from "./env";
import { captureFamilyOperation } from "./operationContext";
import { listCatalogVariantsForAssets } from "./catalogExploreMedia";

export type CatalogKind = "place" | "food" | "hotel" | "experience";
export type CatalogBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};
export type CatalogHit = {
  id: string;
  kind: CatalogKind;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  website: string | null;
  phone: string | null;
  description: string | null;
  typeLabel: string | null;
  countryId: string | null;
  contextPlaceId: string | null;
  thumbUrl: string | null;
  heroUrl: string | null;
};
export class CatalogDiscoveryError extends Error {
  constructor(
    readonly code:
      "invalid_query" | "unsupported_category" | "invalid_response",
  ) {
    super(code);
  }
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function catalogKey(ref: { kind: CatalogKind; id: string }): string {
  return `catalog:${ref.kind}:${ref.id}`;
}
export function parseCatalogKey(
  key: unknown,
): { kind: CatalogKind; id: string } | null {
  if (typeof key !== "string") return null;
  const parts = key.split(":");
  if (parts.length !== 3 || parts[0] !== "catalog" || !UUID.test(parts[2]))
    return null;
  return ["place", "food", "hotel", "experience"].includes(parts[1])
    ? { kind: parts[1] as CatalogKind, id: parts[2] }
    : null;
}
const tables = new Map<
  CatalogKind,
  { table: string; select: string; type?: string; embed?: string }
>([
  [
    "place",
    {
      table: "places",
      select:
        "id,name,notes,latitude,longitude,country_id,cover_media_id,place_types(label)",
      embed: "place_types",
    },
  ],
  [
    "food",
    {
      table: "foods",
      select:
        "id,name,notes,latitude,longitude,country_id,place_id,cover_media_id,address,link_url,establishment_type_id,establishment_types(label)",
      type: "establishment_type_id",
      embed: "establishment_types",
    },
  ],
  [
    "hotel",
    {
      table: "hotels",
      select:
        "id,name,notes,latitude,longitude,country_id,place_id,cover_media_id,address,website,contact_phone",
    },
  ],
  [
    "experience",
    {
      table: "experiences",
      select:
        "id,name,notes,latitude,longitude,country_id,place_id,cover_media_id,address,inspiration_url,experience_type_id,experience_types(label)",
      type: "experience_type_id",
      embed: "experience_types",
    },
  ],
]);
// Existing Family taxonomy, not provider categories inferred from a city's name.
const categories = new Map<string, { kind: CatalogKind; codes?: string[] }>([
  [
    "restaurant",
    {
      kind: "food",
      codes: [
        "RESTAURANT",
        "BISTRO",
        "BRASSERIE",
        "PIZZERIA",
        "DINER",
        "BUFFET",
        "FOOD_TRUCK",
        "FOOD_STAND",
        "YAKINIKU",
        "RAMEN_TEN",
        "TEPPANYAKI",
        "GRILL",
        "BAR_GRILL",
        "FRITERIE",
        "DELI",
        "FARM",
        "MARKET",
      ],
    },
  ],
  [
    "cafe",
    {
      kind: "food",
      codes: [
        "CAF",
        "COFFEE_SHOP",
        "CAF_STAND",
        "BAKERY",
        "PATISSERIE",
        "PASTRY_SHOP",
        "CHOCOLATERIE",
        "DONUT_SHOP",
        "CANDY_SHOP",
      ],
    },
  ],
  [
    "bar",
    {
      kind: "food",
      codes: ["BAR", "COCKTAIL_BAR", "HOLIDAY_POP_UP_BAR", "BAR_GRILL"],
    },
  ],
  ["bakery", { kind: "food", codes: ["BAKERY", "PATISSERIE", "PASTRY_SHOP"] }],
  ["hotel", { kind: "hotel" }],
  ["sights", { kind: "experience", codes: ["ATTRACTION"] }],
  // Family cultural experiences are broader than museums; do not mislabel them.
  ["nature", { kind: "experience", codes: ["NATURE_OUTDOORS"] }],
  ["activity", { kind: "experience", codes: ["ACTIVITY"] }],
]);
export const catalogCategories = [...categories.keys()];
export function catalogBounds(bounds: CatalogBounds): CatalogBounds[] {
  const { south, north, west, east } = bounds;
  if (
    ![south, north, west, east].every(Number.isFinite) ||
    south < -90 ||
    north > 90 ||
    south > north ||
    Math.abs(west) > 540 ||
    Math.abs(east) > 540
  )
    throw new CatalogDiscoveryError("invalid_query");
  let width = east - west;
  if (width < 0 && west <= 180 && east >= -180) width += 360;
  if (width < 0) throw new CatalogDiscoveryError("invalid_query");
  if (width >= 360) return [{ south, north, west: -180, east: 180 }];
  const start = ((((west + 180) % 360) + 360) % 360) - 180,
    end = start + width;
  return end <= 180
    ? [{ south, north, west: start, east: end }]
    : [
        { south, north, west: start, east: 180 },
        { south, north, west: -180, east: end - 360 },
      ];
}
type Row = Record<string, unknown>;
const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const num = (v: unknown) =>
  v == null || typeof v === "boolean" || (typeof v === "string" && !v.trim())
    ? null
    : Number.isFinite(Number(v))
      ? Number(v)
      : null;
function check(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}
function ready(
  url: string | null | undefined,
  recipe: string | null | undefined,
): string | null {
  if (!url || recipe !== "v1") return null;
  try {
    const u = new URL(url),
      source = new URL(getSupabaseUrl());
    return u.origin === source.origin &&
      ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname.startsWith("/storage/v1/object/public/catalog/variants/v1/") &&
      !u.pathname.includes("/render/image/")
      ? url
      : null;
  } catch {
    return null;
  }
}
async function project(
  kind: CatalogKind,
  rows: Row[],
  signal?: AbortSignal,
): Promise<CatalogHit[]> {
  check(signal);
  const variants = await listCatalogVariantsForAssets(
    rows.flatMap((r) =>
      text(r.cover_media_id) ? [String(r.cover_media_id)] : [],
    ),
  );
  check(signal);
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new CatalogDiscoveryError("invalid_response");
    const latitude = num(row.latitude),
      longitude = num(row.longitude),
      id = text(row.id),
      name = text(row.name);
    if (!id || !UUID.test(id) || !name)
      throw new CatalogDiscoveryError("invalid_response");
    if (
      latitude === null ||
      longitude === null ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return [];
    const embedKey = tables.get(kind)?.embed,
      embed = embedKey ? row[embedKey] : null;
    const label =
      embed && !Array.isArray(embed) && typeof embed === "object"
        ? text((embed as Row).label)
        : null;
    const variant = variants.get(String(row.cover_media_id));
    return [
      {
        id,
        kind,
        name,
        latitude,
        longitude,
        address: text(row.address),
        website:
          text(row.website) ?? text(row.link_url) ?? text(row.inspiration_url),
        phone: text(row.contact_phone),
        description: text(row.notes),
        typeLabel: label,
        countryId: text(row.country_id),
        contextPlaceId: kind === "place" ? id : text(row.place_id),
        thumbUrl: ready(variant?.thumbUrl, variant?.recipeVersion),
        heroUrl: ready(variant?.heroUrl, variant?.recipeVersion),
      },
    ];
  });
}
export async function discoverCatalog(options: {
  category?: string;
  query?: string;
  bounds?: CatalogBounds;
  limit?: number;
  signal?: AbortSignal;
}): Promise<{ hits: CatalogHit[]; truncated: boolean }> {
  const owner = captureFamilyOperation(),
    { signal } = options;
  const assert = () => {
    owner.assertCurrent();
    check(signal);
  };
  assert();
  const limit = options.limit ?? 80,
    query = options.query?.trim() ?? "";
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (options.category === undefined && (query.length < 2 || query.length > 200))
  )
    throw new CatalogDiscoveryError("invalid_query");
  const category =
    options.category === undefined
      ? undefined
      : categories.get(options.category);
  if (options.category !== undefined && !category)
    throw new CatalogDiscoveryError("unsupported_category");
  if (category && !options.bounds)
    throw new CatalogDiscoveryError("invalid_query");
  const ranges = options.bounds
    ? catalogBounds(options.bounds)
    : [{ south: -90, north: 90, west: -180, east: 180 }];
  const sb = getSupabaseBrowserClient(),
    found: CatalogHit[] = [];
  let truncated = false;
  for (const kind of category ? [category.kind] : [...tables.keys()]) {
    const config = tables.get(kind)!;
    let typeIds: string[] | undefined;
    if (category?.codes) {
      let types = sb
        .from(kind === "food" ? "establishment_types" : "experience_types")
        .select("id,code")
        .in("code", category.codes);
      if (signal) types = types.abortSignal(signal);
      const result = await owner.perform(() => types);
      assert();
      if (result.error) throw result.error;
      if (!Array.isArray(result.data))
        throw new CatalogDiscoveryError("invalid_response");
      typeIds = result.data.map((row) => String(row.id));
      if (!typeIds.length) continue;
    }
    for (const range of ranges) {
      let q = sb
        .from(config.table)
        .select(config.select)
        .is("archived_at", null)
        .gte("latitude", range.south)
        .lte("latitude", range.north)
        .gte("longitude", range.west)
        .lte("longitude", range.east)
        .order("name")
        .order("id")
        .limit(limit + 1);
      if (typeIds && config.type) q = q.in(config.type, typeIds);
      if (query)
        q = q.ilike("name", "%" + query.replace(/[\\%_]/g, "\\$&") + "%");
      if (signal) q = q.abortSignal(signal);
      const result = await owner.perform(() => q);
      assert();
      if (result.error) throw result.error;
      if (!Array.isArray(result.data))
        throw new CatalogDiscoveryError("invalid_response");
      truncated ||= result.data.length > limit;
      const hits = await owner.perform(() =>
        project(kind, result.data as unknown as Row[], signal),
      );
      assert();
      found.push(
        ...hits.filter(
          (h) =>
            h.latitude >= range.south &&
            h.latitude <= range.north &&
            h.longitude >= range.west &&
            h.longitude <= range.east,
        ),
      );
    }
  }
  const unique = [
    ...new Map(found.map((h) => [catalogKey(h), h])).values(),
  ].sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      catalogKey(a).localeCompare(catalogKey(b)),
  );
  return {
    hits: unique.slice(0, limit),
    truncated: truncated || unique.length > limit,
  };
}
export async function catalogDetail(
  ref: { kind: CatalogKind; id: string },
  signal?: AbortSignal,
): Promise<CatalogHit | null> {
  const owner = captureFamilyOperation();
  owner.assertCurrent();
  check(signal);
  const config = tables.get(ref.kind);
  if (!config || !UUID.test(ref.id))
    throw new CatalogDiscoveryError("invalid_query");
  let q = getSupabaseBrowserClient()
    .from(config.table)
    .select(config.select)
    .eq("id", ref.id)
    .is("archived_at", null);
  if (signal) q = q.abortSignal(signal);
  const result = await owner.perform(() => q.maybeSingle());
  check(signal);
  if (result.error) throw result.error;
  if (!result.data) return null;
  const row = result.data as unknown as Row;
  if (typeof row !== "object" || Array.isArray(row) || row.id !== ref.id)
    throw new CatalogDiscoveryError("invalid_response");
  const hits = await owner.perform(() => project(ref.kind, [row], signal));
  check(signal);
  return hits[0] ?? null;
}

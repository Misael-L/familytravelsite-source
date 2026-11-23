import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseBrowserClient } from "./client";
import { listCatalogVariantsForAssets } from "./catalogExploreMedia";
import {
  catalogBounds,
  catalogDetail,
  catalogKey,
  discoverCatalog,
  parseCatalogKey,
} from "./catalogDiscovery";
vi.mock("./client", () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock("./env", () => ({
  getSupabaseUrl: () => "https://catalog.example.invalid",
}));
vi.mock("./catalogExploreMedia", () => ({
  listCatalogVariantsForAssets: vi.fn(),
}));
const id = (n: number) =>
  `f5000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n = 1, over: Record<string, unknown> = {}) => ({
  id: id(n),
  name: "Venue " + n,
  latitude: 19.4,
  longitude: -99.1,
  place_id: id(9),
  country_id: id(8),
  notes: "Catalog description",
  establishment_types: { label: "Restaurant" },
  cover_media_id: id(6),
  ...over,
});
const box = { south: 19, west: -100, north: 20, east: -99 };
let data: Record<string, unknown[]>;
let error: unknown;
let wait: (() => Promise<void>) | undefined;
const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
function mockClient() {
  const from = (table: string) => {
    const ops: Array<[string, unknown[]]> = [];
    const q: Record<string, unknown> = {};
    for (const method of [
      "select",
      "is",
      "eq",
      "gte",
      "lte",
      "order",
      "limit",
      "in",
      "ilike",
      "abortSignal",
    ])
      q[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        ops.push([method, args]);
        return q;
      };
    const result = async (single = false) => {
      if (wait) await wait();
      const rows = (data[table] ?? []).filter((v) =>
        ops.every(([method, a]) => {
          const r = v as Record<string, unknown>,
            [key, value] = a;
          if (method === "eq") return r[String(key)] === value;
          if (method === "is") return r[String(key)] == null;
          if (method === "gte")
            return (
              r[String(key)] != null && Number(r[String(key)]) >= Number(value)
            );
          if (method === "lte")
            return (
              r[String(key)] != null && Number(r[String(key)]) <= Number(value)
            );
          if (method === "in")
            return (value as unknown[]).includes(r[String(key)]);
          if (method === "ilike")
            return String(r[String(key)] ?? "")
              .toLowerCase()
              .includes(
                String(value)
                  .slice(1, -1)
                  .replace(/\\([\\%_])/g, "$1")
                  .toLowerCase(),
              );
          return true;
        }),
      );
      return { data: single ? (rows[0] ?? null) : rows, error };
    };
    q.then = (
      resolve: (v: unknown) => unknown,
      reject: (v: unknown) => unknown,
    ) => result().then(resolve, reject);
    q.maybeSingle = () => result(true);
    return q;
  };
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from } as never);
}
beforeEach(() => {
  calls.length = 0;
  error = null;
  wait = undefined;
  data = {
    establishment_types: [{ id: id(7), code: "RESTAURANT" }],
    foods: [row(1, { establishment_type_id: id(7) })],
  };
  mockClient();
  vi.mocked(listCatalogVariantsForAssets).mockResolvedValue(new Map());
});
describe("bounded typed catalog discovery", () => {
  it("queries the food coordinates/type without replacing identity with its city context", async () => {
    const r = await discoverCatalog({ category: "restaurant", bounds: box });
    expect(r.hits[0]).toMatchObject({
      id: id(1),
      kind: "food",
      contextPlaceId: id(9),
      latitude: 19.4,
      longitude: -99.1,
      description: "Catalog description",
      typeLabel: "Restaurant",
    });
    expect(calls).toContainEqual({
      table: "foods",
      method: "is",
      args: ["archived_at", null],
    });
    expect(calls).toContainEqual({
      table: "foods",
      method: "limit",
      args: [81],
    });
    expect(calls.some((c) => c.table === "places")).toBe(false);
  });
  it("uses ready-v1 same-source object images only", async () => {
    const root =
      "https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/x/";
    vi.mocked(listCatalogVariantsForAssets).mockResolvedValue(
      new Map([
        [
          id(6),
          {
            mediaAssetId: id(6),
            recipeVersion: "v1",
            canonicalUrl: "https://catalog.example.invalid/original.jpg",
            thumbUrl: root + "thumb-a.webp",
            heroUrl: root + "hero-a.webp",
          },
        ],
      ]),
    );
    expect(
      (await discoverCatalog({ category: "restaurant", bounds: box })).hits[0],
    ).toMatchObject({
      thumbUrl: root + "thumb-a.webp",
      heroUrl: root + "hero-a.webp",
    });
  });
  it.each([
    "https://other.invalid/storage/v1/object/public/catalog/variants/v1/x/hero-a.webp",
    "https://catalog.example.invalid/storage/v1/render/image/public/catalog/a.jpg",
    "https://catalog.example.invalid/storage/v1/object/public/catalog/original.jpg",
    "https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/a.webp?token=x",
  ])("keeps unsafe/unready media as placeholders %#", async (url) => {
    vi.mocked(listCatalogVariantsForAssets).mockResolvedValue(
      new Map([
        [
          id(6),
          {
            mediaAssetId: id(6),
            recipeVersion: "v1",
            canonicalUrl: url,
            thumbUrl: url,
            heroUrl: url,
          },
        ],
      ]),
    );
    expect(
      (await discoverCatalog({ category: "restaurant", bounds: box })).hits[0],
    ).toMatchObject({ thumbUrl: null, heroUrl: null });
  });
  it("omits archived, unlocated, invalid-coordinate and out-of-view records", async () => {
    data.foods = [
      row(1, { establishment_type_id: id(7) }),
      row(2, { latitude: null, establishment_type_id: id(7) }),
      row(3, { latitude: 91, establishment_type_id: id(7) }),
      row(4, { archived_at: "2026-01-01", establishment_type_id: id(7) }),
    ];
    expect(
      (await discoverCatalog({ category: "restaurant", bounds: box })).hits.map(
        (h) => h.id,
      ),
    ).toEqual([id(1)]);
  });
  it("answers a genuine empty result separately from a failed query", async () => {
    data.foods = [];
    expect(
      await discoverCatalog({ category: "restaurant", bounds: box }),
    ).toEqual({ hits: [], truncated: false });
    error = { code: "42501" };
    await expect(
      discoverCatalog({ category: "restaurant", bounds: box }),
    ).rejects.toEqual(error);
  });
  it.each([
    "constructor",
    "toString",
    "__proto__",
    "supermarket", "museum",
    "plugin:x/y",
  ])("refuses unavailable or prototype categories %s", async (category) => {
    await expect(
      discoverCatalog({ category, bounds: box }),
    ).rejects.toMatchObject({ code: "unsupported_category" });
    expect(calls).toEqual([]);
  });
  it.each([
    { ...box, south: NaN },
    { ...box, south: 30 },
    { ...box, north: 91 },
    { ...box, west: Infinity },
  ])("rejects invalid bounds %#", async (bounds) => {
    await expect(
      discoverCatalog({ category: "restaurant", bounds }),
    ).rejects.toMatchObject({ code: "invalid_query" });
    expect(calls).toEqual([]);
  });
  it("splits a dateline viewport without broadening it to the whole world", async () => {
    data.foods = [
      row(1, { longitude: 175, establishment_type_id: id(7) }),
      row(2, { longitude: -175, establishment_type_id: id(7) }),
      row(3, { longitude: 0, establishment_type_id: id(7) }),
    ];
    const r = await discoverCatalog({
      category: "restaurant",
      bounds: { ...box, west: 170, east: -170 },
    });
    expect(r.hits.map((h) => h.id)).toEqual([id(1), id(2)]);
    expect(catalogBounds({ ...box, west: 170, east: 190 })).toHaveLength(2);
  });
  it("reports truncation, deduplicates and returns a deterministic cap", async () => {
    data.foods = [
      row(2, { establishment_type_id: id(7) }),
      row(1, { establishment_type_id: id(7) }),
    ];
    const r = await discoverCatalog({
      category: "restaurant",
      bounds: box,
      limit: 1,
    });
    expect(r.hits.map((h) => h.id)).toEqual([id(1)]);
    expect(r.truncated).toBe(true);
  });
  it("searches genuine geographic and venue identities with usable coordinates", async () => {
    data.places = [row(3, { name: "Venue city" })];
    data.hotels = [row(4, { name: "Venue inn" })];
    const r = await discoverCatalog({ query: "Venue" });
    expect(new Set(r.hits.map((h) => h.kind))).toEqual(
      new Set(["food", "place", "hotel"]),
    );
    expect(calls.some((c) => c.method === "ilike")).toBe(true);
  });
  it("escapes query wildcard syntax instead of letting it select arbitrary rows", async () => {
    await discoverCatalog({ query: "a%_b" });
    expect(
      calls
        .filter((c) => c.method === "ilike")
        .every((c) => c.args[1] === "%a\\%\\_b%"),
    ).toBe(true);
  });
  it("aborts before any read and refuses a delayed answer after cancellation", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      discoverCatalog({
        category: "restaurant",
        bounds: box,
        signal: ctrl.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toEqual([]);
    const next = new AbortController();
    wait = async () => {
      next.abort();
    };
    await expect(
      discoverCatalog({
        category: "restaurant",
        bounds: box,
        signal: next.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("round-trips only typed catalog IDs and reads detail from its own table", async () => {
    for (const kind of ["place", "food", "hotel", "experience"] as const)
      expect(parseCatalogKey(catalogKey({ kind, id: id(1) }))).toEqual({
        kind,
        id: id(1),
      });
    expect(parseCatalogKey("catalog:constructor:" + id(1))).toBeNull();
    expect(parseCatalogKey("node/123")).toBeNull();
    const hit = await catalogDetail({ kind: "food", id: id(1) });
    expect(hit?.contextPlaceId).toBe(id(9));
    expect(await catalogDetail({ kind: "hotel", id: id(1) })).toBeNull();
  });
});

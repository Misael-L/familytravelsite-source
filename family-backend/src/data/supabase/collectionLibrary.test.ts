import { describe, expect, it, vi } from "vitest";
import {
  checkCollectionLibraryPage,
  CollectionLibraryError,
  createCollectionLibraryReader,
  type LibraryPage,
  type LibraryRequest,
  type LibraryRpc,
  type LibraryScope,
} from "./collectionLibrary";
vi.mock("./client", () => ({ getSupabaseBrowserClient: vi.fn() }));
import { getSupabaseBrowserClient } from "./client";
import { collectionLibraryRpc } from "./collectionLibraryRpc";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope: LibraryScope = {
  version: 1,
  family_id: id(1),
  user_id: id(2),
  person_id: id(3),
  session_id: id(4),
};
const source = "https://fixture.invalid",
  token = "a".repeat(64);
const request = (more: Partial<LibraryRequest> = {}): LibraryRequest => ({
  scope,
  state: "active",
  limit: 2,
  cursor: null,
  ...more,
});
function page(offset = 0, count = 3, limit = 2): LibraryPage {
  const collections = Array.from(
    { length: Math.min(limit, count - offset) },
    (_, n) => ({
      collection: {
        id: id(10 + offset + n),
        family_id: scope.family_id,
        owner_person_id: scope.person_id,
        visibility: "private" as const,
        revision: 1,
        lifecycle_revision: 0,
        archived_at: null,
        deleted_at: null,
        name: `Saved ${n}`,
        description: null,
        color: null,
        sort_order: offset + n,
        cover: {
          id: null,
          availability: "absent" as const,
          thumb_url: null,
          hero_url: null,
        },
      },
      content_revision: 0,
      active_item_count: n,
      can_edit_items: true,
      can_admin: true,
      is_owner: true,
      created_at: "2026-11-14T12:00:00Z",
      updated_at: "2026-11-14T12:00:00+00:00",
    }),
  );
  const last = collections[collections.length - 1]?.collection;
  return {
    version: 1,
    scope: { ...scope },
    state: "active",
    library_digest: token,
    total_count: count,
    offset,
    collections,
    next_cursor:
      offset + collections.length < count && last
        ? {
            version: 1,
            scope: { ...scope },
            state: "active",
            library_digest: token,
            sort_order: last.sort_order,
            id: last.id,
          }
        : null,
  };
}
// Mutable JSON fixtures deliberately model untrusted network responses.
const mutable = (v: unknown) => JSON.parse(JSON.stringify(v));
describe("Collection library strict contract", () => {
  it("accepts and deeply freezes an exact page", () => {
    const raw = page();
    const p = checkCollectionLibraryPage(raw, request(), source);
    expect(p.collections).toHaveLength(2);
    expect(Object.isFrozen(p.collections[0].collection.cover)).toBe(true);
    expect(Object.isFrozen(p.next_cursor?.scope)).toBe(true);
    expect(Object.isFrozen(raw)).toBe(false);
  });
  it("accepts explicit complete empty success", () => {
    expect(
      checkCollectionLibraryPage(page(0, 0), request(), source).collections,
    ).toEqual([]);
  });
  it.each([
    "version",
    "scope",
    "state",
    "collections",
    "offset",
    "next_cursor",
  ])("rejects missing %s", (key) => {
    const p = mutable(page());
    delete p[key];
    expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow(
      CollectionLibraryError,
    );
  });
  it("rejects extra and accessor properties without invoking getters", () => {
    const p = mutable(page());
    const getter = vi.fn(() => 1);
    Object.defineProperty(p, "version", { get: getter });
    expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow(
      CollectionLibraryError,
    );
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      checkCollectionLibraryPage({ ...page(), extra: true }, request(), source),
    ).toThrow();
  });
  it.each(["family_id", "user_id", "person_id", "session_id"])(
    "rejects cross-context %s",
    (key) => {
      const p = mutable(page());
      p.scope[key] = id(99);
      expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
    },
  );
  it.each([Number.MAX_SAFE_INTEGER + 1, -1, 1.5, "1", null])(
    "rejects unsafe item count %s",
    (value) => {
      const p = mutable(page());
      p.collections[0].active_item_count = value;
      expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
    },
  );
  it.each(["revision", "lifecycle_revision"])("rejects unsafe %s", (key) => {
    const p = mutable(page());
    p.collections[0].collection[key] = Number.MAX_SAFE_INTEGER + 1;
    expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
  });
  it("rejects unsafe content revisions", () => {
    const p = mutable(page());
    p.collections[0].content_revision = Number.MAX_SAFE_INTEGER + 1;
    expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
  });
  it("requires complete exact page lengths", () => {
    const p = mutable(page());
    p.collections.pop();
    expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
  });
  it("rejects duplicate or out-of-order roots", () => {
    const p = mutable(page());
    p.collections[1] = p.collections[0];
    expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
  });
  it("rejects false completeness and fabricated next pages", () => {
    expect(() =>
      checkCollectionLibraryPage(
        { ...page(), next_cursor: null },
        request(),
        source,
      ),
    ).toThrow();
    const p = mutable(page(0, 2));
    p.next_cursor = page().next_cursor;
    expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
  });
  it("binds a next cursor to its actual last root", () => {
    const p = mutable(page());
    p.next_cursor.id = id(999);
    expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
  });
  it("rejects wrong-state rows and archived editing", () => {
    const p = mutable(page());
    p.collections[0].collection.archived_at = "2026-11-14T12:00:00Z";
    expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
    p.state = "archived";
    p.collections[1].collection.archived_at =
      p.collections[0].collection.archived_at;
    p.next_cursor.state = "archived";
    expect(() =>
      checkCollectionLibraryPage(p, request({ state: "archived" }), source),
    ).toThrow();
  });
  it("does not invent global-reader ownership", () => {
    const p = mutable(page(0, 1));
    p.scope.person_id = null;
    p.collections[0].is_owner = false;
    expect(
      checkCollectionLibraryPage(
        p,
        request({ scope: { ...scope, person_id: null } }),
        source,
      ).collections[0].is_owner,
    ).toBe(false);
  });
  it("accepts only same-source ready stored variants", () => {
    const p = mutable(page(0, 1));
    p.collections[0].collection.cover = {
      id: id(50),
      availability: "ready_variants",
      thumb_url:
        source +
        "/storage/v1/object/public/catalog/variants/v1/x/thumb-123.webp",
      hero_url: null,
    };
    expect(
      checkCollectionLibraryPage(p, request(), source).collections[0].collection
        .cover.availability,
    ).toBe("ready_variants");
    for (const url of [
      source + "/storage/v1/render/image/public/catalog/x",
      source + "/storage/v1/object/public/catalog/original.jpg",
      "https://other.invalid/storage/v1/object/public/catalog/variants/v1/x/thumb.webp",
    ]) {
      p.collections[0].collection.cover.thumb_url = url;
      expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
    }
  });
  it("keeps private media explicitly unavailable", () => {
    const p = mutable(page(0, 1));
    p.collections[0].collection.cover = {
      id: id(50),
      availability: "private_unavailable",
      thumb_url: null,
      hero_url: null,
    };
    expect(
      checkCollectionLibraryPage(p, request(), source).collections[0].collection
        .cover.id,
    ).toBe(id(50));
    p.collections[0].collection.cover.hero_url =
      source + "/storage/v1/object/public/catalog/variants/v1/x/hero.webp";
    expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
  });
  it("rejects response byte overflow", () => {
    const p = mutable(page(0, 1));
    p.collections[0].collection.description = "é".repeat(1048576);
    expect(() => checkCollectionLibraryPage(p, request(), source)).toThrow();
  });
  it("rejects invalid request bounds and source URLs before any RPC", async () => {
    const rpc = vi.fn();
    const r = createCollectionLibraryReader(rpc, source);
    await expect(r.page(request({ limit: 101 }), () => {})).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    expect(() =>
      createCollectionLibraryReader(rpc, "https://user:pass@example.invalid"),
    ).toThrow();
  });
});
describe("Collection library complete read and lifetime", () => {
  it("hydrates complete pages without returning intermediate rows", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce(page(0, 101, 100))
      .mockResolvedValueOnce(page(100, 101, 100));
    const check = vi.fn();
    const p = await createCollectionLibraryReader(rpc, source).all(
      { scope, state: "active" },
      check,
    );
    expect(p.collections).toHaveLength(101);
    expect(rpc.mock.calls[1][1].p_cursor.id).toBe(id(109));
    expect(Object.isFrozen(p.collections)).toBe(true);
    expect(check).toHaveBeenCalledTimes(5);
  });
  it("propagates a refused later page instead of a partial or empty library", async () => {
    const error = { code: "PT409" };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce(page(0, 101, 100))
      .mockRejectedValueOnce(error);
    await expect(
      createCollectionLibraryReader(rpc, source).all(
        { scope, state: "active" },
        () => {},
      ),
    ).rejects.toBe(error);
  });
  it("rejects cursor digest, total or offset changes", async () => {
    for (const delta of [
      { library_digest: "b".repeat(64) },
      { total_count: 102 },
      { offset: 99 },
    ]) {
      const rpc = vi
        .fn()
        .mockResolvedValueOnce(page(0, 101, 100))
        .mockResolvedValueOnce({ ...page(100, 101, 100), ...delta });
      await expect(
        createCollectionLibraryReader(rpc, source).all(
          { scope, state: "active" },
          () => {},
        ),
      ).rejects.toThrow();
    }
  });
  it("never returns an old account's delayed result", async () => {
    let resolve!: (v: unknown) => void;
    const rpc: LibraryRpc = () =>
      new Promise((r) => {
        resolve = r;
      });
    let current = true;
    const task = createCollectionLibraryReader(rpc, source).page(
      request(),
      () => {
        if (!current) throw new Error("session_changed");
      },
    );
    current = false;
    resolve(page());
    await expect(task).rejects.toThrow("session_changed");
  });
  it("checks changed context after transport failure too", async () => {
    let current = true;
    const rpc: LibraryRpc = async () => {
      current = false;
      throw new Error("network");
    };
    await expect(
      createCollectionLibraryReader(rpc, source).page(request(), () => {
        if (!current) throw new Error("session_changed");
      }),
    ).rejects.toThrow("session_changed");
  });
  it("freezes original request ownership before awaiting", async () => {
    let resolve!: (v: unknown) => void;
    const input = mutable(request());
    const rpc: LibraryRpc = () =>
      new Promise((r) => {
        resolve = r;
      });
    const task = createCollectionLibraryReader(rpc, source).page(
      input,
      () => {},
    );
    input.scope.user_id = id(99);
    resolve(page());
    expect((await task).scope.user_id).toBe(scope.user_id);
  });
  it("checks context before contacting the service", async () => {
    const rpc = vi.fn();
    await expect(
      createCollectionLibraryReader(rpc, source).page(request(), () => {
        throw new Error("signed_out");
      }),
    ).rejects.toThrow("signed_out");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("accepts the complete 1000-root bound in exactly ten pages", async () => {
    const rpc = vi.fn();
    for (let i = 0; i < 10; i++)
      rpc.mockResolvedValueOnce(page(i * 100, 1000, 100));
    expect(
      (
        await createCollectionLibraryReader(rpc, source).all(
          { scope, state: "active" },
          () => {},
        )
      ).collections,
    ).toHaveLength(1000);
    expect(rpc).toHaveBeenCalledTimes(10);
  });
  it("does not accept a hidden eleventh page", async () => {
    const p = mutable(page(0, 1000, 100));
    p.total_count = 1001;
    const rpc = vi.fn().mockResolvedValue(p);
    await expect(
      createCollectionLibraryReader(rpc, source).all(
        { scope, state: "active" },
        () => {},
      ),
    ).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
describe("Collection library real SDK boundary", () => {
  it("calls only the exact allowed authenticated RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: page(), error: null });
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof getSupabaseBrowserClient>);
    const args = {
      p_family_id: scope.family_id,
      p_state: "active",
      p_limit: 2,
      p_cursor: null,
    };
    expect(
      await collectionLibraryRpc("get_family_collection_library_v1", args),
    ).toEqual(page());
    expect(rpc).toHaveBeenCalledWith("get_family_collection_library_v1", args);
  });
  it("propagates actual SDK errors", async () => {
    const error = { code: "42501" };
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error }),
    } as unknown as ReturnType<typeof getSupabaseBrowserClient>);
    await expect(
      collectionLibraryRpc("get_family_collection_library_v1", {}),
    ).rejects.toBe(error);
  });
  it("refuses another endpoint before accessing the SDK", async () => {
    const sdk = vi.mocked(getSupabaseBrowserClient);
    sdk.mockClear();
    await expect(
      (
        collectionLibraryRpc as (
          n: string,
          a: Record<string, unknown>,
        ) => Promise<unknown>
      )("create_family_list", {}),
    ).rejects.toThrow("Unsupported");
    expect(sdk).not.toHaveBeenCalled();
  });
});

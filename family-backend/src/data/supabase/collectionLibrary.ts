/** Strict, currently unwired library boundary. A failed page never becomes an empty library. */
export type LibraryScope = Readonly<{
  version: 1;
  family_id: string;
  user_id: string;
  person_id: string | null;
  session_id: string;
}>;
export type LibraryState = "active" | "archived";
export type LibraryCover = Readonly<{
  id: string | null;
  availability:
    | "absent"
    | "unavailable"
    | "private_unavailable"
    | "placeholder"
    | "ready_variants";
  thumb_url: string | null;
  hero_url: string | null;
}>;
export type LibraryRoot = Readonly<{
  id: string;
  family_id: string;
  owner_person_id: string | null;
  visibility: "private" | "family";
  revision: number;
  lifecycle_revision: number;
  archived_at: string | null;
  deleted_at: null;
  name: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  cover: LibraryCover;
}>;
export type LibraryEntry = Readonly<{
  collection: LibraryRoot;
  content_revision: number;
  active_item_count: number;
  can_edit_items: boolean;
  can_admin: boolean;
  is_owner: boolean;
  created_at: string;
  updated_at: string;
}>;
export type LibraryCursor = Readonly<{
  version: 1;
  scope: LibraryScope;
  state: LibraryState;
  library_digest: string;
  sort_order: number;
  id: string;
}>;
export type LibraryPage = Readonly<{
  version: 1;
  scope: LibraryScope;
  state: LibraryState;
  library_digest: string;
  total_count: number;
  offset: number;
  collections: readonly LibraryEntry[];
  next_cursor: LibraryCursor | null;
}>;
export type LibraryRequest = Readonly<{
  scope: LibraryScope;
  state: LibraryState;
  limit: number;
  cursor: LibraryCursor | null;
}>;
export type LibraryRpc = (
  name: "get_family_collection_library_v1",
  args: Record<string, unknown>,
) => Promise<unknown>;

export class CollectionLibraryError extends Error {
  readonly code = "collection_library_contract";
  constructor() {
    super(
      "The complete Collection library could not be verified. Reload before retrying.",
    );
  }
}
function invalid(): never {
  throw new CollectionLibraryError();
}
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) invalid();
  const own = Reflect.ownKeys(value);
  if (
    own.length !== keys.length ||
    own.some((k) => typeof k !== "string" || !keys.includes(k))
  )
    invalid();
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !("value" in d)) invalid();
  }
  return value as Record<string, unknown>;
}
function str(v: unknown): string {
  if (typeof v !== "string") invalid();
  return v;
}
function text(v: unknown): string | null {
  return v === null ? null : str(v);
}
function uuid(v: unknown): string {
  const s = str(v);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s))
    invalid();
  return s;
}
function nullableUuid(v: unknown) {
  return v === null ? null : uuid(v);
}
function integer(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max)
    invalid();
  return v;
}
function bool(v: unknown): boolean {
  if (typeof v !== "boolean") invalid();
  return v;
}
function time(v: unknown): string {
  const s = str(v);
  if (
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s) ||
    !Number.isFinite(Date.parse(s))
  )
    invalid();
  return s;
}
function state(v: unknown): LibraryState {
  if (v !== "active" && v !== "archived") invalid();
  return v;
}
function digest(v: unknown): string {
  const s = str(v);
  if (!/^[0-9a-f]{64}$/.test(s)) invalid();
  return s;
}
function scope(v: unknown): LibraryScope {
  const p = exact(v, [
    "version",
    "family_id",
    "user_id",
    "person_id",
    "session_id",
  ]);
  if (p.version !== 1) invalid();
  return Object.freeze({
    version: 1,
    family_id: uuid(p.family_id),
    user_id: uuid(p.user_id),
    person_id: nullableUuid(p.person_id),
    session_id: uuid(p.session_id),
  });
}
function sameScope(a: LibraryScope, b: LibraryScope): boolean {
  return (
    a.family_id === b.family_id &&
    a.user_id === b.user_id &&
    a.person_id === b.person_id &&
    a.session_id === b.session_id
  );
}
function cursor(v: unknown): LibraryCursor {
  const p = exact(v, [
    "version",
    "scope",
    "state",
    "library_digest",
    "sort_order",
    "id",
  ]);
  if (p.version !== 1) invalid();
  return Object.freeze({
    version: 1,
    scope: scope(p.scope),
    state: state(p.state),
    library_digest: digest(p.library_digest),
    sort_order: integer(p.sort_order, -2147483648, 2147483647),
    id: uuid(p.id),
  });
}
function request(v: LibraryRequest): LibraryRequest {
  const p = exact(v, ["scope", "state", "limit", "cursor"]);
  const out = {
    scope: scope(p.scope),
    state: state(p.state),
    limit: integer(p.limit, 1, 100),
    cursor: p.cursor === null ? null : cursor(p.cursor),
  };
  if (
    out.cursor &&
    (!sameScope(out.cursor.scope, out.scope) || out.cursor.state !== out.state)
  )
    invalid();
  return Object.freeze(out);
}
function cover(v: unknown, origin: string): LibraryCover {
  const p = exact(v, ["id", "availability", "thumb_url", "hero_url"]);
  const id = nullableUuid(p.id),
    availability = str(p.availability),
    thumb_url = text(p.thumb_url),
    hero_url = text(p.hero_url);
  if (
    ![
      "absent",
      "unavailable",
      "private_unavailable",
      "placeholder",
      "ready_variants",
    ].includes(availability)
  )
    invalid();
  for (const url of [thumb_url, hero_url]) {
    if (url === null) continue;
    let image: URL;
    try {
      image = new URL(url);
    } catch {
      invalid();
    }
    if (
      image.protocol !== "https:" ||
      image.origin !== origin ||
      image.username ||
      image.password ||
      image.search ||
      image.hash ||
      image.href !== url ||
      !/^\/storage\/v1\/object\/public\/catalog\/variants\/v1\/[A-Za-z0-9/_-]+\.webp$/.test(
        image.pathname,
      )
    )
      invalid();
  }
  if (
    availability === "ready_variants"
      ? !id || (!thumb_url && !hero_url)
      : thumb_url !== null || hero_url !== null
  )
    invalid();
  if (
    availability === "absent" || availability === "unavailable"
      ? id !== null
      : id === null
  )
    invalid();
  return Object.freeze({
    id,
    availability: availability as LibraryCover["availability"],
    thumb_url,
    hero_url,
  });
}
function entry(
  v: unknown,
  owner: LibraryScope,
  expectedState: LibraryState,
  origin: string,
): LibraryEntry {
  const p = exact(v, [
    "collection",
    "content_revision",
    "active_item_count",
    "can_edit_items",
    "can_admin",
    "is_owner",
    "created_at",
    "updated_at",
  ]);
  const c = exact(p.collection, [
    "id",
    "family_id",
    "owner_person_id",
    "visibility",
    "revision",
    "lifecycle_revision",
    "archived_at",
    "deleted_at",
    "name",
    "description",
    "color",
    "sort_order",
    "cover",
  ]);
  if (
    c.deleted_at !== null ||
    (c.visibility !== "private" && c.visibility !== "family")
  )
    invalid();
  const root: LibraryRoot = Object.freeze({
    id: uuid(c.id),
    family_id: uuid(c.family_id),
    owner_person_id: nullableUuid(c.owner_person_id),
    visibility: c.visibility,
    revision: integer(c.revision, 1),
    lifecycle_revision: integer(c.lifecycle_revision),
    archived_at: c.archived_at === null ? null : time(c.archived_at),
    deleted_at: null,
    name: str(c.name),
    description: text(c.description),
    color: text(c.color),
    sort_order: integer(c.sort_order, -2147483648, 2147483647),
    cover: cover(c.cover, origin),
  });
  if (
    root.family_id !== owner.family_id ||
    (root.archived_at === null) !== (expectedState === "active")
  )
    invalid();
  const out = Object.freeze({
    collection: root,
    content_revision: integer(p.content_revision),
    active_item_count: integer(p.active_item_count),
    can_edit_items: bool(p.can_edit_items),
    can_admin: bool(p.can_admin),
    is_owner: bool(p.is_owner),
    created_at: time(p.created_at),
    updated_at: time(p.updated_at),
  });
  if (
    out.is_owner !==
      (owner.person_id !== null && root.owner_person_id === owner.person_id) ||
    (expectedState === "archived" && out.can_edit_items)
  )
    invalid();
  return out;
}
function ordered(
  a: LibraryRoot,
  b: Pick<LibraryRoot, "id" | "sort_order">,
): boolean {
  return (
    a.sort_order > b.sort_order ||
    (a.sort_order === b.sort_order && a.id > b.id)
  );
}
function sourceOrigin(value: string): string {
  try {
    const u = new URL(value);
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/"
    )
      invalid();
    return u.origin;
  } catch {
    invalid();
  }
}
export function checkCollectionLibraryPage(
  raw: unknown,
  input: LibraryRequest,
  sourceUrl: string,
): LibraryPage {
  const expected = request(input);
  const origin = sourceOrigin(sourceUrl);
  const p = exact(raw, [
    "version",
    "scope",
    "state",
    "library_digest",
    "total_count",
    "offset",
    "collections",
    "next_cursor",
  ]);
  if (p.version !== 1) invalid();
  const actor = scope(p.scope),
    viewState = state(p.state),
    token = digest(p.library_digest),
    total = integer(p.total_count, 0, 1000),
    offset = integer(p.offset, 0, total);
  if (
    !sameScope(actor, expected.scope) ||
    viewState !== expected.state ||
    !Array.isArray(p.collections)
  )
    invalid();
  if (
    expected.cursor
      ? token !== expected.cursor.library_digest || offset < 1
      : offset !== 0
  )
    invalid();
  if (p.collections.length > expected.limit) invalid();
  const rows = p.collections.map((v) => entry(v, actor, viewState, origin));
  if (rows.length !== Math.min(expected.limit, total - offset)) invalid();
  let previous: Pick<LibraryRoot, "id" | "sort_order"> | null = expected.cursor;
  for (const row of rows) {
    if (previous && !ordered(row.collection, previous)) invalid();
    previous = row.collection;
  }
  const next = p.next_cursor === null ? null : cursor(p.next_cursor);
  if ((next !== null) !== offset + rows.length < total) invalid();
  if (
    next &&
    (!previous ||
      !sameScope(next.scope, actor) ||
      next.state !== viewState ||
      next.library_digest !== token ||
      next.id !== previous.id ||
      next.sort_order !== previous.sort_order)
  )
    invalid();
  const out = Object.freeze({
    version: 1,
    scope: actor,
    state: viewState,
    library_digest: token,
    total_count: total,
    offset,
    collections: Object.freeze(rows),
    next_cursor: next,
  });
  if (new TextEncoder().encode(JSON.stringify(out)).byteLength > 2097152)
    invalid();
  return out;
}

/** Callers must fence the original source/account/Family/session across every await. */
export function createCollectionLibraryReader(
  rpc: LibraryRpc,
  sourceUrl: string,
) {
  const origin = sourceOrigin(sourceUrl);
  async function page(
    input: LibraryRequest,
    assertCurrent: () => void,
  ): Promise<LibraryPage> {
    const p = request(input);
    assertCurrent();
    let raw: unknown;
    try {
      raw = await rpc("get_family_collection_library_v1", {
        p_family_id: p.scope.family_id,
        p_state: p.state,
        p_limit: p.limit,
        p_cursor: p.cursor,
      });
    } catch (error) {
      assertCurrent();
      throw error;
    }
    assertCurrent();
    return checkCollectionLibraryPage(raw, p, origin);
  }
  return {
    page,
    async all(
      input: { scope: LibraryScope; state: LibraryState },
      assertCurrent: () => void,
    ) {
      const actor = scope(input.scope),
        viewState = state(input.state),
        rows: LibraryEntry[] = [];
      let next: LibraryCursor | null = null,
        token: string | null = null,
        total: number | null = null;
      for (let n = 0; n < 10; n++) {
        const p: LibraryPage = await page(
          { scope: actor, state: viewState, limit: 100, cursor: next },
          assertCurrent,
        );
        if (
          p.offset !== rows.length ||
          (token !== null &&
            (p.library_digest !== token || p.total_count !== total))
        )
          invalid();
        token = p.library_digest;
        total = p.total_count;
        rows.push(...p.collections);
        next = p.next_cursor;
        if (next === null) {
          if (
            rows.length !== total ||
            new Set(rows.map((x) => x.collection.id)).size !== total
          )
            invalid();
          assertCurrent();
          return Object.freeze({
            scope: actor,
            state: viewState,
            library_digest: token,
            collections: Object.freeze(rows),
          });
        }
      }
      invalid();
    },
  };
}

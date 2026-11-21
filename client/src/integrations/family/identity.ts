/** Upstream view keys only. Canonical Family UUIDs never change. */
export type IdentityKind =
  | 'person'
  | 'trip'
  | 'day'
  | 'place'
  | 'assignment'
  | 'stay'
  | 'reservation'
  | 'expense'
  | 'file'
  | 'note'
  | 'packing'
  | 'todo'
  | 'category'
  | 'tag'
  | 'journey'
  | 'collection'
  | 'track'
  | 'draft'
  | 'endpoint'
  | 'leg'
  | 'auth'
  | 'packingBag'
  | 'packingCategory'
  | 'packingTemplate'
  | 'fileLink'
  | 'settlement'
  | 'journeyEntry'
  | 'journeyPhoto'
  | 'media'
  | 'collectionItem'
  | 'calendarPlan'
  | 'holidayCalendar'
  | 'notification';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set<IdentityKind>([
  'person',
  'trip',
  'day',
  'place',
  'assignment',
  'stay',
  'reservation',
  'expense',
  'file',
  'note',
  'packing',
  'todo',
  'category',
  'tag',
  'journey',
  'collection',
  'track',
  'draft',
  'endpoint',
  'leg',
  'auth',
  'packingBag',
  'packingCategory',
  'packingTemplate',
  'fileLink',
  'settlement',
  'journeyEntry',
  'journeyPhoto',
  'media',
  'collectionItem',
  'calendarPlan',
  'holidayCalendar',
  'notification',
]);
type Identity = { kind: IdentityKind; uuid: string; key: number };
export interface IdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
class FamilyIdentityError extends Error {
  constructor(public readonly code: 'invalid_uuid' | 'unknown_view_key' | 'collision') {
    super(`Family UI identity: ${code}`);
  }
}
function viewKey(value: string): number {
  let hash = 14695981039346656037n;
  for (let i = 0; i < value.length; i++)
    hash = BigInt.asUintN(64, (hash ^ BigInt(value.charCodeAt(i))) * 1099511628211n);
  return Number(hash & ((1n << 53n) - 1n)) || 1;
}
/** A deterministic, session-scoped presentation lookup, never a domain-record store. */
export class FamilyIdentityRegistry {
  private readonly byUuid = new Map<string, Identity>();
  private readonly byKey = new Map<number, Identity>();
  private readonly storageKey: string;
  private readonly scope: string;
  constructor(
    scope: string,
    private readonly storage?: IdentityStorage,
    private readonly hash: (value: string) => number = viewKey
  ) {
    if (!UUID.test(scope)) throw new FamilyIdentityError('invalid_uuid');
    this.scope = scope.toLowerCase();
    this.storageKey = `family-trek-view-identities-v1:${this.scope}`;
    try {
      const raw: unknown = JSON.parse(storage?.getItem(this.storageKey) ?? 'null');
      if (Array.isArray(raw))
        for (const row of raw) {
          if (
            row &&
            typeof row === 'object' &&
            'kind' in row &&
            'uuid' in row &&
            KINDS.has(row.kind as IdentityKind) &&
            typeof row.uuid === 'string' &&
            UUID.test(row.uuid)
          )
            this.register(row.kind as IdentityKind, row.uuid, false);
        }
    } catch {
      /* Corrupt or unavailable cache cannot grant access or change an identity. */
    }
  }
  /** Presentation-owner check only; this never grants database or Family access. */
  isScopedTo(userId: string): boolean {
    return UUID.test(userId) && this.scope === userId.toLowerCase();
  }
  register(kind: IdentityKind, uuid: string, persist = true): number {
    if (!KINDS.has(kind) || !UUID.test(uuid)) throw new FamilyIdentityError('invalid_uuid');
    const canonical = uuid.toLowerCase();
    const name = `${kind}:${canonical}`;
    const existing = this.byUuid.get(name);
    if (existing) return existing.key;
    const key = this.hash(`${this.scope}:${name}`);
    if (!Number.isSafeInteger(key) || key <= 0) throw new FamilyIdentityError('collision');
    const collision = this.byKey.get(key);
    if (collision && (collision.uuid !== canonical || collision.kind !== kind))
      throw new FamilyIdentityError('collision');
    const identity = { kind, uuid: canonical, key };
    this.byUuid.set(name, identity);
    this.byKey.set(key, identity);
    if (persist)
      try {
        this.storage?.setItem(this.storageKey, JSON.stringify([...this.byKey.values()]));
      } catch {
        /* Session lookup remains usable if storage is full. */
      }
    return key;
  }
  /** Snapshot callers use a dedicated registry; never export an account-wide lookup. */
  bindings(): Identity[] {
    return [...this.byKey.values()].map((entry) => ({ ...entry })).sort((a, b) => a.key - b.key);
  }
  uuid(kind: IdentityKind, value: number | string): string {
    if (typeof value === 'string' && UUID.test(value)) {
      this.register(kind, value);
      return value.toLowerCase();
    }
    const key = typeof value === 'number' ? value : /^\d+$/.test(value) ? Number(value) : NaN;
    const identity = this.byKey.get(key);
    if (!identity || identity.kind !== kind) throw new FamilyIdentityError('unknown_view_key');
    return identity.uuid;
  }
  canonicalTripPath(pathname: string): string {
    return pathname.replace(
      /(\/(?:trips|journey|collections)\/)(\d+)(?=\/|[?#]|$)/g,
      (match, prefix: string, key: string) => {
        return (
          prefix +
          this.uuid(
            prefix.includes('/journey/') ? 'journey' : prefix.includes('/collections/') ? 'collection' : 'trip',
            key
          )
        );
      }
    );
  }
}

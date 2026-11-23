import type { QueuedMutation } from '../db/offlineDb';

/**
 * A write the server answers with a 5xx this many times is parked as failed.
 * The gaps double from 30 s, so the last try comes about two hours after the
 * first: long enough for a restart or an outage, short of blocking forever.
 */
export const MAX_SERVER_ERROR_ATTEMPTS = 8;

export const SERVER_ERROR_BACKOFF_MS = 30_000;

/** HTTP statuses that should be retried later rather than treated as terminal. */
export function isRetryableStatus(status: number | undefined): boolean {
  // 401: token expired mid-flush (offline window) — retry after re-auth.
  // 408/425/429: timeout / too-early / rate-limited — transient.
  return status === 401 || status === 408 || status === 425 || status === 429;
}

/**
 * The entity a queued write targets, as `resource:id`. A create is keyed by its
 * temporary id, which is also what the writes queued against it carry until it
 * syncs. Undefined when the row names no entity (it is then never held back).
 */
export function entityKey(m: QueuedMutation): string | undefined {
  if (!m.resource) return undefined;
  const id = m.entityId ?? m.tempEntityId ?? (m.method === 'POST' ? m.tempId : undefined);
  return id === undefined ? undefined : `${m.resource}:${id}`;
}

/** Pull the server's current entity out of a 409 response body ({ server: {...} }). */
export function extractConflictServer(err: unknown): unknown {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data && typeof data === 'object' && 'server' in data) {
    return (data as { server: unknown }).server;
  }
  return null;
}

// Body fields that can name an entity created offline earlier in the queue: an
// expense saved from a place or a booking that has not synced yet, a booking
// linked to such a place or stay.
const TEMP_REF_FIELDS = ['place_id', 'reservation_id', 'accommodation_id'] as const;

// Objects inside a body that carry such fields of their own: the stay a hotel
// booking creates alongside names its place.
const TEMP_REF_OBJECTS = ['create_accommodation'] as const;

// A new order of a day's visits can name visits created offline.
const TEMP_REF_LISTS = ['orderedIds'] as const;

// The 404s of a walk's mark that name a part of it that is gone: the trip, the
// day, the walk or the stop (TripAccessGuard, TourVisitsService). Any other 404,
// the Tours addon turned off among them, fails like any other refusal.
const GONE_WALK_PARTS = new Set(['Trip not found', 'Assignment not found', 'City walk not found', 'Station not found']);

/**
 * The body with every link to an offline-created entity pointed at the real id
 * the queue learned for it. The same body when nothing changed.
 */
export function remapBodyRefs(body: unknown, idMap: Map<number, number>): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const fields = body as Record<string, unknown>;
  let remapped: Record<string, unknown> | null = null;
  for (const field of TEMP_REF_FIELDS) {
    const ref = fields[field];
    const realId = typeof ref === 'number' && ref < 0 ? idMap.get(ref) : undefined;
    if (realId === undefined) continue;
    remapped ??= { ...fields };
    remapped[field] = realId;
  }
  for (const key of TEMP_REF_OBJECTS) {
    const nested = fields[key];
    const next = remapBodyRefs(nested, idMap);
    if (next === nested) continue;
    remapped ??= { ...fields };
    remapped[key] = next;
  }
  for (const key of TEMP_REF_LISTS) {
    const list = fields[key];
    if (!Array.isArray(list) || !list.some((id) => typeof id === 'number' && idMap.has(id))) continue;
    remapped ??= { ...fields };
    remapped[key] = list.map((id) => (typeof id === 'number' ? (idMap.get(id) ?? id) : id));
  }
  return remapped ?? body;
}

/**
 * The body as it is sent: every link the queue has learned the real id of, and
 * a list without the temporary ids it has not. Those name a create that did not
 * sync, which the server would not know.
 */
export function bodyToSend(body: unknown, idMap: Map<number, number>): unknown {
  const remapped = remapBodyRefs(body, idMap);
  if (!remapped || typeof remapped !== 'object' || Array.isArray(remapped)) return remapped;
  const fields = remapped as Record<string, unknown>;
  let trimmed: Record<string, unknown> | null = null;
  for (const key of TEMP_REF_LISTS) {
    const list = fields[key];
    if (!Array.isArray(list) || !list.some((id) => typeof id === 'number' && id < 0)) continue;
    trimmed ??= { ...fields };
    trimmed[key] = list.filter((id) => typeof id !== 'number' || id > 0);
  }
  return trimmed ?? remapped;
}

/**
 * A 404 that means the write did what it set out to do: a DELETE of something
 * the server no longer has, or a mark of a walk's stop whose stop, day, walk or
 * trip is gone, since its visits went with it.
 */
export function doneByNotFound(mutation: QueuedMutation, err: unknown): boolean {
  if (mutation.method === 'DELETE') return true;
  if (mutation.resource !== 'tourStationVisits') return false;
  // Called on a 404 only, so the server answered.
  const reason = (err as { response: { data?: { error?: unknown } } }).response.data?.error;
  return typeof reason === 'string' && GONE_WALK_PARTS.has(reason);
}

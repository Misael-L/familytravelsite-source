import { CREATION_TERMINAL_ARCHIVE_KEY, hasPendingCreationTerminal } from '../db/creationTerminalArchive'
import { pendingTerminalDecision, retryRetainedFailures } from './retainedQueueGuards'
import { packingDependencyProtectedIds } from '../db/packingDependencyProtection'
import { SOURCE_PAUSE_KEY, sourceDatabaseName } from '../db/sourceDatabase'
import { assertWritableSession, hasReadOnlyBuild } from '../db/readOnlySession'
import { acquireQueueLock } from './queueLock'
import { captureQueueSession, QueueSessionChanged } from './queueSession'
import { isProtectedQueueWork, isRetainedCommand, isUnscopedFamilyWrite, RetainedCommandError } from './retainedCommand'
import { isSupportedMutationFormat } from './queueFormat'
/**
 * Mutation queue — offline write queue backed by IndexedDB (Dexie).
 *
 * Flow:
 *   offline create/update/delete → enqueue() → optimistic Dexie write (in repo)
 *   online trigger → flush() → replay REST with X-Idempotency-Key header → update Dexie
 */
import { offlineDb, MUTATION_SCHEMA_VERSION, currentOfflineDatabase } from '../db/offlineDb'
import { cacheTourAnswer } from '../db/cacheTour'
import { apiClient } from '../api/client'
import { isAuthed } from './authGate'
import { isEffectivelyOffline } from './networkMode'
import { getOfflinePrefs } from './offlinePrefs'
import { randomId } from '../utils/randomId'
import type { QueuedMutation } from '../db/offlineDb'
import type { Table } from 'dexie'
import { roadtripPreferencesResponseSchema, assignmentSchema, tourCreateResponseSchema, tourDraftResponseSchema, tourVisitListResponseSchema, type TourCreateResponse } from '@trek/shared'
import { cacheAssignment } from '../db/cacheAssignment'
import { replaceAssignmentVisits } from '../db/cacheTourVisits'
import { cacheTourDraft } from '../db/cacheTourDrafts'
import type { Assignment, AssignmentParticipant, BudgetItem, BudgetItemMember, Day, DayNote, Reservation, Trip, TripFile } from '../types'
import {
  bodyToSend,
  doneByNotFound,
  entityKey,
  extractConflictServer,
  isRetryableStatus,
  MAX_SERVER_ERROR_ATTEMPTS,
  remapBodyRefs,
  SERVER_ERROR_BACKOFF_MS,
} from './mutationQueueValues';
// No generic replay/rebinding for session-bound stays or aggregate packing commands.
const originalProtocols = [
  /^\/trips\/[^/]+\/family\/planner-create-command(?:\/|$)/,
  /^\/family\/collections(?:\/|$)/,
  /^\/trips\/[^/]+\/family\/stays(?:\/|$)/,
  /^\/trips\/[^/]+\/family\/stay-bundles(?:\/|$)/,
  /^\/trips\/[^/]+\/family\/native-stays(?:\/|$)/,
  /^\/trips\/[^/]+\/family\/packing\/group-commands(?:\/|$)/,
  /^\/trips\/[^/]+\/family\/packing\/category-[^/]*(?:\/|$)/,
  /^\/trips\/[^/]+\/family\/packing\/bag-[^/]*(?:\/|$)/,
]
function originalProtocolHeld(url: string): boolean {
  return originalProtocols.some((pattern) => pattern.test(url))
}

type QueueDatabase = ReturnType<typeof currentOfflineDatabase>

// Map Dexie table names used in `resource` field → actual Dexie tables.
function getTable(resource: string, db: QueueDatabase = offlineDb): Table | undefined {
  const map: Record<string, Table> = {
    places:       db.places,
    packingItems: db.packingItems,
    todoItems:    db.todoItems,
    budgetItems:  db.budgetItems,
    reservations: db.reservations,
    accommodations: db.accommodations,
    tripFiles:    db.tripFiles,
  }
  return map[resource]
}

/**
 * Generate a v4-style UUID using the platform crypto API.
 *
 * The implementation moved to utils/randomId so the axios interceptor, which
 * mints the same header for online writes, cannot drift away from it — this
 * value becomes the X-Idempotency-Key and a duplicate silently drops a write.
 */
export function generateUUID(): string {
  return randomId()
}

// The flush in progress, from the moment flush() is called until its last pass is
// done, including the time it waits for another tab's lock. A second call gets
// this same promise, so no caller resolves while a pass is still to come.
let _flushRun: Promise<void> | null = null
let _flushOwner: ReturnType<typeof captureQueueSession> | null = null
// Set when flush() is called while a pass is already running. That pass read its
// pending rows when it began, so a write queued since then waits for one more
// pass, which the running flush starts once that pass is done.
let _flushAgain = false

/**
 * Take the cross-tab flush lock, waiting while another tab holds it. Every open
 * tab of the account shares the queue and runs its own triggers, and the
 * in-progress flush only covers its own tab: two tabs read the same pending rows
 * and replay each of them twice, leaning on the server's replay cache to answer
 * the second. Waiting rather than skipping matters to the callers: the online
 * trigger re-seeds Dexie from the server once flush() resolves, and the socket
 * refetches the trip, so a flush that returned while another tab was still
 * replaying would let them lay the server's older rows over edits that are
 * about to land. The waiting tab then runs its own pass, which finds what the
 * holder left. Resolves to the release function. Where the Web Locks API is
 * missing or refuses the request, the flush runs as before, guarded by the
 * flag alone. The lock goes with the tab, so a tab killed mid-flush never
 * strands it.
 */
// A row sits on 'syncing' only while its request is in flight, and the shared
// axios instance times out at 8s. Anything still 'syncing' a minute later
// belongs to a flush that never reached its catch — the tab was killed, the PWA
// was evicted, the device slept mid-request. flush() only ever selects
// 'pending', so without recovery that row is stranded: counted in the badge,
// never replayed, and blocking every dependent behind it.
const STUCK_SYNCING_MS = 60_000
// Monotonically increasing timestamp so same-millisecond enqueues
// still get a deterministic FIFO order when sorted by createdAt.
let _lastTs = 0
// Monotonic counter for offline temp ids. Date.now() alone collides when two
// creates land in the same millisecond (bulk import, rapid tapping), which would
// overwrite one optimistic Dexie row. This guarantees distinct negative ids.
let _lastTempId = 0

/**
 * Mint a collision-free temporary (negative) id for an offline-created entity.
 * Monotonic across the session so same-millisecond creates never collide.
 * Never use it for trips: the assistant keys a journey's chat by the negated
 * journey id (store/assistantChatKey.ts) and relies on trip ids being positive.
 */
export function nextTempId(): number {
  const now = Date.now()
  _lastTempId = now > _lastTempId ? now : _lastTempId + 1
  return -_lastTempId
}

/**
 * Entities with a parked write ('failed', or a 'conflict' waiting for the user),
 * each with the time of the earliest such write. A later write to the same
 * entity must not overtake it: replayed afterwards by Try again or Keep mine,
 * the older write would silently overwrite the newer one, and only places and
 * packing items carry a token the server could refuse it with.
 */
async function parkedEntities(db: QueueDatabase = offlineDb): Promise<Map<string, number>> {
  const parked = await db.mutationQueue.where('status').anyOf(['failed', 'conflict']).toArray()
  const held = new Map<string, number>()
  for (const m of parked) holdEntity(held, m)
  return held
}

function holdEntity(held: Map<string, number>, m: QueuedMutation): void {
  const keys = [entityKey(m), ...(isRetainedCommand(m) ? [`family-command-trip:${m.tripId}`] : [])]
  for (const key of keys) {
    if (key === undefined) continue
    const since = held.get(key)
    if (since === undefined || m.createdAt < since) held.set(key, m.createdAt)
  }
}

// The UI build stamped onto each queued write, for diagnosis. Empty where the
// bundler defined none.
const BUILD_VERSION: string = typeof __TREK_UI_VERSION__ === 'string' ? __TREK_UI_VERSION__ : ''

/**
 * Was this write queued by a build whose row format this one does not know? A
 * tab still on the previous bundle, or an install rolled back, would otherwise
 * replay a shape it cannot read. Such a row stays in the queue as it is, for
 * the build that wrote it; a row without a stamp predates it and is format 1.
 */
function isFromNewerFormat(m: QueuedMutation): boolean {
  return !isSupportedMutationFormat(m)
}

/** Write a server entity into its Dexie table (used when "theirs" wins a conflict). */
async function applyServerEntity(mutation: QueuedMutation, server: unknown, db: QueueDatabase = offlineDb): Promise<void> {
  if (!mutation.resource || !server || typeof server !== 'object' || !('id' in server)) return
  const table = getTable(mutation.resource, db)
  if (table) await table.put(server)
}

/**
 * Roll back what an offline CREATE wrote under its temporary id, once the
 * server refused it for good. A tour is a place plus its facet, so both go.
 */
async function dropTempRows(mutation: QueuedMutation, db: QueueDatabase = offlineDb): Promise<void> {
  if (isProtectedQueueWork(mutation) || mutation.method === 'DELETE' || mutation.tempId === undefined || !mutation.resource) return
  if (mutation.resource === 'tours') {
    await db.places.delete(mutation.tempId)
    await db.tours.delete(mutation.tempId)
    return
  }
  // Visits and day notes live on the cached day, not in a table of their own.
  if (mutation.resource === 'assignments' || mutation.resource === 'dayNotes') {
    const tempId = mutation.tempId
    await db.days.where('trip_id').equals(mutation.tripId).modify(day => {
      if (mutation.resource === 'assignments') day.assignments = (day.assignments ?? []).filter(a => a.id !== tempId)
      else day.notes_items = (day.notes_items ?? []).filter(n => n.id !== tempId)
    })
    return
  }
  const table = getTable(mutation.resource, db)
  if (table) await table.delete(mutation.tempId)
}

/**
 * A CREATE replayed and the server answered with the real id: later queued
 * writes still aimed at the temporary one are pointed at it, in memory for
 * this flush and durably for the next.
 */
async function remapTempId(mutation: QueuedMutation, realId: number, idMap: Map<number, number>, db: QueueDatabase = offlineDb): Promise<void> {
  const tempId = mutation.tempId
  if (tempId === undefined || tempId === realId) return
  idMap.set(tempId, realId)
  await db.mutationQueue
    .where('tripId')
    .equals(mutation.tripId)
    .filter(m => !isProtectedQueueWork(m) && m.tempEntityId === tempId)
    .modify(m => {
      m.url = m.url.replace('{id}', String(realId))
      m.entityId = realId
      m.tempEntityId = undefined
    })
  const learned = new Map([[tempId, realId]])
  await db.mutationQueue
    .where('tripId')
    .equals(mutation.tripId)
    .filter(m => !isProtectedQueueWork(m) && remapBodyRefs(m.body, learned) !== m.body)
    .modify(m => { m.body = remapBodyRefs(m.body, learned) })
}
// Resources whose writes carry no version token (see the 409 branch of the flush).
const UNVERSIONED_RESOURCES = new Set(['assignments', 'days', 'dayNotes', 'tourStationVisits'])

/**
 * A replayed expense write. Only `item` names the expense: the members route
 * answers `{ members, item }` with the item's bare row and the paid tick answers
 * `{ member }` with no item at all, so neither fits the first-value rule of the
 * generic branch. The bare row keeps the payers and receipts the local copy
 * holds and takes the members the answer lists.
 */
async function reconcileBudgetItem(mutation: QueuedMutation, data: unknown, idMap: Map<number, number>, db: QueueDatabase = offlineDb): Promise<void> {
  const answer = (data && typeof data === 'object' ? data : {}) as { item?: BudgetItem; members?: BudgetItemMember[] }
  const item = answer.item
  if (!item || typeof item.id !== 'number') return
  if (mutation.tempId !== undefined && mutation.tempId !== item.id) {
    await db.budgetItems.delete(mutation.tempId)
    await remapTempId(mutation, item.id, idMap, db)
  }
  const local = await db.budgetItems.get(item.id)
  await db.budgetItems.put({ ...local, ...item, ...(answer.members ? { members: answer.members } : {}) })
}

/**
 * A replayed booking write. Only `reservation` names the booking: the travelers
 * route answers `{ travelers, reservation }`, which the first-value rule of the
 * generic branch would read as the traveler list. The travelers the answer
 * lists replace the local ones; a row that does not list them keeps them.
 */
async function reconcileReservation(mutation: QueuedMutation, data: unknown, idMap: Map<number, number>, db: QueueDatabase = offlineDb): Promise<void> {
  const answer = (data && typeof data === 'object' ? data : {}) as { reservation?: Reservation; travelers?: Reservation['travelers'] }
  const reservation = answer.reservation
  if (!reservation || typeof reservation.id !== 'number') return
  if (mutation.tempId !== undefined && mutation.tempId !== reservation.id) {
    await db.reservations.delete(mutation.tempId)
    await remapTempId(mutation, reservation.id, idMap, db)
  }
  const local = await db.reservations.get(reservation.id)
  await db.reservations.put({ ...local, ...reservation, ...(answer.travelers ? { travelers: answer.travelers } : {}) })
}

/**
 * A replayed file write. Only `file` names the file: the link route answers
 * `{ success, links }`, and the file routes answer the stored row without the
 * ids of its further links, so the ones the local copy holds stay.
 */
async function reconcileTripFile(data: unknown, db: QueueDatabase = offlineDb): Promise<void> {
  const file = (data && typeof data === 'object' ? data : {}) as { file?: TripFile }
  if (!file.file || typeof file.file.id !== 'number') return
  const local = await db.tripFiles.get(file.file.id)
  await db.tripFiles.put({ ...local, ...file.file })
}

/**
 * A replayed visit write. A create moves the visit on its cached day from the
 * temporary id to the real one; the visit routes answer `{ assignment }`, the
 * participants route `{ participants }`, and a reorder or delete names no visit.
 */
async function reconcileAssignment(mutation: QueuedMutation, data: unknown, entityId: number | undefined, idMap: Map<number, number>, db: QueueDatabase = offlineDb): Promise<void> {
  const answer = (data && typeof data === 'object' ? data : {}) as { assignment?: unknown; participants?: AssignmentParticipant[] }
  if (answer.assignment) {
    const saved = assignmentSchema.parse(answer.assignment) as Assignment
    const tempId = mutation.tempId
    if (tempId !== undefined && tempId !== saved.id) {
      await db.days.where('id').equals(saved.day_id).modify(day => {
        day.assignments = (day.assignments ?? []).map(a => (a.id === tempId ? { ...a, ...saved } : a))
      })
      await remapTempId(mutation, saved.id, idMap, db)
    }
    await cacheAssignment(saved, db)
    return
  }
  if (answer.participants && entityId !== undefined) {
    const participants = answer.participants
    await db.days.where('trip_id').equals(mutation.tripId).modify(day => {
      if (!day.assignments?.some(a => a.id === entityId)) return
      day.assignments = day.assignments.map(a => (a.id === entityId ? { ...a, participants } : a))
    })
  }
}

/**
 * A replayed day write. The day answers `{ day }` without its notes, so the
 * cached notes stay, and so do the cached visits: they may hold writes still
 * waiting behind this one.
 */
async function reconcileDay(data: unknown, db: QueueDatabase = offlineDb): Promise<void> {
  const day = data && typeof data === 'object' ? (data as { day?: Day }).day : undefined
  if (!day || typeof day.id !== 'number') return
  const { assignments: _assignments, notes_items: _notes, ...fields } = day
  await db.days.where('id').equals(day.id).modify(row => { Object.assign(row, fields) })
}

/**
 * A replayed trip write. The answer lays its fields over the cached trip, which
 * keeps the counts the list shape carries and the answer does not.
 */
async function reconcileTrip(data: unknown, db: QueueDatabase = offlineDb): Promise<void> {
  const trip = data && typeof data === 'object' ? (data as { trip?: Trip }).trip : undefined
  if (!trip || typeof trip.id !== 'number') return
  const local = await db.trips.get(trip.id)
  await db.trips.put({ ...local, ...trip })
}

/** A replayed day note write: the note lands on its cached day, a create under its real id. */
async function reconcileDayNote(mutation: QueuedMutation, data: unknown, idMap: Map<number, number>, db: QueueDatabase = offlineDb): Promise<void> {
  const note = data && typeof data === 'object' ? (data as { note?: DayNote }).note : undefined
  if (!note || typeof note.id !== 'number') return
  const replaceId = mutation.tempId ?? note.id
  await db.days.where('id').equals(note.day_id).modify(day => {
    const notes = day.notes_items ?? []
    day.notes_items = notes.some(n => n.id === replaceId)
      ? notes.map(n => (n.id === replaceId ? { ...n, ...note } : n))
      : [...notes.filter(n => n.id !== note.id), note]
  })
  if (mutation.tempId !== undefined && mutation.tempId !== note.id) await remapTempId(mutation, note.id, idMap, db)
}

/**
 * A replayed mark of a city walk's stop (CW-03): the day's visits as the server
 * answers them. An answer that does not read as one is left alone rather than
 * holding the queue up; the next read of the trip fetches them again.
 */
async function reconcileStationVisits(mutation: QueuedMutation, data: unknown, assignmentId: number | undefined, db: QueueDatabase = offlineDb): Promise<void> {
  const answer = tourVisitListResponseSchema.safeParse(data)
  if (!answer.success || assignmentId === undefined) return
  await replaceAssignmentVisits(mutation.tripId, assignmentId, answer.data.visits, db)
}

/** Visits, days, day notes, the trip itself and a walk's marks, each from the answer its route gives. */
async function reconcilePlanWrite(mutation: QueuedMutation, data: unknown, entityId: number | undefined, idMap: Map<number, number>, db: QueueDatabase = offlineDb): Promise<void> {
  if (mutation.method === 'DELETE') return
  if (mutation.resource === 'assignments') await reconcileAssignment(mutation, data, entityId, idMap, db)
  else if (mutation.resource === 'days') await reconcileDay(data, db)
  else if (mutation.resource === 'dayNotes') await reconcileDayNote(mutation, data, idMap, db)
  else if (mutation.resource === 'trips') await reconcileTrip(data, db)
  else if (mutation.resource === 'tourStationVisits') await reconcileStationVisits(mutation, data, entityId, db)
}

/**
 * A replayed tour write. The answer names the tour by its place, so the
 * offline place and facet move from the temporary id to the real one. The
 * place keeps its offline copy until the next list replaces it: the server
 * created it from the same route.
 */
async function reconcileTour(mutation: QueuedMutation, saved: TourCreateResponse, idMap: Map<number, number>, db: QueueDatabase = offlineDb): Promise<void> {
  const realId = saved.tour.place_id
  await db.transaction('rw', db.places, db.tours, async () => {
    if (mutation.tempId !== undefined && mutation.tempId !== realId) {
      const temp = await db.places.get(mutation.tempId)
      await db.places.delete(mutation.tempId)
      await db.tours.delete(mutation.tempId)
      if (temp && !(await db.places.get(realId))) await db.places.put({ ...temp, id: realId })
    }
    await cacheTourAnswer(mutation.tripId, saved, db)
  })
  await remapTempId(mutation, realId, idMap, db)
}

/** Interpret only known raw Family rows, retaining the original facts for explicit recovery. */
async function parkUnscopedFamilyWrites(db: QueueDatabase, paused = new Set<string>()): Promise<void> {
  await db.mutationQueue.filter(m => !paused.has(m.id) && isSupportedMutationFormat(m) && isUnscopedFamilyWrite(m) && !m.recoveryHold).modify(m => {
    m.recoveryHold = { reason: 'unscoped-native', originalStatus: m.status, originalSchemaVersion: m.schemaVersion, released: false }
    m.status = 'conflict'
    m.retentionPolicy = 'family-original-v1'
    m.lastError = 'This native write has no checked original Family scope. Export it; automatic replay is unavailable.'
  })
}

/** A retained command is replayed verbatim, never rewritten as a native row image. */
function replayRequest(mutation: QueuedMutation, context: { reqUrl: string; reqEntityId?: number; idMap: Map<number, number>; tokenMap: Map<string, string> }) {
  const { reqUrl, reqEntityId, idMap, tokenMap } = context
  const retained = isRetainedCommand(mutation)
  const headers: Record<string, string> = { 'X-Idempotency-Key': mutation.id }
  const tokenKey = mutation.resource !== undefined && reqEntityId !== undefined ? `${mutation.resource}:${reqEntityId}` : undefined
  const baseToken = (retained ? undefined : tokenKey && tokenMap.get(tokenKey)) || mutation.baseUpdatedAt
  if (baseToken) headers['X-Base-Updated-At'] = baseToken
  return { method: mutation.method, url: reqUrl, data: retained ? mutation.body : bodyToSend(mutation.body, idMap), headers }
}

async function advanceQueuedToken(mutation: QueuedMutation, realId: number, entity: object, tokenMap: Map<string, string>, db: QueueDatabase): Promise<void> {
  const newToken = (entity as { updated_at?: unknown }).updated_at
  if (typeof newToken !== 'string') return
  if (mutation.resource) tokenMap.set(`${mutation.resource}:${realId}`, newToken)
  await db.mutationQueue.where('tripId').equals(mutation.tripId)
    .filter(m => m.id !== mutation.id && !isProtectedQueueWork(m) && m.resource === mutation.resource && m.entityId === realId && (m.status === 'pending' || m.status === 'syncing'))
    .modify(m => { m.baseUpdatedAt = newToken })
}

function queueSessionOnline(session: ReturnType<typeof captureQueueSession>) { return session.current() && !isEffectivelyOffline() }

export const mutationQueue = {
  /**
   * Add a mutation to the queue.
   * Returns the UUID (= idempotency key).
   */
  async enqueue(
    mutation: Omit<QueuedMutation, 'status' | 'attempts' | 'createdAt' | 'lastError' | 'schemaVersion' | 'buildVersion'>,
  ): Promise<string> {
    assertWritableSession()
    const now = Date.now()
    _lastTs = now > _lastTs ? now : _lastTs + 1
    const item: QueuedMutation = {
      ...mutation,
      status: 'pending',
      attempts: 0,
      createdAt: _lastTs,
      lastError: null,
      schemaVersion: MUTATION_SCHEMA_VERSION,
      buildVersion: BUILD_VERSION,
    }
    if (isRetainedCommand(item)) item.retentionPolicy = 'family-original-v1'
    await offlineDb.mutationQueue.put(item)
    return item.id
  },

  /**
   * Does a write to this entity have to join the queue? Offline, always. Online
   * too while an older write to the same entity is still queued, backing off,
   * parked as failed or waiting as a conflict: sent straight to the server the
   * new write would land first, and Try again or the next flush would replay
   * the older one over it. Queued, it waits behind the older write and keeps
   * the order the user made them in. The repos of visits, a day's visits, tours,
   * a walk's marks and the driving settings ask this, because those writes
   * carry no version token; a place or packing item sends one, so the server
   * refuses the older write (409) and it becomes a conflict instead.
   */
  async mustQueue(resource: string, entityId: number): Promise<boolean> {
    if (isEffectivelyOffline()) return true
    const key = `${resource}:${entityId}`
    const older = await offlineDb.mutationQueue
      .where('status')
      .anyOf(['pending', 'syncing', 'failed', 'conflict'])
      .filter(m => entityKey(m) === key)
      .first()
    return older !== undefined
  },

  /**
   * Start a flush for a write that joined the queue while online (see
   * mustQueue). It goes out as soon as the write it waits for is through, not
   * at the next trigger: when a flush is already running, that flush runs one
   * more pass once it is done (see flush). Offline this does nothing.
   */
  sendSoon(): void {
    if (isEffectivelyOffline()) return
    this.flush().catch(console.error)
  },

  /**
   * Drain the queue: replay each pending mutation against the server in FIFO order.
   * Stops on the first network error (retried on the next trigger). 4xx answers
   * are marked failed and skipped; a DELETE answered 404 counts as done, and so
   * does a mark of a walk's stop whose stop, day or walk is gone. A 5xx
   * holds back only its own trip, retried with growing gaps, and is parked as
   * failed once it has failed MAX_SERVER_ERROR_ATTEMPTS times. A write parked as
   * failed or as a conflict holds back the later writes to the same entity, so
   * they keep their order whatever the user decides about it. A write queued
   * by a newer build (a higher schemaVersion) is skipped and left pending, and
   * holds back the later writes to its entity the same way.
   *
   * A call that arrives while a flush is running, or still waiting for another
   * tab's lock, asks it for one more round (the running pass read the pending
   * rows when it began and would not see a write queued since) and resolves with
   * it. So whoever refetches once flush() resolves, like the socket's reconnect
   * hook, never does so while this tab or another one is still replaying.
   */
  flush(): Promise<void> {
    if (hasReadOnlyBuild() || isEffectivelyOffline() || !isAuthed()) return Promise.resolve()
    const owner = captureQueueSession()
    if (!owner.current()) return Promise.resolve()
    if (_flushRun !== null) {
      if (_flushOwner?.current()) { _flushAgain = true; return _flushRun }
      // A successor's explicit trigger waits for the previous run, then owns its own pass.
      // A stale trigger from the previous account must never start that successor pass.
      return _flushRun.then(() => { if (owner.current()) return this.flush() })
    }
    _flushOwner = owner
    const run = (async () => {
      try {
        // A "mine wins" auto-resolution dropped its base token; one more pass now
        // overwrites the server unconditionally. Bounded: the retried write carries
        // no token, so it cannot 409 for the same reason. A flush asked for while a
        // pass ran gets its pass here too. Bounded as well: the flag is only set by
        // a call made during a pass, and every pass clears it when it starts.
        let again = true
        while (again && owner.current()) {
          _flushAgain = false
          const needsRetry = await this._flushPass()
          again = owner.current() && (needsRetry || _flushAgain) && !isEffectivelyOffline() && isAuthed()
        }
      } finally {
        _flushRun = null
        _flushOwner = null
      }
    })()
    _flushRun = run
    return run
  },

  /**
   * One pass over the pending rows, under the cross-tab lock. Only flush() calls
   * it. Resolves to true when a write was re-queued for another pass.
   */
  async _flushPass(): Promise<boolean> {
    const session = captureQueueSession(), db = session.db
    if (!session.current()) return false
    const release = await acquireQueueLock(session)
    if (!release) return false
    // tempId → realId learned during this flush, so a dependent edit/delete
    // queued against an offline-created entity (still holding the negative id)
    // can be rewritten to the server id before it is replayed.
    const idMap = new Map<number, number>()
    // resource:entityId → freshest updated_at applied during this flush. A second
    // queued edit of the same entity must send THIS token, not the stale one its
    // snapshot was loaded with, or it would 409 against our own first edit (#1135).
    const tokenMap = new Map<string, string>()
    // Set when a conflict auto-resolved as "mine wins": the mutation is re-queued
    // without its base token, so one more pass overwrites the server cleanly.
    let needsRetry = false
    try {
      // Reclaim what an interrupted flush left behind before picking up work.
      // Replaying is safe: the mutation id doubles as the X-Idempotency-Key, so
      // a write the server already applied is answered from its replay cache.
      const dependencyIds = packingDependencyProtectedIds(await db.mutationQueue.toArray())
      // A durable explicit cancellation is a decision to stop replaying the original, not another command.
      if (await pendingTerminalDecision(db)) {
        for (const row of await db.mutationQueue.toArray()) if (isRetainedCommand(row)) dependencyIds.add(row.id)
      }
      if (!queueSessionOnline(session)) return false
      const paused = new Set([...(sourceDatabaseName(db.name) ? (await db.syncMeta.get(SOURCE_PAUSE_KEY))?.sourcePaused ?? [] : []), ...dependencyIds])
      await parkUnscopedFamilyWrites(db, paused)
      const stuckBefore = Date.now() - STUCK_SYNCING_MS
      await db.mutationQueue
        .where('status')
        .equals('syncing')
        .filter(m => !paused.has(m.id) && !originalProtocolHeld(m.url) && isSupportedMutationFormat(m) && (m.syncingSince ?? 0) < stuckBefore)
        .modify(m => { m.status = 'pending'; m.syncingSince = undefined })

      const pending = await db.mutationQueue
        .where('status')
        .equals('pending')
        .sortBy('createdAt')

      // Trips whose queue waits behind a write the server failed on. Their later
      // writes must keep their order, but every other trip goes on syncing.
      const blockedTrips = new Set<number>()
      // Entities whose later writes wait behind a parked one, until the user
      // tries it again or discards it. Grows as writes park during this pass.
      const heldEntities = await parkedEntities(db)

      for (const mutation of pending) {
        // Re-checked every pass, not just on entry: this loop writes server
        // responses straight into Dexie, and after a logout the proxy points at
        // the shared anonymous database. A flush that started before logout
        // would otherwise seed it with the previous account's rows.
        if (!queueSessionOnline(session)) break
        if (dependencyIds.has(mutation.id)) { holdEntity(heldEntities, mutation); continue }
        // These original-operation protocols are dispatched only by their qualified owners.
        if (originalProtocolHeld(mutation.url)) { holdEntity(heldEntities, mutation); continue }
        if (paused.has(mutation.id)) { holdEntity(heldEntities, mutation); continue }
        if (mutation.recoveryHold && !mutation.recoveryHold.released) { holdEntity(heldEntities, mutation); continue }
        if (blockedTrips.has(mutation.tripId)) continue
        const key = entityKey(mutation)
        const heldSince = Math.min(
          key === undefined ? Infinity : heldEntities.get(key) ?? Infinity,
          heldEntities.get(`family-command-trip:${mutation.tripId}`) ?? Infinity,
        )
        if (heldSince < mutation.createdAt) continue
        // Queued by a newer build: not sent, not marked, not dropped. It keeps
        // its place for that build, and the later writes to the same entity
        // wait behind it as they do behind a parked one.
        if (isFromNewerFormat(mutation)) {
          holdEntity(heldEntities, mutation)
          continue
        }
        if (mutation.retryAfter !== undefined && mutation.retryAfter > Date.now()) {
          blockedTrips.add(mutation.tripId)
          continue
        }

        if (isRetainedCommand(mutation)) mutation.retentionPolicy = 'family-original-v1'

        // Mark as syncing so UI can show progress. The stamp is what lets the
        // next flush tell an in-flight row from one a killed tab abandoned.
        await db.mutationQueue.update(mutation.id, { status: 'syncing', syncingSince: Date.now(), ...(isRetainedCommand(mutation) ? { retentionPolicy: 'family-original-v1' as const } : {}) })

        // Resolve a temp-id reference now that earlier CREATEs in this flush
        // may have completed (FIFO order guarantees the CREATE ran first).
        let reqUrl = mutation.url
        let reqEntityId = mutation.entityId
        if (mutation.tempEntityId !== undefined) {
          const realId = idMap.get(mutation.tempEntityId)
          if (realId !== undefined) {
            reqUrl = reqUrl.replace('{id}', String(realId))
            reqEntityId = realId
          }
        }
        // Placeholder still unresolved → the create it depended on is gone
        // (failed or missing). Surface it as failed rather than firing a 404.
        if (reqUrl.includes('{id}')) {
          await db.mutationQueue.update(mutation.id, {
            status: 'failed',
            attempts: mutation.attempts + 1,
            lastError: 'unresolved temp id (dependent create did not sync)',
          })
          holdEntity(heldEntities, mutation)
          continue
        }

        try {
          // Send the optimistic-concurrency token when we have one so the server
          // can reject a stale overwrite (409). Absent header => unconditional
          // write (back-compat with servers / resources that don't check it).
          // A newer token learned earlier in THIS flush (an earlier edit of the
          // same entity) overrides the snapshot's stale base.
          session.assertCurrent()
          if (isEffectivelyOffline()) {
            await db.mutationQueue.update(mutation.id, { status: 'pending', syncingSince: undefined })
            break
          }
          const response = await apiClient.request(replayRequest(mutation, { reqUrl, reqEntityId, idMap, tokenMap }))

          if (mutation.resource === 'roadtripPreferences') {
            const saved = roadtripPreferencesResponseSchema.parse(response.data)
            await db.roadtripPreferences.put(saved)
          }
          // The planner's draft as the account now holds it, or none after a discard.
          if (mutation.resource === 'tourDrafts') {
            await cacheTourDraft(mutation.tripId, mutation.method === 'DELETE' ? null : tourDraftResponseSchema.parse(response.data).draft, db)
          }
          // Apply canonical server response to Dexie
          // The plan's own rows have no table the generic branches below would
          // write, so those pass over them.
          await reconcilePlanWrite(mutation, response.data, reqEntityId, idMap, db)
          if (mutation.resource === 'tours') {
            await reconcileTour(mutation, tourCreateResponseSchema.parse(response.data), idMap, db)
          } else if (mutation.resource === 'budgetItems' && mutation.method !== 'DELETE') {
            await reconcileBudgetItem(mutation, response.data, idMap, db)
          } else if (mutation.resource === 'reservations' && mutation.method !== 'DELETE') {
            await reconcileReservation(mutation, response.data, idMap, db)
          } else if (mutation.resource === 'tripFiles' && mutation.method !== 'DELETE') {
            await reconcileTripFile(response.data, db)
          } else if (mutation.method !== 'DELETE' && mutation.resource) {
            const table = getTable(mutation.resource, db)
            if (table && response.data && typeof response.data === 'object') {
              // Server returns { place: {...} } or { item: {...} } — grab first value
              const values = Object.values(response.data as Record<string, unknown>)
              const entity = values[0]
              if (entity && typeof entity === 'object' && 'id' in entity) {
                const realId = (entity as { id: number }).id
                // Remove temp optimistic entry if id changed (CREATE case) and
                // remap any queued mutations that still target the negative id.
                if (mutation.tempId !== undefined && mutation.tempId !== realId) {
                  await table.delete(mutation.tempId)
                  await remapTempId(mutation, realId, idMap, db)
                }
                await table.put(entity)
                // Advance the base-version token of any other queued edits to the
                // same entity to the value we just wrote. Without this, a second
                // offline edit of the same place/item still carries the pre-flush
                // token and would 409 against our OWN just-applied first edit —
                // self-conflicting and risking loss of the later edit (#1135).
                await advanceQueuedToken(mutation, realId, entity, tokenMap, db)
              }
            }
          } else if (mutation.method === 'DELETE' && mutation.resource && reqEntityId !== undefined) {
            // DELETE was already applied optimistically; ensure it's gone
            const table = getTable(mutation.resource, db)
            if (table) await table.delete(reqEntityId)
          }

          await db.mutationQueue.delete(mutation.id)
        } catch (err: unknown) {
          if (!session.current() || err instanceof QueueSessionChanged) break
          const httpStatus = (err as { response?: { status: number } })?.response?.status

          // A DELETE of something the server no longer has did what it set out
          // to do. Reporting it as a failed sync would flag a change that worked.
          // So did a mark of a walk's stop whose stop, day or walk is gone:
          // parked as failed, it would hold back every later mark of that day
          // for nothing.
          // Family commands have checked observations/receipts, not generic row conflict images.
          // Keep the original body/header identity and park once, regardless of auto-strategy.
          if (isRetainedCommand(mutation) && httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500 && !isRetryableStatus(httpStatus)) {
            await db.mutationQueue.update(mutation.id, {
              status: httpStatus === 409 ? 'conflict' : 'failed',
              retentionPolicy: 'family-original-v1',
              conflictServer: extractConflictServer(err), conflictAt: Date.now(),
              attempts: mutation.attempts + 1, lastError: new RetainedCommandError().message,
            })
            holdEntity(heldEntities, mutation)
            continue
          }

          if (httpStatus === 404 && doneByNotFound(mutation, err)) {
            if (mutation.resource && reqEntityId !== undefined) {
              const table = getTable(mutation.resource, db)
              if (table) await table.delete(reqEntityId)
            }
            await db.mutationQueue.delete(mutation.id)
            continue
          }

          // 409 = the entity changed on the server since this offline edit was
          // made. This is NOT a dropped change like other 4xx — resolve it per
          // the user's strategy instead of failing it. Deliberately scoped to
          // edits: an offline DELETE is "delete wins" by design (no CAS on the
          // delete path), so it never reaches here. See the wiki Offline doc.
          // Visits, days, day notes and a walk's marks carry no version, so a
          // 409 there is a refusal (a Tour already on that day) that no retry
          // can change, and it fails like any other 4xx.
          if (httpStatus === 409 && mutation.method !== 'DELETE' && !UNVERSIONED_RESOURCES.has(mutation.resource ?? '')) {
            const server = extractConflictServer(err)
            const strategy = getOfflinePrefs().conflictStrategy
            if (strategy === 'server') {
              // Theirs wins: adopt the server's version locally, drop our write.
              await applyServerEntity(mutation, server, db)
              await db.mutationQueue.delete(mutation.id)
            } else if (strategy === 'mine') {
              // Mine wins: re-queue without the base token so the next pass
              // overwrites unconditionally.
              await db.mutationQueue.update(mutation.id, {
                status: 'pending', baseUpdatedAt: null, conflictServer: undefined,
                attempts: mutation.attempts + 1, lastError: null,
              })
              needsRetry = true
            } else {
              // Ask: park it as a conflict for the user to resolve.
              await db.mutationQueue.update(mutation.id, {
                status: 'conflict', conflictServer: server ?? null, conflictAt: Date.now(),
                attempts: mutation.attempts + 1, lastError: 'conflict',
              })
              holdEntity(heldEntities, mutation)
            }
            continue
          }

          const isTerminal =
            httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500 && !isRetryableStatus(httpStatus)
          if (isTerminal) {
            // Permanent client error — roll back the phantom optimistic CREATE so
            // it can't masquerade as synced, then mark failed and continue.
            await dropTempRows(mutation, db)
            await db.mutationQueue.update(mutation.id, {
              status: 'failed',
              attempts: mutation.attempts + 1,
              lastError: String(err),
            })
            holdEntity(heldEntities, mutation)
          } else if (httpStatus !== undefined && httpStatus >= 500) {
            // The server answered and failed. Retried with growing gaps, and
            // only this trip waits for it. One that never goes through is
            // parked as failed instead of holding every later write forever.
            const attempts = mutation.attempts + 1
            if (attempts >= MAX_SERVER_ERROR_ATTEMPTS) {
              await dropTempRows(mutation, db)
              await db.mutationQueue.update(mutation.id, { status: 'failed', attempts, lastError: String(err), retryAfter: undefined })
              holdEntity(heldEntities, mutation)
            } else {
              await db.mutationQueue.update(mutation.id, {
                status: 'pending',
                attempts,
                lastError: String(err),
                retryAfter: Date.now() + SERVER_ERROR_BACKOFF_MS * 2 ** (attempts - 1),
              })
              blockedTrips.add(mutation.tripId)
            }
          } else {
            // No answer at all (network) or a retryable status: reset to
            // pending and stop the flush; the next trigger retries.
            await db.mutationQueue.update(mutation.id, {
              status: 'pending',
              attempts: mutation.attempts + 1,
              lastError: String(err),
            })
            break
          }
        }
      }
    } catch (error) {
      if (session.current() && !(error instanceof QueueSessionChanged)) throw error
      return false
    } finally {
      release()
    }
    return needsRetry
  },

  /**
   * Return all pending/syncing mutations, optionally filtered by tripId.
   * Used by the UI to show per-item pending indicators.
   */
  async pending(tripId?: number): Promise<QueuedMutation[]> {
    if (tripId !== undefined) {
      return offlineDb.mutationQueue
        .where('tripId')
        .equals(tripId)
        .filter(m => m.status === 'pending' || m.status === 'syncing')
        .toArray()
    }
    return offlineDb.mutationQueue
      .where('status')
      .anyOf(['pending', 'syncing'])
      .toArray()
  },

  /** Count pending mutations (for banner badge). */
  async pendingCount(): Promise<number> {
    return offlineDb.mutationQueue
      .where('status')
      .anyOf(['pending', 'syncing'])
      .count()
  },

  /** Count permanently-failed mutations (surfaced separately so the user knows
   *  changes were dropped — they are NOT folded into pendingCount). */
  async failedCount(): Promise<number> {
    return offlineDb.mutationQueue
      .where('status')
      .equals('failed')
      .count()
  },

  /**
   * Put every parked change back in line, from a fresh start, and flush.
   * The later writes to the same entity made on this device waited behind it:
   * offline ones in the queue and, for visits, tours and the driving settings,
   * online ones too (mustQueue), so they go out after it in the order they were
   * made. A place or packing item still sends the token it was edited against,
   * so any newer version on the server, a collaborator's or one saved here
   * online, refuses it (409) and it becomes a conflict. A write without a token
   * overwrites what someone else changed on the server meanwhile, as every
   * replayed offline write of those resources does.
   */
  async retryFailed(): Promise<void> {
    if (hasReadOnlyBuild()) return
    const session = captureQueueSession()
    session.assertCurrent()
    await retryRetainedFailures(session)
    await this.flush()
  },

  /**
   * Drop every parked change. The local copy of an edit that never reached the
   * server goes with the next trip sync, which reads the server's version. The
   * later writes that waited behind a parked one are sent right away.
   */
  async discardFailed(): Promise<void> {
    const session = captureQueueSession(), db = session.db
    session.assertCurrent()
    await db.transaction('rw', db.mutationQueue, async () => {
      const failed = await db.mutationQueue.where('status').equals('failed').toArray()
      if (failed.some(isProtectedQueueWork)) throw new RetainedCommandError()
      await db.mutationQueue.where('status').equals('failed').delete()
    })
    session.assertCurrent()
    await this.flush()
  },

  /** Count unresolved sync conflicts (offline edits the server rejected as stale). */
  async conflictCount(): Promise<number> {
    return offlineDb.mutationQueue
      .where('status')
      .equals('conflict')
      .count()
  },

  /** All unresolved conflicts, newest first, optionally scoped to one trip. */
  async conflicts(tripId?: number): Promise<QueuedMutation[]> {
    const all = await offlineDb.mutationQueue.where('status').equals('conflict').toArray()
    const scoped = tripId === undefined ? all : all.filter(m => m.tripId === tripId)
    return scoped.sort((a, b) => (b.conflictAt ?? 0) - (a.conflictAt ?? 0))
  },

  /**
   * Resolve a conflict by keeping the local (offline) edit: re-queue it without
   * the base token so the next flush overwrites the server unconditionally.
   */
  async resolveKeepMine(id: string): Promise<void> {
    const session = captureQueueSession(), db = session.db
    session.assertCurrent()
    const m = await db.mutationQueue.get(id)
    if (!m) return
    if (!isSupportedMutationFormat(m)) throw new RetainedCommandError('This queue format is unsupported. Original work is preserved; automatic conflict resolution is unavailable.')
    const pause = sourceDatabaseName(db.name) ? await db.syncMeta.get(SOURCE_PAUSE_KEY) : undefined
    if (m.status !== 'conflict' && !pause?.sourcePaused?.includes(id)) return
    if ((m.recoveryHold || isUnscopedFamilyWrite(m)) && !/^\/trips\/[^/]+\/family\//.test(m.url)) throw new RetainedCommandError('This recovered native write has no checked original scope. Export it; automatic replay is unavailable.')
    await db.transaction('rw', db.mutationQueue, db.syncMeta, async () => {
    if (JSON.stringify(await db.mutationQueue.get(id)) !== JSON.stringify(m)) throw new RetainedCommandError('The original queued command changed. Reload before explicit recovery.')
    if (hasPendingCreationTerminal(await db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY)) && isRetainedCommand(m)) throw new RetainedCommandError('Resolve the original creation cancellation before retrying this command.')
    if (packingDependencyProtectedIds(await db.mutationQueue.toArray()).has(id)) throw new RetainedCommandError('Resolve the original bag dependency before retrying this command.')
    const latestPause = sourceDatabaseName(db.name) ? await db.syncMeta.get(SOURCE_PAUSE_KEY) : undefined
    if (latestPause) await db.syncMeta.put({ ...latestPause, sourcePaused: latestPause.sourcePaused?.filter(key => key !== id) })
    await db.mutationQueue.update(id, isRetainedCommand(m)
      ? { status: 'pending', retentionPolicy: 'family-original-v1', retryAfter: undefined, ...(m.recoveryHold ? { recoveryHold: { ...m.recoveryHold, released: true } } : {}) }
      : { status: 'pending', baseUpdatedAt: null, conflictServer: undefined, conflictAt: undefined, lastError: null })
    session.assertCurrent()
    })
    session.assertCurrent()
    await this.flush()
  },

  /**
   * Resolve a conflict by keeping the server's version: adopt it into the local
   * cache and drop the queued write.
   */
  async resolveKeepServer(id: string): Promise<void> {
    const session = captureQueueSession(), db = session.db
    session.assertCurrent()
    const m = await db.mutationQueue.get(id)
    if (!m) return
    if (!isSupportedMutationFormat(m)) throw new RetainedCommandError('This queue format is unsupported. Original work is preserved; automatic conflict resolution is unavailable.')
    if (m.status !== 'conflict') return
    if (isRetainedCommand(m)) throw new RetainedCommandError()
    await applyServerEntity(m, m.conflictServer, db)
    await db.mutationQueue.delete(id)
    // Later writes to the same entity waited behind the conflict.
    session.assertCurrent()
    await this.flush()
  },

  /** Reset internal flushing flag and timestamp counters — useful in tests. */
  _resetFlushing(): void {
    _flushRun = null
    _flushOwner = null
    _flushAgain = false
    _lastTs = 0
    _lastTempId = 0
  },
}

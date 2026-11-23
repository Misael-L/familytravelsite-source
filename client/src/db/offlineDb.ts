import { BaseOfflineDb } from './baseOfflineDb';
import { createTripCacheUpserts } from './createBulkUpsert';
import { createOfflineDatabaseProxy } from './offlineDatabaseProxy';
import { registerBaseOfflineSchema } from './registerBaseOfflineSchema';
import { BLOB_CACHE_MAX_BYTES, BLOB_CACHE_MAX_ENTRIES, blobCacheEvictionKeys } from './blobCachePolicy';
import { CREATION_TERMINAL_ARCHIVE_KEY, hasPendingCreationTerminal } from './creationTerminalArchive';
import { PACKING_TERMINAL_ARCHIVE_KEY, hasPendingPackingTerminal } from './packingTerminalArchive';
import { packingDependencyProtectedIds } from './packingDependencyProtection';
import { assertSourceDatabase, bindSourceDatabase, currentSourcePolicy, initializeSourceDatabase, nativeDatabaseUser, sourceBinding, sourceOwnerMarker, sourceDatabaseMiddleware, sourceDatabaseName, SOURCE_OWNER_KEY, SOURCE_PAUSE_KEY, SourceOwnershipError, type SourceDatabaseOwner } from './sourceDatabase';
import { nativeAuthSnapshotUserId } from './nativeAuthSnapshot';
import { notifyPrivateSessionEnd } from './privateSessionEvents';
import { isRetainedCommand, isProtectedQueueWork, protectsImportSources, RetainedCommandError } from './retainedCommand';
import { isSupportedMutationFormat, MUTATION_SCHEMA_VERSION } from './queueFormat';
import type { Ferrata, RoadtripPreferences, TourActivity, TourDraft, TourListItem, TourObstacleCheck, TourPackingLink, TourProvenance, TourVisit, TourWaypoint } from '@trek/shared';
import Dexie, { type Table } from 'dexie';
import type { Trip, Day, Place, PackingItem, TodoItem, BudgetItem, Reservation, TripFile, Accommodation, TripMember, Tag, Category } from '../types';

/** TripMember enriched with tripId so we can index by trip. */
export interface CachedTripMember extends TripMember {
  tripId: number;
}

/**
 * A tour as the Tours list reads it, with the trip it belongs to (the list item
 * carries none) and, once the route editor opened it online, its control
 * points, so the tour still opens offline.
 */
export interface CachedTour extends TourListItem {
  trip_id: number;
  waypoints?: TourWaypoint[];
  /** Where the tour came from, as its detail last said; kept across list refreshes, since it does not change. */
  provenance?: TourProvenance;
  /** A paddle tour's obstacle checklist as its detail last said; its revision tells whether the list's bench still matches. */
  obstacle_check?: TourObstacleCheck;
  /** ACT-01: the recorded tracks its detail last answered, kept while the list names the same ones. */
  activities?: TourActivity[];
  /** P2D-XD-01: the packing list or category the tour points at as last read, null for none; absent while never read. */
  packing_link?: TourPackingLink | null;
}

/**
 * The last settlement the server worked out for a trip, in the display currency
 * it was asked for, so the Costs balances still read offline. The server nets
 * them, so offline they stay as they were when last read.
 */
export interface CachedBudgetSettlement {
  tripId: number;
  base: string;
  settlement: unknown;
}

/**
 * One 0.05 degree tile of the via ferrata layer (see `ferrataGrid` in
 * `@trek/shared`) as last loaded for a trip: the ferratas that reach into it,
 * possibly none. Read straight from OpenStreetMap, not trip data; kept so the
 * layer draws at once and offline, and refreshed after a week.
 */
interface CachedFerrataTile {
  tripId: number;
  /** The tile's key, `<row>:<col>`. */
  tile: string;
  fetchedAt: number;
  ferratas: Ferrata[];
}

/**
 * CW-03: a station of a city walk visited or skipped on one of its days, as the
 * server last said, with the trip it belongs to so it drops with the trip. A
 * mark made offline is not written here: it waits in the queue, and every read
 * lays it over these rows (see repo/tourVisitRepo).
 */
export interface CachedTourStationVisit extends TourVisit {
  trip_id: number;
}

/**
 * The Tours planner's unsaved draft in one trip, as the account last said. A
 * draft written offline is not written here: it waits in the queue, and every
 * read lays the newest queued one over this row (see repo/tourDraftRepo).
 */
interface CachedTourDraft {
  tripId: number;
  draft: TourDraft;
}

/**
 * A road route as the router answered it, kept on the device so a trip opens
 * with its roads drawn instead of asking the router for every leg again (#2794).
 * `key` is RouteCalculator's cache key (profile, unit, waypoints, avoided
 * roads), `route` its answer as it came, `savedAt` when it came: an old answer
 * is asked again, and the oldest give way first.
 */
interface CachedRoute {
  key: string;
  route: unknown;
  savedAt: number;
}

// ── Queue + sync types ────────────────────────────────────────────────────────

// 'conflict' is terminal-until-resolved: the server rejected the replay because
// the entity changed underneath the offline edit (#1135 ask 3). It is surfaced
// to the user for a keep-mine / keep-theirs decision rather than dropped.
export type MutationStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

/**
 * The format of a queued write as this build writes and replays it. A queued
 * row outlives the bundle that wrote it: it can be replayed by the next build
 * after a deploy, or by an older one when a tab still runs the previous bundle
 * or the install is rolled back. Bump this when a row's fields or the way the
 * replay reads them change so that an older build would send it wrongly. A
 * build replays rows stamped with its own format or an older one, and leaves a
 * row stamped with a newer one in the queue untouched for a build that knows
 * it (see mutationQueue's flush). Rows queued before the stamp existed carry
 * none and read as format 1.
 */
export { MUTATION_SCHEMA_VERSION } from './queueFormat';

export interface QueuedMutation {
  /** Versioned dependency proof; only the dedicated Family coordinator may interpret it. */
  familyPackingDependency?: unknown;
  /** Sign-out pauses recovery; original request body, UUID and base token never change. */
  recoveryHold?: { reason: 'signed-out' | 'unscoped-native'; originalStatus: MutationStatus; originalSchemaVersion?: number; released?: boolean };
  /** Retain parked Family intent across cohort release; not an authorization claim. */
  retentionPolicy?: 'family-original-v1';
  /** UUID — also used as X-Idempotency-Key sent to the server */
  id: string;
  tripId: number;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body: unknown;
  createdAt: number;
  status: MutationStatus;
  attempts: number;
  lastError: string | null;
  /** Dexie table name to write the server response into after flush (e.g. 'places') */
  resource?: string;
  /** For CREATE mutations enqueued offline: the temporary negative id written to Dexie */
  tempId?: number;
  /** For DELETE mutations: the entity id to remove from Dexie on flush */
  entityId?: number;
  /**
   * For PUT/DELETE enqueued offline against a still-unsynced (negative-id) entity:
   * the temp id of the target. The url carries an `{id}` placeholder that the
   * mutation queue rewrites to the real server id once the dependent CREATE flushes.
   */
  tempEntityId?: number;
  /**
   * Optimistic-concurrency token: the entity's `updated_at` at the moment the
   * offline edit was made. Sent as `X-Base-Updated-At` on replay so the server
   * can reject the write (409) if someone else changed the entity in the
   * meantime. Absent for creates and for resources without a token.
   */
  baseUpdatedAt?: string | null;
  /**
   * Set when the replay came back 409: the server's current version of the
   * entity, kept so the conflict resolver can show "theirs" beside "mine"
   * (which is reconstructed from `body`). Only present while status==='conflict'.
   */
  conflictServer?: unknown;
  /** When the conflict was detected (for ordering / display). */
  conflictAt?: number;
  /**
   * When the row was marked 'syncing'. Only meaningful while it is — the flush
   * that set it clears the row on success or moves it off 'syncing' on failure.
   * A stamp that outlives its flush is how a killed tab is recognised on the
   * next one (see mutationQueue's STUCK_SYNCING_MS).
   */
  syncingSince?: number;
  /**
   * Not before this time (ms): set after the server answered with a 5xx, so a
   * write the server keeps failing on is retried with growing gaps rather than
   * on every trigger.
   */
  retryAfter?: number;
  /**
   * MUTATION_SCHEMA_VERSION of the build that queued the row. Optional because
   * rows queued before it existed carry none; those read as format 1.
   */
  schemaVersion?: number;
  /** The UI build that queued the row. For diagnosis only, never compared. */
  buildVersion?: string;
}

export interface SyncMeta {
  /** Lossless settled originals, never executable commands or a read cache. Unknown versions remain protected. */
  familyPackingTerminalArchive?: unknown;
  /** Creation-specific preservation journal; unknown versions stay opaque and protected. */
  familyCreationTerminalArchive?: unknown;
  sourceOwner?: SourceDatabaseOwner;
  sourcePaused?: string[];
  tripId: number;
  lastSyncedAt: number | null;
  status: 'idle' | 'syncing' | 'error';
  /** Bounding box [minLng, minLat, maxLng, maxLat] of pre-downloaded map tiles */
  tilesBbox: [number, number, number, number] | null;
  /** Non-photo files available offline for this trip after the last sync. */
  filesCachedCount: number;
  /**
   * The rounded bbox the cached area places were fetched for. Compared rather
   * than a timestamp: adding a place inside the area the trip already covers
   * should not re-download it, and moving the trip should.
   *
   * Optional so a row written before this landed still reads.
   */
  areaPlacesKey?: string;
}

export interface BlobCacheEntry {
  /** Relative URL, e.g. "/api/files/42/download" */
  url: string;
  /**
   * Trip this blob belongs to, so it is evicted together with the trip in
   * clearTripData. Legacy rows cached before v3 carry the sentinel -1.
   */
  tripId: number;
  blob: Blob;
  /** Byte size captured at insert time — Blob.size is not reliably preserved
   *  across IndexedDB round-trips, so the LRU budget reads this instead. */
  bytes: number;
  mime: string;
  cachedAt: number;
}

/**
 * A place from the TREK Places index, cached for the area of one trip.
 *
 * NOT a trip place — those are in `places` and belong to the user. These are
 * candidates: the shops, restaurants and stations that happen to be near where
 * the trip goes, taken once so search still answers on a plane. They are
 * disposable and are re-fetched whenever the trip's area changes.
 *
 * The key is the GERS id, which is stable across index rebuilds; `tripId` is
 * indexed so the whole set can be dropped with the trip.
 */
export interface CachedAreaPlace {
  /** GERS id, without the `gers:` prefix the server puts on `osm_id`. */
  gers: string;
  tripId: number;
  name: string;
  /** Lowercased, diacritics folded — what an offline search actually matches on. */
  searchName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  category: string | null;
  website: string | null;
  phone: string | null;
  cachedAt: number;
}

/** An uploaded booking-import source file, kept so the review flow can attach it to the
 *  created bookings even after a page reload during the (background) parse. Keyed by job. */
export interface ImportSourceFile {
  jobId: string;
  fileName: string;
  blob: Blob;
  createdAt: number;
}

// ── Dexie class ────────────────────────────────────────────────────────────────

/**
 * The offline DB is scoped per user so that one account can never read another
 * account's cached data on a shared device. Anonymous (logged-out) state uses
 * the base name; a logged-in user uses `trek-offline-u<userId>`.
 */
const ANON_DB_NAME = 'trek-offline';

function userDbName(userId: number | string): string {
  return `trek-offline-u${userId}`;
}

/**
 * Best-effort read of the persisted auth snapshot so the very first DB opened on
 * app load (before loadUser resolves) is already the correct per-user one — the
 * PWA can render cached data offline without leaking across users.
 */
function initialDbName(): string {
  try {
    const id = typeof localStorage !== 'undefined' ? nativeAuthSnapshotUserId(localStorage) : null;
    return id !== null ? userDbName(id) : ANON_DB_NAME;
  } catch {
    return ANON_DB_NAME;
  }
}

/**
 * Exported for the upgrade tests (tests/unit/db/offlineDb.upgrade.test.ts),
 * which open an older schema and upgrade it with this class. Every new
 * version() needs a case there; a guard in that file fails without one.
 * App code goes through `offlineDb`.
 */
const databaseCreationGuards = new Set<(name: string) => void>();
/** Creation policies also cover Dexie's implicit opens from a first read. */
export function installOfflineDatabaseCreationGuard(guard: (name: string) => void): () => void {
  databaseCreationGuards.add(guard);
  return () => { databaseCreationGuards.delete(guard); };
}

const databaseVersionGuards = new Set<(name: string) => boolean>();
/** Refuse Dexie's unversioned fallback where the adapter requires a known schema. */
export function installOfflineDatabaseVersionGuard(guard: (name: string) => boolean): () => void {
  databaseVersionGuards.add(guard);
  return () => { databaseVersionGuards.delete(guard); };
}
function guardedDatabaseFactory(factory: IDBFactory | undefined, declaredVersion: () => number) {
  if (!factory) return factory;
  return new Proxy(factory, {
    get(target, property) {
      if (property === 'open') return (name: string, version?: number) => {
        if (sourceDatabaseName(name) || [...databaseVersionGuards].some(guard => guard(name))) {
          const supported = declaredVersion();
          if (version !== undefined && version > supported)
            throw new Error('This local Trip database requires a newer application.');
          // A VersionError must remain a refusal, not become an unversioned
          // open followed by interpretation or repair of an unknown schema.
          return target.open(name, version ?? supported);
        }
        return version === undefined ? target.open(name) : target.open(name, version);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

type OfflineRows = {
  trips: Trip;
  days: Day;
  places: Place;
  packingItems: PackingItem;
  todoItems: TodoItem;
  budgetItems: BudgetItem;
  reservations: Reservation;
  tripFiles: TripFile;
  accommodations: Accommodation;
  tripMembers: CachedTripMember;
  tags: Tag;
  categories: Category;
  mutationQueue: QueuedMutation;
  syncMeta: SyncMeta;
  blobCache: BlobCacheEntry;
  importFiles: ImportSourceFile;
};

export class TrekOfflineDb extends BaseOfflineDb<OfflineRows> {
  roadtripPreferences!: Table<{ tripId: number; preferences: RoadtripPreferences; revision?: number; editable?: boolean }, number>;
  areaPlaces!: Table<CachedAreaPlace, [string, number]>;
  tours!: Table<CachedTour, number>;
  budgetSettlements!: Table<CachedBudgetSettlement, number>;
  ferrataTiles!: Table<CachedFerrataTile, [number, string]>;
  tourStationVisits!: Table<CachedTourStationVisit, [number, string]>;
  tourDrafts!: Table<CachedTourDraft, number>;
  routeCache!: Table<CachedRoute, string>;

  constructor(name: string = ANON_DB_NAME) {
    let declaredNativeVersion = 0;
    super(name, { indexedDB: guardedDatabaseFactory(Dexie.dependencies.indexedDB, () => declaredNativeVersion) });
    this.use(sourceDatabaseMiddleware(name));
    this.on('populate', (transaction) => {
      // Rejection aborts the actual creation transaction; existing databases and
      // schema upgrades never pass through populate.
      for (const guard of [...databaseCreationGuards]) guard(this.name);
      return initializeSourceDatabase(name, transaction.idbtrans);
    });

    registerBaseOfflineSchema(this);

    // v5: places from the TREK Places index for the trip's area, so search
    // answers offline. `searchName` is indexed because that is what an offline
    // query filters on; `tripId` so the set drops with its trip.
    this.version(6).stores({ roadtripPreferences: 'tripId' });
    this.version(5).stores({
      areaPlaces: 'gers, tripId, searchName',
    });

    // v7/v8: the same place near two trips is two rows now.
    //
    // Keyed on the GERS id alone, one row could only ever name one trip, and a
    // bulkPut for the second trip rewrote the first trip's rows to point at it.
    // Switching the second trip off then deleted the shared set by tripId, and
    // the first trip's areaPlacesKey still matched its bbox, so nothing ever
    // downloaded them again: a trip whose switch read "on" with no offline
    // search behind it. Dexie cannot change a primary key in place, so the
    // table is dropped and rebuilt, and every stored fingerprint is cleared so
    // the next sync refills what the drop took.
    this.version(7).stores({ areaPlaces: null });
    this.version(8).stores({
      areaPlaces: '[gers+tripId], gers, tripId, searchName',
    }).upgrade(async (tx) => {
      await tx.table('syncMeta').toCollection().modify((row: { areaPlacesKey?: string }) => {
        delete row.areaPlacesKey;
      });
    });

    // v9: the Tours facet, keyed like the place it belongs to, so a Tour still
    // reads as one offline and can be edited there.
    this.version(9).stores({ tours: 'place_id, trip_id' });

    // v10: the Costs settlement, one per trip, so the balances read offline.
    this.version(10).stores({ budgetSettlements: 'tripId' });

    // v11: the via ferrata layer's loaded tiles, per trip, so the lines draw at
    // once and offline; `tripId` so they drop with the trip.
    this.version(11).stores({ ferrataTiles: '[tripId+tile], tripId, fetchedAt' });

    // v12: the visits of the city walks, one row per station and day, so a
    // walk's stops read as checked off offline; `trip_id` so they drop with the
    // trip, `assignment_id` so one day's visits are replaced at once.
    this.version(12).stores({ tourStationVisits: '[assignment_id+station_key], trip_id, assignment_id' });

    // v13: the Tours planner's unsaved draft as the account last said it, one
    // per trip (the database is the signed-in user's own), so it opens offline.
    this.version(13).stores({ tourDrafts: 'tripId' });

    // v14: road routes the router answered, by their cache key, so a trip with its
    // whole route shown opens drawn instead of re-routing every leg (#2794). Not per
    // trip: the same waypoints are the same road in any trip; `savedAt` to prune.
    this.version(14).stores({ routeCache: 'key, savedAt' });
    declaredNativeVersion = Math.round(this.verno * 10);
  }
}

// The live instance is swapped on login/logout via reopenForUser/reopenAnonymous.
// A Proxy keeps the exported `offlineDb` binding stable for the ~19 modules that
// import it directly, while every access forwards to the current connection.
let _db = new TrekOfflineDb(initialDbName());
let _sessionEpoch = 0;
/** Invalidates old asynchronous work even when the same account returns quickly. */
export function invalidateOfflineSession(): void { _sessionEpoch++; notifyPrivateSessionEnd(); }
export function offlineSessionEpoch(): number { return _sessionEpoch; }

export const offlineDb = createOfflineDatabaseProxy(() => _db);

async function switchTo(name: string): Promise<void> {

  if (_db.name === name) {
    if (!_db.isOpen()) await _db.open();
    return;
  }
  invalidateOfflineSession();
  if (_db.isOpen()) _db.close();
  _db = new TrekOfflineDb(name);
  await _db.open();
}

/** Installing the qualified adapter detaches the early unproven legacy locator without opening or clearing it. */
export function detachOfflineDatabase(): void {
  invalidateOfflineSession();
  if (_db.isOpen()) _db.close();
  _db = new TrekOfflineDb(ANON_DB_NAME);
}
async function selectSourceDatabase(binding: import('./sourceDatabase').SourceDatabaseBinding): Promise<void> {
  bindSourceDatabase(binding);
  if (_db.name === binding.name && _db.isOpen()) {
    await _db.syncMeta.get(SOURCE_OWNER_KEY);
    assertSourceDatabase(_db.name);
    binding.selected?.();
    return;
  }
  invalidateOfflineSession();
  const previous = _db, candidate = new TrekOfflineDb(binding.name);
  try {
    await candidate.open();
    await candidate.syncMeta.get(SOURCE_OWNER_KEY);
    assertSourceDatabase(candidate.name);
    await maintainSourceOriginals(candidate, false);
    assertSourceDatabase(candidate.name);
    _db = candidate;
    binding.selected?.();
    if (previous.isOpen()) previous.close();
  } catch (error) { candidate.close(); throw error; }
}
export async function prepareSourceDatabaseRead(): Promise<void> {
  const policy = currentSourcePolicy();
  if (policy) await selectSourceDatabase(await policy.read());
}
export function isCurrentUserDatabase(user: number): boolean {
  try { assertSourceDatabase(_db.name); return nativeDatabaseUser(_db.name) === user; }
  catch { return false; }
}
export function offlineSourceOwner(): SourceDatabaseOwner | undefined {
  assertSourceDatabase(_db.name);
  return sourceBinding(_db.name)?.owner;
}

/** Point the offline DB at a specific user's scoped database (call on login). */
export async function reopenForUser(userId: number | string): Promise<void> {
  const policy = currentSourcePolicy();
  if (policy) { await selectSourceDatabase(await policy.select(userId)); return; }
  const changed = _db.name !== userDbName(userId) || !_db.isOpen();
  await switchTo(userDbName(userId));
  if (changed) await pauseRetainedWork(_db);
}

/** Point the offline DB at the anonymous database (call on logout). */
export async function reopenAnonymous(): Promise<void> {
  await switchTo(ANON_DB_NAME);
}

/** Captured maintenance cannot touch originals or grant other transactions cleanup access. */
async function maintainSourceOriginals(db: TrekOfflineDb, clearCaches: boolean): Promise<number> {
  const binding = sourceBinding(db.name);
  if (!binding || !db.isOpen()) throw new SourceOwnershipError();
  const connection = db.backendDB();
  return new Promise((resolve, reject) => {
    const tx = connection.transaction(clearCaches ? Array.from(connection.objectStoreNames) : ['syncMeta', 'mutationQueue', 'importFiles'], 'readwrite');
    let count = 0;
    tx.onabort = () => reject(new SourceOwnershipError());
    tx.onerror = () => reject(new SourceOwnershipError());
    tx.oncomplete = () => resolve(count);
    const marker = tx.objectStore('syncMeta').get(SOURCE_OWNER_KEY);
    marker.onsuccess = () => {
      if (JSON.stringify(marker.result) !== JSON.stringify(sourceOwnerMarker(binding.owner))) { tx.abort(); return; }
      const keys = tx.objectStore('mutationQueue').getAllKeys();
      keys.onsuccess = () => {
        count += keys.result.length;
        tx.objectStore('syncMeta').put({ tripId: SOURCE_PAUSE_KEY, lastSyncedAt: null, status: 'idle', tilesBbox: null, filesCachedCount: 0, sourcePaused: keys.result });
      };
      const imports = tx.objectStore('importFiles').count();
      imports.onsuccess = () => { count += imports.result; };
      if (clearCaches) {
        for (const name of Array.from(connection.objectStoreNames)) {
          if (name === 'syncMeta') tx.objectStore(name).delete(IDBKeyRange.lowerBound(0, true));
          else if (!['mutationQueue', 'importFiles'].includes(name)) tx.objectStore(name).clear();
        }
      }
    };
  });
}

/** Pause before cache cleanup, so a later purge failure cannot silently resume originals. */
async function pauseRetainedWork(db: TrekOfflineDb): Promise<number> {
  return db.transaction('rw', db.mutationQueue, db.importFiles, db.syncMeta, async () => {
    const rows = await db.mutationQueue.toArray();
    const sources = protectsImportSources() ? await db.importFiles.count() : 0;
    const archived = await db.syncMeta.get(PACKING_TERMINAL_ARCHIVE_KEY);
    const creationArchived = await db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY);
    if (!rows.some(isProtectedQueueWork) && !sources && !archived && !creationArchived) return 0;
    const dependencyIds = packingDependencyProtectedIds(rows);
    for (const row of rows.filter(row => isSupportedMutationFormat(row) && !dependencyIds.has(row.id) && !((hasPendingPackingTerminal(archived) || hasPendingCreationTerminal(creationArchived)) && isRetainedCommand(row)))) await db.mutationQueue.update(row.id, {
      status: 'conflict', retentionPolicy: 'family-original-v1',
      schemaVersion: Math.max(row.schemaVersion ?? 1, MUTATION_SCHEMA_VERSION),
      recoveryHold: { reason: row.recoveryHold?.reason ?? 'signed-out', originalStatus: row.recoveryHold?.originalStatus ?? row.status,
        originalSchemaVersion: row.recoveryHold ? row.recoveryHold.originalSchemaVersion : row.schemaVersion, released: false },
    });
    return rows.length + sources + (archived ? 1 : 0) + (creationArchived ? 1 : 0);
  });
}

/** Purge read caches on logout; unresolved Family originals/dependencies stay paused in their account DB. */
export async function deleteCurrentUserDb(): Promise<void> {
  const previous = _db;
  invalidateOfflineSession();
  if (previous.name === ANON_DB_NAME) { await switchTo(ANON_DB_NAME); return; }
  // Detach first: no cleanup error may leave the previous account as the active connection.
  _db = new TrekOfflineDb(ANON_DB_NAME);
  await _db.open();
  try {
    if (sourceDatabaseName(previous.name)) { await maintainSourceOriginals(previous, true); return; }
    const keep = await pauseRetainedWork(previous);
    await previous.transaction('rw', previous.tables, async () => {
      for (const table of previous.tables)
        if (keep && table.name === 'syncMeta') await previous.syncMeta.filter(row => row.tripId !== PACKING_TERMINAL_ARCHIVE_KEY && row.tripId !== CREATION_TERMINAL_ARCHIVE_KEY).delete();
        else if (!keep || !['mutationQueue', 'importFiles'].includes(table.name)) await table.clear();
    });
  } finally { previous.close(); }
}

// ── Bulk upsert helpers ────────────────────────────────────────────────────────

export async function upsertTrip(trip: Trip, db = offlineDb): Promise<void> {
  await db.trips.put(trip);
}

export async function upsertPlaces(places: Place[], db = offlineDb): Promise<void> {
  await db.places.bulkPut(places);
}

export const {
  upsertDays,
  upsertPackingItems,
  upsertTodoItems,
  upsertBudgetItems,
  upsertReservations,
  upsertTripFiles,
  upsertAccommodations,
} = createTripCacheUpserts<OfflineRows>(() => offlineDb);

type TripScopedTable = 'days' | 'places' | 'packingItems' | 'todoItems' | 'budgetItems' | 'reservations' | 'tripFiles' | 'accommodations';

/**
 * Make one trip's rows in `table` match the server's list: put every row it
 * sent and drop the ones it no longer has, so a place a collaborator deleted
 * while this device was offline does not come back on the next offline read.
 * Rows with a negative (temporary) id were created offline and have not
 * synced yet; they stay.
 */
export async function replaceTripRows<T extends { id: number }>(table: TripScopedTable, tripId: number, rows: T[], db = offlineDb): Promise<void> {
  const target = db[table] as unknown as Table<T, number>;
  const keep = new Set(rows.map(r => r.id));
  await db.transaction('rw', target, async () => {
    await target
      .where('trip_id')
      .equals(tripId)
      .filter(row => row.id > 0 && !keep.has(row.id))
      .delete();
    await target.bulkPut(rows);
  });
}

/** The recorded tracks a cached detail holds, while the list still names the same ones (ACT-01). */
function keptActivities(previous: CachedTour | undefined, tour: TourListItem): Pick<CachedTour, 'activities'> {
  const refs = (item: Pick<TourListItem, 'activity_tracks'>) =>
    (item.activity_tracks ?? []).map(ref => `${ref.id}:${ref.track_place_id}:${ref.assignment_id}`).join(',')
  return previous?.activities && refs(previous) === refs(tour) ? { activities: previous.activities } : {}
}

/**
 * {@link replaceTripRows} for the Tours facet, which is keyed on `place_id`.
 * A tour's cached control points survive the refresh only while its route
 * reads the same: the list carries no waypoints, and a route edited elsewhere
 * must not open offline with the old ones.
 */
export async function replaceTripTours(tripId: number, tours: TourListItem[], db = offlineDb): Promise<void> {
  await db.transaction('rw', db.tours, async () => {
    const cached = new Map((await db.tours.where('trip_id').equals(tripId).toArray()).map(t => [t.place_id, t]));
    const keep = new Set(tours.map(t => t.place_id));
    await db.tours
      .where('trip_id')
      .equals(tripId)
      .filter(t => t.place_id > 0 && !keep.has(t.place_id))
      .delete();
    await db.tours.bulkPut(tours.map(tour => {
      const previous = cached.get(tour.place_id);
      const sameRoute = previous !== undefined
        && previous.distance === tour.distance
        && previous.elevation_gain === tour.elevation_gain
        && previous.elevation_loss === tour.elevation_loss
        && previous.has_waypoints === tour.has_waypoints;
      return {
        ...tour,
        trip_id: tripId,
        ...(sameRoute && previous.waypoints ? { waypoints: previous.waypoints } : {}),
        ...(previous?.provenance ? { provenance: previous.provenance } : {}),
        ...(previous?.obstacle_check ? { obstacle_check: previous.obstacle_check } : {}),
        ...keptActivities(previous, tour),
        // The list carries no packing link (P2D-XD-01); the one last read stays.
        ...(previous?.packing_link !== undefined ? { packing_link: previous.packing_link } : {}),
      };
    }));
  });
}

export async function upsertTripMembers(tripId: number, members: TripMember[], db = offlineDb): Promise<void> {
  const rows: CachedTripMember[] = members.map(m => ({ ...m, tripId }));
  const keep = new Set(rows.map(r => r.id));
  await db.transaction('rw', db.tripMembers, async () => {
    // A member who left the trip leaves the cached list too.
    await db.tripMembers.where('tripId').equals(tripId).filter(m => !keep.has(m.id)).delete();
    await db.tripMembers.bulkPut(rows);
  });
}

export async function upsertTags(tags: Tag[], db = offlineDb): Promise<void> {
  await db.tags.bulkPut(tags);
}

export async function upsertCategories(categories: Category[], db = offlineDb): Promise<void> {
  await db.categories.bulkPut(categories);
}

export async function upsertSyncMeta(meta: SyncMeta, db = offlineDb): Promise<void> {
  await db.syncMeta.put(meta);
}

/**
 * Read a pre-downloaded file blob for offline use. Returns null when the file
 * was never cached (or on any read error). The stored MIME is reapplied so the
 * caller's inline-vs-download decision stays correct even if the persisted Blob
 * lost its type.
 */
export async function getCachedBlob(url: string): Promise<Blob | null> {
  try {
    const entry = await offlineDb.blobCache.get(url);
    if (!entry) return null;
    return entry.blob.type
      ? entry.blob
      : new Blob([entry.blob], { type: entry.mime || 'application/octet-stream' });
  } catch {
    return null;
  }
}

// ── Booking-import source files ─────────────────────────────────────────────

/** Keep one concrete connection/epoch; cancellation remains best-effort for cache callers. */
function importFilesOwner() {
  const db = _db, epoch = _sessionEpoch;
  const assertCurrent = () => { assertSourceDatabase(db.name); if (db !== _db || epoch !== _sessionEpoch) throw new Error('The original import-file session ended.'); };
  return { db, assertCurrent };
}

/** Persist originals without treating elapsed time as proof that work was abandoned. */
export async function saveImportFiles(jobId: string, files: File[]): Promise<void> {
  const { db, assertCurrent } = importFilesOwner();
  try {
    await db.transaction('rw', db.importFiles, async () => {
      assertCurrent();
      const now = Date.now();
      await db.importFiles.bulkPut(files.map(f => ({ jobId, fileName: f.name, blob: f, createdAt: now })));
      assertCurrent();
    });
  } catch { /* The original in-memory copy remains available to the initiating job. */ }
}

/** Strict review reads retain their task on cache failure; ordinary callers keep best-effort reads. */
export async function getImportFiles(jobId: string, strict = false): Promise<File[]> {
  const { db, assertCurrent } = importFilesOwner();
  try {
    assertCurrent();
    const rows = await db.importFiles.where('jobId').equals(jobId).toArray();
    assertCurrent();
    return rows.map(r => new File([r.blob], r.fileName, { type: r.blob.type || 'application/octet-stream' }));
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

/** Explicit cleanup checks retained dependencies in the same transaction as deletion. */
export async function deleteImportFiles(jobId: string): Promise<void> {
  const { db, assertCurrent } = importFilesOwner();
  try {
    await db.transaction('rw', db.mutationQueue, db.importFiles, async () => {
      assertCurrent();
      if ((await db.mutationQueue.toArray()).some(row => row.recoveryHold || isProtectedQueueWork(row))) return;
      assertCurrent();
      await db.importFiles.where('jobId').equals(jobId).delete();
      assertCurrent();
    });
  } catch { /* Preserve originals on cancellation or failed cleanup. */ }
}

// ── Blob-cache budget ───────────────────────────────────────────────────────

export { BLOB_CACHE_MAX_BYTES, BLOB_CACHE_MAX_ENTRIES };

/**
 * Evict oldest-by-cachedAt blobs until the cache is under both the entry-count
 * and byte budget. Call after inserting new blobs. LRU on insertion time, which
 * is a reasonable proxy for access for write-once document blobs.
 */
export async function enforceBlobBudget(
  maxCount = BLOB_CACHE_MAX_ENTRIES,
  maxBytes = BLOB_CACHE_MAX_BYTES,
  db = offlineDb,
): Promise<void> {
  const entries = await db.blobCache.orderBy('cachedAt').toArray();
  const toDelete = blobCacheEvictionKeys(entries, maxCount, maxBytes);
  if (toDelete.length) await db.blobCache.bulkDelete(toDelete);
}

// ── Eviction / cleanup ────────────────────────────────────────────────────────

/**
 * Delete one trip's cached READ data (eviction, per-trip opt-out, a trip the
 * server no longer lists). The offline write queue is left alone entirely: a
 * trip can be evicted for being stale, turned off in the storage settings, or
 * deleted elsewhere while it still holds unsynced offline edits (pending/syncing),
 * unresolved conflicts or parked 'failed' changes. Those must survive so the
 * user's work is not silently lost (#1135); a parked change only goes when the
 * user discards it in Settings > Offline. The replay only needs the queued REST
 * request, not the cached entities, and a successful flush re-adds the
 * canonical row. The full "Clear cache" action goes through clearAll(), which
 * refuses atomically while original Family commands remain retained.
 */
export async function clearTripData(tripId: number, db = offlineDb): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.days,
      db.places,
      db.packingItems,
      db.todoItems,
      db.budgetItems,
      db.reservations,
      db.tripFiles,
      db.accommodations,
      db.tripMembers,
      db.syncMeta,
      db.blobCache,
      db.areaPlaces,
      db.roadtripPreferences,
      db.tours,
      db.budgetSettlements,
      db.ferrataTiles,
      db.tourStationVisits,
      db.tourDrafts,
    ],
    async () => {
      await db.roadtripPreferences.delete(tripId);
      await db.tourDrafts.delete(tripId);
      await db.budgetSettlements.delete(tripId);
      await db.days.where('trip_id').equals(tripId).delete();
      await db.places.where('trip_id').equals(tripId).delete();
      await db.packingItems.where('trip_id').equals(tripId).delete();
      await db.todoItems.where('trip_id').equals(tripId).delete();
      await db.budgetItems.where('trip_id').equals(tripId).delete();
      await db.reservations.where('trip_id').equals(tripId).delete();
      await db.tripFiles.where('trip_id').equals(tripId).delete();
      await db.accommodations.where('trip_id').equals(tripId).delete();
      await db.tours.where('trip_id').equals(tripId).delete();
      await db.tourStationVisits.where('trip_id').equals(tripId).delete();
      await db.tripMembers.where('tripId').equals(tripId).delete();
      await db.syncMeta.where('tripId').equals(tripId).delete();
      await db.blobCache.where('tripId').equals(tripId).delete();
      // The cached places around this trip's area go with it. They are searched
      // across every trip, so leaving them behind kept a switched-off trip
      // answering offline searches — and nothing else ever deleted them, so they
      // accumulated for the life of the install.
      await db.areaPlaces.where('tripId').equals(tripId).delete();
      await db.ferrataTiles.where('tripId').equals(tripId).delete();
    },
  );
  // Remove the trip row itself outside the transaction since it's a separate table
  await db.trips.delete(tripId);
}

/** Clear cached rows atomically, refusing loss of original Family commands. Logout has a separate lifecycle. */
export async function clearAll(): Promise<void> {
  const db = currentOfflineDatabase();
  await db.transaction('rw', db.tables, async () => {
    if ((await db.mutationQueue.toArray()).some(row => sourceDatabaseName(db.name) || isProtectedQueueWork(row)) || ((sourceDatabaseName(db.name) || protectsImportSources()) && await db.importFiles.count() > 0))
      throw new RetainedCommandError('Original Family work or imported sources are retained. Clear cache is unavailable until they are resolved.');
    for (const table of db.tables) {
      if (table.name === 'syncMeta') await db.syncMeta.filter(row => row.tripId !== PACKING_TERMINAL_ARCHIVE_KEY && row.tripId !== CREATION_TERMINAL_ARCHIVE_KEY && (!sourceDatabaseName(db.name) || row.tripId > 0)).delete();
      else await table.clear();
    }
  });
}

/** Capture the actual connection for operations that must not follow a later account switch. */
export function currentOfflineDatabase(): TrekOfflineDb { return _db; }

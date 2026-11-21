import { z } from 'zod';
import {
  CREATION_TERMINAL_ARCHIVE_KEY as KEY,
  CREATION_TERMINAL_ARCHIVE_MAX_BYTES as MAX_BYTES,
  CREATION_TERMINAL_ARCHIVE_MAX_ROWS as MAX_ROWS,
} from '../../db/creationTerminalArchive';
import type { ImportSourceFile, QueuedMutation, SyncMeta } from '../../db/offlineDb';
import { PACKING_TERMINAL_ARCHIVE_KEY } from '../../db/packingTerminalArchive';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { encodeOriginalWork, ORIGINAL_WORK_MAX_BYTES, ORIGINAL_WORK_MAX_ROWS } from '../../sync/originalWorkArchive';
import { acquireQueueLock } from '../../sync/queueLock';
import { captureWriteSession } from '../../sync/writeSession';
import { creationAffects, matchesCreationOriginal } from './creationIntentQueue';
import { checkCreationTerminalProof, creationDigest } from './creationTerminalContract';
import { createCreationTerminalTransport } from './creationTerminalTransport';
import { dependencyIdentity, packingDependencyHash } from './packingBagDependencyContract';
import { creationPacket, type CreationPacket } from './plannerCreationContract';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

const entry = z
  .object({
    key: z.string(),
    row: z.unknown(),
    row_sha256: creationDigest,
    request_sha256: creationDigest,
    state: z.enum(['pending', 'committed', 'cancelled']),
    decided_at: z.string().datetime(),
    settled_at: z.string().datetime().nullable(),
    proof: z.unknown(),
  })
  .strict();
const archive = z
  .object({
    version: z.literal(1),
    kind: z.literal('creation-terminal-archive'),
    entries: z.array(entry).max(MAX_ROWS),
  })
  .strict();
type Entry = z.infer<typeof entry>;
type Archive = z.infer<typeof archive>;
const identity = (v: unknown) => dependencyIdentity(v, true);
const same = (a: unknown, b: unknown) => identity(a) === identity(b);
const key = (p: CreationPacket) => identity([p.source_url, p.scope, p.operation_id]);
const fail: () => never = () => {
  throw new FamilyApiError(
    409,
    'creation_terminal_changed',
    'The original, archive or recovery context changed. Nothing was removed.'
  );
};
const metaKeys = new Set([
  'tripId',
  'lastSyncedAt',
  'status',
  'tilesBbox',
  'filesCachedCount',
  'familyCreationTerminalArchive',
]);
const importSizes = (rows: ImportSourceFile[]) =>
  rows.map((r) => [r.jobId, r.fileName, r.createdAt, r.blob.size, r.blob.type]);
export type CreationTerminalDecision = {
  original: QueuedMutation;
  check: () => Promise<'unknown' | 'committed' | 'cancelled'>;
  cancel: () => Promise<'committed' | 'cancelled'>;
};

/** Client foundation only. A caller must expose an explicit decision; construction/inspection never arms it. */
export class CreationTerminalSettlement {
  private owner = captureWriteSession();
  private context;
  private ids;
  private native: number;
  private source: string;
  private layer;
  constructor(
    private repo: FamilyFrontendRepository,
    private trip: string,
    private env: { source: () => string; current: () => boolean },
    private transport = createCreationTerminalTransport()
  ) {
    this.context = repo.captureContext(trip, { revision: false });
    const ids = repo.knownViews();
    if (!ids) fail();
    this.ids = ids;
    this.native = ids.ids.register('trip', trip);
    this.source = env.source();
    this.layer = repo.getLayer(trip);
    this.active();
  }
  private active = () => {
    this.owner.assertCurrent();
    this.context.assertCurrent();
    if (
      !this.env.current() ||
      this.source !== this.env.source() ||
      this.ids !== this.repo.knownViews() ||
      this.layer !== this.repo.getLayer(this.trip)
    )
      fail();
  };
  private async fence(p: CreationPacket) {
    this.active();
    const s = await this.repo.session();
    this.active();
    if (
      p.source_url !== this.source ||
      p.scope.trip_id !== this.trip ||
      p.scope.layer !== this.layer ||
      p.scope.user_id !== s.userId ||
      p.scope.family_id !== s.familyId ||
      p.scope.person_id !== s.personId
    )
      fail();
  }
  private packet(row: unknown) {
    if (!row || typeof row !== 'object') return fail();
    const r = row as QueuedMutation,
      p = creationPacket.safeParse(r.body);
    if (!p.success || !matchesCreationOriginal(r, p.data, r.tripId) || !Number.isSafeInteger(r.createdAt))
      return fail();
    return p.data;
  }
  private async data(meta: SyncMeta | undefined): Promise<Archive> {
    if (meta === undefined) return { version: 1, kind: 'creation-terminal-archive', entries: [] };
    if (
      Object.keys(meta).some((k) => !metaKeys.has(k)) ||
      meta.tripId !== KEY ||
      meta.lastSyncedAt !== null ||
      meta.status !== 'idle' ||
      meta.tilesBbox !== null ||
      meta.filesCachedCount !== 0
    )
      fail();
    const parsed = archive.safeParse(meta.familyCreationTerminalArchive);
    if (!parsed.success || new TextEncoder().encode(identity(meta)).length > MAX_BYTES) return fail();
    const a = parsed.data;
    if (new Set(a.entries.map((e) => e.key)).size !== a.entries.length) fail();
    for (const e of a.entries) {
      const p = this.packet(e.row);
      if (e.key !== key(p) || (await packingDependencyHash(e.row, true)) !== e.row_sha256) fail();
      if (e.state === 'pending') {
        if (e.proof !== null || e.settled_at !== null) fail();
      } else {
        const proof = checkCreationTerminalProof(e.proof, p, e.request_sha256);
        if (proof.status !== e.state || e.settled_at === null) fail();
      }
    }
    return a;
  }
  private meta(a: Archive): SyncMeta {
    return {
      tripId: KEY,
      lastSyncedAt: null,
      status: 'idle',
      tilesBbox: null,
      filesCachedCount: 0,
      familyCreationTerminalArchive: a,
    };
  }
  private async snapshot() {
    const db = this.owner.db;
    const snap = await db.transaction('r', db.syncMeta, db.mutationQueue, db.importFiles, async () => ({
      rows: await db.mutationQueue.toArray(),
      meta: await db.syncMeta.get(KEY),
      packing: await db.syncMeta.get(PACKING_TERMINAL_ARCHIVE_KEY),
      imports: await db.importFiles.toArray(),
    }));
    this.active();
    const data = await this.data(snap.meta);
    this.active();
    return { ...snap, data };
  }
  private observed(
    s: Awaited<ReturnType<CreationTerminalSettlement['snapshot']>>,
    row: QueuedMutation,
    p: CreationPacket
  ) {
    const e = s.data.entries.find((e) => e.key === key(p));
    if (e && !same(e.row, row)) fail();
    const rows = s.rows.filter((r) => creationAffects(r, this.trip, this.native));
    if (rows.length === 1 && same(rows[0], row)) return e;
    // An older cooperating tab may have acknowledged a committed original. Its preserved decision still owns recovery.
    if (rows.length === 0 && e) return e;
    return fail();
  }
  private async save(
    s: Awaited<ReturnType<CreationTerminalSettlement['snapshot']>>,
    a: Archive,
    row: QueuedMutation,
    p: CreationPacket,
    options: { settled: boolean; active: () => void }
  ) {
    const { settled, active } = options;
    const meta = this.meta(a);
    if (
      a.entries.length > MAX_ROWS ||
      new TextEncoder().encode(identity(meta)).length > MAX_BYTES - (settled ? 0 : 4 * 1024 * 1024) ||
      s.rows.length + s.imports.length > ORIGINAL_WORK_MAX_ROWS
    )
      fail();
    const rows = settled ? s.rows.filter((r) => r.id !== row.id) : s.rows;
    // Both archives, all queued work and import bytes must still fit the existing preservation export.
    const graph = await encodeOriginalWork(
      {
        queue: rows.map((row) => ({ key: row.id, row })),
        imports: s.imports.map((row) => ({ key: row.jobId, row })),
        settled_originals: s.packing,
        creation_terminal_originals: meta,
      },
      active
    );
    const bytes = new TextEncoder().encode(JSON.stringify({ payload: JSON.stringify({ graph }) })).length;
    // Reserve enough headroom for the bounded1MiB proof and its graph/envelope escaping before arming.
    if (bytes > ORIGINAL_WORK_MAX_BYTES - (settled ? 4096 : 4 * 1024 * 1024)) fail();
    active();
    const db = this.owner.db;
    await db.transaction('rw', db.syncMeta, db.mutationQueue, db.importFiles, async () => {
      active();
      if (
        !same(await db.syncMeta.get(KEY), s.meta) ||
        !same(await db.syncMeta.get(PACKING_TERMINAL_ARCHIVE_KEY), s.packing) ||
        !same(await db.mutationQueue.toArray(), s.rows) ||
        !same(importSizes(await db.importFiles.toArray()), importSizes(s.imports))
      )
        fail();
      this.observed(s, row, p);
      await db.syncMeta.put(meta);
      if (settled && s.rows.some((r) => r.id === row.id)) await db.mutationQueue.delete(row.id);
      active();
    });
    active();
  }
  private async locked<R>(p: CreationPacket, visible: () => boolean, work: (active: () => void) => Promise<R>) {
    const active = () => {
      this.active();
      if (!visible()) fail();
    };
    active();
    if (isEffectivelyOffline())
      throw new FamilyApiError(
        503,
        'creation_terminal_offline',
        'Reconnect before resolving the original. Nothing was removed.'
      );
    const release = await acquireQueueLock(
      {
        ...this.owner,
        current: () => {
          try {
            active();
            return true;
          } catch {
            return false;
          }
        },
      },
      'exclusive',
      true
    );
    if (!release) return fail();
    try {
      await this.fence(p);
      active();
      return await work(active);
    } finally {
      release();
    }
  }
  /** Discovery never writes or executes. The journal owns recovery even if an older tab acknowledged the row. */
  async pending(visible = () => true): Promise<CreationTerminalDecision | null> {
    const snapshot = await this.snapshot();
    this.active();
    if (!visible()) fail();
    const entries = snapshot.data.entries.filter((e) => {
      const p = this.packet(e.row);
      return (
        e.state === 'pending' && (p.scope.trip_id === this.trip || (e.row as QueuedMutation).tripId === this.native)
      );
    });
    if (!entries.length) return null;
    if (entries.length !== 1) fail();
    const row = structuredClone(entries[0].row) as QueuedMutation;
    return this.prepare(row, visible);
  }
  async prepare(observed: QueuedMutation, visible = () => true): Promise<CreationTerminalDecision> {
    const row = structuredClone(observed),
      p = this.packet(row);
    if (row.tripId !== this.native) fail();
    await this.fence(p);
    const s = await this.snapshot();
    this.observed(s, row, p);
    this.active();
    if (!visible()) fail();
    const run = (cancel: boolean) =>
      this.locked(p, visible, async (active) => {
        let snap = await this.snapshot(),
          old = this.observed(snap, row, p);
        // Read first, never create as a check. An armed retry only ever cancels.
        await this.fence(p);
        active();
        let proof = await this.transport.read(p, old?.request_sha256);
        await this.fence(p);
        active();
        const after = await this.snapshot();
        if (!same(after.meta, snap.meta) || !same(after.rows, snap.rows)) fail();
        snap = after;
        old = this.observed(snap, row, p);
        if (!old && !cancel) return proof.status;
        if (!old) {
          const decided: Entry = {
            key: key(p),
            row: structuredClone(row),
            row_sha256: await packingDependencyHash(row, true),
            request_sha256: proof.request_sha256,
            state: 'pending',
            decided_at: new Date().toISOString(),
            settled_at: null,
            proof: null,
          };
          await this.save(snap, { ...snap.data, entries: [...snap.data.entries, decided] }, row, p, {
            settled: false,
            active,
          });
          snap = await this.snapshot();
          old = this.observed(snap, row, p);
          if (!old) fail();
        }
        if (old.state !== 'pending') return old.state;
        if (cancel && proof.status === 'unknown') {
          await this.fence(p);
          active();
          proof = await this.transport.cancel(p, old.request_sha256);
          await this.fence(p);
          active();
          const after = await this.snapshot();
          if (!same(after.meta, snap.meta) || !same(after.rows, snap.rows)) fail();
          snap = after;
        }
        if (proof.status === 'unknown') return 'unknown' as const;
        checkCreationTerminalProof(proof, p, old.request_sha256);
        const done = { ...old, state: proof.status, proof, settled_at: new Date().toISOString() };
        await this.save(
          snap,
          { ...snap.data, entries: snap.data.entries.map((e) => (e.key === old.key ? done : e)) },
          row,
          p,
          { settled: true, active }
        );
        return proof.status;
      });
    return {
      original: structuredClone(row),
      check: () => run(false),
      cancel: async () => {
        const result = await run(true);
        if (result === 'unknown')
          throw new FamilyApiError(
            503,
            'creation_terminal_unresolved',
            'Cancellation remains unresolved. Retry the same cancellation.'
          );
        return result;
      },
    };
  }
}

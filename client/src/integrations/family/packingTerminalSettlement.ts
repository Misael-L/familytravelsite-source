import { z } from 'zod';
import api from '../../api/client';
import { MUTATION_SCHEMA_VERSION, type QueuedMutation, type SyncMeta } from '../../db/offlineDb';
import {
  PACKING_TERMINAL_ARCHIVE_KEY as KEY,
  PACKING_TERMINAL_ARCHIVE_MAX_BYTES as MAX_BYTES,
  PACKING_TERMINAL_ARCHIVE_MAX_ROWS as MAX_ROWS,
} from '../../db/packingTerminalArchive';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { encodeOriginalWork } from '../../sync/originalWorkArchive';
import { acquireQueueLock } from '../../sync/queueLock';
import { captureWriteSession } from '../../sync/writeSession';
import { packingBagEnvelope } from './packingBagContract';
import { dependencyBounded, dependencyIdentity, packingDependencyHash } from './packingBagDependencyContract';
import {
  packingBagTerminalEnvelope,
  packingBagTerminalProof,
  type PackingBagTerminalEnvelope,
} from './packingBagTerminalContract';
import { createPackingBagTerminalTransport } from './packingBagTerminalTransport';
import { checkPackingBagAcknowledgement, createPackingBagTransport } from './packingBagTransport';
import { packingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import {
  checkPackingCategoryAggregateAcknowledgement,
  createPackingCategoryAggregateTransport,
} from './packingCategoryAggregateTransport';
import { packingEnvelope } from './packingCommandContract';
import { checkPackingAcknowledgement } from './packingCommandTransport';
import type { PackingScope } from './packingContract';
import { packingIdentity, packingTimestamp } from './packingContract';
import { inspectPackingDependencyPair } from './packingDependencyPair';
import {
  acknowledgePackingIntent,
  matchesPackingIntent,
  packingIntentKeys,
  packingIntentUrl,
  parkPackingRefusal,
  retainPackingIntent,
} from './packingIntentQueue';
import { packingRestoreEnvelope, packingTerminalProof, type PackingRestoreEnvelope } from './packingTerminalContract';
import { createPackingTerminalTransport } from './packingTerminalTransport';
import { createPackingTransport } from './packingTransport';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

type Reads = {
  items: ReturnType<typeof createPackingTransport>;
  bags: ReturnType<typeof createPackingBagTransport>;
  aggregates: ReturnType<typeof createPackingCategoryAggregateTransport>;
  terminal: ReturnType<typeof createPackingTerminalTransport>;
  bagTerminal: ReturnType<typeof createPackingBagTerminalTransport>;
};
type TerminalOriginal = PackingRestoreEnvelope | PackingBagTerminalEnvelope;
type Env = { bagCommands?: boolean; source: () => string; current?: () => boolean; disposed?: () => boolean };
const entrySchema = z
  .object({
    key: z.string(),
    row: z.unknown(),
    companions: z.array(z.unknown()).max(1),
    row_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    state: z.enum(['pending', 'committed', 'cancelled']),
    proof: z.unknown(),
    decided_at: packingTimestamp,
    settled_at: packingTimestamp.nullable(),
  })
  .strict()
  .refine((e) =>
    e.state === 'pending'
      ? e.proof === null && e.settled_at === null
      : e.settled_at !== null && z.union([packingTerminalProof, packingBagTerminalProof]).safeParse(e.proof).success
  );
const archiveSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('packing-terminal-archive'),
    entries: z.array(entrySchema).max(MAX_ROWS),
  })
  .strict()
  .refine((a) => new Set(a.entries.map((e) => e.key)).size === a.entries.length);
type Entry = z.infer<typeof entrySchema>;
type Archive = z.infer<typeof archiveSchema>;
const same = (a: unknown, b: unknown) => dependencyIdentity(a, true) === dependencyIdentity(b, true);
const ordered = (rows: QueuedMutation[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
function changed(): never {
  throw new FamilyApiError(
    409,
    'packing_terminal_changed',
    'The exact retained row, dependency or recovery context changed. Originals remain protected.'
  );
}
const key = (p: TerminalOriginal) =>
  dependencyIdentity([p.source_url, packingIdentity.parse(p.command.scope), p.command.operation_id]);
const archiveKeys = new Set([
  'tripId',
  'lastSyncedAt',
  'status',
  'tilesBbox',
  'filesCachedCount',
  'familyPackingTerminalArchive',
]);
export type PackingTerminalDecision = {
  original: QueuedMutation;
  check: () => Promise<'unknown' | 'committed' | 'cancelled'>;
  cancel: () => Promise<'committed' | 'cancelled'>;
};
export type PackingTerminalControls = {
  operations: Array<{ id: string; action: string }>;
  prepare: (operation: string) => Promise<PackingTerminalDecision>;
  replacement: (operation: string) => Promise<{ original: PackingRestoreEnvelope; submit: () => Promise<'committed'> }>;
};
/** Owns one explicit cancellation decision. No native controls, raw discard or automatic replacement. */
export class PackingTerminalSettlement {
  private owner = captureWriteSession();
  private context: ReturnType<FamilyFrontendRepository['captureContext']>;
  private ids: NonNullable<ReturnType<FamilyFrontendRepository['knownViews']>>;
  private native: number;
  private source: string;
  private opening = useTripStore.getState().trip?.id;
  private reads: Reads;
  constructor(
    private repo: FamilyFrontendRepository,
    private trip: string,
    private env: Env,
    reads: Partial<Reads> = {}
  ) {
    this.context = repo.captureContext(trip, { revision: false });
    const ids = repo.knownViews();
    if (!ids) changed();
    this.ids = ids;
    this.native = ids.ids.register('trip', trip);
    this.source = env.source();
    this.reads = {
      items: createPackingTransport(),
      bags: createPackingBagTransport(),
      aggregates: createPackingCategoryAggregateTransport(),
      terminal: createPackingTerminalTransport(),
      bagTerminal: createPackingBagTerminalTransport(),
      ...reads,
    };
    this.check();
  }
  private bagCommands() {
    return this.env.bagCommands === true && this.source === 'http://127.0.0.1:56041';
  }
  private originalEnvelope(value: unknown) {
    return this.bagCommands()
      ? z.union([packingRestoreEnvelope, packingBagTerminalEnvelope]).safeParse(value)
      : packingRestoreEnvelope.safeParse(value);
  }
  private lookup(p: TerminalOriginal, s: PackingScope) {
    const b = packingBagTerminalEnvelope.safeParse(p);
    return b.success && this.bagCommands()
      ? this.reads.bagTerminal.lookup(b.data, s)
      : this.reads.terminal.lookup(packingRestoreEnvelope.parse(p), s);
  }
  private cancel(p: TerminalOriginal, s: PackingScope) {
    const b = packingBagTerminalEnvelope.safeParse(p);
    return b.success && this.bagCommands()
      ? this.reads.bagTerminal.cancel(b.data, s)
      : this.reads.terminal.cancel(packingRestoreEnvelope.parse(p), s);
  }
  private check() {
    this.owner.assertCurrent();
    this.context.assertCurrent();
    if (
      this.env.current?.() === false ||
      this.env.disposed?.() ||
      this.env.source() !== this.source ||
      this.repo.knownViews() !== this.ids ||
      this.repo.getLayer(this.trip) !== 'published' ||
      useTripStore.getState().trip?.id !== this.opening ||
      (this.opening !== undefined && String(this.opening) !== String(this.native))
    )
      changed();
  }
  private async fence(p?: TerminalOriginal) {
    this.check();
    const s = await this.repo.session();
    this.check();
    if (
      p &&
      (p.source_url !== this.source ||
        p.view_layer !== 'published' ||
        p.command.scope.trip_id !== this.trip ||
        s.userId !== p.command.scope.user_id ||
        s.familyId !== p.command.scope.family_id ||
        s.personId !== p.command.scope.person_id)
    )
      changed();
    return s;
  }
  private affects = (r: QueuedMutation) =>
    !Number.isSafeInteger(r.tripId) ||
    r.tripId === 0 ||
    typeof r.url !== 'string' ||
    r.tripId === this.native ||
    [this.trip, String(this.native)].includes(r.url.match(/^\/trips\/([^/]+)(?:\/|$)/)?.[1] ?? '');
  private async rows() {
    const r = (await this.owner.db.mutationQueue.toArray()).filter(this.affects);
    this.check();
    return r;
  }
  private parseRow(row: QueuedMutation) {
    const parsed = this.originalEnvelope(row.body);
    if (!parsed.success) return changed();
    const p = parsed.data;
    const parent = Object.prototype.hasOwnProperty.call(row, 'familyPackingDependency');
    if (
      !dependencyBounded(row) ||
      !Number.isSafeInteger(row.createdAt) ||
      !Number.isSafeInteger(row.attempts) ||
      row.attempts < 0 ||
      !['pending', 'failed', 'conflict'].includes(row.status) ||
      row.tripId !== this.native ||
      (parent
        ? row.schemaVersion !== 3 ||
          Object.keys(row).some((k) => !packingIntentKeys.has(k) && k !== 'familyPackingDependency') ||
          row.retentionPolicy !== 'family-original-v1' ||
          row.method !== 'POST' ||
          row.url !== packingIntentUrl(p) ||
          row.id !== p.command.operation_id
        : !matchesPackingIntent(row, p, this.native) || row.schemaVersion !== MUTATION_SCHEMA_VERSION)
    )
      changed();
    return p;
  }
  private async archive(): Promise<{ meta: SyncMeta | undefined; data: Archive }> {
    const meta = await this.owner.db.syncMeta.get(KEY);
    this.check();
    if (!meta) return { meta, data: { version: 1, kind: 'packing-terminal-archive', entries: [] } };
    if (
      Object.keys(meta).some((k) => !archiveKeys.has(k)) ||
      meta.tripId !== KEY ||
      meta.lastSyncedAt !== null ||
      meta.status !== 'idle' ||
      meta.tilesBbox !== null ||
      meta.filesCachedCount !== 0
    )
      changed();
    const parsed = archiveSchema.safeParse(meta.familyPackingTerminalArchive);
    if (!parsed.success) return changed();
    return { meta, data: parsed.data };
  }
  private meta(data: Archive): SyncMeta {
    return {
      tripId: KEY,
      lastSyncedAt: null,
      status: 'idle',
      tilesBbox: null,
      filesCachedCount: 0,
      familyPackingTerminalArchive: data,
    };
  }
  private async scope(p: TerminalOriginal) {
    await this.fence(p);
    const now = (await this.reads.items.list(packingIdentity.parse(p.command.scope))).scope;
    await this.fence(p);
    return now;
  }
  private async locked<T>(visible: () => boolean, work: (active: () => void) => Promise<T>) {
    const active = () => {
      this.check();
      if (!visible()) changed();
    };
    active();
    if (isEffectivelyOffline())
      throw new FamilyApiError(503, 'packing_terminal_offline', 'Reconnect before deciding the original restore.');
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
    if (!release) changed();
    try {
      active();
      return await work(active);
    } finally {
      release();
    }
  }
  private async cohort(rows: QueuedMutation[], entries: Entry[], selected: QueuedMutation) {
    if (rows.length === 2) {
      await inspectPackingDependencyPair(rows, this.native);
      this.check();
      return;
    }
    if (rows.length !== 1 || !same(rows[0], selected)) changed();
    if (!Object.prototype.hasOwnProperty.call(selected, 'familyPackingDependency')) return;
    // A terminal child may be absent, but the unchanged parent descriptor still needs its exact historical child.
    const child = entries.find((e) => e.state !== 'pending' && e.companions.some((r) => same(r, selected)));
    if (!child) changed();
    const p = this.parseRow(child.row as QueuedMutation);
    if (child.key !== key(p) || child.row_sha256 !== (await packingDependencyHash(child.row, true))) changed();
    await inspectPackingDependencyPair([child.row as QueuedMutation, selected], this.native);
    const proof = await this.lookup(p, await this.scope(p));
    if (proof.status === 'unknown' || proof.status !== child.state) changed();
  }
  private async unchanged(row: QueuedMutation, companions: QueuedMutation[], allowMissing: boolean) {
    const rows = await this.rows();
    if (same(ordered(rows), ordered([row, ...companions]))) return true;
    if (allowMissing && same(ordered(rows), ordered(companions))) return false;
    return changed();
  }
  private async save(
    old: SyncMeta | undefined,
    data: Archive,
    row: QueuedMutation,
    companions: QueuedMutation[],
    active: () => void,
    remove: boolean,
    allowMissing = false
  ) {
    if (data.entries.length > MAX_ROWS) changed();
    const graph = await encodeOriginalWork({ settled_originals: this.meta(data) }, active);
    if (new Blob([JSON.stringify(graph)]).size > MAX_BYTES)
      throw new FamilyApiError(
        413,
        'packing_terminal_archive_full',
        'The original archive exceeds its bound. Nothing was removed.'
      );
    active();
    await this.owner.db.transaction('rw', this.owner.db.mutationQueue, this.owner.db.syncMeta, async () => {
      active();
      if (!same(await this.owner.db.syncMeta.get(KEY), old)) changed();
      const present = await this.unchanged(row, companions, allowMissing);
      active();
      await this.owner.db.syncMeta.put(this.meta(data));
      if (remove && present) await this.owner.db.mutationQueue.delete(row.id);
      active();
    });
    active();
  }
  async prepare(operation: string, visible = () => true): Promise<PackingTerminalDecision> {
    return this.locked(visible, async (active) => {
      const rows = await this.rows(),
        { data } = await this.archive();
      const existing = data.entries.find((e) => (e.row as QueuedMutation)?.id === operation && this.belongs(e.row));
      const saved = existing?.state === 'pending' ? existing : undefined;
      const row = structuredClone(saved ? (saved.row as QueuedMutation) : rows.find((r) => r.id === operation));
      if (!row) changed();
      const p = this.parseRow(row);
      await this.fence(p);
      if (data.entries.some((e) => e.state === 'pending' && this.belongs(e.row) && e.key !== key(p))) changed();
      const companions = saved
        ? structuredClone(saved.companions as QueuedMutation[])
        : structuredClone(rows.filter((r) => r.id !== operation));
      await this.unchanged(row, companions, !!saved);
      await this.cohort([row, ...companions], data.entries, row);
      if (saved && (saved.key !== key(p) || saved.row_sha256 !== (await packingDependencyHash(row, true)))) changed();
      active();
      const run = async (cancel: boolean) =>
        this.locked(visible, async (live) => {
          await this.fence(p);
          const before = await this.archive();
          let entry = before.data.entries.find((e) => e.key === key(p));
          await this.unchanged(row, companions, !!entry);
          if (
            entry &&
            (!same(entry.row, row) ||
              !same(entry.companions, companions) ||
              entry.row_sha256 !== (await packingDependencyHash(row, true)))
          )
            changed();
          await this.cohort([row, ...companions], before.data.entries, row);
          const current = await this.scope(p);
          live();
          if (cancel && !entry) {
            entry = {
              key: key(p),
              row: structuredClone(row),
              companions: structuredClone(companions),
              row_sha256: await packingDependencyHash(row, true),
              state: 'pending',
              proof: null,
              decided_at: new Date().toISOString(),
              settled_at: null,
            };
            await this.save(
              before.meta,
              { ...before.data, entries: [...before.data.entries, entry] },
              row,
              companions,
              live,
              false
            );
          } else {
            if (!same((await this.archive()).meta, before.meta)) changed();
            await this.unchanged(row, companions, !!entry);
          }
          live();
          const proof = cancel ? await this.cancel(p, current) : await this.lookup(p, current);
          await this.fence(p);
          live();
          if (!same(current, await this.scope(p))) changed();
          const now = await this.archive();
          const stored = now.data.entries.find((e) => e.key === key(p));
          if (entry && !same(stored, entry)) changed();
          await this.unchanged(row, companions, !!entry);
          live();
          if (proof.status === 'unknown') return 'unknown' as const;
          if (entry && entry.state !== 'pending') {
            if (entry.state !== proof.status) changed();
            return proof.status;
          }
          const terminal: Entry = {
            key: key(p),
            row: structuredClone(row),
            companions: structuredClone(companions),
            row_sha256: await packingDependencyHash(row, true),
            state: proof.status,
            proof: structuredClone(proof),
            decided_at: entry?.decided_at ?? new Date().toISOString(),
            settled_at: new Date().toISOString(),
          };
          await this.save(
            now.meta,
            { ...now.data, entries: [...now.data.entries.filter((e) => e.key !== key(p)), terminal] },
            row,
            companions,
            live,
            true,
            !!entry
          );
          return proof.status;
        });
      return {
        get original() {
          return structuredClone(row);
        },
        check: () => run(false),
        cancel: async () => {
          const r = await run(true);
          if (r === 'unknown') return changed();
          return r;
        },
      };
    });
  }
  private belongs(row: unknown) {
    const p = this.originalEnvelope((row as QueuedMutation)?.body);
    return p.success && p.data.source_url === this.source && p.data.command.scope.trip_id === this.trip;
  }
  controls(rows: QueuedMutation[], visible = () => true): PackingTerminalControls {
    return {
      operations: rows
        .filter((r) => this.originalEnvelope(r.body).success)
        .map((r) => ({ id: r.id, action: this.parseRow(r).command.action })),
      prepare: (id) => this.prepare(id, visible),
      replacement: (id) => this.prepareReplacement(id, visible),
    };
  }
  /** Only a durably armed cancellation resumes as cancellation after restart. Ordinary unknown restores keep their old semantics. */
  async pending(visible = () => true) {
    await this.fence();
    const { data } = await this.archive(),
      rows = await this.rows();
    const entry = data.entries.find((e) => e.state === 'pending' && this.belongs(e.row));
    const orphan = rows.length === 1 && Object.prototype.hasOwnProperty.call(rows[0], 'familyPackingDependency');
    if (!entry && !orphan) return null;
    const row = entry ? (entry.row as QueuedMutation) : rows[0],
      p = this.parseRow(row);
    await this.fence(p);
    const decision = await this.prepare(row.id, visible);
    return {
      domain: 'packing' as const,
      intent: entry
        ? packingRestoreEnvelope.safeParse(p).success
          ? ('cancel-restore' as const)
          : ('cancel-command' as const)
        : undefined,
      name: entry ? 'Finish the original saved-change cancellation' : 'Retained parent restore; its child is terminal',
      action: entry && packingRestoreEnvelope.safeParse(p).success ? 'cancel-restore' : p.command.action,
      check: decision.check,
      retry: entry ? decision.cancel : decision.check,
      terminal: this.controls(rows, visible),
    };
  }
  private async fresh(p: PackingRestoreEnvelope): Promise<PackingRestoreEnvelope> {
    const identity = packingIdentity.parse(p.command.scope),
      c = p.command;
    if (c.action === 'bag-restore') {
      const o = await this.reads.bags.observation(identity, c.target_id!, true);
      if (o.bag.deleted_at === null) changed();
      return packingRestoreEnvelope.parse({
        ...p,
        command: {
          ...c,
          operation_id: crypto.randomUUID(),
          scope: o.scope,
          expected_revision: o.bag.revision,
          expected_collection_revision: o.collection_revision,
          observed: o,
        },
      });
    }
    if (c.action === 'category-restore-batch') {
      const o = await this.reads.aggregates.observation(identity, c.target_id!, true);
      if (o.category.deleted_at === null || o.batch === null) changed();
      return packingRestoreEnvelope.parse({
        ...p,
        command: {
          ...c,
          operation_id: crypto.randomUUID(),
          scope: o.scope,
          expected_collection_revision: o.collection_revision,
          observed: o,
        },
      });
    }
    let before = null;
    for (let n = 0; n < 20; n++) {
      const page = await this.reads.items.trash(identity, 100, before);
      await this.fence(p);
      const r = page.items.find((i) => i.id === c.target_id);
      if (r)
        return packingRestoreEnvelope.parse({
          ...p,
          command: { ...c, operation_id: crypto.randomUUID(), scope: page.scope, expected_revision: r.revision },
        });
      if (!page.next_cursor) break;
      before = page.next_cursor;
    }
    return changed();
  }
  private replacementOffsetInvalid(offset: number) {
    return !this.bagCommands() || !Number.isSafeInteger(offset) || offset < 0 || offset > MAX_ROWS;
  }
  private aggregateReplacementNeeded(o: Awaited<ReturnType<Reads['aggregates']['observation']>>) {
    return o.category.deleted_at !== null && o.batch !== null;
  }
  private replacementScanStep(
    page: Pick<Awaited<ReturnType<Reads['items']['trash']>>, 'next_cursor'>,
    n: number
  ): { stop: true } | { stop: false; before: typeof page.next_cursor } {
    if (!page.next_cursor) return { stop: true };
    const before = page.next_cursor;
    if (n === 19) changed();
    return { stop: false, before };
  }
  private replacementNextOffset(offset: number, entries: Entry[]) {
    return offset + 20 < entries.length ? offset + 20 : null;
  }
  async replacements(visible = () => true, offset = 0) {
    return this.locked(visible, async (active) => {
      if (this.replacementOffsetInvalid(offset)) changed();
      if ((await this.rows()).length) return { items: [], next_offset: null };
      const { data } = await this.archive();
      const entries = data.entries.filter(
        (e) =>
          e.state === 'cancelled' &&
          this.belongs(e.row) &&
          packingRestoreEnvelope.safeParse((e.row as QueuedMutation).body).success
      );
      const items: Array<{ id: string; action: string }> = [];
      for (const e of entries.slice(offset, offset + 20)) {
        const p = packingRestoreEnvelope.parse(this.parseRow(e.row as QueuedMutation));
        await this.fence(p);
        if (e.key !== key(p) || e.row_sha256 !== (await packingDependencyHash(e.row, true))) changed();
        const proof = await this.reads.terminal.lookup(p, await this.scope(p));
        active();
        if (proof.status !== 'cancelled') changed();
        let needed = false;
        if (p.command.action === 'bag-restore')
          needed =
            (await this.reads.bags.observation(p.command.scope, p.command.target_id!, true)).bag.deleted_at !== null;
        else if (p.command.action === 'category-restore-batch') {
          let before = null;
          for (let n = 0; n < 20; n++) {
            const page = await this.reads.aggregates.batches(p.command.scope, 100, before);
            await this.fence(p);
            const target = page.categories.find((row) => row.category.id === p.command.target_id);
            if (target) {
              if (target.batch !== null) {
                const o = await this.reads.aggregates.observation(p.command.scope, p.command.target_id!, true);
                needed = this.aggregateReplacementNeeded(o);
              }
              break;
            }
            const step = this.replacementScanStep(page, n);
            if (step.stop === true) break;
            before = step.before;
          }
        } else {
          const live = await this.reads.items.list(p.command.scope);
          if (live.items.some((i) => i.id === p.command.target_id)) {
            active();
            continue;
          }
          let before = null;
          for (let n = 0; n < 20; n++) {
            const page = await this.reads.items.trash(p.command.scope, 100, before);
            await this.fence(p);
            if (page.items.some((i) => i.id === p.command.target_id)) {
              needed = true;
              break;
            }
            const step = this.replacementScanStep(page, n);
            if (step.stop === true) break;
            before = step.before;
          }
        }
        active();
        if (needed) items.push({ id: (e.row as QueuedMutation).id, action: p.command.action });
      }
      await this.fence();
      active();
      if (!same((await this.archive()).data, data) || (await this.rows()).length) changed();
      return { items, next_offset: this.replacementNextOffset(offset, entries) };
    });
  }
  async prepareReplacement(operation: string, visible = () => true) {
    return this.locked(visible, async (active) => {
      if (String(this.opening) !== String(this.native) || (await this.rows()).length) changed();
      const { data } = await this.archive(),
        entry = data.entries.find(
          (e) => (e.row as QueuedMutation)?.id === operation && e.state !== 'pending' && this.belongs(e.row)
        );
      if (!entry || data.entries.some((e) => e.state === 'pending' && this.belongs(e.row))) changed();
      const parsed = packingRestoreEnvelope.safeParse(this.parseRow(entry.row as QueuedMutation));
      if (!parsed.success) changed();
      const old = parsed.data;
      await this.fence(old);
      if (entry.key !== key(old) || entry.row_sha256 !== (await packingDependencyHash(entry.row, true))) changed();
      const proof = await this.reads.terminal.lookup(old, await this.scope(old));
      if (proof.status === 'unknown' || proof.status !== entry.state) changed();
      const packet = await this.fresh(old);
      await this.fence(packet);
      active();
      if (
        packet.command.operation_id === operation ||
        data.entries.some((e) => (e.row as QueuedMutation)?.id === packet.command.operation_id)
      )
        changed();
      const submit = async (): Promise<'committed'> =>
        this.locked(visible, async (live) => {
          await this.fence(packet);
          if ((await this.rows()).length) changed();
          const now = await this.archive();
          if (!same(now.data, data)) changed();
          const observed = await this.fresh(old);
          live();
          if (
            !same({ ...observed, command: { ...observed.command, operation_id: packet.command.operation_id } }, packet)
          )
            changed();
          const row = await retainPackingIntent(this.owner, packet, this.native);
          const current = await this.owner.db.mutationQueue.get(row.id);
          if (!current || !same(current, row)) changed();
          live();
          try {
            const result = (
              await api.post(packingIntentUrl(packet), structuredClone(packet), {
                headers: { 'X-Idempotency-Key': packet.command.operation_id },
              })
            ).data;
            const b = packingBagEnvelope.safeParse(packet),
              a = packingCategoryAggregateEnvelope.safeParse(packet);
            if (b.success) checkPackingBagAcknowledgement(result, b.data);
            else if (a.success) checkPackingCategoryAggregateAcknowledgement(result, a.data);
            else checkPackingAcknowledgement(result, packingEnvelope.parse(packet).command);
            await this.fence(packet);
            live();
            await acknowledgePackingIntent(this.owner, packet, this.native, row);
            live();
            return 'committed' as const;
          } catch (error) {
            live();
            await parkPackingRefusal(this.owner, packet, this.native, error, row);
            throw error;
          }
        });
      return {
        get original() {
          return structuredClone(packet);
        },
        submit,
      };
    });
  }
}

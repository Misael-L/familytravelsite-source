import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import type { QueuedMutation } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { captureWriteSession } from '../../sync/writeSession';
import { creationAffects } from './creationIntentQueue';
import { sameOriginalStayRow, type OriginalStayOwner } from './originalStayIntentQueue';
import { createOriginalStayReadGuard, type PlannerReadGuard } from './plannerReadGuard';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { createStayCommandFence } from './stayCommandFence';
import { stayIdentity, type StayIdentity, type stayScope } from './stayContract';
type Scope = ReturnType<typeof stayScope.parse>;
export type OriginalStayPacket = { source_url: string; command: { operation_id: string; scope: Scope } };
export type OriginalStayAck = { trip_revision_after: number };
export type OriginalStayResult<V> = { status: 'committed'; current: V } | { status: 'unknown' | 'cancelled' | 'none' };
export type OriginalStayEnvironment = {
  source: () => string;
  disposed: () => boolean;
  beforeRetain?: () => Promise<void>;
};
export type OriginalStayPreparedRefresh = {
  publish: () => void;
  complete: () => void;
  discard: () => Promise<void>;
};
export type OriginalStayProtocol<P, A, V> = {
  parse: (raw: unknown) => P;
  transport: {
    execute: (p: P) => Promise<A>;
    outcome: (
      p: P,
      scope: Scope,
      cancel?: boolean
    ) => Promise<{ status: 'unknown' | 'committed' | 'cancelled'; acknowledgement?: A | null }>;
  };
  queue: {
    inspect: (o: OriginalStayOwner, p: P, n: number) => Promise<QueuedMutation | undefined>;
    retain: (o: OriginalStayOwner, p: P, n: number) => Promise<void>;
    acknowledge: (o: OriginalStayOwner, p: P, n: number, e?: QueuedMutation) => Promise<void>;
    park: (
      o: OriginalStayOwner,
      p: P,
      n: number,
      error: unknown,
      e?: QueuedMutation
    ) => Promise<QueuedMutation | undefined>;
  };
  checkCurrent: (raw: unknown, expected: StayIdentity) => V;
  revision: (v: V) => number;
  changed: () => FamilyApiError;
  queued: () => FamilyApiError;
  outcomeOffline: () => FamilyApiError;
  requireRefresh?: boolean;
  confirmCurrent?: (current: V, guard: PlannerReadGuard) => Promise<void>;
  prepareCurrent?: (current: V, guard: PlannerReadGuard) => Promise<OriginalStayPreparedRefresh>;
};
/** Shared ownership mechanics; codecs, receipts, current reads and activation remain protocol-specific. */
export class OriginalStayCommandSession<P extends OriginalStayPacket, A extends OriginalStayAck, V> {
  private packet: P;
  private owner = captureWriteSession();
  private context: ReturnType<FamilyFrontendRepository['captureContext']>;
  private ids;
  private native: number;
  private expected: QueuedMutation | undefined;
  private retained = false;
  private finished = false;
  private ack: A | null = null;
  private flight: { kind: string; promise: Promise<OriginalStayResult<V>> } | null = null;
  private readCurrent: (trip: number | string) => Promise<unknown>;
  private transport: OriginalStayProtocol<P, A, V>['transport'];
  private readonly fence: ReturnType<typeof createStayCommandFence>;
  private openingTrip = useTripStore.getState().trip?.id;
  constructor(
    private repo: FamilyFrontendRepository,
    private environment: OriginalStayEnvironment,
    original: P,
    private protocol: OriginalStayProtocol<P, A, V>,
    options: {
      auth?: typeof stayAuthIdentity;
      readCurrent: (trip: number | string) => Promise<unknown>;
      expected?: QueuedMutation;
      cold?: boolean;
    }
  ) {
    this.transport = protocol.transport;
    this.packet = protocol.parse(original);
    this.context = repo.captureContext(this.packet.command.scope.trip_id, { revision: false });
    const ids = repo.knownViews()?.ids;
    if (!ids) throw this.changed();
    this.ids = ids;
    this.native = ids.register('trip', this.packet.command.scope.trip_id);
    this.readCurrent = options.readCurrent;
    this.expected = options.expected ? structuredClone(options.expected) : undefined;
    this.retained = options.expected !== undefined;
    this.cold = options.cold === true;
    this.fence = createStayCommandFence(
      this.packet.command.scope,
      repo,
      options.auth ?? stayAuthIdentity,
      () => this.check(),
      () => this.changed()
    );
    this.check();
  }
  private cold: boolean;
  private changed() {
    return this.protocol.changed();
  }
  private check() {
    this.owner.assertCurrent();
    this.context.assertCurrent();
    if (
      this.environment.disposed() ||
      this.environment.source() !== this.packet.source_url ||
      this.ids !== this.repo.knownViews()?.ids ||
      this.repo.getLayer(this.packet.command.scope.trip_id) !== 'published' ||
      (this.cold
        ? useTripStore.getState().trip?.id !== this.openingTrip
        : String(useTripStore.getState().trip?.id) !== String(this.native))
    )
      throw this.changed();
  }
  private async exact() {
    this.check();
    const row = await this.protocol.queue.inspect(this.owner, this.packet, this.native);
    this.check();
    if (!row || row.status === 'syncing' || (this.expected && !sameOriginalStayRow(row, this.expected)))
      throw this.changed();
    this.expected = row;
    return row;
  }
  private async noOtherWork() {
    const rows = await this.owner.db.mutationQueue.toArray();
    this.check();
    const trip = this.packet.command.scope.trip_id;
    if (rows.some((row) => row.id !== this.packet.command.operation_id && creationAffects(row, trip, this.native)))
      throw this.changed();
    if (await this.owner.db.importFiles.count()) throw this.changed();
    this.check();
  }
  private async finishRead(): Promise<OriginalStayResult<V>> {
    if (!this.ack) throw this.changed();
    await this.fence();
    if (!this.finished) await this.exact();
    await this.noOtherWork();
    const trip = this.packet.command.scope.trip_id;
    this.repo.invalidate(trip);
    await this.fence();
    const revision = this.repo.captureContext(trip),
      before = useTripStore.getState();
    const raw = await this.readCurrent(this.native);
    await this.fence();
    revision.assertCurrent();
    const current = this.protocol.checkCurrent(raw, stayIdentity.parse(this.packet.command.scope));
    if (this.protocol.revision(current) < this.ack.trip_revision_after || useTripStore.getState() !== before)
      throw this.changed();
    await this.noOtherWork();
    return this.refreshAndAcknowledge(current, trip);
  }
  private async refreshAndAcknowledge(current: V, trip: string): Promise<OriginalStayResult<V>> {
    let prepared: OriginalStayPreparedRefresh | undefined;
    let lease: Awaited<ReturnType<typeof createOriginalStayReadGuard>> | undefined;
    try {
      if (this.protocol.requireRefresh) {
        if (!this.protocol.confirmCurrent && !this.protocol.prepareCurrent)
          throw new FamilyApiError(
            503,
            'native_stay_refresh_required',
            'Commit confirmed; the complete planner refresh is still required. The original command is retained.'
          );
        const expected = this.finished ? undefined : await this.exact();
        lease = await createOriginalStayReadGuard(
          this.owner,
          { uuid: trip, native: this.native, blockImports: true },
          expected,
          () => this.changed()
        );
        if (this.protocol.prepareCurrent) {
          if (this.cold && this.openingTrip !== undefined && this.openingTrip !== this.native) throw this.changed();
          prepared = await this.protocol.prepareCurrent(current, lease.guard);
        } else if (this.protocol.confirmCurrent) await this.protocol.confirmCurrent(current, lease.guard);
        await this.refreshFence(lease.guard);
        if (prepared) {
          const publication = prepared;
          await lease.guard.commit(() => {
            this.check();
            const result: unknown = publication.publish();
            if (result !== undefined) throw this.changed(); // This handoff must be synchronous.
            if (this.cold) {
              if (useTripStore.getState().trip?.id !== this.native) throw this.changed();
              this.openingTrip = this.native; // Only the just-validated, synchronous original publication may seat the Trip.
            }
            this.check();
          });
          await this.refreshFence(lease.guard);
        }
      }
      if (!this.finished) {
        const expected = await this.exact();
        await this.protocol.queue.acknowledge(this.owner, this.packet, this.native, expected);
        this.finished = true;
      }
      this.check();
      prepared?.complete(); // Retire the old failure only after exact acknowledgement and the final session fence.
      return { status: 'committed', current };
    } catch (error) {
      await prepared?.discard();
      throw error;
    } finally {
      lease?.close();
    }
  }
  private async refreshFence(guard: PlannerReadGuard) {
    await this.fence();
    if (!this.finished) await this.exact();
    await this.noOtherWork();
    await guard.check();
  }

  private run(kind: string, work: () => Promise<OriginalStayResult<V>>): Promise<OriginalStayResult<V>> {
    if (this.flight) {
      if (this.flight.kind !== kind) return Promise.reject(this.changed());
      return this.flight.promise;
    }
    const promise = Promise.resolve().then(work),
      slot = { kind, promise };
    this.flight = slot;
    const clear = () => {
      if (this.flight === slot) this.flight = null;
    };
    // Observe both settlements only to release the slot; the returned original promise retains its rejection.
    void promise.then(clear, clear);
    return promise;
  }
  private async executeOriginal(expected: QueuedMutation) {
    try {
      this.ack = await this.transport.execute(this.packet);
      await this.fence(true);
      await this.exact();
    } catch (error) {
      await this.fence(true);
      await this.exact();
      const parked = await this.protocol.queue.park(this.owner, this.packet, this.native, error, expected);
      if (parked) this.expected = parked;
      throw error;
    }
  }
  submit(): Promise<OriginalStayResult<V>> {
    return this.run('submit', async () => {
      await this.fence(true);
      const release = await acquireQueueLock(this.owner, 'exclusive', true);
      try {
        await this.fence(true);
        if (this.finished) return this.ack ? await this.finishRead() : { status: 'cancelled' };
        if (!this.retained) {
          await this.environment.beforeRetain?.();
          await this.fence(true);
          await this.noOtherWork();
          await this.protocol.queue.retain(this.owner, this.packet, this.native);
          this.retained = true;
        }
        const expected = await this.exact();
        await this.fence(true);
        if (!release || isEffectivelyOffline()) throw this.protocol.queued();
        if (!this.ack) {
          const scope = await this.fence(true),
            outcome = await this.transport.outcome(this.packet, scope);
          await this.fence(true);
          await this.exact();
          if (outcome.status === 'cancelled') {
            await this.protocol.queue.acknowledge(this.owner, this.packet, this.native, expected);
            this.finished = true;
            return { status: 'cancelled' };
          }
          if (outcome.status === 'committed') this.ack = outcome.acknowledgement ?? null;
          else {
            await this.executeOriginal(expected);
          }
        }
        return await this.finishRead();
      } finally {
        release?.();
      }
    });
  }
  reconcile(cancel = false): Promise<OriginalStayResult<V>> {
    return this.run(cancel ? 'cancel' : 'inspect', async () => {
      await this.fence();
      if (isEffectivelyOffline()) throw this.protocol.outcomeOffline();
      const release = await acquireQueueLock(this.owner, 'exclusive', true);
      if (!release) throw this.changed();
      try {
        await this.fence();
        if (this.finished) return this.ack ? await this.finishRead() : { status: 'cancelled' };
        const row = await this.protocol.queue.inspect(this.owner, this.packet, this.native);
        this.check();
        if (!row) {
          if (this.retained) throw this.changed();
          return { status: 'none' };
        }
        this.retained = true;
        await this.exact();
        if (!this.ack) {
          const scope = await this.fence(),
            out = await this.transport.outcome(this.packet, scope, cancel);
          await this.fence();
          const expected = await this.exact();
          if (out.status === 'unknown') return { status: 'unknown' };
          if (out.status === 'cancelled') {
            await this.protocol.queue.acknowledge(this.owner, this.packet, this.native, expected);
            this.finished = true;
            return { status: 'cancelled' };
          }
          this.ack = out.acknowledgement ?? null;
        }
        return await this.finishRead();
      } finally {
        release();
      }
    });
  }
}

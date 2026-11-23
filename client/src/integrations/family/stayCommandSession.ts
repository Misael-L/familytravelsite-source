import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import api from '../../api/client';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { captureWriteSession } from '../../sync/writeSession';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { createStayCommandFence } from './stayCommandFence';
import type { StayAck, StayEnvelope } from './stayContract';
import {
  acknowledgeStayIntent,
  inspectStayIntent,
  parkStayRefusal,
  retainStayIntent,
  stayIntentUrl,
} from './stayIntentQueue';
import { checkStayAck, createStayTransport, originalStay } from './stayTransport';
/** Retains exactly one observed operation. Fresh login can inspect/cancel it, never rebind/retry it. */
export class StayCommandSession {
  private packet: StayEnvelope;
  private owner = captureWriteSession();
  private context: ReturnType<FamilyFrontendRepository['captureContext']>;
  private ids;
  private native: number;
  private readonly fence: ReturnType<typeof createStayCommandFence>;
  private flight: Promise<StayAck> | null = null;
  constructor(
    private repo: FamilyFrontendRepository,
    private environment: { source: () => string; disposed: () => boolean; beforeRetain?: () => Promise<void> },
    original: StayEnvelope,
    private reads = createStayTransport(),
    auth = stayAuthIdentity
  ) {
    this.packet = originalStay(original);
    this.context = repo.captureContext(this.packet.command.scope.trip_id, { revision: false });
    const ids = repo.knownViews()?.ids;
    if (!ids) throw this.changed();
    this.ids = ids;
    this.native = ids.register('trip', this.packet.command.scope.trip_id);
    this.fence = createStayCommandFence(
      this.packet.command.scope,
      repo,
      auth,
      () => this.check(),
      () => this.changed()
    );
    this.check();
  }
  private changed() {
    return new FamilyApiError(
      409,
      'stay_session_changed',
      'The original stay context ended. Retained work was not rebound.'
    );
  }
  private check() {
    this.owner.assertCurrent();
    this.context.assertCurrent();
    if (
      this.environment.disposed() ||
      this.environment.source() !== this.packet.source_url ||
      this.ids !== this.repo.knownViews()?.ids ||
      this.repo.getLayer(this.packet.command.scope.trip_id) !== 'published' ||
      String(useTripStore.getState().trip?.id) !== String(this.native)
    )
      throw this.changed();
  }
  async submit(): Promise<StayAck> {
    if (this.flight !== null) return this.flight;
    const run = async () => {
      await this.fence(true);
      const release = await acquireQueueLock(this.owner, 'exclusive', true);
      try {
        await this.fence(true);
        await this.environment.beforeRetain?.();
        await this.fence(true);
        await retainStayIntent(this.owner, this.packet, this.native);
        await this.fence(true);
        if (!release || isEffectivelyOffline())
          throw new FamilyApiError(503, 'stay_queued', 'The original stay save is retained; reconnect to confirm it.');
        const expected = await inspectStayIntent(this.owner, this.packet, this.native);
        await this.fence(true);
        if (!expected) throw this.changed();
        try {
          const r = await api.post(stayIntentUrl(this.packet), structuredClone(this.packet), {
            headers: { 'X-Idempotency-Key': this.packet.command.operation_id },
          });
          const ack = checkStayAck(r.data, this.packet);
          await this.fence(true);
          await acknowledgeStayIntent(this.owner, this.packet, this.native, expected);
          this.check();
          return ack;
        } catch (e) {
          await this.fence(true);
          await parkStayRefusal(this.owner, this.packet, this.native, e, expected);
          throw e;
        }
      } finally {
        release?.();
      }
    };
    this.flight = run();
    try {
      return await this.flight;
    } finally {
      this.flight = null;
    }
  }
  async reconcile(cancel = false): Promise<'none' | 'committed' | 'cancelled' | 'unknown'> {
    await this.fence();
    if (isEffectivelyOffline())
      throw new FamilyApiError(503, 'stay_outcome_offline', 'Reconnect to inspect the original stay outcome.');
    const release = await acquireQueueLock(this.owner, 'exclusive', true);
    if (!release) throw new FamilyApiError(409, 'stay_queue_busy', 'Another tab owns stay recovery.');
    try {
      await this.fence();
      const expected = await inspectStayIntent(this.owner, this.packet, this.native);
      if (!expected) return 'none';
      const scope = await this.fence();
      const out = await this.reads.outcome(this.packet, scope, cancel);
      await this.fence();
      if (out.status === 'unknown') return 'unknown';
      await acknowledgeStayIntent(this.owner, this.packet, this.native, expected);
      this.check();
      return out.status;
    } finally {
      release();
    }
  }
}

import api from '../../api/client';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { PackingCommandContext, type PackingCommandEnvironment } from './packingCommandContext';
import {
  acknowledgePackingIntent,
  inspectPackingIntent,
  packingIntentUrl,
  parkPackingRefusal,
  retainPackingIntent,
  type RetainedPackingEnvelope,
} from './packingIntentQueue';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

export type { PackingCommandEnvironment } from './packingCommandContext';
export type PackingEditorEnvironment = PackingCommandEnvironment & { current?: () => boolean };

type RetainedPackingProtocol<Packet, Ack> = {
  parse(original: Packet): Packet;
  checkAcknowledgement(value: unknown, original: Packet): Ack;
  reads: { receipt(original: Packet): Promise<{ status: 'unknown' | 'committed'; result?: unknown }> };
};

/** Executes and settles one immutable, already observed packing intent. */
export class RetainedPackingCommandSession<
  Packet extends RetainedPackingEnvelope,
  Ack,
> extends PackingCommandContext<Packet> {
  private flight: Promise<Ack> | null = null;
  constructor(
    repo: FamilyFrontendRepository,
    environment: PackingCommandEnvironment,
    original: Packet,
    private protocol: RetainedPackingProtocol<Packet, Ack>,
    editorCurrent?: () => boolean | undefined
  ) {
    super(repo, environment, original, (packet) => protocol.parse(packet), editorCurrent);
  }
  async submit() {
    if (this.flight !== null) return this.flight;
    const run = async () => {
      await this.fence();
      const release = await acquireQueueLock(this.owner, 'exclusive', true);
      try {
        await this.fence();
        const retained = await retainPackingIntent(this.owner, this.packet, this.native);
        this.check();
        if (!release || isEffectivelyOffline())
          throw new FamilyApiError(503, 'packing_queued', 'Packing save retained locally; reconnect to confirm it.');
        try {
          const response = await api.post(packingIntentUrl(this.packet), structuredClone(this.packet), {
            headers: { 'X-Idempotency-Key': this.packet.command.operation_id },
          });
          const ack = this.protocol.checkAcknowledgement(response.data, this.packet);
          await this.fence();
          await acknowledgePackingIntent(this.owner, this.packet, this.native, retained);
          this.check();
          return ack;
        } catch (error) {
          this.check();
          await parkPackingRefusal(this.owner, this.packet, this.native, error, retained);
          throw error;
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
  async reconcile(): Promise<'committed' | 'unknown' | 'none'> {
    await this.fence();
    if (isEffectivelyOffline())
      throw new FamilyApiError(503, 'packing_receipt_offline', 'Reconnect to inspect the original packing receipt.');
    const release = await acquireQueueLock(this.owner, 'exclusive', true);
    if (!release) throw new FamilyApiError(409, 'packing_queue_busy', 'Another tab owns queue reconciliation.');
    try {
      await this.fence();
      const retained = await inspectPackingIntent(this.owner, this.packet, this.native);
      if (!retained) return 'none';
      this.check();
      const receipt = await this.protocol.reads.receipt(this.packet);
      await this.fence();
      if (receipt.status === 'unknown') return 'unknown';
      if (receipt.result) this.protocol.checkAcknowledgement(receipt.result, this.packet);
      // The authenticated receipt endpoint binds the original actor/Trip/operation even when its item is redacted.
      await acknowledgePackingIntent(this.owner, this.packet, this.native, retained);
      this.check();
      return 'committed';
    } finally {
      release();
    }
  }
}

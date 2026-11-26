import api from '../../api/client';
import type { QueuedMutation } from '../../db/offlineDb';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { assertCoreHttpsPlannerPackingRequest } from './coreHttpsPlannerPackingBoundary';
import { assertCoreHttpsTaskRequest } from './coreHttpsTaskBoundary';
import { creationAffects, creationJson, type CreationOwner } from './creationIntentQueue';
import type { CreationPacket } from './plannerCreationContract';
import { capturePlannerSessionContext, type PlannerSessionEnvironment } from './plannerSessionContext';
import type { PlannerTaskRecovery, RetainedTask } from './plannerTaskRecovery';
import type { FamilyApiError, FamilyFrontendRepository } from './repository';

type OriginalPacket = Pick<CreationPacket, 'source_url' | 'operation_id'>;
type OriginalScope = Pick<CreationPacket['scope'], 'trip_id' | 'family_id' | 'user_id' | 'person_id' | 'layer'>;

export type PlannerOriginalEnvironment = PlannerSessionEnvironment;
export type PlannerOriginalOptions = { row?: QueuedMutation; retry: boolean; visible?: () => boolean };

type OriginalReceipt<Result> =
  | { status: 'unknown'; request_sha256: string; result: null }
  | { status: 'committed'; request_sha256: string; result: Result };

type OriginalReply = { version?: unknown; operation?: unknown } | null | undefined;
type CheckRow<Packet> = (owner: CreationOwner, packet: Packet, native: number, row: QueuedMutation) => Promise<void>;

type PlannerOriginalProtocol<Packet, Result> = {
  url: (packet: Packet) => string;
  retain: (owner: CreationOwner, packet: Packet, native: number) => Promise<QueuedMutation>;
  assertOriginal: CheckRow<Packet>;
  receipt: (packet: Packet) => Promise<OriginalReceipt<Result>>;
  acknowledgement: (reply: OriginalReply, packet: Packet) => Result;
  acknowledge: CheckRow<Packet>;
  parkRefusal: (
    owner: CreationOwner,
    packet: Packet,
    native: number,
    row: QueuedMutation,
    error: unknown
  ) => Promise<void>;
  offline: () => FamilyApiError;
  invalidAcknowledgement: () => FamilyApiError;
  unconfirmedAcknowledgement: () => FamilyApiError;
};

export function createPlannerOriginalSession<Packet extends OriginalPacket>(
  repo: FamilyFrontendRepository,
  trip: string,
  environment: PlannerOriginalEnvironment,
  scope: (packet: Packet) => OriginalScope,
  changed: () => FamilyApiError
) {
  const { owner, native, source, layer, check, checkSession } = capturePlannerSessionContext(
    repo,
    trip,
    environment,
    changed
  );
  const fence = (p?: Packet) =>
    checkSession((s) => {
      if (p) {
        const o = scope(p);
        if (
          p.source_url !== source ||
          o.trip_id !== trip ||
          o.family_id !== s.familyId ||
          o.user_id !== s.userId ||
          o.person_id !== s.personId ||
          o.layer !== layer
        )
          throw changed();
      }
    });
  return { owner, native, check, changed, fence };
}

type PlannerOriginalInspection<Packet> = {
  readOriginal: (row: QueuedMutation, native: number) => Packet | null;
  scope: (packet: Packet) => OriginalScope;
  retainedTask: (packet: Packet, row: QueuedMutation, visible: () => boolean) => RetainedTask;
};

export function createPlannerOriginalRecovery<Packet extends OriginalPacket>(
  session: ReturnType<typeof createPlannerOriginalSession<Packet>>,
  trip: string,
  inspection: PlannerOriginalInspection<Packet>
): Pick<PlannerTaskRecovery, 'inspect'> {
  return {
    async inspect(visible = () => true) {
      const active = await session.fence();
      const native = session.native;
      if (native === undefined) return null;
      const rows = (await session.owner.db.mutationQueue.toArray()).filter((row) => creationAffects(row, trip, native));
      session.check();
      if (!visible()) throw session.changed();
      if (rows.length !== 1) return null;
      const row = structuredClone(rows[0]);
      const original = inspection.readOriginal(row, native);
      if (original === null) return null;
      const packet = structuredClone(original);
      const scope = inspection.scope(packet);
      if (scope.user_id !== active.userId || scope.family_id !== active.familyId || scope.person_id !== active.personId)
        return null;
      await session.fence(packet);
      if (!visible()) throw session.changed();
      return inspection.retainedTask(packet, row, visible);
    },
  };
}

/** Settles one original under the same queue lock used to send it. */
export async function runPlannerOriginal<Packet extends OriginalPacket, Result>(
  session: ReturnType<typeof createPlannerOriginalSession<Packet>>,
  p: Packet,
  options: PlannerOriginalOptions,
  protocol: PlannerOriginalProtocol<Packet, Result>
): Promise<Result | null> {
  const { owner, native, fence, changed } = session;
  const active = () => {
    owner.assertCurrent();
    if (options.visible && !options.visible()) throw changed();
  };
  const activeOwner = {
    ...owner,
    assertCurrent: active,
    current: () => owner.current() && (!options.visible || options.visible()),
  };
  active();
  if (native === undefined) throw changed();
  if (isEffectivelyOffline()) throw protocol.offline();
  const url = protocol.url(p);
  if (options.retry) {
    assertCoreHttpsTaskRequest({ method: 'POST', pathname: url });
    assertCoreHttpsPlannerPackingRequest({ method: 'POST', pathname: url });
  }
  const release = await acquireQueueLock(activeOwner, 'exclusive', true);
  if (!release) throw changed();
  try {
    await fence(p);
    active();
    const row = options.row ?? (await protocol.retain(activeOwner, p, native));
    await protocol.assertOriginal(activeOwner, p, native, row);
    let receipt = await protocol.receipt(p);
    await fence(p);
    await protocol.assertOriginal(activeOwner, p, native, row);
    active();
    if (receipt.status === 'unknown' && !options.retry) return null;
    if (receipt.status === 'unknown') {
      const originalDigest = receipt.request_sha256;
      try {
        const reply = await api.post(url, p, { headers: { 'X-Idempotency-Key': p.operation_id } });
        if (reply.data?.version !== 1) throw protocol.invalidAcknowledgement();
        const ack = protocol.acknowledgement(reply.data, p);
        await fence(p);
        await protocol.assertOriginal(activeOwner, p, native, row);
        active();
        receipt = await protocol.receipt(p);
        await fence(p);
        await protocol.assertOriginal(activeOwner, p, native, row);
        active();
        if (
          receipt.status !== 'committed' ||
          receipt.request_sha256 !== originalDigest ||
          creationJson(receipt.result) !== creationJson(ack)
        )
          throw protocol.unconfirmedAcknowledgement();
      } catch (error) {
        await fence(p);
        active();
        await protocol.parkRefusal(activeOwner, p, native, row, error);
        throw error;
      }
    }
    if (receipt.status !== 'committed') return null;
    await fence(p);
    active();
    await protocol.acknowledge(activeOwner, p, native, row);
    return receipt.result;
  } finally {
    release();
  }
}

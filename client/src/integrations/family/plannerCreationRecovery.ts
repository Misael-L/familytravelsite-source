import api from '../../api/client';
import type { QueuedMutation } from '../../db/offlineDb';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import {
  acknowledgeCreationIntent,
  assertCreationOriginal,
  creationAffects,
  creationIntentUrl,
  matchesCreationOriginal,
  parkCreationRefusal,
  type CreationOwner,
} from './creationIntentQueue';
import { checkCreationAcknowledgement, readCreationReceipt } from './creationReceiptTransport';
import { createCreationTerminalRecovery, creationName } from './creationRecoveryTerminal';
import { creationPacket, type CreationPacket } from './plannerCreationContract';
import { capturePlannerSessionContext } from './plannerSessionContext';
import type { PlannerTaskRecovery, RetainedTask } from './plannerTaskRecovery';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
async function runRetainedCreation(
  retry: boolean,
  p: CreationPacket,
  native: number,
  row: QueuedMutation,
  environment: { owner: CreationOwner; fence: (p: CreationPacket) => Promise<unknown>; visible: () => boolean }
): Promise<'unknown' | 'committed'> {
  const { owner, fence, visible } = environment;
  const active = () => {
      owner.assertCurrent();
      if (!visible())
        throw new FamilyApiError(
          409,
          'creation_recovery_changed',
          'The original recovery context changed. Nothing was removed.'
        );
    },
    activeOwner = { ...owner, assertCurrent: active, current: () => owner.current() && visible() };
  active();
  if (isEffectivelyOffline())
    throw new FamilyApiError(503, 'creation_recovery_offline', 'Reconnect to check the original place save.');
  const release = await acquireQueueLock(activeOwner, 'exclusive', true);
  if (!release)
    throw new FamilyApiError(
      409,
      'creation_recovery_changed',
      'The original recovery context changed. Nothing was removed.'
    );
  try {
    await fence(p);
    active();
    await assertCreationOriginal(activeOwner, p, native, row);
    let receipt = await readCreationReceipt(p);
    await fence(p);
    active();
    await assertCreationOriginal(activeOwner, p, native, row);
    if (receipt.status === 'unknown' && !retry) return 'unknown' as const;
    if (receipt.status === 'unknown') {
      try {
        const reply = await api.post(creationIntentUrl(p), p, {
          headers: { 'X-Idempotency-Key': p.operation_id },
        });
        checkCreationAcknowledgement(reply.data, p);
        await fence(p);
        active();
        await assertCreationOriginal(activeOwner, p, native, row);
        receipt = await readCreationReceipt(p);
        await fence(p);
        active();
        await assertCreationOriginal(activeOwner, p, native, row);
      } catch (error) {
        await fence(p);
        active();
        await parkCreationRefusal(activeOwner, p, native, row, error);
        throw error;
      }
    }
    if (receipt.status === 'unknown') return 'unknown' as const;
    await acknowledgeCreationIntent(activeOwner, p, native, row);
    return 'committed' as const;
  } finally {
    release();
  }
}
/** Cold-start recovery does not publish a stale planner snapshot or execute a check. */
export function createPlannerCreationRecovery(
  repo: FamilyFrontendRepository,
  trip: string,
  environment: { source: () => string; current: () => boolean }
): Pick<PlannerTaskRecovery, 'inspect'> {
  const changed = () =>
    new FamilyApiError(409, 'creation_recovery_changed', 'The original recovery context changed. Nothing was removed.');
  const { owner, native, source, layer, check, checkSession } = capturePlannerSessionContext(
    repo,
    trip,
    environment,
    changed
  );
  const fence = (p?: CreationPacket) =>
    checkSession((s) => {
      if (
        p &&
        (p.source_url !== source ||
          p.scope.layer !== layer ||
          p.scope.trip_id !== trip ||
          p.scope.user_id !== s.userId ||
          p.scope.family_id !== s.familyId ||
          p.scope.person_id !== s.personId)
      )
        throw changed();
    });
  const terminal = createCreationTerminalRecovery(repo, trip, {
    owner,
    source: environment.source,
    current: owner.current,
  });
  return {
    async inspect(visible = () => true) {
      const s = await fence();
      if (native === undefined) return null;
      const pending = await terminal.pending(visible);
      if (pending) return pending;
      const rows = (await owner.db.mutationQueue.toArray()).filter((r) => creationAffects(r, trip, native));
      check();
      if (!visible()) throw changed();
      if (rows.length !== 1 || native === undefined) return null;
      const row = structuredClone(rows[0]),
        parsed = creationPacket.safeParse(row.body);
      if (!parsed.success || !matchesCreationOriginal(row, parsed.data, native)) return null;
      const p = structuredClone(row.body) as CreationPacket;
      if (
        p.source_url !== source ||
        p.scope.layer !== layer ||
        p.scope.trip_id !== trip ||
        p.scope.user_id !== s.userId ||
        p.scope.family_id !== s.familyId ||
        p.scope.person_id !== s.personId
      )
        return null;
      const run = (retry: boolean) => runRetainedCreation(retry, p, native, row, { owner, fence, visible });
      return {
        domain: 'planner',
        name: creationName(p),
        action: 'create',
        ...terminal.controls(row, visible),
        check: () => run(false),
        retry: () => run(true),
      } satisfies RetainedTask;
    },
  };
}

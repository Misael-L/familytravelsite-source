import { CREATION_TERMINAL_ARCHIVE_KEY, hasPendingCreationTerminal } from '../../db/creationTerminalArchive';
import type { QueuedMutation } from '../../db/offlineDb';
import { coreHttpsPlannerPackingProfileEnabled } from './coreHttpsPlannerPackingProfile';
import type { CreationOwner } from './creationIntentQueue';
import { CreationTerminalSettlement } from './creationTerminalSettlement';
import type { CreationPacket } from './plannerCreationContract';
import type { RetainedTask } from './plannerTaskRecovery';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

export const creationName = (p: CreationPacket) =>
  'create' in p.form.location ? (p.form.location.create.label ?? 'Original place creation') : 'Original visit';
/** Only the existing isolated source may expose these new commands; durable discovery itself never executes. */
export function createCreationTerminalRecovery(
  repo: FamilyFrontendRepository,
  trip: string,
  env: {
    owner: CreationOwner;
    source: () => string;
    current: () => boolean;
  }
) {
  let settlement: CreationTerminalSettlement | undefined;
  const terminal = () => (settlement ??= new CreationTerminalSettlement(repo, trip, env));
  const enabled = () => coreHttpsPlannerPackingProfileEnabled();
  const unsupported = async (): Promise<'committed' | 'cancelled'> => {
    throw new FamilyApiError(
      501,
      'creation_terminal_profile',
      'Original cancellation recovery needs its qualified source. Export remains available; nothing was removed.'
    );
  };
  const active = () => {
    env.owner.assertCurrent();
    if (!env.current())
      throw new FamilyApiError(
        409,
        'creation_recovery_changed',
        'The original recovery context changed. Nothing was removed.'
      );
  };
  return {
    async pending(visible: () => boolean): Promise<RetainedTask | null> {
      active();
      const meta = await env.owner.db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY);
      active();
      if (!visible())
        throw new FamilyApiError(
          409,
          'creation_recovery_changed',
          'The original recovery context changed. Nothing was removed.'
        );
      if (!hasPendingCreationTerminal(meta, trip)) return null;
      if (!enabled())
        return {
          domain: 'planner',
          intent: 'cancel-command',
          name: 'Original planner cancellation',
          action: 'create',
          check: unsupported,
          retry: unsupported,
        };
      const decision = await terminal().pending(() => visible() && enabled());
      active();
      if (!decision) return null;
      return {
        domain: 'planner',
        intent: 'cancel-command',
        name: creationName(decision.original.body as CreationPacket),
        action: 'create',
        check: decision.check,
        retry: decision.cancel,
      };
    },
    controls(row: QueuedMutation, visible: () => boolean): Pick<RetainedTask, 'creation'> {
      if (!enabled()) return {};
      return {
        creation: { operation_id: row.id, prepare: () => terminal().prepare(row, () => visible() && enabled()) },
      };
    },
  };
}

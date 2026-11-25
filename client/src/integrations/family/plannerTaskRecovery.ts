import api from '../../api/client';
import { MUTATION_SCHEMA_VERSION, type QueuedMutation } from '../../db/offlineDb';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { prepareRetainedWorkExport } from '../../sync/retainedRecovery';
import { downloadBlob } from '../../utils/fileDownload';
import type { CreationOwner } from './creationIntentQueue';
import type { CreationTerminalDecision } from './creationTerminalSettlement';
import type { PackingBagDependency } from './packingBagDependency';
import type { PackingTerminalControls } from './packingTerminalSettlement';
import { locationRpc } from './planLocations';
import {
  belongsToPlannerRecoverySession,
  capturePlannerRecoveryChecks,
  capturePlannerSessionContext,
} from './plannerSessionContext';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { taskEnvelope, type TaskEnvelope } from './taskCommandHandler';
import { acknowledgeTaskIntent, parkTaskRefusal, taskIntentUrl, taskJson } from './taskIntentQueue';
import { checkTaskAcknowledgement, createTaskTransport, type TaskRpc } from './taskTransport';

export type RetainedTask = {
  domain?: 'task' | 'packing' | 'stay' | 'planner';
  intent?: 'cancel-restore' | 'cancel-command';
  terminal?: PackingTerminalControls;
  creation?: { operation_id: string; prepare: () => Promise<CreationTerminalDecision> };
  parents?: {
    list: () => ReturnType<PackingBagDependency['candidates']>;
    prepare: (id: string) => ReturnType<PackingBagDependency['prepare']>;
  };
  name: string;
  action: string;
  check: () => Promise<'committed' | 'unknown' | 'cancelled'>;
  retry: () => Promise<'committed' | 'unknown' | 'cancelled'>;
};
export type PackingReplacementPage = { items: Array<{ id: string; action: string }>; next_offset: number | null };
export type PlannerTaskRecovery = {
  replacements?: (visible?: () => boolean, offset?: number) => Promise<PackingReplacementPage>;
  replacement?: (id: string, visible?: () => boolean) => ReturnType<PackingTerminalControls['replacement']>;

  inspect: (visible?: () => boolean) => Promise<RetainedTask | null>;
  export: (visible?: () => boolean) => Promise<void>;
};
const supportedKeys = new Set([
  'id',
  'tripId',
  'method',
  'url',
  'body',
  'retentionPolicy',
  'status',
  'attempts',
  'lastError',
  'schemaVersion',
  'buildVersion',
  'createdAt',
  'retryAfter',
  'syncingSince',
]);
/** Startup recovery never requires (or publishes) an otherwise blocked planner snapshot. */
export function createPlannerTaskRecovery(
  repo: FamilyFrontendRepository,
  trip: string,
  environment: { source: () => string; current: () => boolean },
  rpc: TaskRpc = locationRpc
): PlannerTaskRecovery {
  const sessionContext = capturePlannerSessionContext(
    repo,
    trip,
    environment,
    () =>
      new FamilyApiError(
        409,
        'task_recovery_changed',
        'The original recovery context changed. Nothing was removed; reopen this Trip before retrying.'
      )
  );
  const { owner, check, changed, source, layer, native } = sessionContext;
  const transport = createTaskTransport(rpc);
  const { fence, affects, original } = capturePlannerRecoveryChecks(sessionContext, trip, taskJson);

  return {
    async inspect(visible = () => true) {
      const session = await fence(),
        rows = (await owner.db.mutationQueue.toArray()).filter(affects);
      check();
      if (!visible()) throw changed();
      if (rows.length !== 1) return null;
      const row = rows[0],
        result = taskEnvelope.safeParse(row.body);
      if (
        !result.success ||
        row.schemaVersion !== MUTATION_SCHEMA_VERSION ||
        row.retentionPolicy !== 'family-original-v1' ||
        row.method !== 'POST' ||
        row.tripId !== native ||
        row.id !== result.data.command.operation_id ||
        row.url !== taskIntentUrl(result.data) ||
        row.status === 'syncing' ||
        !['pending', 'failed', 'conflict'].includes(row.status) ||
        Object.keys(row).some((key) => !supportedKeys.has(key)) ||
        !belongsToPlannerRecoverySession(result.data, trip, source, layer, session)
      )
        return null;
      const packet = structuredClone(result.data),
        saved = structuredClone(row);
      return {
        name: 'name' in packet.command.values ? (packet.command.values.name ?? '') : '',
        action: packet.command.action,
        check: () =>
          runOriginalTask({ owner, check, changed, fence, original, transport }, saved, packet, false, visible),
        retry: () =>
          runOriginalTask({ owner, check, changed, fence, original, transport }, saved, packet, true, visible),
      };
    },
    async export(visible = () => true) {
      check();
      if (!visible()) throw changed();
      const result = await prepareRetainedWorkExport();
      result.assertCurrent();
      check();
      if (!visible()) throw changed();
      downloadBlob(result.blob, result.filename);
    },
  };
}

async function runOriginalTask(
  context: {
    owner: CreationOwner;
    check: () => void;
    changed: () => FamilyApiError;
    fence: (packet?: TaskEnvelope) => Promise<import('./repository').FamilySession>;
    original: (row: QueuedMutation) => Promise<void>;
    transport: ReturnType<typeof createTaskTransport>;
  },
  row: QueuedMutation,
  packet: TaskEnvelope,
  retry: boolean,
  visible: () => boolean
): Promise<'committed' | 'unknown'> {
  const { owner, check, changed, fence, original, transport } = context;

  const active = () => {
    check();
    if (!visible()) throw changed();
  };
  const activeOwner = { ...owner, assertCurrent: active, current: () => owner.current() && visible() };
  active();
  if (isEffectivelyOffline())
    throw new FamilyApiError(503, 'task_recovery_offline', 'Reconnect to confirm the original task save.');
  const release = await acquireQueueLock(activeOwner, 'exclusive', true);
  if (!release) throw changed();
  try {
    await fence(packet);
    await original(row);
    active();
    // This RPC checks current membership, assurance and direct task authority, even for old receipts.
    const receipt = await transport.receipt(packet.command.scope, row.id);
    await fence(packet);
    await original(row);
    active();
    if (receipt.status === 'unknown' && !retry) return 'unknown' as const;
    try {
      const ack =
        receipt.result ??
        (
          await api.post(taskIntentUrl(packet), packet, {
            headers: { 'X-Idempotency-Key': packet.command.operation_id },
          })
        ).data;
      checkTaskAcknowledgement(ack, packet.command);
    } catch (error) {
      active();
      await original(row);
      active();
      await parkTaskRefusal(activeOwner, packet, error);
      throw error;
    }
    await fence(packet);
    await original(row);
    active();
    await acknowledgeTaskIntent(activeOwner, packet, row);
    return 'committed' as const; // The caller must obtain a fresh canonical planner read separately.
  } finally {
    release();
  }
}

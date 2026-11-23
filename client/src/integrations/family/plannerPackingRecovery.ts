import { packingReadRpc } from '@family/backend/supabase/packingReadRpc';
import api from '../../api/client';
import { MUTATION_SCHEMA_VERSION, type QueuedMutation } from '../../db/offlineDb';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { prepareRetainedWorkExport } from '../../sync/retainedRecovery';
import { downloadBlob } from '../../utils/fileDownload';
import type { CreationOwner } from './creationIntentQueue';
import { packingBagEnvelope } from './packingBagContract';
import { PackingBagDependency } from './packingBagDependency';
import { packingBagTerminalEnvelope } from './packingBagTerminalContract';
import { checkPackingBagAcknowledgement, createPackingBagTransport, type PackingBagRpc } from './packingBagTransport';
import { packingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import {
  checkPackingCategoryAggregateAcknowledgement,
  createPackingCategoryAggregateTransport,
  type PackingCategoryAggregateRpc,
} from './packingCategoryAggregateTransport';
import { packingCategoryEnvelope } from './packingCategoryContract';
import {
  checkPackingCategoryAcknowledgement,
  createPackingCategoryTransport,
  type PackingCategoryRpc,
} from './packingCategoryTransport';
import { packingCategoryV2Envelope } from './packingCategoryV2Contract';
import {
  checkPackingCategoryV2Acknowledgement,
  createPackingCategoryV2Transport,
  type PackingCategoryV2Rpc,
} from './packingCategoryV2Transport';
import { packingJson } from './packingCommandContract';
import { checkPackingAcknowledgement } from './packingCommandTransport';
import { packingGroupEnvelope } from './packingGroupContract';
import {
  checkPackingGroupAcknowledgement,
  createPackingGroupTransport,
  type PackingGroupRpc,
} from './packingGroupTransport';
import {
  acknowledgePackingIntent,
  packingIntentKeys,
  packingIntentUrl,
  parkPackingRefusal,
  retainedPackingEnvelope,
  type RetainedPackingEnvelope,
} from './packingIntentQueue';
import { packingRestoreEnvelope } from './packingTerminalContract';
import { PackingTerminalSettlement } from './packingTerminalSettlement';
import { createPackingTransport, type PackingRpc } from './packingTransport';
import {
  belongsToPlannerRecoverySession,
  capturePlannerRecoveryChecks,
  capturePlannerSessionContext,
} from './plannerSessionContext';
import type { PlannerTaskRecovery } from './plannerTaskRecovery';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

/** Startup recovery never requires (or publishes) an otherwise blocked planner snapshot. */
function capturePackingRecovery(
  repo: FamilyFrontendRepository,
  trip: string,
  environment: { bagCommands?: boolean; source: () => string; current: () => boolean },
  rpc: PackingRpc = packingReadRpc,
  related?:
    | PackingGroupRpc
    | {
        groupRpc?: PackingGroupRpc;
        categoryRpc?: PackingCategoryRpc;
        categoryV2Rpc?: PackingCategoryV2Rpc;
        categoryAggregateRpc?: PackingCategoryAggregateRpc;
        bagRpc?: PackingBagRpc;
      }
) {
  const sessionContext = capturePlannerSessionContext(
    repo,
    trip,
    environment,
    () =>
      new FamilyApiError(
        409,
        'packing_recovery_changed',
        'The original recovery context changed. Nothing was removed; reopen this Trip before retrying.'
      )
  );
  const { owner, check, changed, source, layer, native } = sessionContext;
  const transport = createPackingTransport(rpc),
    groupTransport = createPackingGroupTransport(typeof related === 'function' ? related : related?.groupRpc),
    categoryTransport = createPackingCategoryTransport(
      typeof related === 'function' ? undefined : related?.categoryRpc
    );
  const bagTransport = createPackingBagTransport(typeof related === 'function' ? undefined : related?.bagRpc);
  const aggregateTransport = createPackingCategoryAggregateTransport(
    typeof related === 'function' ? undefined : related?.categoryAggregateRpc
  );
  const categoryV2Transport = createPackingCategoryV2Transport(
    typeof related === 'function' ? undefined : related?.categoryV2Rpc
  );
  const { fence, affects, original } = capturePlannerRecoveryChecks(sessionContext, trip, packingJson);

  return {
    owner,
    check,
    changed,
    fence,
    affects,
    original,
    transport,
    groupTransport,
    categoryTransport,
    categoryV2Transport,
    aggregateTransport,
    bagTransport,
    native,
    source,
    layer,
  };
}

function originalPackingRowMatches(
  row: QueuedMutation,
  result: ReturnType<typeof retainedPackingEnvelope.safeParse>,
  native: number | undefined
): result is Extract<ReturnType<typeof retainedPackingEnvelope.safeParse>, { success: true }> {
  return !(
    !result.success ||
    row.schemaVersion !== MUTATION_SCHEMA_VERSION ||
    row.retentionPolicy !== 'family-original-v1' ||
    row.method !== 'POST' ||
    row.tripId !== native ||
    row.id !== result.data.command.operation_id ||
    row.url !== packingIntentUrl(result.data) ||
    row.status === 'syncing' ||
    !['pending', 'failed', 'conflict'].includes(row.status) ||
    Object.keys(row).some((key) => !packingIntentKeys.has(key))
  );
}

function originalPackingActions(run: (retry: boolean) => ReturnType<typeof runOriginalPacking>) {
  return { check: () => run(false), retry: () => run(true) };
}

function originalPackingParents(create: () => PackingBagDependency, visible: () => boolean) {
  return {
    parents: { list: () => create().candidates(visible), prepare: (id: string) => create().prepare(id, visible) },
  };
}

export function createPlannerPackingRecovery(
  repo: FamilyFrontendRepository,
  trip: string,
  environment: { bagCommands?: boolean; source: () => string; current: () => boolean },
  rpc: PackingRpc = packingReadRpc,
  related?: Parameters<typeof capturePackingRecovery>[4]
): PlannerTaskRecovery {
  const context = capturePackingRecovery(repo, trip, environment, rpc, related),
    {
      owner,
      check,
      changed,
      fence,
      affects,
      original,
      transport,
      groupTransport,
      categoryTransport,
      categoryV2Transport,
      aggregateTransport,
      bagTransport,
      native,
      source,
      layer,
    } = context;

  return {
    ...(environment.bagCommands && environment.source() === 'http://127.0.0.1:56041'
      ? {
          replacements: (visible = () => true, offset = 0) =>
            new PackingTerminalSettlement(repo, trip, environment).replacements(visible, offset),
        }
      : {}),
    replacement: (id: string, visible = () => true) =>
      new PackingTerminalSettlement(repo, trip, environment).prepareReplacement(id, visible),
    async inspect(visible = () => true) {
      const settlement = new PackingTerminalSettlement(repo, trip, environment);
      const terminal = await settlement.pending(visible);
      if (terminal) return terminal;
      const session = await fence(),
        rows = (await owner.db.mutationQueue.toArray()).filter(affects);
      check();
      if (!visible()) throw changed();
      if (rows.length === 2) {
        const pending = await new PackingBagDependency(repo, trip, environment, {
          bags: bagTransport,
          items: transport,
          aggregates: aggregateTransport,
        }).pending(visible);
        return pending ? { ...pending, terminal: settlement.controls(rows, visible) } : pending;
      }
      if (rows.length !== 1) return null;
      const row = rows[0],
        result = retainedPackingEnvelope.safeParse(row.body);
      if (
        !originalPackingRowMatches(row, result, native) ||
        !belongsToPlannerRecoverySession(result.data, trip, source, layer, session)
      )
        return null;
      const packet = structuredClone(result.data),
        saved = structuredClone(row);
      return {
        domain: 'packing',
        name: 'name' in packet.command.values ? (packet.command.values.name ?? '') : '',
        action: packet.command.action,
        ...(packingRestoreEnvelope.safeParse(packet).success ||
        (environment.bagCommands &&
          environment.source() === 'http://127.0.0.1:56041' &&
          packingBagTerminalEnvelope.safeParse(packet).success)
          ? { terminal: settlement.controls(rows, visible) }
          : {}),
        ...((packet.version === 1 && packet.command.action === 'restore') ||
        (packet.version === 3 && packet.command.action === 'category-restore-batch')
          ? originalPackingParents(
              () =>
                new PackingBagDependency(repo, trip, environment, {
                  bags: bagTransport,
                  items: transport,
                  aggregates: aggregateTransport,
                }),
              visible
            )
          : {}),
        ...originalPackingActions((retry) =>
          runOriginalPacking(
            {
              owner,
              check,
              changed,
              fence,
              original,
              transport,
              groupTransport,
              categoryTransport,
              categoryV2Transport,
              aggregateTransport,
              bagTransport,
              native,
            },
            saved,
            packet,
            retry,
            visible
          )
        ),
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

async function runOriginalPacking(
  context: {
    owner: CreationOwner;
    check: () => void;
    changed: () => FamilyApiError;
    fence: (packet?: RetainedPackingEnvelope) => Promise<import('./repository').FamilySession>;
    original: (row: QueuedMutation) => Promise<void>;
    transport: ReturnType<typeof createPackingTransport>;
    groupTransport: ReturnType<typeof createPackingGroupTransport>;
    categoryTransport: ReturnType<typeof createPackingCategoryTransport>;
    categoryV2Transport: ReturnType<typeof createPackingCategoryV2Transport>;
    aggregateTransport: ReturnType<typeof createPackingCategoryAggregateTransport>;
    bagTransport: ReturnType<typeof createPackingBagTransport>;
    native: number | undefined;
  },
  row: QueuedMutation,
  packet: RetainedPackingEnvelope,
  retry: boolean,
  visible: () => boolean
): Promise<'committed' | 'unknown'> {
  const {
    owner,
    check,
    changed,
    fence,
    original,
    transport,
    groupTransport,
    categoryTransport,
    categoryV2Transport,
    aggregateTransport,
    bagTransport,
    native,
  } = context;

  const active = () => {
    check();
    if (!visible()) throw changed();
  };
  const activeOwner = { ...owner, assertCurrent: active, current: () => owner.current() && visible() };
  active();
  if (isEffectivelyOffline())
    throw new FamilyApiError(503, 'packing_recovery_offline', 'Reconnect to confirm the original packing save.');
  const release = await acquireQueueLock(activeOwner, 'exclusive', true);
  if (!release) throw changed();
  try {
    await fence(packet);
    await original(row);
    active();
    // This RPC checks current membership, assurance and direct packing authority, even for old receipts.
    const bag = packingBagEnvelope.safeParse(packet),
      aggregate = packingCategoryAggregateEnvelope.safeParse(packet),
      v2 = packingCategoryV2Envelope.safeParse(packet),
      category = packingCategoryEnvelope.safeParse(packet),
      group = packingGroupEnvelope.safeParse(packet);
    const receipt = bag.success
      ? await bagTransport.receipt(bag.data)
      : aggregate.success
        ? await aggregateTransport.receipt(aggregate.data)
        : v2.success
          ? await categoryV2Transport.receipt(v2.data)
          : category.success
            ? await categoryTransport.receipt(category.data)
            : group.success
              ? await groupTransport.receipt(group.data)
              : await transport.receipt(packet.command.scope, row.id);
    const validate = (raw: unknown) =>
      bag.success
        ? checkPackingBagAcknowledgement(raw, bag.data)
        : aggregate.success
          ? checkPackingCategoryAggregateAcknowledgement(raw, aggregate.data)
          : v2.success
            ? checkPackingCategoryV2Acknowledgement(raw, v2.data)
            : category.success
              ? checkPackingCategoryAcknowledgement(raw, category.data)
              : group.success
                ? checkPackingGroupAcknowledgement(raw, group.data)
                : checkPackingAcknowledgement(raw, packet.command as import('./packingCommandContract').PackingCommand);
    await fence(packet);
    await original(row);
    active();
    if (receipt.status === 'unknown' && !retry) return 'unknown' as const;
    try {
      if (receipt.status === 'unknown') {
        // Only an explicit retry can submit the existing original operation.
        const ack = (
          await api.post(packingIntentUrl(packet), packet, {
            headers: { 'X-Idempotency-Key': packet.command.operation_id },
          })
        ).data;
        validate(ack);
      } else if (receipt.result) {
        validate(receipt.result);
      }
      // A validated redacted commitment is sufficient proof. Never replay it
      // to recover a private result that the current actor cannot read.
    } catch (error) {
      active();
      await original(row);
      active();
      if (native === undefined) throw changed();
      await parkPackingRefusal(activeOwner, packet, native, error, row);
      throw error;
    }
    await fence(packet);
    await original(row);
    active();
    if (native === undefined) throw changed();
    await acknowledgePackingIntent(activeOwner, packet, native, row);
    return 'committed' as const; // The caller must obtain a fresh canonical planner read separately.
  } finally {
    release();
  }
}

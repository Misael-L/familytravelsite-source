import { packingBagEnvelope } from './packingBagContract';
import type { createPackingBagTransport } from './packingBagTransport';
import { checkPackingBagAcknowledgement } from './packingBagTransport';
import { packingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import type { createPackingCategoryAggregateTransport } from './packingCategoryAggregateTransport';
import { checkPackingCategoryAggregateAcknowledgement } from './packingCategoryAggregateTransport';
import { packingCategoryEnvelope } from './packingCategoryContract';
import type { createPackingCategoryTransport } from './packingCategoryTransport';
import { checkPackingCategoryAcknowledgement } from './packingCategoryTransport';
import { packingCategoryV2Envelope } from './packingCategoryV2Contract';
import type { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import { checkPackingCategoryV2Acknowledgement } from './packingCategoryV2Transport';
import { packingEnvelope } from './packingCommandContract';
import { checkPackingAcknowledgement } from './packingCommandTransport';
import type { PackingList } from './packingContract';
import { packingGroupEnvelope } from './packingGroupContract';
import type { createPackingGroupTransport } from './packingGroupTransport';
import { checkPackingGroupAcknowledgement } from './packingGroupTransport';
import type { RetainedPackingEnvelope } from './packingIntentQueue';
import type { createPackingTransport } from './packingTransport';

type ReceiptSources = Readonly<{
  bag: Pick<ReturnType<typeof createPackingBagTransport>, 'receipt'>;
  aggregate: Pick<ReturnType<typeof createPackingCategoryAggregateTransport>, 'receipt'>;
  categoryV2: Pick<ReturnType<typeof createPackingCategoryV2Transport>, 'receipt'>;
  category: Pick<ReturnType<typeof createPackingCategoryTransport>, 'receipt'>;
  group: Pick<ReturnType<typeof createPackingGroupTransport>, 'receipt'>;
  base: Pick<ReturnType<typeof createPackingTransport>, 'receipt'>;
}>;
/** Start the original checked receipt read without adding an async boundary or acquiring authority. */
export function retainedPackingReceipt(
  p: RetainedPackingEnvelope,
  scope: PackingList['scope'],
  readers: ReceiptSources
) {
  const bag = packingBagEnvelope.safeParse(p),
    aggregate = packingCategoryAggregateEnvelope.safeParse(p),
    v2 = packingCategoryV2Envelope.safeParse(p),
    category = packingCategoryEnvelope.safeParse(p),
    group = packingGroupEnvelope.safeParse(p);
  const receipt = bag.success
    ? readers.bag.receipt(bag.data)
    : aggregate.success
      ? readers.aggregate.receipt(aggregate.data)
      : v2.success
        ? readers.categoryV2.receipt(v2.data)
        : category.success
          ? readers.category.receipt(category.data)
          : group.success
            ? readers.group.receipt(group.data)
            : readers.base.receipt(scope, p.command.operation_id);
  return { aggregate: aggregate.success, receipt };
}

export function validateRetainedPackingAck(raw: unknown, packet: RetainedPackingEnvelope) {
  const bag = packingBagEnvelope.safeParse(packet);
  if (bag.success) return checkPackingBagAcknowledgement(raw, bag.data);
  const aggregate = packingCategoryAggregateEnvelope.safeParse(packet);
  if (aggregate.success) return checkPackingCategoryAggregateAcknowledgement(raw, aggregate.data);
  const v2 = packingCategoryV2Envelope.safeParse(packet);
  if (v2.success) return checkPackingCategoryV2Acknowledgement(raw, v2.data);
  const category = packingCategoryEnvelope.safeParse(packet);
  if (category.success) return checkPackingCategoryAcknowledgement(raw, category.data);
  const group = packingGroupEnvelope.safeParse(packet);
  if (group.success) return checkPackingGroupAcknowledgement(raw, group.data);
  return checkPackingAcknowledgement(raw, packingEnvelope.parse(packet).command);
}

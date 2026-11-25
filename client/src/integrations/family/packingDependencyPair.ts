import { MUTATION_SCHEMA_VERSION, type QueuedMutation } from '../../db/offlineDb';
import { FamilyApiError } from './errors';
import { packingBagEnvelope } from './packingBagContract';
import {
  dependencyBounded,
  dependencyRelationship,
  PACKING_DEPENDENCY_QUEUE_FORMAT,
  packingDependencyChild,
  packingDependencyDescriptor,
  packingDependencyHash,
} from './packingBagDependencyContract';
import { matchesPackingIntent, packingIntentKeys, packingIntentUrl } from './packingIntentQueue';
const fail: () => never = () => {
  throw new FamilyApiError(
    409,
    'packing_dependency_changed',
    'The original recovery dependency changed. Both commands are preserved.'
  );
};
const parentKeys = new Set([...packingIntentKeys, 'familyPackingDependency']);
function checkedChild(row: QueuedMutation, native: number) {
  const p = packingDependencyChild.safeParse(row.body);
  if (
    !dependencyBounded(row) ||
    !p.success ||
    row.status !== 'conflict' ||
    row.schemaVersion !== MUTATION_SCHEMA_VERSION ||
    !matchesPackingIntent(row, p.data, native) ||
    !Number.isSafeInteger(row.createdAt) ||
    !Number.isSafeInteger(row.attempts) ||
    row.attempts < 0
  )
    fail();
  return p.data;
}
function selectDependencyPairRows(rows: QueuedMutation[]) {
  if (rows.length !== 2) fail();
  const parents = rows.filter((r) => Object.prototype.hasOwnProperty.call(r, 'familyPackingDependency'));
  if (parents.length !== 1) fail();
  const parent = parents[0],
    child = rows.find((r) => r.id !== parent.id);
  if (!child) fail();
  return { parent, child };
}
export async function inspectPackingDependencyPair(rows: QueuedMutation[], native: number) {
  const { parent, child } = selectDependencyPairRows(rows);
  const p = checkedChild(child, native),
    d = packingDependencyDescriptor.safeParse(parent.familyPackingDependency),
    bag = packingBagEnvelope.safeParse(parent.body);
  if (
    !dependencyBounded(parent) ||
    !d.success ||
    !bag.success ||
    parent.schemaVersion !== PACKING_DEPENDENCY_QUEUE_FORMAT ||
    parent.tripId !== native ||
    parent.retentionPolicy !== 'family-original-v1' ||
    parent.method !== 'POST' ||
    parent.url !== packingIntentUrl(bag.data) ||
    parent.id !== bag.data.command.operation_id ||
    !['pending', 'failed', 'conflict'].includes(parent.status) ||
    !Number.isSafeInteger(parent.createdAt) ||
    !Number.isSafeInteger(parent.attempts) ||
    parent.attempts < 0 ||
    parent.createdAt <= child.createdAt ||
    Object.keys(parent).some((k) => !parentKeys.has(k)) ||
    !dependencyRelationship(p, bag.data, d.data)
  )
    fail();
  if (
    d.data.child_sha256 !== (await packingDependencyHash(p)) ||
    d.data.child_row_sha256 !== (await packingDependencyHash(child))
  )
    fail();
  return { child, parent, packet: p, bag: bag.data, descriptor: d.data };
}

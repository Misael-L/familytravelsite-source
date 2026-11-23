import type { QueuedMutation } from './offlineDb';
/** Preservation marker only. It grants no authority to submit or acknowledge either command. */
export const hasPackingDependency = (row: QueuedMutation) =>
  Object.prototype.hasOwnProperty.call(row, 'familyPackingDependency');
export function packingDependencyProtectedIds(rows: QueuedMutation[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!hasPackingDependency(row)) continue;
    ids.add(row.id);
    const descriptor = row.familyPackingDependency;
    if (
      descriptor &&
      typeof descriptor === 'object' &&
      'child_operation_id' in descriptor &&
      typeof descriptor.child_operation_id === 'string'
    )
      ids.add(descriptor.child_operation_id);
  }
  return ids;
}

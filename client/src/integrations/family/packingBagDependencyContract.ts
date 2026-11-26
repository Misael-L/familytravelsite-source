import { z } from 'zod';
import { packingBagEnvelope } from './packingBagContract';
import { packingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import { packingEnvelope, packingJson } from './packingCommandContract';
import { packingId, packingRow } from './packingContract';
import { packingGroupBytes } from './packingGroupContract';
/** Only this dedicated parser understands format3; generic queue replay remains on format2. */
export const PACKING_DEPENDENCY_QUEUE_FORMAT = 3;
export function dependencyBounded(value: unknown) {
  try {
    return packingGroupBytes(value) <= 8388608;
  } catch {
    return false;
  }
}
export const packingDependencyChild = z
  .union([packingEnvelope, packingCategoryAggregateEnvelope])
  .refine(
    (p) =>
      p.view_layer === 'published' &&
      (p.command.action === 'restore' || p.command.action === 'category-restore-batch') &&
      dependencyBounded(p)
  );
export type PackingDependencyChild = z.infer<typeof packingDependencyChild>;
export const packingDependencyDescriptor = z
  .object({
    version: z.literal(1),
    kind: z.literal('packing-bag-restore-dependency'),
    child_operation_id: packingId,
    child_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    child_row_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    parent_operation_id: packingId,
    bag_id: packingId,
    child_item: packingRow.nullable(),
  })
  .strict()
  .refine(dependencyBounded);
export type PackingDependencyDescriptor = z.infer<typeof packingDependencyDescriptor>;
/** Typed canonical framing preserves present undefined fields and ignores object insertion order. */
export function dependencyIdentity(value: unknown, preserveNegativeZero = false): string {
  const seen = new Set<object>();
  const encode = (v: unknown, depth = 0): unknown => {
    if (depth > 100) throw new Error('Dependency identity exceeds its bound');
    if (v === undefined) return ['undefined'];
    if (v === null) return ['null'];
    if (typeof v === 'string' || typeof v === 'boolean') return [typeof v, v];
    if (typeof v === 'number' && Number.isFinite(v))
      return ['number', preserveNegativeZero && Object.is(v, -0) ? '-0' : v];
    if (typeof v !== 'object' || seen.has(v)) throw new Error('Dependency identity is not plain data');
    seen.add(v);
    try {
      if (Array.isArray(v)) {
        if (Object.keys(v).length !== v.length) throw new Error('Sparse dependency data');
        return ['array', v.map((x) => encode(x, depth + 1))];
      }
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
        throw new Error('Nonplain dependency data');
      if (Reflect.ownKeys(v).some((k) => typeof k !== 'string')) throw new Error('Unknown dependency keys');
      return [
        'object',
        Object.entries(v)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, encode(x, depth + 1)]),
      ];
    } finally {
      seen.delete(v);
    }
  };
  return JSON.stringify(encode(value));
}
export async function packingDependencyHash(value: unknown, preserveNegativeZero = false) {
  const bytes = new TextEncoder().encode(dependencyIdentity(value, preserveNegativeZero));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function dependencyRelationship(
  child: PackingDependencyChild,
  parent: unknown,
  descriptor: PackingDependencyDescriptor
) {
  const p = packingBagEnvelope.safeParse(parent);
  if (!p.success) return false;
  const c = child.command,
    b = p.data.command;
  if (
    b.action !== 'bag-restore' ||
    c.operation_id !== descriptor.child_operation_id ||
    b.operation_id !== descriptor.parent_operation_id ||
    b.operation_id === c.operation_id ||
    b.target_id !== descriptor.bag_id ||
    child.source_url !== p.data.source_url ||
    child.view_layer !== p.data.view_layer ||
    packingJson(c.scope) !== packingJson(b.scope)
  )
    return false;
  if (c.action === 'restore') {
    const row = descriptor.child_item;
    return (
      row !== null &&
      row.trip_id === c.scope.trip_id &&
      row.id === c.target_id &&
      row.revision === c.expected_revision &&
      row.deleted_at !== null &&
      row.bag_id === b.target_id
    );
  }
  return (
    c.action === 'category-restore-batch' &&
    descriptor.child_item === null &&
    c.observed.items.some((row) => row.bag_id === b.target_id)
  );
}

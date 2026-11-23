import { z } from 'zod';
import { packingJson } from './packingCommandContract';
import { packingId, packingRow, packingScope, type PackingRow } from './packingContract';

const counter = z.number().int().nonnegative().safe();
const ascending = (ids: string[]) => ids.every((id, i) => i === 0 || ids[i - 1] < id);
// JSONB uses separator spaces. Count UTF-8 bytes, not JavaScript UTF-16 code units.
export function packingGroupBytes(value: unknown): number {
  const text = (v: unknown): string => {
    if (Array.isArray(v)) return '[' + v.map(text).join(', ') + ']';
    if (v !== null && typeof v === 'object')
      return (
        '{' +
        Object.entries(v)
          .map(([k, x]) => JSON.stringify(k) + ': ' + text(x))
          .join(', ') +
        '}'
      );
    return JSON.stringify(v) ?? 'undefined';
  };
  return new TextEncoder().encode(text(value)).byteLength;
}
const labels = z
  .array(z.string().refine((s) => !s.includes('\0') && Array.from(s).length <= 200))
  .min(1)
  .max(2)
  .refine((xs) => new Set(xs).size === xs.length);
export const packingGroupSelector = z
  .object({
    view: z.enum(['common', 'personal']),
    status: z.enum(['all', 'open', 'done']),
    categories: labels.nullable(),
  })
  .strict()
  .refine((v) => packingGroupBytes(v) <= 4096);
export type PackingGroupSelector = z.infer<typeof packingGroupSelector>;
const observations = z
  .array(
    z
      .object({
        id: packingId,
        revision: counter.refine((n) => n > 0),
        checked: z.boolean(),
      })
      .strict()
  )
  .max(2000)
  .refine((xs) => ascending(xs.map((x) => x.id)))
  .refine((xs) => packingGroupBytes(xs) <= 262144);
const common = {
  version: z.literal(1),
  kind: z.literal('packing-group'),
  operation_id: packingId,
  scope: packingScope,
  selector: packingGroupSelector,
  observed_items: observations,
  expected_collection_revision: counter,
};
export const packingGroupCommand = z
  .discriminatedUnion('action', [
    z
      .object({
        ...common,
        action: z.literal('group-packed-state'),
        values: z.object({ checked: z.boolean() }).strict(),
      })
      .strict(),
    z.object({ ...common, action: z.literal('group-trash'), values: z.object({}).strict() }).strict(),
    z.object({ ...common, action: z.literal('clear-completed'), values: z.object({}).strict() }).strict(),
  ])
  .refine((p) =>
    p.action === 'clear-completed'
      ? p.selector.categories === null && p.selector.status === 'all'
      : p.selector.categories !== null
  );
export type PackingGroupCommand = z.infer<typeof packingGroupCommand>;
export const selectedPackingRows = (rows: PackingRow[], selector: PackingGroupSelector) =>
  rows
    .filter(
      (r) =>
        r.deleted_at === null &&
        r.is_private === (selector.view === 'personal') &&
        (selector.categories === null || selector.categories.includes(r.category)) &&
        (selector.status === 'all' || r.checked === (selector.status === 'done'))
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
// Original full rows are retained for strict no-op/changed-subset checking. They are not extra RPC arguments.
export const packingGroupEnvelope = z
  .object({
    version: z.literal(1),
    source_url: z.string().min(1),
    view_layer: z.enum(['published', 'myDraft']),
    command: packingGroupCommand,
    original_items: z.array(packingRow).max(2000),
  })
  .strict()
  .refine((p) => {
    const c = p.command,
      rows = p.original_items;
    return (
      ascending(rows.map((r) => r.id)) &&
      rows.every((r) => r.trip_id === c.scope.trip_id) &&
      packingJson(selectedPackingRows(rows, c.selector)) === packingJson(rows) &&
      packingJson(rows.map(({ id, revision, checked }) => ({ id, revision, checked }))) ===
        packingJson(c.observed_items) &&
      packingGroupBytes(p) <= 8388608
    );
  });
export type PackingGroupEnvelope = z.infer<typeof packingGroupEnvelope>;
export const packingGroupAck = z
  .object({
    version: z.literal(1),
    kind: z.literal('packing-group'),
    trip_id: packingId,
    operation_id: packingId,
    scope: packingScope,
    action: z.enum(['group-packed-state', 'group-trash', 'clear-completed']),
    selector: packingGroupSelector,
    values: z.union([z.object({ checked: z.boolean() }).strict(), z.object({}).strict()]),
    collection_revision: counter,
    items: z.array(packingRow).max(2000),
    changed_ids: z.array(packingId).max(2000),
  })
  .strict();
export type PackingGroupAck = z.infer<typeof packingGroupAck>;
export const packingGroupReceipt = z
  .object({
    version: z.literal(1),
    kind: z.literal('packing-group'),
    trip_id: packingId,
    operation_id: packingId,
    scope: packingScope,
    status: z.enum(['unknown', 'committed']),
    result_redacted: z.boolean(),
    result: packingGroupAck.nullable(),
  })
  .strict();

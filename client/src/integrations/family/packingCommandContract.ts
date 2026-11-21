import { z } from 'zod';
import { packingId, packingScope } from './packingContract';

// Match PostgreSQL btrim(text) and length(text), including supplementary Unicode.
export const trimPackingName = (s: string) => s.replace(/^ +| +$/g, '');
const name = z.string().refine((s) => {
  const n = Array.from(trimPackingName(s)).length;
  return n >= 1 && n <= 500;
});
const quantity = z.number().int().min(1).max(10000);
const packed = z.number().int().min(0).max(10000).nullable();
const counter = z.number().int().nonnegative().safe();
const fields = {
  name: name.optional(),
  category: z
    .string()
    .refine((s) => Array.from(s).length <= 200)
    .optional(),
  quantity: quantity.optional(),
  weight_grams: z.number().int().min(0).max(1000000).nullable().optional(),
  bag_id: packingId.nullable().optional(),
};
const common = { version: z.literal(1), operation_id: packingId, scope: packingScope };
const observed = {
  target_id: packingId,
  expected_revision: counter.refine((n) => n > 0),
  expected_collection_revision: z.null(),
};
export const packingCommand = z
  .discriminatedUnion('action', [
    z
      .object({
        ...common,
        action: z.literal('create'),
        target_id: packingId,
        expected_revision: z.null(),
        expected_collection_revision: z.null(),
        values: z
          .object({
            ...fields,
            name,
            visibility: z.enum(['common', 'personal']).optional(),
            checked: z.boolean().optional(),
            packed_quantity: packed.optional(),
          })
          .strict()
          .refine((v) => !('checked' in v && 'packed_quantity' in v))
          .refine((v) => (v.packed_quantity ?? 0) <= (v.quantity ?? 1)),
      })
      .strict(),
    z
      .object({
        ...common,
        action: z.literal('update'),
        ...observed,
        values: z
          .object(fields)
          .strict()
          .refine((v) => Object.keys(v).length > 0),
      })
      .strict(),
    z
      .object({
        ...common,
        action: z.literal('packed-state'),
        ...observed,
        values: z.union([z.object({ checked: z.boolean() }).strict(), z.object({ packed_quantity: packed }).strict()]),
      })
      .strict(),
    z
      .object({
        ...common,
        action: z.literal('reorder'),
        target_id: z.null(),
        expected_revision: z.null(),
        expected_collection_revision: counter,
        values: z
          .object({
            ids: z
              .array(packingId)
              .max(2000)
              .refine((ids) => new Set(ids).size === ids.length),
          })
          .strict(),
      })
      .strict(),
    z.object({ ...common, action: z.literal('trash'), ...observed, values: z.object({}).strict() }).strict(),
    z.object({ ...common, action: z.literal('restore'), ...observed, values: z.object({}).strict() }).strict(),
  ])
  .refine((p) => Object.values(p.values).every((v) => v !== undefined));
export type PackingCommand = z.infer<typeof packingCommand>;
export const packingEnvelope = z
  .object({
    version: z.literal(1),
    source_url: z.string().min(1),
    view_layer: z.enum(['published', 'myDraft']),
    command: packingCommand,
  })
  .strict();
export type PackingEnvelope = z.infer<typeof packingEnvelope>;

/** Deterministic JSON identity, never a replacement command or an automatic rebase. */
export const packingJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );

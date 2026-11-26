import { z } from 'zod';

const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const counter = z.number().int().nonnegative().safe();
export const taskTimestamp = z
  .string()
  .datetime({ offset: true })
  .regex(/(?:Z|[+-]\d{2}:\d{2})$/)
  .refine((s) => Number.isFinite(Date.parse(s)) && !/\.\d{7}/.test(s));
const date = z
  .string()
  .date()
  .refine((s) => !s.startsWith('0000-'));
export const taskScope = z
  .object({
    version: z.literal(1),
    trip_id: id,
    family_id: id,
    user_id: id,
    person_id: id,
    layer: z.literal('published'),
    trip_lifecycle_revision: counter,
  })
  .strict();
export type TaskScope = z.infer<typeof taskScope>;
// Caller context may be a full scope; only these identity fields constrain a read.
export const taskIdentity = taskScope.pick({ trip_id: true, family_id: true, user_id: true, person_id: true }).strip();
export type TaskIdentity = z.infer<typeof taskIdentity>;
export const taskRow = z
  .object({
    id,
    trip_id: id,
    name: z.string(),
    checked: z.boolean(),
    category: z.string(),
    sort_order: z.number().int().min(-2147483648).max(2147483647),
    due_date: date.nullable(),
    description: z.string().nullable(),
    assigned_person_id: id.nullable(),
    priority: z.number().int().min(0).max(3),
    created_at: taskTimestamp,
    updated_at: taskTimestamp,
    revision: counter.refine((n) => n > 0),
    deleted_at: taskTimestamp.nullable(),
    deleted_by_person_id: id.nullable(),
  })
  .strict()
  .refine((r) => (r.deleted_at === null) === (r.deleted_by_person_id === null));
export type TaskRow = z.infer<typeof taskRow>;
export const taskList = z
  .object({
    version: z.literal(1),
    scope: taskScope,
    collection_revision: counter,
    tasks: z.array(taskRow).max(2000),
    trash_count: counter,
  })
  .strict();
export type TaskList = z.infer<typeof taskList>;
export const taskCursor = z.object({ deleted_at: taskTimestamp, id }).strict();
export type TaskCursor = z.infer<typeof taskCursor>;
export const taskTrashPage = z
  .object({
    version: z.literal(1),
    scope: taskScope,
    collection_revision: counter,
    tasks: z.array(taskRow).max(100),
    next_cursor: taskCursor.nullable(),
  })
  .strict();
export type TaskTrashPage = z.infer<typeof taskTrashPage>;

// PostgreSQL btrim(text) trims spaces; PostgreSQL length counts code points, not UTF-16 units.
export const trimTaskName = (s: string) => s.replace(/^ +| +$/g, '');
const length = (max: number) => z.string().refine((s) => Array.from(s).length <= max);
const name = z
  .string()
  .refine((s) => Array.from(trimTaskName(s)).length >= 1 && Array.from(trimTaskName(s)).length <= 500);
const fields = {
  name: name.optional(),
  category: length(200).optional(),
  description: length(20000).nullable().optional(),
  due_date: date.nullable().optional(),
  assigned_person_id: id.nullable().optional(),
  priority: z.number().int().min(0).max(3).optional(),
};
const common = { version: z.literal(1), operation_id: id, scope: taskScope };
const observed = {
  target_id: id,
  expected_revision: counter.refine((n) => n > 0),
  expected_collection_revision: z.null(),
};
export const taskCommand = z
  .discriminatedUnion('action', [
    z
      .object({
        ...common,
        action: z.literal('create'),
        target_id: id,
        expected_revision: z.null(),
        expected_collection_revision: z.null(),
        values: z.object({ ...fields, name }).strict(),
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
          .refine((v) => Object.keys(v).length > 0 && Object.values(v).every((x) => x !== undefined)),
      })
      .strict(),
    z
      .object({
        ...common,
        action: z.literal('completion'),
        ...observed,
        values: z.object({ checked: z.boolean() }).strict(),
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
              .array(id)
              .max(2000)
              .refine((v) => new Set(v).size === v.length),
          })
          .strict(),
      })
      .strict(),
    z.object({ ...common, action: z.literal('trash'), ...observed, values: z.object({}).strict() }).strict(),
    z.object({ ...common, action: z.literal('restore'), ...observed, values: z.object({}).strict() }).strict(),
  ])
  .refine((p) => Object.values(p.values).every((v) => v !== undefined));
export type TaskCommand = z.infer<typeof taskCommand>;
export const taskAck = z
  .object({
    version: z.literal(1),
    trip_id: id,
    operation_id: id,
    action: z.enum(['create', 'update', 'completion', 'reorder', 'trash', 'restore']),
    target_id: id.nullable(),
    scope: taskScope,
    collection_revision: counter,
    task: taskRow.nullable(),
    ordered_ids: z.array(id).max(2000).nullable(),
  })
  .strict();
export type TaskAck = z.infer<typeof taskAck>;
export const taskReceipt = z
  .object({
    version: z.literal(1),
    trip_id: id,
    operation_id: id,
    scope: taskScope,
    status: z.enum(['committed', 'unknown']),
    result: taskAck.nullable(),
  })
  .strict();
export type TaskReceipt = z.infer<typeof taskReceipt>;
export const taskId = id;

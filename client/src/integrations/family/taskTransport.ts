import type { ZodType } from 'zod';
import { FamilyApiError } from './errors';
import {
  taskAck,
  taskCommand,
  taskCursor,
  taskId,
  taskIdentity,
  taskList,
  taskReceipt,
  taskTrashPage,
  trimTaskName,
  type TaskAck,
  type TaskCommand,
  type TaskCursor,
  type TaskIdentity,
  type TaskRow,
  type TaskScope,
  type TaskTrashPage,
} from './taskContract';
export type TaskRpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
function invalid(message = 'The task service returned an invalid snapshot.'): never {
  throw new FamilyApiError(502, 'invalid_task_response', message);
}
function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
function parsed<T>(schema: ZodType<T>, raw: unknown, bound = 8388608): T {
  if (bytes(raw) > bound) invalid('The task service response exceeds its bound.');
  const result = schema.safeParse(raw);
  return result.success ? result.data : invalid();
}
function sameScope(a: TaskScope, b: TaskScope) {
  return (
    a.version === b.version &&
    a.layer === b.layer &&
    a.trip_lifecycle_revision === b.trip_lifecycle_revision &&
    a.trip_id === b.trip_id &&
    a.family_id === b.family_id &&
    a.user_id === b.user_id &&
    a.person_id === b.person_id
  );
}
function identity(scope: TaskScope, expected: TaskIdentity) {
  if (
    scope.trip_id !== expected.trip_id ||
    scope.family_id !== expected.family_id ||
    scope.user_id !== expected.user_id ||
    scope.person_id !== expected.person_id
  )
    invalid('The task snapshot belongs to another context.');
}
function rowIdentity(rows: TaskRow[], trip: string, trash: boolean) {
  if (
    new Set(rows.map((r) => r.id)).size !== rows.length ||
    rows.some((r) => r.trip_id !== trip || (r.deleted_at !== null) !== trash)
  )
    invalid();
}
/** PostgreSQL preserves six fractional digits. Millisecond Date comparison alone loses page order. */
function instant(s: string): bigint {
  const fraction = s.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? '';
  return BigInt(Date.parse(s)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3, 6));
}
function after(a: TaskCursor, b: TaskCursor) {
  const left = instant(a.deleted_at),
    right = instant(b.deleted_at);
  return left < right || (left === right && a.id > b.id);
}
function validateTrashCursor(page: TaskTrashPage, before: TaskCursor | null, limit: number) {
  const cursors = page.tasks.map((row) => {
    if (row.deleted_at === null) invalid();
    return { deleted_at: row.deleted_at, id: row.id };
  });
  if (page.tasks.length > limit || (before && cursors.length && !after(cursors[0], before))) invalid();
  if (cursors.some((c, i) => i > 0 && !after(c, cursors[i - 1]))) invalid();
  const last = cursors[cursors.length - 1],
    next = page.next_cursor;
  if (next && (!last || page.tasks.length !== limit || next.deleted_at !== last.deleted_at || next.id !== last.id))
    invalid();
}
function validateAck(a: TaskAck) {
  if (a.trip_id !== a.scope.trip_id || (a.action === 'reorder') !== (a.target_id === null)) invalid();
  if (a.action === 'reorder') {
    if (a.task !== null || a.ordered_ids === null || new Set(a.ordered_ids).size !== a.ordered_ids.length) invalid();
  } else if (
    !a.task ||
    a.ordered_ids !== null ||
    a.task.id !== a.target_id ||
    a.task.trip_id !== a.trip_id ||
    (a.task.deleted_at !== null) !== (a.action === 'trash')
  )
    invalid();
}
function matchAck(a: TaskAck, p: TaskCommand) {
  validateAck(a);
  if (
    a.operation_id !== p.operation_id ||
    a.trip_id !== p.scope.trip_id ||
    a.action !== p.action ||
    a.target_id !== p.target_id ||
    !sameScope(a.scope, p.scope)
  )
    invalid('The task acknowledgement does not match its original command.');
  if (p.action === 'reorder') {
    if (
      JSON.stringify(a.ordered_ids) !== JSON.stringify(p.values.ids) ||
      a.collection_revision < p.expected_collection_revision
    )
      invalid();
  } else {
    const row = a.task;
    if (!row) invalid();
    if (row.revision !== (p.action === 'create' ? 1 : p.expected_revision + 1)) invalid();
    for (const [key, value] of Object.entries(p.values)) {
      if (key === 'name') {
        if (row.name !== trimTaskName(value as string)) invalid();
      } else if (row[key as keyof TaskRow] !== value) invalid();
    }
  }
}
export function checkTaskAcknowledgement(raw: unknown, command: TaskCommand) {
  const result = parsed(taskAck, raw);
  matchAck(result, command);
  return result;
}
/** Pure typed transport. No queue, native writer installation, cache mutation or generated identities. */
export function createTaskTransport(rpc: TaskRpc) {
  const call: TaskRpc = async (name, args) => {
    try {
      return await rpc(name, args);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === '42501') throw new FamilyApiError(403, 'task_access_denied', 'Task access is not authorized.');
      if (['PGRST301', 'PGRST302', 'PGRST303'].includes(code))
        throw new FamilyApiError(401, 'task_session_required', 'Sign in again before reading tasks.');
      if (['PT409', '40001'].includes(code))
        throw new FamilyApiError(
          409,
          'task_conflict',
          'The original task observation changed. Reload before starting another edit.'
        );
      if (code === '22023') throw new FamilyApiError(400, 'task_request_invalid', 'The task request is invalid.');
      if (['23503', '23514'].includes(code))
        throw new FamilyApiError(
          422,
          'task_relationship_changed',
          'Task details no longer satisfy the Trip requirements.'
        );
      if (code === '54000') throw new FamilyApiError(413, 'task_service_bound', 'The task service limit was reached.');
      throw error;
    }
  };
  return {
    async list(expected: TaskIdentity) {
      expected = taskIdentity.parse(expected);
      const result = parsed(taskList, await call('get_family_trip_tasks_v1', { p_trip_id: expected.trip_id }));
      identity(result.scope, expected);
      rowIdentity(result.tasks, expected.trip_id, false);
      if (
        result.tasks.some(
          (r, i) =>
            i > 0 &&
            (r.sort_order < result.tasks[i - 1].sort_order ||
              (r.sort_order === result.tasks[i - 1].sort_order && r.id <= result.tasks[i - 1].id))
        )
      )
        invalid();
      return result;
    },
    async trash(expected: TaskIdentity, limit = 50, before: TaskCursor | null = null) {
      expected = taskIdentity.parse(expected);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new FamilyApiError(400, 'task_cursor', 'A bounded task Trash page is required.');
      const cursor = before === null ? null : taskCursor.parse(before);
      const result = parsed(
        taskTrashPage,
        await call('list_family_trip_task_trash_v1', {
          p_trip_id: expected.trip_id,
          p_limit: limit,
          p_before: cursor?.deleted_at ?? null,
          p_before_id: cursor?.id ?? null,
        })
      );
      identity(result.scope, expected);
      rowIdentity(result.tasks, expected.trip_id, true);
      validateTrashCursor(result, cursor, limit);
      return result;
    },
    async execute(raw: TaskCommand) {
      const p = taskCommand.parse(raw);
      if (bytes(p.values) > (p.action === 'reorder' ? 98304 : 65536))
        throw new FamilyApiError(400, 'task_values_bound', 'Task values exceed their bound.');
      const result = parsed(
        taskAck,
        await call('execute_family_trip_task_v1', {
          p_trip_id: p.scope.trip_id,
          p_operation_id: p.operation_id,
          p_scope: p.scope,
          p_action: p.action,
          p_target_id: p.target_id,
          p_expected_revision: p.expected_revision,
          p_expected_collection_revision: p.expected_collection_revision,
          p_values: p.values,
        })
      );
      matchAck(result, p);
      return result; // Historical acknowledgement only. The caller must read current state separately.
    },
    async receipt(expected: TaskIdentity, operation: string) {
      expected = taskIdentity.parse(expected);
      taskId.parse(operation);
      const result = parsed(
        taskReceipt,
        await call('get_family_trip_task_receipt_v1', { p_trip_id: expected.trip_id, p_operation_id: operation })
      );
      identity(result.scope, expected);
      if (
        result.trip_id !== expected.trip_id ||
        result.operation_id !== operation ||
        (result.status === 'committed') !== (result.result !== null)
      )
        invalid();
      if (result.result) {
        validateAck(result.result);
        identity(result.result.scope, expected);
        if (
          result.result.operation_id !== operation ||
          result.result.trip_id !== expected.trip_id ||
          result.result.scope.trip_lifecycle_revision > result.scope.trip_lifecycle_revision
        )
          invalid();
      }
      return result; // Unknown is unresolved; it never allocates a replacement operation UUID.
    },
  };
}

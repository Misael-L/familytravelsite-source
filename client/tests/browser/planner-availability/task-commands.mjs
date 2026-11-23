import { taskSnapshot } from './ancillary-data.mjs';
const snapshot = taskSnapshot(),
  trash = [],
  receipts = new Map();
const clone = (value) => globalThis.structuredClone(value);
export function taskService(name, args) {
  if (name === 'get_family_trip_tasks_v1') return { data: clone(snapshot), error: null };
  if (name === 'list_family_trip_task_trash_v1')
    return {
      data: {
        version: 1,
        scope: clone(snapshot.scope),
        collection_revision: snapshot.collection_revision,
        tasks: clone(trash),
        next_cursor: null,
      },
      error: null,
    };
  if (name === 'get_family_trip_task_receipt_v1')
    return {
      data: {
        version: 1,
        trip_id: snapshot.scope.trip_id,
        operation_id: args.p_operation_id,
        scope: clone(snapshot.scope),
        status: receipts.has(args.p_operation_id) ? 'committed' : 'unknown',
        result: clone(receipts.get(args.p_operation_id)?.ack ?? null),
      },
      error: null,
    };
  if (name !== 'execute_family_trip_task_v1') return null;
  const key = JSON.stringify(args),
    prior = receipts.get(args.p_operation_id);
  if (prior) {
    if (prior.key !== key) throw new Error('Changed original task command');
    return { data: clone(prior.ack), error: null };
  }
  if (args.p_trip_id !== snapshot.scope.trip_id || JSON.stringify(args.p_scope) !== JSON.stringify(snapshot.scope))
    throw new Error('Synthetic task scope mismatch');
  const action = args.p_action,
    values = args.p_values,
    target = args.p_target_id;
  let task = null;
  if (action === 'create') {
    task = {
      ...clone(snapshot.tasks[0] ?? taskSnapshot().tasks[0]),
      id: target,
      name: values.name.trim(),
      checked: false,
      category: '',
      description: null,
      assigned_person_id: null,
      due_date: null,
      priority: 0,
      ...values,
      revision: 1,
      sort_order: Math.max(-1, ...snapshot.tasks.map((r) => r.sort_order)) + 1,
    };
    snapshot.tasks.push(task);
  } else if (action === 'reorder') {
    if (args.p_expected_collection_revision !== snapshot.collection_revision)
      throw new Error('Stale synthetic task order');
    snapshot.tasks = values.ids.map((id, i) => {
      const row = snapshot.tasks.find((r) => r.id === id);
      if (!row) throw new Error('Unknown task');
      return { ...row, sort_order: i, revision: row.revision + 1 };
    });
  } else {
    const rows = action === 'restore' ? trash : snapshot.tasks,
      row = rows.find((r) => r.id === target);
    if (!row || row.revision !== args.p_expected_revision) throw new Error('Stale synthetic task observation');
    task = { ...row, ...values, revision: row.revision + 1 };
    if (action === 'trash') {
      snapshot.tasks = snapshot.tasks.filter((r) => r.id !== target);
      task.deleted_at = '2026-11-08T12:00:00Z';
      task.deleted_by_person_id = snapshot.scope.person_id;
      trash.push(task);
    } else if (action === 'restore') {
      trash.splice(
        trash.findIndex((r) => r.id === target),
        1
      );
      task.deleted_at = null;
      task.deleted_by_person_id = null;
      task.sort_order = Math.max(-1, ...snapshot.tasks.map((r) => r.sort_order)) + 1;
      snapshot.tasks.push(task);
    } else snapshot.tasks = snapshot.tasks.map((r) => (r.id === target ? task : r));
  }
  snapshot.collection_revision++;
  snapshot.trash_count = trash.length;
  const ack = {
    version: 1,
    trip_id: snapshot.scope.trip_id,
    operation_id: args.p_operation_id,
    action,
    target_id: target,
    scope: clone(snapshot.scope),
    collection_revision: snapshot.collection_revision,
    task,
    ordered_ids: action === 'reorder' ? values.ids : null,
  };
  receipts.set(args.p_operation_id, { key, ack: clone(ack) });
  return { data: clone(ack), error: null };
}

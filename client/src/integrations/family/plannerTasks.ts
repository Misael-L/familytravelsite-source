import type { TodoItem } from '../../types';
import type { FamilyIdentityRegistry } from './identity';
import { NOT_HANDLED } from './listHandler';
import { locationRpc } from './planLocations';
import { guardedPlannerRead, preparePlannerReadScope, type PlannerReadGuard } from './plannerReadGuard';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { TaskRow, TaskScope } from './taskContract';
import { createTaskTransport } from './taskTransport';
import type { FamilyRequest } from './transport';

export type NativeTask = TodoItem & {
  created_at: string;
  updated_at: string;
  reminded_at: null;
  family_task: {
    version: 1;
    id: string;
    trip_id: string;
    revision: number;
    scope: TaskScope;
    collection_revision: number;
    assigned_person_id: string | null;
  };
};
export function projectTask(row: TaskRow, scope: TaskScope, revision: number, ids: FamilyIdentityRegistry): NativeTask {
  return {
    id: ids.register('todo', row.id),
    trip_id: ids.register('trip', row.trip_id),
    name: row.name,
    checked: row.checked ? 1 : 0,
    category: row.category,
    sort_order: row.sort_order,
    due_date: row.due_date,
    description: row.description,
    assigned_user_id: row.assigned_person_id ? ids.register('person', row.assigned_person_id) : null,
    priority: row.priority,
    created_at: row.created_at,
    updated_at: row.updated_at,
    reminded_at: null,
    family_task: {
      version: 1,
      id: row.id,
      trip_id: row.trip_id,
      revision: row.revision,
      scope,
      collection_revision: revision,
      assigned_person_id: row.assigned_person_id,
    },
  };
}
/** Published Trip-owned tasks are not itinerary drafts. Never persist them into a private planner snapshot. */
export function createPlannerTaskReader(
  repo: FamilyFrontendRepository,
  disposed: () => boolean,
  source: () => string,
  transport = createTaskTransport(locationRpc)
) {
  const read = async (value: number | string, signal?: AbortSignal, inherited?: PlannerReadGuard) => {
    const { owner, session, trip, ids, fence } = await preparePlannerReadScope(repo, value, {
      disposed,
      source,
      signal,
      kind: 'task',
    });
    await fence();
    return guardedPlannerRead(
      owner,
      { uuid: trip, native: ids.register('trip', trip) },
      () => new FamilyApiError(409, 'task_local_work', 'Task refresh is held to preserve local work.'),
      async (guard) => {
        await fence();
        try {
          const packet = await transport.list({
            trip_id: trip,
            family_id: session.familyId,
            user_id: session.userId,
            person_id: session.personId,
          });
          await fence();
          await guard.check();
          await fence();
          return {
            packet,
            items: packet.tasks.map((row) => projectTask(row, packet.scope, packet.collection_revision, ids)),
            fence,
          };
        } catch (error) {
          await fence();
          throw error;
        }
      },
      inherited
    );
  };
  return { read };
}
export function createPlannerTaskHandler(tasks: ReturnType<typeof createPlannerTaskReader>) {
  return async (request: FamilyRequest) => {
    const m = request.pathname.match(/^\/trips\/([^/]+)\/todo(?:\/(.*))?$/);
    if (!m) return NOT_HANDLED;
    if (request.method !== 'GET')
      throw new FamilyApiError(409, 'task_writer_not_cut_over', 'Native task writing is not connected.');
    if (m[2] !== undefined || request.query.size)
      throw new FamilyApiError(422, 'task_read_unavailable', 'Only the complete canonical task list is connected.');
    const result = await tasks.read(m[1], request.signal);
    await result.fence();
    return {
      items: result.items,
      family_task_scope: result.packet.scope,
      collection_revision: result.packet.collection_revision,
      trash_count: result.packet.trash_count,
    };
  };
}

import { z } from 'zod';
import { captureWriteSession } from '../../sync/writeSession';
import { NOT_HANDLED } from './listHandler';
import { locationRpc } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { taskCommand } from './taskContract';
import { createTaskTransport, type TaskRpc } from './taskTransport';
import type { FamilyHandler } from './transport';
export const taskEnvelope = z
  .object({
    version: z.literal(1),
    source_url: z.string().min(1),
    view_layer: z.enum(['published', 'myDraft']),
    command: taskCommand,
  })
  .strict();
export type TaskEnvelope = z.infer<typeof taskEnvelope>;
/** Original checked task commands only. The database rechecks current task capability before receipt replay. */
export function createTaskCommandHandler(
  repo: FamilyFrontendRepository,
  source: () => string,
  disposed: () => boolean,
  rpc: TaskRpc = locationRpc
): FamilyHandler {
  const transport = createTaskTransport(rpc);
  return async (request) => {
    const m = request.pathname.match(/^\/trips\/([^/]+)\/family\/tasks\/commands$/);
    if (!m) return NOT_HANDLED;
    const owner = captureWriteSession(),
      origin = source(),
      actor = repo.captureContext(undefined, { revision: false });
    const check = () => {
      owner.assertCurrent();
      actor.assertCurrent();
      if (disposed() || source() !== origin || request.signal?.aborted)
        throw new FamilyApiError(409, 'task_session_changed', 'The original task session ended.');
    };
    check();
    if (request.method !== 'POST' || request.query.size || request.headers?.['x-base-updated-at'])
      throw new FamilyApiError(400, 'task_command_shape', 'Use an original task command.');
    if (new TextEncoder().encode(JSON.stringify(request.body)).length > 131072)
      throw new FamilyApiError(400, 'task_command_bound', 'Task command exceeds its bound.');
    const result = taskEnvelope.safeParse(request.body);
    if (!result.success) throw new FamilyApiError(400, 'task_command_contract', 'Invalid task command.');
    const p = result.data,
      c = p.command,
      session = await repo.session();
    check();
    const trip = await repo.tripUuid(m[1]);
    check();
    if (
      trip !== c.scope.trip_id ||
      p.source_url !== origin ||
      p.view_layer !== repo.getLayer(trip) ||
      session.userId !== c.scope.user_id ||
      session.familyId !== c.scope.family_id ||
      session.personId !== c.scope.person_id
    )
      throw new FamilyApiError(409, 'task_command_context', 'The original task command belongs to another context.');
    if (request.headers?.['x-idempotency-key'] !== c.operation_id)
      throw new FamilyApiError(400, 'task_retry_identity', 'The original task retry identity is required.');
    const out = await transport.execute(c);
    check();
    const now = await repo.session();
    check();
    if (
      now.userId !== session.userId ||
      now.familyId !== session.familyId ||
      now.personId !== session.personId ||
      repo.getLayer(trip) !== p.view_layer
    )
      throw new FamilyApiError(409, 'task_session_changed', 'The task may have committed in its original account.');
    return out; // Never publish a historical acknowledgement as current state.
  };
}

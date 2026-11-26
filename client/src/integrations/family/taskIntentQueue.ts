import { isAxiosError } from 'axios';
import type { QueuedMutation } from '../../db/offlineDb';
import { MUTATION_SCHEMA_VERSION } from '../../db/offlineDb';
import { captureWriteSession } from '../../sync/writeSession';
import { FamilyApiError } from './repository';
import type { TaskEnvelope } from './taskCommandHandler';
export type TaskWriteSession = ReturnType<typeof captureWriteSession>;
export const taskIntentUrl = (p: TaskEnvelope) => `/trips/${p.command.scope.trip_id}/family/tasks/commands`;
export const taskJson = (p: unknown): string =>
  JSON.stringify(p, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value
  );
function matchesOriginal(row: QueuedMutation, packet: TaskEnvelope) {
  return (
    row.schemaVersion === MUTATION_SCHEMA_VERSION &&
    row.method === 'POST' &&
    row.resource === undefined &&
    row.url === taskIntentUrl(packet) &&
    taskJson(row.body) === taskJson(packet)
  );
}
/** One original task intent per Trip. No temporary IDs, optimistic row cache or automatic rebasing. */
export async function retainTaskIntent(owner: TaskWriteSession, packet: TaskEnvelope, native: number) {
  owner.assertCurrent();
  await owner.db.transaction('rw', owner.db.mutationQueue, async () => {
    owner.assertCurrent();
    const rows = await owner.db.mutationQueue.toArray(),
      id = packet.command.operation_id,
      url = taskIntentUrl(packet);
    if (
      rows.some(
        (row) =>
          row.id !== id && (row.tripId === native || row.url.startsWith(`/trips/${packet.command.scope.trip_id}/`))
      )
    )
      throw new FamilyApiError(
        409,
        'task_older_work',
        'Resolve the older Trip command before submitting another task edit.'
      );
    owner.assertCurrent();
    const existing = rows.find((row) => row.id === id);
    if (existing) {
      if (!matchesOriginal(existing, packet))
        throw new FamilyApiError(409, 'task_queue_changed', 'The retained task command changed.');
      return;
    }
    await owner.db.mutationQueue.add({
      id,
      tripId: native,
      method: 'POST',
      url,
      body: structuredClone(packet),
      retentionPolicy: 'family-original-v1',
      status: 'pending',
      attempts: 0,
      lastError: null,
      schemaVersion: MUTATION_SCHEMA_VERSION,
      buildVersion: typeof __TREK_UI_VERSION__ === 'string' ? __TREK_UI_VERSION__ : '',
      createdAt: rows.reduce((time, row) => Math.max(time, row.createdAt + 1), Date.now()),
    });
    owner.assertCurrent();
  });
  owner.assertCurrent();
}
export async function acknowledgeTaskIntent(
  owner: TaskWriteSession,
  packet: TaskEnvelope,
  expectedRow?: QueuedMutation
) {
  owner.assertCurrent();
  await owner.db.transaction('rw', owner.db.mutationQueue, async () => {
    const row = await owner.db.mutationQueue.get(packet.command.operation_id);
    if (row && (!matchesOriginal(row, packet) || (expectedRow && taskJson(row) !== taskJson(expectedRow))))
      throw new FamilyApiError(409, 'task_queue_changed', 'The retained task command changed.');
    if (row) await owner.db.mutationQueue.delete(row.id);
    owner.assertCurrent();
  });
}
export async function parkTaskRefusal(owner: TaskWriteSession, packet: TaskEnvelope, error: unknown) {
  owner.assertCurrent();
  const status = isAxiosError(error)
    ? error.response?.status
    : error instanceof FamilyApiError
      ? error.status
      : undefined;
  if (!status || status < 400 || status >= 500 || [401, 408, 425, 429].includes(status)) return;
  await owner.db.mutationQueue.update(packet.command.operation_id, {
    status: status === 409 ? 'conflict' : 'failed',
    lastError: 'Original task command refused; retained intact.',
  });
  owner.assertCurrent();
}

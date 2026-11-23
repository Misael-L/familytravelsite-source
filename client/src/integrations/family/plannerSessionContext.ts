import type { QueuedMutation } from '../../db/offlineDb';
import { captureWriteSession } from '../../sync/writeSession';
import type { RetainedPackingEnvelope } from './packingIntentQueue';
import type { FamilyApiError, FamilyFrontendRepository, FamilySession } from './repository';
import type { TaskEnvelope } from './taskCommandHandler';

export type PlannerSessionEnvironment = { source: () => string; current: () => boolean };

export function capturePlannerSessionContext(
  repo: FamilyFrontendRepository,
  trip: string,
  environment: PlannerSessionEnvironment,
  changed: () => FamilyApiError
) {
  const captured = captureWriteSession(),
    context = repo.captureContext(trip, { revision: false }),
    source = environment.source(),
    layer = repo.getLayer(trip),
    ids = repo.knownViews()?.ids,
    native = ids?.register('trip', trip);
  const check = () => {
    captured.assertCurrent();
    context.assertCurrent();
    if (
      !environment.current() ||
      environment.source() !== source ||
      repo.getLayer(trip) !== layer ||
      repo.knownViews()?.ids !== ids ||
      native === undefined
    )
      throw changed();
  };
  const owner = {
    ...captured,
    assertCurrent: check,
    current: () => {
      try {
        check();
        return true;
      } catch {
        return false;
      }
    },
  };
  const checkSession = async (validate: (session: FamilySession) => void) => {
    check();
    const session = await repo.session();
    check();
    validate(session);
    return session;
  };
  return { owner, check, changed, source, layer, native, checkSession };
}

type RecoveryPacket = RetainedPackingEnvelope | TaskEnvelope;

export function capturePlannerRecoveryChecks(
  { owner, check, changed, source, layer, native, checkSession }: ReturnType<typeof capturePlannerSessionContext>,
  trip: string,
  serialize: (value: unknown) => string
) {
  const fence = (packet?: RecoveryPacket) =>
    checkSession((session) => {
      if (
        packet &&
        (packet.source_url !== source ||
          packet.view_layer !== layer ||
          packet.command.scope.trip_id !== trip ||
          packet.command.scope.user_id !== session.userId ||
          packet.command.scope.person_id !== session.personId ||
          packet.command.scope.family_id !== session.familyId)
      )
        throw changed();
    });
  const affects = (row: QueuedMutation) =>
    !Number.isSafeInteger(row.tripId) ||
    row.tripId === 0 ||
    typeof row.url !== 'string' ||
    row.tripId === native ||
    [trip, String(native)].includes(row.url.match(/^\/trips\/([^/]+)(?:\/|$)/)?.[1] ?? '');
  const original = async (row: QueuedMutation) => {
    const rows = (await owner.db.mutationQueue.toArray()).filter(affects);
    check();
    // Pin the complete observed row, not a newer row with the same operation ID.
    if (rows.length !== 1 || serialize(rows[0]) !== serialize(row)) throw changed();
  };
  return { fence, affects, original };
}

export function belongsToPlannerRecoverySession(
  packet: RecoveryPacket,
  trip: string,
  source: string,
  layer: string,
  session: FamilySession
) {
  const scope = packet.command.scope;
  return (
    packet.source_url === source &&
    packet.view_layer === layer &&
    scope.trip_id === trip &&
    scope.user_id === session.userId &&
    scope.family_id === session.familyId &&
    scope.person_id === session.personId
  );
}

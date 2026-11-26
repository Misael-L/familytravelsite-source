import { useTripStore } from '../../store/tripStore';
import { captureWriteSession } from '../../sync/writeSession';
import { NOT_HANDLED } from './listHandler';
import type { PackingScope } from './packingContract';
import type { RetainedPackingEnvelope } from './packingIntentQueue';
import type { FamilySession } from './repository';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyHandler, FamilyRequest } from './transport';

type QualifiedPackingProtocol<Packet> = {
  path: RegExp;
  maxBytes: number;
  safeParse(body: unknown): { success: true; data: Packet } | { success: false };
  transport: { execute(packet: Packet): Promise<unknown> };
  checkDomain?(match: RegExpMatchArray, packet: Packet): void;
};

function sameActor(session: FamilySession, scope: PackingScope) {
  return (
    session.userId === scope.user_id && session.familyId === scope.family_id && session.personId === scope.person_id
  );
}
function parseRequest<Packet>(request: FamilyRequest, protocol: QualifiedPackingProtocol<Packet>): Packet {
  if (request.method !== 'POST' || request.query.size || request.headers?.['x-base-updated-at'])
    throw new FamilyApiError(400, 'packing_command_shape', 'Use an original packing command.');
  const text = JSON.stringify(request.body);
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > protocol.maxBytes)
    throw new FamilyApiError(400, 'packing_command_bound', 'Packing command exceeds its bound.');
  const parsed = protocol.safeParse(request.body);
  if (!parsed.success) throw new FamilyApiError(400, 'packing_command_contract', 'Invalid packing command.');
  return parsed.data;
}
/** Qualified versioned path only; never calls raw packing writers, defaults, sharing or templates. */
export function createQualifiedPackingCommandHandler<Packet extends RetainedPackingEnvelope>(
  repo: FamilyFrontendRepository,
  source: () => string,
  disposed: () => boolean,
  protocol: QualifiedPackingProtocol<Packet>
): FamilyHandler {
  return async (request) => {
    const m = request.pathname.match(protocol.path);
    if (!m) return NOT_HANDLED;
    const owner = captureWriteSession(),
      origin = source(),
      actor = repo.captureContext(undefined, { revision: false }),
      openingTrip = useTripStore.getState().trip?.id;
    const check = () => {
      owner.assertCurrent();
      actor.assertCurrent();
      if (
        disposed() ||
        source() !== origin ||
        request.signal?.aborted ||
        useTripStore.getState().trip?.id !== openingTrip
      )
        throw new FamilyApiError(409, 'packing_session_changed', 'The original packing session ended.');
    };
    check();
    const p = parseRequest(request, protocol),
      c = p.command,
      session = await repo.session();
    check();
    protocol.checkDomain?.(m, p);
    const trip = await repo.tripUuid(m[1]);
    check();
    if (
      trip !== c.scope.trip_id ||
      (openingTrip !== undefined && String(openingTrip) !== String(repo.knownViews()?.ids.register('trip', trip))) ||
      p.source_url !== origin ||
      p.view_layer !== repo.getLayer(trip) ||
      !sameActor(session, c.scope)
    )
      throw new FamilyApiError(
        409,
        'packing_command_context',
        'The original packing command belongs to another context.'
      );
    if (request.headers?.['x-idempotency-key'] !== c.operation_id)
      throw new FamilyApiError(400, 'packing_retry_identity', 'The original packing retry identity is required.');
    const out = await protocol.transport.execute(p);
    check();
    const now = await repo.session();
    check();
    if (
      now.userId !== session.userId ||
      now.familyId !== session.familyId ||
      now.personId !== session.personId ||
      repo.getLayer(trip) !== p.view_layer
    )
      throw new FamilyApiError(409, 'packing_session_changed', 'Packing may have committed in its original account.');
    return out; // Historical proof only. Readers remain the only current-state source.
  };
}

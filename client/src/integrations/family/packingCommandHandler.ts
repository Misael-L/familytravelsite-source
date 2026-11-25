import { captureWriteSession } from '../../sync/writeSession';
import { NOT_HANDLED } from './listHandler';
import { packingEnvelope } from './packingCommandContract';
import { createPackingCommandTransport, type PackingCommandRpc } from './packingCommandTransport';
import type { PackingScope } from './packingContract';
import type { FamilySession } from './repository';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyHandler } from './transport';

function sameActor(session: FamilySession, scope: PackingScope) {
  return (
    session.userId === scope.user_id && session.familyId === scope.family_id && session.personId === scope.person_id
  );
}
/** Qualified versioned path only; never calls raw packing writers, defaults, sharing or templates. */
export function createPackingCommandHandler(
  repo: FamilyFrontendRepository,
  source: () => string,
  disposed: () => boolean,
  rpc?: PackingCommandRpc
): FamilyHandler {
  const transport = createPackingCommandTransport(rpc);
  return async (request) => {
    const m = request.pathname.match(/^\/trips\/([^/]+)\/family\/packing\/commands$/);
    if (!m) return NOT_HANDLED;
    const owner = captureWriteSession(),
      origin = source(),
      actor = repo.captureContext(undefined, { revision: false });
    const check = () => {
      owner.assertCurrent();
      actor.assertCurrent();
      if (disposed() || source() !== origin || request.signal?.aborted)
        throw new FamilyApiError(409, 'packing_session_changed', 'The original packing session ended.');
    };
    check();
    if (request.method !== 'POST' || request.query.size || request.headers?.['x-base-updated-at'])
      throw new FamilyApiError(400, 'packing_command_shape', 'Use an original packing command.');
    const text = JSON.stringify(request.body);
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 131072)
      throw new FamilyApiError(400, 'packing_command_bound', 'Packing command exceeds its bound.');
    const parsed = packingEnvelope.safeParse(request.body);
    if (!parsed.success) throw new FamilyApiError(400, 'packing_command_contract', 'Invalid packing command.');
    const p = parsed.data,
      c = p.command,
      session = await repo.session();
    check();
    const trip = await repo.tripUuid(m[1]);
    check();
    if (
      trip !== c.scope.trip_id ||
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
      throw new FamilyApiError(409, 'packing_session_changed', 'Packing may have committed in its original account.');
    return out; // Historical proof only. Readers remain the only current-state source.
  };
}

import { packingGroupEnvelope } from './packingGroupContract';
import { createPackingGroupTransport, type PackingGroupRpc } from './packingGroupTransport';
import { createQualifiedPackingCommandHandler } from './qualifiedPackingCommandHandler';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyHandler } from './transport';

/** Qualified versioned path only; never calls raw packing writers, defaults, sharing or templates. */
export function createPackingGroupCommandHandler(
  repo: FamilyFrontendRepository,
  source: () => string,
  disposed: () => boolean,
  rpc?: PackingGroupRpc
): FamilyHandler {
  return createQualifiedPackingCommandHandler(repo, source, disposed, {
    path: /^\/trips\/([^/]+)\/family\/packing\/group-commands$/,
    maxBytes: 8388608,
    safeParse: (body) => packingGroupEnvelope.safeParse(body),
    transport: createPackingGroupTransport(rpc),
  });
}

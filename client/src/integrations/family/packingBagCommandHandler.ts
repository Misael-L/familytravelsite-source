import { packingBagEnvelope } from './packingBagContract';
import { createPackingBagTransport, type PackingBagRpc } from './packingBagTransport';
import { createQualifiedPackingCommandHandler } from './qualifiedPackingCommandHandler';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyHandler } from './transport';

/** Qualified versioned path only; never calls raw packing writers, defaults, sharing or templates. */
export function createPackingBagCommandHandler(
  repo: FamilyFrontendRepository,
  source: () => string,
  disposed: () => boolean,
  rpc?: PackingBagRpc
): FamilyHandler {
  return createQualifiedPackingCommandHandler(repo, source, disposed, {
    path: /^\/trips\/([^/]+)\/family\/packing\/(bag-commands)$/,
    maxBytes: 1048576,
    safeParse: (body) => packingBagEnvelope.safeParse(body),
    transport: createPackingBagTransport(rpc),
  });
}

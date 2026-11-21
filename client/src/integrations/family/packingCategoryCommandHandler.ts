import { packingCategoryEnvelope } from './packingCategoryContract';
import { createPackingCategoryTransport, type PackingCategoryRpc } from './packingCategoryTransport';
import { createQualifiedPackingCommandHandler } from './qualifiedPackingCommandHandler';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyHandler } from './transport';

/** Qualified versioned path only; never calls raw packing writers, defaults, sharing or templates. */
export function createPackingCategoryCommandHandler(
  repo: FamilyFrontendRepository,
  source: () => string,
  disposed: () => boolean,
  rpc?: PackingCategoryRpc
): FamilyHandler {
  return createQualifiedPackingCommandHandler(repo, source, disposed, {
    path: /^\/trips\/([^/]+)\/family\/packing\/category-commands$/,
    maxBytes: 8388608,
    safeParse: (body) => packingCategoryEnvelope.safeParse(body),
    transport: createPackingCategoryTransport(rpc),
  });
}

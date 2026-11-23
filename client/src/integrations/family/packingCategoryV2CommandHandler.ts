import { packingCategoryV2Envelope } from './packingCategoryV2Contract';
import { createPackingCategoryV2Transport, type PackingCategoryV2Rpc } from './packingCategoryV2Transport';
import { createQualifiedPackingCommandHandler } from './qualifiedPackingCommandHandler';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyHandler } from './transport';

/** Qualified versioned path only; never calls raw packing writers, defaults, sharing or templates. */
export function createPackingCategoryV2CommandHandler(
  repo: FamilyFrontendRepository,
  source: () => string,
  disposed: () => boolean,
  rpc?: PackingCategoryV2Rpc
): FamilyHandler {
  return createQualifiedPackingCommandHandler(repo, source, disposed, {
    path: /^\/trips\/([^/]+)\/family\/packing\/(category-lifecycle-v2|category-items-v2)$/,
    maxBytes: 8388608,
    safeParse: (body) => packingCategoryV2Envelope.safeParse(body),
    transport: createPackingCategoryV2Transport(rpc),
    checkDomain(match, packet) {
      if ((match[2] === 'category-lifecycle-v2') !== (packet.command.kind === 'packing-category-lifecycle'))
        throw new FamilyApiError(400, 'packing_v2_domain', 'Use the original command domain.');
    },
  });
}

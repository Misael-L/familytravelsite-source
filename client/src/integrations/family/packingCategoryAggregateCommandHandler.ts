import { packingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import {
  createPackingCategoryAggregateTransport,
  type PackingCategoryAggregateRpc,
} from './packingCategoryAggregateTransport';
import { createQualifiedPackingCommandHandler } from './qualifiedPackingCommandHandler';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyHandler } from './transport';

/** Qualified versioned path only; never calls raw packing writers, defaults, sharing or templates. */
export function createPackingCategoryAggregateCommandHandler(
  repo: FamilyFrontendRepository,
  source: () => string,
  disposed: () => boolean,
  rpc?: PackingCategoryAggregateRpc
): FamilyHandler {
  return createQualifiedPackingCommandHandler(repo, source, disposed, {
    path: /^\/trips\/([^/]+)\/family\/packing\/(category-aggregate-v3)$/,
    maxBytes: 8388608,
    safeParse: (body) => packingCategoryAggregateEnvelope.safeParse(body),
    transport: createPackingCategoryAggregateTransport(rpc),
  });
}

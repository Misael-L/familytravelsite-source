import {
  packingCategoryAggregateEnvelope,
  type PackingCategoryAggregateAck,
  type PackingCategoryAggregateEnvelope,
} from './packingCategoryAggregateContract';
import {
  checkPackingCategoryAggregateAcknowledgement,
  createPackingCategoryAggregateTransport,
} from './packingCategoryAggregateTransport';
import type { FamilyFrontendRepository } from './repository';
import { RetainedPackingCommandSession, type PackingEditorEnvironment } from './retainedPackingCommandSession';

export class PackingCategoryAggregateCommandSession extends RetainedPackingCommandSession<
  PackingCategoryAggregateEnvelope,
  PackingCategoryAggregateAck
> {
  constructor(
    repo: FamilyFrontendRepository,
    environment: PackingEditorEnvironment,
    original: PackingCategoryAggregateEnvelope,
    reads = createPackingCategoryAggregateTransport()
  ) {
    super(
      repo,
      environment,
      original,
      {
        parse: (packet) => packingCategoryAggregateEnvelope.parse(packet),
        reads,
        checkAcknowledgement: checkPackingCategoryAggregateAcknowledgement,
      },
      () => environment.current?.()
    );
  }
}

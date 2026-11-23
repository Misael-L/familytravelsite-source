import {
  packingCategoryEnvelope,
  type PackingCategoryAck,
  type PackingCategoryEnvelope,
} from './packingCategoryContract';
import { checkPackingCategoryAcknowledgement, createPackingCategoryTransport } from './packingCategoryTransport';
import type { FamilyFrontendRepository } from './repository';
import { RetainedPackingCommandSession, type PackingCommandEnvironment } from './retainedPackingCommandSession';

export class PackingCategoryCommandSession extends RetainedPackingCommandSession<
  PackingCategoryEnvelope,
  PackingCategoryAck
> {
  constructor(
    repo: FamilyFrontendRepository,
    environment: PackingCommandEnvironment,
    original: PackingCategoryEnvelope,
    reads = createPackingCategoryTransport()
  ) {
    super(repo, environment, original, {
      parse: (packet) => packingCategoryEnvelope.parse(packet),
      reads,
      checkAcknowledgement: checkPackingCategoryAcknowledgement,
    });
  }
}

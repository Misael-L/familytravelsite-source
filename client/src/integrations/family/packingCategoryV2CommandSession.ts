import {
  packingCategoryV2Envelope,
  type PackingCategoryV2Ack,
  type PackingCategoryV2Envelope,
} from './packingCategoryV2Contract';
import { checkPackingCategoryV2Acknowledgement, createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import type { FamilyFrontendRepository } from './repository';
import { RetainedPackingCommandSession, type PackingCommandEnvironment } from './retainedPackingCommandSession';

export class PackingCategoryV2CommandSession extends RetainedPackingCommandSession<
  PackingCategoryV2Envelope,
  PackingCategoryV2Ack
> {
  constructor(
    repo: FamilyFrontendRepository,
    environment: PackingCommandEnvironment,
    original: PackingCategoryV2Envelope,
    reads = createPackingCategoryV2Transport()
  ) {
    super(repo, environment, original, {
      parse: (packet) => packingCategoryV2Envelope.parse(packet),
      reads,
      checkAcknowledgement: checkPackingCategoryV2Acknowledgement,
    });
  }
}

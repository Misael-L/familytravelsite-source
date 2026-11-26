import { packingGroupEnvelope, type PackingGroupAck, type PackingGroupEnvelope } from './packingGroupContract';
import { checkPackingGroupAcknowledgement, createPackingGroupTransport } from './packingGroupTransport';
import type { FamilyFrontendRepository } from './repository';
import { RetainedPackingCommandSession, type PackingCommandEnvironment } from './retainedPackingCommandSession';

export class PackingGroupCommandSession extends RetainedPackingCommandSession<PackingGroupEnvelope, PackingGroupAck> {
  constructor(
    repo: FamilyFrontendRepository,
    environment: PackingCommandEnvironment,
    original: PackingGroupEnvelope,
    reads = createPackingGroupTransport()
  ) {
    super(repo, environment, original, {
      parse: (packet) => packingGroupEnvelope.parse(packet),
      reads,
      checkAcknowledgement: checkPackingGroupAcknowledgement,
    });
  }
}

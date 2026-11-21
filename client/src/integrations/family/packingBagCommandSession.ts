import { packingBagEnvelope, type PackingBagAck, type PackingBagEnvelope } from './packingBagContract';
import { checkPackingBagAcknowledgement, createPackingBagTransport } from './packingBagTransport';
import type { FamilyFrontendRepository } from './repository';
import { RetainedPackingCommandSession, type PackingEditorEnvironment } from './retainedPackingCommandSession';

export class PackingBagCommandSession extends RetainedPackingCommandSession<PackingBagEnvelope, PackingBagAck> {
  constructor(
    repo: FamilyFrontendRepository,
    environment: PackingEditorEnvironment,
    original: PackingBagEnvelope,
    reads = createPackingBagTransport()
  ) {
    super(
      repo,
      environment,
      original,
      {
        parse: (packet) => packingBagEnvelope.parse(packet),
        reads,
        checkAcknowledgement: checkPackingBagAcknowledgement,
      },
      () => environment.current?.()
    );
  }
}

import type { PackingCommandEnvironment } from './packingCommandContext';
import { packingEnvelope, type PackingEnvelope } from './packingCommandContract';
import { checkPackingAcknowledgement } from './packingCommandTransport';
import type { PackingAck } from './packingContract';
import { createPackingTransport } from './packingTransport';
import type { FamilyFrontendRepository } from './repository';
import { RetainedPackingCommandSession } from './retainedPackingCommandSession';

/** One immutable, already observed intent. Does not bind forms, allocate identities or publish UI/cache state. */
export class PackingCommandSession extends RetainedPackingCommandSession<PackingEnvelope, PackingAck> {
  constructor(
    repo: FamilyFrontendRepository,
    environment: PackingCommandEnvironment,
    original: PackingEnvelope,
    reads = createPackingTransport()
  ) {
    super(repo, environment, original, {
      parse: (packet) => packingEnvelope.parse(packet),
      checkAcknowledgement: (value, packet) => checkPackingAcknowledgement(value, packet.command),
      reads: {
        receipt: (packet) => reads.receipt(packet.command.scope, packet.command.operation_id),
      },
    });
  }
}

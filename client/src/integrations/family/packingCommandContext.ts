import { useTripStore } from '../../store/tripStore';
import { captureWriteSession } from '../../sync/writeSession';
import type { FamilyIdentityRegistry } from './identity';
import type { RetainedPackingEnvelope } from './packingIntentQueue';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

export type PackingCommandEnvironment = { source: () => string; disposed: () => boolean };

/** Holds the owner, Trip and optional editor checks for one parsed packing command. */
export class PackingCommandContext<Packet extends RetainedPackingEnvelope> {
  protected readonly packet: Packet;
  protected readonly owner = captureWriteSession();
  private context: ReturnType<FamilyFrontendRepository['captureContext']>;
  private ids: FamilyIdentityRegistry;
  protected readonly native: number;

  constructor(
    private repo: FamilyFrontendRepository,
    private environment: PackingCommandEnvironment,
    original: Packet,
    parse: (original: Packet) => Packet,
    private editorCurrent?: () => boolean | undefined
  ) {
    this.packet = parse(original);
    this.context = repo.captureContext(this.packet.command.scope.trip_id, { revision: false });
    const ids = repo.knownViews()?.ids;
    if (!ids) throw this.changed();
    this.ids = ids;
    this.native = this.ids.register('trip', this.packet.command.scope.trip_id);
    this.check();
  }
  protected changed() {
    return new FamilyApiError(409, 'packing_session_changed', 'The original packing command session ended.');
  }
  protected check() {
    this.owner.assertCurrent();
    this.context.assertCurrent();
    if (
      this.environment.disposed() ||
      this.editorCurrent?.() === false ||
      this.environment.source() !== this.packet.source_url ||
      this.ids !== this.repo.knownViews()?.ids ||
      this.repo.getLayer(this.packet.command.scope.trip_id) !== this.packet.view_layer ||
      String(useTripStore.getState().trip?.id) !== String(this.native)
    )
      throw this.changed();
  }
  protected async fence() {
    this.check();
    const now = await this.repo.session(),
      s = this.packet.command.scope;
    this.check();
    if (now.userId !== s.user_id || now.familyId !== s.family_id || now.personId !== s.person_id) throw this.changed();
  }
}

import { isAxiosError } from 'axios';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import type { GovernanceIntent, GovernanceRead } from '../../repo/plannerGovernancePort';
import { useTripStore } from '../../store/tripStore';
import { mutationQueue } from '../../sync/mutationQueue';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { checkedGovernance, governanceReceipt, type GovernanceCommand } from './governanceContract';
import { bookingJson } from './nativeBookingDetails';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
export class PlannerCohortGovernance {
  private epoch = 0;
  private pending: { key: string; packet: GovernanceCommand } | null = null;
  private flights = new Map<string, Promise<void>>();
  constructor(
    private repo: FamilyFrontendRepository,
    private options: {
      source: () => string;
      disposed: () => boolean;
      hydrate: (trip: string) => Promise<void>;
      changeLayer: (trip: string, layer: 'published' | 'myDraft') => Promise<void>;
    }
  ) {}
  reset() {
    this.epoch++;
    this.pending = null;
  }
  private async capture(value: string) {
    const session = await this.repo.session(),
      ids = (await this.repo.views()).ids,
      trip = await this.repo.tripUuid(value),
      source = this.options.source(),
      epoch = this.epoch;
    const scope = {
      version: 1 as const,
      trip_id: trip,
      family_id: session.familyId,
      user_id: session.userId,
      person_id: session.personId,
      layer: this.repo.getLayer(trip),
    };
    const fence = async () => {
      const s = await this.repo.session();
      if (
        this.options.disposed() ||
        this.epoch !== epoch ||
        source !== this.options.source() ||
        ids !== (await this.repo.views()).ids ||
        s.userId !== scope.user_id ||
        s.familyId !== scope.family_id ||
        s.personId !== scope.person_id ||
        this.repo.getLayer(trip) !== scope.layer ||
        String(useTripStore.getState().trip?.id) !== String(ids.register('trip', trip))
      )
        throw new FamilyApiError(409, 'governance_changed', 'The original governance session changed.');
    };
    await fence();
    return { scope, source, trip, ids, fence };
  }
  async read(trip: string) {
    if (isEffectivelyOffline()) throw new FamilyApiError(503, 'governance_offline', 'Reconnect to inspect governance.');
    const c = await this.capture(trip),
      raw = (await api.get(`/trips/${c.trip}/family/governance`)).data;
    await c.fence();
    return { ...checkedGovernance(raw, c.scope), source_url: c.source };
  }
  async setLayer(trip: string, layer: 'published' | 'myDraft') {
    const c = await this.capture(trip);
    if (this.pending)
      throw new FamilyApiError(
        409,
        'governance_pending',
        'Resolve the retained original governance command before changing layer.'
      );
    await c.fence();
    this.repo.setLayer(c.trip, layer);
    await this.options.changeLayer(c.trip, layer);
  }
  async execute(trip: string, intent: GovernanceIntent, context: GovernanceRead) {
    const { action, target, observation, parameters } = intent;
    const c = await this.capture(trip);
    if (isEffectivelyOffline())
      throw new FamilyApiError(503, 'governance_offline', 'Reconnect before creating a governance command.');
    if (context.source_url !== c.source || bookingJson(context.scope) !== bookingJson(c.scope))
      throw new FamilyApiError(409, 'governance_context', 'The original confirmation belongs to another session.');
    const key = bookingJson({ scope: c.scope, source: c.source, action, target, parameters, observation });
    if (this.pending && this.pending.key !== key)
      throw new FamilyApiError(
        409,
        'governance_pending',
        'The original governance command is retained; changed intent cannot replace it.'
      );
    if (!this.pending)
      this.pending = {
        key,
        packet: {
          version: 1,
          operation_id: crypto.randomUUID(),
          source_url: c.source,
          scope: c.scope,
          action,
          target_id: target,
          observation: structuredClone(observation),
          parameters: structuredClone(parameters),
        },
      };
    const packet = this.pending.packet,
      url = `/trips/${c.trip}/family/governance/commands`;
    const existing = this.flights.get(packet.operation_id);
    if (existing !== undefined) return existing;
    const run = async () => {
      await c.fence();
      await retain(packet, url, c.ids.register('trip', c.trip));
      await c.fence();
      try {
        const out = governanceReceipt.parse(
          (await api.post(url, packet, { headers: { 'X-Idempotency-Key': packet.operation_id } })).data
        );
        if (
          out.operation_id !== packet.operation_id ||
          out.target_id !== packet.target_id ||
          out.action !== packet.action ||
          out.trip_id !== c.trip
        )
          throw new FamilyApiError(502, 'governance_receipt', 'Another governance acknowledgement was returned.');
      } catch (error) {
        await c.fence();
        const status = isAxiosError(error) ? error.response?.status : undefined;
        if (status && status >= 400 && status < 500 && ![408, 429].includes(status))
          await offlineDb.mutationQueue.update(packet.operation_id, {
            status: status === 409 ? 'conflict' : 'failed',
            lastError: 'Original governance command refused; retained intact.',
          });
        throw error;
      }
      await c.fence();
      await offlineDb.transaction('rw', offlineDb.mutationQueue, async () => {
        const row = await offlineDb.mutationQueue.get(packet.operation_id);
        if (row && bookingJson(row.body) !== bookingJson(packet))
          throw new FamilyApiError(409, 'governance_queue', 'Retained command changed.');
        if (row) await offlineDb.mutationQueue.delete(packet.operation_id);
      });
      try {
        await this.options.hydrate(c.trip);
      } catch {
        await c.fence();
        throw new FamilyApiError(
          409,
          'governance_refresh',
          'The command committed, but the planner could not refresh. Retry the original command.'
        );
      }
      await c.fence();
      this.pending = null;
    };
    const flight = run();
    this.flights.set(packet.operation_id, flight);
    try {
      await flight;
    } finally {
      if (this.flights.get(packet.operation_id) === flight) this.flights.delete(packet.operation_id);
    }
  }
}
async function retain(packet: GovernanceCommand, url: string, tripId: number) {
  await offlineDb.transaction('rw', offlineDb.mutationQueue, async () => {
    const rows = await offlineDb.mutationQueue.toArray(),
      prefixes = [`/trips/${packet.scope.trip_id}/`, `/trips/${tripId}/`];
    if (rows.some((r) => r.id !== packet.operation_id && prefixes.some((p) => r.url.startsWith(p))))
      throw new FamilyApiError(409, 'governance_older_work', 'Resolve the older retained Trip command first.');
    const prior = rows.find((r) => r.id === packet.operation_id);
    if (prior) {
      if (prior.url !== url || bookingJson(prior.body) !== bookingJson(packet))
        throw new FamilyApiError(409, 'governance_queue', 'Original retained command changed.');
      return;
    }
    await mutationQueue.enqueue({
      id: packet.operation_id,
      tripId,
      method: 'POST',
      url,
      body: packet,
      retentionPolicy: 'family-original-v1',
    });
  });
}

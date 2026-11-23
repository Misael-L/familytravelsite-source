import { isAxiosError } from 'axios';
import { offlineDb } from '../../db/offlineDb';
import type { PlannerBookingRequest, PlannerBookingSession } from '../../repo/plannerBookingPort';
import { useTripStore } from '../../store/tripStore';
import { mutationQueue } from '../../sync/mutationQueue';
import { isEffectivelyOffline } from '../../sync/networkMode';
import type { Reservation } from '../../types';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { bookingJson } from './nativeBookingDetails';
import { openObservedBookingEditor } from './observedBookingEditor';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

export class PlannerCohortBookings {
  private epoch = 0;
  private sessions = new Set<() => void>();
  constructor(
    private repo: FamilyFrontendRepository,
    private hydrate: (trip: number | string) => Promise<void>,
    private disposed: () => boolean,
    private source: () => string = getSupabaseUrl
  ) {}
  reset() {
    this.epoch++;
    for (const close of this.sessions) close();
    this.sessions.clear();
  }
  async open(request: PlannerBookingRequest): Promise<PlannerBookingSession> {
    const original = request.original;
    if (!original)
      throw new FamilyApiError(
        409,
        'booking_create_pending',
        'Creating bookings is not available in this planner session yet.'
      );
    const captured = structuredClone({ ...request, original }),
      epoch = this.epoch,
      source = this.source(),
      session = await this.repo.session(),
      ids = (await this.repo.views()).ids,
      trip = await this.repo.tripUuid(captured.tripId),
      layer = this.repo.getLayer(trip);
    let closed = false;
    const fence = async () => {
      const now = await this.repo.session();
      if (
        closed ||
        this.disposed() ||
        epoch !== this.epoch ||
        source !== this.source() ||
        layer !== 'published' ||
        this.repo.getLayer(trip) !== layer ||
        ids !== (await this.repo.views()).ids ||
        now.userId !== session.userId ||
        now.familyId !== session.familyId ||
        now.personId !== session.personId ||
        String(useTripStore.getState().trip?.id) !== String(ids.register('trip', trip))
      )
        throw new FamilyApiError(
          409,
          'booking_editor_changed',
          'The original booking session changed. Open the form again.'
        );
    };
    await fence();
    const observed = await openObservedBookingEditor(this.repo, trip, captured.original, captured);
    try {
      await fence();
    } catch (error) {
      observed.close();
      throw error;
    }
    const close = () => {
      closed = true;
      observed.close();
      this.sessions.delete(close);
    };
    this.sessions.add(close);
    let inFlight: Promise<Reservation> | null = null;
    return {
      close,
      save: async (data, effects) => {
        await fence();
        if (isEffectivelyOffline())
          throw new FamilyApiError(
            503,
            'booking_save_offline',
            'Reconnect before saving this booking. Your edits are still here.'
          );
        const command = await observed.prepare(data, effects);
        if (inFlight !== null) return inFlight;
        const execute = async () => {
          await fence();
          await retainBookingIntent(command, ids.register('trip', trip));
          await fence();
          try {
            await observed.save(data, effects);
          } catch (error) {
            await parkKnownBookingRefusal(command, error);
            throw error;
          }
          await fence();
          await acknowledgeBookingIntent(command);
          try {
            await this.hydrate(trip);
          } catch {
            // Fresh coherent read, never an historical acknowledgement row.
            await fence();
            throw new FamilyApiError(
              409,
              'booking_refresh',
              'The booking was saved, but its details could not be refreshed. Retry the original save to refresh them.'
            );
          }
          await fence();
          const saved = useTripStore.getState().reservations.find((r) => r.id === captured.original.id);
          if (!saved)
            throw new FamilyApiError(
              409,
              'booking_refresh',
              'The saved booking could not be refreshed. Retry the original save.'
            );
          return structuredClone(saved);
        };
        inFlight = execute();
        try {
          return await inFlight;
        } finally {
          inFlight = null;
        }
      },
    };
  }
}

type RetainedIntent = Awaited<ReturnType<Awaited<ReturnType<typeof openObservedBookingEditor>>['prepare']>>;
async function retainBookingIntent(command: RetainedIntent, tripId: number) {
  await offlineDb.transaction('rw', offlineDb.mutationQueue, async () => {
    const rows = await offlineDb.mutationQueue.toArray();
    const roots = [command.packet.scope.trip_id, String(tripId)].map((key) => '/trips/' + key + '/');
    if (
      rows.some(
        (row) =>
          row.id !== command.packet.operation_id &&
          roots.some(
            (root) => row.url.startsWith(root + 'reservations') || row.url.startsWith(root + 'family/booking-details/')
          )
      )
    )
      throw new FamilyApiError(
        409,
        'booking_pending_intent',
        'Resolve the older booking save before submitting another edit.'
      );
    const prior = rows.find((row) => row.id === command.packet.operation_id);
    if (prior) {
      if (prior.url !== command.url || bookingJson(prior.body) !== bookingJson(command.packet))
        throw new FamilyApiError(
          409,
          'booking_queue_changed',
          'The retained booking save changed. Resolve it before retrying.'
        );
      return;
    }
    await mutationQueue.enqueue({
      id: command.packet.operation_id,
      tripId,
      method: 'POST',
      url: command.url,
      body: command.packet,
    });
  });
}
async function acknowledgeBookingIntent(command: RetainedIntent) {
  await offlineDb.transaction('rw', offlineDb.mutationQueue, async () => {
    const prior = await offlineDb.mutationQueue.get(command.packet.operation_id);
    if (!prior) return; // The ordinary queue may already have acknowledged the same original intent.
    if (prior.url !== command.url || bookingJson(prior.body) !== bookingJson(command.packet))
      throw new FamilyApiError(
        409,
        'booking_queue_changed',
        'The retained booking save changed after acknowledgement.'
      );
    await offlineDb.mutationQueue.delete(command.packet.operation_id);
  });
}

async function parkKnownBookingRefusal(command: RetainedIntent, error: unknown) {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (!status || status < 400 || status >= 500 || status === 408 || status === 429) return;
  await offlineDb.transaction('rw', offlineDb.mutationQueue, async () => {
    const prior = await offlineDb.mutationQueue.get(command.packet.operation_id);
    if (prior?.url === command.url && bookingJson(prior.body) === bookingJson(command.packet))
      await offlineDb.mutationQueue.update(prior.id, {
        status: status === 409 ? 'conflict' : 'failed',
        lastError: error instanceof Error ? error.message : 'Booking save refused',
      });
  });
}

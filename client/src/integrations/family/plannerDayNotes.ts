import { holdPlannerRealtime } from './plannerRealtimeHold';
import type { DayNoteCreateRequest, DayNoteUpdateRequest } from '@trek/shared';
import { captureFamilyActor } from './actorContext';
import type { PlannerDayNotePort } from '../../repo/plannerDayNotePort';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import type { DayNote } from '../../types';
import { refuseOlderQueue } from './plannerCohortEditor';
import { locationRpc } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

type Pending = { input: string; operation: string; actor: ReturnType<typeof captureFamilyActor> };
/** Notes retain their original day UUID, edit timestamp and operation across retries. */
export class PlannerDayNotes implements PlannerDayNotePort {
  private epoch = 0;
  private pending = new Map<string, Pending>();
  constructor(private repo: FamilyFrontendRepository, private hydrate: (trip: number | string) => Promise<void>) {}
  reset() { this.epoch++; this.pending.clear(); }
  async create(trip: number | string, day: number, data: DayNoteCreateRequest) {
    return this.save(trip, day, undefined, data);
  }
  async update(trip: number | string, day: number, before: DayNote, data: DayNoteUpdateRequest) {
    return this.save(trip, day, before, data);
  }
  async delete(trip: number | string, day: number, id: number) {
    const before = useTripStore.getState().dayNotes[String(day)]?.find((n) => n.id === id);
    if (!before) throw new FamilyApiError(409, 'note_changed', 'Reload the original note before removing it.');
    await this.mutate(trip, day, before, null);
  }
  async move(trip: number | string, day: number, before: DayNote, order: number) {
    return this.save(trip, day, before, { sort_order: order });
  }
  private async save(trip: number | string, day: number, before: DayNote | undefined,
    data: DayNoteCreateRequest | DayNoteUpdateRequest): Promise<{ note: DayNote }> {
    const value = { ...before, ...data };
    const id = await this.mutate(trip, day, before, {
      p_detail: value.time || null, p_color: value.color ?? null,
      p_body: value.text ?? '', p_icon: value.icon ?? null, p_sort_order: value.sort_order ?? 0,
    });
    const note = useTripStore.getState().dayNotes[String(day)]?.find((n) => n.id === id);
    if (!note) throw new FamilyApiError(409, 'note_refresh', 'Saved note is not visible. Retry the same save.');
    return { note };
  }
  private async mutate(tripValue: number | string, dayValue: number, before: DayNote | undefined,
    fields: { p_body: string; p_icon: string | null; p_sort_order: number; p_detail: string | null; p_color: string | null } | null) {
    if (isEffectivelyOffline())
      throw new FamilyApiError(409, 'note_offline', 'Day notes need a connection; offline changes are not cut over.');
    const epoch = this.epoch;
    const shown = useTripStore.getState(), session = await this.repo.session(), ids = (await this.repo.views()).ids;
    const trip = await this.repo.tripUuid(tripValue), day = ids.uuid('day', dayValue);
    if (this.repo.getLayer(trip) !== 'published')
      throw new FamilyApiError(409, 'note_layer', 'Choose the published planner before editing a day note.');
    const metadata = (before as DayNote & { family_note?: { id: string; updated_at: string; trip_day_id?: string } })?.family_note;
    if (before && (!metadata || metadata.id !== ids.uuid('note', before.id) || metadata.trip_day_id !== ids.uuid('day', before.day_id)))
      throw new FamilyApiError(409, 'note_observation', 'Reload the original note before editing it.');
    if (!shown.days.some((d) => d.id === dayValue) || String(shown.trip?.id) !== String(ids.register('trip', trip)))
      throw new FamilyApiError(409, 'note_trip', 'The original itinerary changed. Reopen the note.');
    const args = { p_trip_id: trip, p_day_id: day,
      p_note_id: metadata?.id ?? null, p_expected_updated_at: metadata?.updated_at ?? null, ...fields };
    const key = JSON.stringify([trip, metadata?.id ?? day]), input = JSON.stringify([fields === null ? 'delete' : 'save', args]);
    let intent = this.pending.get(key);
    if (intent && intent.input !== input)
      throw new FamilyApiError(409, 'note_pending', 'Retry the original note save before starting a different change.');
    if (!intent) { intent = { input, operation: crypto.randomUUID(), actor: captureFamilyActor() }; this.pending.set(key, intent); }
    const fence = async () => {
      intent.actor.assertCurrent();
      const current = await this.repo.session();
      if (epoch !== this.epoch || String(useTripStore.getState().trip?.id) !== String(ids.register('trip', trip)) ||
          current.userId !== session.userId || current.familyId !== session.familyId ||
          current.personId !== session.personId || ids !== (await this.repo.views()).ids || this.repo.getLayer(trip) !== 'published')
        throw new FamilyApiError(409, 'note_session', 'The original Family note session changed.');
    };
    const releaseLive = holdPlannerRealtime(trip);
    try {
    await fence();
    await refuseOlderQueue(this.repo, trip, intent.operation);
    const result = await intent.actor.perform(() => locationRpc(fields === null ? 'delete_family_trip_day_note_v2' : 'save_family_trip_day_note_v3',
      { ...args, p_operation_id: intent.operation })) as { id?: string; trip_id?: string; trip_day_id?: string; note_id?: string };
    await fence();
    const id = fields === null ? result.note_id : result.id;
    if (!id || result.trip_id !== trip || result.trip_day_id !== day || (metadata && id !== metadata.id) ||
        (!metadata && id !== intent.operation))
      throw new FamilyApiError(502, 'note_result', 'The note save returned inconsistent identities. Retry the original save.');
    this.repo.invalidate(trip);
    await this.hydrate(trip);
    await fence();
    const visible = useTripStore.getState().dayNotes[String(dayValue)]?.some((n) => n.id === ids.register('note', id));
    if (fields === null ? visible : !visible)
      throw new FamilyApiError(409, 'note_refresh', 'Saved note is not visible. Retry the original save.');
    this.pending.delete(key);
    return ids.register('note', id);
    } finally { releaseLive(); }
  }
}

import type { PlannerAssignmentOutcome, PlannerAssignmentRequest } from '../../repo/plannerAssignmentPort';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { captureWriteSession } from '../../sync/writeSession';
import type { Assignment } from '../../types';
import { creationJson } from './creationIntentQueue';
import { guardNativeStayArrangement } from './nativeStayActionGuard';
import {
  arrangementPacket,
  arrangementPlan,
  type ArrangementPacket,
  type ArrangementPlan,
  type ArrangementReceipt,
} from './plannerArrangementContract';
import { createArrangementSession, runArrangementOriginal } from './plannerArrangementSession';
import { refuseOlderQueue } from './plannerCohortEditor';
import { plannerStateSchema } from './plannerStateContract';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
type Intent = { packet: ArrangementPacket; fence: () => Promise<void> };
type NativeSnapshot = Pick<ReturnType<typeof useTripStore.getState>, 'trip' | 'days' | 'assignments'>;
export class PlannerCohortAssignments {
  private epoch = 0;
  private pending: { key: string; intent: Promise<Intent> } | null = null;
  private inFlight = new Map<string, Promise<PlannerAssignmentOutcome>>();
  constructor(
    private repo: FamilyFrontendRepository,
    private refresh: (trip: number | string) => Promise<void>,
    private source: () => string,
    private disposed: () => boolean
  ) {}
  reset() {
    this.epoch++;
    this.pending = null;
  }
  bindUndo(undo: () => Promise<void> | void, dayIds?: number[]) {
    const refused = () =>
      new FamilyApiError(
        409,
        'arrangement_undo_changed',
        'The day or visit changed after this Undo was recorded. Nothing was sent.'
      );
    try {
      const state = useTripStore.getState(),
        ids = this.repo.knownViews()?.ids;
      if (!state.trip || !ids) throw refused();
      const native = state.trip.id,
        trip = ids.uuid('trip', native),
        epoch = this.epoch,
        source = this.source(),
        layer = this.repo.getLayer(trip),
        owner = captureWriteSession(),
        context = this.repo.captureContext(trip, { revision: false }),
        selected = [...new Set(dayIds?.length ? dayIds : state.days.map((d) => d.id))];
      const fingerprint = () => {
        try {
          return creationJson(selected.map((id) => observeDay(useTripStore.getState(), id, ids, trip)));
        } catch {
          throw refused();
        }
      };
      const original = fingerprint();
      return async () => {
        owner.assertCurrent();
        context.assertCurrent();
        if (
          this.disposed() ||
          epoch !== this.epoch ||
          source !== this.source() ||
          layer !== this.repo.getLayer(trip) ||
          ids !== this.repo.knownViews()?.ids ||
          String(useTripStore.getState().trip?.id) !== String(native) ||
          fingerprint() !== original
        )
          throw refused();
        // Call synchronously after validating the original observation. Native callbacks capture
        // their request before their first await; the server still checks the observed revisions.
        return undo();
      };
    } catch {
      return async () => {
        throw refused();
      };
    }
  }
  private async scope(trip: number | string) {
    const epoch = this.epoch,
      session = await this.repo.session(),
      ids = (await this.repo.views()).ids,
      id = await this.repo.tripUuid(trip),
      layer = this.repo.getLayer(id),
      source = this.source();
    const fence = async () => {
      const current = await this.repo.session();
      if (
        this.disposed() ||
        epoch !== this.epoch ||
        source !== this.source() ||
        (await this.repo.views()).ids !== ids ||
        current.userId !== session.userId ||
        current.familyId !== session.familyId ||
        current.personId !== session.personId ||
        this.repo.getLayer(id) !== layer ||
        String(useTripStore.getState().trip?.id) !== String(ids.register('trip', id))
      )
        throw new FamilyApiError(
          409,
          'arrangement_scope',
          'The original planner scope changed. Reload before arranging.'
        );
    };
    await fence();
    return {
      ids,
      source,
      fence,
      scope: {
        version: 1 as const,
        trip_id: id,
        user_id: session.userId,
        family_id: session.familyId,
        person_id: session.personId,
        layer,
      },
    };
  }
  async prepare(request: PlannerAssignmentRequest): Promise<Intent> {
    const state = useTripStore.getState();
    guardNativeStayArrangement(request, state);
    const shown = structuredClone({ trip: state.trip, days: state.days, assignments: state.assignments });
    const s = await this.scope(request.trip);
    await s.fence();
    const plan = buildArrangement(request, shown, s.ids, s.scope.trip_id);
    return {
      fence: s.fence,
      packet: arrangementPacket.parse({
        version: 1,
        source_url: s.source,
        operation_id: crypto.randomUUID(),
        scope: s.scope,
        plan,
      }),
    };
  }
  async execute(request: PlannerAssignmentRequest) {
    const key = JSON.stringify(request);
    if (this.pending && this.pending.key !== key)
      throw new FamilyApiError(
        409,
        'arrangement_pending',
        'Resolve the original arrangement before starting another one.'
      );
    if (this.pending === null) {
      const entry = { key, intent: this.prepare(request) };
      this.pending = entry;
      void entry.intent.catch(() => {
        if (this.pending === entry) this.pending = null;
      });
    }
    return this.run(await this.pending.intent);
  }
  private run(intent: Intent): Promise<PlannerAssignmentOutcome> {
    const key = intent.packet.operation_id,
      old = this.inFlight.get(key);
    if (old !== undefined) return old;
    const pending = this.send(intent);
    this.inFlight.set(key, pending);
    // Every caller awaits the original promise; handlers only remove the completed registry entry.
    const clear = () => {
      this.inFlight.delete(key);
    };
    void pending.then(clear, clear);
    return pending;
  }
  private async send(intent: Intent): Promise<PlannerAssignmentOutcome> {
    if (isEffectivelyOffline())
      throw new FamilyApiError(
        409,
        'arrangement_offline',
        'Arranging currently needs a connection. Original work is retained.'
      );
    await intent.fence();
    const p = intent.packet,
      native = (await this.repo.views()).ids.register('trip', p.scope.trip_id),
      session = createArrangementSession(this.repo, p.scope.trip_id, {
        source: this.source,
        current: () => !this.disposed() && String(useTripStore.getState().trip?.id) === String(native),
      });
    await refuseOlderQueue(this.repo, p.scope.trip_id, p.operation_id);
    await intent.fence();
    const result = await runArrangementOriginal(session, p, { retry: true });
    await intent.fence();
    session.check();
    if (!result) throw new FamilyApiError(503, 'arrangement_unresolved', 'The original arrangement remains retained.');
    this.repo.invalidate(p.scope.trip_id);
    await this.refresh(p.scope.trip_id);
    await intent.fence();
    session.check();
    if (result.state !== 'published' && result.state !== 'draft') {
      this.pending = null;
      throw new FamilyApiError(
        409,
        'arrangement_not_pending',
        'The original intent was submitted or removed; it was not recreated.'
      );
    }
    const ids = (await this.repo.views()).ids;
    await intent.fence();
    // A historical acknowledgement must never be replayed as current visible order or a new Undo.
    const undo =
      result.state === 'published' &&
      result.changed &&
      matchesShownOutcome(p.plan, result, useTripStore.getState(), ids, p.scope.trip_id)
        ? await this.makeUndo(intent, result)
        : undefined;
    this.pending = null;
    return { state: result.state, undo };
  }
  private async makeUndo(original: Intent, result: ArrangementReceipt) {
    const p = original.packet;
    if (!['trash', 'reorder'].includes(p.plan.action)) return undefined;
    const s = await this.scope(p.scope.trip_id);
    await original.fence();
    const state = useTripStore.getState();
    if (!matchesShownOutcome(p.plan, result, state, s.ids, p.scope.trip_id)) return undefined;
    const day = p.plan.days[0],
      nativeDay = s.ids.register('day', day.id),
      observed = observeDay(state, nativeDay, s.ids, p.scope.trip_id);
    let plan: ArrangementPlan;
    if (p.plan.action === 'trash') {
      const removed = result.result?.removed.find((r) => r.id === p.plan.visit?.id);
      if (!removed) throw new FamilyApiError(502, 'arrangement_undo', 'Original removed identity missing.');
      plan = {
        version: 1,
        action: 'restore',
        visit: { id: removed.id, revision: removed.revision },
        days: [{ ...observed, order: day.observed.map((r) => r.id) }],
      };
    } else
      plan = {
        version: 1,
        action: 'reorder',
        visit: null,
        days: [{ ...observed, order: day.observed.map((r) => r.id) }],
      };
    const undo: Intent = {
      fence: s.fence,
      packet: arrangementPacket.parse({ ...p, operation_id: crypto.randomUUID(), plan }),
    };
    return async () => {
      if (this.pending !== null)
        throw new FamilyApiError(409, 'arrangement_pending', 'Resolve the pending arrangement before Undo.');
      this.pending = { key: `undo:${undo.packet.operation_id}`, intent: Promise.resolve(undo) };
      await this.run(undo);
    };
  }
}
type Registry = Awaited<ReturnType<FamilyFrontendRepository['views']>>['ids'];
function occurrence(a: Assignment, ids: Registry, trip: string, day: string) {
  const v = plannerStateSchema.shape.visits.element.parse((a as Assignment & { family_visit?: unknown }).family_visit);
  if (
    v.trip_id !== trip ||
    v.id !== ids.uuid('assignment', a.id) ||
    v.trip_day_id !== day ||
    v.sort_order !== a.order_index ||
    v.deleted_at !== null ||
    v.timing_kind === 'legacy'
  )
    throw new FamilyApiError(
      409,
      'arrangement_observation',
      'This row is not a checked explicit occurrence. Reload or classify it first.'
    );
  return { id: v.id, revision: v.revision };
}
function observeDay(state: NativeSnapshot, id: number, ids: Registry, trip: string) {
  const d = state.days.find((d) => d.id === id);
  if (!d) throw new FamilyApiError(409, 'arrangement_day', 'Selected day unavailable.');
  const date = arrangementPlan.shape.days.element.shape.civil_day.safeParse(d.date);
  if (!date.success)
    throw new FamilyApiError(
      409,
      'arrangement_day_date',
      'The selected day does not have a usable date. Reload the trip before arranging visits.'
    );
  const uuid = ids.uuid('day', id),
    rows = [...(state.assignments[String(id)] ?? [])].sort(
      (a, b) =>
        a.order_index - b.order_index || ids.uuid('assignment', a.id).localeCompare(ids.uuid('assignment', b.id))
    );
  const observed = rows.map((a) => occurrence(a, ids, trip, uuid));
  return { id: uuid, civil_day: date.data, observed, order: observed.map((v) => v.id) };
}
function buildArrangement(
  request: PlannerAssignmentRequest,
  state: NativeSnapshot,
  ids: Registry,
  trip: string
): ArrangementPlan {
  const origin = request.action === 'move' ? request.from : request.day,
    days = [observeDay(state, origin, ids, trip)];
  const target =
    'visit' in request ? days[0].observed.find((r) => r.id === ids.uuid('assignment', request.visit)) : null;
  if ('visit' in request && !target)
    throw new FamilyApiError(409, 'arrangement_visit', 'The selected visit is not on the original day.');
  if (request.action === 'move') {
    if (request.to !== origin) days.push(observeDay(state, request.to, ids, trip));
    for (const d of days) d.order = d.order.filter((id) => id !== target?.id);
    const destination = days.find((d) => d.id === ids.uuid('day', request.to));
    if (!destination || !target) throw new FamilyApiError(409, 'arrangement_target', 'Target day unavailable.');
    const position = request.position ?? destination.order.length;
    if (!Number.isInteger(position) || position < 0 || position > destination.order.length)
      throw new FamilyApiError(400, 'arrangement_position', 'Invalid insertion position.');
    destination.order.splice(position, 0, target.id);
  } else if (request.action === 'remove') days[0].order = days[0].order.filter((id) => id !== target?.id);
  else if (request.action === 'clear') days[0].order = [];
  else days[0].order = request.order.map((id) => ids.uuid('assignment', id));
  return arrangementPlan.parse({
    version: 1,
    action: request.action === 'remove' ? 'trash' : request.action,
    visit: target,
    days,
  });
}
function matchesShownOutcome(
  plan: ArrangementPlan,
  result: ArrangementReceipt,
  state: NativeSnapshot,
  ids: Registry,
  trip: string
) {
  try {
    for (const d of plan.days) {
      const shown = observeDay(state, ids.register('day', d.id), ids, trip);
      if (
        shown.civil_day !== d.civil_day ||
        JSON.stringify(shown.order) !== JSON.stringify(d.order) ||
        shown.observed.some((v) => result.result?.rows.find((row) => row.id === v.id)?.revision !== v.revision)
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

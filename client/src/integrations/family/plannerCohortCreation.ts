import { holdPlannerRealtime } from './plannerRealtimeHold';
import api from '../../api/client';
import type { PlaceSubmitData } from '../../components/Planner/PlaceFormModal';
import type { PlannerCreationContext } from '../../repo/plannerCreationPort';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { captureWriteSession } from '../../sync/writeSession';
import { catalogDetail, catalogLocationCreate, parseCatalogKey, requireCatalogHit } from './catalogCreation';
import { assertCoreHttpsPlannerPackingRequest } from './coreHttpsPlannerPackingBoundary';
import { assertCoreHttpsTaskRequest } from './coreHttpsTaskBoundary';
import {
  acknowledgeCreationIntent,
  assertCreationOriginal,
  creationIntentUrl,
  creationJson,
  parkCreationRefusal,
  retainCreationIntent,
} from './creationIntentQueue';
import { checkCreationAcknowledgement, readCreationReceipt } from './creationReceiptTransport';
import type { FamilyIdentityRegistry } from './identity';
import type { FormValues } from './locationFormContract';
import { nativeLocationValues } from './nativeLocationForm';
import type { PlannerCohortEditor } from './plannerCohortEditor';
import { refuseOlderQueue } from './plannerCohortEditor';
import type { CreationReceipt } from './plannerCreationContract';
import { creationPacket, type CreationPacket } from './plannerCreationContract';
import type { createPlannerViewReader } from './plannerView';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

type Intent = { packet: CreationPacket; fence: () => Promise<void>; attempt?: () => void };
type FormSession = {
  context: PlannerCreationContext;
  capture: Awaited<ReturnType<PlannerCohortCreation['capture']>>;
  keys: Map<string, string>;
  catalog: Map<string, ReturnType<typeof catalogDetail>>;
  uncertainHash?: string;
};
const blank: FormValues = {
  name: '',
  description: null,
  notes: null,
  address: null,
  website: null,
  phone: null,
  latitude: null,
  longitude: null,
  family_place_category_id: null,
};
/** New form sessions hold their original scope. Failed acknowledgements reuse intent; deliberate repeats do not. */
export class PlannerCohortCreation {
  private epoch = 0;
  private form: Promise<FormSession> | null = null;
  private assigning = new Map<string, Promise<Intent>>();
  private inFlight = new Map<string, Promise<Awaited<ReturnType<PlannerCohortCreation['execute']>>>>();
  constructor(
    private repo: FamilyFrontendRepository,
    private reader: ReturnType<typeof createPlannerViewReader>,
    private editor: PlannerCohortEditor,
    private refresh: (value: number | string) => Promise<void>,
    private source: () => string
  ) {}
  cancelForm() {
    this.epoch++;
    this.form = null;
  }
  dispose() {
    this.cancelForm();
    this.assigning.clear();
  }
  async capture(context: PlannerCreationContext) {
    const { tripId, dayId, position } = context;
    const generation = this.epoch,
      session = await this.repo.session(),
      source = this.source(),
      s = await this.editor.scope(tripId);
    const view = await this.reader.read(s.trip, s.layer);
    const fence = async () => {
      await s.fence();
      const current = await this.repo.session();
      if (
        generation !== this.epoch ||
        source !== this.source() ||
        current.userId !== session.userId ||
        current.familyId !== session.familyId ||
        current.personId !== session.personId
      )
        throw new FamilyApiError(
          409,
          'creation_session_changed',
          'The original creation session changed. Reopen the form.'
        );
    };
    await fence();
    const day = dayId === null ? null : view.state.days.find((d) => d.id === s.ids.uuid('day', dayId));
    if (dayId !== null && !day) throw new FamilyApiError(409, 'creation_day', 'Selected day is unavailable.');
    const dayKey = day ? s.ids.register('day', day.id) : null;
    const count = dayKey === null ? 0 : (view.state.native.days.find((d) => d.id === dayKey)?.assignments?.length ?? 0);
    if (position !== null && (dayKey === null || position !== count))
      throw new FamilyApiError(
        409,
        'creation_position',
        'Create at the end of the day. Insertion and route updates are not connected yet.'
      );
    return {
      scope: {
        version: 1 as const,
        trip_id: s.trip,
        family_id: session.familyId,
        user_id: session.userId,
        person_id: session.personId,
        layer: s.layer,
      },
      view,
      ids: s.ids,
      source,
      day: day ? { id: day.id, civil_day: day.civil_day } : null,
      fence,
    };
  }
  beginForm(context: PlannerCreationContext) {
    this.cancelForm();
    const capturedContext = structuredClone(context);
    const pending = this.capture(capturedContext).then((capture) => ({
      context: capturedContext,
      capture,
      keys: new Map<string, string>(),
      catalog: new Map<string, ReturnType<typeof catalogDetail>>(),
    }));
    this.form = pending;
    return pending.then(() => undefined);
  }
  async prepareForm(context: PlannerCreationContext, data: PlaceSubmitData): Promise<Intent> {
    if (this.form === null)
      throw new FamilyApiError(409, 'creation_not_open', 'Open the new-location form before saving.');
    const requestedContext = JSON.stringify(context);
    const f = await this.form;
    if (JSON.stringify(f.context) !== requestedContext)
      throw new FamilyApiError(
        409,
        'creation_context_changed',
        'The original day or insertion changed. Reopen the form.'
      );
    await f.capture.fence();
    const { place_time, end_time, assignment_notes, ...locationData } = data;
    const ref = parseCatalogKey(locationData.osm_id);
    let create: Record<string, unknown>;
    if (ref) {
      if (f.capture.view.state.locations.some((l) => l.source.kind === ref.kind && l.source.id === ref.id))
        throw new FamilyApiError(
          409,
          'catalog_already_saved',
          'This venue is already saved to the Trip. Use its saved location to add another visit or edit its details.'
        );
      const key = `catalog:${ref.kind}:${ref.id}`;
      let pending = f.catalog.get(key);
      if (pending === undefined) {
        pending = catalogDetail(ref).then(requireCatalogHit);
        f.catalog.set(key, pending);
        const captured = pending;
        void pending.catch(() => {
          if (f.catalog.get(key) === captured) f.catalog.delete(key);
        });
      }
      const hit = requireCatalogHit(await pending);
      await f.capture.fence();
      create = catalogLocationCreate(locationData, hit, f.capture.ids, blank);
    } else {
      const v = nativeLocationValues(locationData, { shown: blank }, { image_url: null }, f.capture.ids);
      create = {
        source: { kind: 'manual' as const },
        label: v.name,
        description_override: v.description,
        notes: v.notes,
        address: v.address,
        website: v.website,
        phone: v.phone,
        latitude: v.latitude,
        longitude: v.longitude,
        family_place_category_id: v.family_place_category_id,
      };
    }
    const form = {
      location: { create },
      day: f.capture.day,
      clocks: { start: place_time || null, end: end_time || null },
      visit_notes: assignment_notes || null,
    };
    if (!form.day && (form.clocks.start || form.clocks.end || form.visit_notes))
      throw new FamilyApiError(
        409,
        'creation_pool_time',
        'Choose a Trip day before saving visit times or visit notes.'
      );
    if (!ref && (form.clocks.start || form.clocks.end))
      throw new FamilyApiError(400, 'creation_manual_zone', 'A timed visit needs a known venue time zone.');
    const hash = JSON.stringify(form);
    if (f.uncertainHash && f.uncertainHash !== hash)
      throw new FamilyApiError(
        409,
        'creation_acknowledgement_pending',
        'Retry the original form first. Its save may already have committed.'
      );
    let op = f.keys.get(hash);
    if (!op) {
      op = crypto.randomUUID();
      f.keys.set(hash, op);
    }
    return {
      packet: creationPacket.parse({
        version: 1,
        source_url: f.capture.source,
        operation_id: op,
        scope: f.capture.scope,
        form,
      }),
      fence: f.capture.fence,
      attempt: () => {
        if (f.uncertainHash && f.uncertainHash !== hash)
          throw new FamilyApiError(
            409,
            'creation_concurrent_intent',
            'Another save from this form is unresolved. Retry it first.'
          );
        f.uncertainHash = hash;
      },
    };
  }
  async execute(intent: Intent) {
    if (isEffectivelyOffline())
      throw new FamilyApiError(
        409,
        'creation_needs_connection',
        'Creation needs a connection. Your form and queued work remain intact.'
      );
    await intent.fence();
    await refuseOlderQueue(this.repo, intent.packet.scope.trip_id, intent.packet.operation_id);
    const p = intent.packet;
    const url = creationIntentUrl(p);
    assertCoreHttpsTaskRequest({ method: 'POST', pathname: url });
    assertCoreHttpsPlannerPackingRequest({ method: 'POST', pathname: url });
    const owner = captureWriteSession(),
      native = (await this.repo.views()).ids.register('trip', p.scope.trip_id),
      release = await acquireQueueLock(owner, 'exclusive', true);
    let operation: CreationReceipt;
    try {
      await intent.fence();
      owner.assertCurrent();
      if (!release || isEffectivelyOffline())
        throw new FamilyApiError(503, 'creation_needs_connection', 'Reconnect before sending the place save.');
      intent.attempt?.();
      const row = await retainCreationIntent(owner, p, native),
        original = row.body as CreationPacket;
      try {
        await intent.fence();
        await assertCreationOriginal(owner, original, native, row);
        const reply = await api.post(url, original, { headers: { 'X-Idempotency-Key': original.operation_id } });
        operation = checkCreationAcknowledgement(reply.data, original);
        await intent.fence();
        await assertCreationOriginal(owner, original, native, row);
        const receipt = await readCreationReceipt(original);
        await intent.fence();
        await assertCreationOriginal(owner, original, native, row);
        if (receipt.status !== 'committed' || creationJson(receipt.result) !== creationJson(operation))
          throw new FamilyApiError(
            502,
            'creation_ack_unconfirmed',
            'The original place save is not confirmed. It remains retained.'
          );
        await acknowledgeCreationIntent(owner, original, native, row);
      } catch (error) {
        await intent.fence();
        await parkCreationRefusal(owner, original, native, row, error);
        throw error;
      }
    } finally {
      release?.();
    }
    await intent.fence();
    this.repo.invalidate(p.scope.trip_id);
    await this.refresh(p.scope.trip_id);
    await intent.fence();
    if (operation.state !== 'published' && operation.state !== 'draft')
      throw new FamilyApiError(
        409,
        'creation_not_draft',
        'This original intent was already submitted or removed. It has not been recreated.'
      );
    const view = await this.reader.read(p.scope.trip_id, p.scope.layer);
    await intent.fence();
    const ids = (await this.repo.views()).ids;
    await intent.fence();
    return resolveCreated(operation, view, p.form, ids, operation.state);
  }
  private run(intent: Intent) {
    const key = intent.packet.operation_id,
      prior = this.inFlight.get(key);
    if (prior !== undefined) return prior;
    const releaseLive = holdPlannerRealtime(intent.packet.scope.trip_id);
    const pending = this.execute(intent).finally(releaseLive);
    this.inFlight.set(key, pending);
    // Callers await the original pending promise, including its rejection. Both handlers only clear the registry.
    const clear = () => {
      this.inFlight.delete(key);
    };
    void pending.then(clear, clear);
    return pending;
  }
  async createForm(context: PlannerCreationContext, data: PlaceSubmitData) {
    return this.run(await this.prepareForm(context, data));
  }
  async assign(
    trip: number | string,
    day: number | string,
    place: number | string,
    position?: number | null,
    stage?: string
  ) {
    if (stage) throw new FamilyApiError(409, 'creation_tour', 'Tour stages are not connected.');
    const key = JSON.stringify([trip, day, place, position ?? null]);
    let pending = this.assigning.get(key);
    if (pending === undefined) {
      pending = (async () => {
        const c = await this.capture({ tripId: trip, dayId: Number(day), position: position ?? null }),
          id = c.ids.uuid('place', place),
          l = c.view.state.locations.find((l) => l.id === id);
        if (!l || c.view.bindings.some((b) => b.virtual_location && b.location_id === id))
          throw new FamilyApiError(409, 'creation_virtual', 'Choose a committed saved location.');
        return {
          fence: c.fence,
          packet: creationPacket.parse({
            version: 1,
            source_url: c.source,
            operation_id: crypto.randomUUID(),
            scope: c.scope,
            form: {
              location: { id: l.id, revision: l.revision },
              day: c.day,
              clocks: { start: null, end: null },
              visit_notes: null,
            },
          }),
        };
      })();
      this.assigning.set(key, pending);
      void pending.catch(() => {
        if (this.assigning.get(key) === pending) this.assigning.delete(key);
      });
    }
    const result = await this.run(await pending);
    this.assigning.delete(key);
    if (!result.assignment) throw new FamilyApiError(502, 'creation_missing_visit', 'No selected-day visit returned.');
    return result.assignment;
  }
}

function resolveCreated(
  operation: CreationReceipt,
  view: Awaited<ReturnType<ReturnType<typeof createPlannerViewReader>['read']>>,
  form: CreationPacket['form'],
  ids: FamilyIdentityRegistry,
  state: 'published' | 'draft'
) {
  const b = view.bindings.find((b) => b.op_id === operation.operation.op_id);
  const location = operation.location_id ?? b?.location_id,
    visit = operation.visit_id ?? b?.visit_id;
  if (!location || !view.state.locations.some((l) => l.id === location) || (form.day && !visit))
    throw new FamilyApiError(
      409,
      'creation_refresh',
      'Creation was saved but is not visible in this snapshot. Retry the original intent.'
    );
  const id = ids.register('place', location);
  const assignment = visit
    ? view.state.native.days.flatMap((d) => d.assignments ?? []).find((a) => a.id === ids.register('assignment', visit))
    : undefined;
  if (form.day && !assignment)
    throw new FamilyApiError(409, 'creation_refresh_visit', 'Saved visit is not visible. Retry the original intent.');
  return { id, state, assignment };
}

import { CREATION_TERMINAL_ARCHIVE_KEY, creationTerminalBlocks } from '../../db/creationTerminalArchive';
import { offlineDb } from '../../db/offlineDb';
import type { PlannerEditorRequest } from '../../repo/plannerEditorPort';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import type { Place } from '../../types';
import { creationJson } from './creationIntentQueue';
import { editorIntentUrl } from './editorIntentQueue';
import { openFamilyLocationForm } from './nativeLocationForm';
import { guardNativeStayVisitClocks } from './nativeStayActionGuard';
import { openFamilyVisitForm } from './nativeVisitForm';
import { editorPacket, type EditorPacket } from './plannerEditorContract';
import { createEditorSession, runEditorOriginal } from './plannerEditorSession';
import type { createPlannerViewReader } from './plannerView';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
type Editor = Awaited<ReturnType<typeof openFamilyLocationForm>> | Awaited<ReturnType<typeof openFamilyVisitForm>>;
export class PlannerCohortEditor {
  private editorEpoch = 0;
  constructor(
    private repo: FamilyFrontendRepository,
    private reader: ReturnType<typeof createPlannerViewReader>,
    private refreshPlanner: (value: number | string) => Promise<void>,
    private disposed: () => boolean,
    private source: () => string
  ) {}
  private editing: {
    editor: Editor;
    request: PlannerEditorRequest;
    fence: () => Promise<void>;
    result: { place: Place; assignment: import('../../types').Assignment | null };
    original?: EditorPacket;
    flight?: Promise<{ id: number; state: 'published' | 'draft' }>;
  } | null = null;
  cancelEditor() {
    this.editorEpoch++;
    this.editing = null;
  }
  async scope(value: number | string) {
    const session = await this.repo.session(),
      ids = (await this.repo.views()).ids,
      trip = await this.repo.tripUuid(value),
      layer = this.repo.getLayer(trip);
    const epoch = this.editorEpoch,
      origin = this.source();
    return {
      trip,
      ids,
      layer,
      fence: async () => {
        const current = await this.repo.session();
        if (
          this.disposed() ||
          this.source() !== origin ||
          epoch !== this.editorEpoch ||
          (await this.repo.views()).ids !== ids ||
          current.userId !== session.userId ||
          current.familyId !== session.familyId ||
          current.personId !== session.personId ||
          this.repo.getLayer(trip) !== layer
        )
          throw new FamilyApiError(
            409,
            'planner_editor_changed',
            'The original planner editor scope changed. Reopen it.'
          );
      },
    };
  }
  async openEditor(request: PlannerEditorRequest) {
    this.cancelEditor();
    const s = await this.scope(request.tripId);
    const location = s.ids.uuid('place', request.place.id);
    const current = await this.reader.read(s.trip, s.layer);
    await s.fence();
    if (
      !current.state.locations.some((l) => l.id === location) ||
      current.bindings.some((b) => b.virtual_location && b.location_id === location)
    )
      throw new FamilyApiError(409, 'planner_virtual_editor', 'This location is not a committed editable identity.');
    const editor =
      request.assignmentId === null
        ? await openFamilyLocationForm(s.trip, location, s.layer, s.ids)
        : await openFamilyVisitForm(s.trip, s.ids.uuid('assignment', request.assignmentId), s.layer, s.ids);
    await s.fence();
    if (editor.editor.location.id !== location)
      throw new FamilyApiError(409, 'planner_editor_identity', 'The selected visit belongs to another saved location.');
    const assignment = 'assignment' in editor ? editor.assignment : null;
    const result = {
      place: {
        ...editor.place,
        place_time: assignment?.assignment_time ?? null,
        end_time: assignment?.assignment_end_time ?? null,
      },
      assignment,
    };
    this.editing = { editor, request: structuredClone(request), fence: s.fence, result };
    return result;
  }
  private async prepare(request: PlannerEditorRequest, data: Parameters<Editor['prepare']>[0]) {
    if (
      !this.editing ||
      request.tripId !== this.editing.request.tripId ||
      request.place.id !== this.editing.request.place.id ||
      request.assignmentId !== this.editing.request.assignmentId
    )
      throw new FamilyApiError(
        409,
        'planner_editor_not_observed',
        'Open the selected location or visit before saving.'
      );
    const current = this.editing;
    await current.fence();
    await refuseOlderQueue(this.repo, request.tripId, current.original?.operation_id);
    await current.fence();
    guardNativeStayVisitClocks(
      Object.values(useTripStore.getState().assignments)
        .flat()
        .find((a) => a.id === request.assignmentId),
      data
    );
    const body = current.editor.prepare(data);
    return { current, body };
  }
  async saveForm(request: PlannerEditorRequest, data: Parameters<Editor['save']>[0]) {
    if (isEffectivelyOffline())
      throw new FamilyApiError(
        409,
        'planner_editor_needs_connection',
        'This editor needs a connection. Your form and pending work remain intact.'
      );
    const { current, packet } = await this.preparedPacket(request, data);
    if (current.original && creationJson(current.original) !== creationJson(packet))
      throw new FamilyApiError(
        409,
        'editor_unresolved_intent',
        'Resolve the original edit before saving changed form values.'
      );
    current.original ??= structuredClone(packet);
    if (current.flight !== undefined) return current.flight;
    const original = current.original;
    const work = async () => {
      const trip =
        original.kind === 'location'
          ? original.request.observation.trip_id
          : original.request.observation.location.trip_id;
      const native = (await this.repo.views()).ids.register('trip', trip);
      const session = createEditorSession(this.repo, trip, {
        source: this.source,
        current: () =>
          !this.disposed() && this.editing === current && String(useTripStore.getState().trip?.id) === String(native),
      });
      await current.fence();
      const reply = await runEditorOriginal(session, original, { retry: true });
      await current.fence();
      session.check();
      if (!reply) throw new FamilyApiError(503, 'editor_unresolved', 'The original edit remains unresolved.');
      this.repo.invalidate(trip);
      await this.refreshPlanner(request.tripId);
      await current.fence();
      session.check();
      return { id: current.editor.place.id, state: reply.state };
    };
    const pending = work();
    current.flight = pending;
    const clear = () => {
      if (current.flight === pending) current.flight = undefined;
    };
    void pending.then(clear, clear);
    return pending;
  }

  async confirmEditor(result: { place: Place; assignment: import('../../types').Assignment | null }) {
    if (this.editing?.result !== result)
      throw new FamilyApiError(409, 'planner_open_superseded', 'A newer editor replaced this open.');
    await this.editing.fence();
  }
  selectedAssignment(placeId: number | null) {
    return this.editing?.request.place.id === placeId ? this.editing.result.assignment : null;
  }
  private async preparedPacket(request: PlannerEditorRequest, data: Parameters<Editor['prepare']>[0]) {
    const { current, body } = await this.prepare(request, data);
    const packet = editorPacket.parse({
      version: 1,
      kind: 'assignment' in current.editor ? 'visit' : 'location',
      source_url: this.source(),
      target_id:
        'assignment' in current.editor
          ? current.editor.editor.observation.visit_id
          : current.editor.editor.observation.location_id,
      operation_id: body.operation_id,
      request: body,
    });
    await current.fence();
    return { current, packet };
  }
  async packet(request: PlannerEditorRequest, data: Parameters<Editor['prepare']>[0]) {
    const { packet } = await this.preparedPacket(request, data);
    return { url: editorIntentUrl(packet), body: packet };
  }
}
export async function refuseOlderQueue(repo: FamilyFrontendRepository, value: number | string, operation?: string) {
  const trip = await repo.tripUuid(value),
    key = (await repo.views()).ids.register('trip', trip);
  const meta = await offlineDb.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY);
  if (creationTerminalBlocks(meta, trip, operation ?? ''))
    throw new FamilyApiError(409, 'planner_terminal_held', 'An original cancellation decision remains unresolved.');
  const rows = await offlineDb.mutationQueue.toArray();
  if (
    rows.some((r) => {
      const match = r.url.match(/^\/trips\/([^/]+)(?:\/(.*))?$/);
      if (!match || ![String(key), trip, String(value)].includes(match[1])) return false;
      const creation = [
        'family/planner-create-command',
        'family/planner-arrange-command',
        'family/planner-editor-command',
        'family/calendar',
        'family/governance/commands',
      ].includes(match[2]);
      if (creation) return (r.body as { operation_id?: string } | null)?.operation_id !== operation;
      return !match[2] || /^(places|days|assignments)(?:\/|$)/.test(match[2]);
    })
  )
    throw new FamilyApiError(
      409,
      'planner_pending_legacy_work',
      'Older planner work is parked. Resolve it before saving a new edit.'
    );
}

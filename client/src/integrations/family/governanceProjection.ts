import type { GovernanceGroup, GovernanceView } from './governanceContract';
import type {
  TripChangeDraftOpRow,
  TripChangeRequestOpRow,
  TripChangeRequestRow,
} from './legacy/data/supabase/tripChangeRequests';
const text = (v: unknown) => (typeof v === 'string' ? v : null);
function summary(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Unrecognized proposal retained: ' + JSON.stringify(payload);
  const p = payload as Record<string, unknown>;
  if (p.contract === 'family.plan_change.v2')
    return `${String(p.domain)} · ${String(p.action)}: ${JSON.stringify(p.changes)}`;
  return 'Legacy proposal: ' + JSON.stringify(payload);
}
/** Display projection only. The complete canonical payload remains separately available, never a v1 write. */
export function governanceOps(group: GovernanceGroup): Array<TripChangeDraftOpRow & { originalPayload: unknown }> {
  return group.operations.map((o) => ({
    id: o.id,
    draftId: o.draft_id ?? group.record.id,
    module: o.module,
    op: o.op,
    tripDayId: text(o.trip_day_id),
    civilDate: text(o.civil_date),
    targetTable: text(o.target_table),
    targetId: text(o.target_id),
    payload: { schema_version: 1, body: summary(o.payload) },
    originalPayload: structuredClone(o.payload),
    sortOrder: o.sort_order ?? 0,
    createdAt: text(o.created_at),
  }));
}
export function governanceRequest(group: GovernanceGroup): TripChangeRequestRow {
  const r = group.record;
  if (!r.status || !r.proposed_by_person_id) throw new Error('Incomplete governance request');
  return {
    id: r.id,
    tripId: r.trip_id,
    proposedByPersonId: r.proposed_by_person_id,
    status: r.status,
    summary: text(r.summary),
    submittedAt: text(r.submitted_at),
    resolvedAt: text(r.resolved_at),
  };
}
export function governanceRequestOps(group: GovernanceGroup): TripChangeRequestOpRow[] {
  return governanceOps(group).map((o, i) => ({
    ...o,
    requestId: group.record.id,
    status: group.operations[i].status as TripChangeRequestOpRow['status'],
    hofNote: text(group.operations[i].hof_note),
    errorCode: text(group.operations[i].error_code),
  }));
}
export function governanceDisplay(v: GovernanceView) {
  const draft = v.draft?.record;
  return {
    changeDraft: draft
      ? {
          id: draft.id,
          tripId: draft.trip_id,
          ownerPersonId: draft.owner_person_id ?? v.scope.person_id,
          title: text(draft.title),
          notes: text(draft.notes),
          updatedAt: text(draft.updated_at),
        }
      : null,
    draftOps: v.draft ? governanceOps(v.draft) : [],
    openChangeRequests: v.requests.map(governanceRequest),
    mySubmittedRequests: v.requests
      .filter((q) => q.record.proposed_by_person_id === v.scope.person_id)
      .map(governanceRequest),
  };
}

const capabilities = {
  trip_place: 'trip.places.manage',
  plan_item: 'trip.schedule.manage',
  day_note: 'trip.schedule.manage',
  reservation: 'trip.reservations.manage',
  expense: 'trip.costs.manage',
};
export function canInspectGovernance(v: GovernanceView, op: GovernanceGroup['operations'][number]) {
  return v.permissions.outcomes[capabilities[op.module]] === 'direct';
}
function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
export function canReviewGovernance(v: GovernanceView, op: GovernanceGroup['operations'][number]) {
  if (!canInspectGovernance(v, op)) return false;
  const p = record(op.payload);
  if (!p) return false;
  if (p.schema_version === 1) return true;
  if (p.schema_version !== 2 || p.contract !== 'family.plan_change.v2') return false;
  const changes = record(p.changes);
  if (!changes) return false;
  const location = record(changes.location),
    locationChanges = record(changes.location_changes);
  const needsLocation =
    (p.action === 'edit_entry' && Object.keys(locationChanges ?? {}).length > 0) ||
    (p.action === 'create_entry' && location !== null && Object.prototype.hasOwnProperty.call(location, 'create'));
  return !needsLocation || v.permissions.outcomes['trip.places.manage'] === 'direct';
}

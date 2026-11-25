import type { PlanLocation } from '../../../src/integrations/family/planLocationContract';
import type { ArrangementPlan } from '../../../src/integrations/family/plannerArrangementContract';
import type { CreationPacket } from '../../../src/integrations/family/plannerCreationContract';
import { useTripStore } from '../../../src/store/tripStore';
import { load, required, visitRecord } from './core';
import type { ArrangementRow } from './state';
import { arrangementReceipts, arrangementRemoved, at, cohortState, creationReceipts, day, trip, uuid } from './state';

/** Read-only API seam: looking up an unknown original must never run fakeCreation. */
export function fakeCreationReceipt(args: Record<string, unknown>) {
  if (cohortState.deny) return { data: null, error: cohortState.deny };
  const scope = args.p_scope as CreationPacket['scope'];
  if (
    scope.user_id !== cohortState.session.userId ||
    scope.family_id !== cohortState.session.familyId ||
    scope.person_id !== cohortState.session.personId
  )
    return { data: null, error: { code: 'PT409' } };
  const r = creationReceipts.get(String(args.p_operation_id));
  if (r && r.hash !== JSON.stringify([args.p_form, scope])) return { data: null, error: { code: 'PT409' } };
  return {
    data: {
      version: 1,
      trip_id: args.p_trip_id,
      operation_id: args.p_operation_id,
      scope,
      status: r ? 'committed' : 'unknown',
      result: r?.result ?? null,
    },
    error: null,
  };
}

export function fakeCreation(args: Record<string, unknown>) {
  if (cohortState.deny) return { data: null, error: cohortState.deny };
  const f = args.p_form as CreationPacket['form'],
    scope = args.p_scope as CreationPacket['scope'],
    key = String(args.p_operation_id),
    hash = JSON.stringify([f, scope]);
  if (
    scope.user_id !== cohortState.session.userId ||
    scope.person_id !== cohortState.session.personId ||
    scope.family_id !== cohortState.session.familyId
  )
    return { data: null, error: { code: '40001' } };
  const old = creationReceipts.get(key);
  if (old && old.hash !== hash) return { data: null, error: { code: '40001' } };
  if (!old) {
    if ('create' in f.location && f.location.create.source.kind === 'manual' && (f.clocks.start || f.clocks.end))
      return { data: null, error: { code: '22023' } };
    const n = creationReceipts.size,
      priv = scope.layer === 'myDraft',
      op = uuid(400 + n),
      id = priv ? op : uuid(500 + n),
      vid = priv ? op : uuid(600 + n);
    const l =
      'id' in f.location
        ? cohortState.published
        : {
            ...structuredClone(cohortState.published),
            id,
            source:
              f.location.create.source.kind === 'manual'
                ? { kind: 'manual' as const, id: null }
                : f.location.create.source,
            name:
              f.location.create.source.kind === 'manual'
                ? required(f.location.create.label)
                : (f.location.create.label ?? 'Catalog venue'),
            notes: f.location.create.notes ?? null,
            cover_media_id: null,
            time_zone: null,
          };
    const v = f.day
      ? {
          ...visitRecord(),
          id: vid,
          plan_location_id: l.id,
          activity: l.name,
          location: l,
          explanations: f.visit_notes,
        }
      : null;
    cohortState.creationRows.push({ location: l, visit: v, private: priv, op });
    const operation = priv ? { op_id: op, draft_id: uuid(800) } : { id: v?.id ?? l.id };
    if (priv)
      cohortState.creationOps.push({
        op_id: op,
        status: 'projected',
        target_id: null,
        payload: {
          contract: 'family.plan_change.v2',
          domain: f.day ? 'visit' : 'location',
          action: f.day ? 'create_entry' : 'create',
          changes: f.day
            ? {
                location: 'id' in f.location ? { id: l.id } : { create: f.location.create },
                visit: { notes: f.visit_notes },
                schedule: { day_id: day, timing: { kind: 'untimed' } },
              }
            : 'create' in f.location
              ? f.location.create
              : {},
        },
      });
    creationReceipts.set(key, {
      hash,
      result: {
        version: 1,
        state: priv ? 'draft' : 'published',
        location_id: priv ? null : l.id,
        visit_id: priv ? null : (v?.id ?? null),
        operation,
      },
    });
  }
  if (cohortState.loseAck) {
    cohortState.loseAck = false;
    return { data: null, error: { code: '08006' } };
  }
  return { data: required(creationReceipts.get(key)).result, error: null };
}

export function withCreation<
  T extends { state: { locations: PlanLocation[]; visits: unknown[] }; operations: unknown[]; bindings: unknown[] },
>(base: T, layer: string) {
  const rows = cohortState.creationRows.filter((r) => !r.private || layer === 'myDraft'),
    locs = new Map(base.state.locations.map((l) => [l.id, l]));
  for (const r of rows) locs.set(r.location.id, r.location);
  const ops = layer === 'myDraft' ? cohortState.creationOps : [];
  return {
    ...base,
    draft_token: layer === 'myDraft' ? String(cohortState.draftIndex + ops.length).padStart(64, '0') : null,
    state: {
      ...base.state,
      locations: [...locs.values()],
      visits: [...base.state.visits, ...rows.flatMap((r) => (r.visit ? [r.visit] : []))],
    },
    operations: [...base.operations, ...ops],
    bindings: [
      ...base.bindings,
      ...rows
        .filter((r) => r.private)
        .map((r) => ({
          op_id: r.op,
          domain: r.visit ? 'visit' : 'location',
          action: r.visit ? 'create_entry' : 'create',
          location_id: r.location.id,
          visit_id: r.visit?.id ?? null,
          virtual_location: r.location.id === r.op,
          virtual_visit: !!r.visit,
        })),
    ],
  };
}

export function arrangementRows() {
  return [
    cohortState.publishedVisit,
    cohortState.repeatVisit,
    ...cohortState.creationRows.filter((r) => !r.private).flatMap((r) => (r.visit ? [r.visit] : [])),
  ];
}

export function withArrangement<
  T extends {
    state: { visits: unknown[]; days: unknown[] };
    operations: unknown[];
    bindings: unknown[];
    draft_token: string | null;
  },
>(base: T, layer: string) {
  const draft = layer === 'myDraft' ? cohortState.arrangementPrivate : null,
    removed = draft?.removed ?? arrangementRemoved,
    rows = draft?.rows ?? (base.state.visits as ArrangementRow[]);
  return {
    ...base,
    draft_token:
      layer === 'myDraft'
        ? String(cohortState.draftIndex + cohortState.creationOps.length + (draft ? 1 : 0)).padStart(64, '0')
        : null,
    state: {
      ...base.state,
      days: [...base.state.days, ...cohortState.arrangementExtraDays],
      visits: rows.filter((v) => !removed.has(v.id)),
    },
    operations: [
      ...base.operations,
      ...(draft
        ? [
            {
              op_id: draft.op,
              status: 'projected',
              target_id: draft.plan.visit?.id ?? draft.plan.days[0].observed[0]?.id ?? null,
              payload: { contract: 'family.plan_change.v2', domain: 'visit', action: 'arrange', changes: draft.plan },
            },
          ]
        : []),
    ],
    bindings: [
      ...base.bindings,
      ...(draft
        ? [
            {
              op_id: draft.op,
              domain: 'visit',
              action: 'arrange',
              location_id: null,
              visit_id: null,
              virtual_location: false,
              virtual_visit: false,
            },
          ]
        : []),
    ],
  };
}

export function fakeArrangement(args: Record<string, unknown>) {
  if (cohortState.deny) return { data: null, error: cohortState.deny };
  const p = args.p_plan as ArrangementPlan,
    key = String(args.p_operation_id),
    scope = args.p_scope as CreationPacket['scope'],
    hash = JSON.stringify([scope, p]),
    old = arrangementReceipts.get(key);
  if (old && old.hash !== hash) return { data: null, error: { code: 'PT409' } };
  if (!old) {
    const rows = arrangementRows(),
      removed = new Set(arrangementRemoved);
    for (const d of p.days) {
      const observed = rows
        .filter((v) => v.trip_day_id === d.id && !removed.has(v.id))
        .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
        .map((v) => ({ id: v.id, revision: v.revision }));
      if (JSON.stringify(observed) !== JSON.stringify(d.observed)) return { data: null, error: { code: 'PT409' } };
      if (new Set(d.order).size !== d.order.length) return { data: null, error: { code: '22023' } };
    }
    const selected = p.visit ? rows.find((v) => v.id === p.visit?.id) : undefined;
    if (p.visit && (!selected || selected.revision !== p.visit.revision))
      return { data: null, error: { code: 'PT409' } };
    const desired = structuredClone(rows),
      priv = scope.layer === 'myDraft';
    let changed = false;
    for (const d of p.days) {
      d.order.forEach((id, index) => {
        const v = desired.find((v) => v.id === id);
        if (!v) throw new Error('Unknown fixture visit');
        if (v.trip_day_id !== d.id || v.sort_order !== index || removed.has(id)) {
          changed = true;
          v.revision++;
        }
        v.trip_day_id = d.id;
        v.sort_order = index;
        v.planning_day = d.civil_day;
        if (v.start_local) v.start_local = d.civil_day + v.start_local.slice(10);
        if (v.end_local) v.end_local = d.civil_day + v.end_local.slice(10);
        removed.delete(id);
      });
      if (p.action === 'trash' || p.action === 'clear')
        for (const v of desired)
          if (v.trip_day_id === d.id && (p.action === 'clear' || v.id === p.visit?.id) && !removed.has(v.id)) {
            removed.add(v.id);
            v.revision++;
            changed = true;
          }
    }
    const ids = new Set(p.days.flatMap((d) => d.observed.map((v) => v.id)));
    if (p.visit) ids.add(p.visit.id);
    const affected = desired.filter((v) => ids.has(v.id)),
      op = uuid(900 + arrangementReceipts.size);
    if (priv && changed) cohortState.arrangementPrivate = { rows: desired, removed, op, plan: structuredClone(p) };
    else if (!priv) {
      for (const v of desired) {
        const actual = rows.find((r) => r.id === v.id);
        if (actual) Object.assign(actual, v);
      }
      arrangementRemoved.clear();
      for (const id of removed) arrangementRemoved.add(id);
    }
    const anchor = p.visit?.id ?? p.days[0].observed[0]?.id ?? null;
    arrangementReceipts.set(key, {
      hash,
      result: {
        version: 1,
        state: priv ? 'draft' : 'published',
        changed,
        operation: priv && changed ? { op_id: op, draft_id: uuid(950) } : null,
        result: priv
          ? null
          : {
              id: anchor,
              revision: affected.find((v) => v.id === anchor)?.revision ?? null,
              changed,
              rows: affected.map((v) => ({ id: v.id, revision: v.revision })),
              removed: affected
                .filter((v) => removed.has(v.id))
                .map((v) => ({ id: v.id, revision: v.revision, day_id: v.trip_day_id })),
            },
      },
    });
  }
  if (cohortState.loseAck) {
    cohortState.loseAck = false;
    return { data: null, error: { code: '08006' } };
  }
  return { data: required(arrangementReceipts.get(key)).result, error: null };
}

export async function assignmentSetup(layer: 'published' | 'myDraft' = 'published') {
  cohortState.arrangementExtraDays = [
    { id: uuid(11), trip_id: trip, civil_day: '2027-04-02', day_index: 2, title: 'Second day', updated_at: at },
  ];
  await load(layer);
  const st = useTripStore.getState();
  return {
    trip: required(st.trip).id,
    day: st.days[0].id,
    next: st.days[1].id,
    a: st.assignments[st.days[0].id][0].id,
    b: st.assignments[st.days[0].id][1].id,
  };
}

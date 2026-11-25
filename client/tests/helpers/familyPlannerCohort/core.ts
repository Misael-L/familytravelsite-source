import { expect } from 'vitest';
import type { PlaceSubmitData } from '../../../src/components/Planner/PlaceFormModal';
import { placeEditForm, placeFormPayload } from '../../../src/components/Planner/PlaceFormModal.helpers';
import { offlineDb } from '../../../src/db/offlineDb';
import type { FormValues } from '../../../src/integrations/family/locationFormContract';
import type { PlanLocation } from '../../../src/integrations/family/planLocationContract';
import type {
  VisitFormContext,
  VisitFormObservation,
  VisitFormValues,
} from '../../../src/integrations/family/visitFormContract';
import { useTripStore } from '../../../src/store/tripStore';
import { withCalendar } from './calendar';
import { withArrangement, withCreation } from './planning';
import { at, cohortState, contentNotes, day, db, family, location, receipts, trip, uuid, visit } from './state';

const catalogName = 'Actual cafe';
const clockZone = 'America/Mexico_City';

export function visitRecord() {
  return {
    id: visit,
    trip_id: trip,
    activity: catalogName,
    starts_at: null as string | null,
    ends_at: null as string | null,
    time_zone: null as string | null,
    sort_order: 0,
    explanations: null as string | null,
    updated_at: at,
    plan_location_id: location,
    timing_kind: 'untimed' as 'timed' | 'untimed',
    trip_day_id: day,
    planning_day: '2027-04-01',
    revision: 1,
    duration_minutes: null,
    planned_duration_minutes: null,
    start_local: null as string | null,
    end_local: null as string | null,
    deleted_at: null,
    location: cohortState.published,
  } satisfies VisitFormContext['visit'];
}

export function fields(l: PlanLocation): FormValues {
  return {
    name: l.name,
    description: l.description,
    notes: l.notes,
    address: l.address,
    website: l.website,
    phone: l.phone,
    latitude: l.latitude,
    longitude: l.longitude,
    family_place_category_id: l.category?.id ?? null,
  };
}

function projectFixtureLocation(values: FormValues): PlanLocation {
  const { name, family_place_category_id: _categoryId, ...details } = values;
  return { ...cohortState.published, ...details, name: name?.trim() || catalogName };
}

function publishLocation(values: FormValues) {
  const next = projectFixtureLocation(values);
  Object.assign(cohortState.published, next, { revision: next.revision + 1 });
}

export function currentValues(layer: 'published' | 'myDraft'): VisitFormValues {
  return layer === 'myDraft' && cohortState.privateValues
    ? structuredClone(cohortState.privateValues)
    : {
        location: fields(cohortState.published),
        visit_notes: cohortState.publishedVisit.explanations,
        clocks: {
          start: cohortState.publishedVisit.start_local?.slice(11, 16) ?? null,
          end: cohortState.publishedVisit.end_local?.slice(11, 16) ?? null,
        },
      };
}

export function withClocks(v: typeof cohortState.publishedVisit, clocks: VisitFormValues['clocks']) {
  const start = clocks.start ? `${v.planning_day}T${clocks.start}:00` : null;
  const end = clocks.end ? `${v.planning_day}T${clocks.end}:00` : null;
  // The fixture's Mexico City visits use UTC-06:00.
  return {
    ...v,
    timing_kind: start || end ? ('timed' as const) : ('untimed' as const),
    start_local: start ? `${start}.000000` : null,
    end_local: end ? `${end}.000000` : null,
    starts_at: start ? new Date(`${start}-06:00`).toISOString() : null,
    ends_at: end ? new Date(`${end}-06:00`).toISOString() : null,
    time_zone: start || end ? clockZone : null,
  };
}

export function context(layer: 'published' | 'myDraft'): VisitFormContext {
  const values = currentValues(layer),
    locationShown = projectFixtureLocation(values.location),
    pub = { ...cohortState.publishedVisit, location: structuredClone(cohortState.published) },
    shown = { ...withClocks(pub, values.clocks), explanations: values.visit_notes, location: locationShown };
  return {
    version: 1,
    layer,
    location: locationShown,
    published_location: structuredClone(cohortState.published),
    visit: shown,
    published_visit: pub,
    clock_zone: clockZone,
    observation: {
      version: 1,
      layer,
      location: {
        version: 1,
        trip_id: trip,
        location_id: location,
        family_id: family,
        user_id: cohortState.session.userId,
        person_id: cohortState.session.personId,
        revision: cohortState.published.revision,
        layer: 'published',
        draft: null,
        published: fields(cohortState.published),
        shown: fields(locationShown),
      },
      visit_id: visit,
      visit_revision: cohortState.publishedVisit.revision,
      draft:
        layer === 'myDraft' && cohortState.privateValues
          ? {
              op_id: uuid(100 + cohortState.draftIndex),
              payload_sha256: String(cohortState.draftIndex).padStart(64, '0'),
            }
          : null,
      shown_visit: shown,
      published_visit: pub,
      clock_zone: clockZone,
    },
  };
}

export function initializeBoundary() {
  db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_family_trip_location_form_v1') {
      const c = context('published');
      return {
        data: {
          version: 1,
          layer: 'published',
          location: c.location,
          published_location: c.published_location,
          observation: c.observation.location,
        },
        error: null,
      };
    }
    if (name === 'get_family_trip_visit_form_v1')
      return { data: context(args.p_layer as 'published' | 'myDraft'), error: null };
    if (name !== 'save_family_trip_visit_form_v1') throw new Error('Unexpected RPC ' + name);
    if (cohortState.deny) return { data: null, error: cohortState.deny };
    const o = args.p_observation as VisitFormObservation,
      f = args.p_form as VisitFormValues,
      key = String(args.p_operation_id),
      hash = JSON.stringify([o, f]),
      prior = receipts.get(key);
    if (prior && prior.hash !== hash) return { data: null, error: { code: '40001' } };
    if (!prior) {
      if (
        o.visit_revision !== cohortState.publishedVisit.revision ||
        o.location.revision !== cohortState.published.revision ||
        JSON.stringify(o.draft) !== JSON.stringify(context(o.layer).observation.draft)
      )
        return { data: null, error: { code: '40001' } };
      const norm = (v: unknown) => (typeof v === 'string' ? v.trim() || null : v);
      const next = currentValues(o.layer).location;
      let locChanged = false;
      for (const k of Object.keys(f.location) as (keyof FormValues)[])
        if (norm(f.location[k]) !== norm(o.location.shown[k])) {
          Object.assign(next, { [k]: norm(f.location[k]) });
          locChanged = true;
        }
      const clockChanged =
        JSON.stringify(f.clocks) !==
        JSON.stringify({
          start: o.shown_visit.start_local?.slice(11, 16) ?? null,
          end: o.shown_visit.end_local?.slice(11, 16) ?? null,
        });
      const visitChanged = norm(f.visit_notes) !== norm(o.shown_visit.explanations) || clockChanged,
        changed = locChanged || visitChanged;
      if (o.layer === 'published' && changed) {
        if (locChanged) publishLocation(next);
        if (visitChanged)
          cohortState.publishedVisit = {
            ...withClocks(cohortState.publishedVisit, f.clocks),
            explanations: norm(f.visit_notes) as string | null,
            revision: cohortState.publishedVisit.revision + 1,
          };
      } else if (o.layer === 'myDraft' && changed) {
        cohortState.privateValues = {
          ...structuredClone(f),
          location: next,
        };
        cohortState.draftIndex++;
      }
      receipts.set(key, {
        hash,
        result: {
          version: 1,
          visit_id: visit,
          location_id: location,
          state: o.layer === 'published' ? 'published' : 'draft',
          changed,
          places_intent: locChanged,
          visit_revision: cohortState.publishedVisit.revision,
          location_revision: cohortState.published.revision,
          draft_id: o.layer === 'myDraft' && cohortState.privateValues ? uuid(80) : null,
          op_id: o.layer === 'myDraft' && cohortState.privateValues ? uuid(100 + cohortState.draftIndex) : null,
        },
      });
    }
    if (cohortState.switchScope) {
      cohortState.session = { ...cohortState.session, personId: uuid(99) };
      cohortState.repo.acceptSession(cohortState.session);
    }
    if (cohortState.loseAck) {
      cohortState.loseAck = false;
      return { data: null, error: { message: 'Lost acknowledgement' } };
    }
    return { data: receipts.get(key)?.result, error: null };
  });
}

export function snapshot(layer: string) {
  const c = context(layer as 'published' | 'myDraft'),
    shown = c.visit;
  const repeat = { ...structuredClone(cohortState.repeatVisit), location: c.location };
  const base = {
    version: 1,
    scope: {
      user_id: cohortState.session.userId,
      family_id: cohortState.session.familyId,
      person_id: cohortState.session.personId,
      trip_id: trip,
      layer,
    },
    draft_token: layer === 'published' ? null : String(cohortState.draftIndex).padStart(64, '0'),
    state: {
      version: 1,
      trip_id: trip,
      family_id: family,
      trip_revision: 1,
      locations: [c.location],
      visits: [shown, repeat],
      days: [{ id: day, trip_id: trip, civil_day: '2027-04-01', day_index: 1, title: 'First day', updated_at: at }],
      notes: structuredClone(contentNotes),
      destinations: [],
    },
    operations:
      layer === 'myDraft' && cohortState.privateValues
        ? [
            {
              op_id: uuid(100 + cohortState.draftIndex),
              status: 'projected',
              target_id: cohortState.privateKind === 'visit' ? visit : location,
              payload: {
                contract: 'family.plan_change.v2',
                domain: cohortState.privateKind,
                action: cohortState.privateKind === 'visit' ? 'edit_entry' : 'update',
                changes: cohortState.privateValues,
              },
            },
          ]
        : [],
    bindings:
      layer === 'myDraft' && cohortState.privateValues
        ? [
            {
              op_id: uuid(100 + cohortState.draftIndex),
              domain: cohortState.privateKind,
              action: cohortState.privateKind === 'visit' ? 'edit_entry' : 'update',
              location_id: location,
              visit_id: cohortState.privateKind === 'visit' ? visit : null,
              virtual_location: false,
              virtual_visit: false,
            },
          ]
        : [],
    readiness: { ready: true, blockers: [] },
  };
  return withCalendar(withArrangement(withCreation(base, layer), layer));
}

export function poolContext(layer: 'published' | 'myDraft') {
  const c = context(layer);
  return {
    version: 1,
    layer,
    location: c.location,
    published_location: c.published_location,
    observation: {
      ...c.observation.location,
      layer,
      draft:
        layer === 'myDraft' && cohortState.privateValues
          ? {
              op_id: uuid(100 + cohortState.draftIndex),
              payload_sha256: String(cohortState.draftIndex).padStart(64, '0'),
            }
          : null,
    },
  };
}

export function savePool(args: Record<string, unknown>) {
  const o = args.p_observation as import('../../../src/integrations/family/locationFormContract').FormObservation,
    f = args.p_form as FormValues;
  if (o.revision !== cohortState.published.revision) return { data: null, error: { code: '40001' } };
  const changed = JSON.stringify(f) !== JSON.stringify(o.shown);
  if (changed) {
    if (o.layer === 'published') publishLocation(f);
    else {
      cohortState.privateValues = { ...currentValues('myDraft'), location: f };
      cohortState.draftIndex++;
      cohortState.privateKind = 'location';
    }
  }
  return {
    data: {
      version: 1,
      location_id: location,
      state: o.layer === 'published' ? 'published' : 'draft',
      changed,
      revision: cohortState.published.revision,
      draft_id: o.layer === 'myDraft' ? uuid(80) : null,
      op_id: o.layer === 'myDraft' ? uuid(100 + cohortState.draftIndex) : null,
    },
    error: null,
  };
}

export function request(selected = true) {
  const s = useTripStore.getState();
  return {
    tripId: required(s.trip).id,
    place: s.places[0],
    assignmentId: selected ? s.assignments[String(s.days[0].id)][0].id : null,
  };
}

export function form(
  editor: Awaited<ReturnType<typeof cohortState.cohort.openEditor>>,
  over: Partial<PlaceSubmitData> = {}
) {
  return { ...placeFormPayload(placeEditForm(editor.place, editor.assignment), [], editor.assignment), ...over };
}

export async function load(layer: 'published' | 'myDraft' = 'published') {
  cohortState.repo.setLayer(trip, layer);
  await useTripStore.getState().loadTrip(trip);
}

export function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing fixture value');
  return value;
}

export async function heldCohortView() {
  const impl = required(db.rpc.getMockImplementation());
  let entered = false,
    finish!: () => void;
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  db.rpc.mockImplementation(async (name, args) => {
    if (name === 'get_family_trip_planner_view_v1') {
      entered = true;
      await held;
    }
    return impl(name, args);
  });
  return { finish: () => finish(), entered: () => entered };
}

export async function cohortCommand(status: 'pending' | 'syncing' | 'failed' | 'conflict' = 'pending') {
  const id = required(useTripStore.getState().trip).id;
  const row = {
    id: crypto.randomUUID(),
    tripId: id,
    method: 'POST' as const,
    url: `/trips/${trip}/family/planner-editor-command`,
    body: { operation_id: uuid(991), private_form: 'Keep exactly' },
    status,
    attempts: 3,
    createdAt: 1,
    lastError: null,
    baseUpdatedAt: 'Original base',
    schemaVersion: 2,
  };
  await offlineDb.mutationQueue.put(row);
  return row;
}

export function expectVisibleRetained(before: ReturnType<typeof useTripStore.getState>) {
  const after = useTripStore.getState();
  for (const key of [
    'trip',
    'places',
    'days',
    'assignments',
    'dayNotes',
    'budgetItems',
    'reservations',
    'files',
    'packingItems',
    'todoItems',
  ] as const)
    expect(after[key]).toBe(before[key]);
  expect(after.selectedDayId).toBe(before.selectedDayId);
}

export async function startupTaskGate() {
  const original = required(db.rpc.getMockImplementation());
  let finish!: () => void,
    entered = false;
  const hold = new Promise<void>((resolve) => {
    finish = resolve;
  });
  db.rpc.mockImplementation(async (name, args) => {
    if (name === 'get_family_trip_tasks_v1') {
      entered = true;
      await hold;
    }
    return original(name, args);
  });
  return { finish: () => finish(), entered: () => entered };
}

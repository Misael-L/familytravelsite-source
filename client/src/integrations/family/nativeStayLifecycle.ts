import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import type { AccommodationUpdateRequest } from '@trek/shared';
import { currentPlannerReadPort } from '../../repo/plannerReadPort';
import type { PlannerStayWritePort } from '../../repo/plannerStayPort';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { captureWriteSession } from '../../sync/writeSession';
import type { Accommodation } from '../../types';
import type { BookingStayView } from './bookingStayContract';
import { nativeStayControlsQualificationEnabled } from './coherentStayQualification';
import { NativeStayCommandSession, type NativeStaySessionEnvironment } from './nativeStayCommandSession';
import { originalNativeStayIntent, type NativeStayEnvelope, type nativeStayTrash } from './nativeStayContract';
import { originalNativeStay, originalNativeStayCohort } from './nativeStayObservation';
import { nativeStayPatch, nativeStayRefusal } from './nativeStayPatch';
import { createNativeStayTransport } from './nativeStayTransport';
import type { FamilyFrontendRepository } from './repository';
import { stayJson, stayScope, type StayEnvelope } from './stayContract';
import { createStayTransport } from './stayTransport';

type Environment = NativeStaySessionEnvironment & { allowed: () => boolean };
type TrashItem = ReturnType<typeof nativeStayTrash.parse>['items'][number];
type Action = 'save' | 'trash' | 'restore';
type Selection = Accommodation | TrashItem;
type Port = Required<Pick<PlannerStayWritePort, 'update' | 'trash' | 'trashPage' | 'restore'>>;
/** Local candidate only. Installation requires combined creation/lifecycle/Trash/browser qualification. */
export function createNativeStayLifecycle(repo: FamilyFrontendRepository, env: Environment): Port {
  const trashRows = new WeakMap<TrashItem, { original: TrashItem; opening: ReturnType<typeof opening> }>();
  let active: { key: string; selected: Selection; prepared: ReturnType<typeof prepare> } | null = null;
  const available = () => nativeStayControlsQualificationEnabled() && !env.disposed() && env.allowed();
  async function run(
    trip: number | string,
    action: Action,
    selected: Selection,
    body: AccommodationUpdateRequest = {},
    keep = false
  ) {
    if (!available()) throw nativeStayRefusal('Lodging changes are unavailable in this session.');
    const key = stayJson({ trip, action, body, keep });
    if (active && (active.key !== key || active.selected !== selected))
      throw nativeStayRefusal('Resolve the original retained lodging change first.');
    if (!active) {
      const origin = action === 'restore' ? trashRows.get(selected as TrashItem) : undefined;
      active = {
        key,
        selected,
        prepared: prepare(repo, env, { trip, action, row: selected, body: structuredClone(body), keep, trash: origin }),
      };
    }
    const own = active;
    let preparedForRetry: Awaited<ReturnType<typeof prepare>> | undefined;
    try {
      const prepared = await own.prepared;
      preparedForRetry = prepared;
      const result = await prepared.channel.submit();
      if (result.status !== 'committed') throw nativeStayRefusal('The original lodging change is unresolved.');
      prepared.owner.assertCurrent();
      const fresh = currentPlannerReadPort()
        ?.currentStays?.(trip)
        ?.accommodations.find((a) => a.id === prepared.id);
      confirmResult(action, fresh);
      if (active === own) active = null;
      return fresh;
    } catch (error) {
      if ((await canForget(preparedForRetry)) && active === own) active = null;
      throw error;
    }
  }
  return {
    async update(trip, id, body, observed) {
      if (!observed || observed.id !== id) throw nativeStayRefusal('Reopen the original lodging editor.');
      const row = await run(trip, 'save', observed, body);
      if (!row) throw nativeStayRefusal('The saved lodging is unavailable.');
      return { accommodation: row };
    },
    async trash(trip, id, keepStop, observed) {
      if (!observed || observed.id !== id || typeof keepStop !== 'boolean')
        throw nativeStayRefusal('Select the original lodging and removal choice.');
      await run(trip, 'trash', observed, {}, keepStop);
      return {};
    },
    async trashPage(trip, cursor = null) {
      const own = opening(repo, env, trip);
      await own.check();
      const page = await createNativeStayTransport().trash(own.core.trip_id, cursor);
      await own.check();
      for (const row of page.items) trashRows.set(row, { original: structuredClone(row), opening: own });
      return page;
    },
    async restore(trip, row) {
      await run(trip, 'restore', row);
    },
  };
}
function opening(
  repo: FamilyFrontendRepository,
  env: Environment,
  trip: number | string,
  originalCore?: BookingStayView
) {
  const owner = captureWriteSession(),
    context = repo.captureContext(undefined, { revision: false }),
    source = env.source();
  const rows = currentPlannerReadPort()?.currentStays?.(trip)?.accommodations;
  const witness = rows && originalNativeStayCohort(rows),
    core = originalCore ?? witness?.core;
  if (!core || !witness) throw nativeStayRefusal('Load the original complete published Trip first.');
  const check = async () => {
    const guard = () => {
      owner.assertCurrent();
      context.assertCurrent();
      const current = currentPlannerReadPort()?.currentStays?.(trip)?.accommodations;
      const now = current && originalNativeStayCohort(current);
      if (
        !nativeStayControlsQualificationEnabled() ||
        env.disposed() ||
        env.source() !== source ||
        !env.allowed() ||
        !current ||
        !now ||
        stayJson(now.core) !== stayJson(core) ||
        stayJson(current) !== stayJson(now.native)
      )
        throw nativeStayRefusal('The original lodging, Trip or permission changed.');
    };
    guard();
    await witness.fence();
    guard();
  };
  return { core, owner, source, check };
}
type Request = {
  trip: number | string;
  action: Action;
  row: Selection;
  body: AccommodationUpdateRequest;
  keep: boolean;
  trash?: { original: TrashItem; opening: ReturnType<typeof opening> };
};
async function canForget(p: Awaited<ReturnType<typeof prepare>> | undefined) {
  if (!p) return true;
  return p.owner.current() && !(await p.owner.db.mutationQueue.get(p.operation));
}
function confirmResult(action: Action, fresh: Accommodation | undefined) {
  if ((action === 'trash') !== (fresh === undefined))
    throw nativeStayRefusal('Change confirmed; reopen this Trip to read its current lodging.');
}
function originalSelection(r: Request) {
  if (r.action === 'restore') {
    if (!r.trash || stayJson(r.row) !== stayJson(r.trash.original) || !r.trash.original.restore_available)
      throw nativeStayRefusal('Select an original confirmed Trash record.');
    return { action: r.action, trash: r.trash } as const;
  }
  const witness = originalNativeStay(r.row as Accommodation);
  if (!witness || stayJson(r.row) !== stayJson(witness.native))
    throw nativeStayRefusal('Select an original live lodging.');
  return { action: r.action, row: witness.native, core: witness.core } as const;
}
async function prepare(repo: FamilyFrontendRepository, env: Environment, r: Request) {
  const selected = originalSelection(r),
    own = selected.action === 'restore' ? selected.trash.opening : opening(repo, env, r.trip, selected.core);
  const beforeRetain = async () => {
    await own.check();
    if (await own.owner.db.importFiles.count())
      throw nativeStayRefusal('Resolve staged imports before changing this lodging.');
    await own.check();
  };
  await beforeRetain();
  // Initial online context includes raw owned-arrival facts absent from the DTO. Compare displayed facts/revisions;
  // retain once and never fetch replacement observations when retrying.
  if (isEffectivelyOffline())
    throw nativeStayRefusal('Go online to prepare the original lodging change. Retained changes can still be retried.');
  const ids = (await repo.views()).ids,
    uuid = await repo.tripUuid(r.trip),
    auth = await stayAuthIdentity();
  await own.check();
  if (uuid !== own.core.trip_id || own.core.user_id !== auth.user_id)
    throw nativeStayRefusal('The lodging actor or Trip changed.');
  const id = selected.action === 'restore' ? selected.trash.original.id : ids.uuid('stay', selected.row.id);
  const scope = stayScope.parse({
    version: 1,
    layer: 'published',
    trip_id: uuid,
    family_id: own.core.family_id,
    user_id: own.core.user_id,
    person_id: own.core.person_id,
    session_id: auth.session_id,
  });
  const changes = selected.action === 'save' ? nativeStayPatch(r.body, selected.row, own.core, ids) : {};
  const old = own.core.stays.find((s) => s.stay.id === id),
    location = changes.location_id ?? old?.stay.location_id ?? null;
  if (r.action === 'save') inheritClockZone(changes, old, own.core);
  const ctx = await createStayTransport().context(scope, id, location, null);
  await own.check();
  validateContext(ctx, own.core, r, changes, id);
  const inner: StayEnvelope['command'] = {
    action: r.action,
    operation_id: crypto.randomUUID(),
    stay_id: id,
    scope,
    observation: ctx.observation,
    changes,
    reservation_id: null,
  };
  const packet = await createNativeStayTransport().context(own.source, inner, crypto.randomUUID(), r.keep);
  await own.check();
  validateArrival(packet, own.core, r.action);
  return {
    owner: own.owner,
    operation: inner.operation_id,
    id: ids.register('stay', id),
    channel: new NativeStayCommandSession(repo, { ...env, beforeRetain }, originalNativeStayIntent(packet)),
  };
}
function validateContext(
  ctx: Awaited<ReturnType<ReturnType<typeof createStayTransport>['context']>>,
  core: BookingStayView,
  r: Request,
  changes: StayEnvelope['command']['changes'],
  id: string
) {
  const projection = ctx.observation.stay;
  if (
    !projection ||
    !ctx.admission[r.action] ||
    ctx.observation.trip_revision !== core.trip_revision ||
    ctx.state !== (r.action === 'restore' ? 'trash' : 'active')
  )
    throw nativeStayRefusal('The original lodging change is unavailable or stale.');
  if (r.action === 'restore') validateRestore(projection, r.trash?.original);
  else if (stayJson(projection) !== stayJson(core.stays.find((s) => s.stay.id === id)))
    throw nativeStayRefusal('The original lodging changed; reopen its editor.');
  const selected = core.planner.state.locations.find(
    (l) => l.id === (changes.location_id ?? projection.stay.location_id)
  );
  if (!selected || stayJson(ctx.observation.candidate_location) !== stayJson(selected))
    throw nativeStayRefusal('The original lodging source changed.');
}
function validateRestore(p: BookingStayView['stays'][number], original: TrashItem | undefined) {
  if (
    !original ||
    p.stay.revision !== original.revision ||
    p.stay.deleted_at !== original.deleted_at ||
    p.stay.arrival_date !== original.arrival_date ||
    p.stay.departure_date !== original.departure_date ||
    p.location.name !== original.name
  )
    throw nativeStayRefusal('This Trash record changed. Reload Trash before restoring.');
}
function validateArrival(p: NativeStayEnvelope, core: BookingStayView, action: Action) {
  const o = p.command.observation,
    i = p.command.inner;
  if ('format' in i || !i.observation.stay) throw nativeStayRefusal('Original existing lodging required.');
  const date = i.changes.arrival_date ?? i.observation.stay.stay.arrival_date;
  const day = core.days.find((d) => d.civil_day === date);
  const visits = core.planner.state.visits;
  const rows = visits
    .filter((v) => v.deleted_at === null && v.trip_day_id === day?.id)
    .map((v) => ({
      id: v.id,
      revision: v.revision,
      order: v.sort_order,
      location_id: v.plan_location_id,
      timing_kind: v.timing_kind,
      starts_at: v.starts_at,
      time_zone: v.time_zone,
      owning_stay_id: v.owning_stay_id ?? null,
    }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (
    !day ||
    o.day_id !== day.id ||
    o.trip_revision !== core.trip_revision ||
    stayJson(o.day_visits) !== stayJson(rows)
  )
    throw nativeStayRefusal('The original arrival plan changed; reopen the lodging action.');
  if (action === 'restore') return; // The exact retained raw trashed visit is an initial online context fact.
  const owned = visits.find((v) => v.owning_stay_id === p.command.stay_id),
    raw = o.owned_visit;
  if (!!owned !== !!raw) throw nativeStayRefusal('The original arrival ownership changed.');
  if (owned && raw) {
    const pairs: [string, unknown][] = [
      ['id', owned.id],
      ['trip_id', owned.trip_id],
      ['plan_location_id', owned.plan_location_id],
      ['trip_day_id', owned.trip_day_id],
      ['visit_revision', owned.revision],
      ['sort_order', owned.sort_order],
      ['timing_kind', owned.timing_kind],
      ['starts_at', owned.starts_at],
      ['ends_at', owned.ends_at],
      ['time_zone', owned.time_zone],
      ['explanations', owned.explanations],
      ['deleted_at', owned.deleted_at],
    ];
    if (pairs.some(([key, value]) => stayJson(raw[key]) !== stayJson(value)))
      throw nativeStayRefusal('The original owned arrival changed.');
  }
}

function inheritClockZone(
  changes: StayEnvelope['command']['changes'],
  old: BookingStayView['stays'][number] | undefined,
  core: BookingStayView
) {
  const explicit = [changes.check_in_time, changes.check_in_window_end, changes.check_out_time].some((t) => t != null);
  if (!explicit || !old || old.stay.time_zone) return;
  const location = core.planner.state.locations.find((l) => l.id === (changes.location_id ?? old.stay.location_id));
  if (!location?.time_zone) throw nativeStayRefusal('A known lodging time zone is required for local clock guidance.');
  changes.time_zone = location.time_zone;
}

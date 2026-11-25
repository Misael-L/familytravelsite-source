import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import { accommodationCreateRequestSchema, type AccommodationCreateRequest } from '@trek/shared';
import { currentPlannerReadPort } from '../../repo/plannerReadPort';
import type { PlannerStayWritePort } from '../../repo/plannerStayPort';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { captureWriteSession } from '../../sync/writeSession';
import type { Accommodation } from '../../types';
import type { BookingStayView } from './bookingStayContract';
import { nativeStayControlsQualificationEnabled } from './coherentStayQualification';
import type { FamilyIdentityRegistry } from './identity';
import { NativeStayCommandSession, type NativeStaySessionEnvironment } from './nativeStayCommandSession';
import { originalNativeStayIntent, type NativeStayEnvelope } from './nativeStayContract';
import { originalNativeStayCohort } from './nativeStayObservation';
import { nativeStayRefusal } from './nativeStayPatch';
import { createNativeStayTransport } from './nativeStayTransport';
import type { FamilyFrontendRepository } from './repository';
import { originalStayBundle } from './stayBundleContract';
import { createStayBundleTransport } from './stayBundleTransport';
import { stayJson, stayPatch, stayScope } from './stayContract';

type CreationPort = Required<Pick<PlannerStayWritePort, 'create' | 'captureCreation' | 'eligibleLodging'>>;
type Environment = NativeStaySessionEnvironment & { allowed: () => boolean };
const nativeId = (id: unknown) => {
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
    throw nativeStayRefusal('Choose an original saved lodging and Trip days.');
  return id;
};
/** Native request normalization happens once, before original command retention. No timestamp or source identity is fabricated. */
export function nativeStayCreationDraft(
  raw: AccommodationCreateRequest,
  core: BookingStayView,
  ids: FamilyIdentityRegistry
) {
  const body = accommodationCreateRequestSchema.strict().parse(raw),
    location = core.planner.state.locations.find((l) => l.id === ids.uuid('place', nativeId(body.place_id))),
    arrival = core.days.find((d) => d.id === ids.uuid('day', nativeId(body.start_day_id))),
    departure = core.days.find((d) => d.id === ids.uuid('day', nativeId(body.end_day_id)));
  if (!eligibleOriginalLodging(location) || !arrival || !departure || departure.civil_day < arrival.civil_day)
    throw nativeStayRefusal('Choose an available saved hotel/manual lodging and the original Trip calendar.');
  const patch = stayPatch.parse({
    location_id: location.id,
    arrival_date: arrival.civil_day,
    departure_date: departure.civil_day,
    check_in_time: body.check_in ?? null,
    check_in_window_end: body.check_in_end ?? null,
    check_out_time: body.check_out ?? null,
    notes: body.notes ?? null,
  });
  const hasClocks = checkCreationClocks(patch, location);
  return {
    location,
    arrival,
    departure,
    stay: {
      ...patch,
      location_id: location.id,
      arrival_date: arrival.civil_day,
      departure_date: departure.civil_day,
      time_zone: hasClocks ? location.time_zone : null,
    },
    confirmation: body.confirmation ?? null,
  };
}
/** Candidate only: normal cohort installation remains gated until native lifecycle, reachable Trash and browser acceptance qualify together. */
export function createNativeStayCreation(repo: FamilyFrontendRepository, env: Environment): CreationPort {
  let active: {
    rows: Accommodation[];
    trip: string;
    body: string;
    prepared: ReturnType<typeof prepareCreation>;
  } | null = null;
  const available = () => nativeStayControlsQualificationEnabled() && !env.disposed();
  return {
    captureCreation(trip) {
      if (!available()) return undefined;
      const rows = currentPlannerReadPort()?.currentStays?.(trip)?.accommodations;
      return rows && originalNativeStayCohort(rows) ? rows : undefined;
    },
    eligibleLodging(placeId) {
      if (!available()) return false;
      const ids = repo.knownViews()?.ids;
      if (!ids) return false;
      try {
        const location = ids.uuid('place', placeId);
        // Only the original live published cohort may supply eligible identities.
        const trip = repo.knownViews()?.ids.uuid('trip', useTripStore.getState().trip?.id ?? 0);
        const rows = trip ? currentPlannerReadPort()?.currentStays?.(trip)?.accommodations : undefined;
        return (
          !!rows &&
          !!originalNativeStayCohort(rows)?.core.planner.state.locations.some(
            (l) => l.id === location && eligibleOriginalLodging(l)
          )
        );
      } catch {
        return false;
      }
    },
    async create(trip, body, observed) {
      if (!available() || !observed) throw nativeStayRefusal('Reopen the original native lodging form.');
      const raw = structuredClone(body),
        key = stayJson(raw);
      if (active && (active.rows !== observed || active.trip !== String(trip) || active.body !== key))
        throw nativeStayRefusal('Resolve the original retained lodging creation first.');
      if (!active)
        active = {
          rows: observed,
          trip: String(trip),
          body: key,
          prepared: prepareCreation(repo, env, trip, raw, observed),
        };
      const own = active;
      let preparedForRetry: Awaited<ReturnType<typeof prepareCreation>> | undefined;
      try {
        const prepared = await own.prepared;
        preparedForRetry = prepared;
        const result = await prepared.channel.submit();
        if (result.status !== 'committed')
          throw nativeStayRefusal('The original lodging creation was cancelled or remains unresolved.');
        prepared.owner.assertCurrent();
        const accommodation = currentPlannerReadPort()
          ?.currentStays?.(trip)
          ?.accommodations.find((a) => a.id === prepared.id);
        if (!accommodation) throw nativeStayRefusal('Save confirmed; reopen this Trip to load the current stay.');
        if (active === own) active = null;
        return { accommodation };
      } catch (error) {
        if (
          !preparedForRetry ||
          (preparedForRetry.owner.current() &&
            !(await preparedForRetry.owner.db.mutationQueue.get(preparedForRetry.operation)))
        )
          if (active === own) active = null;
        throw error;
      }
    },
  };
}
async function prepareCreation(
  repo: FamilyFrontendRepository,
  env: Environment,
  trip: number | string,
  raw: AccommodationCreateRequest,
  rows: Accommodation[]
) {
  const owner = captureWriteSession(),
    origin = env.source(),
    context = repo.captureContext(undefined, { revision: false }),
    witness = originalNativeStayCohort(rows);
  const check = async () => {
    owner.assertCurrent();
    context.assertCurrent();
    if (
      !nativeStayControlsQualificationEnabled() ||
      env.disposed() ||
      origin !== env.source() ||
      !env.allowed() ||
      !witness ||
      !sameCreationCohort(currentPlannerReadPort()?.currentStays?.(trip)?.accommodations, rows) ||
      stayJson(rows) !== stayJson(witness.native)
    )
      throw nativeStayRefusal('The original lodging form, permission or Trip changed.');
    await witness.fence();
    owner.assertCurrent();
    context.assertCurrent();
  };
  await check();
  if (!witness) throw nativeStayRefusal('Original live lodging observation required.');
  if (await owner.db.importFiles.count()) throw nativeStayRefusal('Resolve staged imports before creating this stay.');
  await check();
  const uuid = await repo.tripUuid(trip),
    ids = (await repo.views()).ids,
    auth = await stayAuthIdentity();
  await check();
  const core = witness.core;
  if (core.trip_id !== uuid || core.user_id !== auth.user_id)
    throw nativeStayRefusal('The original lodging actor or Trip changed.');
  const draft = nativeStayCreationDraft(raw, core, ids),
    scope = stayScope.parse({
      version: 1,
      layer: 'published',
      trip_id: uuid,
      family_id: core.family_id,
      user_id: core.user_id,
      person_id: core.person_id,
      session_id: auth.session_id,
    });
  const packet = creationIntent(core, draft, scope, origin);
  if (!isEffectivelyOffline()) await confirmCreationIntent(packet, check);
  await check();
  const beforeRetain = async () => {
    await check();
    if (await owner.db.importFiles.count())
      throw nativeStayRefusal('Resolve staged imports before creating this stay.');
    await check();
  };
  return {
    owner,
    id: ids.register('stay', packet.command.stay_id),
    operation: packet.command.operation_id,
    channel: new NativeStayCommandSession(repo, { ...env, beforeRetain }, packet),
  };
}

function sameCreationCohort(current: Accommodation[] | undefined, original: Accommodation[]) {
  if (!current) return false;
  if (current === original) return true;
  const a = originalNativeStayCohort(current),
    b = originalNativeStayCohort(original);
  return (
    !!a &&
    !!b &&
    stayJson(a.core) === stayJson(b.core) &&
    stayJson(a.native) === stayJson(b.native) &&
    stayJson(current) === stayJson(a.native)
  );
}

function creationIntent(
  core: BookingStayView,
  draft: ReturnType<typeof nativeStayCreationDraft>,
  scope: ReturnType<typeof stayScope.parse>,
  origin: string
) {
  const stay_id = crypto.randomUUID(),
    reservation_id = crypto.randomUUID(),
    operation_id = crypto.randomUUID(),
    arrival_visit_id = crypto.randomUUID();
  const observation = {
    trip_revision: core.trip_revision,
    candidate_location: draft.location,
    arrival_day: draft.arrival,
    departure_day: draft.departure,
    stay_absent: true,
    reservation_absent: true,
  };
  const inner = originalStayBundle({
    version: 1,
    source_url: origin,
    command: {
      format: 'family.stay-bundle.v1',
      operation_id,
      scope,
      stay_id,
      reservation_id,
      observation,
      stay: draft.stay,
      reservation: { title: draft.location.name, status: 'pending', confirmation_code: draft.confirmation || null },
    },
  });
  const visits = core.planner.state.visits
    .filter((v) => v.deleted_at === null && v.trip_day_id === draft.arrival.id)
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
  return originalNativeStayIntent({
    version: 1,
    source_url: origin,
    command: {
      format: 'family.native-stay.v1',
      operation_id,
      scope,
      stay_id,
      inner: inner.command,
      arrival_visit_id,
      keep_stop: false,
      observation: {
        trip_revision: core.trip_revision,
        day_id: draft.arrival.id,
        location_id: draft.location.id,
        owned_visit: null,
        day_visits: visits,
      },
    },
  });
}
async function confirmCreationIntent(packet: NativeStayEnvelope, check: () => Promise<void>) {
  const i = packet.command.inner;
  if (!('format' in i)) throw nativeStayRefusal('Original creation command required.');
  const context = await createStayBundleTransport().context(i.scope, {
    p_location_id: i.stay.location_id,
    p_arrival_day_id: i.observation.arrival_day.id,
    p_departure_day_id: i.observation.departure_day.id,
    p_stay_id: i.stay_id,
    p_reservation_id: i.reservation_id,
  });
  await check();
  if (!context.admission.create || stayJson(context.observation) !== stayJson(i.observation))
    throw nativeStayRefusal('The lodging, calendar or permission changed; reopen the original form.');
  const outer = await createNativeStayTransport().context(packet.source_url, i, packet.command.arrival_visit_id);
  await check();
  if (stayJson(outer) !== stayJson(packet))
    throw nativeStayRefusal('The arrival plan changed; reopen the original form.');
}

type Lodging = BookingStayView['planner']['state']['locations'][number];
function eligibleOriginalLodging(location: Lodging | undefined): location is Lodging {
  return (
    !!location &&
    ['hotel', 'manual'].includes(location.source.kind) &&
    !location.source_archived &&
    location.deleted_at === null &&
    !!location.name.trim() &&
    (location.source.kind === 'manual' ? location.source.id === null : location.source.id !== null)
  );
}
function checkCreationClocks(patch: ReturnType<typeof stayPatch.parse>, location: Lodging) {
  const clocks = [patch.check_in_time, patch.check_in_window_end, patch.check_out_time];
  if (
    clocks.some((t) => t != null && t.length === 8 && t.slice(6) !== '00') ||
    (patch.check_in_window_end != null &&
      (patch.check_in_time == null ||
        (patch.check_in_window_end.length === 5 ? patch.check_in_window_end + ':00' : patch.check_in_window_end) <
          (patch.check_in_time.length === 5 ? patch.check_in_time + ':00' : patch.check_in_time)))
  )
    throw nativeStayRefusal('This clock precision or overnight window needs a more expressive editor.');
  if (clocks.some((t) => t != null) && !location.time_zone)
    throw nativeStayRefusal('A known lodging time zone is required for local check-in guidance.');
  return clocks.some((t) => t != null);
}

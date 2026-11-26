import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import type { AccommodationUpdateRequest } from '@trek/shared';
import { currentPlannerReadPort } from '../../repo/plannerReadPort';
import type { PlannerStayWritePort } from '../../repo/plannerStayPort';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { captureWriteSession } from '../../sync/writeSession';
import type { Accommodation } from '../../types';
import { originalNativeStay } from './nativeStayObservation';
import { nativeStayPatch, nativeStayRefusal } from './nativeStayPatch';
import type { FamilyFrontendRepository } from './repository';
import { StayCommandSession } from './stayCommandSession';
import { stayEnvelope, stayJson, stayScope, type StayEnvelope } from './stayContract';
import { createStayTransport } from './stayTransport';

type Prepared = {
  packet: ReturnType<typeof stayEnvelope.parse>;
  channel: StayCommandSession;
  confirmed: boolean;
  owner: ReturnType<typeof captureWriteSession>;
};
/** Existing edits only. A native callback cannot create an observation or rebind an old operation. */
export function createNativeStayWriter(
  repo: FamilyFrontendRepository,
  environment: { source: () => string; disposed: () => boolean; hydrate: (trip: number | string) => Promise<void> }
): PlannerStayWritePort {
  let active: { row: Accommodation; body: string; prepared: Promise<Prepared> } | null = null;
  return {
    async update(trip, id, body, observed) {
      if (!observed || observed.id !== id) throw nativeStayRefusal('Reopen the original stay editor before saving.');
      const originalBody = structuredClone(body),
        key = stayJson(originalBody);
      if (active && (active.row !== observed || active.body !== key))
        throw nativeStayRefusal('Resolve the original retained stay save before another edit.');
      if (!active)
        active = { row: observed, body: key, prepared: prepareStay(repo, environment, trip, observed, originalBody) };
      const own = active;
      let p: Prepared | undefined;
      try {
        p = await own.prepared;
        if (!p.confirmed) {
          await p.channel.submit();
          p.confirmed = true;
        }
        await p.channel.reconcile(); // Recheck original actor/session even when a committed response needs another hydration.
        await environment.hydrate(trip);
        p.owner.assertCurrent();
        const fresh = currentPlannerReadPort()
          ?.currentStays?.(trip)
          ?.accommodations.find((r) => r.id === id);
        if (!fresh) throw nativeStayRefusal('Save confirmed; reload this Trip to read its current stay.');
        active = null;
        return { accommodation: fresh }; // Always a new canonical cohort, never the historical acknowledgement.
      } catch (error) {
        if (
          !p ||
          (!p.confirmed && p.owner.current() && !(await p.owner.db.mutationQueue.get(p.packet.command.operation_id)))
        )
          if (active === own) active = null;
        throw error;
      }
    },
  };
}
async function prepareStay(
  repo: FamilyFrontendRepository,
  env: { source: () => string; disposed: () => boolean },
  trip: number | string,
  row: Accommodation,
  body: AccommodationUpdateRequest
): Promise<Prepared> {
  const witness = originalNativeStay(row),
    owner = captureWriteSession(),
    origin = env.source(),
    context = repo.captureContext(undefined, { revision: false });
  const check = async () => {
    owner.assertCurrent();
    context.assertCurrent();
    if (
      !witness ||
      env.disposed() ||
      origin !== env.source() ||
      !currentPlannerReadPort()?.currentStays?.(trip)?.accommodations.includes(row)
    )
      throw nativeStayRefusal('The stay changed since this editor opened. Reopen it before saving.');
    await witness.fence();
    owner.assertCurrent();
    context.assertCurrent();
  };
  await check();
  if (await owner.db.importFiles.count()) throw nativeStayRefusal('Resolve staged imports before editing this stay.');
  await check();
  if (!witness || stayJson(row) !== stayJson(witness.native))
    throw nativeStayRefusal('This stay has no original live observation.');
  const ids = (await repo.views()).ids,
    uuid = await repo.tripUuid(trip),
    core = witness.core;
  if (core.trip_id !== uuid || row.trip_id !== ids.register('trip', uuid))
    throw nativeStayRefusal('The stay belongs to another Trip.');
  const changes = nativeStayPatch(body, row, core, ids),
    old = core.stays.find((s) => s.stay.id === ids.uuid('stay', row.id));
  if (!old) throw nativeStayRefusal('The original stay is missing.');
  const auth = await stayAuthIdentity();
  await check();
  const scope = stayScope.parse({
    version: 1,
    layer: 'published',
    trip_id: uuid,
    family_id: core.family_id,
    user_id: core.user_id,
    person_id: core.person_id,
    session_id: auth.session_id,
  });
  if (auth.user_id !== scope.user_id) throw nativeStayRefusal('The stay actor changed.');
  const location = changes.location_id ?? old.stay.location_id;
  const candidate = core.planner.state.locations.find((l) => l.id === location);
  let observation: StayEnvelope['command']['observation'] = {
    trip_revision: core.trip_revision,
    stay: old,
    candidate_location: candidate ?? null,
    candidate_booking: null,
  };
  if (!isEffectivelyOffline()) {
    const ctx = await createStayTransport().context(scope, old.stay.id, location, null);
    await check();
    if (!ctx.admission.save || ctx.state !== 'active' || stayJson(ctx.observation) !== stayJson(observation))
      throw nativeStayRefusal('The original stay, lodging or Trip revision changed, or editing is not permitted.');
    observation = ctx.observation;
  }
  // Offline is retained intent only. Its exact already-observed facts confer no write authority; SQL rechecks on retry.
  const packet = stayEnvelope.parse({
    version: 1,
    source_url: origin,
    command: {
      action: 'save',
      stay_id: old.stay.id,
      operation_id: crypto.randomUUID(),
      scope,
      observation,
      changes,
      reservation_id: null,
    },
  });
  return {
    packet,
    owner,
    confirmed: false,
    channel: new StayCommandSession(
      repo,
      {
        ...env,
        beforeRetain: async () => {
          await check();
          if (await owner.db.importFiles.count())
            throw nativeStayRefusal('Resolve staged imports before sending this stay edit.');
          await check();
        },
      },
      packet
    ),
  };
}

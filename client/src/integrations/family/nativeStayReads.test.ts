import { expect, it } from 'vitest';
import { coherentTripCapture, coherentTripData } from '../../../tests/helpers/familyCompleteTripV4';
import { nativeStayFixture } from '../../../tests/helpers/familyNativeStays';
import { checkedBookingStayView } from './bookingStayContract';
import { projectCompleteTrip } from './completeTripProjection';
import { parseCompleteTripV4, serializeCompleteTripV4 } from './completeTripV4';
import { FamilyIdentityRegistry } from './identity';
import { observeNativeStays, originalNativeStay, originalNativeStayCohort } from './nativeStayObservation';
import { checkedNativeStayView } from './nativeStayReadContract';
import { nativeStayReadiness } from './nativeStayReadiness';
import { stayIdentity } from './stayContract';
const check = (p: unknown) => checkedNativeStayView(p, stayIdentity.parse(nativeStayFixture().core));
it('accepts the exact tagged core and rejects it through the old v2 read contract', () => {
  const p = nativeStayFixture();
  expect(check(p)).toEqual(p);
  expect(() => checkedBookingStayView(p.core, stayIdentity.parse(p.core))).toThrow();
  expect(() => check(p.core)).toThrow();
});
it.each(['stay', 'trip', 'location', 'day', 'timed', 'duplicate', 'unknown', 'null_owner'] as const)(
  'refuses inconsistent native ownership %s',
  (kind) => {
    const p = nativeStayFixture(),
      v = p.core.planner.state.visits[0];
    if (kind === 'stay') v.owning_stay_id = crypto.randomUUID();
    if (kind === 'trip') v.trip_id = crypto.randomUUID();
    if (kind === 'location') v.plan_location_id = crypto.randomUUID();
    if (kind === 'day') {
      v.trip_day_id = p.core.days[1].id;
      v.planning_day = p.core.days[1].civil_day;
    }
    if (kind === 'timed') v.starts_at = '2027-04-01T00:00:00Z';
    if (kind === 'duplicate') p.core.planner.state.visits.push({ ...v, id: crypto.randomUUID() });
    if (kind === 'unknown') Object.assign(v, { unknown: true });
    if (kind === 'null_owner') Object.assign(v, { owning_stay_id: null });
    expect(() => check(p)).toThrow();
  }
);
it('does not infer or claim an independent visit at the same venue/day', () => {
  const p = nativeStayFixture();
  delete p.core.planner.state.visits[0].owning_stay_id;
  expect(check(p)).toEqual(p);
});
it('round-trips explicit ownership through the complete read-only offline core and native projection', async () => {
  const p = nativeStayFixture(),
    c = coherentTripCapture(),
    data = coherentTripData(p.core);
  data.native_stay_format = p.format;
  c.data = data;
  const e = await serializeCompleteTripV4(c),
    round = await parseCompleteTripV4(JSON.stringify(e), { ...c, now: c.verifiedAt });
  expect(round.data).toEqual(data);
  expect(round.capabilities.nativeStays).toBe(false);
  const projected = await projectCompleteTrip(round, () => {});
  const a = projected.bundle.days[0].assignments?.[0];
  expect(a?.accommodation_id).toBe(projected.ids.register('stay', p.core.stays[0].stay.id));
  expect(a?.assignment_time).toBeNull();
  expect(a?.notes).toBe('Arrival only');
});
it('refuses an ownership core without the explicit cache dialect marker', async () => {
  const c = coherentTripCapture();
  c.data = coherentTripData(nativeStayFixture().core);
  await expect(serializeCompleteTripV4(c)).rejects.toThrow();
});
it('keeps independent same-venue assignment free of a fabricated accommodation association', async () => {
  const p = nativeStayFixture();
  delete p.core.planner.state.visits[0].owning_stay_id;
  const c = coherentTripCapture();
  c.data = { ...coherentTripData(p.core), native_stay_format: p.format };
  const e = await serializeCompleteTripV4(c);
  const projected = await projectCompleteTrip(e, () => {});
  expect(projected.bundle.days[0].assignments?.[0]).not.toHaveProperty('accommodation_id');
});
it('requires explicit native readiness and keeps old admission strict', () => {
  const p = nativeStayFixture(),
    ids = new FamilyIdentityRegistry(p.core.user_id);
  expect(() => nativeStayReadiness(p.core, ids)).toThrow();
  expect(nativeStayReadiness(p.core, ids, { nativeArrivals: true }).status).toBe('ready');
});
it('remembers an empty published accommodation cohort by array identity', async () => {
  const p = nativeStayFixture();
  p.core.stays = [];
  p.core.bookings = [];
  p.core.planner.state.visits = [];
  const rows: [] = [];
  let checks = 0;
  observeNativeStays(rows, p.core, async () => {
    checks++;
  });
  expect(originalNativeStayCohort([])).toBeUndefined();
  const original = originalNativeStayCohort(rows);
  expect(original?.core.stays).toEqual([]);
  await original?.fence();
  expect(checks).toBe(1);
  if (original) original.core.trip_revision++;
  expect(originalNativeStayCohort(rows)?.core.trip_revision).toBe(p.core.trip_revision);
});
it('protects row and cohort witnesses from caller mutation', () => {
  const p = nativeStayFixture(),
    ready = nativeStayReadiness(p.core, new FamilyIdentityRegistry(p.core.user_id), { nativeArrivals: true });
  if (ready.status !== 'ready') throw Error();
  observeNativeStays(ready.accommodations, p.core, async () => {});
  const row = ready.accommodations[0],
    w = originalNativeStay(row);
  if (!w) throw Error();
  w.core.trip_revision++;
  w.native.notes = 'changed';
  expect(originalNativeStay(row)?.core.trip_revision).toBe(p.core.trip_revision);
  expect(originalNativeStay(row)?.native.notes).not.toBe('changed');
  expect(originalNativeStayCohort(ready.accommodations)?.core.trip_revision).toBe(p.core.trip_revision);
});

it('keeps the original native array observation when a caller mutates published rows', () => {
  const p = nativeStayFixture(),
    ready = nativeStayReadiness(p.core, new FamilyIdentityRegistry(p.core.user_id), { nativeArrivals: true });
  if (ready.status !== 'ready') throw Error();
  const rows = ready.accommodations;
  observeNativeStays(rows, p.core, async () => {});
  const old = structuredClone(rows);
  rows[0].notes = 'unsaved';
  expect(originalNativeStayCohort(rows)?.native).toEqual(old);
});

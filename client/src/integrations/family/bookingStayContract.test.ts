import { expect, it } from 'vitest';
import { bookingStayFixture } from '../../../tests/helpers/familyBookingStays';
import { checkedBookingStayView } from './bookingStayContract';
import { FamilyIdentityRegistry } from './identity';
import { nativeStayReadiness } from './nativeStayReadiness';
import { stayIdentity, stayJson } from './stayContract';
const ids = (p = bookingStayFixture()) => new FamilyIdentityRegistry(p.user_id);
function check(p: unknown) {
  return checkedBookingStayView(p, stayIdentity.parse(bookingStayFixture()));
}
it('preserves one complete canonical observation exactly and keeps native capabilities false', () => {
  const p = bookingStayFixture();
  expect(stayJson(check(p))).toBe(stayJson(p));
  expect(p.capabilities.native_read).toBe(false);
  expect(p.version).toBe(2);
});
it.each(['trip_id', 'family_id', 'user_id', 'person_id'] as const)('refuses foreign %s', (key) => {
  const p = bookingStayFixture();
  p[key] = crypto.randomUUID();
  expect(() => check(p)).toThrow();
});
it.each(['root', 'booking', 'planner'] as const)('refuses an inconsistent %s revision or calendar', (part) => {
  const p = bookingStayFixture();
  if (part === 'root') p.trip_revision++;
  if (part === 'booking') p.days[0].civil_day = '2027-05-01';
  if (part === 'planner') p.planner.state.days[0].id = crypto.randomUUID();
  expect(() => check(p)).toThrow();
});
it('rejects v1/empty placeholder replies and true native activation claims', () => {
  for (const p of [
    { version: 1, stays: [] },
    null,
    { ...bookingStayFixture(), capabilities: { ...bookingStayFixture().capabilities, native_read: true } },
  ])
    expect(() => check(p)).toThrow();
});
it('rejects unknown fields that a nested old schema would otherwise strip', () => {
  const p = bookingStayFixture();
  Object.assign(p.planner.state.locations[0], { future_fact: 'Must not silently disappear' });
  expect(() => check(p)).toThrow();
});
it('preserves unknown private booking metadata and original unclassified timestamp strings', () => {
  const p = bookingStayFixture(),
    b = p.bookings[0];
  b.record.timing_kind = null;
  b.record.starts_at = '2027-04-01T00:00:00.123456Z';
  b.timing_state = 'unclassified';
  b.record.metadata = { future: { nested: ['keep'] } };
  if (!p.stays[0].booking) throw Error('Linked fixture required');
  p.stays[0].booking.record = structuredClone(b.record);
  expect(check(p).bookings[0].record.starts_at).toBe(b.record.starts_at);
  expect(check(p).bookings[0].record.metadata).toEqual(b.record.metadata);
});
it('refuses incorrect timing classification instead of converting midnight to untimed', () => {
  const p = bookingStayFixture();
  p.bookings[0].timing_state = 'timed';
  expect(() => check(p)).toThrow();
});
it.each(['wrong_stay', 'wrong_booking', 'wrong_hotel', 'missing_active', 'duplicate_link'] as const)(
  'refuses %s relationship corruption',
  (kind) => {
    const p = bookingStayFixture();
    if (kind === 'wrong_stay') p.stays[0].stay.trip_id = crypto.randomUUID();
    if (kind === 'wrong_booking') {
      const b = p.stays[0].booking;
      if (!b) throw Error('Expected booking');
      b.record.title += 'Borrowed';
    }
    if (kind === 'wrong_hotel') p.bookings[0].record.hotel_id = crypto.randomUUID();
    if (kind === 'missing_active') p.stays = [];
    if (kind === 'duplicate_link') {
      const b = structuredClone(p.bookings[0]);
      b.record.id = crypto.randomUUID();
      b.dates.reservation_id = b.record.id;
      p.bookings.push(b);
    }
    expect(() => check(p)).toThrow();
  }
);
it('requires exact full lodging and arrival/departure identity facts', () => {
  const p = bookingStayFixture();
  p.stays[0].arrival_day_id = p.stays[0].departure_day_id;
  expect(() => check(p)).toThrow();
  const q = bookingStayFixture();
  q.stays[0].location.name = 'Borrowed';
  expect(() => check(q)).toThrow();
});
it('retained association is visible without any trashed stay private content', () => {
  const p = bookingStayFixture();
  p.stays = [];
  const b = p.bookings[0];
  if (!b.stay_link) throw Error('Expected link');
  b.stay_link.state = 'retained';
  const r = check(p);
  expect(r.bookings[0].stay_link?.state).toBe('retained');
  expect(nativeStayReadiness(r, ids(r))).toEqual({ status: 'ready', accommodations: [] });
});
it('maps a complete stay using its own namespace and saved lodging, never the city', () => {
  const p = bookingStayFixture(),
    registry = ids(p),
    r = nativeStayReadiness(p, registry);
  expect(r.status).toBe('ready');
  if (r.status !== 'ready') throw Error('Expected ready');
  const a = r.accommodations[0];
  expect(registry.uuid('stay', a.id)).toBe(p.stays[0].stay.id);
  expect(registry.uuid('place', a.place_id ?? 0)).toBe(p.stays[0].stay.location_id);
  expect(a.id).not.toBe(registry.register('reservation', p.bookings[0].record.id));
  expect(a.place_image).toBeNull();
  expect(a.check_in).toBeNull();
});
it('preserves explicit true midnight, private notes and linked confirmation without inheriting catalog notes', () => {
  const p = bookingStayFixture();
  p.stays[0].stay.check_in_time = '00:00:00';
  p.stays[0].stay.notes = 'Stay-only note';
  p.bookings[0].record.confirmation_code = 'CONFIRM';
  if (!p.stays[0].booking) throw Error('Expected booking');
  p.stays[0].booking.record.confirmation_code = 'CONFIRM';
  const r = nativeStayReadiness(p, ids(p));
  if (r.status !== 'ready') throw Error('Expected ready');
  expect(r.accommodations[0]).toMatchObject({ check_in: '00:00:00', notes: 'Stay-only note', confirmation: 'CONFIRM' });
});
it.each([
  'arrival_outside_calendar',
  'departure_outside_calendar',
  'overnight_check_in_window',
  'subminute_clock',
] as const)('reports %s without partial/empty native success', (kind) => {
  const p = bookingStayFixture(),
    s = p.stays[0];
  if (kind === 'arrival_outside_calendar') {
    s.stay.arrival_date = '2027-03-30';
    s.arrival_day_id = null;
  }
  if (kind === 'departure_outside_calendar') {
    s.stay.departure_date = '2027-05-01';
    s.departure_day_id = null;
  }
  if (kind === 'overnight_check_in_window') {
    s.stay.check_in_time = '22:00:00';
    s.stay.check_in_window_end = '02:00:00';
    s.stay.check_in_window_end_day_offset = 1;
  }
  if (kind === 'subminute_clock') s.stay.check_in_time = '09:00:05';
  const r = nativeStayReadiness(p, ids(p));
  expect(r).toEqual({ status: 'unsupported', blockers: [{ stay_id: s.stay.id, reason: kind }] });
  expect(r).not.toHaveProperty('accommodations');
});
it('preserves intentionally repeated stays at one location with independent identities', () => {
  const p = bookingStayFixture(),
    other = structuredClone(p.stays[0]);
  other.stay.id = crypto.randomUUID();
  other.link = null;
  other.booking = null;
  p.stays.push(other);
  const r = nativeStayReadiness(p, ids(p));
  if (r.status !== 'ready') throw Error('Expected ready');
  expect(new Set(r.accommodations.map((a) => a.id)).size).toBe(2);
  expect(new Set(r.accommodations.map((a) => a.place_id)).size).toBe(1);
});
it('rejects another user registry and private layer', () => {
  const p = bookingStayFixture();
  expect(() => nativeStayReadiness(p, new FamilyIdentityRegistry(crypto.randomUUID()))).toThrow();
  p.planner.scope.layer = 'myDraft';
  expect(() => check(p)).toThrow();
});

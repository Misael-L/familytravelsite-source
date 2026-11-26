import type { StayBundleRpc } from '@family/backend/supabase/stayBundleRpc';
import { beforeEach, expect, it, vi } from 'vitest';
import { stayBundleFixture } from '../../../tests/helpers/familyStayBundles';
import { stayFixture } from '../../../tests/helpers/familyStays';
import { originalStayBundle, prepareStayBundleIntent, stayBundleContext } from './stayBundleContract';
import { createStayBundleTransport } from './stayBundleTransport';
const rpc = vi.fn<StayBundleRpc>();
let x: ReturnType<typeof stayBundleFixture>;
beforeEach(() => {
  x = stayBundleFixture();
  rpc.mockReset().mockResolvedValue(x.ack);
});
const transport = () => createStayBundleTransport(rpc);
const selection = () => ({
  p_location_id: x.packet.command.stay.location_id,
  p_arrival_day_id: x.context.observation.arrival_day.id,
  p_departure_day_id: x.context.observation.departure_day.id,
  p_stay_id: x.packet.command.stay_id,
  p_reservation_id: x.packet.command.reservation_id,
});
it('preserves all unknown nested read facts and clones immutable intent', () => {
  const location = x.context.observation.candidate_location,
    future = { nested: ['original'] };
  (location as Record<string, unknown>).future = future;
  (location.source as Record<string, unknown>).future = 1;
  (location.overrides as Record<string, unknown>).future = { version: 2 };
  const p = prepareStayBundleIntent({ ...x.packet.command, source_url: x.packet.source_url, context: x.context });
  const copy = originalStayBundle(p);
  future.nested[0] = 'changed';
  expect((copy.command.observation.candidate_location as Record<string, unknown>).future).toEqual({
    nested: ['original'],
  });
  expect(copy).toEqual(p);
});
it('normalizes an empty confirmation only before retention, with independent notes', () => {
  const p = prepareStayBundleIntent({
    ...x.packet.command,
    source_url: x.packet.source_url,
    context: x.context,
    stay: { ...x.packet.command.stay, notes: 'Stay note' },
    reservation: { title: 'Hotel', status: 'pending', confirmation_code: '', notes: 'Booking note' },
  });
  expect(p.command.reservation.confirmation_code).toBeNull();
  expect(p.command.stay.notes).toBe('Stay note');
  expect(p.command.reservation.notes).toBe('Booking note');
  const bad = structuredClone(p);
  bad.command.reservation.confirmation_code = '';
  expect(() => originalStayBundle(bad)).toThrow();
});
it.each(['stay', 'reservation', 'observation', 'scope'] as const)(
  'rejects unknown %s write/envelope fields',
  (part) => {
    (x.packet.command[part] as Record<string, unknown>).future = true;
    expect(() => originalStayBundle(x.packet)).toThrow();
  }
);
it.each(['trip_id', 'family_id', 'user_id', 'person_id', 'session_id'] as const)(
  'rejects inconsistent server scope %s',
  async (key) => {
    const bad = structuredClone(x.context);
    bad.scope[key] = crypto.randomUUID();
    rpc.mockResolvedValue(bad);
    await expect(transport().context(x.context.scope, selection())).rejects.toMatchObject({ status: 502 });
  }
);
it('binds context to the exact chosen lodging and day IDs', async () => {
  rpc.mockResolvedValue(x.context);
  expect(await transport().context(x.context.scope, selection())).toEqual(x.context);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('get_family_stay_bundle_context_v1', {
    p_trip_id: x.context.scope.trip_id,
    ...selection(),
  });
  const bad = structuredClone(x.context);
  bad.observation.departure_day.id = crypto.randomUUID();
  rpc.mockResolvedValue(bad);
  await expect(transport().context(x.context.scope, selection())).rejects.toMatchObject({ status: 502 });
});
it('forwards one unchanged SQL command without source URL or legacy composition', async () => {
  expect(await transport().execute(x.packet)).toEqual(x.ack);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('create_family_stay_bundle_v1', { p_command: x.packet.command });
});
it.each(['stay_id', 'reservation_id', 'operation_id', 'trip_id'] as const)(
  'refuses acknowledgement with another %s',
  async (key) => {
    rpc.mockResolvedValue({ ...x.ack, [key]: crypto.randomUUID() });
    await expect(transport().execute(x.packet)).rejects.toMatchObject({ status: 502 });
  }
);
it('rejects mixed old/new response dialects and unsafe acknowledgement revisions', async () => {
  for (const raw of [
    stayFixture().ack,
    { ...x.ack, version: 1 },
    { ...x.ack, event_sequence: Number.MAX_SAFE_INTEGER + 1 },
    { ...x.ack, trip_revision_after: x.context.observation.trip_revision },
  ]) {
    rpc.mockResolvedValue(raw);
    await expect(transport().execute(x.packet)).rejects.toBeDefined();
  }
});
it('preserves date-only intent and actual midnight/second/overnight clocks', () => {
  expect(x.packet.command.stay.check_in_time).toBeUndefined();
  x.packet.command.stay.check_in_time = '00:00:01';
  x.packet.command.stay.check_out_time = '00:00';
  expect(originalStayBundle(x.packet).command.stay.check_in_time).toBe('00:00:01');
  Object.assign(x.packet.command.stay, {
    check_in_time: '22:00',
    check_in_window_end: '02:00:01',
    check_in_window_end_day_offset: 1,
  });
  expect(originalStayBundle(x.packet).command.stay.check_in_window_end_day_offset).toBe(1);
});
it.each([
  { check_in_time: '24:00' },
  { check_in_time: '10:00:00.1' },
  { check_in_window_end: '02:00' },
  { check_in_time: '22:00', check_in_window_end: '02:00' },
  { check_in_window_end_day_offset: 1 },
  { arrival_date: '2027-02-30' },
  { notes: 'é'.repeat(10001) },
  { time_zone: 'é'.repeat(65) },
])('refuses invalid stay before retention', (patch) => {
  Object.assign(x.packet.command.stay, patch);
  expect(() => originalStayBundle(x.packet)).toThrow();
});
it.each([
  { status: 'cancelled' },
  { title: ' ' },
  { title: 'é'.repeat(501) },
  { confirmation_code: 'x'.repeat(1025) },
  { notes: 'é'.repeat(10001) },
  { url: 'javascript:alert(1)' },
  { url: '/relative' },
  { starts_at: null },
])('refuses invalid booking fields', (patch) => {
  Object.assign(x.packet.command.reservation, patch);
  expect(() => originalStayBundle(x.packet)).toThrow();
});
it('enforces the SQL command byte limit including unknown observed facts', () => {
  (x.packet.command.observation.candidate_location as Record<string, unknown>).future = 'x'.repeat(1048576);
  expect(() => originalStayBundle(x.packet)).toThrow();
});
it('refuses non-JSON read facts rather than silently stripping them', () => {
  (x.packet.command.observation.candidate_location as Record<string, unknown>).future = undefined;
  expect(() => originalStayBundle(x.packet)).toThrow();
});
it('fresh-session outcome keeps the original scope and cannot conflate terminal states', async () => {
  const current = { ...x.context.scope, session_id: crypto.randomUUID() };
  const result = {
    format: 'family.stay-bundle-outcome.v1',
    trip_id: current.trip_id,
    stay_id: x.packet.command.stay_id,
    reservation_id: x.packet.command.reservation_id,
    operation_id: x.packet.command.operation_id,
    current_scope: current,
    original_session_id: x.context.scope.session_id,
    status: 'unknown',
    acknowledgement: null,
    cancelled_at: null,
  };
  rpc.mockResolvedValue(result);
  expect(await transport().outcome(x.packet, current)).toEqual(result);
  expect(rpc.mock.calls[0][1]).toEqual({ p_command: x.packet.command });
  await expect(transport().outcome(x.packet, current, true)).rejects.toBeDefined();
  rpc.mockResolvedValue({ ...result, status: 'committed' });
  await expect(transport().outcome(x.packet, current)).rejects.toBeDefined();
});
it.each([
  ['42501', 403],
  ['PT409', 409],
  ['22023', 400],
  ['54000', 413],
  ['PGRST202', 503],
  ['0A000', 422],
] as const)('preserves %s refusal', async (code, status) => {
  rpc.mockRejectedValue({ code });
  await expect(transport().execute(x.packet)).rejects.toMatchObject({ status });
});
it('does not erase a denied admission or turn an old context into a bundle context', () => {
  expect(() => stayBundleContext.parse(stayFixture().context)).toThrow();
  x.context.admission.create = false;
  expect(() =>
    prepareStayBundleIntent({ ...x.packet.command, source_url: x.packet.source_url, context: x.context })
  ).toThrow();
});

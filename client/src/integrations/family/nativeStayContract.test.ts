import type { NativeStayRpc } from '@family/backend/supabase/nativeStayRpc';
import { beforeEach, expect, it, vi } from 'vitest';
import { nativeStayIntentFixture } from '../../../tests/helpers/familyNativeStays';
import { stayFixture } from '../../../tests/helpers/familyStays';
import { originalNativeStayIntent, type NativeStayEnvelope } from './nativeStayContract';
import { checkNativeStayAck, createNativeStayTransport } from './nativeStayTransport';
const rpc = vi.fn<NativeStayRpc>();
let x: ReturnType<typeof nativeStayIntentFixture>;
beforeEach(() => {
  x = nativeStayIntentFixture();
  rpc.mockReset().mockResolvedValue(x.ack);
});
const transport = () => createNativeStayTransport(rpc);
it('retains one complete outer command and clones its inner observations', () => {
  const copy = originalNativeStayIntent(x.packet);
  if (!('format' in x.packet.command.inner)) throw Error();
  x.packet.command.inner.observation.candidate_location.name = 'Changed';
  expect(copy.command.inner).not.toEqual(x.packet.command.inner);
});
it.each(['operation_id', 'stay_id', 'scope', 'arrival_visit_id', 'observation', 'inner', 'keep_stop'] as const)(
  'refuses corrupted original %s',
  (key) => {
    const p = structuredClone(x.packet);
    if (key === 'scope') p.command.scope.session_id = crypto.randomUUID();
    else if (key === 'observation') p.command.observation.trip_revision++;
    else if (key === 'inner') Object.assign(p.command.inner, { unknown: 1 });
    else if (key === 'keep_stop') p.command.keep_stop = true;
    else p.command[key] = key === 'arrival_visit_id' ? p.command.stay_id : crypto.randomUUID();
    expect(() => originalNativeStayIntent(p)).toThrow();
  }
);
it.each([undefined, NaN, Infinity, () => 0, 1n])('refuses non-JSON nested facts %s', (value) => {
  if (!('format' in x.packet.command.inner)) throw Error();
  Object.assign(x.packet.command.inner.observation.candidate_location, { future: value });
  expect(() => originalNativeStayIntent(x.packet)).toThrow();
});
it('refuses oversized original and incomplete day observations before sending', async () => {
  if (!('format' in x.packet.command.inner)) throw Error();
  Object.assign(x.packet.command.inner.observation.candidate_location, { future: 'x'.repeat(1048576) });
  await expect(transport().execute(x.packet)).rejects.toMatchObject({ status: 400 });
  expect(rpc).not.toHaveBeenCalled();
  const p = nativeStayIntentFixture().packet;
  Object.assign(p.command.observation, { day_visits: [{ id: crypto.randomUUID() }] });
  expect(() => originalNativeStayIntent(p)).toThrow();
});
it('prepares once using exact inner IDs and accepts no rebased inner reply', async () => {
  const c = x.packet.command;
  rpc.mockResolvedValue({ format: 'family.native-stay-context.v1', command: c, native_controls: false });
  expect(await transport().context(x.packet.source_url, c.inner, c.arrival_visit_id)).toEqual(x.packet);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('get_family_native_stay_context_v1', {
    p_inner: c.inner,
    p_arrival_visit_id: c.arrival_visit_id,
    p_keep_stop: false,
  });
  const changed = structuredClone(c);
  changed.inner.observation.trip_revision++;
  changed.observation.trip_revision++;
  rpc.mockResolvedValue({ format: 'family.native-stay-context.v1', command: changed, native_controls: false });
  await expect(transport().context(x.packet.source_url, c.inner, c.arrival_visit_id)).rejects.toMatchObject({
    status: 502,
  });
});
it('executes only the outer operation with no partial inner write', async () => {
  expect(await transport().execute(x.packet)).toEqual(x.ack);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('execute_family_native_stay_v1', { p_command: x.packet.command });
});
it.each(['trip_id', 'stay_id', 'operation_id', 'action', 'format', 'trip_revision_after'] as const)(
  'rejects unrelated or regressive acknowledgement %s',
  async (key) => {
    rpc.mockResolvedValue({
      ...x.ack,
      [key]:
        key === 'trip_revision_after'
          ? x.packet.command.observation.trip_revision - 1
          : key === 'action'
            ? 'trash'
            : crypto.randomUUID(),
    });
    await expect(transport().execute(x.packet)).rejects.toBeDefined();
  }
);
it('accepts the actual unchanged revision of a no-op native save', () => {
  const inner = stayFixture().packet.command;
  inner.action = 'save';
  inner.reservation_id = null;
  inner.observation.candidate_booking = null;
  const p = originalNativeStayIntent({
    version: 1,
    source_url: x.packet.source_url,
    command: {
      ...x.packet.command,
      operation_id: inner.operation_id,
      stay_id: inner.stay_id,
      scope: inner.scope,
      inner,
      observation: {
        ...x.packet.command.observation,
        trip_revision: inner.observation.trip_revision,
        location_id: inner.changes.location_id ?? inner.observation.stay?.stay.location_id,
      },
    },
  });
  const ack = {
    ...x.ack,
    operation_id: p.command.operation_id,
    stay_id: p.command.stay_id,
    trip_id: p.command.scope.trip_id,
    action: 'save',
    trip_revision_after: p.command.observation.trip_revision,
  };
  expect(checkNativeStayAck(ack, p).trip_revision_after).toBe(p.command.observation.trip_revision);
});
it('fresh sessions inspect or cancel without rebinding original bytes', async () => {
  const current = { ...x.packet.command.scope, session_id: crypto.randomUUID() };
  rpc.mockResolvedValue({
    format: 'family.native-stay-outcome.v1',
    trip_id: x.ack.trip_id,
    stay_id: x.ack.stay_id,
    operation_id: x.ack.operation_id,
    current_scope: current,
    original_session_id: x.packet.command.scope.session_id,
    status: 'committed',
    acknowledgement: x.ack,
    cancelled_at: null,
  });
  expect((await transport().outcome(x.packet, current, true)).status).toBe('committed');
  expect(rpc).toHaveBeenCalledExactlyOnceWith('cancel_family_native_stay_v1', { p_command: x.packet.command });
});
it('refuses another actor before inspecting a retained operation', async () => {
  await expect(
    transport().outcome(x.packet, { ...x.packet.command.scope, person_id: crypto.randomUUID() })
  ).rejects.toMatchObject({ status: 502 });
  expect(rpc).not.toHaveBeenCalled();
});
it.each(['unknown_cancel', 'missing_ack', 'wrong_original', 'wrong_current'] as const)(
  'refuses inconsistent outcome %s',
  async (kind) => {
    const scope = x.packet.command.scope;
    const raw = {
      format: 'family.native-stay-outcome.v1',
      trip_id: x.ack.trip_id,
      stay_id: x.ack.stay_id,
      operation_id: x.ack.operation_id,
      current_scope: scope,
      original_session_id: scope.session_id,
      status: 'committed',
      acknowledgement: x.ack,
      cancelled_at: null,
    };
    if (kind === 'unknown_cancel') Object.assign(raw, { status: 'unknown', acknowledgement: null });
    if (kind === 'missing_ack') Object.assign(raw, { acknowledgement: null });
    if (kind === 'wrong_original') raw.original_session_id = crypto.randomUUID();
    if (kind === 'wrong_current') raw.current_scope = { ...scope, session_id: crypto.randomUUID() };
    rpc.mockResolvedValue(raw);
    await expect(transport().outcome(x.packet, scope, true)).rejects.toBeDefined();
  }
);
it.each([
  ['42501', 403],
  ['PT409', 409],
  ['PGRST202', 503],
  ['54000', 413],
  ['0A000', 422],
] as const)('preserves SQL %s refusal', async (code, status) => {
  rpc.mockRejectedValue({ code });
  await expect(transport().execute(x.packet)).rejects.toMatchObject({ status });
});
function page() {
  return {
    format: 'family.stay-trash.v1',
    trip_id: x.ack.trip_id,
    items: [1, 2].map((n) => ({
      id: `80000000-0000-4000-8000-00000000000${n}`,
      revision: 1,
      arrival_date: '2027-04-01',
      departure_date: '2027-04-02',
      deleted_at: `2026-11-14T12:00:00.00000${n}Z`,
      name: 'Lodging',
      restore_available: n === 1,
    })),
    has_more: true,
    next_cursor: { id: '80000000-0000-4000-8000-000000000002', deleted_at: '2026-11-14T12:00:00.000002Z' },
  };
}
it('validates keyset pages at microsecond precision and keeps unavailable records visible', async () => {
  rpc.mockResolvedValue(page());
  const r = await transport().trash(x.ack.trip_id, null, 2);
  expect(r.items.map((i) => i.restore_available)).toEqual([true, false]);
  expect(r.next_cursor?.deleted_at).toBe('2026-11-14T12:00:00.000002Z');
});
it.each(['order', 'duplicate', 'cursor', 'foreign', 'empty_more', 'before_cursor'] as const)(
  'refuses invalid Trash page %s',
  async (kind) => {
    const p = page();
    if (kind === 'order') p.items.reverse();
    if (kind === 'duplicate') p.items[1] = p.items[0];
    if (kind === 'cursor') p.next_cursor.id = crypto.randomUUID();
    if (kind === 'foreign') p.trip_id = crypto.randomUUID();
    if (kind === 'empty_more') p.items = [];
    rpc.mockResolvedValue(p);
    await expect(
      transport().trash(x.ack.trip_id, kind === 'before_cursor' ? p.next_cursor : null, 2)
    ).rejects.toBeDefined();
  }
);
it.each([0, 51, 1.5, NaN])('refuses invalid Trash limit %s before the RPC', async (n) => {
  await expect(transport().trash(x.ack.trip_id, null, n)).rejects.toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
});
it('refuses unknown keys and relative Trash timestamps before the RPC', async () => {
  await expect(transport().trash(x.ack.trip_id, { id: crypto.randomUUID(), deleted_at: 'now' })).rejects.toBeDefined();
  await expect(transport().trash(x.ack.trip_id, { ...page().next_cursor, extra: true })).rejects.toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
});
export type FixtureIntent = NativeStayEnvelope;

import type { StayRpc } from '@family/backend/supabase/stayRpc';
import { beforeEach, expect, it, vi } from 'vitest';
import { stayFixture } from '../../../tests/helpers/familyStays';
import { stayEnvelope, stayIdentity, stayJson, stayProjection, stayScope } from './stayContract';
import { checkStayAck, createStayTransport, originalStay } from './stayTransport';
const rpc = vi.fn<StayRpc>();
const reads = () => createStayTransport(rpc);
const f = () => stayFixture();
beforeEach(() => {
  rpc.mockReset();
});
it('validates complete SQL snapshot/editor/context and leaves native controls false', async () => {
  const x = f(),
    c = x.packet.command;
  rpc.mockResolvedValueOnce(x.snapshot).mockResolvedValueOnce(x.editor).mockResolvedValueOnce(x.context);
  expect((await reads().list(stayIdentity.parse(c.scope))).capabilities.commands).toBe(false);
  expect((await reads().editor(stayIdentity.parse(c.scope), c.stay_id)).observation.stay.id).toBe(c.stay_id);
  expect((await reads().context(c.scope, c.stay_id)).native_controls).toBe(false);
});
it('preserves every nested observation fact, exact local clocks and microseconds', () => {
  const x = f();
  const p = x.packet.command.observation.stay;
  if (!p) throw new Error('Expected synthetic observed stay');
  p.location.source.future = 'keep';
  p.location.overrides.future = { nested: true };
  p.stay.check_in_time = '00:00:00';
  p.stay.created_at = '2026-11-13T00:00:00.123456+00:00';
  const out = originalStay(x.packet);
  expect(stayJson(out)).toBe(stayJson(x.packet));
  x.packet.command.changes.notes = 'Borrowed';
  expect(out.command.changes.notes).toBe('Adapter note');
});
it.each([
  { arrival_date: '2027-02-30' },
  { check_in_time: '24:00' },
  { check_out_time: '09:00Z' },
  { notes: 'é'.repeat(10001) },
  { metadata: {} },
])('rejects invalid or unqualified patch %j', (changes) => {
  const p = f().packet;
  p.command.changes = changes as never;
  expect(stayEnvelope.safeParse(p).success).toBe(false);
});
it.each(['trip_id', 'family_id'])('rejects cross-identity projections %s', async (key) => {
  const x = f();
  Object.assign(x.snapshot.stays[0].stay, { [key]: crypto.randomUUID() });
  rpc.mockResolvedValue(x.snapshot);
  await expect(reads().list(stayIdentity.parse(x.packet.command.scope))).rejects.toMatchObject({ status: 502 });
});
it('refuses duplicate stays and missing rather than empty-success responses', async () => {
  const x = f();
  x.snapshot.stays.push(structuredClone(x.snapshot.stays[0]));
  rpc.mockResolvedValueOnce(x.snapshot).mockResolvedValueOnce(null);
  for (let i = 0; i < 2; i++)
    await expect(reads().list(stayIdentity.parse(x.packet.command.scope))).rejects.toMatchObject({ status: 502 });
});
it.each([
  ['save', 'save_family_stay_v1'],
  ['link', 'set_family_stay_booking_link_v1'],
  ['trash', 'trash_family_stay_v1'],
  ['restore', 'restore_family_stay_v1'],
] as const)('dispatches only qualified %s without companions', async (action, name) => {
  const x = f(),
    p = x.packet;
  p.command.action = action;
  if (action !== 'save') p.command.changes = {};
  const ack = { ...x.ack, action: action === 'save' ? 'edit' : action };
  rpc.mockResolvedValue(ack);
  await reads().execute(p);
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc.mock.calls[0][0]).toBe(name);
  expect(rpc.mock.calls[0][1]).toMatchObject({
    p_stay_id: p.command.stay_id,
    p_scope: p.command.scope,
    p_observation: p.command.observation,
    p_operation_id: p.command.operation_id,
  });
});
it.each([
  { stay_id: crypto.randomUUID() },
  { action: 'create' },
  { changed: false },
  { read_current_required: false },
  { record: {} },
])('refuses false acknowledgements %j', (bad) => {
  const x = f();
  expect(() => checkStayAck({ ...x.ack, ...bad }, x.packet)).toThrow();
});
it('checks strict no-op revisions and never confuses an old ack with a record', () => {
  const x = f(),
    a = {
      ...x.ack,
      changed: false,
      stay_revision_after: stayProjection.parse(x.packet.command.observation.stay).stay.revision,
      trip_revision_after: x.packet.command.observation.trip_revision,
    };
  expect(checkStayAck(a, x.packet)).toEqual(a);
  expect(a).not.toHaveProperty('observation');
});
it('keeps unknown outcomes distinct and allows a fresh session to inspect the original one', async () => {
  const x = f(),
    c = x.packet.command,
    now = stayScope.parse({ ...c.scope, session_id: crypto.randomUUID() });
  const raw = {
    version: 1,
    trip_id: c.scope.trip_id,
    stay_id: c.stay_id,
    operation_id: c.operation_id,
    current_scope: now,
    original_session_id: c.scope.session_id,
    status: 'unknown',
    acknowledgement: null,
    cancelled_at: null,
  };
  rpc.mockResolvedValue(raw);
  expect((await reads().outcome(x.packet, now)).status).toBe('unknown');
  expect(rpc.mock.calls[0][1]).toMatchObject({ p_scope: c.scope });
  await expect(reads().outcome(x.packet, now, true)).rejects.toBeDefined();
});
it('rejects outcome actor/session mismatches and leaked operational fields', async () => {
  const x = f(),
    c = x.packet.command;
  const raw = {
    version: 1,
    trip_id: c.scope.trip_id,
    stay_id: c.stay_id,
    operation_id: c.operation_id,
    current_scope: c.scope,
    original_session_id: crypto.randomUUID(),
    status: 'committed',
    acknowledgement: x.ack,
    cancelled_at: null,
  };
  rpc
    .mockResolvedValueOnce(raw)
    .mockResolvedValueOnce({ ...raw, original_session_id: c.scope.session_id, request_sha256: 'private' });
  for (let i = 0; i < 2; i++) await expect(reads().outcome(x.packet, c.scope)).rejects.toBeDefined();
});
it('validates ordered, scoped, private-safe history and pagination', async () => {
  const x = f(),
    c = x.packet.command;
  rpc.mockResolvedValueOnce(x.history);
  expect((await reads().history(stayIdentity.parse(c.scope), c.stay_id)).events).toHaveLength(1);
  const b = structuredClone(x.history);
  Object.assign(b.events[0], { session_id: c.scope.session_id });
  rpc.mockResolvedValue(b);
  await expect(reads().history(stayIdentity.parse(c.scope), c.stay_id)).rejects.toMatchObject({ status: 502 });
});
it.each([
  ['42501', 403],
  ['PT409', 409],
  ['PGRST202', 503],
  ['54000', 413],
  ['0A000', 422],
])('propagates %s as refusal, not empty data', async (code, status) => {
  const x = f();
  rpc.mockRejectedValue({ code });
  await expect(reads().list(stayIdentity.parse(x.packet.command.scope))).rejects.toMatchObject({ status });
});

import { describe, expect, it, vi } from 'vitest';
import { checkCreationTerminalProof } from './creationTerminalContract';
import { createCreationTerminalTransport } from './creationTerminalTransport';
import { creationPacket } from './plannerCreationContract';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const p = creationPacket.parse({
  version: 1,
  source_url: 'http://127.0.0.1:56041',
  operation_id: id(1),
  scope: { version: 1, trip_id: id(2), family_id: id(3), user_id: id(4), person_id: id(5), layer: 'published' },
  form: {
    location: {
      create: { source: { kind: 'manual' }, label: 'Café 東京', latitude: 19.043798, longitude: -98.198151 },
    },
    day: null,
    clocks: { start: null, end: null },
    visit_notes: null,
  },
});
const raw = (status = 'unknown') => ({
  version: 2,
  trip_id: p.scope.trip_id,
  operation_id: p.operation_id,
  scope: structuredClone(p.scope),
  form: structuredClone(p.form),
  request_sha256: 'a'.repeat(64),
  status,
  cancelled_at: status === 'cancelled' ? '2026-11-16T12:00:00.123456+00:00' : null,
  result:
    status === 'committed'
      ? { version: 1, state: 'published', location_id: id(8), visit_id: null, operation: { id: id(8) } }
      : null,
});
describe('native creation terminal transport, frozen schema149 contract', () => {
  it('uses ambient source-bound RPCs with the complete original, never a target supplied by the packet', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => raw()),
      t = createCreationTerminalTransport(rpc);
    const proof = await t.read(p);
    expect(proof.form).toEqual(p.form);
    await t.cancel(p, proof.request_sha256);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      'get_family_native_plan_receipt_v2',
      'cancel_family_native_plan_v1',
    ]);
    for (const call of rpc.mock.calls)
      expect(call[1]).toEqual({
        p_trip_id: p.scope.trip_id,
        p_operation_id: p.operation_id,
        p_scope: p.scope,
        p_form: p.form,
      });
  });
  it.each(['unknown', 'cancelled', 'committed'])(
    'validates %s with fractional coordinates, Unicode and a server-authoritative digest',
    (status) => {
      expect(checkCreationTerminalProof(raw(status), p, 'a'.repeat(64)).status).toBe(status);
    }
  );
  it.each([
    'version',
    'trip_id',
    'operation_id',
    'scope',
    'form',
    'request_sha256',
    'status',
    'cancelled_at',
    'result',
    'extra',
  ])('refuses malformed/mismatched %s without fabricating a terminal result', (field) => {
    const r = {
      ...raw(),
      [field]:
        field === 'version'
          ? 3
          : field === 'request_sha256'
            ? 'b'.repeat(64)
            : field === 'scope'
              ? { ...p.scope, person_id: id(999) }
              : field === 'form'
                ? { ...p.form, visit_notes: 'changed' }
                : field === 'result'
                  ? {}
                  : id(999),
    };
    expect(() => checkCreationTerminalProof(r, p, 'a'.repeat(64))).toThrow(/exact original/);
  });
  it('refuses an inconsistent committed object and oversized replies', () => {
    const r = raw('committed');
    if (!r.result) throw new Error('Missing committed fixture result');
    r.result = { ...r.result, location_id: id(9) };
    expect(() => checkCreationTerminalProof(r, p)).toThrow();
    expect(() => checkCreationTerminalProof({ ...raw(), padding: 'x'.repeat(1048576) }, p)).toThrow();
  });
  it.each(['42501', 'PT409', 'PGRST202', '08006', '54000'])(
    'keeps %s as a refusal, never unknown/cancelled success',
    async (code) => {
      const rpc = vi.fn(async () => {
        throw { code };
      });
      await expect(createCreationTerminalTransport(rpc).cancel(p, 'a'.repeat(64))).rejects.toThrow(/retained/);
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  );
  it('preserves current private-draft status metadata in the validated terminal proof', () => {
    const draft = { ...p, scope: { ...p.scope, layer: 'myDraft' as const } };
    const r = {
      ...raw('committed'),
      scope: draft.scope,
      result: {
        version: 1,
        state: 'submitted',
        location_id: null,
        visit_id: null,
        operation: { op_id: id(8), draft_id: id(9) },
        request_id: id(10),
        request_status: 'pending',
      },
    };
    const proof = checkCreationTerminalProof(r, draft);
    expect(proof.result).toEqual(r.result);
  });
});

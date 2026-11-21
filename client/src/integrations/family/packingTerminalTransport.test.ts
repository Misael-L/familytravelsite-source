import { describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { terminalOriginal, terminalProof } from '../../../tests/helpers/familyPackingTerminal';
import { packingPgJson, packingRestoreRequest } from './packingTerminalContract';
import { createPackingTerminalTransport, type PackingTerminalRpc } from './packingTerminalTransport';
for (const domain of ['item', 'bag', 'batch'] as const)
  describe(`${domain} original-bound terminal proof`, () => {
    it.each(['unknown', 'committed', 'cancelled'] as const)(
      'binds %s to exact original arguments and authenticated scope',
      async (status) => {
        const p = terminalOriginal(domain),
          rpc = vi.fn<PackingTerminalRpc>(async () => terminalProof(p, status));
        const result = await createPackingTerminalTransport(rpc).lookup(p, p.command.scope);
        expect(result.status).toBe(status);
        expect(rpc.mock.calls[0]).toEqual([
          'get_family_trip_packing_restore_cancellation_v1',
          {
            p_trip_id: p.command.scope.trip_id,
            p_operation_id: p.command.operation_id,
            p_protocol: packingRestoreRequest(p).protocol,
            p_original_args: packingRestoreRequest(p).args,
          },
        ]);
      }
    );
    it('does not accept unknown from the cancel endpoint', async () => {
      const p = terminalOriginal(domain);
      await expect(
        createPackingTerminalTransport(async () => terminalProof(p, 'unknown')).cancel(p, p.command.scope)
      ).rejects.toMatchObject({ status: 502 });
    });
    it('accepts redacted terminal history without inventing a visible result', async () => {
      const p = terminalOriginal(domain);
      expect(
        (
          await createPackingTerminalTransport(async () => terminalProof(p, 'committed', true)).cancel(
            p,
            p.command.scope
          )
        ).result
      ).toBeNull();
    });
    it('accepts original historical lifecycle only against an exact current scope', async () => {
      const p = terminalOriginal(domain),
        now = { ...p.command.scope, trip_lifecycle_revision: p.command.scope.trip_lifecycle_revision + 2 };
      const result = await createPackingTerminalTransport(async () => terminalProof(p, 'cancelled', false, now)).cancel(
        p,
        now
      );
      expect(result.scope).toEqual(now);
      expect(p.command.scope.trip_lifecycle_revision).not.toBe(now.trip_lifecycle_revision);
    });
    const bad: Array<[string, unknown]> = [
      ['version', 2],
      ['kind', 'receipt'],
      ['operation_id', id(999)],
      ['target_id', id(999)],
      ['trip_id', id(999)],
      ['protocol', 'other'],
      ['action', 'create'],
      ['request_sha256', '0'.repeat(64)],
      ['status', 'committed'],
      ['cancelled_at', null],
      ['result_redacted', true],
      ['result', {}],
      ['extra', 'unrecognized'],
    ];
    it.each(bad)('refuses wrong %s without normalizing it', async (field, value) => {
      const p = terminalOriginal(domain),
        proof = await terminalProof(p);
      const raw = { ...proof, [field]: value };
      await expect(createPackingTerminalTransport(async () => raw).lookup(p, p.command.scope)).rejects.toMatchObject({
        status: 502,
      });
    });
    it.each(['user_id', 'family_id', 'person_id', 'trip_id', 'layer', 'trip_lifecycle_revision'])(
      'refuses wrong proof scope %s',
      async (field) => {
        const p = terminalOriginal(domain),
          proof = await terminalProof(p);
        Object.assign(proof.scope, {
          [field]: field === 'trip_lifecycle_revision' ? 999 : field === 'layer' ? 'myDraft' : id(999),
        });
        await expect(
          createPackingTerminalTransport(async () => proof).lookup(p, p.command.scope)
        ).rejects.toMatchObject({ status: 502 });
      }
    );
    it.each([
      ['42501', 403],
      ['PT409', 409],
      ['54000', 413],
      ['PGRST301', 401],
      ['23514', 422],
    ])('preserves %s refusal', async (code, status) => {
      const p = terminalOriginal(domain);
      await expect(
        createPackingTerminalTransport(async () => {
          throw { code };
        }).cancel(p, p.command.scope)
      ).rejects.toMatchObject({ status });
    });
    it('freezes caller mutation across an awaited digest/RPC', async () => {
      const p = terminalOriginal(domain),
        saved = structuredClone(p),
        proof = await terminalProof(p);
      const rpc = vi.fn<PackingTerminalRpc>(async () => proof);
      const run = createPackingTerminalTransport(rpc).cancel(p, p.command.scope);
      p.command.operation_id = id(999);
      expect((await run).operation_id).toBe(saved.command.operation_id);
      expect(rpc.mock.calls[0][1].p_operation_id).toBe(saved.command.operation_id);
    });
  });
describe('PostgreSQL17 framing is separate from local retention framing', () => {
  it('sorts by UTF8 key length then bytes, retaining JSONB separators', () => {
    expect(packingPgJson({ abc: ['é', 9007199254740991, null], z: true, aa: 1 })).toBe(
      '{"z": true, "aa": 1, "abc": ["é", 9007199254740991, null]}'
    );
    expect(packingPgJson({ é: 1, ab: 2, a: 3 })).toBe('{"a": 3, "ab": 2, "é": 1}');
  });
  it.each([undefined, 1.5, NaN, { x: undefined }, { x: '\0' }, { x: '\ud800' }])(
    'refuses non-contract JSON %j',
    (v) => {
      expect(() => packingPgJson(v)).toThrow();
    }
  );
});

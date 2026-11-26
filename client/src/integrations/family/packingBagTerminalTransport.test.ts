import { describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { bagActions, bagTerminalOriginal, bagTerminalProof } from '../../../tests/helpers/familyPackingBagTerminal';
import { packingBagTerminalEnvelope, packingBagTerminalRequest } from './packingBagTerminalContract';
import { createPackingBagTerminalTransport } from './packingBagTerminalTransport';
for (const action of bagActions)
  describe(action, () => {
    it.each(['unknown', 'cancelled', 'committed'] as const)('accepts exactly bound %s lookup', async (status) => {
      const p = bagTerminalOriginal(action),
        rpc = vi.fn(async () => bagTerminalProof(p, status));
      const result = await createPackingBagTerminalTransport(rpc).lookup(p, p.command.scope);
      expect(result.status).toBe(status);
      expect(rpc).toHaveBeenCalledWith('get_family_trip_packing_bag_command_cancellation_v1', {
        p_trip_id: p.command.scope.trip_id,
        p_operation_id: p.command.operation_id,
        p_original_args: packingBagTerminalRequest(p).args,
      });
    });
    it('requires a terminal cancellation outcome', async () => {
      const p = bagTerminalOriginal(action);
      await expect(
        createPackingBagTerminalTransport(async () => bagTerminalProof(p, 'unknown')).cancel(p, p.command.scope)
      ).rejects.toMatchObject({ status: 502 });
    });
    it('retains historical redaction without projecting a result', async () => {
      const p = bagTerminalOriginal(action);
      expect(
        (
          await createPackingBagTerminalTransport(async () => bagTerminalProof(p, 'committed', true)).cancel(
            p,
            p.command.scope
          )
        ).result
      ).toBeNull();
    });
    it('accepts only current exact lifecycle scope', async () => {
      const p = bagTerminalOriginal(action),
        now = { ...p.command.scope, trip_lifecycle_revision: 3 };
      expect(
        (
          await createPackingBagTerminalTransport(async () => bagTerminalProof(p, 'cancelled', false, now)).lookup(
            p,
            now
          )
        ).scope
      ).toEqual(now);
    });
    it.each([
      ['version', 2],
      ['kind', 'packing-restore-terminal'],
      ['protocol', 'packing-item-v1'],
      ['action', 'bag-restore'],
      ['operation_id', id(999)],
      ['target_id', id(999)],
      ['trip_id', id(999)],
      ['request_sha256', '00'.repeat(32)],
      ['cancelled_at', null],
      ['result', {}],
      ['result_redacted', true],
      ['extra', 1],
    ] as const)('refuses malformed %s', async (key, value) => {
      const p = bagTerminalOriginal(action),
        raw = { ...(await bagTerminalProof(p)), [key]: value };
      await expect(createPackingBagTerminalTransport(async () => raw).lookup(p, p.command.scope)).rejects.toMatchObject(
        { status: 502 }
      );
    });
    it('refuses a mismatched visible historical receipt', async () => {
      const p = bagTerminalOriginal(action),
        raw = await bagTerminalProof(p, 'committed');
      if (raw.result) raw.result.operation_id = id(998);
      await expect(createPackingBagTerminalTransport(async () => raw).lookup(p, p.command.scope)).rejects.toMatchObject(
        { status: 502 }
      );
    });
    it.each(['42501', 'PT409', '22023', 'PGRST301', '54000'])(
      'propagates %s as a refusal without a proof',
      async (code) => {
        const p = bagTerminalOriginal(action);
        await expect(
          createPackingBagTerminalTransport(async () => {
            throw { code };
          }).cancel(p, p.command.scope)
        ).rejects.toBeDefined();
      }
    );
    it('rejects cross-account scope before sending', async () => {
      const p = bagTerminalOriginal(action),
        rpc = vi.fn();
      await expect(
        createPackingBagTerminalTransport(rpc).cancel(p, { ...p.command.scope, user_id: id(888) })
      ).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
    });
  });
it('keeps bag restore on the original terminal protocol', () => {
  const p = bagTerminalOriginal();
  expect(
    packingBagTerminalEnvelope.safeParse({ ...p, command: { ...p.command, action: 'bag-restore', values: {} } }).success
  ).toBe(false);
});

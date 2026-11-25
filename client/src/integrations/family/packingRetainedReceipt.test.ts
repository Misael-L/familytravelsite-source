import { describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { bagAck, bagOriginal } from '../../../tests/helpers/familyPackingBags';
import { canonicalCategoryAck, canonicalCategoryEnvelope } from '../../../tests/helpers/familyPackingCategories';
import { aggregateAck, aggregateTrash } from '../../../tests/helpers/familyPackingCategoryAggregate';
import { ackV2, itemV2, lifecycleV2 } from '../../../tests/helpers/familyPackingCategoryV2';
import { canonicalPackingAck, canonicalPackingEnvelope } from '../../../tests/helpers/familyPackingCommands';
import { canonicalPackingGroup, canonicalPackingGroupAck } from '../../../tests/helpers/familyPackingGroups';
import { createPackingBagTransport } from './packingBagTransport';
import { createPackingCategoryAggregateTransport } from './packingCategoryAggregateTransport';
import { createPackingCategoryTransport } from './packingCategoryTransport';
import { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import { createPackingGroupTransport } from './packingGroupTransport';
import { retainedPackingReceipt, validateRetainedPackingAck } from './packingRetainedReceipt';
import { createPackingTransport } from './packingTransport';

const cases = [
  () => {
    const packet = canonicalPackingEnvelope();
    return {
      name: 'base',
      packet,
      ack: canonicalPackingAck(packet.command),
      rpc: 'get_family_trip_packing_receipt_v1',
    };
  },
  () => {
    const packet = canonicalPackingGroup();
    return {
      name: 'group',
      packet,
      ack: canonicalPackingGroupAck(packet),
      rpc: 'get_family_trip_packing_group_receipt_v1',
    };
  },
  () => {
    const packet = canonicalCategoryEnvelope();
    return {
      name: 'category',
      packet,
      ack: canonicalCategoryAck(packet),
      rpc: 'get_family_trip_packing_category_receipt_v1',
    };
  },
  () => {
    const packet = lifecycleV2();
    return {
      name: 'category lifecycle v2',
      packet,
      ack: ackV2(packet),
      rpc: 'get_family_trip_packing_category_lifecycle_receipt_v2',
    };
  },
  () => {
    const packet = itemV2();
    return {
      name: 'category item v2',
      packet,
      ack: ackV2(packet),
      rpc: 'get_family_trip_packing_category_item_receipt_v2',
    };
  },
  () => {
    const packet = aggregateTrash();
    return {
      name: 'category aggregate',
      packet,
      ack: aggregateAck(packet),
      rpc: 'get_family_trip_packing_category_aggregate_receipt_v3',
    };
  },
  () => {
    const packet = bagOriginal();
    return { name: 'bag', packet, ack: bagAck(packet), rpc: 'get_family_trip_packing_bag_receipt_v1' };
  },
];
type Fixture = ReturnType<(typeof cases)[number]>;
function response(f: Fixture, mode: 'unknown' | 'visible' | 'redacted') {
  const c = f.packet.command;
  return {
    version: f.packet.version,
    ...('kind' in c ? { kind: c.kind } : {}),
    trip_id: c.scope.trip_id,
    operation_id: c.operation_id,
    scope: structuredClone(c.scope),
    status: mode === 'unknown' ? 'unknown' : 'committed',
    result_redacted: mode === 'redacted',
    result: mode === 'visible' ? structuredClone(f.ack) : null,
  };
}
function readers(raw: unknown) {
  const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<unknown>>().mockResolvedValue(raw);
  return {
    rpc,
    sources: {
      bag: createPackingBagTransport(rpc),
      aggregate: createPackingCategoryAggregateTransport(rpc),
      categoryV2: createPackingCategoryV2Transport(rpc),
      category: createPackingCategoryTransport(rpc),
      group: createPackingGroupTransport(rpc),
      base: createPackingTransport(rpc),
    },
  };
}
for (const make of cases)
  describe(make().name + ' retained protocol through real transports', () => {
    it.each(['unknown', 'visible', 'redacted'] as const)(
      'reads the original %s proof without issuing a command',
      async (mode) => {
        const f = make(),
          raw = response(f, mode),
          r = readers(raw);
        const pending = retainedPackingReceipt(f.packet, f.packet.command.scope, r.sources);
        expect(pending.receipt).toBeInstanceOf(Promise);
        expect(await pending.receipt).toEqual(raw);
        expect(r.rpc).toHaveBeenCalledExactlyOnceWith(f.rpc, {
          p_trip_id: f.packet.command.scope.trip_id,
          p_operation_id: f.packet.command.operation_id,
        });
        expect(pending.aggregate).toBe(f.packet.version === 3);
        if (mode === 'visible') expect(validateRetainedPackingAck(raw.result, f.packet)).toEqual(f.ack);
        else expect(raw.result).toBeNull();
      }
    );
    it('refuses a proof for another operation instead of borrowing its success', async () => {
      const f = make(),
        raw = response(f, 'visible');
      raw.operation_id = id(999);
      const r = readers(raw);
      await expect(retainedPackingReceipt(f.packet, f.packet.command.scope, r.sources).receipt).rejects.toBeDefined();
      expect(r.rpc).toHaveBeenCalledTimes(1);
    });
    it('validates the acknowledgement against the original operation, not only its domain', () => {
      const f = make();
      Object.assign(f.ack, { operation_id: id(999) });
      expect(() => validateRetainedPackingAck(f.ack, f.packet)).toThrow();
      expect(() => validateRetainedPackingAck({}, f.packet)).toThrow();
    });
    it('refuses an unknown proof containing a contradictory successful result', async () => {
      const f = make(),
        raw = response(f, 'visible');
      raw.status = 'unknown';
      const r = readers(raw);
      await expect(retainedPackingReceipt(f.packet, f.packet.command.scope, r.sources).receipt).rejects.toBeDefined();
      expect(r.rpc).toHaveBeenCalledTimes(1);
    });
  });

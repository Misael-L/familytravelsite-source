import { describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import {
  canonicalPackingAck as ack,
  canonicalPackingCommand as command,
} from '../../../tests/helpers/familyPackingCommands';
import { packingCommand, type PackingCommand } from './packingCommandContract';
import { checkPackingAcknowledgement, createPackingCommandTransport } from './packingCommandTransport';
import type { PackingAck } from './packingContract';

const base = () => {
  const { action: _action, values: _values, ...rest } = command();
  return rest;
};
const create = (values: unknown) => ({ ...base(), action: 'create', expected_revision: null, values });
const parse = (p: unknown) => packingCommand.safeParse(p);
describe('packing command contract', () => {
  for (const [label, p] of [
    ['create defaults', create({ name: 'Raincoat' })],
    ['Unicode code points', create({ name: '🧳'.repeat(500) })],
    ['space-only trimming', create({ name: '\t' })],
    ['personal create', create({ name: 'Coat', visibility: 'personal' })],
    ['initial partial', create({ name: 'Socks', quantity: 3, packed_quantity: 1 })],
    ['zero/nullable grams', create({ name: 'Coat', weight_grams: 0, bag_id: null })],
    ['nullable count', { ...base(), action: 'packed-state', values: { packed_quantity: null } }],
    ['explicit unchecked', { ...base(), action: 'packed-state', values: { checked: false } }],
    ['clear fields', { ...command(), values: { bag_id: null, weight_grams: null } }],
    [
      'empty complete order',
      {
        ...base(),
        action: 'reorder',
        target_id: null,
        expected_revision: null,
        expected_collection_revision: 0,
        values: { ids: [] },
      },
    ],
    ['trash', { ...base(), action: 'trash', values: {} }],
    ['restore', { ...base(), action: 'restore', values: {} }],
  ])
    it(`accepts ${label}`, () => expect(parse(p).success).toBe(true));
  for (const [label, p] of [
    ['blank name', create({ name: '   ' })],
    ['too long', create({ name: '🧳'.repeat(501) })],
    ['category bound', create({ name: 'Coat', category: 'x'.repeat(201) })],
    ['shared creation', create({ name: 'Coat', visibility: 'shared' })],
    ['recipients', create({ name: 'Coat', recipient_ids: [id(7)] })],
    ['owner forgery', create({ name: 'Coat', owner_person_id: id(99) })],
    ['both packed representations', create({ name: 'Coat', checked: false, packed_quantity: null })],
    ['count above quantity', create({ name: 'Coat', packed_quantity: 2 })],
    ['undefined', { ...command(), values: { name: undefined } }],
    ['empty patch', { ...command(), values: {} }],
    ['revision zero', { ...command(), expected_revision: 0 }],
    ['unsafe revision', { ...command(), expected_revision: Number.MAX_SAFE_INTEGER + 1 }],
    ['borrowed collection', { ...command(), expected_collection_revision: 9 }],
    ['draft data', { ...command(), scope: { ...command().scope, layer: 'myDraft' } }],
    ['toggle inside edit', { ...command(), values: { checked: true } }],
    ['sharing edit', { ...command(), values: { visibility: 'common' } }],
    ['missing packed choice', { ...base(), action: 'packed-state', values: {} }],
    ['both packed choices', { ...base(), action: 'packed-state', values: { checked: true, packed_quantity: 1 } }],
    [
      'duplicate order',
      {
        ...base(),
        action: 'reorder',
        target_id: null,
        expected_revision: null,
        expected_collection_revision: 7,
        values: { ids: [id(5), id(5)] },
      },
    ],
    ['trash editing', { ...base(), action: 'trash', values: { name: 'No' } }],
  ])
    it(`rejects ${label} before an RPC`, async () => {
      expect(parse(p).success).toBe(false);
      const rpc = vi.fn();
      await expect(createPackingCommandTransport(rpc).execute(p as PackingCommand)).rejects.toThrow();
      expect(rpc).not.toHaveBeenCalled();
    });
  for (const quantity of [0, 10001, 1.5, null, true, '3', Number.NaN])
    it(`rejects quantity ${quantity}`, () => expect(parse(create({ name: 'Coat', quantity })).success).toBe(false));
  for (const grams of [-1, 1000001, 0.5, true, '350'])
    it(`rejects grams ${grams}`, () =>
      expect(parse(create({ name: 'Coat', weight_grams: grams })).success).toBe(false));
});

describe('historical packing acknowledgements', () => {
  it('preserves exact command identities and explicit nulls at the SDK boundary', async () => {
    const p = packingCommand.parse({ ...command(), values: { bag_id: null, weight_grams: null } });
    const rpc = vi.fn().mockResolvedValue(ack(p));
    expect(await createPackingCommandTransport(rpc).execute(p)).toEqual(ack(p));
    expect(rpc).toHaveBeenCalledExactlyOnceWith('execute_family_trip_packing_v1', {
      p_trip_id: p.scope.trip_id,
      p_operation_id: p.operation_id,
      p_scope: p.scope,
      p_action: p.action,
      p_target_id: p.target_id,
      p_expected_revision: p.expected_revision,
      p_expected_collection_revision: null,
      p_values: { bag_id: null, weight_grams: null },
    });
  });
  it('copies caller intent before awaiting the RPC', async () => {
    const p = command(),
      original = structuredClone(p),
      a = ack(p);
    let finish: (value: unknown) => void = () => {
      throw new Error('Missing deferred');
    };
    const rpc = vi.fn<import('./packingCommandTransport').PackingCommandRpc>(
      () =>
        new Promise<unknown>((resolve) => {
          finish = resolve;
        })
    );
    const flight = createPackingCommandTransport(rpc).execute(p);
    p.values.name = 'Changed';
    p.scope.person_id = id(99);
    finish(a);
    expect(await flight).toEqual(a);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_values: original.values, p_scope: original.scope });
  });
  it('accepts opaque revision jumps and a same-order no-op', () => {
    const p = command(),
      a = ack(p);
    if (!a.item) throw new Error('Missing fixture');
    a.item.revision += 7;
    expect(checkPackingAcknowledgement(a, p)).toEqual(a);
    const reorder = packingCommand.parse({
      ...base(),
      action: 'reorder',
      target_id: null,
      expected_revision: null,
      expected_collection_revision: 8,
      values: { ids: [id(5)] },
    });
    expect(checkPackingAcknowledgement(ack(reorder), reorder).collection_revision).toBe(8);
  });
  for (const [label, change] of [
    [
      'operation',
      (a: PackingAck) => {
        a.operation_id = id(99);
      },
    ],
    [
      'target',
      (a: PackingAck) => {
        a.target_id = id(99);
      },
    ],
    [
      'Trip',
      (a: PackingAck) => {
        a.trip_id = id(99);
      },
    ],
    [
      'actor',
      (a: PackingAck) => {
        a.scope.person_id = id(99);
      },
    ],
    [
      'lifecycle',
      (a: PackingAck) => {
        a.scope.trip_lifecycle_revision++;
      },
    ],
    [
      'action',
      (a: PackingAck) => {
        a.action = 'trash';
      },
    ],
    [
      'name',
      (a: PackingAck) => {
        if (a.item) a.item.name = 'Other';
      },
    ],
    [
      'stale revision',
      (a: PackingAck) => {
        if (a.item) a.item.revision = 3;
      },
    ],
    [
      'foreign item',
      (a: PackingAck) => {
        if (a.item) a.item.trip_id = id(99);
      },
    ],
    [
      'non-null order',
      (a: PackingAck) => {
        a.ordered_ids = [];
      },
    ],
  ] as const)
    it(`rejects a mismatched ${label}`, () => {
      const p = command(),
        a = ack(p);
      change(a);
      expect(() => checkPackingAcknowledgement(a, p)).toThrow();
    });
  for (const count of [null, 0, 1, 3])
    it(`validates normalized partial count ${count}`, () => {
      const p = packingCommand.parse({ ...base(), action: 'packed-state', values: { packed_quantity: count } });
      expect(checkPackingAcknowledgement(ack(p), p)).toEqual(ack(p));
      const bad = ack(p);
      if (!bad.item) throw new Error('Missing fixture');
      bad.item.checked = !bad.item.checked;
      bad.item.packed_quantity = null;
      expect(() => checkPackingAcknowledgement(bad, p)).toThrow();
    });
  for (const visibility of ['common', 'personal'])
    it(`validates ${visibility} create defaults and initial identity`, () => {
      const p = packingCommand.parse(create({ name: ' Coat ', visibility })),
        a = ack(p);
      expect(checkPackingAcknowledgement(a, p)).toEqual(a);
      if (!a.item) throw new Error('Missing fixture');
      a.item.owner_person_id = id(99);
      expect(() => checkPackingAcknowledgement(a, p)).toThrow();
    });
  for (const [code, status] of [
    ['42501', 403],
    ['PGRST301', 401],
    ['PT409', 409],
    ['40001', 409],
    ['22023', 400],
    ['23503', 422],
    ['23514', 422],
    ['54000', 413],
  ] as const)
    it(`preserves refusal meaning ${code}`, async () => {
      const rpc = vi.fn().mockRejectedValue({ code });
      await expect(createPackingCommandTransport(rpc).execute(command())).rejects.toMatchObject({ status });
    });
  it('does not hide connectivity failure or manufacture an acknowledgement', async () => {
    const error = new Error('ReadError');
    await expect(createPackingCommandTransport(vi.fn().mockRejectedValue(error)).execute(command())).rejects.toBe(
      error
    );
  });
});

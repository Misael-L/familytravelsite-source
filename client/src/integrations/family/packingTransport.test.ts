import { describe, expect, it, vi } from 'vitest';
import {
  packingFixtureAt as at,
  canonicalPackingList,
  canonicalPackingRow,
  canonicalPackingScope,
  packingFixtureId as id,
} from '../../../tests/helpers/familyPacking';
import type { PackingReceipt, PackingTrashPage } from './packingContract';
import { createPackingTransport } from './packingTransport';
const scope = canonicalPackingScope();
const trash = (): PackingTrashPage => ({
  version: 1,
  scope: structuredClone(scope),
  collection_revision: 7,
  items: [canonicalPackingRow({ deleted_at: at, deleted_by_person_id: id(4) })],
  next_cursor: null,
});
const receipt = (): PackingReceipt => ({
  version: 1,
  scope: structuredClone(scope),
  trip_id: scope.trip_id,
  operation_id: id(90),
  status: 'committed',
  result_redacted: false,
  result: {
    version: 1,
    scope: structuredClone(scope),
    trip_id: scope.trip_id,
    operation_id: id(90),
    action: 'update',
    target_id: id(5),
    collection_revision: 6,
    item: canonicalPackingRow(),
    ordered_ids: null,
  },
});
describe('canonical packing read transport', () => {
  it('preserves blank, case-sensitive and prototype-named category labels without prototype mutation', async () => {
    const p = canonicalPackingList();
    p.category_assignees = JSON.parse(
      JSON.stringify(
        Object.fromEntries([
          ['__proto__', [id(7)]],
          ['', [id(4)]],
          ['Clothes', [id(4)]],
          ['clothes', [id(7)]],
        ])
      )
    );
    const out = await createPackingTransport(async () => p).list(scope);
    expect(Object.keys(out.category_assignees)).toEqual(['__proto__', '', 'Clothes', 'clothes']);
    expect(Object.getOwnPropertyDescriptor(out.category_assignees, '__proto__')?.value).toEqual([id(7)]);
    expect(Object.getPrototypeOf(out.category_assignees)).toBe(Object.prototype);
  });
  it('refuses an array masquerading as a category-assignee map', async () => {
    const p = { ...canonicalPackingList(), category_assignees: [] };
    await expect(createPackingTransport(async () => p).list(scope)).rejects.toMatchObject({
      code: 'invalid_packing_response',
    });
  });

  it('uses only the named snapshot RPC and preserves exact facts, partial counts and private-inclusive totals', async () => {
    const raw = canonicalPackingList(),
      rpc = vi.fn(async () => raw),
      result = await createPackingTransport(rpc).list(scope);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_family_trip_packing_v1', { p_trip_id: scope.trip_id });
    expect(result).toEqual(raw);
    expect(result).not.toBe(raw);
    expect(result.items[0].packed_quantity).toBe(1);
    expect(result.bags[0].total_weight_grams).toBe(2200);
  });
  it('keeps an empty authorized observation including its lifecycle and Trash count', async () => {
    const p = canonicalPackingList(scope, true);
    p.trash_count = 4;
    p.scope.trip_lifecycle_revision = 3;
    expect(await createPackingTransport(async () => p).list(scope)).toEqual(p);
  });
  const bad: [string, (p: ReturnType<typeof canonicalPackingList>) => unknown][] = [
    [
      'foreign Trip',
      (p) => {
        p.scope.trip_id = id(80);
        return p;
      },
    ],
    [
      'foreign Family',
      (p) => {
        p.scope.family_id = id(80);
        return p;
      },
    ],
    [
      'foreign Auth user',
      (p) => {
        p.scope.user_id = id(80);
        return p;
      },
    ],
    [
      'foreign Person',
      (p) => {
        p.scope.person_id = id(80);
        return p;
      },
    ],
    ['draft packing', (p) => ({ ...p, scope: { ...p.scope, layer: 'myDraft' } })],
    ['missing scope', (p) => ({ ...p, scope: undefined })],
    ['unknown packet field', (p) => ({ ...p, hidden_ids: [id(80)] })],
    ['missing aggregates', (p) => ({ ...p, unassigned_weight_grams: undefined })],
    ['coerced checked', (p) => ({ ...p, items: [{ ...p.items[0], checked: 1 }] })],
    [
      'fractional quantity',
      (p) => {
        p.items[0].quantity = 1.2;
        return p;
      },
    ],
    [
      'negative quantity',
      (p) => {
        p.items[0].quantity = -1;
        return p;
      },
    ],
    [
      'impossible partial count',
      (p) => {
        p.items[0].packed_quantity = 3;
        return p;
      },
    ],
    [
      'checked partial',
      (p) => {
        p.items[0].checked = true;
        return p;
      },
    ],
    [
      'zero partial',
      (p) => {
        p.items[0].packed_quantity = 0;
        return p;
      },
    ],
    [
      'unsafe revision',
      (p) => {
        p.items[0].revision = Number.MAX_SAFE_INTEGER + 1;
        return p;
      },
    ],
    [
      'negative collection',
      (p) => {
        p.collection_revision = -1;
        return p;
      },
    ],
    [
      'mixed Trip item',
      (p) => {
        p.items[0].trip_id = id(80);
        return p;
      },
    ],
    [
      'mixed Trip bag',
      (p) => {
        p.bags[0].trip_id = id(80);
        return p;
      },
    ],
    [
      'duplicate item',
      (p) => {
        p.items.push(p.items[0]);
        return p;
      },
    ],
    [
      'duplicate bag',
      (p) => {
        p.bags.push(p.bags[0]);
        return p;
      },
    ],
    [
      'missing linked bag',
      (p) => {
        p.bags = [];
        return p;
      },
    ],
    [
      'undercounted bag',
      (p) => {
        p.bags[0].total_weight_grams = 1;
        return p;
      },
    ],
    [
      'undercounted unassigned',
      (p) => {
        p.items[0].bag_id = null;
        return p;
      },
    ],
    [
      'duplicate related Person',
      (p) => {
        p.items[0].recipient_person_ids = [id(7), id(7)];
        return p;
      },
    ],
    [
      'active Trash',
      (p) => {
        p.items[0].deleted_at = at;
        p.items[0].deleted_by_person_id = id(4);
        return p;
      },
    ],
    [
      'unpaired tombstone',
      (p) => {
        p.items[0].deleted_by_person_id = id(4);
        return p;
      },
    ],
    [
      'unbounded timestamp precision',
      (p) => {
        p.items[0].updated_at = '2026-11-08T12:34:56.1234567Z';
        return p;
      },
    ],
    [
      'unsorted ranks',
      (p) => {
        p.items.push(canonicalPackingRow({ id: id(8), sort_order: -1 }));
        return p;
      },
    ],
    [
      'blank name',
      (p) => {
        p.items[0].name = '   ';
        return p;
      },
    ],
    [
      'oversized reply',
      (p) => {
        p.bags[0].name = 'x'.repeat(8388609);
        return p;
      },
    ],
  ];
  it.each(bad)('rejects %s instead of returning partial data', async (_name, change) => {
    await expect(createPackingTransport(async () => change(canonicalPackingList())).list(scope)).rejects.toMatchObject({
      status: 502,
      code: 'invalid_packing_response',
    });
  });
  it.each([undefined, null, [], 0, 'not JSON', { items: [] }])('rejects malformed root %j', async (raw) => {
    await expect(createPackingTransport(async () => raw).list(scope)).rejects.toMatchObject({
      code: 'invalid_packing_response',
    });
  });
  it('rejects cyclic replies without leaking a serialization exception', async () => {
    const raw: Record<string, unknown> = {};
    raw.self = raw;
    await expect(createPackingTransport(async () => raw).list(scope)).rejects.toMatchObject({
      code: 'invalid_packing_response',
    });
  });
  it('preserves valid duplicate legacy ranks, whitespace and independent repeated names', async () => {
    const raw = canonicalPackingList();
    raw.items[0].name = '  Raincoat  ';
    raw.items[0].sort_order = -2;
    raw.items.push(canonicalPackingRow({ id: id(8), name: '  Raincoat  ', sort_order: -2 }));
    expect((await createPackingTransport(async () => raw).list(scope)).items).toEqual(raw.items);
  });
  it.each([
    ['42501', 403],
    ['PGRST301', 401],
    ['PT409', 409],
    ['40001', 409],
    ['22023', 400],
    ['54000', 413],
  ] as const)('retains %s as explicit failure', async (code, status) => {
    await expect(
      createPackingTransport(async () => {
        throw { code };
      }).list(scope)
    ).rejects.toMatchObject({ status });
  });
  it('does not swallow connectivity failure or replace it with an empty list', async () => {
    const error = new TypeError('Network unavailable');
    await expect(
      createPackingTransport(async () => {
        throw error;
      }).list(scope)
    ).rejects.toBe(error);
  });
});
describe('packing Trash and commitment proofs', () => {
  it('sends a complete cursor with its original microseconds', async () => {
    const p = trash(),
      rpc = vi.fn(async () => p),
      cursor = { deleted_at: '2026-11-08T12:34:56.123457+00:00', id: id(8) };
    expect(await createPackingTransport(rpc).trash(scope, 1, cursor)).toEqual(p);
    expect(rpc).toHaveBeenCalledWith('list_family_trip_packing_trash_v1', {
      p_trip_id: scope.trip_id,
      p_limit: 1,
      p_before: cursor.deleted_at,
      p_before_id: cursor.id,
    });
  });
  it('orders tied timestamps by UUID and accepts an exactly matching next cursor', async () => {
    const p = trash();
    p.items.push(canonicalPackingRow({ id: id(8), deleted_at: at, deleted_by_person_id: id(4) }));
    p.next_cursor = { deleted_at: at, id: id(8) };
    expect((await createPackingTransport(async () => p).trash(scope, 2)).items).toHaveLength(2);
  });
  for (const mode of [
    'wrong next',
    'empty next',
    'active item',
    'repeated cursor',
    'oversized page',
    'reversed ties',
    'future timestamp',
  ] as const)
    it(`refuses ${mode} Trash`, async () => {
      const p = trash();
      let before: { deleted_at: string; id: string } | null = null;
      if (mode === 'wrong next') p.next_cursor = { deleted_at: at, id: id(8) };
      if (mode === 'empty next') {
        p.items = [];
        p.next_cursor = { deleted_at: at, id: id(5) };
      }
      if (mode === 'active item') {
        p.items[0].deleted_at = null;
        p.items[0].deleted_by_person_id = null;
      }
      if (mode === 'repeated cursor') before = { deleted_at: at, id: id(5) };
      if (mode === 'oversized page')
        p.items.push(canonicalPackingRow({ id: id(8), deleted_at: at, deleted_by_person_id: id(4) }));
      if (mode === 'reversed ties')
        p.items.unshift(canonicalPackingRow({ id: id(8), deleted_at: at, deleted_by_person_id: id(4) }));
      if (mode === 'future timestamp') before = { deleted_at: '2026-11-08T12:34:56.123455+00:00', id: id(5) };
      await expect(createPackingTransport(async () => p).trash(scope, 1, before)).rejects.toMatchObject({
        code: 'invalid_packing_response',
      });
    });
  it.each([0, 101, 1.2, NaN])('refuses invalid limit %s before dispatch', async (limit) => {
    const rpc = vi.fn();
    await expect(createPackingTransport(rpc).trash(scope, limit)).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'redacted', 'historical'] as const)(
    'distinguishes %s receipt without submitting a command',
    async (kind) => {
      const p = receipt();
      p.scope.trip_lifecycle_revision = 2;
      if (kind === 'unknown') {
        p.status = 'unknown';
        p.result = null;
      }
      if (kind === 'redacted') {
        p.result_redacted = true;
        p.result = null;
      }
      const rpc = vi.fn(async () => p);
      expect(await createPackingTransport(rpc).receipt(scope, id(90))).toEqual(p);
      expect(rpc).toHaveBeenCalledExactlyOnceWith('get_family_trip_packing_receipt_v1', {
        p_trip_id: scope.trip_id,
        p_operation_id: id(90),
      });
    }
  );
  for (const mode of [
    'unknown content',
    'unknown redacted',
    'redacted content',
    'missing commitment',
    'wrong actor',
    'wrong operation',
    'wrong target',
    'future lifecycle',
    'invalid reorder',
  ] as const)
    it(`refuses ${mode} receipt`, async () => {
      const p = receipt();
      const acknowledgement = p.result;
      if (!acknowledgement) throw new Error('Missing fixture acknowledgement');
      if (mode === 'unknown content') p.status = 'unknown';
      if (mode === 'unknown redacted') {
        p.status = 'unknown';
        p.result_redacted = true;
        p.result = null;
      }
      if (mode === 'redacted content') p.result_redacted = true;
      if (mode === 'missing commitment') p.result = null;
      if (mode === 'wrong actor') acknowledgement.scope.person_id = id(80);
      if (mode === 'wrong operation') p.operation_id = id(80);
      if (mode === 'wrong target') acknowledgement.target_id = id(80);
      if (mode === 'future lifecycle') acknowledgement.scope.trip_lifecycle_revision = 3;
      if (mode === 'invalid reorder') {
        acknowledgement.action = 'reorder';
        acknowledgement.target_id = null;
        acknowledgement.ordered_ids = [];
      }
      const rpc = vi.fn(async () => p);
      await expect(createPackingTransport(rpc).receipt(scope, id(90))).rejects.toMatchObject({
        code: 'invalid_packing_response',
      });
      expect(rpc).toHaveBeenCalledExactlyOnceWith('get_family_trip_packing_receipt_v1', {
        p_trip_id: scope.trip_id,
        p_operation_id: id(90),
      });
    });
});

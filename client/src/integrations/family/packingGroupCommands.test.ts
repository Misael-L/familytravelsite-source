import { describe, expect, it, vi } from 'vitest';
import { canonicalPackingRow, packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import {
  canonicalPackingGroupAck as ack,
  canonicalPackingGroup as packet,
} from '../../../tests/helpers/familyPackingGroups';
import { packingGroupEnvelope } from './packingGroupContract';
import { checkPackingGroupAcknowledgement, createPackingGroupTransport } from './packingGroupTransport';

describe('strict complete original packing group protocol', () => {
  it.each(['group-packed-state', 'group-trash', 'clear-completed'] as const)(
    'accepts the full %s set including no-op rows',
    async (action) => {
      const p = packet(action),
        rpc = vi.fn().mockResolvedValue(ack(p));
      expect(await createPackingGroupTransport(rpc).execute(p)).toEqual(ack(p));
      expect(rpc).toHaveBeenCalledWith('execute_family_trip_packing_group_v1', {
        p_trip_id: p.command.scope.trip_id,
        p_operation_id: p.command.operation_id,
        p_scope: p.command.scope,
        p_action: action,
        p_expected_collection_revision: 7,
        p_selector: p.command.selector,
        p_observed_items: p.command.observed_items,
        p_values: p.command.values,
      });
    }
  );
  it('keeps empty and unchanged groups as exact no-ops', () => {
    for (const p of [
      packet('group-trash', []),
      packet('group-packed-state', [
        canonicalPackingRow({ checked: true, packed_quantity: null, category: '', is_private: false }),
      ]),
    ]) {
      expect(checkPackingGroupAcknowledgement(ack(p), p).collection_revision).toBe(7);
    }
  });
  it('accepts raw Unicode/default labels and counts PostgreSQL characters', () => {
    const p = packet('group-trash', [canonicalPackingRow({ category: '🌏'.repeat(200), is_private: false })]);
    p.command.selector.categories = ['🌏'.repeat(200)];
    expect(packingGroupEnvelope.safeParse(p).success).toBe(true);
    p.command.selector.categories = ['🌏'.repeat(201)];
    expect(packingGroupEnvelope.safeParse(p).success).toBe(false);
  });
  it.each([
    'missing',
    'duplicate',
    'unsorted',
    'forged-id',
    'foreign-trip',
    'checked',
    'revision',
    'status',
    'view',
    'category',
    'extra-command',
    'extra-row',
    'clear-selector',
    'unsafe',
    'oversized',
    'nul',
  ] as const)('refuses malformed original %s before RPC', async (kind) => {
    const p = packet(kind === 'clear-selector' ? 'clear-completed' : 'group-trash');
    if (kind === 'missing') p.original_items.pop();
    if (kind === 'duplicate') p.command.observed_items.push(p.command.observed_items[0]);
    if (kind === 'unsorted') p.command.observed_items.reverse();
    if (kind === 'forged-id') p.command.observed_items[0].id = id(99);
    if (kind === 'foreign-trip') p.original_items[0].trip_id = id(99);
    if (kind === 'checked') p.command.observed_items[0].checked = !p.command.observed_items[0].checked;
    if (kind === 'revision') p.command.observed_items[0].revision++;
    if (kind === 'status') p.command.selector.status = 'done';
    if (kind === 'view') p.command.selector.view = 'personal';
    if (kind === 'category') p.command.selector.categories = ['Translated fallback'];
    if (kind === 'extra-command') Object.assign(p.command, { surprise: true });
    if (kind === 'extra-row') Object.assign(p.original_items[0], { surprise: true });
    if (kind === 'clear-selector') p.command.selector.categories = [''];
    if (kind === 'unsafe') p.command.expected_collection_revision = Number.MAX_SAFE_INTEGER + 1;
    if (kind === 'oversized') p.command.observed_items = Array(2001).fill(p.command.observed_items[0]);
    if (kind === 'nul') p.command.selector.categories = ['\0'];
    const rpc = vi.fn();
    await expect(createPackingGroupTransport(rpc).execute(p)).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    'operation',
    'kind',
    'scope',
    'action',
    'selector',
    'values',
    'missing-row',
    'extra-row',
    'order',
    'changed-id',
    'omitted-change',
    'unchanged-revision',
    'stale-change',
    'unrelated-field',
    'partial',
    'collection',
    'extra-key',
  ] as const)('refuses forged acknowledgement %s', (kind) => {
    const p = packet(),
      a = ack(p);
    if (kind === 'operation') a.operation_id = id(99);
    if (kind === 'kind') Object.assign(a, { kind: 'packing-item' });
    if (kind === 'scope') a.scope.person_id = id(99);
    if (kind === 'action') a.action = 'group-trash';
    if (kind === 'selector') a.selector.status = 'done';
    if (kind === 'values') a.values = { checked: false };
    if (kind === 'missing-row') a.items.pop();
    if (kind === 'extra-row') a.items.push(a.items[0]);
    if (kind === 'order') a.items.reverse();
    if (kind === 'changed-id') a.changed_ids.push(id(99));
    if (kind === 'omitted-change') a.changed_ids = [];
    if (kind === 'unchanged-revision') a.items[1].revision++;
    if (kind === 'stale-change') a.items[0].revision = p.original_items[0].revision;
    if (kind === 'unrelated-field') a.items[0].name = 'Unrequested name';
    if (kind === 'partial') a.items[0].packed_quantity = 1;
    if (kind === 'collection') a.collection_revision = 7;
    if (kind === 'extra-key') Object.assign(a, { item: null });
    expect(() => checkPackingGroupAcknowledgement(a, p)).toThrow();
  });
  it('requires exact untouched rows and actor/timestamp on every trashed row', () => {
    const p = packet('clear-completed'),
      a = ack(p);
    a.items[0].checked = true;
    expect(() => checkPackingGroupAcknowledgement(a, p)).toThrow();
    const t = packet('group-trash'),
      b = ack(t);
    b.items[0].deleted_by_person_id = id(99);
    expect(() => checkPackingGroupAcknowledgement(b, t)).toThrow();
  });
  it('snapshots caller objects before waiting for the RPC', async () => {
    const p = packet(),
      out = ack(p),
      rpc = vi.fn().mockResolvedValue(out);
    const flight = createPackingGroupTransport(rpc).execute(p);
    p.command.values = { checked: false };
    expect(await flight).toEqual(out);
  });
  it.each(['unknown', 'visible', 'redacted'] as const)('validates %s receipts without executing', async (mode) => {
    const p = packet(),
      rpc = vi.fn().mockResolvedValue({
        version: 1,
        kind: 'packing-group',
        trip_id: p.command.scope.trip_id,
        operation_id: p.command.operation_id,
        scope: { ...p.command.scope, trip_lifecycle_revision: 2 },
        status: mode === 'unknown' ? 'unknown' : 'committed',
        result_redacted: mode === 'redacted',
        result: mode === 'visible' ? ack(p) : null,
      });
    expect((await createPackingGroupTransport(rpc).receipt(p)).status).toBe(
      mode === 'unknown' ? 'unknown' : 'committed'
    );
    expect(rpc.mock.calls[0][0]).toBe('get_family_trip_packing_group_receipt_v1');
  });
  it.each(['operation', 'actor', 'kind', 'unknown-result', 'redacted-result', 'missing-result', 'lifecycle'] as const)(
    'rejects forged %s receipts',
    async (kind) => {
      const p = packet(),
        r = {
          version: 1,
          kind: 'packing-group',
          trip_id: p.command.scope.trip_id,
          operation_id: p.command.operation_id,
          scope: structuredClone(p.command.scope),
          status: 'committed',
          result_redacted: false,
          result: ack(p) as unknown,
        };
      if (kind === 'operation') r.operation_id = id(99);
      if (kind === 'actor') r.scope.user_id = id(99);
      if (kind === 'kind') r.kind = 'packing-item';
      if (kind === 'unknown-result') r.status = 'unknown';
      if (kind === 'redacted-result') r.result_redacted = true;
      if (kind === 'missing-result') r.result = null;
      if (kind === 'lifecycle') r.scope.trip_lifecycle_revision = -1;
      await expect(createPackingGroupTransport(vi.fn().mockResolvedValue(r)).receipt(p)).rejects.toMatchObject({
        status: 502,
      });
    }
  );
  it.each([
    ['42501', 403],
    ['PGRST301', 401],
    ['PT409', 409],
    ['22023', 400],
    ['23514', 422],
    ['54000', 413],
  ] as const)('maps real RPC refusal %s', async (code, status) => {
    await expect(
      createPackingGroupTransport(vi.fn().mockRejectedValue({ code })).execute(packet())
    ).rejects.toMatchObject({ status });
  });

  it.each(['constructor', 'toString', '__proto__', '0A000', 'PT500'])(
    'preserves unrecognized group RPC rejection %s on execution and receipt',
    async (code) => {
      const original = { code, message: 'Unrecognized fixture refusal' };
      const transport = createPackingGroupTransport(vi.fn().mockRejectedValue(original));
      const request = packet();
      await expect(transport.execute(request)).rejects.toBe(original);
      await expect(transport.receipt(request)).rejects.toBe(original);
    }
  );
});

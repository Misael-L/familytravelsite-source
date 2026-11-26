import { describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import {
  canonicalCategoryAck as ack,
  canonicalCategoryEnvelope as envelope,
  canonicalPackingCategories as packet,
} from '../../../tests/helpers/familyPackingCategories';
import { packingCategoryEnvelope, packingCategoryPacket, packingCategoryPeople } from './packingCategoryContract';
import {
  checkPackingCategoryAcknowledgement,
  checkPackingCategoryPacket,
  createPackingCategoryTransport,
} from './packingCategoryTransport';

describe('strict coupled category packet and commands', () => {
  it('keeps v1 facts and exact category/item identity in one snapshot', () => {
    const p = packet();
    expect(checkPackingCategoryPacket(p, p.scope)).toEqual(p);
  });
  it.each(['', 'Other', '__proto__', 'constructor', 'toString', ' Gear ', 'é', 'e\u0301', '😀'.repeat(200)])(
    'preserves raw label %s without dictionary inheritance',
    (name) => {
      const p = packet();
      p.categories[0].name = name;
      p.packing.items.forEach((r) => {
        r.category = name;
      });
      expect(checkPackingCategoryPacket(p, p.scope).categories[0].name).toBe(name);
    }
  );
  it.each([
    'scope',
    'collection',
    'extra-category',
    'missing-link',
    'wrong-category',
    'duplicate-link',
    'private-owner',
    'extra-person',
    'duplicate-category',
    'unsorted-links',
    'unknown-key',
  ])('rejects inconsistent %s without filling gaps', (kind) => {
    const p = packet();
    switch (kind) {
      case 'scope':
        p.scope.person_id = id(40);
        break;
      case 'collection':
        p.collection_revision++;
        break;
      case 'extra-category':
        p.categories.push({ ...p.categories[0], id: id(30) });
        break;
      case 'missing-link':
        p.item_categories.pop();
        break;
      case 'wrong-category':
        p.item_categories[0].category_id = id(30);
        break;
      case 'duplicate-link':
        p.item_categories[1] = p.item_categories[0];
        break;
      case 'private-owner':
        p.categories[0].owner_person_id = p.scope.person_id;
        break;
      case 'extra-person':
        p.people.push({ id: id(40), display_name: 'Unreferenced', is_guest: true, eligible: true });
        break;
      case 'duplicate-category':
        p.categories.push(p.categories[0]);
        break;
      case 'unsorted-links':
        p.item_categories.reverse();
        break;
      case 'unknown-key':
        Object.assign(p, { extra: true });
        break;
    }
    expect(() => checkPackingCategoryPacket(p, packet().scope)).toThrow();
  });
  it('retains unknown/ineligible provenance and validates the old common assignment mirror', () => {
    const p = packet();
    p.categories[0].assignments = [{ person_id: id(40), assigned_at: null, assigned_by_person_id: null }];
    p.people = [{ id: id(40), display_name: 'Historical guest', is_guest: true, eligible: false }];
    p.packing.category_assignees = { Gear: [id(40)] };
    expect(packingCategoryPacket.parse(p)).toEqual(p);
    p.packing.category_assignees.Gear = [];
    expect(packingCategoryPacket.safeParse(p).success).toBe(false);
  });
  it('uses own-property assignment labels and keeps a literal reserved category unassigned', () => {
    const p = packet();
    p.categories[0].name = '__proto__';
    p.packing.items.forEach((r) => {
      r.category = '__proto__';
    });
    expect(checkPackingCategoryPacket(p, p.scope)).toEqual(p);
  });
  it.each([
    'name',
    'revision',
    'owner',
    'extra',
    'source-row',
    'unsorted-assignees',
    'personal-assignees',
    'null-character',
    'unpaired-surrogate',
  ])('refuses malformed original intent %s', (kind) => {
    const p = envelope();
    if (kind === 'name') p.command.values = { name: '' };
    if (kind === 'revision') p.command.observed_category.revision = 9007199254740992;
    if (kind === 'owner') p.command.observed_category.owner_person_id = id(40);
    if (kind === 'extra') Object.assign(p.command.values, { extra: 'x' });
    if (kind === 'source-row') p.original_items[0].category = 'Foreign';
    if (kind === 'unsorted-assignees')
      Object.assign(p.command, { action: 'category-assignees', values: { person_ids: [id(40), id(4)] } });
    if (kind === 'personal-assignees') {
      p.command.observed_category.owner_person_id = p.command.scope.person_id;
      Object.assign(p.command, { action: 'category-assignees', values: { person_ids: [] } });
    }
    if (kind === 'null-character') p.command.values = { name: '\0' };
    if (kind === 'unpaired-surrogate') p.command.values = { name: '\ud800' };
    expect(packingCategoryEnvelope.safeParse(p).success).toBe(false);
  });
});
describe('category commitment proof stays distinct from canonical publication', () => {
  it('accepts the exact rename and its unchanged no-op', () => {
    const p = envelope();
    expect(checkPackingCategoryAcknowledgement(ack(p), p)).toEqual(ack(p));
    const no = envelope(packet(), { action: 'category-rename', values: { name: 'Gear' } });
    expect(checkPackingCategoryAcknowledgement(ack(no), no)).toEqual(ack(no));
  });
  it.each([
    'kind',
    'operation',
    'scope',
    'name',
    'revision',
    'assignment',
    'created',
    'missing-row',
    'row-revision',
    'collection',
    'values',
    'extra',
  ])('refuses forged acknowledgement %s', (kind) => {
    const p = envelope(),
      a = ack(p);
    if (kind === 'kind') Object.assign(a, { kind: 'packing-group' });
    if (kind === 'operation') a.operation_id = id(400);
    if (kind === 'scope') a.scope.user_id = id(400);
    if (kind === 'name') a.category.name = 'Other';
    if (kind === 'revision') a.category.revision++;
    if (kind === 'assignment')
      a.category.assignments.push({ person_id: id(40), assigned_at: null, assigned_by_person_id: null });
    if (kind === 'created') a.category.created_at = '2026-01-01T00:00:00Z';
    if (kind === 'missing-row') a.changed_item_revisions.pop();
    if (kind === 'row-revision') a.changed_item_revisions[0].revision++;
    if (kind === 'collection') a.collection_revision = p.command.expected_collection_revision;
    if (kind === 'values') a.values = { name: 'Other' };
    if (kind === 'extra') Object.assign(a, { extra: true });
    expect(() => checkPackingCategoryAcknowledgement(a, p)).toThrow();
  });
  it('checks added responsibility actor and retains an unchanged unknown historical link', () => {
    const p = envelope(packet(), { action: 'category-assignees', values: { person_ids: [id(40)] } }),
      a = ack(p);
    expect(checkPackingCategoryAcknowledgement(a, p)).toEqual(a);
    a.category.assignments[0].assigned_by_person_id = id(400);
    expect(() => checkPackingCategoryAcknowledgement(a, p)).toThrow();
  });
  it.each(['42501', 'PT409', '22023', '54000', '0A000', 'PGRST301'])(
    'maps refusal %s without raw server detail',
    async (code) => {
      const t = createPackingCategoryTransport(async () => {
        throw { code, message: 'sensitive detail' };
      });
      await expect(t.execute(envelope())).rejects.toThrow('original category request');
    }
  );
  it('sends one exact RPC with the complete original and no item loop', async () => {
    const p = envelope(),
      rpc = vi.fn().mockResolvedValue(ack(p));
    await createPackingCategoryTransport(rpc).execute(p);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('execute_family_trip_packing_category_v1', {
      p_trip_id: p.command.scope.trip_id,
      p_operation_id: p.command.operation_id,
      p_scope: p.command.scope,
      p_action: p.command.action,
      p_expected_collection_revision: p.command.expected_collection_revision,
      p_observed_category: p.command.observed_category,
      p_values: p.command.values,
    });
  });
  it.each(['unknown', 'redacted', 'visible'])(
    'inspects the typed %s receipt without another execute',
    async (status) => {
      const p = envelope(),
        rpc = vi.fn().mockResolvedValue({
          version: 1,
          kind: 'packing-category',
          trip_id: p.command.scope.trip_id,
          operation_id: p.command.operation_id,
          scope: { ...p.command.scope, trip_lifecycle_revision: 2 },
          status: status === 'unknown' ? 'unknown' : 'committed',
          result_redacted: status === 'redacted',
          result: status === 'visible' ? ack(p) : null,
        });
      await expect(createPackingCategoryTransport(rpc).receipt(p)).resolves.toBeDefined();
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  );
  it('refuses an invalid nested v1 packing weight even in an otherwise coherent category packet', () => {
    const p = packet();
    p.packing.unassigned_weight_grams = 0;
    expect(() => checkPackingCategoryPacket(p, p.scope)).toThrow();
  });
});

describe('referenced historical Person facts are separate from roster eligibility', () => {
  it('uses referenced display names for missing historical travelers without treating them as eligible options', () => {
    const p = packet();
    p.categories[0].assignments = [{ person_id: id(40), assigned_at: null, assigned_by_person_id: null }];
    p.people = [{ id: id(40), display_name: 'Historical guest', is_guest: true, eligible: false }];
    p.packing.category_assignees = { Gear: [id(40)] };
    expect(checkPackingCategoryPacket(p, p.scope)).toEqual(p);
    expect(packingCategoryPeople(p, [])).toEqual([{ personId: id(40), displayName: 'Historical guest' }]);
    expect(p.people[0].eligible).toBe(false);
  });
  it('keeps the authorized roster facts instead of replacing them with a duplicate display record', () => {
    const p = packet();
    p.people = [{ id: id(40), display_name: 'Historical name', is_guest: true, eligible: false }];
    expect(packingCategoryPeople(p, [{ personId: id(40), displayName: 'Current roster name' }])).toEqual([
      { personId: id(40), displayName: 'Current roster name' },
    ]);
  });
});

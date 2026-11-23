import { describe, expect, it, vi } from 'vitest';
import { handleFamilyList } from './listHandler';
import { FamilyFrontendRepository, familyReaders, type FamilyReaders, type FamilySession } from './repository';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session: FamilySession = {
  userId: uuid(1),
  personId: uuid(2),
  familyId: uuid(3),
  user: {
    username: 'Member',
    email: 'member@example.test',
    avatar_url: null,
    created_at: '2026-01-01',
  },
};
function fixture() {
  let rows = [
    {
      id: uuid(5),
      tripId: uuid(4),
      name: 'Camera',
      checked: false,
      category: 'Gear',
      sortOrder: 4,
      quantity: 2,
      weightGrams: 500,
      bagId: uuid(6),
      isPrivate: true,
      ownerPersonId: session.personId,
      recipientPersonIds: [uuid(7)],
      contributorPersonIds: [],
    },
  ];
  const upsert = vi.fn(async (_tripId: string, draft: Record<string, unknown>) => {
    const id = typeof draft.id === 'string' ? draft.id : uuid(8);
    const old = rows.find((r) => r.id === id) ?? rows[0];
    const row = { ...old, ...draft, id };
    rows = rows.filter((r) => r.id !== id).concat(row as typeof old);
    return id;
  });
  const writes = {
    deletePackingItem: vi.fn(async () => {}),
    deletePackingBag: vi.fn(async () => {}),
    upsertPackingBag: vi.fn(async () => uuid(6)),
    setPackingBagMembers: vi.fn(async () => {}),
    setPackingItemSharing: vi.fn(async () => {}),
    setPackingItemContributor: vi.fn(async () => {}),
    deleteTodoItem: vi.fn(async () => {}),
  };
  const readers = {
    ...familyReaders,
    packing: {
      ...familyReaders.packing,
      listPackingItems: vi.fn(async () => rows),
      listPackingBags: vi.fn(async () => [
        {
          id: uuid(6),
          tripId: uuid(4),
          name: 'Bag',
          color: '#123456',
          weightLimitGrams: 2000,
          sortOrder: 0,
          memberPersonIds: [session.personId],
        },
      ]),
      upsertPackingItem: upsert,
      deletePackingItem: writes.deletePackingItem,
      deletePackingBag: writes.deletePackingBag,
      upsertPackingBag: writes.upsertPackingBag,
      setPackingBagMembers: writes.setPackingBagMembers,
      setPackingItemSharing: writes.setPackingItemSharing,
      setPackingItemContributor: writes.setPackingItemContributor,
    },
    todos: {
      ...familyReaders.todos,
      listTodoItems: vi.fn(async () => [
        {
          id: uuid(9),
          tripId: uuid(4),
          name: 'Print tickets',
          category: 'Travel',
          checked: false,
          sortOrder: 0,
          dueDate: null,
          description: null,
          assignedPersonId: null,
          priority: 0,
        },
      ]),
      deleteTodoItem: writes.deleteTodoItem,
    },
    listTripTravelers: vi.fn(async () => [
      { personId: session.personId, displayName: 'Member', color: null },
      { personId: uuid(7), displayName: 'Other', color: null },
    ]),
    capabilities: { ...familyReaders.capabilities, canMutateTrip: vi.fn(async () => true) },
    permissions: {
      ...familyReaders.permissions,
      listTripActionOutcomes: vi.fn<FamilyReaders['permissions']['listTripActionOutcomes']>(async () => ({
        tripId: uuid(4),
        familyId: session.familyId,
        outcomes: { 'trip.packing.manage': 'direct', 'trip.todos.manage': 'direct' },
      })),
    },
  } satisfies FamilyReaders;
  const repo = new FamilyFrontendRepository(async () => session, readers);
  const request = (method: string, path: string, body: unknown = undefined) =>
    handleFamilyList(
      repo,
      { method, pathname: `/trips/${uuid(4)}/${path}`, query: new URLSearchParams(), body },
      uuid(4),
      path
    );
  return { repo, request, upsert, writes, readers };
}
describe('Copied Lists controls against canonical Family records', () => {
  it('returns the upstream field contract with canonical people and a distinct bag identity', async () => {
    const f = fixture(),
      result = (await f.request('GET', 'packing')) as {
        items: Record<string, any>[];
        bags: Record<string, any>[];
      };
    const v = await f.repo.views();
    expect(result.items[0]).toMatchObject({
      weight_grams: 500,
      quantity: 2,
      is_private: 1,
      owner_username: 'Member',
      recipients: [{ username: 'Other' }],
    });
    expect(v.ids.uuid('packingBag', result.bags[0].id)).toBe(uuid(6));
    expect(result.items[0].bag_id).toBe(result.bags[0].id);
    expect(() => v.ids.uuid('packing', result.bags[0].id)).toThrow();
  });
  it('a checkbox write preserves privacy, recipients, quantity and weight', async () => {
    const f = fixture(),
      v = await f.repo.views(),
      key = v.ids.register('packing', uuid(5));
    await f.request('PUT', `packing/${key}`, { checked: 1 });
    expect(f.upsert).toHaveBeenCalledWith(
      uuid(4),
      expect.objectContaining({
        id: uuid(5),
        checked: true,
        isPrivate: true,
        ownerPersonId: session.personId,
        quantity: 2,
        weightGrams: 500,
        bagId: uuid(6),
      })
    );
  });
  it('clone creates a different canonical row and never overwrites the source', async () => {
    const f = fixture(),
      v = await f.repo.views(),
      key = v.ids.register('packing', uuid(5));
    await f.request('POST', `packing/${key}/clone`);
    expect(f.upsert).toHaveBeenCalledWith(
      uuid(4),
      expect.objectContaining({ id: null, checked: false, name: 'Camera' })
    );
  });
  it('rejects cross-trip item IDs and unknown actions before any persistence call', async () => {
    const f = fixture();
    await expect(f.request('PUT', `packing/${uuid(99)}`, { name: 'Overwrite' })).rejects.toMatchObject({ status: 404 });
    const v = await f.repo.views(),
      key = v.ids.register('packing', uuid(5));
    await expect(f.request('POST', `packing/${key}/unrecognized`, {})).rejects.toMatchObject({
      status: 422,
    });
    expect(f.upsert).not.toHaveBeenCalled();
  });
  it('uses the current trip bag and person UUIDs for the native membership write', async () => {
    const f = fixture();
    const { ids } = await f.repo.views();
    const bagId = ids.register('packingBag', uuid(6));
    const traveler = ids.register('person', uuid(7));

    await expect(f.request('PUT', `packing/bags/${bagId}/members`, { user_ids: [traveler] })).resolves.toMatchObject({
      bag: { id: bagId },
    });
    expect(f.writes.setPackingBagMembers).toHaveBeenCalledExactlyOnceWith(uuid(6), [uuid(7)]);
    expect(f.writes.upsertPackingBag).not.toHaveBeenCalled();
  });

  it('uses the correct canonical item, owner and recipients for native sharing', async () => {
    const f = fixture();
    const { ids } = await f.repo.views();
    const itemId = ids.register('packing', uuid(5));
    const traveler = ids.register('person', uuid(7));

    await expect(
      f.request('PUT', `packing/${itemId}/sharing`, { visibility: 'shared', recipient_ids: [traveler] })
    ).resolves.toMatchObject({ item: { id: itemId } });
    expect(f.writes.setPackingItemSharing).toHaveBeenCalledExactlyOnceWith(uuid(5), 'shared', session.personId, [
      uuid(7),
    ]);
  });

  it('adds the current traveler and removes only the named traveler', async () => {
    const f = fixture();
    const { ids } = await f.repo.views();
    const itemId = ids.register('packing', uuid(5));
    const traveler = ids.register('person', uuid(7));

    await f.request('POST', `packing/${itemId}/contributors`);
    await f.request('DELETE', `packing/${itemId}/contributors/${traveler}`);
    expect(f.writes.setPackingItemContributor.mock.calls).toEqual([
      [uuid(5), session.personId, true],
      [uuid(5), uuid(7), false],
    ]);
  });

  it.each([
    { path: `packing/bags/${uuid(6)}`, id: uuid(6), writer: 'deletePackingBag' },
    { path: `packing/${uuid(5)}`, id: uuid(5), writer: 'deletePackingItem' },
    { path: `todo/${uuid(9)}`, id: uuid(9), writer: 'deleteTodoItem' },
  ] as const)('deletes only the resolved record at $path', async ({ path, id, writer }) => {
    const f = fixture();
    await expect(f.request('DELETE', path)).resolves.toEqual({ success: true });
    expect(f.writes[writer]).toHaveBeenCalledExactlyOnceWith(id);
  });

  it.each([
    ['POST', `packing/bags/${uuid(6)}/members`],
    ['DELETE', `packing/bags/${uuid(6)}/unrecognized`],
    ['GET', `packing/${uuid(5)}/sharing`],
    ['PUT', `packing/${uuid(5)}/contributors`],
    ['DELETE', `packing/${uuid(5)}/contributors`],
  ])('refuses unsupported %s %s before any writer', async (method, path) => {
    const f = fixture();
    await expect(f.request(method, path)).rejects.toMatchObject({ status: 422, code: 'list_action_unavailable' });
    for (const writer of Object.values(f.writes)) expect(writer).not.toHaveBeenCalled();
    expect(f.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { method: 'PUT', path: `packing/bags/${uuid(99)}/members`, code: 'bag_unavailable' },
    { method: 'PUT', path: `packing/${uuid(99)}/sharing`, code: 'item_unavailable' },
    { method: 'DELETE', path: `todo/${uuid(99)}`, code: 'item_unavailable' },
  ])('refuses IDs absent from the trip at $path', async ({ method, path, code }) => {
    const f = fixture();
    await expect(f.request(method, path)).rejects.toMatchObject({ status: 404, code });
    for (const writer of Object.values(f.writes)) expect(writer).not.toHaveBeenCalled();
  });

  it('checks governed capability before a write even if a caller bypasses the UI', async () => {
    const f = fixture();
    vi.mocked(f.readers.permissions.listTripActionOutcomes).mockResolvedValue({
      tripId: uuid(4),
      familyId: session.familyId,
      outcomes: { 'trip.packing.manage': 'deny' },
    });
    const v = await f.repo.views();
    await expect(f.request('DELETE', `packing/${v.ids.register('packing', uuid(5))}`)).rejects.toMatchObject({
      status: 403,
    });
    expect(f.writes.deletePackingItem).not.toHaveBeenCalled();
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { packingApi } from '../../api/client';
import { usePackingCategoryAssignees } from '../../components/Packing/usePackingCategoryAssignees';
import { handleFamilyList } from './listHandler';
import { FamilyFrontendRepository, familyReaders, type FamilyReaders, type FamilySession } from './repository';

const key = (n: number) => `b04ba000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session: FamilySession = {
  userId: key(1),
  personId: key(2),
  familyId: key(3),
  user: { username: 'Member', email: 'member@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
};
function fixture() {
  const save = vi.fn(async () => {}),
    upsert = vi.fn(async () => key(5));
  const readers: FamilyReaders = {
    ...familyReaders,
    packing: {
      ...familyReaders.packing,
      listPackingCategoryAssignees: vi.fn(async () => ({ Gear: [key(2), key(7)] })),
      setPackingCategoryAssignees: save,
      upsertPackingItem: upsert,
    },
    listTripTravelers: vi.fn(async () => [
      { personId: key(2), displayName: 'Current traveler', color: null },
      { personId: key(7), displayName: 'Other traveler', color: null },
    ]),
    capabilities: { ...familyReaders.capabilities, canMutateTrip: vi.fn(async () => true) },
    permissions: {
      ...familyReaders.permissions,
      listTripActionOutcomes: vi.fn(async () => ({
        tripId: key(4),
        familyId: key(3),
        outcomes: { 'trip.packing.manage': 'direct' as const },
      })),
    },
  };
  const repo = new FamilyFrontendRepository(async () => session, readers);
  const request = (method: string, path: string, body?: unknown) =>
    handleFamilyList(
      repo,
      { method, pathname: `/trips/${key(4)}/${path}`, query: new URLSearchParams(), body },
      key(4),
      path
    );
  return { repo, request, readers, save, upsert };
}
beforeEach(() => vi.restoreAllMocks());
it.each([0, 1, null])(
  'partial quantity %s is refused before any read or persistence, including explicit clears',
  async (count) => {
    const f = fixture();
    await expect(
      f.request('PUT', `packing/${key(5)}`, { packed_quantity: count, name: 'Keep original' })
    ).rejects.toMatchObject({ status: 422, code: 'packing_partial_count_unavailable' });
    expect(f.readers.listTripTravelers).not.toHaveBeenCalled();
    expect(f.upsert).not.toHaveBeenCalled();
  }
);
it('a create cannot silently drop a partial packed count either', async () => {
  const f = fixture();
  await expect(f.request('POST', 'packing', { name: 'Boots', packed_quantity: 1 })).rejects.toMatchObject({
    status: 422,
  });
  expect(f.upsert).not.toHaveBeenCalled();
});
it('actual native category hook consumes handler assignee objects on both load and save', async () => {
  const f = fixture(),
    ids = (await f.repo.views()).ids;
  vi.spyOn(packingApi, 'getCategoryAssignees').mockImplementation(async () =>
    f.request('GET', 'packing/category-assignees')
  );
  vi.spyOn(packingApi, 'setCategoryAssignees').mockImplementation(async (_trip, category, people) =>
    f.request('PUT', `packing/category-assignees/${encodeURIComponent(category)}`, { user_ids: people })
  );
  const toast = { error: vi.fn() },
    { result } = renderHook(() => usePackingCategoryAssignees({ tripId: 1, t: (s) => s, toast }));
  await waitFor(() => expect(result.current.categoryAssignees.Gear).toHaveLength(2));
  expect(result.current.categoryAssignees.Gear.map((person) => person.username)).toEqual([
    'Current traveler',
    'Other traveler',
  ]);
  const other = ids.register('person', key(7));
  await act(async () => {
    await result.current.setAssignees('Gear', [other]);
  });
  expect(result.current.categoryAssignees.Gear).toEqual([{ user_id: other, username: 'Other traveler' }]);
  expect(f.save).toHaveBeenCalledWith(key(4), 'Gear', [key(7)]);
  expect(toast.error).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.setAssignees('Gear', []);
  });
  expect(result.current.categoryAssignees.Gear).toEqual([]);
});
it('unknown assignee identity fails before a save and deny never invokes persistence', async () => {
  const f = fixture();
  await expect(f.request('PUT', 'packing/category-assignees/Gear', { user_ids: [999] })).rejects.toMatchObject({
    code: 'unknown_view_key',
  });
  vi.mocked(f.readers.permissions.listTripActionOutcomes).mockResolvedValue({
    tripId: key(4),
    familyId: key(3),
    outcomes: { 'trip.packing.manage': 'deny' },
  });
  await expect(f.request('PUT', 'packing/category-assignees/Gear', { user_ids: [] })).rejects.toMatchObject({
    status: 403,
  });
  expect(f.save).not.toHaveBeenCalled();
});

it('a later partial-count import entry refuses the whole request before earlier entries can save', async () => {
  const f = fixture();
  await expect(
    f.request('POST', 'packing/import', {
      items: [{ name: 'First safe item' }, { name: 'Second item', packed_quantity: null }],
    })
  ).rejects.toMatchObject({ status: 422, code: 'packing_partial_count_unavailable' });
  expect(f.upsert).not.toHaveBeenCalled();
  expect(f.readers.listTripTravelers).not.toHaveBeenCalled();
});

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import api from '../../api/client';
import { useTripMembers } from '../../components/Trips/useTripShare';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { tripCoverRepo } from '../../repo/tripCoverRepo';
import { tripLinksRepo } from '../../repo/tripLinksRepo';
import { tripMembersRepo } from '../../repo/tripMembersRepo';
import { setAuthed } from '../../sync/authGate';
import { setForcedOffline } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyFrontendRepository, familyReaders } from './repository';
import { createFamilyAxiosAdapter, createFamilyFetch } from './transport';
import { familyCanDo } from './uiPermissions';
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = id(4),
  originalAdapter = api.defaults.adapter;
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => ({ error: () => {}, success: () => {} }) }));
async function fixture() {
  const session = {
    userId: id(1),
    personId: id(2),
    familyId: id(3),
    user: { username: 'Synthetic', email: 'local@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  const readers = {
    ...familyReaders,
    trips: {
      ...familyReaders.trips,
      fetchTripById: vi.fn<typeof familyReaders.trips.fetchTripById>(async () => ({
        id: trip,
        family_id: session.familyId,
        title: 'Original Trip',
        description: null,
        start_date: '2027-04-01',
        end_date: '2027-04-02',
        cover_image: null,
        currency: 'EUR',
        status: 'planned',
        is_archived: 0,
        reminder_days: 7,
      })),
    },
    days: { ...familyReaders.days, listTripDays: vi.fn(async () => []) },
    places: { ...familyReaders.places, listTripPlaces: vi.fn(async () => []) },
    schedule: { ...familyReaders.schedule, listScheduleItems: vi.fn(async () => []) },
    notes: { ...familyReaders.notes, listDayNotes: vi.fn(async () => []) },
    listTripTravelers: vi.fn(async () => [{ personId: id(2), displayName: 'Family traveler', color: '#abcdef' }]),
  };
  const repo = new FamilyFrontendRepository(async () => session, readers);
  const handler = createFamilyApplicationHandler(repo);
  api.defaults.adapter = createFamilyAxiosAdapter(handler);
  vi.stubGlobal('fetch', createFamilyFetch(handler, fetch, window.location.origin));
  const key = (await repo.views()).ids.register('trip', trip);
  return { repo, key, readers };
}
beforeEach(async () => {
  localStorage.clear();
  invalidateOfflineSession();
  setAuthed(true);
  setForcedOffline(false);
  await resetOfflineTestDatabase();
});
afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  setAuthed(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('native Trip repositories through the actual Family handler', () => {
  it('loads real handler traveler DTOs without inventing a native owner or losing Family color', async () => {
    const f = await fixture();
    const result = await tripMembersRepo.list(f.key);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ username: 'Family traveler', color: '#abcdef' });
    const roster = await tripMembersRepo.roster(f.key);
    expect(roster.owner).toBeUndefined();
    expect(f.readers.listTripTravelers).toHaveBeenCalledWith(trip);
  });
  it('the actual native member hook does not display a phantom owner for Family travelers', async () => {
    const f = await fixture();
    const view = renderHook(() => useTripMembers({ isOpen: true, tripId: f.key, onClose: () => {} }));
    await waitFor(() => expect(view.result.current.realMembers).toHaveLength(1));
    expect(view.result.current.realMembers[0].username).toBe('Family traveler');
    expect(view.result.current.isCurrentOwner).toBe(false);
  });
  it.each([
    'public read',
    'public create',
    'public remove',
    'invite read',
    'invite create',
    'invite remove',
    'cover',
    'cover upload',
    'member',
    'directory',
  ])('%s remains truthfully unavailable in Family and never creates a queued command', async (kind) => {
    const f = await fixture();
    const run = () =>
      kind === 'public read'
        ? tripLinksRepo.share.get(f.key)
        : kind === 'public create'
          ? tripLinksRepo.share.create(f.key, { share_map: true })
          : kind === 'public remove'
            ? tripLinksRepo.share.remove(f.key)
            : kind === 'invite read'
              ? tripLinksRepo.invite.get(f.key)
              : kind === 'invite create'
                ? tripLinksRepo.invite.create(f.key)
                : kind === 'invite remove'
                  ? tripLinksRepo.invite.remove(f.key)
                  : kind === 'cover'
                    ? tripCoverRepo.update(f.key, 'https://fixture.invalid/cover')
                    : kind === 'cover upload'
                      ? tripCoverRepo.upload(f.key, new File(['synthetic'], 'cover.png', { type: 'image/png' }))
                      : kind === 'member'
                        ? tripMembersRepo.add(f.key, 'Other')
                        : tripMembersRepo.directory();
    await expect(run()).rejects.toMatchObject({ response: { status: 501 } });
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(f.readers.days.listTripDays).not.toHaveBeenCalled();
    expect(familyCanDo('share_manage', null)).toBe(false);
    expect(familyCanDo('member_manage', null)).toBe(false);
  });
  it('globally disabled sharing refuses before private Trip lookup and grants no permission', async () => {
    const f = await fixture();
    f.readers.trips.fetchTripById.mockResolvedValueOnce(null);
    await expect(tripLinksRepo.share.get(f.key)).rejects.toMatchObject({
      response: { status: 501, data: { code: 'family_sharing_unavailable' } },
    });
    expect(f.readers.trips.fetchTripById).not.toHaveBeenCalled();
    expect(f.readers.listTripTravelers).not.toHaveBeenCalled();
    expect(familyCanDo('share_manage', null)).toBe(false);
    expect(await offlineDb.trips.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('trip-scoped invite access still denies an inaccessible Trip before travelers or cache changes', async () => {
    const f = await fixture();
    f.readers.trips.fetchTripById.mockResolvedValueOnce(null);
    await expect(tripLinksRepo.invite.get(f.key)).rejects.toMatchObject({
      response: { status: 403, data: { code: 'trip_scope_unavailable' } },
    });
    expect(f.readers.trips.fetchTripById).toHaveBeenCalledExactlyOnceWith(trip);
    expect(f.readers.listTripTravelers).not.toHaveBeenCalled();
    expect(await offlineDb.tripMembers.count()).toBe(0);
    expect(await offlineDb.trips.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../tests/helpers/offlineDb';
import api, { authApi, shareApi, tripInviteApi, tripsApi } from '../api/client';
import { invalidateOfflineSession, offlineDb, type QueuedMutation } from '../db/offlineDb';
import { setAuthed } from '../sync/authGate';
import { mutationQueue } from '../sync/mutationQueue';
import { setForcedOffline } from '../sync/networkMode';
import { OnlineOnlyError } from './onlineOnly';
import { TripCoverPendingError, tripCoverRepo } from './tripCoverRepo';
import { tripLinksRepo } from './tripLinksRepo';
import { tripMembersRepo } from './tripMembersRepo';
const adapter = api.defaults.adapter;
const file = () => new File(['cover'], 'cover.png', { type: 'image/png' });
const cached = { tripId: 9, id: 7, username: 'Cached traveler' };
function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  setAuthed(true);
  setForcedOffline(false);
  invalidateOfflineSession();
  await resetOfflineTestDatabase();
});
afterEach(() => {
  api.defaults.adapter = adapter;
  setForcedOffline(false);
  setAuthed(false);
  vi.restoreAllMocks();
});
const connected = [
  ['roster', () => tripMembersRepo.roster(9)],
  ['directory', () => tripMembersRepo.directory()],
  ['add member', () => tripMembersRepo.add(9, 'Original')],
  ['remove member', () => tripMembersRepo.remove(9, 7)],
  ['transfer', () => tripMembersRepo.transfer(9, 7)],
  ['create guest', () => tripMembersRepo.createGuest(9, 'Guest')],
  ['rename guest', () => tripMembersRepo.renameGuest(9, 7, 'Guest')],
  ['delete guest', () => tripMembersRepo.deleteGuest(9, 7)],
  ['read share', () => tripLinksRepo.share.get(9)],
  ['create share', () => tripLinksRepo.share.create(9, { share_map: true })],
  ['remove share', () => tripLinksRepo.share.remove(9)],
  ['read invite', () => tripLinksRepo.invite.get(9)],
  ['create invite', () => tripLinksRepo.invite.create(9)],
  ['remove invite', () => tripLinksRepo.invite.remove(9)],
  ['upload cover', () => tripCoverRepo.upload(9, file())],
  ['cover URL', () => tripCoverRepo.update(9, null)],
  ['search covers', () => tripCoverRepo.search('Original')],
] as const;
describe('Trip access repositories', () => {
  it.each(connected)('%s is explicitly online-only and does not create a queued command', async (_name, run) => {
    const network = vi.fn(async () => {
      throw new Error('Must not dispatch');
    });
    api.defaults.adapter = network;
    setForcedOffline(true);
    await expect(run()).rejects.toBeInstanceOf(OnlineOnlyError);
    expect(network).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('the planner uses only its requested Trip and original-account roster cache offline', async () => {
    await offlineDb.tripMembers.bulkPut([cached, { ...cached, tripId: 10, username: 'Other Trip' }]);
    const request = vi.spyOn(tripsApi, 'getMembers');
    setForcedOffline(true);
    expect((await tripMembersRepo.list(9)).map((row) => row.username)).toEqual(['Cached traveler']);
    expect(request).not.toHaveBeenCalled();
  });
  it('preserves an ownerless Family roster and its color without inventing a Trip owner', async () => {
    vi.spyOn(tripsApi, 'getMembers').mockResolvedValue({
      members: [{ id: 7, username: 'Original', color: '#abcdef' }],
    });
    expect(await tripMembersRepo.roster(9)).toEqual({
      owner: undefined,
      members: [{ id: 7, username: 'Original', color: '#abcdef' }],
    });
    expect(await tripMembersRepo.list(9)).toEqual([{ id: 7, username: 'Original', color: '#abcdef' }]);
    expect(await offlineDb.tripMembers.count()).toBe(0);
  });
  it('flattens the native owner and travelers without duplicating that owner', async () => {
    vi.spyOn(tripsApi, 'getMembers').mockResolvedValue({
      owner: { id: 7, username: 'Owner' },
      members: [
        { id: 7, username: 'Owner' },
        { id: 8, username: 'Guest', is_guest: true },
      ],
    });
    expect((await tripMembersRepo.list(9)).map((row) => row.id)).toEqual([7, 8]);
  });
  it.each([401, 403, 404, 500])('never masks an actual HTTP %i with a cached roster', async (status) => {
    await offlineDb.tripMembers.put(cached);
    vi.spyOn(tripsApi, 'getMembers').mockRejectedValue({ isAxiosError: true, response: { status } });
    await expect(tripMembersRepo.list(9)).rejects.toMatchObject({ response: { status } });
    expect(await offlineDb.tripMembers.get([9, 7])).toEqual(cached);
  });
  it('falls back for a genuine network error without altering the canonical cache', async () => {
    await offlineDb.tripMembers.put(cached);
    vi.spyOn(tripsApi, 'getMembers').mockRejectedValue({ isAxiosError: true });
    expect((await tripMembersRepo.list(9)).map((row) => row.username)).toEqual(['Cached traveler']);
  });
  it('rejects a malformed roster instead of showing cached permissions or creating an owner', async () => {
    await offlineDb.tripMembers.put(cached);
    vi.spyOn(tripsApi, 'getMembers').mockResolvedValue({ members: [{ id: 'foreign', username: 'No' }] });
    await expect(tripMembersRepo.list(9)).rejects.toBeDefined();
    expect(await offlineDb.tripMembers.get([9, 7])).toEqual(cached);
  });
  it('a late network failure cannot fall back to a replacement session cache', async () => {
    const wait = held<void>();
    vi.spyOn(tripsApi, 'getMembers').mockImplementationOnce(async () => {
      await wait.promise;
      throw { isAxiosError: true };
    });
    const read = tripMembersRepo.list(9),
      rejected = expect(read).rejects.toBeDefined();
    invalidateOfflineSession();
    await offlineDb.tripMembers.put({ ...cached, username: 'Replacement' });
    wait.resolve();
    await rejected;
  });
  it('cover replacement cannot overtake an older retained Trip write', async () => {
    const row: QueuedMutation = {
      id: 'retained-trip-command',
      tripId: 9,
      method: 'PUT',
      url: '/trips/9',
      body: { title: 'Original' },
      createdAt: 1,
      status: 'conflict',
      attempts: 2,
      lastError: 'Original conflict',
      resource: 'trips',
      entityId: 9,
    };
    await offlineDb.mutationQueue.put(row);
    const upload = vi.spyOn(tripsApi, 'uploadCover'),
      update = vi.spyOn(tripsApi, 'update');
    await expect(tripCoverRepo.upload(9, file())).rejects.toBeInstanceOf(TripCoverPendingError);
    await expect(tripCoverRepo.update(9, 'https://images.invalid/cover')).rejects.toBeInstanceOf(TripCoverPendingError);
    expect(upload).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.toArray()).toEqual([row]);
  });
  it('a cover queue check cannot continue into a new session', async () => {
    const wait = held<boolean>();
    vi.spyOn(mutationQueue, 'mustQueue').mockReturnValueOnce(wait.promise);
    const upload = vi.spyOn(tripsApi, 'uploadCover');
    const run = tripCoverRepo.upload(9, file()),
      rejected = expect(run).rejects.toBeDefined();
    invalidateOfflineSession();
    wait.resolve(false);
    await rejected;
    expect(upload).not.toHaveBeenCalled();
  });
  it('a malformed upload acknowledgement never becomes a saved preview URL', async () => {
    vi.spyOn(tripsApi, 'uploadCover').mockResolvedValue({ success: true });
    await expect(tripCoverRepo.upload(9, file())).rejects.toBeDefined();
  });
  it.each(['share', 'invite'] as const)('a %s creation cannot report success without a token', async (kind) => {
    vi.spyOn(kind === 'share' ? shareApi : tripInviteApi, 'createLink').mockResolvedValue({ token: null });
    await expect(
      kind === 'share' ? tripLinksRepo.share.create(9, {}) : tripLinksRepo.invite.create(9)
    ).rejects.toBeDefined();
  });
  it('the directory request is account-owned and never persisted as cached permissions', async () => {
    const wait = held<{ users: { id: number; username: string }[] }>();
    vi.spyOn(authApi, 'listUsers').mockReturnValueOnce(wait.promise);
    const run = tripMembersRepo.directory(),
      rejected = expect(run).rejects.toBeDefined();
    invalidateOfflineSession();
    wait.resolve({ users: [{ id: 7, username: 'Old owner' }] });
    await rejected;
  });
  it('keeps the native empty-search result when the optional photo list is absent', async () => {
    vi.spyOn(tripsApi, 'searchCoverImages').mockResolvedValue({});
    expect(await tripCoverRepo.search('nowhere')).toEqual({ photos: [] });
  });
  it('does not normalize a malformed photo list into a successful empty result', async () => {
    vi.spyOn(tripsApi, 'searchCoverImages').mockResolvedValue({ photos: 'bad reply' });
    await expect(tripCoverRepo.search('nowhere')).rejects.toBeDefined();
  });
});

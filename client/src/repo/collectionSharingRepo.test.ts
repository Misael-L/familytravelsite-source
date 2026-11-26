import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../tests/helpers/msw/server';
import { collectionsApi } from '../api/collections';
import { invalidateOfflineSession } from '../db/offlineDb';
import { _resetNetworkMode, setForcedOffline } from '../sync/networkMode';
import { ReadSessionChanged } from '../sync/readSession';
import { collectionSharingRepo } from './collectionSharingRepo';
import { OnlineOnlyError } from './onlineOnly';

type Roster = Awaited<ReturnType<typeof collectionsApi.availableUsers>>;
const first = { users: [{ id: 9, username: 'first invitee' }] };
const second = { users: [{ id: 10, username: 'current invitee' }] };
beforeEach(() => _resetNetworkMode());
afterEach(() => {
  vi.restoreAllMocks();
  _resetNetworkMode();
});

describe('online Collection sharing repository', () => {
  it('uses the existing GET endpoint and returns its roster without changing the collection identity', async () => {
    let requests = 0;
    server.use(
      http.get('/api/addons/collections/7/available-users', () => {
        requests++;
        return HttpResponse.json(first);
      })
    );
    await expect(collectionSharingRepo.availableUsers(7)).resolves.toEqual(first);
    expect(requests).toBe(1);
  });

  it('does not reuse a previously returned roster even for the same collection', async () => {
    const api = vi.spyOn(collectionsApi, 'availableUsers').mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await expect(collectionSharingRepo.availableUsers(7)).resolves.toEqual(first);
    await expect(collectionSharingRepo.availableUsers(7)).resolves.toEqual(second);
    expect(api.mock.calls).toEqual([[7], [7]]);
  });

  it('refuses a forced-offline lookup before reaching the API', async () => {
    const api = vi.spyOn(collectionsApi, 'availableUsers').mockResolvedValue(first);
    setForcedOffline(true);
    await expect(collectionSharingRepo.availableUsers(7)).rejects.toBeInstanceOf(OnlineOnlyError);
    expect(api).not.toHaveBeenCalled();
  });

  it('never replaces a current permission refusal with an earlier successful roster', async () => {
    const denied = { response: { status: 403, data: { error: 'Sharing permission removed' } } };
    const api = vi.spyOn(collectionsApi, 'availableUsers').mockResolvedValueOnce(first).mockRejectedValueOnce(denied);
    await expect(collectionSharingRepo.availableUsers(7)).resolves.toEqual(first);
    await expect(collectionSharingRepo.availableUsers(7)).rejects.toBe(denied);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('does not return a delayed roster after the original read session ends', async () => {
    let finish!: (value: Roster) => void;
    const pending = new Promise<Roster>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(collectionsApi, 'availableUsers').mockReturnValueOnce(pending);
    const result = collectionSharingRepo.availableUsers(7);
    invalidateOfflineSession();
    finish(first);
    await expect(result).rejects.toBeInstanceOf(ReadSessionChanged);
  });

  it('propagates a network failure without caching a roster or retrying the read', async () => {
    const failure = Object.assign(new Error('connection lost'), { code: 'ERR_NETWORK' });
    const api = vi.spyOn(collectionsApi, 'availableUsers').mockRejectedValue(failure);
    await expect(collectionSharingRepo.availableUsers(7)).rejects.toBe(failure);
    expect(api).toHaveBeenCalledOnce();
  });
});

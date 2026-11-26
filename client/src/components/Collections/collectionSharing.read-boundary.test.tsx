import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { resetAllStores } from '../../../tests/helpers/store';
import { collectionsApi } from '../../api/collections';
import { invalidateOfflineSession } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { useCollectionSharing, type CollectionSharingOptions } from './useCollectionSharing';

type Roster = Awaited<ReturnType<typeof collectionsApi.availableUsers>>;
function pending() {
  let resolve!: (value: Roster) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Roster>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const props: CollectionSharingOptions = {
  open: true,
  collectionId: 7,
  isOwner: true,
  members: [],
  onAfterLeave: () => {},
  t: (key) => key,
};
const fresh = { users: [{ id: 10, username: 'current invitee' }] };
function setup() {
  return renderHook((options: CollectionSharingOptions) => useCollectionSharing(options), { initialProps: props });
}
beforeEach(() => {
  resetAllStores();
  _resetNetworkMode();
  useAuthStore.setState({ user: buildUser({ id: 1 }) });
  vi.spyOn(collectionsApi, 'availableUsers').mockResolvedValue(fresh);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  _resetNetworkMode();
});

describe('collection sharing reads through the online data boundary', () => {
  it('does not send the invitee lookup while forced offline', async () => {
    setForcedOffline(true);
    const h = setup();
    await act(async () => {});
    expect(collectionsApi.availableUsers).not.toHaveBeenCalled();
    expect(h.result.current.availableUsers).toEqual([]);
  });

  it.each(['close-reopen', 'collection-roundtrip', 'account-roundtrip', 'session'] as const)(
    'a late roster cannot repopulate a retired %s view',
    async (boundary) => {
      const old = pending();
      vi.mocked(collectionsApi.availableUsers).mockReturnValueOnce(old.promise);
      const h = setup();
      await waitFor(() => expect(collectionsApi.availableUsers).toHaveBeenCalledOnce());
      if (boundary === 'close-reopen') {
        h.rerender({ ...props, open: false });
        h.rerender(props);
      } else if (boundary === 'collection-roundtrip') {
        h.rerender({ ...props, collectionId: 8 });
        h.rerender(props);
      } else if (boundary === 'account-roundtrip') {
        act(() => {
          useAuthStore.setState({ user: buildUser({ id: 2 }) });
          useAuthStore.setState({ user: buildUser({ id: 1 }) });
        });
      } else act(() => invalidateOfflineSession());
      await waitFor(() => expect(h.result.current.availableUsers).toEqual(fresh.users));
      await act(async () => old.resolve({ users: [{ id: 99, username: 'retired invitee' }] }));
      expect(h.result.current.availableUsers).toEqual(fresh.users);
    }
  );

  it('a rejected old lookup cannot clear a newer roster refresh', async () => {
    const old = pending();
    vi.mocked(collectionsApi.availableUsers).mockReturnValueOnce(old.promise);
    const h = setup();
    h.rerender({ ...props, members: [{ user_id: 1, username: 'owner', status: 'accepted', is_owner: true }] });
    await waitFor(() => expect(h.result.current.availableUsers).toEqual(fresh.users));
    await act(async () => old.reject(new Error('old lookup failed')));
    expect(h.result.current.availableUsers).toEqual(fresh.users);
  });

  it('losing ownership clears private invitees and does not issue a replacement lookup', async () => {
    const h = setup();
    await waitFor(() => expect(h.result.current.availableUsers).toEqual(fresh.users));
    vi.mocked(collectionsApi.availableUsers).mockClear();
    h.rerender({ ...props, isOwner: false });
    await act(async () => {});
    expect(h.result.current.availableUsers).toEqual([]);
    expect(collectionsApi.availableUsers).not.toHaveBeenCalled();
  });
});

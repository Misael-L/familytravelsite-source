import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { CollectionMember } from '@trek/shared';
import { StrictMode, useLayoutEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { resetAllStores } from '../../../tests/helpers/store';
import { collectionsApi } from '../../api/collections';
import { invalidateOfflineSession } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { useCollectionStore } from '../../store/collectionStore';
import { useCollectionSharing, type CollectionSharingOptions } from './useCollectionSharing';

const initial = useCollectionStore.getState();
const owner: CollectionMember = { user_id: 1, username: 'owner', status: 'accepted', is_owner: true };
const t = (key: string) => key;
let actions: ReturnType<typeof mocks>;
let toast = vi.fn();
function mocks() {
  return {
    invite: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    setMemberRole: vi.fn().mockResolvedValue(undefined),
    cancelInvite: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
  };
}
function pending<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(changes: Partial<CollectionSharingOptions> = {}) {
  const props: CollectionSharingOptions = {
    open: true,
    collectionId: 7,
    isOwner: true,
    members: [owner],
    onAfterLeave: vi.fn(),
    t,
    ...changes,
  };
  return { ...renderHook((p: CollectionSharingOptions) => useCollectionSharing(p), { initialProps: props }), props };
}
beforeEach(() => {
  resetAllStores();
  useCollectionStore.setState(initial, true);
  actions = mocks();
  useCollectionStore.setState(actions);
  useAuthStore.setState({ user: buildUser({ id: 1 }) });
  toast = vi.fn();
  vi.stubGlobal('__addToast', toast);
  vi.spyOn(collectionsApi, 'availableUsers').mockResolvedValue({ users: [{ id: 9, username: 'invitee' }] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('collection sharing view and operation ownership', () => {
  it('a late invite cannot clear the new collection selection or publish its toast', async () => {
    const save = pending();
    actions.invite.mockReturnValueOnce(save.promise);
    const h = setup();
    act(() => h.result.current.setSelectedUserId(9));
    let write!: Promise<void>;
    act(() => {
      write = h.result.current.handleInvite();
    });
    h.rerender({ ...h.props, collectionId: 8 });
    act(() => h.result.current.setSelectedUserId(10));
    await act(async () => {
      save.resolve();
      await write;
    });
    expect(h.result.current.selectedUserId).toBe(10);
    expect(toast).not.toHaveBeenCalled();
    expect(h.result.current.inviting).toBe(false);
  });
  it.each(['switch', 'close', 'unmount', 'session', 'account-roundtrip'] as const)(
    'a leave completion cannot publish after %s',
    async (boundary) => {
      const save = pending();
      actions.leave.mockReturnValueOnce(save.promise);
      const h = setup({ isOwner: false });
      let write!: Promise<void>;
      act(() => {
        write = h.result.current.handleLeave();
      });
      if (boundary === 'switch') h.rerender({ ...h.props, collectionId: 8 });
      if (boundary === 'close') h.rerender({ ...h.props, open: false });
      if (boundary === 'unmount') h.unmount();
      if (boundary === 'session') act(() => invalidateOfflineSession());
      if (boundary === 'account-roundtrip')
        act(() => {
          useAuthStore.setState({ user: buildUser({ id: 2 }) });
          useAuthStore.setState({ user: buildUser({ id: 1 }) });
        });
      await act(async () => {
        save.resolve();
        await write;
      });
      expect(h.props.onAfterLeave).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    }
  );
  it.each(['invite', 'row', 'leave'] as const)('suppresses a late %s error after close/reopen', async (kind) => {
    const save = pending();
    const h = setup({ isOwner: kind !== 'leave' });
    let write!: Promise<void>;
    if (kind === 'invite') {
      actions.invite.mockReturnValueOnce(save.promise);
      act(() => h.result.current.setSelectedUserId(9));
      act(() => {
        write = h.result.current.handleInvite();
      });
    } else if (kind === 'row') {
      actions.removeMember.mockReturnValueOnce(save.promise);
      act(() => {
        write = h.result.current.remove(2);
      });
    } else {
      actions.leave.mockReturnValueOnce(save.promise);
      act(() => {
        write = h.result.current.handleLeave();
      });
    }
    h.rerender({ ...h.props, open: false });
    h.rerender(h.props);
    await act(async () => {
      save.reject(new Error('old failure'));
      await write;
    });
    expect(toast).not.toHaveBeenCalled();
    expect(h.result.current.leaving).toBe(false);
    expect(h.result.current.inviting).toBe(false);
    expect(h.result.current.busyUserId('remove')).toBeNull();
  });
  it('an old row reply cannot free a new collection busy slot', async () => {
    const old = pending(),
      fresh = pending();
    actions.removeMember.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const h = setup();
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = h.result.current.remove(2);
    });
    h.rerender({ ...h.props, collectionId: 8 });
    expect(h.result.current.busyUserId('remove')).toBeNull();
    act(() => {
      second = h.result.current.remove(3);
    });
    expect(actions.removeMember).toHaveBeenLastCalledWith(8, 3);
    await act(async () => {
      old.resolve();
      await first;
    });
    expect(h.result.current.busyUserId('remove')).toBe(3);
    await act(async () => {
      fresh.resolve();
      await second;
    });
    expect(h.result.current.busyUserId('remove')).toBeNull();
  });
  it('does not display the previous collection invitees while the replacement lookup is pending', async () => {
    const h = setup();
    await waitFor(() => expect(h.result.current.availableUsers).toHaveLength(1));
    const read = pending<{ users: { id: number; username: string }[] }>();
    vi.mocked(collectionsApi.availableUsers).mockReturnValueOnce(read.promise);
    act(() => {
      h.result.current.setSelectedUserId(9);
      h.result.current.setConfirmLeave(true);
    });
    h.rerender({ ...h.props, collectionId: 8 });
    expect(h.result.current.availableUsers).toEqual([]);
    expect(h.result.current.selectedUserId).toBeNull();
    expect(h.result.current.confirmLeave).toBe(false);
    await act(async () => read.resolve({ users: [{ id: 10, username: 'new' }] }));
    expect(h.result.current.availableUsers[0].id).toBe(10);
  });
  it('ignores an overtaken lookup without blocking the latest roster refresh', async () => {
    const old = pending<{ users: { id: number; username: string }[] }>();
    vi.mocked(collectionsApi.availableUsers).mockReturnValueOnce(old.promise);
    const h = setup();
    h.rerender({ ...h.props, members: [] });
    await waitFor(() => expect(h.result.current.availableUsers).toHaveLength(1));
    await act(async () => old.resolve({ users: [{ id: 99, username: 'stale' }] }));
    expect(h.result.current.availableUsers[0].id).toBe(9);
  });
  it('retains the chosen invitation role across close/reopen without retaining the invitee', () => {
    const h = setup();
    act(() => {
      h.result.current.setInviteRole('admin');
      h.result.current.setSelectedUserId(9);
    });
    h.rerender({ ...h.props, open: false });
    h.rerender(h.props);
    expect(h.result.current.inviteRole).toBe('admin');
    expect(h.result.current.selectedUserId).toBeNull();
  });
  it('refuses held callbacks after selection or permission changes', async () => {
    const h = setup();
    act(() => h.result.current.setSelectedUserId(9));
    const old = h.result.current;
    h.rerender({ ...h.props, collectionId: 8, isOwner: false });
    await act(async () => {
      await old.handleInvite();
      await old.setRole(2, 'viewer');
      await old.cancel(3);
      await old.remove(2);
    });
    expect(actions.invite).not.toHaveBeenCalled();
    expect(actions.setMemberRole).not.toHaveBeenCalled();
    expect(actions.cancelInvite).not.toHaveBeenCalled();
    expect(actions.removeMember).not.toHaveBeenCalled();
  });
  it.each([false, true])('refuses owner writes while closed or non-owner (closed=%s)', async (closed) => {
    const h = setup({ open: !closed, isOwner: closed });
    act(() => h.result.current.setSelectedUserId(9));
    await act(async () => {
      await h.result.current.handleInvite();
      await h.result.current.setRole(2, 'admin');
      await h.result.current.cancel(3);
      await h.result.current.remove(2);
    });
    for (const action of [actions.invite, actions.setMemberRole, actions.cancelInvite, actions.removeMember])
      expect(action).not.toHaveBeenCalled();
  });
  it('locks duplicate same-turn invites and allows an explicit retry after failure', async () => {
    const save = pending();
    actions.invite.mockReturnValueOnce(save.promise);
    const h = setup();
    act(() => h.result.current.setSelectedUserId(9));
    const send = h.result.current.handleInvite;
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = send();
      second = send();
    });
    expect(actions.invite).toHaveBeenCalledTimes(1);
    await act(async () => {
      save.reject(new Error('retryable'));
      await Promise.all([first, second]);
    });
    expect(h.result.current.selectedUserId).toBe(9);
    expect(h.result.current.inviting).toBe(false);
    await act(async () => h.result.current.handleInvite());
    expect(actions.invite).toHaveBeenCalledTimes(2);
    expect(h.result.current.selectedUserId).toBeNull();
  });
  it.each([false, true])('keeps desktop per-kind and phone shared synchronous busy slots (phone=%s)', async (phone) => {
    const save = pending();
    actions.setMemberRole.mockReturnValueOnce(save.promise);
    const h = setup({ singleBusySlot: phone });
    const old = h.result.current;
    let role!: Promise<void>, another!: Promise<void>, cancel!: Promise<void>;
    act(() => {
      role = old.setRole(2, 'viewer');
      another = old.setRole(3, 'admin');
      cancel = old.cancel(4);
    });
    expect(actions.setMemberRole).toHaveBeenCalledTimes(1);
    expect(actions.cancelInvite).toHaveBeenCalledTimes(phone ? 0 : 1);
    await act(async () => {
      save.resolve();
      await Promise.all([role, another, cancel]);
    });
    expect(h.result.current.busyUserId('role')).toBeNull();
  });
  it('locks same-turn phone leaves while preserving desktop leave behavior', async () => {
    const save = pending();
    actions.leave.mockReturnValueOnce(save.promise);
    const h = setup({ isOwner: false, singleBusySlot: true });
    const leave = h.result.current.handleLeave;
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = leave();
      second = leave();
    });
    expect(actions.leave).toHaveBeenCalledTimes(1);
    await act(async () => {
      save.resolve();
      await Promise.all([first, second]);
    });
    h.unmount();
    const desktop = setup({ isOwner: false });
    await act(async () => {
      await Promise.all([desktop.result.current.handleLeave(), desktop.result.current.handleLeave()]);
    });
    expect(actions.leave).toHaveBeenCalledTimes(3);
  });
  it('StrictMode effect retirement cannot release the replacement operation lock', async () => {
    const old = pending(),
      fresh = pending();
    actions.setMemberRole.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const props: CollectionSharingOptions = {
      open: true,
      collectionId: 7,
      isOwner: true,
      members: [owner],
      onAfterLeave: vi.fn(),
      t,
    };
    let mounts = 0;
    const writes: Promise<void>[] = [];
    const h = renderHook(
      () => {
        const sharing = useCollectionSharing(props);
        const start = useRef(sharing.setRole);
        useLayoutEffect(() => {
          writes.push(start.current(++mounts + 1, 'viewer'));
        }, []);
        return sharing;
      },
      { wrapper: StrictMode }
    );
    expect(actions.setMemberRole).toHaveBeenCalledTimes(2);
    expect(h.result.current.busyUserId('role')).toBe(3);
    await act(async () => {
      old.resolve();
      await writes[0];
    });
    expect(h.result.current.busyUserId('role')).toBe(3);
    await act(async () => {
      fresh.resolve();
      await writes[1];
    });
    expect(h.result.current.busyUserId('role')).toBeNull();
  });
  it('does not dispatch writes without a collection', async () => {
    const h = setup({ collectionId: null });
    act(() => h.result.current.setSelectedUserId(9));
    await act(async () => {
      await h.result.current.handleInvite();
      await h.result.current.handleLeave();
      await h.result.current.setRole(2, 'viewer');
      await h.result.current.cancel(3);
      await h.result.current.remove(2);
      h.result.current.cycleRole({ ...owner, is_owner: false, role: undefined });
    });
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });
});

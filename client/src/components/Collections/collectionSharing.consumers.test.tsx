import type { CollectionMember } from '@trek/shared';
import { createElement, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { act, cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { collectionsApi } from '../../api/collections';
import MCollShareSheet from '../../mobile/screens/collections/MCollShareSheet';
import { useAuthStore } from '../../store/authStore';
import { useCollectionStore } from '../../store/collectionStore';
import ShareCollectionModal from './ShareCollectionModal';

const initial = useCollectionStore.getState();
const owner: CollectionMember = { user_id: 1, username: 'owner', status: 'accepted', is_owner: true };
const member: CollectionMember = { user_id: 2, username: 'member', status: 'accepted', role: 'editor' };
const t = (key: string) => key;
beforeEach(() => {
  resetAllStores();
  useCollectionStore.setState(initial, true);
  useAuthStore.setState({ user: buildUser({ id: 2 }) });
  vi.spyOn(collectionsApi, 'availableUsers').mockResolvedValue({ users: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function desktop(props: ComponentProps<typeof MCollShareSheet>) {
  const { open, ...rest } = props;
  return createElement(ShareCollectionModal, { ...rest, collectionId: props.collectionId ?? 7, isOpen: open });
}

describe('unchanged native collection-sharing surfaces', () => {
  it.each(['desktop', 'phone'] as const)(
    '%s cannot close the replacement collection after an old leave finishes',
    async (surface) => {
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const leave = vi.fn().mockReturnValue(pending);
      useCollectionStore.setState({ leave });
      const props: ComponentProps<typeof MCollShareSheet> = {
        open: true,
        collectionId: 7,
        collectionName: 'First',
        isOwner: false,
        members: [owner, member],
        onClose: vi.fn(),
        onAfterLeave: vi.fn(),
        t,
      };
      const element = (value: typeof props) =>
        surface === 'phone' ? createElement(MCollShareSheet, value) : desktop(value);
      const view = render(element(props));
      fireEvent.click(screen.getByRole('button', { name: 'collections.share.leave' }));
      const buttons = screen.getAllByRole('button', { name: 'collections.share.leave' });
      fireEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => expect(leave).toHaveBeenCalledWith(7));
      view.rerender(element({ ...props, collectionId: 8, collectionName: 'Second' }));
      await act(async () => {
        finish();
        await pending;
      });
      expect(props.onAfterLeave).not.toHaveBeenCalled();
      expect(props.onClose).not.toHaveBeenCalled();
    }
  );
  it('the phone still cycles an accepted member role through the real hook', async () => {
    useAuthStore.setState({ user: buildUser({ id: 1 }) });
    const setMemberRole = vi.fn().mockResolvedValue(undefined);
    useCollectionStore.setState({ setMemberRole });
    render(
      createElement(MCollShareSheet, {
        open: true,
        collectionId: 7,
        collectionName: 'Current',
        isOwner: true,
        members: [owner, member],
        onClose: vi.fn(),
        onAfterLeave: vi.fn(),
        t,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'collections.role.label' }));
    await waitFor(() => expect(setMemberRole).toHaveBeenCalledWith(7, 2, 'admin'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'collections.role.label' })).not.toBeDisabled());
  });
});

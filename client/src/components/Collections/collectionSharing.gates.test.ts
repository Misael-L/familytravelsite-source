import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleFamilyCollection } from '../../integrations/family/collectionHandler';
import { installFamilyCollectionStore } from '../../integrations/family/collectionRuntime';
import type { FamilyFrontendRepository } from '../../integrations/family/repository';
import { useCollectionStore } from '../../store/collectionStore';

const initial = useCollectionStore.getState();
afterEach(() => {
  useCollectionStore.setState(initial, true);
});
function repository() {
  const raw = {
    captureContext: vi.fn(() => ({ assertCurrent: vi.fn() })),
    session: vi.fn().mockResolvedValue({}),
    subscribeContext: vi.fn(() => () => {}),
    views: vi.fn(),
    client: vi.fn(),
  };
  return { raw, repo: raw as unknown as FamilyFrontendRepository };
}
describe('Family sharing remains refused at existing native-store and handler boundaries', () => {
  it.each([
    'invite',
    'setMemberRole',
    'cancelInvite',
    'removeMember',
    'acceptInvite',
    'declineInvite',
    'leave',
  ] as const)('the installed %s store action remains unavailable', async (name) => {
    const f = repository(),
      stop = installFamilyCollectionStore(f.repo);
    try {
      const action = useCollectionStore.getState()[name] as (...args: number[]) => Promise<unknown>;
      await expect(action(7, 2)).rejects.toMatchObject({ status: 422, code: 'collection_feature_unavailable' });
      expect(f.raw.session).not.toHaveBeenCalled();
      expect(f.raw.client).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
  it.each([
    'invite',
    'members/role',
    'invite/cancel',
    'members/remove',
    'invite/accept',
    'invite/decline',
    'leave',
    '7/available-users',
  ])('the actual %s handler remains unavailable without persistence', async (suffix) => {
    const f = repository();
    await expect(
      handleFamilyCollection(f.repo, {
        method: suffix.endsWith('available-users') ? 'GET' : 'POST',
        pathname: '/addons/collections/' + suffix,
        query: new URLSearchParams(),
        body: { collection_id: 7, user_id: 2 },
      })
    ).rejects.toMatchObject({ status: 422, code: 'collection_feature_unavailable' });
    expect(f.raw.session).toHaveBeenCalledOnce();
    expect(f.raw.views).not.toHaveBeenCalled();
    expect(f.raw.client).not.toHaveBeenCalled();
  });
});

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyPermissionPolicyList } from './legacy/data/supabase/familyPermissions';
import { useFamilyPermissions } from './legacy/pages/admin/useFamilyPermissions';
import { useAuthStore } from './legacy/store/authStore';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  reset: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  t: (key: string) => key,
}));
vi.mock('./legacy/data/supabase/familyPermissions', () => ({
  listFamilyPermissionPolicies: api.list,
  updateFamilyPermissionPolicies: api.save,
  resetFamilyPermissionPolicies: api.reset,
}));
vi.mock('./legacy/components/shared/Toast', () => ({ useToast: () => api.toast }));
vi.mock('./legacy/i18n', () => ({ useTranslation: () => ({ t: api.t }) }));

const initialAuth = useAuthStore.getState();
const familyId = 'fixture-family';

function actor(authUserId: string, membershipRole: 'patriarch' | 'parent', family = familyId) {
  useAuthStore.setState({
    familyId: family,
    authUserId,
    personId: authUserId,
    isAuthenticated: true,
    authGate: 'ok',
    authCheckFailed: false,
    membershipRole,
  });
}

function permissions(canManage: boolean, family = familyId): FamilyPermissionPolicyList {
  return {
    familyId: family,
    canManage,
    policies: [
      {
        key: 'trip.archive',
        group: 'lifecycle',
        context: 'trip',
        displayOrder: 1,
        configurable: true,
        defaultDirectScope: 'patriarch',
        defaultProposeScope: null,
        effectiveDirectScope: canManage ? 'patriarch' : 'reviewers',
        effectiveProposeScope: null,
        allowedDirectScopes: ['patriarch', 'reviewers'],
        allowedProposeScopes: [],
        isCustom: !canManage,
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  actor('manager', 'patriarch');
});
afterEach(() => {
  cleanup();
  useAuthStore.setState(initialAuth, true);
});

describe('Family Admin permission account scope', () => {
  it('keeps the reviewer read-only when a previous Family read completes later', async () => {
    const old = deferred<FamilyPermissionPolicyList>();
    api.list.mockReturnValueOnce(old.promise).mockResolvedValueOnce(permissions(false, 'other-family'));
    const { result } = renderHook(useFamilyPermissions);

    act(() => actor('reviewer', 'parent', 'other-family'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => old.resolve(permissions(true)));

    expect(api.list.mock.calls).toEqual([[familyId], ['other-family']]);
    expect(result.current.canManage).toBe(false);
    expect(result.current.groups[0].policies[0].effectiveDirectScope).toBe('reviewers');
    await act(() => result.current.resetAll());
    expect(api.reset).not.toHaveBeenCalled();
  });

  it.each(['save', 'reset'] as const)(
    'discards a late %s result when a reviewer takes over the same Family',
    async (kind) => {
      const old = deferred<FamilyPermissionPolicyList>();
      api.list.mockResolvedValueOnce(permissions(true)).mockResolvedValueOnce(permissions(false));
      api[kind].mockReturnValueOnce(old.promise);
      const { result } = renderHook(useFamilyPermissions);
      await waitFor(() => expect(result.current.canManage).toBe(true));
      const { saveRow, resetAll } = result.current;
      act(() => {
        result.current.setConfirmReset(true);
        void (kind === 'save' ? saveRow('trip.archive', 'patriarch', null) : resetAll());
      });
      expect(api[kind]).toHaveBeenCalledTimes(1);

      act(() => actor('reviewer', 'parent'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => old.resolve(permissions(true)));

      expect(api.list.mock.calls).toEqual([[familyId], [familyId]]);
      expect(result.current.canManage).toBe(false);
      expect(result.current.groups[0].policies[0].effectiveDirectScope).toBe('reviewers');
      expect(result.current.confirmReset).toBe(false);
      expect(api.toast.success).not.toHaveBeenCalled();
      await act(() => saveRow('trip.archive', null, null));
      expect(api.save).toHaveBeenCalledTimes(kind === 'save' ? 1 : 0);
    }
  );

  it('ignores an earlier load even if the original account returns before it settles', async () => {
    const old = deferred<FamilyPermissionPolicyList>();
    api.list.mockReturnValueOnce(old.promise).mockResolvedValueOnce(permissions(false));
    const { result } = renderHook(useFamilyPermissions);
    act(() => {
      useAuthStore.setState({ isAuthenticated: false, authGate: null });
      actor('manager', 'patriarch');
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => old.resolve(permissions(true)));

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(result.current.canManage).toBe(false);
  });

  it('rejects a snapshot with a different Family ID', async () => {
    api.list.mockResolvedValue(permissions(true, 'unexpected-family'));
    const { result } = renderHook(useFamilyPermissions);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('admin.permissions.loadError');
    expect(result.current.groups).toEqual([]);
    expect(result.current.canManage).toBe(false);
  });

  it('preserves a current manager save and reset with their exact Family arguments', async () => {
    api.list.mockResolvedValue(permissions(true));
    api.save.mockResolvedValue(permissions(true));
    api.reset.mockResolvedValue(permissions(true));
    const { result } = renderHook(useFamilyPermissions);
    await waitFor(() => expect(result.current.canManage).toBe(true));

    await act(() => result.current.saveRow('trip.archive', 'patriarch', null));
    await act(() => result.current.resetAll());

    expect(api.save).toHaveBeenCalledWith(familyId, [
      { key: 'trip.archive', directScope: 'patriarch', proposeScope: null },
    ]);
    expect(api.reset).toHaveBeenCalledWith(familyId);
    expect(api.toast.success).toHaveBeenCalledTimes(2);
  });
});

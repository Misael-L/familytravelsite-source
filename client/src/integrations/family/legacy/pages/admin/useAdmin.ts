import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { adminApi, authApi } from '../../api/client';
import { useToast } from '../../components/shared/Toast';
import { isSupabaseDataPlane } from '../../data/supabase/auth';
import { canReviewFamilyAdmin } from '../../data/supabase/capabilities';
import {
  approveAccessRequest,
  denyAccessRequest,
  FAMILY_ROLES,
  inviteFamilyMember,
  listFamilyAdminMembers,
  listPendingAccessRequests,
  loadFamilyAdminStats,
  suspendFamilyMembership,
  updateFamilyMemberDisplayName,
  updateFamilyMemberRole,
  type FamilyAccessRequest,
  type FamilyAdminMember,
  type FamilyRole,
} from '../../data/supabase/familyAdmin';
import { useTranslation } from '../../i18n';
import { useAddonStore } from '../../store/addonStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { getApiErrorMessage } from '../../types';
import type { AdminStats, AdminUser } from './adminModel';
import { useFamilySettingsScope } from './useFamilySettingsScope';

/**
 * Admin page logic — owns every admin data slice (users, stats, invites, auth
 * toggles and feature flags) plus the CRUD
 * and toggle handlers. AdminPage stays a wiring container that builds the
 * (t-dependent) tab list and renders the tab panels around this state.
 * Behaviour is identical to the previous in-component logic.
 */
export function useAdmin() {
  const { serverTimezone, authUserId } = useAuthStore();
  const { t } = useTranslation();
  const hour12 = useSettingsStore((s) => s.settings.time_format) === '12h';
  const mcpEnabled = useAddonStore((s) => s.isEnabled('mcp'));
  const devMode = useAuthStore((s) => s.devMode);

  const [activeTab, setActiveTab] = useState<string>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyAdminMember[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FamilyAccessRequest[]>([]);
  const [rosterScope, setRosterScope] = useState<number | null>(null);
  const rosterRead = useRef(0);
  const [requestRoles, setRequestRoles] = useState<Record<string, FamilyRole>>({});
  const supabasePlane = isSupabaseDataPlane();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editingMember, setEditingMember] = useState<FamilyAdminMember | null>(null);
  const [editForm, setEditForm] = useState<{ username: string; email: string; role: string; password: string }>({
    username: '',
    email: '',
    role: 'user',
    password: '',
  });
  const [showCreateUser, setShowCreateUser] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState<{ username: string; email: string; password: string; role: string }>({
    username: '',
    email: '',
    password: '',
    role: 'user',
  });

  // Places photos
  const [placesPhotosEnabled, setPlacesPhotosEnabledState] = useState<boolean>(true);
  useEffect(() => {
    if (isSupabaseDataPlane()) return;
    adminApi
      .getPlacesPhotos()
      .then((d) => setPlacesPhotosEnabledState(d.enabled))
      .catch(() => {});
  }, []);

  // Places autocomplete
  const [placesAutocompleteEnabled, setPlacesAutocompleteEnabledState] = useState<boolean>(true);
  useEffect(() => {
    if (isSupabaseDataPlane()) return;
    adminApi
      .getPlacesAutocomplete()
      .then((d) => setPlacesAutocompleteEnabledState(d.enabled))
      .catch(() => {});
  }, []);

  // Places details
  const [placesDetailsEnabled, setPlacesDetailsEnabledState] = useState<boolean>(true);
  useEffect(() => {
    if (isSupabaseDataPlane()) return;
    adminApi
      .getPlacesDetails()
      .then((d) => setPlacesDetailsEnabledState(d.enabled))
      .catch(() => {});
  }, []);

  // Auth toggles
  const [passwordLogin, setPasswordLogin] = useState<boolean>(true);
  const [passwordRegistration, setPasswordRegistration] = useState<boolean>(true);
  const [oidcLogin, setOidcLogin] = useState<boolean>(true);
  const [oidcRegistration, setOidcRegistration] = useState<boolean>(true);
  const [envOverrideOidcOnly, setEnvOverrideOidcOnly] = useState<boolean>(false);
  const [oidcConfigured, setOidcConfigured] = useState<boolean>(false);
  const [requireMfa, setRequireMfa] = useState<boolean>(false);

  // Invite links
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteTrips, setInviteTrips] = useState<{ id: number; title: string }[]>([]);
  const [showCreateInvite, setShowCreateInvite] = useState<boolean>(false);
  const [inviteForm, setInviteForm] = useState<{
    max_uses: number;
    expires_in_days: number | '';
    trip_id: number | '';
  }>({ max_uses: 1, expires_in_days: 7, trip_id: '' });

  // File types
  const [allowedFileTypes, setAllowedFileTypes] = useState<string>(
    'jpg,jpeg,png,gif,webp,heic,pdf,doc,docx,xls,xlsx,txt,csv'
  );
  const [savingFileTypes, setSavingFileTypes] = useState<boolean>(false);

  const {
    user: currentUser,
    setAppRequireMfa,
    setTripRemindersEnabled,
    setPlacesPhotosEnabled,
    setPlacesAutocompleteEnabled,
    setPlacesDetailsEnabled,
  } = useAuthStore();
  const toast = useToast();

  const resetFamilyData = useCallback(() => {
    if (!supabasePlane) return;
    setRosterScope(null);
    setFamilyMembers([]);
    setPendingRequests([]);
    setRequestRoles({});
    setStats(null);
    setIsLoading(true);
    setEditingMember(null);
    setEditForm({ username: '', email: '', role: 'guest', password: '' });
    setShowCreateUser(false);
    setCreateForm({ username: '', email: '', password: '', role: 'guest' });
  }, [supabasePlane]);
  const { scope, beginSession } = useFamilySettingsScope(resetFamilyData);

  const beginFamilyAdmin = useCallback(() => {
    const request = beginSession();
    if (!request) return null;
    const { isSuperAdmin, membershipRole, membershipStatus } = useAuthStore.getState();
    if (!canReviewFamilyAdmin({ isSuperAdmin, membershipRole })) return null;
    if (!isSuperAdmin && (!request.familyId || membershipStatus === 'suspended')) return null;
    return { ...request, isSuperAdmin };
  }, [beginSession]);

  function beginRosterAction() {
    const request = beginFamilyAdmin();
    return request?.scope === rosterScope ? request : null;
  }

  useEffect(() => {
    if (isSupabaseDataPlane()) return;
    loadData();
    loadAppConfig();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [usersData, statsData, invitesData, inviteTripsData] = await Promise.all([
        adminApi.users(),
        adminApi.stats(),
        adminApi.listInvites().catch(() => ({ invites: [] })),
        adminApi.listInviteTrips().catch(() => ({ trips: [] })),
      ]);
      setUsers(usersData.users);
      setStats(statsData);
      setInvites(invitesData.invites || []);
      setInviteTrips(inviteTripsData.trips || []);
    } catch (err: unknown) {
      toast.error(t('admin.toast.loadError'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadFamilyData = useCallback(async () => {
    const request = beginFamilyAdmin();
    if (!request) {
      setIsLoading(false);
      return;
    }
    const version = ++rosterRead.current;
    const current = () => request.current() && version === rosterRead.current;
    const { familyId, isSuperAdmin } = request;
    setIsLoading(true);
    try {
      const members = await listFamilyAdminMembers({ familyId, isSuperAdmin });
      if (!current()) return;
      const requests = await listPendingAccessRequests(isSuperAdmin ? null : familyId);
      if (!current()) return;
      setFamilyMembers(members);
      setPendingRequests(requests);
      setRosterScope(request.scope);
      setRequestRoles((prev) => Object.fromEntries(requests.map(({ id }) => [id, prev[id] ?? 'guest'])));
      try {
        const nextStats = await loadFamilyAdminStats({ familyId, isSuperAdmin, memberCount: members.length });
        if (current()) setStats(nextStats);
      } catch (statsErr: unknown) {
        if (!current()) return;
        setStats({ totalUsers: members.length, totalTrips: 0, totalPlaces: 0, totalFiles: 0 });
        toast.error(getApiErrorMessage(statsErr, t('admin.toast.loadError')));
      }
    } catch (err: unknown) {
      if (current()) toast.error(getApiErrorMessage(err, t('admin.toast.loadError')));
    } finally {
      if (current()) setIsLoading(false);
    }
  }, [beginFamilyAdmin, t, toast]);

  useLayoutEffect(() => {
    if (supabasePlane) void loadFamilyData();
  }, [loadFamilyData, scope, supabasePlane]);

  const loadAppConfig = async () => {
    try {
      const config = await authApi.getAppConfig();
      setPasswordLogin(config.password_login ?? true);
      setPasswordRegistration(config.password_registration ?? config.allow_registration ?? true);
      setOidcLogin(config.oidc_login ?? true);
      setOidcRegistration(config.oidc_registration ?? config.allow_registration ?? true);
      setEnvOverrideOidcOnly(config.env_override_oidc_only ?? false);
      setOidcConfigured(config.oidc_configured ?? false);
      if (config.require_mfa !== undefined) setRequireMfa(!!config.require_mfa);
      if (config.allowed_file_types) setAllowedFileTypes(config.allowed_file_types);
    } catch (err: unknown) {
      // ignore
    }
  };

  const handleToggleAuthSetting = async (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    try {
      await authApi.updateAppSettings({ [key]: value });
    } catch (err: unknown) {
      setter(!value);
      toast.error(getApiErrorMessage(err, t('common.error')));
    }
  };

  const handleToggleRequireMfa = async (value: boolean) => {
    setRequireMfa(value);
    try {
      await authApi.updateAppSettings({ require_mfa: value });
      setAppRequireMfa(value);
      toast.success(t('common.saved'));
    } catch (err: unknown) {
      setRequireMfa(!value);
      toast.error(getApiErrorMessage(err, t('common.error')));
    }
  };

  const handleCreateUser = async () => {
    if (supabasePlane) {
      const request = beginFamilyAdmin();
      if (!request) return;
      const { familyId } = request;
      if (!createForm.username.trim() || !createForm.email.trim()) {
        toast.error(t('admin.family.inviteFieldsRequired'));
        return;
      }
      if (!familyId) {
        toast.error(t('dashboard.propose.missingPerson'));
        return;
      }
      const role = (FAMILY_ROLES as readonly string[]).includes(createForm.role)
        ? (createForm.role as FamilyRole)
        : 'guest';
      try {
        await inviteFamilyMember({
          familyId,
          email: createForm.email,
          displayName: createForm.username,
          role,
          current: request.current,
        });
        if (!request.current()) return;
        setShowCreateUser(false);
        setCreateForm({ username: '', email: '', password: '', role: 'guest' });
        toast.success(t('admin.family.inviteSent'));
        await loadFamilyData();
      } catch (err: unknown) {
        if (request.current()) toast.error(getApiErrorMessage(err, t('admin.toast.createError')));
      }
      return;
    }
    if (!createForm.username.trim() || !createForm.email.trim() || !createForm.password.trim()) {
      toast.error(t('admin.toast.fieldsRequired'));
      return;
    }
    if (createForm.password.trim().length < 8) {
      toast.error(t('settings.passwordTooShort'));
      return;
    }
    try {
      const data = await adminApi.createUser(createForm);
      setUsers((prev) => [data.user, ...prev]);
      setShowCreateUser(false);
      setCreateForm({ username: '', email: '', password: '', role: 'user' });
      toast.success(t('admin.toast.userCreated'));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('admin.toast.createError')));
    }
  };

  const handleCreateInvite = async () => {
    try {
      const data = await adminApi.createInvite({
        max_uses: inviteForm.max_uses,
        expires_in_days: inviteForm.expires_in_days || undefined,
        trip_id: inviteForm.trip_id === '' ? null : inviteForm.trip_id,
      });
      setInvites((prev) => [data.invite, ...prev]);
      setShowCreateInvite(false);
      setInviteForm({ max_uses: 1, expires_in_days: 7, trip_id: '' });
      // Copy link to clipboard
      const link = `${window.location.origin}/register?invite=${data.invite.token}`;
      navigator.clipboard.writeText(link).then(() => toast.success(t('admin.invite.copied')));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('admin.invite.createError')));
    }
  };

  const handleDeleteInvite = async (id: number) => {
    try {
      await adminApi.deleteInvite(id);
      setInvites((prev) => prev.filter((i) => i.id !== id));
      toast.success(t('admin.invite.deleted'));
    } catch {
      toast.error(t('admin.invite.deleteError'));
    }
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/register?invite=${token}`;
    navigator.clipboard.writeText(link).then(() => toast.success(t('admin.invite.copied')));
  };

  const handleEditUser = (user: AdminUser) => {
    setEditingUser(user);
    setEditForm({ username: user.username, email: user.email, role: user.role, password: '' });
  };

  function hasMember(member: FamilyAdminMember) {
    return familyMembers.some((row) => row.id === member.id && row.familyId === member.familyId);
  }

  const handleEditMember = (member: FamilyAdminMember) => {
    if (!beginRosterAction() || !hasMember(member)) return;
    setEditingMember(member);
    setEditForm({ username: member.displayName, email: member.email, role: member.role, password: '' });
  };

  const handleSaveUser = async () => {
    if (supabasePlane) {
      const request = beginRosterAction();
      if (!request || !editingMember || !hasMember(editingMember)) return;
      try {
        const role = (FAMILY_ROLES as readonly string[]).includes(editForm.role)
          ? (editForm.role as FamilyRole)
          : editingMember.role;
        await updateFamilyMemberRole(editingMember.id, role);
        if (!request.current()) return;
        if (editForm.username.trim() && editForm.username.trim() !== editingMember.displayName) {
          await updateFamilyMemberDisplayName({
            personId: editingMember.personId,
            userId: editingMember.userId,
            displayName: editForm.username,
            current: request.current,
          });
        }
        if (!request.current()) return;
        setEditingMember((selected) => (selected === editingMember ? null : selected));
        toast.success(t('admin.toast.userUpdated'));
        await loadFamilyData();
      } catch (err: unknown) {
        if (request.current()) toast.error(getApiErrorMessage(err, t('admin.toast.updateError')));
      }
      return;
    }
    if (!editingUser) return;
    const userId = editingUser.id;
    try {
      const payload: { username?: string; email?: string; role: string; password?: string } = {
        username: editForm.username.trim() || undefined,
        email: editForm.email.trim() || undefined,
        role: editForm.role,
      };
      if (editForm.password.trim()) {
        if (editForm.password.trim().length < 8) {
          toast.error(t('settings.passwordTooShort'));
          return;
        }
        payload.password = editForm.password.trim();
      }
      const data = await adminApi.updateUser(userId, payload);
      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      setEditingUser(null);
      toast.success(t('admin.toast.userUpdated'));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('admin.toast.updateError')));
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (user.id === currentUser?.id) {
      toast.error(t('admin.toast.cannotDeleteSelf'));
      return;
    }
    if (!confirm(t('admin.deleteUser', { name: user.username }))) return;
    try {
      await adminApi.deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success(t('admin.toast.userDeleted'));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('admin.toast.deleteError')));
    }
  };

  const handleSuspendMember = async (member: FamilyAdminMember) => {
    const request = beginRosterAction();
    if (!request || !hasMember(member)) return;
    if (member.userId === authUserId) {
      toast.error(t('admin.toast.cannotDeleteSelf'));
      return;
    }
    if (!confirm(t('admin.family.suspendConfirm', { name: member.displayName })) || !request.current()) return;
    try {
      await suspendFamilyMembership(member.id);
      if (!request.current()) return;
      toast.success(t('admin.family.suspended'));
      await loadFamilyData();
    } catch (err: unknown) {
      if (request.current()) toast.error(getApiErrorMessage(err, t('admin.toast.deleteError')));
    }
  };

  const reviewAccessRequest = async (selected: FamilyAccessRequest, approve: boolean) => {
    const request = beginRosterAction();
    if (!request || !pendingRequests.some((row) => row.id === selected.id && row.familyId === selected.familyId))
      return;
    const role = requestRoles[selected.id] ?? 'guest';
    try {
      if (approve) {
        await approveAccessRequest(selected.id, role);
      } else {
        await denyAccessRequest(selected.id);
      }
      if (!request.current()) return;
      const name = selected.displayName;
      toast.success(approve ? t('admin.family.approved', { name }) : t('admin.family.denied', { name }));
      await loadFamilyData();
    } catch (err: unknown) {
      if (request.current()) toast.error(getApiErrorMessage(err, t('admin.toast.updateError')));
    }
  };

  const handleApproveRequest = (request: FamilyAccessRequest) => reviewAccessRequest(request, true);
  const handleDenyRequest = (request: FamilyAccessRequest) => reviewAccessRequest(request, false);

  return {
    // store-derived
    serverTimezone,
    hour12,
    mcpEnabled,
    devMode,
    currentUser,
    setAppRequireMfa,
    setTripRemindersEnabled,
    setPlacesPhotosEnabled,
    setPlacesAutocompleteEnabled,
    setPlacesDetailsEnabled,
    toast,
    supabasePlane,
    authUserId,
    activeTab,
    setActiveTab,
    users,
    setUsers,
    familyMembers,
    pendingRequests,
    requestRoles,
    setRequestRoles,
    stats,
    isLoading,
    editingUser,
    setEditingUser,
    editingMember,
    setEditingMember,
    editForm,
    setEditForm,
    showCreateUser,
    setShowCreateUser,
    createForm,
    setCreateForm,
    placesPhotosEnabled,
    setPlacesPhotosEnabledState,
    placesAutocompleteEnabled,
    setPlacesAutocompleteEnabledState,
    placesDetailsEnabled,
    setPlacesDetailsEnabledState,
    passwordLogin,
    setPasswordLogin,
    passwordRegistration,
    setPasswordRegistration,
    oidcLogin,
    setOidcLogin,
    oidcRegistration,
    setOidcRegistration,
    envOverrideOidcOnly,
    setEnvOverrideOidcOnly,
    oidcConfigured,
    setOidcConfigured,
    requireMfa,
    setRequireMfa,
    invites,
    setInvites,
    inviteTrips,
    showCreateInvite,
    setShowCreateInvite,
    inviteForm,
    setInviteForm,
    allowedFileTypes,
    setAllowedFileTypes,
    savingFileTypes,
    setSavingFileTypes,
    // handlers
    loadData,
    loadAppConfig,
    handleToggleAuthSetting,
    handleToggleRequireMfa,
    handleCreateUser,
    handleCreateInvite,
    handleDeleteInvite,
    copyInviteLink,
    handleEditUser,
    handleEditMember,
    handleSaveUser,
    handleDeleteUser,
    handleSuspendMember,
    handleApproveRequest,
    handleDenyRequest,
    loadFamilyData,
  };
}

import { Check, Copy, Edit2, Link2, Plus, Shield, Trash2, UserPlus, X } from 'lucide-react';
import React from 'react';
import CustomSelect from '../../components/shared/CustomSelect';
import Modal from '../../components/shared/Modal';
import { FAMILY_ROLES, type FamilyRole } from '../../data/supabase/familyAdmin';
import type { TranslationFn } from '../../types';
import FamilyPermissionsPanel from './FamilyPermissionsPanel';
import type { useAdmin } from './useAdmin';

interface AdminUsersTabProps {
  admin: ReturnType<typeof useAdmin>;
  t: TranslationFn;
  locale: string;
}

// "Users" admin tab: user table, invite links, permissions panel + the
// create-invite modal. Pure layout around the useAdmin hook — no logic of its own.
export default function AdminUsersTab({ admin, t, locale }: AdminUsersTabProps): React.ReactElement {
  const {
    hour12,
    currentUser,
    authUserId,
    supabasePlane,
    users,
    familyMembers,
    pendingRequests,
    requestRoles,
    setRequestRoles,
    isLoading,
    setShowCreateUser,
    setCreateForm,
    invites,
    inviteTrips,
    showCreateInvite,
    setShowCreateInvite,
    inviteForm,
    setInviteForm,
    copyInviteLink,
    handleCreateInvite,
    handleDeleteInvite,
    handleEditUser,
    handleEditMember,
    handleDeleteUser,
    handleSuspendMember,
    handleApproveRequest,
    handleDenyRequest,
  } = admin;

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-edge bg-surface-card">
        <div className="flex items-center justify-between border-b border-edge p-5">
          <div>
            <h2 className="font-semibold text-content">{t('admin.tabs.users')}</h2>
            <p className="mt-1 text-caption text-content-muted">
              {(supabasePlane ? familyMembers : users).length} {t('admin.stats.users')}
            </p>
          </div>
          <button
            onClick={() => {
              if (supabasePlane) setCreateForm((f) => ({ ...f, password: '', role: 'guest' }));
              setShowCreateUser(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-inverse px-3 py-1.5 text-body text-inverse-text transition-colors hover:bg-inverse"
          >
            <UserPlus className="h-4 w-4" />
            {t('admin.createUser')}
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-edge border-t-edge"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-edge bg-surface-secondary text-start text-caption font-medium uppercase tracking-wider text-content-muted">
                  <th className="px-5 py-3">{t('admin.table.user')}</th>
                  <th className="px-5 py-3">{t('admin.table.email')}</th>
                  <th className="px-5 py-3">{t('admin.table.role')}</th>
                  <th className="px-5 py-3">{t('admin.table.created')}</th>
                  <th className="px-5 py-3">{t('admin.table.lastLogin')}</th>
                  <th className="px-5 py-3 text-end">{t('admin.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="trek-stagger divide-y divide-edge">
                {supabasePlane
                  ? familyMembers.map((member) => (
                      <tr
                        key={member.id}
                        className={`transition-colors hover:bg-surface-secondary ${member.userId === authUserId ? 'bg-surface-secondary' : ''}`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              {member.avatarUrl ? (
                                <img
                                  src={member.avatarUrl}
                                  alt={member.displayName}
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary text-body font-medium text-content">
                                  {(member.displayName.charAt(0) || '?').toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-body font-medium text-content">{member.displayName}</p>
                              {member.userId === authUserId && (
                                <span className="text-caption text-content-muted">{t('admin.you')}</span>
                              )}
                              {member.status === 'suspended' && (
                                <span className="text-caption text-warning">{t('admin.family.suspendedLabel')}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-body text-content-muted">{member.email || '—'}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium ${
                              member.role === 'patriarch' || member.role === 'parent'
                                ? 'bg-inverse text-inverse-text'
                                : 'bg-surface-secondary text-content-muted'
                            }`}
                          >
                            {(member.role === 'patriarch' || member.role === 'parent') && (
                              <Shield className="h-3 w-3" />
                            )}
                            {t(`admin.family.role.${member.role}`)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-body text-content-muted">
                          {new Date(member.createdAt).toLocaleDateString(locale)}
                        </td>
                        <td className="px-5 py-3 text-body text-content-muted">—</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEditMember(member)}
                              className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-secondary hover:text-content"
                              title={t('admin.editUser')}
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleSuspendMember(member)}
                              disabled={member.userId === authUserId}
                              className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                              title={t('admin.family.suspend')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  : users.map((u) => (
                      <tr
                        key={u.id}
                        className={`transition-colors hover:bg-surface-secondary ${u.id === currentUser?.id ? 'bg-surface-secondary' : ''}`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              {u.avatar_url ? (
                                <img
                                  src={u.avatar_url}
                                  alt={u.username}
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary text-body font-medium text-content">
                                  {u.username.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span
                                className={`absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-surface-card ${u.online ? 'bg-[var(--overlay)]' : 'bg-[var(--overlay)]'}`}
                              />
                            </div>
                            <div>
                              <p className="text-body font-medium text-content">{u.username}</p>
                              {u.id === currentUser?.id && (
                                <span className="text-caption text-content-muted">{t('admin.you')}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-body text-content-muted">{u.email}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium ${
                              u.role === 'admin'
                                ? 'bg-inverse text-inverse-text'
                                : 'bg-surface-secondary text-content-muted'
                            }`}
                          >
                            {u.role === 'admin' && <Shield className="h-3 w-3" />}
                            {u.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleUser')}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-body text-content-muted">
                          {new Date(u.created_at).toLocaleDateString(locale)}
                        </td>
                        <td className="px-5 py-3 text-body text-content-muted">
                          {u.last_login
                            ? new Date(u.last_login).toLocaleDateString(locale, {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12,
                              })
                            : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEditUser(u)}
                              className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-secondary hover:text-content"
                              title={t('admin.editUser')}
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              disabled={u.id === currentUser?.id}
                              className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                              title={t('admin.deleteUserTitle')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Links (inside users tab) */}
      {supabasePlane ? (
        <div className="mt-6 overflow-hidden rounded-xl border border-edge bg-surface-card">
          <div className="border-b border-edge p-5">
            <h2 className="font-semibold text-content">{t('admin.family.queueTitle')}</h2>
            <p className="mt-1 text-caption text-content-muted">{t('admin.family.queueSubtitle')}</p>
          </div>
          {pendingRequests.length === 0 ? (
            <div className="p-8 text-center text-body text-content-muted">{t('admin.family.queueEmpty')}</div>
          ) : (
            <div className="divide-y divide-edge">
              {pendingRequests.map((req) => (
                <div key={req.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-content">{req.displayName}</p>
                    <p className="truncate text-caption text-content-muted">
                      {req.email}
                      {req.relationNote ? ` · ${req.relationNote}` : ''}
                    </p>
                  </div>
                  <div className="w-36">
                    <CustomSelect
                      value={requestRoles[req.id] ?? 'guest'}
                      onChange={(v) => setRequestRoles((prev) => ({ ...prev, [req.id]: String(v) as FamilyRole }))}
                      options={FAMILY_ROLES.map((role) => ({ value: role, label: t(`admin.family.role.${role}`) }))}
                    />
                  </div>
                  <button
                    onClick={() => handleApproveRequest(req)}
                    title={t('admin.family.approve')}
                    className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-success-soft hover:text-success"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDenyRequest(req)}
                    title={t('admin.family.deny')}
                    className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-hidden rounded-xl border border-edge bg-surface-card">
            <div className="flex items-center justify-between border-b border-edge p-5">
              <div>
                <h2 className="font-semibold text-content">{t('admin.invite.title')}</h2>
                <p className="mt-1 text-caption text-content-muted">{t('admin.invite.subtitle')}</p>
              </div>
              <button
                onClick={() => setShowCreateInvite(true)}
                className="flex items-center gap-1.5 rounded-lg bg-inverse px-3 py-1.5 text-body text-inverse-text transition-colors hover:bg-inverse"
              >
                <Plus className="h-4 w-4" />
                {t('admin.invite.create')}
              </button>
            </div>

            {invites.length === 0 ? (
              <div className="p-8 text-center text-body text-content-muted">{t('admin.invite.empty')}</div>
            ) : (
              <div className="divide-y divide-edge">
                {invites.map((inv) => {
                  const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date();
                  const isUsedUp = inv.max_uses > 0 && inv.used_count >= inv.max_uses;
                  const isActive = !isExpired && !isUsedUp;
                  return (
                    <div key={inv.id} className="flex items-center gap-4 px-5 py-3">
                      <Link2 className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-content' : 'text-content'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="truncate font-mono text-caption text-content-muted">
                            {inv.token.slice(0, 12)}...
                          </code>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-caption font-medium ${
                              isActive ? 'bg-success-soft text-success' : 'bg-surface-secondary text-content-muted'
                            }`}
                          >
                            {isUsedUp
                              ? t('admin.invite.usedUp')
                              : isExpired
                                ? t('admin.invite.expired')
                                : t('admin.invite.active')}
                          </span>
                        </div>
                        <div className="mt-0.5 text-caption text-content-muted">
                          {inv.used_count}/{inv.max_uses === 0 ? '∞' : inv.max_uses} {t('admin.invite.uses')}
                          {inv.expires_at &&
                            ` · ${t('admin.invite.expiresAt')} ${new Date(inv.expires_at).toLocaleDateString(locale)}`}
                          {inv.trip_title && ` · ${t('admin.invite.boundTo', { trip: inv.trip_title })}`}
                          {` · ${t('admin.invite.createdBy')} ${inv.created_by_name}`}
                        </div>
                      </div>
                      {isActive && (
                        <button
                          onClick={() => copyInviteLink(inv.token)}
                          title={t('admin.invite.copyLink')}
                          className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-secondary hover:text-content"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteInvite(inv.id)}
                        title={t('common.delete')}
                        className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Create Invite Modal */}
          <Modal
            isOpen={showCreateInvite}
            onClose={() => setShowCreateInvite(false)}
            title={t('admin.invite.create')}
            size="sm"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-caption font-semibold uppercase tracking-wider text-content-muted">
                  {t('admin.invite.maxUses')}
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 0].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setInviteForm((f) => ({ ...f, max_uses: n }))}
                      className={`flex-1 rounded-lg border py-2 text-body font-semibold transition-colors ${
                        inviteForm.max_uses === n
                          ? 'border-edge bg-inverse text-inverse-text'
                          : 'border-edge bg-surface-card text-content-muted hover:border-edge'
                      }`}
                    >
                      {n === 0 ? '∞' : `${n}×`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-caption font-semibold uppercase tracking-wider text-content-muted">
                  {t('admin.invite.expiry')}
                </label>
                <div className="flex gap-2">
                  {[
                    { value: 1, label: '1d' },
                    { value: 3, label: '3d' },
                    { value: 7, label: '7d' },
                    { value: 14, label: '14d' },
                    { value: '', label: '∞' },
                  ].map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setInviteForm((f) => ({ ...f, expires_in_days: opt.value as number | '' }))}
                      className={`flex-1 rounded-lg border py-2 text-body font-semibold transition-colors ${
                        inviteForm.expires_in_days === opt.value
                          ? 'border-edge bg-inverse text-inverse-text'
                          : 'border-edge bg-surface-card text-content-muted hover:border-edge'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {inviteTrips.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-caption font-semibold uppercase tracking-wider text-content-muted">
                    {t('admin.invite.tripLabel')}
                  </label>
                  <CustomSelect
                    value={inviteForm.trip_id}
                    onChange={(v) => setInviteForm((f) => ({ ...f, trip_id: v === '' ? '' : Number(v) }))}
                    options={[
                      { value: '', label: t('admin.invite.tripNone') },
                      ...inviteTrips.map((tr) => ({ value: tr.id, label: tr.title })),
                    ]}
                    searchable={inviteTrips.length > 8}
                    placeholder={t('admin.invite.tripNone')}
                  />
                  <p className="mt-1.5 text-caption leading-relaxed text-content-muted">{t('admin.invite.tripHint')}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 border-t border-edge pt-2">
                <button
                  onClick={() => setShowCreateInvite(false)}
                  className="px-4 py-2 text-body text-content-muted hover:text-content"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreateInvite}
                  className="rounded-lg bg-inverse px-4 py-2 text-body text-inverse-text hover:bg-inverse"
                >
                  {t('admin.invite.createAndCopy')}
                </button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {supabasePlane && (
        <div className="mt-6">
          <FamilyPermissionsPanel />
        </div>
      )}
    </>
  );
}

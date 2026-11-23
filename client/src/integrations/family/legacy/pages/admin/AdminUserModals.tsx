import { Eye, EyeOff, Fingerprint } from 'lucide-react';
import React from 'react';
import { adminApi } from '../../api/client';
import CustomSelect from '../../components/shared/CustomSelect';
import Modal from '../../components/shared/Modal';
import { FAMILY_ROLES } from '../../data/supabase/familyAdmin';
import type { TranslationFn } from '../../types';
import type { useAdmin } from './useAdmin';

interface AdminUserModalsProps {
  admin: ReturnType<typeof useAdmin>;
  t: TranslationFn;
}

// The Admin user dialogs use state from the Admin hook.
export default function AdminUserModals({ admin, t }: AdminUserModalsProps): React.ReactElement {
  const {
    toast,
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
    handleCreateUser,
    handleSaveUser,
    supabasePlane,
  } = admin;
  const [showCreatePw, setShowCreatePw] = React.useState(false);
  const [showEditPw, setShowEditPw] = React.useState(false);

  return (
    <>
      {/* Create user modal */}
      <Modal
        isOpen={showCreateUser}
        onClose={() => setShowCreateUser(false)}
        title={t('admin.createUser')}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowCreateUser(false)}
              className="rounded-lg border border-edge px-4 py-2 text-body text-content-muted hover:bg-surface-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreateUser}
              className="rounded-lg bg-inverse px-4 py-2 text-body text-inverse-text hover:bg-inverse"
            >
              {t('admin.createUser')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-body font-medium text-content">{t('settings.username')} *</label>
            <input
              type="text"
              value={createForm.username}
              onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
              placeholder={t('settings.username')}
              className="w-full rounded-lg border border-edge px-3 py-2.5 text-body text-content focus:border-transparent focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-body font-medium text-content">{t('common.email')} *</label>
            <input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              placeholder={t('common.email')}
              className="w-full rounded-lg border border-edge px-3 py-2.5 text-body text-content focus:border-transparent focus:ring-2 focus:ring-accent"
            />
          </div>
          {!supabasePlane && (
            <div>
              <label className="mb-1.5 block text-body font-medium text-content">{t('common.password')} *</label>
              <div className="relative">
                <input
                  type={showCreatePw ? 'text' : 'password'}
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={t('common.password')}
                  className="w-full rounded-lg border border-edge px-3 py-2.5 pe-10 text-body text-content focus:border-transparent focus:ring-2 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePw((v) => !v)}
                  tabIndex={-1}
                  aria-label="Show or hide password"
                  className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-content-muted hover:text-content-muted"
                >
                  {showCreatePw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}
          {supabasePlane && <p className="text-caption text-content-muted">{t('admin.family.inviteHint')}</p>}
          <div>
            <label className="mb-1.5 block text-body font-medium text-content">{t('settings.role')}</label>
            <CustomSelect
              value={createForm.role}
              onChange={(value) => setCreateForm((f) => ({ ...f, role: String(value) }))}
              options={
                supabasePlane
                  ? FAMILY_ROLES.map((role) => ({ value: role, label: t(`admin.family.role.${role}`) }))
                  : [
                      { value: 'user', label: t('settings.roleUser') },
                      { value: 'admin', label: t('settings.roleAdmin') },
                    ]
              }
            />
          </div>
        </div>
      </Modal>

      {/* Edit user modal */}
      <Modal
        isOpen={supabasePlane ? !!editingMember : !!editingUser}
        onClose={() => {
          setEditingUser(null);
          setEditingMember(null);
        }}
        title={t('admin.editUser')}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setEditingUser(null);
                setEditingMember(null);
              }}
              className="rounded-lg border border-edge px-4 py-2 text-body text-content-muted hover:bg-surface-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSaveUser}
              className="rounded-lg bg-inverse px-4 py-2 text-body text-inverse-text hover:bg-inverse"
            >
              {t('common.save')}
            </button>
          </div>
        }
      >
        {(editingUser || editingMember) && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-body font-medium text-content">{t('settings.username')}</label>
              <input
                type="text"
                value={editForm.username}
                onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full rounded-lg border border-edge px-3 py-2.5 text-body text-content focus:border-transparent focus:ring-2 focus:ring-accent"
              />
            </div>
            {!supabasePlane && (
              <>
                <div>
                  <label className="mb-1.5 block text-body font-medium text-content">{t('common.email')}</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-lg border border-edge px-3 py-2.5 text-body text-content focus:border-transparent focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-body font-medium text-content">
                    {t('admin.newPassword')}{' '}
                    <span className="font-normal text-content-muted">({t('admin.newPasswordHint')})</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showEditPw ? 'text' : 'password'}
                      value={editForm.password}
                      onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder={t('admin.newPasswordPlaceholder')}
                      className="w-full rounded-lg border border-edge px-3 py-2.5 pe-10 text-body text-content focus:border-transparent focus:ring-2 focus:ring-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPw((v) => !v)}
                      tabIndex={-1}
                      aria-label="Show or hide password"
                      className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-content-muted hover:text-content-muted"
                    >
                      {showEditPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="mb-1.5 block text-body font-medium text-content">{t('settings.role')}</label>
              <CustomSelect
                value={editForm.role}
                onChange={(value) => setEditForm((f) => ({ ...f, role: String(value) }))}
                options={
                  supabasePlane
                    ? FAMILY_ROLES.map((role) => ({ value: role, label: t(`admin.family.role.${role}`) }))
                    : [
                        { value: 'user', label: t('settings.roleUser') },
                        { value: 'admin', label: t('settings.roleAdmin') },
                      ]
                }
              />
            </div>
            {!supabasePlane && (
              <div className="border-t border-edge pt-3">
                <p className="mb-2 text-caption text-content-muted">{t('admin.passkey.resetHint')}</p>
                <button
                  type="button"
                  onClick={async () => {
                    if (!editingUser) return;
                    if (!confirm(t('admin.passkey.resetConfirm', { name: editingUser.username }))) return;
                    try {
                      const r = await adminApi.resetUserPasskeys(editingUser.id);
                      toast.success(t('admin.passkey.resetDone', { count: r.deleted ?? 0 }));
                    } catch {
                      toast.error(t('common.error'));
                    }
                  }}
                  className="flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-body text-danger hover:bg-danger-soft"
                >
                  <Fingerprint size={14} /> {t('admin.passkey.reset')}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

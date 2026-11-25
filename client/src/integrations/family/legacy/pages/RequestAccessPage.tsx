import React, { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { useAuthStore } from '../store/authStore';

/**
 * Shown when Auth succeeds but Family access is blocked: no membership,
 * pending invite, suspended, or unlinked roster person.
 */
export default function RequestAccessPage(): React.ReactElement {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const authGate = useAuthStore((s) => s.authGate);
  const logout = useAuthStore((s) => s.logout);
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    if (isAuthenticated) {
      void loadUser({ silent: true });
    }
  }, [isAuthenticated, loadUser]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-secondary">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-edge border-t-edge" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const body =
    authGate === 'suspended'
      ? t('login.membershipSuspended')
      : authGate === 'pending_invite'
        ? t('login.pendingInvite')
        : authGate === 'unlinked'
          ? t('login.accountUnlinked')
          : t('login.noMembership');

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-surface-card p-8 shadow-sm">
        <h1 className="text-title font-semibold text-content">{t('login.requestAccessTitle')}</h1>
        <p className="mt-3 text-body leading-relaxed text-content-muted">
          {user?.email ? `${user.email}. ` : ''}
          {body}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className="rounded-xl bg-inverse px-4 py-2.5 text-body font-medium text-inverse-text hover:bg-inverse"
            onClick={() => {
              void logout().then(() => {
                window.location.href = '/login';
              });
            }}
          >
            {t('nav.logout')}
          </button>
          <Link
            to="/login"
            className="text-center text-body text-content-muted hover:text-content"
            onClick={(e) => {
              e.preventDefault();
              void logout().then(() => {
                window.location.href = '/login';
              });
            }}
          >
            {t('login.backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}

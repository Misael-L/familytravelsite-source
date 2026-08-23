import React, { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from '../i18n'
import { useAuthStore } from '../store/authStore'

/**
 * Shown when Auth succeeds but Family access is blocked: no membership,
 * pending invite, suspended, or unlinked roster person.
 */
export default function RequestAccessPage(): React.ReactElement {
  const { t } = useTranslation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const user = useAuthStore((s) => s.user)
  const authGate = useAuthStore((s) => s.authGate)
  const logout = useAuthStore((s) => s.logout)
  const loadUser = useAuthStore((s) => s.loadUser)

  useEffect(() => {
    if (isAuthenticated) {
      void loadUser({ silent: true })
    }
  }, [isAuthenticated, loadUser])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const body =
    authGate === 'suspended' ? t('login.membershipSuspended')
      : authGate === 'pending_invite' ? t('login.pendingInvite')
        : authGate === 'unlinked' ? t('login.accountUnlinked')
          : t('login.noMembership')

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{t('login.requestAccessTitle')}</h1>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
          {user?.email ? `${user.email}. ` : ''}{body}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            onClick={() => {
              void logout().then(() => {
                window.location.href = '/login'
              })
            }}
          >
            {t('nav.logout')}
          </button>
          <Link
            to="/login"
            className="text-center text-sm text-slate-500 hover:text-slate-800"
            onClick={(e) => {
              e.preventDefault()
              void logout().then(() => {
                window.location.href = '/login'
              })
            }}
          >
            {t('login.backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  )
}

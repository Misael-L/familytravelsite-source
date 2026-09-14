import React, { useState, useEffect } from 'react'
import { User, Save, Lock, KeyRound, AlertTriangle, Shield, Camera, Trash2, Copy, Download, Printer } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from '../../i18n'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../shared/Toast'
import { authApi, adminApi } from '../../api/client'
import { getApiErrorMessage } from '../../types'
import type { UserWithOidc } from '../../types'
import Section from './Section'
import PasskeysSection from './PasskeysSection'
import FamilySecurityPanel from './FamilySecurityPanel'
import { changePassword, isSupabaseDataPlane, PasswordChangeError } from '../../data/supabase/auth'
import {
  listIanaTimeZones,
  loadFamilyAccountSettings,
  updateFamilyDisplayName,
  updateFamilyEmail,
  updatePreferredTimeZone,
} from '../../data/supabase/familySettings'
import { clearPersonAvatar, personAvatarMessageKey, uploadPersonAvatar } from '../../data/supabase/personAvatars'
import CustomSelect from '../shared/CustomSelect'

const MFA_BACKUP_SESSION_KEY = 'trek_mfa_backup_codes_pending'

export default function AccountTab(): React.ReactElement {
  const { user, updateProfile, uploadAvatar, deleteAvatar, logout, loadUser, demoMode, appRequireMfa, personId, familyId, authUserId, membershipRole, authGate } = useAuthStore()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const toast = useToast()
  const avatarInputRef = React.useRef<HTMLInputElement>(null)
  const supabasePlane = isSupabaseDataPlane()
  const toastNestOnly = () => toast.error(t('settings.toast.nestOnly'))

  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean | 'blocked'>(false)

  // Profile
  const [username, setUsername] = useState<string>(user?.username || '')
  const [email, setEmail] = useState<string>(user?.email || '')
  const [timeZone, setTimeZone] = useState<string>('')

  useEffect(() => {
    setUsername(user?.username || '')
    setEmail(user?.email || '')
  }, [user])

  useEffect(() => {
    if (!supabasePlane || !authUserId || authGate !== 'ok') return
    loadFamilyAccountSettings({ userId: authUserId, personId }).then(loaded => {
      if (loaded.displayName) setUsername(loaded.displayName)
      if (loaded.email) setEmail(loaded.email)
      setTimeZone(loaded.preferredTimeZone || '')
    }).catch(() => {})
  }, [supabasePlane, authUserId, personId, authGate])

  // Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [oidcOnlyMode, setOidcOnlyMode] = useState(false)

  useEffect(() => {
    if (supabasePlane) return
    authApi.getAppConfig?.().then(config => {
      if (config?.oidc_only_mode) setOidcOnlyMode(true)
    }).catch(() => {})
  }, [supabasePlane])

  // MFA
  const [mfaQr, setMfaQr] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaSetupCode, setMfaSetupCode] = useState('')
  const [mfaDisablePwd, setMfaDisablePwd] = useState('')
  const [mfaDisableCode, setMfaDisableCode] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

  const mfaRequiredByPolicy =
    !demoMode &&
    !user?.mfa_enabled &&
    (searchParams.get('mfa') === 'required' || appRequireMfa)

  const backupCodesText = backupCodes?.join('\n') || ''

  useEffect(() => {
    if (!user?.mfa_enabled || backupCodes) return
    try {
      const raw = sessionStorage.getItem(MFA_BACKUP_SESSION_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(x => typeof x === 'string')) {
        setBackupCodes(parsed)
      }
    } catch {
      sessionStorage.removeItem(MFA_BACKUP_SESSION_KEY)
    }
  }, [user?.mfa_enabled, backupCodes])

  const dismissBackupCodes = () => {
    sessionStorage.removeItem(MFA_BACKUP_SESSION_KEY)
    setBackupCodes(null)
  }

  const copyBackupCodes = async () => {
    if (!backupCodesText) return
    try {
      await navigator.clipboard.writeText(backupCodesText)
      toast.success(t('settings.mfa.backupCopied'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const downloadBackupCodes = () => {
    if (!backupCodesText) return
    const blob = new Blob([backupCodesText + '\n'], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'trek-mfa-backup-codes.txt'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const printBackupCodes = () => {
    if (!backupCodesText) return
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>TREK MFA Backup Codes</title>
      <style>body{font-family:Arial,sans-serif;padding:32px}h1{font-size:20px}pre{font-size:16px;line-height:1.6}</style>
      </head><body><h1>TREK MFA Backup Codes</h1><p>${new Date().toLocaleString()}</p><pre>${backupCodesText}</pre></body></html>`
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (supabasePlane) {
      if (!familyId || !personId) {
        toast.error(t('dashboard.propose.missingPerson'))
        return
      }
      try {
        const url = await uploadPersonAvatar({ familyId, personId, file })
        useAuthStore.setState(state => ({
          user: state.user ? { ...state.user, avatar_url: url } : null,
        }))
        toast.success(t('settings.avatarUploaded'))
      } catch (err: unknown) {
        toast.error(t(personAvatarMessageKey(err)))
      }
      if (avatarInputRef.current) avatarInputRef.current.value = ''
      return
    }
    try {
      await uploadAvatar(file)
      toast.success(t('settings.avatarUploaded'))
    } catch {
      toast.error(t('settings.avatarError'))
    }
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  const handleAvatarRemove = async () => {
    if (supabasePlane) {
      if (!personId) {
        toast.error(t('dashboard.propose.missingPerson'))
        return
      }
      try {
        await clearPersonAvatar({ personId })
        useAuthStore.setState(state => ({
          user: state.user ? { ...state.user, avatar_url: null } : null,
        }))
        toast.success(t('settings.avatarRemoved'))
      } catch {
        toast.error(t('settings.avatarError'))
      }
      return
    }
    try {
      await deleteAvatar()
      toast.success(t('settings.avatarRemoved'))
    } catch {
      toast.error(t('settings.avatarError'))
    }
  }

  const saveProfile = async () => {
    if (supabasePlane) {
      if (!authUserId) {
        toast.error(t('dashboard.propose.missingPerson'))
        return
      }
      setSaving(true)
      try {
        await updateFamilyDisplayName({ userId: authUserId, personId, displayName: username })
        const sessionEmail = (user?.email || '').trim()
        const nextEmail = email.trim()
        const emailChanged = Boolean(nextEmail) && nextEmail.toLowerCase() !== sessionEmail.toLowerCase()
        let emailPending = false
        if (emailChanged) {
          if (!currentPassword) {
            toast.error(t('settings.currentPasswordRequired'))
            setSaving(false)
            return
          }
          const result = await updateFamilyEmail({
            email: nextEmail,
            currentPassword,
            personId,
          })
          emailPending = result.pendingConfirmation
          if (emailPending) setEmail(sessionEmail)
        }
        if (timeZone !== undefined) {
          await updatePreferredTimeZone({ userId: authUserId, timeZone: timeZone || null })
        }
        useAuthStore.setState(state => ({
          user: state.user
            ? {
                ...state.user,
                username: username.trim(),
                email: emailChanged && !emailPending ? nextEmail : state.user.email,
              }
            : null,
        }))
        if (emailPending) {
          toast.success(t('settings.toast.emailConfirmSent'))
        } else {
          toast.success(t('settings.toast.profileSaved'))
        }
      } catch (err: unknown) {
        if (err instanceof PasswordChangeError) {
          const byCode: Record<PasswordChangeError['code'], string> = {
            no_email: t('settings.emailRequiredForPassword'),
            current_required: t('settings.currentPasswordRequired'),
            too_short: t('settings.passwordTooShort'),
            mismatch: t('settings.passwordMismatch'),
            current_incorrect: t('settings.currentPasswordIncorrect'),
            update_failed: err.message || t('common.error'),
          }
          toast.error(byCode[err.code])
        } else {
          toast.error(err instanceof Error ? err.message : t('common.error'))
        }
      } finally {
        setSaving(false)
      }
      return
    }
    setSaving(true)
    try {
      await updateProfile({ username, email })
      toast.success(t('settings.toast.profileSaved'))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Section title={t('settings.account')} icon={User}>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.username')}</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.email')}</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
          />
          {supabasePlane && email.trim().toLowerCase() !== (user?.email || '').trim().toLowerCase() && (
            <p className="text-xs text-slate-400 mt-1.5">{t('settings.emailChangeHint')}</p>
          )}
        </div>
        {supabasePlane && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.timezone')}</label>
          <CustomSelect
            value={timeZone}
            onChange={v => setTimeZone(String(v))}
            options={[
              { value: '', label: t('settings.timezoneDevice') },
              ...listIanaTimeZones().map(z => ({ value: z, label: z })),
            ]}
            searchable
          />
          <p className="text-xs text-slate-400 mt-1.5">{t('settings.timezoneHint')}</p>
        </div>
        )}

        {/* Change Password */}
        {!oidcOnlyMode && (
          <div className="pt-4 mt-4 border-t border-edge-secondary">
            <label className="block text-sm font-medium text-slate-700 mb-3">{t('settings.changePassword')}</label>
            <div className="space-y-3">
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder={t('settings.currentPassword')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
              />
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder={t('settings.newPassword')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder={t('settings.confirmPassword')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 focus:border-transparent"
              />
              <button
                onClick={async () => {
                  if (!currentPassword) return toast.error(t('settings.currentPasswordRequired'))
                  if (!newPassword) return toast.error(t('settings.passwordRequired'))
                  if (newPassword.length < 8) return toast.error(t('settings.passwordTooShort'))
                  if (newPassword !== confirmPassword) return toast.error(t('settings.passwordMismatch'))
                  try {
                    if (supabasePlane) {
                      await changePassword({
                        email: user?.email,
                        currentPassword,
                        newPassword,
                        confirmPassword,
                      })
                    } else {
                      await authApi.changePassword({ current_password: currentPassword, new_password: newPassword })
                      await loadUser({ silent: true })
                    }
                    toast.success(t('settings.passwordChanged'))
                    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
                  } catch (err: unknown) {
                    if (err instanceof PasswordChangeError) {
                      const byCode: Record<PasswordChangeError['code'], string> = {
                        no_email: t('settings.emailRequiredForPassword'),
                        current_required: t('settings.currentPasswordRequired'),
                        too_short: t('settings.passwordTooShort'),
                        mismatch: t('settings.passwordMismatch'),
                        current_incorrect: t('settings.currentPasswordIncorrect'),
                        update_failed: err.message || t('common.error'),
                      }
                      toast.error(byCode[err.code])
                      return
                    }
                    toast.error(getApiErrorMessage(err, t('common.error')))
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-edge bg-surface-card text-content-secondary"
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
              >
                <Lock size={14} />
                {t('settings.updatePassword')}
              </button>
            </div>
          </div>
        )}

        {/* MFA */}
        {supabasePlane ? (
          <FamilySecurityPanel mfaRequiredByPolicy={mfaRequiredByPolicy} demoMode={!!demoMode} />
        ) : (
        <div className="pt-4 mt-4 border-t border-edge-secondary">
          <div className="flex items-center gap-2 mb-3">
            <KeyRound className="w-5 h-5 text-content-secondary" />
            <h3 className="font-semibold text-base m-0 text-content">{t('settings.mfa.title')}</h3>
          </div>
          <div className="space-y-3">
            {mfaRequiredByPolicy && (
              <div className="flex gap-3 p-3 rounded-lg border text-sm bg-surface-secondary border-edge text-content">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600" />
                <p className="m-0 leading-relaxed">{t('settings.mfa.requiredByPolicy')}</p>
              </div>
            )}
            <p className="text-sm m-0 text-content-muted" style={{ lineHeight: 1.5 }}>{t('settings.mfa.description')}</p>
            {demoMode ? (
              <p className="text-sm text-amber-700 m-0">{t('settings.mfa.demoBlocked')}</p>
            ) : (
              <>
                <p className="text-sm font-medium m-0 text-content-secondary">
                  {user?.mfa_enabled ? t('settings.mfa.enabled') : t('settings.mfa.disabled')}
                </p>

                {!user?.mfa_enabled && !mfaQr && (
                  <button
                    type="button"
                    disabled={mfaLoading}
                    onClick={async () => {
                      if (supabasePlane) { toastNestOnly(); return }
                      setMfaLoading(true)
                      try {
                        const data = await authApi.mfaSetup() as { qr_svg: string; secret: string }
                        setMfaQr(data.qr_svg)
                        setMfaSecret(data.secret)
                        setMfaSetupCode('')
                      } catch (err: unknown) {
                        toast.error(getApiErrorMessage(err, t('common.error')))
                      } finally {
                        setMfaLoading(false)
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-edge bg-surface-card text-content"
                  >
                    {mfaLoading ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /> : <KeyRound size={14} />}
                    {t('settings.mfa.setup')}
                  </button>
                )}

                {!user?.mfa_enabled && mfaQr && (
                  <div className="space-y-3">
                    <p className="text-sm text-content-muted">{t('settings.mfa.scanQr')}</p>
                    <div className="rounded-lg border mx-auto block overflow-hidden border-edge" style={{ width: 'fit-content' }} dangerouslySetInnerHTML={{ __html: mfaQr! }} />
                    <div>
                      <label className="block text-xs font-medium mb-1 text-content-secondary">{t('settings.mfa.secretLabel')}</label>
                      <code className="block text-xs p-2 rounded break-all bg-surface-hover text-content">{mfaSecret}</code>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={mfaSetupCode}
                      onChange={e => setMfaSetupCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder={t('settings.mfa.codePlaceholder')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={mfaLoading || mfaSetupCode.length < 6}
                        onClick={async () => {
                          if (supabasePlane) { toastNestOnly(); return }
                          setMfaLoading(true)
                          try {
                            const resp = await authApi.mfaEnable({ code: mfaSetupCode }) as { backup_codes?: string[] }
                            toast.success(t('settings.mfa.toastEnabled'))
                            setMfaQr(null)
                            setMfaSecret(null)
                            setMfaSetupCode('')
                            const codes = resp.backup_codes || null
                            if (codes?.length) {
                              try { sessionStorage.setItem(MFA_BACKUP_SESSION_KEY, JSON.stringify(codes)) } catch { /* ignore */ }
                            }
                            setBackupCodes(codes)
                            await loadUser({ silent: true })
                          } catch (err: unknown) {
                            toast.error(getApiErrorMessage(err, t('common.error')))
                          } finally {
                            setMfaLoading(false)
                          }
                        }}
                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50"
                      >
                        {t('settings.mfa.enable')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMfaQr(null); setMfaSecret(null); setMfaSetupCode('') }}
                        className="px-4 py-2 rounded-lg text-sm border border-edge text-content-secondary"
                      >
                        {t('settings.mfa.cancelSetup')}
                      </button>
                    </div>
                  </div>
                )}

                {user?.mfa_enabled && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-content-secondary">{t('settings.mfa.disableTitle')}</p>
                    <p className="text-xs text-content-muted">{t('settings.mfa.disableHint')}</p>
                    <input
                      type="password"
                      value={mfaDisablePwd}
                      onChange={e => setMfaDisablePwd(e.target.value)}
                      placeholder={t('settings.currentPassword')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={mfaDisableCode}
                      onChange={e => setMfaDisableCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder={t('settings.mfa.codePlaceholder')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      disabled={mfaLoading || !mfaDisablePwd || mfaDisableCode.length < 6}
                      onClick={async () => {
                        if (supabasePlane) { toastNestOnly(); return }
                        setMfaLoading(true)
                        try {
                          await authApi.mfaDisable({ password: mfaDisablePwd, code: mfaDisableCode })
                          toast.success(t('settings.mfa.toastDisabled'))
                          setMfaDisablePwd('')
                          setMfaDisableCode('')
                          sessionStorage.removeItem(MFA_BACKUP_SESSION_KEY)
                          setBackupCodes(null)
                          await loadUser({ silent: true })
                        } catch (err: unknown) {
                          toast.error(getApiErrorMessage(err, t('common.error')))
                        } finally {
                          setMfaLoading(false)
                        }
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50"
                    >
                      {t('settings.mfa.disable')}
                    </button>
                  </div>
                )}

                {backupCodes && backupCodes.length > 0 && (
                  <div className="space-y-3 p-3 rounded-lg border border-edge bg-surface-hover">
                    <p className="text-sm font-semibold m-0 text-content">{t('settings.mfa.backupTitle')}</p>
                    <p className="text-xs m-0 text-content-muted">{t('settings.mfa.backupDescription')}</p>
                    <pre className="text-xs m-0 p-2 rounded border overflow-auto border-edge bg-surface-card text-content" style={{ maxHeight: 220 }}>{backupCodesText}</pre>
                    <p className="text-xs m-0 text-[#b45309]">{t('settings.mfa.backupWarning')}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={copyBackupCodes} className="px-3 py-2 rounded-lg text-xs border flex items-center gap-1.5 border-edge text-content-secondary">
                        <Copy size={13} /> {t('settings.mfa.backupCopy')}
                      </button>
                      <button type="button" onClick={downloadBackupCodes} className="px-3 py-2 rounded-lg text-xs border flex items-center gap-1.5 border-edge text-content-secondary">
                        <Download size={13} /> {t('settings.mfa.backupDownload')}
                      </button>
                      <button type="button" onClick={printBackupCodes} className="px-3 py-2 rounded-lg text-xs border flex items-center gap-1.5 border-edge text-content-secondary">
                        <Printer size={13} /> {t('settings.mfa.backupPrint')}
                      </button>
                      <button type="button" onClick={dismissBackupCodes} className="px-3 py-2 rounded-lg text-xs border border-edge text-content-secondary">
                        {t('common.ok')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        )}

        {/* Passkeys */}
        <PasskeysSection demoMode={demoMode} />

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div className="bg-surface-hover text-content-secondary" style={{
                width: 64, height: 64, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'calc(24px * var(--fs-scale-title, 1))', fontWeight: 700,
              }}>
                {user?.username?.charAt(0).toUpperCase()}
              </div>
            )}
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
            <button
              onClick={() => avatarInputRef.current?.click()}
              style={{
                position: 'absolute', bottom: -3, right: -3,
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--text-primary)', color: 'var(--bg-card)',
                border: '2px solid var(--bg-card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: 0, transition: 'transform 0.15s, opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1' }}
            >
              <Camera size={14} />
            </button>
            {user?.avatar_url && (
              <button
                onClick={handleAvatarRemove}
                className="bg-[#ef4444] text-white"
                style={{
                  position: 'absolute', top: -2, right: -2,
                  width: 20, height: 20, borderRadius: '50%',
                  border: '2px solid var(--bg-card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', padding: 0,
                }}
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-sm text-content-muted">
              <span className="font-medium text-content-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {supabasePlane
                  ? (membershipRole === 'patriarch' ? t('settings.rolePatriarch')
                    : membershipRole === 'parent' ? t('settings.roleParent')
                    : membershipRole === 'child' ? t('settings.roleChild')
                    : membershipRole === 'guest' ? t('settings.roleGuest')
                    : t('settings.roleUser'))
                  : user?.role === 'admin' ? <><Shield size={13} /> {t('settings.roleAdmin')}</> : t('settings.roleUser')}
              </span>
              {(user as UserWithOidc)?.oidc_issuer && (
                <span className="bg-[#dbeafe] text-[#1d4ed8]" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 'calc(10px * var(--fs-scale-caption, 1))', fontWeight: 500, padding: '1px 8px', borderRadius: 99,
                  marginLeft: 6,
                }}>
                  SSO
                </span>
              )}
            </div>
            {(user as UserWithOidc)?.oidc_issuer && (
              <p className="text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', marginTop: -2 }}>
                {t('settings.oidcLinked')} {(user as UserWithOidc).oidc_issuer!.replace('https://', '').replace(/\/+$/, '')}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <button
            onClick={saveProfile}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 disabled:bg-slate-400"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">{t('settings.saveProfile')}</span>
            <span className="sm:hidden">{t('common.save')}</span>
          </button>
          <button
            onClick={async () => {
              if (supabasePlane) { toastNestOnly(); return }
              if (user?.role === 'admin') {
                try {
                  await adminApi.stats()
                  const adminUsers = (await adminApi.users()).users.filter((u: { role: string }) => u.role === 'admin')
                  if (adminUsers.length <= 1) {
                    setShowDeleteConfirm('blocked')
                    return
                  }
                } catch {}
              }
              setShowDeleteConfirm(true)
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-red-500 hover:bg-red-50 border border-[#fecaca]"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">{t('settings.deleteAccount')}</span>
            <span className="sm:hidden">{t('common.delete')}</span>
          </button>
        </div>
      </Section>

      {/* Delete Account Blocked */}
      {showDeleteConfirm === 'blocked' && (
        <div className="bg-[rgba(0,0,0,0.5)]" style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-surface-card" style={{
            borderRadius: 16, padding: '28px 24px',
            maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div className="bg-[#fef3c7]" style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={18} className="text-[#d97706]" />
              </div>
              <h3 className="text-content" style={{ margin: 0, fontSize: 'calc(16px * var(--fs-scale-subtitle, 1))', fontWeight: 700 }}>{t('settings.deleteBlockedTitle')}</h3>
            </div>
            <p className="text-content-muted" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', lineHeight: 1.6, margin: '0 0 20px' }}>
              {t('settings.deleteBlockedMessage')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="border border-edge bg-surface-card text-content-secondary"
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('common.ok') || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirm */}
      {showDeleteConfirm === true && (
        <div className="bg-[rgba(0,0,0,0.5)]" style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-surface-card" style={{
            borderRadius: 16, padding: '28px 24px',
            maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div className="bg-[#fef2f2]" style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={18} className="text-[#ef4444]" />
              </div>
              <h3 className="text-content" style={{ margin: 0, fontSize: 'calc(16px * var(--fs-scale-subtitle, 1))', fontWeight: 700 }}>{t('settings.deleteAccountTitle')}</h3>
            </div>
            <p className="text-content-muted" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', lineHeight: 1.6, margin: '0 0 20px' }}>
              {t('settings.deleteAccountWarning')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="border border-edge bg-surface-card text-content-secondary"
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => {
                  if (supabasePlane) { toastNestOnly(); return }
                  try {
                    await authApi.deleteOwnAccount()
                    logout()
                    navigate('/login', { state: { noRedirect: true } })
                  } catch (err: unknown) {
                    toast.error(getApiErrorMessage(err, t('common.error')))
                    setShowDeleteConfirm(false)
                  }
                }}
                className="bg-[#ef4444] text-white"
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('settings.deleteAccountConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

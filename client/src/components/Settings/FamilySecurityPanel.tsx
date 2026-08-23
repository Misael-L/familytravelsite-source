import React, { useEffect, useState } from 'react'
import { AlertTriangle, KeyRound } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../shared/Toast'
import {
  enrollTotpFactor,
  listTotpFactors,
  reauthenticateWithPassword,
  signOutOtherSessions,
  unenrollTotpFactor,
  verifyTotpFactor,
} from '../../data/supabase/auth'

function TotpQr({ value }: { value: string }): React.ReactElement {
  const svg = value.includes('<svg')
  if (svg) {
    return (
      <div
        className="rounded-lg border mx-auto block overflow-hidden border-edge"
        style={{ width: 'fit-content' }}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    )
  }
  return (
    <img
      src={value}
      alt=""
      className="rounded-lg border mx-auto block overflow-hidden border-edge"
      style={{ width: 180, height: 180 }}
    />
  )
}

export default function FamilySecurityPanel(props: {
  mfaRequiredByPolicy: boolean
  demoMode: boolean
}): React.ReactElement {
  const { t } = useTranslation()
  const toast = useToast()
  const loadUser = useAuthStore(s => s.loadUser)
  const user = useAuthStore(s => s.user)

  const [factors, setFactors] = useState<Array<{ id: string; status: string }>>([])
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [setupCode, setSetupCode] = useState('')
  const [disablePwd, setDisablePwd] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [loading, setLoading] = useState(false)

  const enabled = !!user?.mfa_enabled || factors.some(f => f.status === 'verified')

  const reload = async () => {
    const next = await listTotpFactors()
    setFactors(next)
  }

  useEffect(() => {
    void reload().catch(() => {})
  }, [])

  return (
    <div className="pt-4 mt-4 border-t border-edge-secondary">
      <div className="flex items-center gap-2 mb-3">
        <KeyRound className="w-5 h-5 text-content-secondary" />
        <h3 className="font-semibold text-base m-0 text-content">{t('settings.mfa.title')}</h3>
      </div>
      <div className="space-y-3">
        {props.mfaRequiredByPolicy && (
          <div className="flex gap-3 p-3 rounded-lg border text-sm bg-surface-secondary border-edge text-content">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600" />
            <p className="m-0 leading-relaxed">{t('settings.mfa.requiredByPolicy')}</p>
          </div>
        )}
        <p className="text-sm m-0 text-content-muted" style={{ lineHeight: 1.5 }}>{t('settings.mfa.description')}</p>
        <p className="text-xs m-0 text-content-faint">{t('settings.mfa.noBackupCodes')}</p>
        {props.demoMode ? (
          <p className="text-sm text-amber-700 m-0">{t('settings.mfa.demoBlocked')}</p>
        ) : (
          <>
            <p className="text-sm font-medium m-0 text-content-secondary">
              {enabled ? t('settings.mfa.enabled') : t('settings.mfa.disabled')}
            </p>

            {!enabled && !qr && (
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true)
                  try {
                    const enrolled = await enrollTotpFactor()
                    setFactorId(enrolled.factorId)
                    setQr(enrolled.qrCode)
                    setSecret(enrolled.secret)
                    setSetupCode('')
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : t('common.error'))
                  } finally {
                    setLoading(false)
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-edge bg-surface-card text-content"
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                  : <KeyRound size={14} />}
                {t('settings.mfa.setup')}
              </button>
            )}

            {!enabled && qr && (
              <div className="space-y-3">
                <p className="text-sm text-content-muted">{t('settings.mfa.scanQr')}</p>
                <TotpQr value={qr} />
                <div>
                  <label className="block text-xs font-medium mb-1 text-content-secondary">{t('settings.mfa.secretLabel')}</label>
                  <code className="block text-xs p-2 rounded break-all bg-surface-hover text-content">{secret}</code>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={setupCode}
                  onChange={e => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder={t('settings.mfa.codePlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={loading || setupCode.length < 6 || !factorId}
                    onClick={async () => {
                      if (!factorId) return
                      setLoading(true)
                      try {
                        await verifyTotpFactor(factorId, setupCode)
                        toast.success(t('settings.mfa.toastEnabled'))
                        setQr(null)
                        setSecret(null)
                        setSetupCode('')
                        setFactorId(null)
                        await reload()
                        await loadUser({ silent: true })
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : t('common.error'))
                      } finally {
                        setLoading(false)
                      }
                    }}
                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50"
                  >
                    {t('settings.mfa.enable')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setQr(null); setSecret(null); setSetupCode(''); setFactorId(null) }}
                    className="px-4 py-2 rounded-lg text-sm border border-edge text-content-secondary"
                  >
                    {t('settings.mfa.cancelSetup')}
                  </button>
                </div>
              </div>
            )}

            {enabled && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-content-secondary">{t('settings.mfa.disableTitle')}</p>
                <p className="text-xs text-content-muted">{t('settings.mfa.disableHint')}</p>
                <input
                  type="password"
                  value={disablePwd}
                  onChange={e => setDisablePwd(e.target.value)}
                  placeholder={t('settings.currentPassword')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={disableCode}
                  onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder={t('settings.mfa.codePlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <button
                  type="button"
                  disabled={loading || !disablePwd || disableCode.length < 6}
                  onClick={async () => {
                    const verified = factors.find(f => f.status === 'verified') ?? factors[0]
                    if (!verified) return
                    setLoading(true)
                    try {
                      await reauthenticateWithPassword(disablePwd)
                      await verifyTotpFactor(verified.id, disableCode)
                      await unenrollTotpFactor(verified.id)
                      toast.success(t('settings.mfa.toastDisabled'))
                      setDisablePwd('')
                      setDisableCode('')
                      await reload()
                      await loadUser({ silent: true })
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : t('common.error'))
                    } finally {
                      setLoading(false)
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50"
                >
                  {t('settings.mfa.disable')}
                </button>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true)
                  try {
                    await signOutOtherSessions()
                    toast.success(t('settings.sessions.signedOutOthers'))
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : t('common.error'))
                  } finally {
                    setLoading(false)
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-edge bg-surface-card text-content-secondary"
              >
                {t('settings.sessions.signOutOthers')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

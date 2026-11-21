import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { authApi } from '../../api/client'
import { getSupabaseSession } from '../../integrations/family/legacy/data/supabase/auth'
import { isFamilyFrontendActive } from '../../integrations/family/runtime'
import { getApiErrorMessage } from '../../types'
import { useTranslation } from '../../i18n'
import { passwordErrorKey } from '../../utils/passwordError'

/**
 * Reset-password data hook — owns the token lookup, the form state, the
 * client-side validation and the submit (incl. the MFA step-up branch).
 * ResetPasswordPage is a pure wiring container. Behaviour is identical to the
 * previous in-component logic.
 */
export function useResetPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const family = isFamilyFrontendActive()

  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [familyReady, setFamilyReady] = useState<boolean | null>(family ? null : false)

  useEffect(() => {
    if (!family) {
      setFamilyReady(false)
      if (!token) setError(t('login.resetPasswordInvalidLink'))
      return
    }
    let cancelled = false
    setFamilyReady(null)
    setError('')
    void (async () => {
      const hold = (globalThis as { __familyRecoveryHold?: boolean }).__familyRecoveryHold
      if (hold) {
        await new Promise<void>((resolve) => {
          addEventListener('family-recovery-release', () => resolve(), { once: true })
        })
      }
      if (cancelled) return
      try {
        const session = await getSupabaseSession()
        if (cancelled) return
        const ready = session != null
        setFamilyReady(ready)
        if (!ready) setError(t('login.resetPasswordInvalidLink'))
      } catch {
        if (cancelled) return
        setFamilyReady(false)
        setError(t('login.resetPasswordInvalidLink'))
      }
    })()
    return () => { cancelled = true }
  }, [family, token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    setError('')
    if (family) {
      if (familyReady !== true) return
    } else if (!token) return
    const weak = passwordErrorKey(pw)
    if (weak) { setError(t(weak)); return }
    if (pw !== pw2) { setError(t('login.passwordsDontMatch')); return }
    setIsLoading(true)
    try {
      const res = await authApi.resetPassword({
        token: family ? '' : token,
        new_password: pw,
        ...(mfaRequired && mfaCode ? { mfa_code: mfaCode.trim() } : {}),
      })
      if (res.mfa_required) {
        setMfaRequired(true)
        setIsLoading(false)
        return
      }
      if (res.success) {
        setSuccess(true)
      }
    } catch (err) {
      setError(getApiErrorMessage(err, t('login.resetPasswordFailed')))
    }
    setIsLoading(false)
  }

  return {
    navigate, token,
    familyRecoveryPending: family && familyReady === null,
    familyRecoveryReady: family && familyReady === true,
    pw, setPw, pw2, setPw2, showPw, setShowPw,
    mfaCode, setMfaCode, mfaRequired, error, success, isLoading,
    handleSubmit,
  }
}

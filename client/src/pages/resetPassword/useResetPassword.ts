import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../../api/client'
import { getApiErrorMessage } from '../../types'
import { useTranslation } from '../../i18n'
import {
  getSupabaseSession,
  isSupabaseDataPlane,
  updateRecoveredPassword,
} from '../../data/supabase/auth'

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
  const supabasePlane = isSupabaseDataPlane()

  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasRecoverySession, setHasRecoverySession] = useState(supabasePlane)

  useEffect(() => {
    if (supabasePlane) {
      void getSupabaseSession().then(session => {
        setHasRecoverySession(!!session)
        if (!session) setError(t('login.resetPasswordInvalidLink'))
      }).catch(() => setError(t('login.resetPasswordInvalidLink')))
      return
    }
    if (!token) setError(t('login.resetPasswordInvalidLink'))
  }, [token, t, supabasePlane])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    setError('')
    if (supabasePlane) {
      if (!hasRecoverySession) return
    } else if (!token) {
      return
    }
    if (pw.length < 8) { setError(t('login.passwordMinLength')); return }
    if (pw !== pw2) { setError(t('login.passwordsDontMatch')); return }
    setIsLoading(true)
    try {
      if (supabasePlane) {
        await updateRecoveredPassword(pw)
        setSuccess(true)
        setIsLoading(false)
        return
      }
      const res = await authApi.resetPassword({
        token,
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
    navigate, token: supabasePlane || token,
    pw, setPw, pw2, setPw2, showPw, setShowPw,
    mfaCode, setMfaCode, mfaRequired, error, success, isLoading,
    handleSubmit,
  }
}

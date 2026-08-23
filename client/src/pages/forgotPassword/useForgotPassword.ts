import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../api/client'
import { isSupabaseDataPlane, requestPasswordRecovery } from '../../data/supabase/auth'

/**
 * Forgot-password data hook — owns the form state, the SMTP-availability probe
 * and the enumeration-safe submit. ForgotPasswordPage is a pure wiring
 * container that renders what this returns. Behaviour is identical to the
 * previous in-component logic.
 */
export function useForgotPassword() {
  const navigate = useNavigate()
  const supabasePlane = isSupabaseDataPlane()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    if (supabasePlane) {
      setSmtpConfigured(true)
      return
    }
    authApi.getAppConfig?.()
      .then((cfg: { available_channels?: { email?: boolean } } | null) => {
        setSmtpConfigured(!!cfg?.available_channels?.email)
      })
      .catch(() => setSmtpConfigured(null))
  }, [supabasePlane])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    setIsLoading(true)
    try {
      if (supabasePlane) {
        await requestPasswordRecovery(email.trim())
      } else {
        await authApi.forgotPassword({ email: email.trim() })
      }
    } catch {
      // Enumeration-safe: success UX regardless of server outcome.
    }
    setSubmitted(true)
    setIsLoading(false)
  }

  return { navigate, email, setEmail, submitted, isLoading, smtpConfigured, handleSubmit }
}

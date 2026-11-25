import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { tripInviteApi } from '../../api/client'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import { useAuthStore } from '../../store/authStore'
import { logoutInProgress } from '../../sync/logoutCoordinator'
import { captureReadSession } from '../../sync/readSession'
import { getApiErrorMessage } from '../../types'

export type JoinTripState = 'loading' | 'ready' | 'joining' | 'invalid' | 'removed'

interface InviteScope {
  accountId: number | null
  token: string | undefined
}

interface InviteView {
  scope: InviteScope
  state: JoinTripState
  title: string
}

interface InviteOwner {
  scope: InviteScope
  current: () => boolean
  accepting: boolean
}

function selectAccountId(state: ReturnType<typeof useAuthStore.getState>): number | null {
  return state.isAuthenticated ? state.user?.id ?? null : null
}

function refusalState(err: unknown): 'invalid' | 'removed' | undefined {
  const response = (err as { response?: { status?: number; data?: { removed?: unknown } } } | null)?.response
  if (response?.status === 404) return 'invalid'
  if (response?.status === 403 && response.data?.removed === true) return 'removed'
}

/** Resolve and accept the invite within the account and view that opened it. */
export function useJoinTrip() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const toast = useToast()
  const accountId = useAuthStore(selectAccountId)
  const scope = useMemo(() => ({ accountId, token }), [accountId, token])
  const active = useRef<InviteOwner | null>(null)
  const [view, setView] = useState<InviteView | null>(null)

  useLayoutEffect(() => {
    const session = captureReadSession()
    const owner: InviteOwner = {
      scope,
      current: () => active.current === owner && session.contextCurrent() && !logoutInProgress()
        && selectAccountId(useAuthStore.getState()) === scope.accountId,
      accepting: false,
    }
    active.current = owner
    return () => {
      if (active.current === owner) active.current = null
    }
  }, [scope])

  useEffect(() => {
    const owner = active.current
    if (!token || accountId === null || !owner?.current()) return

    void tripInviteApi.preview(token)
      .then((data: { title: string }) => {
        if (owner.current()) setView({ scope, title: data.title, state: 'ready' })
      })
      .catch((err: unknown) => {
        if (owner.current()) setView({ scope, title: '', state: refusalState(err) ?? 'invalid' })
      })
  }, [accountId, scope, token])

  const currentView = view?.scope === scope ? view : null
  const state = currentView?.state ?? (token ? 'loading' : 'invalid')
  const title = currentView?.title ?? ''

  const accept = () => {
    const owner = active.current
    if (!token || state !== 'ready' || owner?.scope !== scope || owner.accepting || !owner.current()) return
    owner.accepting = true
    setView({ scope, title, state: 'joining' })

    void tripInviteApi.accept(token)
      .then((data: { trip_id: number }) => {
        if (owner.current()) void navigate(`/trips/${data.trip_id}`, { replace: true })
      })
      .catch((err: unknown) => {
        if (!owner.current()) return
        owner.accepting = false
        // A transient failure leaves the same invite available for an explicit retry.
        const refused = refusalState(err)
        setView({ scope, title, state: refused ?? 'ready' })
        if (!refused) toast.error(getApiErrorMessage(err, t('common.error')))
      })
  }

  const goToDashboard = () => {
    if (active.current?.scope !== scope) return
    active.current = null
    void navigate('/dashboard', { replace: true })
  }

  return { state, title, accept, goToDashboard }
}

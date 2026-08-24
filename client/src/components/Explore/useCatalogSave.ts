import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isCatalogSaved,
  toggleCatalogSave,
} from '../../data/supabase/catalogSaves'
import type { ExploreCatalogKind } from '../../data/supabase/catalogExploreLists'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'

export function useCatalogSave(opts: {
  familyId: string | null | undefined
  personId: string | null | undefined
  kind: ExploreCatalogKind | null
  entityId: string | null
  enabled: boolean
}): {
  isSaved: boolean
  busy: boolean
  toggle: () => void
} {
  const toast = useToast()
  const { t } = useTranslation()

  const [isSaved, setIsSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const gen = useRef(0)

  const familyId = opts.familyId ?? null
  const personId = opts.personId ?? null
  const kind = opts.kind
  const entityId = opts.entityId
  const enabled = opts.enabled && Boolean(kind && entityId)

  useEffect(() => {
    if (!enabled || !familyId || !personId || !kind || !entityId) {
      setIsSaved(false)
      setBusy(false)
      return
    }
    const n = ++gen.current
    void isCatalogSaved({ familyId, personId, kind, entityId })
      .then(saved => {
        if (n !== gen.current) return
        setIsSaved(saved)
      })
      .catch(() => {
        if (n !== gen.current) return
        setIsSaved(false)
      })
  }, [enabled, familyId, personId, kind, entityId])

  const toggle = useCallback(() => {
    if (!kind || !entityId) return
    if (!familyId || !personId) {
      const msg = t('trip.explore.save.needAccount')
      toast.error(!msg || msg === 'trip.explore.save.needAccount'
        ? 'Sign in with a family membership to save picks.'
        : msg)
      return
    }
    if (busy) return
    const previous = isSaved
    setIsSaved(!previous)
    setBusy(true)
    void toggleCatalogSave({ familyId, kind, entityId })
      .then(saved => {
        setIsSaved(saved)
      })
      .catch((err: unknown) => {
        setIsSaved(previous)
        const fallback = t('trip.explore.save.error')
        toast.error(err instanceof Error
          ? err.message
          : (!fallback || fallback === 'trip.explore.save.error'
            ? 'Could not update saved picks.'
            : fallback))
      })
      .finally(() => {
        setBusy(false)
      })
  }, [busy, entityId, familyId, isSaved, kind, personId, t, toast])

  return { isSaved, busy, toggle }
}

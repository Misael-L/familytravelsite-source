import { useEffect, useRef, useState } from 'react'
import type { ExploreCatalogKind } from '../../data/supabase/catalogExploreLists'
import {
  isFamilyListCatalogKind,
  listFamilyListMembership,
} from '../../data/supabase/familyLists'
import { useSaveToCollectionStore } from '../../store/saveToCollectionStore'

/** Filled Explore Bookmark when the catalog entity is on any visible named list. */
export function useCatalogListMembership(opts: {
  familyId: string | null | undefined
  kind: ExploreCatalogKind | null
  entityId: string | null
  enabled: boolean
}): { onAnyList: boolean } {
  const version = useSaveToCollectionStore(s => s.version)
  const [onAnyList, setOnAnyList] = useState(false)
  const gen = useRef(0)

  const familyId = opts.familyId ?? null
  const kind = opts.kind
  const entityId = opts.entityId
  const enabled = opts.enabled && Boolean(kind && entityId)

  useEffect(() => {
    if (!enabled || !familyId || !kind || !entityId || !isFamilyListCatalogKind(kind)) {
      setOnAnyList(false)
      return
    }
    const n = ++gen.current
    void listFamilyListMembership(familyId, kind, entityId)
      .then(rows => {
        if (n !== gen.current) return
        setOnAnyList(rows.length > 0)
      })
      .catch(() => {
        if (n !== gen.current) return
        setOnAnyList(false)
      })
  }, [enabled, familyId, kind, entityId, version])

  return { onAnyList }
}

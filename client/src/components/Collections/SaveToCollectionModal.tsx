import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, BookmarkCheck, Check, Loader2, Plus } from 'lucide-react'
import Modal from '../shared/Modal'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'
import { collectionsApi, collectionsFromListResponse } from '../../api/collections'
import { useSaveToCollectionStore } from '../../store/saveToCollectionStore'
import { useCollectionsEnabled } from '../../store/familyFeatureStore'
import { getApiErrorMessage } from '../../utils/apiError'
import type { Collection, CollectionMembership } from '@trek/shared'
import { useAuthStore } from '../../store/authStore'
import type { CollectionEntityId } from '../../pages/collections/collectionsModel'
import {
  addFamilyListItem,
  isFamilyListCatalogKind,
  listFamilyListMembership,
  listFamilyLists,
  mapFamilyList,
  removeFamilyListItem,
  type FamilyListCatalogKind,
  type FamilyListMembership,
} from '../../data/supabase/familyLists'

function pickerErrorMessage(err: unknown, fallback: string): string {
  const axiosMsg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error
  if (typeof axiosMsg === 'string' && axiosMsg.trim()) return axiosMsg
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    const m = (err as { message: string }).message.trim()
    if (m) return m
  }
  return getApiErrorMessage(err, fallback)
}

/**
 * Globally-mounted list picker for the "Save to Collection" entry points
 * (PlaceInspector footer button + the two trip-sidebar context menus + Explore
 * Add to list). Reads the active target from saveToCollectionStore, shows every
 * list the user owns or co-owns, and toggles the place in/out of each — a check
 * marks the lists that already hold it. Each change refreshes membership and
 * bumps the store version so bookmark indicators stay in sync. One mount, no
 * prop drilling.
 *
 * Family Catalog targets (`catalog_kind` + `catalog_entity_id`) use `familyLists`
 * adapters only — never Nest `collectionsApi`.
 */
export default function SaveToCollectionModal(): React.ReactElement | null {
  const collectionsEnabled = useCollectionsEnabled()
  const target = useSaveToCollectionStore(s => s.target)
  const close = useSaveToCollectionStore(s => s.close)
  const bumpVersion = useSaveToCollectionStore(s => s.bumpVersion)
  const familyId = useAuthStore(s => s.familyId)
  const personId = useAuthStore(s => s.personId)
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()

  const [lists, setLists] = useState<Collection[]>([])
  const [membership, setMembership] = useState<CollectionMembership | null>(null)
  const [familyMembership, setFamilyMembership] = useState<FamilyListMembership[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<CollectionEntityId | null>(null)

  useEffect(() => {
    if (!collectionsEnabled) close()
  }, [collectionsEnabled, close])

  const familyCatalog = useMemo(() => {
    if (!target) return null
    const kind = target.catalog_kind
    const entityId = target.catalog_entity_id?.trim()
    if (!kind || !entityId || !isFamilyListCatalogKind(kind)) return null
    return { kind, entityId }
  }, [target])

  const membershipQuery = useMemo(() => {
    if (!target || familyCatalog) return null
    return {
      google_place_id: target.google_place_id ?? undefined,
      google_ftid: target.google_ftid ?? undefined,
      name: target.name,
      lat: target.lat ?? undefined,
      lng: target.lng ?? undefined,
    }
  }, [target, familyCatalog])

  const refreshNestMembership = useCallback(async () => {
    if (!membershipQuery) return
    try {
      const m = await collectionsApi.membership(membershipQuery)
      setMembership(m)
    } catch {
      setMembership({ saved: false, lists: [] })
    }
  }, [membershipQuery])

  const refreshFamilyMembership = useCallback(async (
    kind: FamilyListCatalogKind,
    entityId: string,
  ) => {
    if (!familyId) {
      setFamilyMembership([])
      return
    }
    const members = await listFamilyListMembership(familyId, kind, entityId)
    setFamilyMembership(members)
  }, [familyId])

  // Load lists + membership whenever the picker opens for a new target.
  useEffect(() => {
    if (!collectionsEnabled || !target) return
    let cancelled = false
    setLoading(true)
    setMembership(null)
    setFamilyMembership([])

    if (familyCatalog) {
      if (!familyId) {
        setLists([])
        setLoading(false)
        return
      }
      Promise.all([
        listFamilyLists(familyId),
        listFamilyListMembership(familyId, familyCatalog.kind, familyCatalog.entityId),
      ])
        .then(([rows, members]) => {
          if (cancelled) return
          setLists(rows.map(row => mapFamilyList(row, { personId: personId ?? '' })))
          setFamilyMembership(members)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setLists([])
          setFamilyMembership([])
          toast.error(pickerErrorMessage(err, t('common.error')))
        })
        .finally(() => { if (!cancelled) setLoading(false) })
      return () => { cancelled = true }
    }

    Promise.all([
      collectionsApi.list().catch(() => ({ collections: [], incomingInvites: [] })),
      membershipQuery
        ? collectionsApi.membership(membershipQuery).catch(() => ({ saved: false, lists: [] as CollectionMembership['lists'] }))
        : Promise.resolve({ saved: false, lists: [] as CollectionMembership['lists'] }),
    ])
      .then(([listRes, m]) => {
        if (cancelled) return
        setLists(collectionsFromListResponse(listRes))
        setMembership(m)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, collectionsEnabled])

  if (!collectionsEnabled || !target) return null

  const savedByCollection = new Map<number, number>()
  for (const l of membership?.lists ?? []) savedByCollection.set(l.collection_id, l.place_id)
  const familySaved = new Map(familyMembership.map(m => [m.listId, m.itemId]))

  const handleToggle = async (list: Collection) => {
    if (busyId != null) return
    setBusyId(list.id)
    try {
      if (familyCatalog) {
        const itemId = familySaved.get(String(list.id))
        if (itemId) {
          await removeFamilyListItem(itemId)
          toast.success(t('collections.removedFromList', { name: list.name }))
        } else {
          await addFamilyListItem({
            listId: String(list.id),
            kind: familyCatalog.kind,
            entityId: familyCatalog.entityId,
            status: 'idea',
          })
          toast.success(t('collections.addedToList', { name: list.name }))
        }
        await refreshFamilyMembership(familyCatalog.kind, familyCatalog.entityId)
        bumpVersion()
        return
      }

      const savedPlaceId = savedByCollection.get(list.id)
      if (savedPlaceId != null) {
        await collectionsApi.deletePlace(savedPlaceId)
        toast.success(t('collections.removedFromList', { name: list.name }))
      } else {
        await collectionsApi.savePlace({
          collection_id: list.id,
          source_trip_id: target.source_trip_id ?? null,
          source_place_id: target.source_place_id ?? null,
          name: target.name,
          description: target.description ?? null,
          lat: target.lat ?? null,
          lng: target.lng ?? null,
          address: target.address ?? null,
          category_id: target.category_id ?? null,
          price: target.price ?? null,
          currency: target.currency ?? null,
          notes: target.notes ?? null,
          image_url: target.image_url ?? null,
          google_place_id: target.google_place_id ?? null,
          google_ftid: target.google_ftid ?? null,
          osm_id: target.osm_id ?? null,
          website: target.website ?? null,
          phone: target.phone ?? null,
          force: true,
        })
        toast.success(t('collections.addedToList', { name: list.name }))
      }
      await refreshNestMembership()
      bumpVersion()
    } catch (err) {
      toast.error(
        familyCatalog
          ? pickerErrorMessage(err, t('common.error'))
          : getApiErrorMessage(err, t('common.error')),
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal
      isOpen
      onClose={close}
      title={t('collections.pickList')}
      size="sm"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => { close(); navigate('/collections') }}
            className="text-[13px] font-medium text-accent hover:underline"
          >
            {t('collections.viewInCollection')}
          </button>
          <button
            type="button"
            onClick={close}
            className="px-3 py-1.5 rounded-lg border border-edge text-content-secondary text-[13px] hover:bg-surface-hover"
          >
            {t('common.close')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-content truncate">{target.name}</p>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-content-faint">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : lists.length === 0 ? (
          <div className="flex flex-col items-center text-center py-8 px-4">
            <div className="w-11 h-11 rounded-2xl bg-surface-secondary flex items-center justify-center mb-3 text-content-faint">
              <Bookmark size={20} />
            </div>
            <p className="text-[13px] text-content-faint mb-3">{t('collections.noListsYet')}</p>
            <button
              type="button"
              onClick={() => { close(); navigate('/collections') }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-text text-[13px] font-semibold"
            >
              <Plus size={14} /> {t('collections.newList')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto -mx-1 px-1">
            {lists.map(list => {
              const saved = familyCatalog
                ? familySaved.has(String(list.id))
                : savedByCollection.has(list.id)
              const busy = busyId === list.id
              return (
                <button
                  key={String(list.id)}
                  type="button"
                  onClick={() => handleToggle(list)}
                  disabled={busy}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors disabled:opacity-60 ${saved ? 'border-accent bg-accent-subtle' : 'border-edge bg-surface-card hover:bg-surface-hover'}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: list.color || 'var(--accent)' }} />
                  <span className="flex-1 min-w-0 text-[13px] font-medium text-content truncate">{list.name}</span>
                  {list.is_owner === false && (
                    <span className="text-[10px] uppercase font-semibold text-content-faint">{t('collections.shared')}</span>
                  )}
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${saved ? 'bg-accent text-accent-text' : 'border border-edge text-transparent'}`}>
                    {busy ? <Loader2 size={13} className="animate-spin text-content-faint" /> : saved ? <BookmarkCheck size={13} /> : <Check size={13} />}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

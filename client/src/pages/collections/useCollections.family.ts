import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from '../../i18n'
import { useElementSize } from '../../hooks/useElementSize'
import { useElementRect } from '../../hooks/useElementRect'
import { useSettingsStore } from '../../store/settingsStore'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/shared/Toast'
import { getApiErrorMessage } from '../../types'
import { ALL_SAVED, type CollectionView, type StatusFilter } from '../../store/collectionStore'
import type { Collection, CollectionLabelUpdateRequest, CollectionStatus } from '@trek/shared'
import type { Category, Place } from '../../types'
import { canMutateTrips } from '../../data/supabase/capabilities'
import { canTripActionDirect } from '../../data/supabase/familyPermissions'
import { copyFamilyListPlacesToTrip } from '../../data/supabase/copyFamilyListPlacesToTrip'
import { listTripPlaces } from '../../data/supabase/tripPlaces'
import {
  addFamilyListItem,
  archiveFamilyList,
  createFamilyList,
  loadFamilyCollections,
  removeFamilyListItem,
  setFamilyListItemStatus,
  updateFamilyList,
  uploadFamilyListCover,
  type FamilyCollectionPlace,
  type FamilyListCatalogKind,
  type FamilyListView,
  type FamilyListVisibility,
} from '../../data/supabase/familyLists'
import { isSupabaseDataPlane } from '../../data/supabase/auth'
import { filterPlaces, isRealCollectionId, mappablePlaces, presentCategories, presentLabels, sortPlaces, statusCounts } from './collectionsModel'
import type { CollectionEntityId } from './collectionsModel'
import type { ListEditorAdapter } from '../../components/Collections/ListEditorModal'

function asCollection(list: FamilyListView): Collection {
  return list
}

/**
 * Family-plane Collections chrome. Adapters only — no Nest store, socket, or maps search.
 */
export function useFamilyCollections() {
  const { t, language } = useTranslation()
  const navigate = useNavigate()
  const { id: routeId } = useParams<{ id: string }>()
  const toast = useToast()
  const { familyId, personId, isSuperAdmin, membershipRole } = useAuthStore()
  const canReview = canMutateTrips({ isSuperAdmin, membershipRole: membershipRole ?? null })

  const dm = useSettingsStore(s => s.settings.dark_mode)
  const dark = dm === true || dm === 'dark' || (dm === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const [isWide, setIsWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setIsWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const hero = useElementSize<HTMLDivElement>()
  const listCol = useElementRect<HTMLDivElement>()

  const [collections, setCollections] = useState<FamilyListView[]>([])
  const [allPlaces, setAllPlaces] = useState<FamilyCollectionPlace[]>([])
  const [activeId, setActiveId] = useState<CollectionEntityId | typeof ALL_SAVED | null>(ALL_SAVED)
  const [loading, setLoading] = useState(true)
  const [placesLoading, setPlacesLoading] = useState(false)
  const [view, setView] = useState<CollectionView>('list')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all')
  const [labelFilter, setLabelFilter] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [selectedPlaceId, setSelectedPlaceId] = useState<CollectionEntityId | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<CollectionEntityId[]>([])

  const [editorTarget, setEditorTarget] = useState<Collection | 'new' | null>(null)
  const [confirmDeleteList, setConfirmDeleteList] = useState<CollectionEntityId | null>(null)
  const [mobileRailOpen, setMobileRailOpen] = useState(false)
  const [showAddPlace, setShowAddPlace] = useState(false)
  const [copyIds, setCopyIds] = useState<CollectionEntityId[] | null>(null)

  const reload = useCallback(async () => {
    if (!isSupabaseDataPlane()) return
    if (!familyId || !personId) return
    const loaded = await loadFamilyCollections({ familyId, personId })
    setCollections(loaded.collections)
    setAllPlaces(loaded.places)
  }, [familyId, personId])

  useEffect(() => {
    if (!isSupabaseDataPlane()) return
    let cancelled = false
    ;(async () => {
      if (!familyId || !personId) {
        toast.error(t('dashboard.propose.missingPerson'))
        setLoading(false)
        setPlacesLoading(false)
        return
      }
      setLoading(true)
      setPlacesLoading(true)
      try {
        const loaded = await loadFamilyCollections({ familyId, personId })
        if (cancelled) return
        setCollections(loaded.collections)
        setAllPlaces(loaded.places)
      } catch (err) {
        if (!cancelled) toast.error(getApiErrorMessage(err, t('common.error')))
      } finally {
        if (!cancelled) {
          setLoading(false)
          setPlacesLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, personId])

  useEffect(() => {
    if (!isSupabaseDataPlane()) return
    const next: CollectionEntityId | typeof ALL_SAVED = routeId ? routeId : ALL_SAVED
    if (next !== activeId) setActiveId(next)
    setSelectedPlaceId(null)
    setSelectMode(false)
    setSelectedIds([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, collections.length])

  const firstViewRun = useRef(true)
  useEffect(() => {
    if (firstViewRun.current) { firstViewRun.current = false; return }
    if (!isWide) return
    const start = performance.now()
    let raf = 0
    const tick = () => {
      window.dispatchEvent(new Event('resize'))
      if (performance.now() - start < 440) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [view, isWide])

  const collectionViews = useMemo(() => collections.map(asCollection), [collections])
  const activeCollection = useMemo(
    () => (isRealCollectionId(activeId) ? collections.find(c => c.id === activeId) ?? null : null),
    [collections, activeId],
  )
  const isAllSaved = activeId === ALL_SAVED
  const isOwner = activeCollection?.is_owner ?? false
  const visibility = activeCollection?.visibility ?? 'private'
  const canAdminList = Boolean(activeCollection) && (isOwner || (visibility === 'family' && canReview))
  const canEdit = isAllSaved || Boolean(activeCollection && (isOwner || visibility === 'family'))
  const canDelete = canEdit
  const canShare = false

  const places = useMemo(() => {
    if (isAllSaved) return allPlaces
    if (!isRealCollectionId(activeId)) return []
    return allPlaces.filter(p => String(p.collection_id) === String(activeId))
  }, [allPlaces, activeId, isAllSaved])

  const ownedLists = useMemo(() => collections.filter(c => c.is_owner !== false).map(asCollection), [collections])
  const sharedLists = useMemo(() => collections.filter(c => c.is_owner === false).map(asCollection), [collections])

  const visiblePlaces = useMemo(
    () => sortPlaces(filterPlaces(places, statusFilter, search, categoryFilter, [])),
    [places, statusFilter, search, categoryFilter],
  )
  const categoryOptions = useMemo(() => presentCategories(places), [places])
  const labelOptions = useMemo(() => presentLabels([], places), [places])
  const mappable = useMemo(() => mappablePlaces(visiblePlaces), [visiblePlaces])
  const counts = useMemo(() => statusCounts(places), [places])

  const excludeByKind = useMemo(() => {
    const out: Partial<Record<FamilyListCatalogKind, string[]>> = {}
    for (const p of places) {
      const kind = p.catalog_kind
      const entityId = p.catalog_entity_id
      if (kind !== 'place' && kind !== 'experience' && kind !== 'food' && kind !== 'hotel') continue
      if (!entityId) continue
      const list = out[kind] ?? []
      list.push(entityId)
      out[kind] = list
    }
    return out
  }, [places])

  const handleSelectList = useCallback((id: CollectionEntityId | typeof ALL_SAVED | null) => {
    setMobileRailOpen(false)
    navigate(id === ALL_SAVED || id === null ? '/collections' : `/collections/${id}`)
  }, [navigate])

  const handleEditorCreated = useCallback((id: CollectionEntityId) => {
    navigate(`/collections/${id}`)
  }, [navigate])

  const handlePlaceAdded = useCallback(async (kind: FamilyListCatalogKind, entityId: string) => {
    if (!isRealCollectionId(activeId)) return
    try {
      await addFamilyListItem({ listId: String(activeId), kind, entityId })
      await reload()
      setShowAddPlace(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('common.error')))
    }
  }, [activeId, reload, toast, t])

  const listEditorAdapter: ListEditorAdapter = useMemo(() => ({
    createCollection: async (payload) => {
      if (!familyId) throw new Error('missing family')
      const vis: FamilyListVisibility = payload.visibility === 'family' ? 'family' : 'private'
      if (vis === 'family' && !canReview) throw new Error('not authorized')
      const id = await createFamilyList({
        familyId,
        name: payload.name,
        visibility: vis,
        description: payload.description,
        color: payload.color,
      })
      await reload()
      return { id }
    },
    updateCollection: async (id, payload) => {
      await updateFamilyList(String(id), {
        name: payload.name,
        description: payload.description,
        color: payload.color,
        visibility: payload.visibility,
        clearCover: payload.clearCover,
      })
      await reload()
    },
    uploadCover: async (id, file) => {
      if (!familyId) throw new Error('missing family')
      await uploadFamilyListCover({ familyId, listId: String(id), file })
      await reload()
    },
  }), [familyId, canReview, reload])

  const handleDeleteList = useCallback(async () => {
    if (confirmDeleteList == null) return
    const id = confirmDeleteList
    setConfirmDeleteList(null)
    try {
      await archiveFamilyList(String(id))
      await reload()
      if (activeId === id) navigate('/collections')
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('common.error')))
    }
  }, [confirmDeleteList, activeId, navigate, reload, toast, t])

  const handleStatusChange = useCallback(async (placeId: CollectionEntityId, status: CollectionStatus) => {
    try {
      await setFamilyListItemStatus(String(placeId), status)
      setAllPlaces(prev => prev.map(p => (p.id === placeId ? { ...p, status } : p)))
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('common.error')))
    }
  }, [toast, t])

  const handleDeletePlace = useCallback(async (placeId: CollectionEntityId) => {
    try {
      await removeFamilyListItem(String(placeId))
      setAllPlaces(prev => prev.filter(p => p.id !== placeId))
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('common.error')))
    }
  }, [toast, t])

  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.length === 0) return
    try {
      for (const id of selectedIds) await removeFamilyListItem(String(id))
      const drop = new Set(selectedIds.map(String))
      setAllPlaces(prev => prev.filter(p => !drop.has(String(p.id))))
      setSelectedIds([])
      setSelectMode(false)
      await reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('common.error')))
    }
  }, [selectedIds, reload, toast, t])

  const allVisibleSelected = visiblePlaces.length > 0 && visiblePlaces.every(p => selectedIds.includes(p.id))
  const handleSelectAll = useCallback(() => {
    setSelectedIds(allVisibleSelected ? [] : visiblePlaces.map(p => p.id))
  }, [allVisibleSelected, visiblePlaces])

  const toggleSelect = useCallback((id: CollectionEntityId) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const selectedPlace = useMemo(
    () => places.find(p => p.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  )
  const detailPlace = useMemo<Place | null>(
    () => (selectedPlace ? ({ ...selectedPlace, trip_id: 0 } as unknown as Place) : null),
    [selectedPlace],
  )
  const detailCategories = useMemo<Category[]>(() => [], [])
  const handleCloseDetail = useCallback(() => setSelectedPlaceId(null), [])
  const handleDetailStatus = useCallback((status: CollectionStatus) => {
    if (selectedPlaceId != null) handleStatusChange(selectedPlaceId, status)
  }, [selectedPlaceId, handleStatusChange])
  const handleDetailRemove = useCallback(async () => {
    if (selectedPlaceId == null) return
    await handleDeletePlace(selectedPlaceId)
    setSelectedPlaceId(null)
  }, [selectedPlaceId, handleDeletePlace])

  const openCopyForSelectedPlace = useCallback(() => {
    if (!familyId || !personId) {
      toast.error(t('dashboard.propose.missingPerson'))
      return
    }
    if (selectedPlaceId != null) setCopyIds([selectedPlaceId])
  }, [familyId, personId, selectedPlaceId, toast, t])

  const openCopyForSelection = useCallback(() => {
    if (!familyId || !personId) {
      toast.error(t('dashboard.propose.missingPerson'))
      return
    }
    if (selectedIds.length > 0) setCopyIds([...selectedIds])
  }, [familyId, personId, selectedIds, toast, t])

  const closeCopy = useCallback(() => setCopyIds(null), [])

  const handleCopyToTrip = useCallback(async (tripId: CollectionEntityId) => {
    const ids = copyIds ?? []
    if (!familyId || !personId) {
      toast.error(t('dashboard.propose.missingPerson'))
      throw new Error(t('dashboard.propose.missingPerson'))
    }
    try {
      const allowed = await canTripActionDirect(String(tripId), 'trip.places.manage')
      if (!allowed) {
        throw new Error(t('trip.explore.add.hofOnly'))
      }
      const tripPlaces = await listTripPlaces(String(tripId))
      const items = ids.map(id => allPlaces.find(p => String(p.id) === String(id))).filter(
        (p): p is FamilyCollectionPlace => p != null,
      )
      const res = await copyFamilyListPlacesToTrip({
        tripId: String(tripId),
        items,
        canMutate: true,
        tripPlaceIds: new Set(tripPlaces.map(p => p.id)),
      })
      if (selectMode) {
        setSelectedIds([])
        setSelectMode(false)
      }
      return res
    } catch (err) {
      const code = err && typeof err === 'object' ? (err as { code?: string }).code : undefined
      if (code === 'hofOnly' || (err instanceof Error && err.message === 'hofOnly')) {
        throw new Error(t('trip.explore.add.hofOnly'))
      }
      throw err
    }
  }, [allPlaces, copyIds, familyId, personId, selectMode, t, toast])

  const noop = useCallback(async () => undefined, [])
  const noopArg = useCallback(async (_a?: unknown, _b?: unknown) => undefined, [])

  return {
    t, language, dark, navigate,
    isWide, heroRef: hero.ref, heroHeight: hero.height,
    listColRef: listCol.ref, listColRect: listCol.rect, categories: [] as Category[],
    collections: collectionViews, ownedLists, sharedLists,
    activeCollection: activeCollection ? asCollection(activeCollection) : null,
    isAllSaved, isOwner,
    myRole: isOwner ? 'owner' as const : (visibility === 'family' ? 'editor' as const : null),
    canEdit, canDelete, canAdminList,
    canShare, shareMemberCount: 0,
    familyChrome: true as const,
    canSetFamilyVisible: canReview,
    listEditorAdapter,
    excludeByKind,
    activeId, places, visiblePlaces, mappable, members: [], incomingInvites: [], counts,
    view, statusFilter, categoryFilter, categoryOptions, search, selectedPlaceId, selectMode, selectedIds,
    labels: [], labelFilter, labelOptions,
    loading, placesLoading,
    setView, setStatusFilter, setCategoryFilter, setLabelFilter, setSearch, setSelectedPlaceId, setSelectMode, toggleSelect,
    updatePlace: noopArg,
    showLabelManager: false, setShowLabelManager: () => undefined, labelPickerOpen: false, setLabelPickerOpen: () => undefined,
    handleCreateLabel: noopArg, handleUpdateLabel: noopArg as (labelId: number, body: CollectionLabelUpdateRequest) => Promise<void>,
    handleDeleteLabel: noopArg, handleBulkAssignLabels: noopArg, handleAssignPlaceLabels: noopArg,
    editorTarget, setEditorTarget, handleEditorCreated,
    showAddPlace, setShowAddPlace, handlePlaceAdded: handlePlaceAdded as unknown as () => void,
    handleCatalogPick: handlePlaceAdded,
    confirmDeleteList, setConfirmDeleteList,
    mobileRailOpen, setMobileRailOpen,
    showShare: false, setShowShare: () => undefined, handleAfterLeave: () => undefined,
    selectedPlace, detailPlace, detailCategories, handleCloseDetail,
    handleDetailStatus, handleDetailRemove,
    copyIds,
    openCopyForSelectedPlace, openCopyForSelection, closeCopy, handleCopyToTrip,
    handleSelectList, handleDeleteList,
    handleStatusChange, handleDeletePlace, handleDeleteSelected,
    handleAcceptInvite: noopArg, handleDeclineInvite: noopArg,
    allVisibleSelected, handleSelectAll,
    listPickerMode: null as 'move' | 'copy' | null, setListPickerMode: () => undefined, handleMoveToList: noopArg, handleDuplicateToList: noopArg,
  }
}

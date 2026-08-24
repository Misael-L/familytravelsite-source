import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Layout/Navbar'
import SlidingTabs from '../components/shared/SlidingTabs'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import { MapViewAuto as MapView } from '../components/Map/MapViewAuto'
import PoiCategoryPill from '../components/Map/PoiCategoryPill'
import { useWorkspacePois } from '../components/Map/useWorkspacePois'
import WorkspaceMapActionDial, { FamilyCatalogStatusCapsule } from '../components/Map/WorkspaceMapActionDial'
import ExplorePoiCallout from '../components/Map/ExplorePoiCallout'
import ExplorePoiPartialCard from '../components/Map/ExplorePoiPartialCard'
import type { Poi } from '../components/Map/poiCategories'
import { parseCatalogPoiRef } from '../lib/map/catalogPoiRef'
import { findPlaceFootprint, type PlaceFootprintFeature } from '../lib/map/placeFootprints'
import { Compass, FolderOpen, ListChecks, Map as MapIcon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RefreshCw, Ticket, Train, Wallet, X } from 'lucide-react'
import TripWorkspaceExplorePanel from '../components/Explore/TripWorkspaceExplorePanel'
import {
  catalogPoiKindToExploreKind,
  type ExploreDeepLink,
} from '../data/supabase/catalogExploreLists'
import { fetchTripById } from '../data/supabase/trips'
import {
  payloadDayNote,
  payloadExpenseUpsert,
  payloadPlanItem,
  payloadRemoveMarker,
  payloadReservationUpsert,
  payloadTripPlaceAdd,
  payloadTripPlaceRemove,
  targetTableForModule,
} from '../data/supabase/tripChangeRequests'
import {
  deleteTripPlace,
  listTripPlaces,
  upsertTripPlace,
  type FamilyTripPlace,
} from '../data/supabase/tripPlaces'
import {
  deleteTripTrack,
  listTripTracks,
  type FamilyTripTrack,
} from '../data/supabase/tripTracks'
import { tracksToRecordedGeojson } from '../lib/tracks/recordedTracksGeojson'
import { listTripDays, syncTripDays, updateTripDayTitle, type FamilyTripDay } from '../data/supabase/tripDays'
import { listTripCountryIds } from '../data/supabase/catalogPlaces'
import {
  civilDayToUtcMidnightIso,
  deleteScheduleItem,
  groupScheduleByCivilDay,
  insertScheduleItem,
  listScheduleItems,
  plannedPlaceIds as plannedIdsFromSchedule,
  updateScheduleSortOrders,
  type FamilyScheduleItem,
} from '../data/supabase/scheduleItems'
import {
  deleteDayNote,
  listDayNotes,
  notesByCivilDay as groupNotesByCivilDay,
  upsertDayNote,
  type FamilyDayNote,
} from '../data/supabase/dayNotes'
import type { FamilyDashboardTrip } from './dashboard/familyDashboardModel'
import { useToast } from '../components/shared/Toast'
import { useSettingsStore } from '../store/settingsStore'
import { useTranslation } from '../i18n'
import { useResizablePanels } from '../hooks/useResizablePanels'
import { usePlannerHistory } from '../hooks/usePlannerHistory'
import type { MapMarkerPlace } from '../components/Map/mapMarkerPlace'
import FamilyDayPlanSidebar from '../components/Planner/family/FamilyDayPlanSidebar'
import FamilyPlacesSidebar from '../components/Planner/family/FamilyPlacesSidebar'
import FamilyTrackImportModal from '../components/Planner/family/FamilyTrackImportModal'
import FamilyPlaceInspector from '../components/Planner/family/FamilyPlaceInspector'
import FamilyCatalogPlacePicker from '../components/Planner/family/FamilyCatalogPlacePicker'
import FamilyDayPicker from '../components/Planner/family/FamilyDayPicker'
import FamilyDayNoteSheet from '../components/Planner/family/FamilyDayNoteSheet'
import WorkspaceGovernanceChrome from '../components/Planner/family/WorkspaceGovernanceChrome'
import { useFamilyTripWorkspaceGovernance } from './familyTripWorkspace/useFamilyTripWorkspaceGovernance'
import { useFamilyWorkspacePlaceCategories } from './familyTripWorkspace/useFamilyWorkspacePlaceCategories'
import { pinToMarker } from './familyTripWorkspace/workspacePlaceCategoryModel'
import FamilyPlaceCategoryPicker from '../components/Planner/family/FamilyPlaceCategoryPicker'
import CostsPanelFamily from '../components/Budget/CostsPanelFamily'
import BookingsPanelFamily from '../components/Planner/BookingsPanelFamily'
import TransportsPanelFamily, { type TransportCreateRequest } from '../components/Planner/TransportsPanelFamily'
import ListsPanelFamily from '../components/Todo/ListsPanelFamily'
import FilesPanelFamily from '../components/Files/FilesPanelFamily'
import type { FamilyExpensePrefill } from '../data/supabase/tripReservations'
import { useAuthStore } from '../store/authStore'
import { useFamilyFeatureStore } from '../store/familyFeatureStore'

type WorkspaceTab = 'plan' | 'explore' | 'transports' | 'buchungen' | 'lists' | 'finanzplan' | 'files'

async function settled<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await promise }
  } catch {
    return { ok: false }
  }
}

type FamilyToastWriteKind = 'edit' | 'import' | 'export' | 'reorder'

/**
 * W5 supabase workspace — TREK Plan/Places rails + schedule_items assign loop.
 * Nest TripPlannerNestPage stays on the nest plane.
 */
export default function FamilyTripWorkspaceShell(): React.ReactElement | null {
  const { id: tripId = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useTranslation()
  const mapTileUrl = useSettingsStore(s => s.settings.map_tile_url)
  const mapProvider = useSettingsStore(s => s.settings.map_provider)
  const mapboxToken = useSettingsStore(s => s.settings.mapbox_access_token)
  const poiPillEnabled = useSettingsStore(s => s.settings.map_poi_pill_enabled) !== false
  const [placeFootprint, setPlaceFootprint] = useState<PlaceFootprintFeature | null>(null)
  const [selectedExplorePoi, setSelectedExplorePoi] = useState<Poi | null>(null)
  const [partialExplorePoi, setPartialExplorePoi] = useState<Poi | null>(null)
  const [exploreCalloutPos, setExploreCalloutPos] = useState<{ x: number; y: number } | null>(null)
  const [glMapEpoch, setGlMapEpoch] = useState(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const glMapRef = useRef<any | null>(null)
  const { pushUndo, undo, canUndo, lastActionLabel } = usePlannerHistory()

  const {
    leftWidth, rightWidth, leftCollapsed, rightCollapsed,
    setLeftCollapsed, setRightCollapsed, startResizeLeft, startResizeRight,
  } = useResizablePanels()

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const [trip, setTrip] = useState<FamilyDashboardTrip | null>(null)
  const [places, setPlaces] = useState<FamilyTripPlace[]>([])
  const [tracks, setTracks] = useState<FamilyTripTrack[]>([])
  const [days, setDays] = useState<FamilyTripDay[]>([])
  const [scheduleItems, setScheduleItems] = useState<FamilyScheduleItem[]>([])
  const [dayNotes, setDayNotes] = useState<FamilyDayNote[]>([])
  const [countryIds, setCountryIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [partialLoadError, setPartialLoadError] = useState(false)
  const [loadNonce, setLoadNonce] = useState(0)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [fitKey, setFitKey] = useState(0)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<'left' | 'right' | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [trackImportOpen, setTrackImportOpen] = useState(false)
  const [pendingDeleteTrackId, setPendingDeleteTrackId] = useState<string | null>(null)
  const [dayPickerPlaceId, setDayPickerPlaceId] = useState<string | null>(null)
  const [noteDayId, setNoteDayId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingRemoveItemId, setPendingRemoveItemId] = useState<string | null>(null)
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('plan')
  const [pendingExploreDeepLink, setPendingExploreDeepLink] = useState<ExploreDeepLink | null>(null)
  const [expensePrefill, setExpensePrefill] = useState<FamilyExpensePrefill | null>(null)
  const [transportCreateRequest, setTransportCreateRequest] = useState<TransportCreateRequest | null>(null)

  const placeCentroids = useMemo(
    () => places
      .filter((p): p is FamilyTripPlace & { lat: number; lng: number } =>
        p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map(p => ({ lat: p.lat, lng: p.lng })),
    [places],
  )
  const workspacePois = useWorkspacePois({ placeCentroids })

  const selectedExplorePoiRef = useRef(selectedExplorePoi)
  selectedExplorePoiRef.current = selectedExplorePoi

  const projectExploreCallout = useCallback((poi: Poi | null) => {
    const map = glMapRef.current
    if (!poi || !map || typeof map.project !== 'function') {
      setExploreCalloutPos(null)
      return
    }
    try {
      const p = map.project([poi.lng, poi.lat])
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        setExploreCalloutPos({ x: p.x, y: p.y })
      } else {
        setExploreCalloutPos(null)
      }
    } catch {
      setExploreCalloutPos(null)
    }
  }, [])

  useEffect(() => {
    projectExploreCallout(selectedExplorePoi)
  }, [selectedExplorePoi, projectExploreCallout])

  useEffect(() => {
    const map = glMapRef.current
    if (!map || !selectedExplorePoi) return
    const onMove = () => projectExploreCallout(selectedExplorePoi)
    map.on?.('move', onMove)
    map.on?.('zoom', onMove)
    projectExploreCallout(selectedExplorePoi)
    return () => {
      map.off?.('move', onMove)
      map.off?.('zoom', onMove)
    }
  }, [selectedExplorePoi, projectExploreCallout, glMapEpoch])

  useEffect(() => {
    if (!selectedExplorePoi && !partialExplorePoi) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (partialExplorePoi) setPartialExplorePoi(null)
        else setSelectedExplorePoi(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedExplorePoi, partialExplorePoi])

  useEffect(() => {
    if (activeTab !== 'plan') {
      setSelectedExplorePoi(null)
      setPartialExplorePoi(null)
    }
    if (activeTab !== 'explore') {
      setPendingExploreDeepLink(null)
    }
  }, [activeTab])

  const openExplorePartial = useCallback((poi: Poi) => {
    setSelectedExplorePoi(null)
    setPartialExplorePoi(poi)
  }, [])

  const personId = useAuthStore(s => s.personId)
  const categoriesEnabled = useFamilyFeatureStore(s => s.isEnabled('workspace.place_categories'))

  const reloadPlaces = useCallback(async () => {
    if (!tripId) return
    const next = await listTripPlaces(tripId)
    setPlaces(next)
    setFitKey(k => k + 1)
  }, [tripId])

  const reloadNotes = useCallback(async () => {
    if (!tripId) return
    setDayNotes(await listDayNotes(tripId))
  }, [tripId])

  const reloadTracks = useCallback(async () => {
    if (!tripId) return
    const next = await listTripTracks(tripId)
    setTracks(next)
    setFitKey(k => k + 1)
  }, [tripId])

  const reloadSchedule = useCallback(async () => {
    if (!tripId) return
    const next = await listScheduleItems(tripId)
    setScheduleItems(next)
  }, [tripId])

  const [publishedSliceEpoch, setPublishedSliceEpoch] = useState(0)
  const reloadItinerary = useCallback(async () => {
    await Promise.all([reloadPlaces(), reloadSchedule(), reloadNotes()])
    setPublishedSliceEpoch(n => n + 1)
  }, [reloadPlaces, reloadSchedule, reloadNotes])

  const gov = useFamilyTripWorkspaceGovernance({
    tripId,
    personId,
    enabled: Boolean(tripId),
    onAfterPublish: reloadItinerary,
  })
  const canMutate = gov.canMutate
  const canEditPublished = gov.canEditPublished
  const placesMode = gov.writeModeFor('trip.places.manage')
  const scheduleMode = gov.writeModeFor('trip.schedule.manage')
  const reservationsMode = gov.writeModeFor('trip.reservations.manage')
  const costsMode = gov.writeModeFor('trip.costs.manage')
  const settleDirect = gov.writeModeFor('trip.costs.settle') === 'direct'
  const packingDirect = gov.writeModeFor('trip.packing.manage') === 'direct'
  const todosDirect = gov.writeModeFor('trip.todos.manage') === 'direct'
  const filesUpload = gov.writeModeFor('trip.files.upload') === 'direct'
  const filesMetadata = gov.writeModeFor('trip.files.metadata') === 'direct'
  const filesTrash = gov.writeModeFor('trip.files.trash') === 'direct'
  const canUsePlaces = placesMode === 'direct' || placesMode === 'draft'
  const canUseSchedule = scheduleMode === 'direct' || scheduleMode === 'draft'
  const canUseReservations = reservationsMode === 'direct' || reservationsMode === 'draft'
  const canUseCosts = costsMode === 'direct' || costsMode === 'draft'

  const toastDenied = (
    kind: 'draftable' | 'publishedOnly' = 'draftable',
    mode: typeof placesMode = gov.writeMode,
  ) => {
    if (kind === 'publishedOnly') {
      if (canMutate && gov.layer === 'myDraft') toast.info(t('trip.governance.nudgePublished'))
      else toast.error(t('trip.explore.add.hofOnly'))
      return
    }
    if (mode === 'nudge') toast.info(t('trip.governance.nudgeDraft'))
    else toast.error(t('trip.governance.denied'))
  }

  const placeCategories = useFamilyWorkspacePlaceCategories({
    familyId: trip?.family_id ?? null,
    tripId,
    placesMode,
    canUsePlaces,
    nextSortOrder: gov.nextSortOrder,
    enabled: categoriesEnabled,
    addDraftOp: gov.addDraftOp,
    onPlacesPatched: (placeId, patch) => {
      setPlaces(prev => prev.map(p => (p.id === placeId ? patch(p) : p)))
    },
    onDenied: () => toastDenied('draftable', placesMode),
  })

  useEffect(() => {
    if (!tripId) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setPartialLoadError(false)

    const daysP = syncTripDays(tripId)
      .catch(() => undefined)
      .then(() => settled(listTripDays(tripId)))

    Promise.all([
      fetchTripById(tripId),
      listTripPlaces(tripId),
      daysP,
      settled(listScheduleItems(tripId)),
      settled(listDayNotes(tripId)),
      settled(listTripCountryIds(tripId)),
      settled(listTripTracks(tripId)),
    ])
      .then(([found, tripPlaces, tripDays, schedule, notes, countries, tripTracks]) => {
        if (cancelled) return
        if (!found) {
          toast.error(t('trip.toast.notFound'))
          navigate('/dashboard')
          return
        }
        const partial = !tripDays.ok || !schedule.ok || !notes.ok || !countries.ok || !tripTracks.ok
        setTrip(found)
        setPlaces(tripPlaces)
        setTracks(tripTracks.ok ? tripTracks.value : [])
        setDays(tripDays.ok ? tripDays.value : [])
        setScheduleItems(schedule.ok ? schedule.value : [])
        setDayNotes(notes.ok ? notes.value : [])
        setCountryIds(countries.ok ? countries.value : [])
        setFitKey(k => k + 1)
        setPartialLoadError(partial)
        if (partial) toast.error(t('trip.toast.loadPartial'))
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(t('trip.toast.loadFailed'))
          navigate('/dashboard')
        }
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [tripId, loadNonce]) // eslint-disable-line react-hooks/exhaustive-deps -- stable load key only

  useEffect(() => {
    if (gov.mutateGateError) toast.error(t('trip.toast.mutateGateError'))
  }, [gov.mutateGateError]) // eslint-disable-line react-hooks/exhaustive-deps

  const mapPlaces = useMemo(
    () => places.map(p => pinToMarker(p, { categoriesEnabled })).filter((p): p is MapMarkerPlace => p != null),
    [places, categoriesEnabled],
  )
  const recordedTracks = useMemo(() => tracksToRecordedGeojson(tracks), [tracks])
  const tripPlaceIds = useMemo(() => places.map(p => p.id), [places])
  const selectedPlace = useMemo(
    () => places.find(p => p.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  )

  useEffect(() => {
    let cancelled = false
    if (!selectedPlace?.name) {
      setPlaceFootprint(null)
      workspacePois.updatePlaceFocus({ name: null, hasBoundary: false, feature: null })
      return
    }
    void findPlaceFootprint(selectedPlace.name).then(f => {
      if (cancelled) return
      setPlaceFootprint(f)
      workspacePois.updatePlaceFocus({
        name: selectedPlace.name,
        hasBoundary: f != null,
        feature: f,
      })
    })
    return () => { cancelled = true }
    // updatePlaceFocus is stable enough via hook; depend on selection identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlace?.name, selectedPlace?.id])

  const excludeIds = useMemo(() => places.map(p => p.id), [places])
  const placesById = useMemo(() => {
    const m = new Map<string, FamilyTripPlace>()
    for (const p of places) m.set(p.id, p)
    return m
  }, [places])
  const itemsByDayId = useMemo(
    () => groupScheduleByCivilDay(scheduleItems, days),
    [scheduleItems, days],
  )
  const notesByDay = useMemo(
    () => groupNotesByCivilDay(dayNotes),
    [dayNotes],
  )
  const noteDay = useMemo(
    () => days.find(d => d.id === noteDayId) ?? null,
    [days, noteDayId],
  )
  const noteExisting = useMemo(
    () => (noteDay ? notesByDay.get(noteDay.civilDay) ?? null : null),
    [noteDay, notesByDay],
  )
  const noteDayIndexLabel = useMemo(() => {
    if (!noteDay) return 1
    const sorted = [...days].sort((a, b) => a.dayIndex - b.dayIndex)
    const idx = sorted.findIndex(d => d.id === noteDay.id)
    return idx >= 0 ? idx + 1 : noteDay.dayIndex + 1
  }, [days, noteDay])
  const plannedPlaceIdSet = useMemo(
    () => plannedIdsFromSchedule(scheduleItems),
    [scheduleItems],
  )

  const dayPlaces = useMemo(() => {
    if (!selectedDayId) return [] as MapMarkerPlace[]
    const items = itemsByDayId.get(selectedDayId) ?? []
    const markers: MapMarkerPlace[] = []
    for (const item of items) {
      if (!item.placeId) continue
      const place = placesById.get(item.placeId)
      if (!place) continue
      const m = pinToMarker(place, { categoriesEnabled })
      if (m) markers.push(m)
    }
    return markers
  }, [selectedDayId, itemsByDayId, placesById, categoriesEnabled])

  const dayOrderMap = useMemo(() => {
    const map: Record<string, number[]> = {}
    if (!selectedDayId) return map
    const items = itemsByDayId.get(selectedDayId) ?? []
    items.forEach((item, idx) => {
      if (!item.placeId) return
      const list = map[item.placeId] ?? []
      list.push(idx + 1)
      map[item.placeId] = list
    })
    return map
  }, [selectedDayId, itemsByDayId])

  const toastWrite = (kind?: FamilyToastWriteKind) => {
    if (kind === 'import') toast.error(t('trip.toast.importLater'))
    else if (kind === 'export') toast.error(t('trip.toast.exportLater'))
    else if (kind === 'reorder') toast.error(t('trip.toast.reorderDaysLater'))
    else toast.error(t('trip.toast.editPlaceLater'))
  }
  const toastShare = () => toast.error(t('trip.toast.shareLater'))
  const consumeExpensePrefill = useCallback(() => setExpensePrefill(null), [])

  const requestDelete = (placeId: string) => {
    if (!canUsePlaces) { toastDenied('draftable', placesMode); return }
    setPendingDeleteId(placeId)
  }

  const confirmDelete = async () => {
    if (!tripId || !pendingDeleteId) return
    const id = pendingDeleteId
    try {
      if (placesMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'trip_place',
          op: 'remove',
          payload: payloadTripPlaceRemove(id),
          targetTable: targetTableForModule('trip_place'),
          targetId: id,
          sortOrder: gov.nextSortOrder,
        })
        if (ok) toast.success(t('trip.governance.stagedRemove'))
        return
      }
      await deleteTripPlace(tripId, id)
      setPlaces(prev => prev.filter(p => p.id !== id))
      setScheduleItems(prev => prev.filter(s => s.placeId !== id))
      if (selectedPlaceId === id) setSelectedPlaceId(null)
      setFitKey(k => k + 1)
    } catch {
      toast.error('Could not remove this place')
    } finally {
      setPendingDeleteId(null)
    }
  }

  const openTrackImport = () => {
    if (!canEditPublished) { toastDenied('publishedOnly'); return }
    setTrackImportOpen(true)
  }

  const requestDeleteTrack = (trackId: string) => {
    if (!canEditPublished) { toastDenied('publishedOnly'); return }
    setPendingDeleteTrackId(trackId)
  }

  const confirmDeleteTrack = async () => {
    if (!pendingDeleteTrackId) return
    const id = pendingDeleteTrackId
    try {
      await deleteTripTrack(id)
      setTracks(prev => prev.filter(tr => tr.id !== id))
      setFitKey(k => k + 1)
    } catch {
      toast.error(t('places.importFileError'))
    } finally {
      setPendingDeleteTrackId(null)
    }
  }

  const openAddPlace = () => {
    if (!canUsePlaces) { toastDenied('draftable', placesMode); return }
    setPickerOpen(true)
  }

  const handlePickCatalog = async (placeId: string) => {
    if (!tripId) return
    if (!canUsePlaces) { toastDenied('draftable', placesMode); return }
    try {
      if (placesMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'trip_place',
          op: 'add',
          payload: payloadTripPlaceAdd(placeId),
          targetTable: targetTableForModule('trip_place'),
          sortOrder: gov.nextSortOrder,
        })
        if (ok) {
          toast.success(t('trip.governance.staged'))
          setPickerOpen(false)
          setMobileSidebarOpen(null)
        }
        return
      }
      const inserted = await upsertTripPlace(tripId, placeId)
      if (!inserted) {
        toast.info('That place is already on this trip')
        setPickerOpen(false)
        return
      }
      await reloadPlaces()
      setSelectedPlaceId(placeId)
      setPickerOpen(false)
      setMobileSidebarOpen(null)
    } catch {
      toast.error('Could not add this place')
    }
  }

  const assignPlaceToDay = useCallback(async (placeId: string, dayId: string) => {
    if (!tripId) return
    if (!canUseSchedule) { toastDenied('draftable', scheduleMode); return }
    const place = places.find(p => p.id === placeId)
    const day = days.find(d => d.id === dayId)
    if (!place || !day) {
      toast.error('Could not assign this place')
      return
    }
    const dayItems = itemsByDayId.get(dayId) ?? []
    if (dayItems.some(i => i.placeId === placeId)) {
      toast.info('That place is already on this day')
      setDayPickerPlaceId(null)
      return
    }
    const sortOrder = dayItems.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1
    const startsAt = civilDayToUtcMidnightIso(day.civilDay)
    try {
      if (scheduleMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'plan_item',
          op: 'add',
          payload: payloadPlanItem({
            activity: place.name,
            placeId,
            startsAt,
            sortOrder,
          }),
          tripDayId: day.id,
          civilDate: day.civilDay,
          targetTable: targetTableForModule('plan_item'),
          sortOrder: gov.nextSortOrder,
        })
        if (ok) {
          toast.success(t('trip.governance.staged'))
          setDayPickerPlaceId(null)
        }
        return
      }
      const created = await insertScheduleItem({
        tripId,
        activity: place.name,
        placeId,
        startsAt,
        sortOrder,
      })
      setScheduleItems(prev => [...prev, created])
      pushUndo(t('undo.assignPlace'), async () => {
        await deleteScheduleItem(created.id)
        setScheduleItems(prev => prev.filter(s => s.id !== created.id))
      })
      setSelectedDayId(dayId)
      setDayPickerPlaceId(null)
      toast.success('Place assigned to day')
    } catch {
      toast.error('Could not assign this place')
    }
  }, [tripId, canUseSchedule, gov, places, days, itemsByDayId, pushUndo, t, toast, scheduleMode])

  const requestAssignToDay = (placeId: string) => {
    if (!canUseSchedule) { toastDenied('draftable', scheduleMode); return }
    if (days.length === 0) {
      toast.error('This trip has no days yet')
      return
    }
    if (selectedDayId) {
      void assignPlaceToDay(placeId, selectedDayId)
      return
    }
    setDayPickerPlaceId(placeId)
  }

  const requestRemoveItem = (itemId: string) => {
    if (!canUseSchedule) { toastDenied('draftable', scheduleMode); return }
    setPendingRemoveItemId(itemId)
  }

  const confirmRemoveItem = async () => {
    if (!pendingRemoveItemId) return
    const item = scheduleItems.find(s => s.id === pendingRemoveItemId)
    if (!item) {
      setPendingRemoveItemId(null)
      return
    }
    try {
      if (scheduleMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'plan_item',
          op: 'remove',
          payload: payloadRemoveMarker(),
          targetTable: targetTableForModule('plan_item'),
          targetId: item.id,
          sortOrder: gov.nextSortOrder,
        })
        if (ok) toast.success(t('trip.governance.stagedRemove'))
        return
      }
      await deleteScheduleItem(item.id)
      setScheduleItems(prev => prev.filter(s => s.id !== item.id))
      pushUndo(t('undo.removeAssignment'), async () => {
        if (!tripId) return
        const restored = await insertScheduleItem({
          tripId,
          activity: item.activity,
          placeId: item.placeId,
          address: item.address,
          startsAt: item.startsAt,
          sortOrder: item.sortOrder,
          experienceId: item.experienceId,
          foodId: item.foodId,
          linkUrl: item.linkUrl,
        })
        setScheduleItems(prev => [...prev, restored])
      })
      toast.success('Removed from day')
    } catch {
      toast.error('Could not remove from day')
    } finally {
      setPendingRemoveItemId(null)
    }
  }

  const moveItem = async (dayId: string, itemId: string, direction: -1 | 1) => {
    if (!canUseSchedule) { toastDenied('draftable', scheduleMode); return }
    const dayItems = [...(itemsByDayId.get(dayId) ?? [])]
    const idx = dayItems.findIndex(i => i.id === itemId)
    const target = idx + direction
    if (idx < 0 || target < 0 || target >= dayItems.length) return
    const previous = dayItems.map(i => ({ id: i.id, sortOrder: i.sortOrder }))
    const ordered = dayItems.map(i => i.id)
    ;[ordered[idx], ordered[target]] = [ordered[target], ordered[idx]]
    const updates = ordered.map((id, sortOrder) => ({ id, sortOrder }))
    try {
      if (scheduleMode === 'draft') {
        let sort = gov.nextSortOrder
        for (const u of updates) {
          const current = dayItems.find(i => i.id === u.id)
          if (!current || current.sortOrder === u.sortOrder) continue
          const ok = await gov.addDraftOp({
            module: 'plan_item',
            op: 'update',
            payload: payloadPlanItem({
              activity: current.activity,
              placeId: current.placeId,
              startsAt: current.startsAt,
              sortOrder: u.sortOrder,
              experienceId: current.experienceId,
              foodId: current.foodId,
            }),
            targetTable: targetTableForModule('plan_item'),
            targetId: u.id,
            sortOrder: sort,
          })
          if (!ok) return
          sort += 1
        }
        toast.success(t('trip.governance.stagedUpdate'))
        return
      }
      await updateScheduleSortOrders(updates)
      setScheduleItems(prev => prev.map(s => {
        const u = updates.find(x => x.id === s.id)
        return u ? { ...s, sortOrder: u.sortOrder } : s
      }))
      pushUndo(t('undo.reorder'), async () => {
        await updateScheduleSortOrders(previous)
        setScheduleItems(prev => prev.map(s => {
          const u = previous.find(x => x.id === s.id)
          return u ? { ...s, sortOrder: u.sortOrder } : s
        }))
      })
    } catch {
      toast.error('Could not reorder')
    }
  }

  const saveDayTitle = async (dayId: string, title: string | null) => {
    if (!canEditPublished) { toastDenied('publishedOnly'); return }
    try {
      await updateTripDayTitle(dayId, title)
      setDays(prev => prev.map(d => (d.id === dayId ? { ...d, title } : d)))
    } catch {
      toast.error('Could not update day title')
    }
  }

  const saveNote = async (body: string) => {
    if (!tripId || !noteDay) return
    if (!canUseSchedule) { toastDenied('draftable', scheduleMode); return }
    try {
      if (scheduleMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'day_note',
          op: noteExisting ? 'update' : 'add',
          payload: payloadDayNote({ body, icon: noteExisting?.icon ?? null, sortOrder: noteExisting?.sortOrder ?? 0 }),
          tripDayId: noteDay.id,
          civilDate: noteDay.civilDay,
          targetTable: targetTableForModule('day_note'),
          targetId: noteExisting?.id ?? null,
          sortOrder: gov.nextSortOrder,
        })
        if (ok) {
          toast.success(t('trip.governance.staged'))
          setNoteDayId(null)
        }
        return
      }
      const saved = await upsertDayNote({
        tripId,
        civilDay: noteDay.civilDay,
        body,
        noteId: noteExisting?.id ?? null,
      })
      setDayNotes(prev => {
        const withoutId = prev.filter(n => n.id !== saved.id)
        if (noteExisting) return [...withoutId, saved]
        return [...withoutId.filter(n => n.civilDay !== saved.civilDay), saved]
      })
      setNoteDayId(null)
      toast.success(t('common.saved'))
    } catch {
      toast.error('Could not save note')
    }
  }

  const confirmDeleteNote = async () => {
    if (!pendingDeleteNoteId) return
    const id = pendingDeleteNoteId
    try {
      if (scheduleMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'day_note',
          op: 'remove',
          payload: payloadRemoveMarker(),
          targetTable: targetTableForModule('day_note'),
          targetId: id,
          sortOrder: gov.nextSortOrder,
        })
        if (ok) toast.success(t('trip.governance.stagedRemove'))
        return
      }
      await deleteDayNote(id)
      setDayNotes(prev => prev.filter(n => n.id !== id))
      setNoteDayId(null)
      toast.success('Note deleted')
    } catch {
      toast.error('Could not delete note')
    } finally {
      setPendingDeleteNoteId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-surface" style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="text-content" style={{ fontSize: 18, fontWeight: 600 }}>Loading trip…</div>
      </div>
    )
  }
  if (!trip) return null

  const railLeft = isMobile || leftCollapsed ? 0 : leftWidth
  const railRight = isMobile || rightCollapsed ? 0 : rightWidth
  const showMapboxHint = mapProvider === 'mapbox-gl' && !mapboxToken
  const hasInspector = !!selectedPlace

  const planSidebar = (
    <FamilyDayPlanSidebar
      tripId={tripId}
      tripTitle={trip.title}
      days={days}
      itemsByDayId={itemsByDayId}
      placesById={placesById}
      notesByCivilDay={notesByDay}
      selectedDayId={selectedDayId}
      onSelectDay={setSelectedDayId}
      onRemoveItem={requestRemoveItem}
      onMoveItem={(dayId, itemId, dir) => { void moveItem(dayId, itemId, dir) }}
      onOpenNote={(day) => setNoteDayId(day.id)}
      onSaveTitle={(dayId, title) => { void saveDayTitle(dayId, title) }}
      canMutate={canUseSchedule}
      onToastWrite={toastWrite}
      onOpenTransport={(opts) => {
        if (!canEditPublished) {
          toastDenied('publishedOnly')
          return
        }
        setTransportCreateRequest(opts)
        setActiveTab('transports')
      }}
      isMobile={isMobile}
      canUndo={canUndo}
      onUndo={() => { void undo() }}
      lastActionLabel={lastActionLabel}
    />
  )
  const placesSidebar = (
    <FamilyPlacesSidebar
      places={places}
      tracks={tracks}
      plannedPlaceIds={plannedPlaceIdSet}
      selectedPlaceId={selectedPlaceId}
      canMutate={canUsePlaces}
      onSelectPlace={(id) => {
        setSelectedPlaceId(id)
        if (isMobile && id) setMobileSidebarOpen(null)
      }}
      onAddPlace={openAddPlace}
      onDeletePlace={requestDelete}
      onAssignToDay={requestAssignToDay}
      onImportFile={openTrackImport}
      onDeleteTrack={requestDeleteTrack}
      onEditPlace={categoriesEnabled ? placeCategories.openPicker : () => {}}
      onToastWrite={toastWrite}
      isMobile={isMobile}
      categories={placeCategories.palette}
      categoriesEnabled={categoriesEnabled}
    />
  )

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Navbar
        tripTitle={trip.title}
        tripId={tripId}
        showBack
        onBack={() => navigate('/dashboard')}
        onShare={toastShare}
      />

      {partialLoadError && (
        <div
          role="alert"
          className="bg-surface-card text-content border border-edge"
          style={{
            position: 'fixed',
            top: 'calc(var(--nav-h) + 52px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 90,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            borderRadius: 12,
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
            maxWidth: 'min(520px, calc(100% - 24px))',
            fontFamily: 'var(--font-system)',
          }}
        >
          <span style={{ flex: 1, fontSize: 13 }}>{t('trip.load.partialBanner')}</span>
          <button
            type="button"
            onClick={() => setLoadNonce(n => n + 1)}
            className="bg-accent text-accent-text"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              border: 'none', borderRadius: 8, padding: '6px 10px',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={13} />
            {t('trip.load.retry')}
          </button>
        </div>
      )}

      <div className="bg-surface-elevated border-b border-edge-faint" style={{
        position: 'fixed', top: 'var(--nav-h)', left: 0, right: 0, zIndex: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 12px', height: 44,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      }}>
        <SlidingTabs
          tabs={[
            { id: 'plan' as const, label: <span className="hidden sm:inline">{t('trip.tabs.plan')}</span>, title: 'Map', icon: MapIcon },
            { id: 'explore' as const, label: <span className="hidden sm:inline">{t('trip.tabs.explore')}</span>, title: 'Explore', icon: Compass },
            { id: 'transports' as const, label: <span className="hidden sm:inline">{t('trip.tabs.transports')}</span>, title: t('trip.tabs.transports'), icon: Train },
            { id: 'buchungen' as const, label: <span className="hidden sm:inline">{t('trip.tabs.reservationsShort')}</span>, title: t('trip.tabs.reservationsShort'), icon: Ticket },
            { id: 'lists' as const, label: <span className="hidden sm:inline">{t('trip.tabs.lists')}</span>, title: t('trip.tabs.lists'), icon: ListChecks },
            { id: 'finanzplan' as const, label: <span className="hidden sm:inline">{t('trip.tabs.budget')}</span>, title: 'Costs', icon: Wallet },
            { id: 'files' as const, label: <span className="hidden sm:inline">{t('trip.tabs.files')}</span>, title: t('trip.tabs.files'), icon: FolderOpen },
          ]}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as WorkspaceTab)}
        />
      </div>

      {activeTab === 'plan' ? (
        <div
          data-testid="workspace-map-top-chrome"
          style={{
            position: 'fixed',
            top: 'calc(var(--nav-h) + 52px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 45,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: 8,
            width: 'min(560px, calc(100% - 24px))',
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto', width: '100%' }}>
            <WorkspaceGovernanceChrome style="mapFloating" gov={gov} />
          </div>
          {poiPillEnabled && (
            <div
              className="hidden md:flex"
              style={{ flexDirection: 'column', alignItems: 'center', alignSelf: 'center', gap: 8 }}
            >
              {workspacePois.usesFamilyCatalog && <FamilyCatalogStatusCapsule />}
              <PoiCategoryPill
                active={workspacePois.active}
                onToggle={workspacePois.toggle}
                loadingKeys={workspacePois.loadingKeys}
                errorKeys={workspacePois.errorKeys}
                moved={workspacePois.moved}
                onSearchArea={workspacePois.searchArea}
                showNearbyToggle={workspacePois.showNearbyToggle}
                allowNearby={workspacePois.allowNearby}
                onNearbyChange={workspacePois.setAllowNearby}
                disabled={!workspacePois.isExploreEnabled}
                boundaryComingSoon={workspacePois.showBoundaryComingSoon}
              />
            </div>
          )}
        </div>
      ) : (
        <div style={{
          position: 'fixed',
          top: 'calc(var(--nav-h) + 44px)',
          left: 0,
          right: 0,
          zIndex: 39,
          padding: '6px 12px',
        }}>
          <WorkspaceGovernanceChrome style="inset" gov={gov} />
        </div>
      )}

      {activeTab === 'explore' && (
        <div style={{ position: 'fixed', top: 'calc(var(--nav-h) + 100px)', left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          <TripWorkspaceExplorePanel
            tripId={tripId}
            countryIds={countryIds}
            pendingDeepLink={pendingExploreDeepLink}
            onConsumeDeepLink={() => setPendingExploreDeepLink(null)}
            canMutate={placesMode === 'direct'}
            writeMode={placesMode}
            writeModeFor={(kind) => {
              if (kind === 'place') return placesMode
              if (kind === 'hotel') return reservationsMode
              return scheduleMode
            }}
            nextSortOrder={gov.nextSortOrder}
            stageOp={gov.addDraftOp}
            tripPlaceIds={tripPlaceIds}
            days={days}
            scheduleItems={scheduleItems}
            onItineraryChanged={reloadItinerary}
            familyId={trip.family_id}
            personId={personId}
          />
        </div>
      )}

      {activeTab === 'transports' && (
        <div style={{ position: 'fixed', top: 'calc(var(--nav-h) + 100px)', left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          <TransportsPanelFamily
            tripId={tripId}
            canMutate={canEditPublished}
            familyId={trip.family_id}
            mePersonId={personId}
            days={days}
            places={places}
            scheduleItems={scheduleItems}
            currencyCode={trip.currency || 'EUR'}
            onOpenCostsPrefill={(prefill) => {
              setExpensePrefill(prefill)
              setActiveTab('finanzplan')
            }}
            createRequest={transportCreateRequest}
            onCreateRequestConsumed={() => setTransportCreateRequest(null)}
          />
        </div>
      )}

      {activeTab === 'buchungen' && (
        <div style={{ position: 'fixed', top: 'calc(var(--nav-h) + 100px)', left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          <BookingsPanelFamily
            key={`bookings-${publishedSliceEpoch}`}
            tripId={tripId}
            canMutate={canUseReservations}
            onStageDraft={reservationsMode === 'draft' ? async (draft) => gov.addDraftOp({
              module: 'reservation',
              op: draft.id ? 'update' : 'add',
              payload: payloadReservationUpsert(draft),
              tripDayId: draft.startTripDayId ?? null,
              targetTable: targetTableForModule('reservation'),
              targetId: draft.id ?? null,
              sortOrder: gov.nextSortOrder,
            }) : undefined}
            onStageDelete={reservationsMode === 'draft' ? async (id) => gov.addDraftOp({
              module: 'reservation',
              op: 'remove',
              payload: payloadRemoveMarker(),
              targetTable: targetTableForModule('reservation'),
              targetId: id,
              sortOrder: gov.nextSortOrder,
            }) : undefined}
            onStageStatus={reservationsMode === 'draft' ? async (id, status) => gov.addDraftOp({
              module: 'reservation',
              op: 'update',
              payload: { schema_version: 1, status },
              targetTable: targetTableForModule('reservation'),
              targetId: id,
              sortOrder: gov.nextSortOrder,
            }) : undefined}
            familyId={trip.family_id}
            mePersonId={personId}
            days={days}
            places={places}
            scheduleItems={scheduleItems}
            currencyCode={trip.currency || 'EUR'}
            onOpenCostsPrefill={(prefill) => {
              setExpensePrefill(prefill)
              setActiveTab('finanzplan')
            }}
          />
        </div>
      )}

      {activeTab === 'lists' && (
        <div style={{ position: 'fixed', top: 'calc(var(--nav-h) + 100px)', left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          <ListsPanelFamily
            tripId={tripId}
            familyId={trip.family_id}
            canMutate={packingDirect}
            canMutatePacking={packingDirect}
            canMutateTodos={todosDirect}
            mePersonId={personId}
          />
        </div>
      )}

      {activeTab === 'finanzplan' && (
        <div style={{ position: 'fixed', top: 'calc(var(--nav-h) + 100px)', left: 0, right: 0, bottom: 0, overflowY: 'auto' }}>
          <CostsPanelFamily
            key={`costs-${publishedSliceEpoch}`}
            tripId={tripId}
            currencyCode={trip.currency || 'EUR'}
            canMutate={settleDirect}
            canEditExpenses={canUseCosts}
            mePersonId={personId}
            prefill={expensePrefill}
            onPrefillConsumed={consumeExpensePrefill}
            onStageExpense={costsMode === 'draft' ? async (draft) => gov.addDraftOp({
              module: 'expense',
              op: draft.id ? 'update' : 'add',
              payload: payloadExpenseUpsert(draft),
              targetTable: targetTableForModule('expense'),
              targetId: draft.id ?? null,
              sortOrder: gov.nextSortOrder,
            }) : undefined}
            onStageDeleteExpense={costsMode === 'draft' ? async (id) => gov.addDraftOp({
              module: 'expense',
              op: 'remove',
              payload: payloadRemoveMarker(),
              targetTable: targetTableForModule('expense'),
              targetId: id,
              sortOrder: gov.nextSortOrder,
            }) : undefined}
          />
        </div>
      )}

      {activeTab === 'files' && (
        <div style={{ position: 'fixed', top: 'calc(var(--nav-h) + 100px)', left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          <FilesPanelFamily
            tripId={tripId}
            familyId={trip.family_id}
            canMutate={filesUpload || filesMetadata || filesTrash}
            canUpload={filesUpload}
            canEditMetadata={filesMetadata}
            canTrash={filesTrash}
            mePersonId={personId}
            places={places}
            days={days}
            scheduleItems={scheduleItems}
          />
        </div>
      )}

      <div style={{ position: 'fixed', top: 'calc(var(--nav-h) + 44px)', left: 0, right: 0, bottom: 0, overflow: 'hidden', display: activeTab === 'plan' ? undefined : 'none' }}>
        {showMapboxHint && (
          <div role="status" style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 30,
            padding: '8px 12px', borderRadius: 8, fontSize: 12,
            background: 'var(--surface, #fff)', border: '1px solid var(--edge-faint, #e2e8f0)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}>
            Mapbox token unset — using Leaflet. Set VITE_MAPBOX_ACCESS_TOKEN for Mapbox GL.
          </div>
        )}

        <div style={{ position: 'absolute', inset: 0 }}>
          <MapView
            tripId={tripId}
            places={mapPlaces}
            dayPlaces={dayPlaces}
            route={null}
            recordedTracks={recordedTracks}
            showTransitRoutes={false}
            routeSegments={[]}
            selectedPlaceId={selectedPlaceId}
            onMarkerClick={(id: string | number) => {
              setSelectedExplorePoi(null)
              setPartialExplorePoi(null)
              setSelectedPlaceId(String(id))
            }}
            onMapClick={() => {
              setSelectedPlaceId(null)
              setSelectedExplorePoi(null)
              setPartialExplorePoi(null)
            }}
            tileUrl={mapTileUrl}
            fitKey={fitKey}
            dayOrderMap={dayOrderMap}
            leftWidth={railLeft}
            rightWidth={railRight}
            hasInspector={hasInspector && !isMobile}
            hasDayDetail={false}
            reservations={[]}
            showReservationStats={false}
            visibleConnectionIds={[]}
            pois={workspacePois.pois}
            onViewportChange={workspacePois.onViewportChange}
            placeFootprint={placeFootprint}
            onPoiClick={(poi: Poi) => {
              setSelectedPlaceId(null)
              // Second click on the same pin while callout is open → partial (W8.2 polish).
              if (
                selectedExplorePoi
                && !partialExplorePoi
                && selectedExplorePoi.osm_id === poi.osm_id
              ) {
                openExplorePartial(poi)
                return
              }
              setPartialExplorePoi(null)
              setSelectedExplorePoi(poi)
            }}
            onMapReady={(map: unknown) => {
              glMapRef.current = map
              setGlMapEpoch(n => n + 1)
              projectExploreCallout(selectedExplorePoiRef.current)
            }}
          />
          {selectedExplorePoi && exploreCalloutPos && !partialExplorePoi && (
            <ExplorePoiCallout
              poi={selectedExplorePoi}
              screenPos={exploreCalloutPos}
              onDismiss={() => setSelectedExplorePoi(null)}
              onOpenPartial={() => openExplorePartial(selectedExplorePoi)}
            />
          )}
          {partialExplorePoi && (
            <ExplorePoiPartialCard
              poi={partialExplorePoi}
              familyId={trip.family_id}
              personId={personId}
              onDismiss={() => setPartialExplorePoi(null)}
              onOpenExplore={() => {
                const catalog = parseCatalogPoiRef(partialExplorePoi.osm_id)
                if (catalog) {
                  setPendingExploreDeepLink({
                    kind: catalogPoiKindToExploreKind(catalog.kind),
                    id: catalog.id,
                  })
                  setPartialExplorePoi(null)
                  setActiveTab('explore')
                } else if (partialExplorePoi.source === 'catalog') {
                  setPartialExplorePoi(null)
                  setActiveTab('explore')
                } else {
                  toast.info('Explore opens Family Catalog places.')
                }
              }}
            />
          )}
        </div>

        {poiPillEnabled && (
          <div
            className="hidden md:block"
            style={{
              position: 'absolute',
              left: 14 + railLeft,
              bottom: 20,
              zIndex: 25,
              pointerEvents: 'none',
            }}
          >
            <WorkspaceMapActionDial
              usesFamilyCatalog={workspacePois.usesFamilyCatalog}
              onToggleCatalog={() => workspacePois.setUsesFamilyCatalog(!workspacePois.usesFamilyCatalog)}
            />
          </div>
        )}

        <div className="hidden md:block" style={{ position: 'absolute', left: 10, top: 10, bottom: 10, zIndex: 20 }}>
          <button
            type="button"
            onClick={() => setLeftCollapsed(c => !c)}
            aria-label={leftCollapsed ? 'Expand plan panel' : 'Collapse plan panel'}
            style={{
              position: leftCollapsed ? 'fixed' : 'absolute',
              top: leftCollapsed ? 'calc(var(--nav-h) + 44px + 14px)' : 14,
              left: leftCollapsed ? 10 : undefined,
              right: leftCollapsed ? undefined : -28,
              zIndex: -1,
              width: 36, height: 36, borderRadius: leftCollapsed ? 10 : '0 10px 10px 0',
              background: leftCollapsed ? '#000' : 'var(--sidebar-bg)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              boxShadow: leftCollapsed ? '0 2px 12px rgba(0,0,0,0.2)' : 'none', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: leftCollapsed ? '#fff' : 'var(--text-faint)', transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (!leftCollapsed) e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { if (!leftCollapsed) e.currentTarget.style.color = 'var(--text-faint)' }}
          >
            {leftCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <div style={{
            width: leftCollapsed ? 0 : leftWidth, height: '100%',
            background: 'var(--sidebar-bg)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: leftCollapsed ? 'none' : 'var(--sidebar-shadow)',
            borderRadius: 16,
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            transition: 'width 0.25s ease',
            opacity: leftCollapsed ? 0 : 1,
          }}>
            {planSidebar}
            {!leftCollapsed && (
              <div
                onMouseDown={startResizeLeft}
                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', background: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              />
            )}
          </div>
        </div>

        <div className="hidden md:block" style={{ position: 'absolute', right: 10, top: 10, bottom: 10, zIndex: 20 }}>
          <button
            type="button"
            onClick={() => setRightCollapsed(c => !c)}
            aria-label={rightCollapsed ? 'Expand places panel' : 'Collapse places panel'}
            style={{
              position: rightCollapsed ? 'fixed' : 'absolute',
              top: rightCollapsed ? 'calc(var(--nav-h) + 44px + 14px)' : 14,
              right: rightCollapsed ? 10 : undefined,
              left: rightCollapsed ? undefined : -28,
              zIndex: -1,
              width: 36, height: 36, borderRadius: rightCollapsed ? 10 : '10px 0 0 10px',
              background: rightCollapsed ? '#000' : 'var(--sidebar-bg)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              boxShadow: rightCollapsed ? '0 2px 12px rgba(0,0,0,0.2)' : 'none', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: rightCollapsed ? '#fff' : 'var(--text-faint)', transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (!rightCollapsed) e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { if (!rightCollapsed) e.currentTarget.style.color = 'var(--text-faint)' }}
          >
            {rightCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
          <div style={{
            width: rightCollapsed ? 0 : rightWidth, height: '100%',
            background: 'var(--sidebar-bg)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: rightCollapsed ? 'none' : 'var(--sidebar-shadow)',
            borderRadius: 16,
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            transition: 'width 0.25s ease',
            opacity: rightCollapsed ? 0 : 1,
          }}>
            {!rightCollapsed && (
              <div
                onMouseDown={startResizeRight}
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', background: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              />
            )}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingLeft: 4 }}>
              {placesSidebar}
            </div>
          </div>
        </div>

        {!mobileSidebarOpen && !pickerOpen && !dayPickerPlaceId && ReactDOM.createPortal(
          <div className="flex md:hidden" style={{ position: 'fixed', top: 'calc(var(--nav-h) + 44px + 12px)', left: 12, right: 12, justifyContent: 'space-between', zIndex: 100, pointerEvents: 'none' }}>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen('left')}
              className="bg-surface-card text-content border border-edge"
              style={{ pointerEvents: 'auto', backdropFilter: 'blur(12px)', borderRadius: 24, padding: '11px 24px', fontSize: 'calc(15px * var(--fs-scale-subtitle, 1))', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', minHeight: 44, fontFamily: 'inherit', touchAction: 'manipulation' }}
            >
              {t('trip.mobilePlan')}
            </button>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen('right')}
              className="bg-surface-card text-content border border-edge"
              style={{ pointerEvents: 'auto', backdropFilter: 'blur(12px)', borderRadius: 24, padding: '11px 24px', fontSize: 'calc(15px * var(--fs-scale-subtitle, 1))', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', minHeight: 44, fontFamily: 'inherit', touchAction: 'manipulation' }}
            >
              {t('trip.mobilePlaces')}
            </button>
          </div>,
          document.body,
        )}

        {selectedPlace && !isMobile && (
          <FamilyPlaceInspector
            place={selectedPlace}
            tripId={tripId}
            familyId={trip.family_id}
            canMutate={canUsePlaces || canUseSchedule}
            mePersonId={personId}
            onClose={() => setSelectedPlaceId(null)}
            onDelete={() => requestDelete(selectedPlace.id)}
            onAssignToDay={() => requestAssignToDay(selectedPlace.id)}
            onEdit={categoriesEnabled ? () => placeCategories.openPicker(selectedPlace.id) : undefined}
            categoriesEnabled={categoriesEnabled}
            onToastWrite={toastWrite}
            leftWidth={railLeft}
            rightWidth={railRight}
          />
        )}

        {selectedPlace && isMobile && ReactDOM.createPortal(
          <div
            className="bg-[rgba(0,0,0,0.3)]"
            style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 'var(--bottom-nav-h)' }}
            onClick={() => setSelectedPlaceId(null)}
          >
            <div style={{ width: '100%', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
              <FamilyPlaceInspector
                place={selectedPlace}
                tripId={tripId}
                familyId={trip.family_id}
                canMutate={canUsePlaces || canUseSchedule}
                mePersonId={personId}
                onClose={() => setSelectedPlaceId(null)}
                onDelete={() => requestDelete(selectedPlace.id)}
                onAssignToDay={() => requestAssignToDay(selectedPlace.id)}
                onEdit={categoriesEnabled ? () => placeCategories.openPicker(selectedPlace.id) : undefined}
                categoriesEnabled={categoriesEnabled}
                onToastWrite={toastWrite}
                leftWidth={0}
                rightWidth={0}
                mobile
              />
            </div>
          </div>,
          document.body,
        )}

        {mobileSidebarOpen && ReactDOM.createPortal(
          <div className="bg-[rgba(0,0,0,0.3)]" style={{ position: 'fixed', inset: 0, zIndex: 9999 }} onClick={() => setMobileSidebarOpen(null)}>
            <div className="bg-surface-card" style={{ position: 'absolute', top: 'var(--nav-h)', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
              <div className="border-b border-edge-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
                <span className="text-content" style={{ fontWeight: 600, fontSize: 'calc(14px * var(--fs-scale-body, 1))' }}>
                  {mobileSidebarOpen === 'left' ? t('trip.mobilePlan') : t('trip.mobilePlaces')}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(null)}
                  className="bg-surface-tertiary text-content"
                  aria-label={t('common.close')}
                  style={{ border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={14} />
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                {mobileSidebarOpen === 'left' ? planSidebar : placesSidebar}
              </div>
            </div>
          </div>,
          document.body,
        )}
      </div>

      <FamilyCatalogPlacePicker
        open={pickerOpen}
        tripCountryIds={countryIds}
        excludeIds={excludeIds}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickCatalog}
      />

      {categoriesEnabled && (
      <FamilyPlaceCategoryPicker
        open={Boolean(placeCategories.pickerPlaceId)}
        categories={placeCategories.palette}
        selectedCategoryId={places.find(p => p.id === placeCategories.pickerPlaceId)?.familyPlaceCategoryId ?? null}
        placeName={places.find(p => p.id === placeCategories.pickerPlaceId)?.name ?? ''}
        onClose={placeCategories.closePicker}
        onSelect={(categoryId) => {
          const placeId = placeCategories.pickerPlaceId
          if (!placeId) return
          void placeCategories.assignCategory(placeId, categoryId).then(result => {
            if (result === 'direct') {
              toast.success(categoryId ? t('trip.toast.categoryAssigned') : t('trip.toast.categoryCleared'))
            } else if (result === 'draft') {
              toast.success(t('trip.governance.stagedUpdate'))
            } else if (result === 'error') {
              toast.error(t('places.saveError'))
            }
          })
        }}
      />
      )}

      <FamilyDayPicker
        open={!!dayPickerPlaceId}
        days={days}
        onClose={() => setDayPickerPlaceId(null)}
        onPick={(dayId) => {
          if (dayPickerPlaceId) void assignPlaceToDay(dayPickerPlaceId, dayId)
        }}
      />

      <ConfirmDialog
        isOpen={!!pendingDeleteId}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => { void confirmDelete() }}
        title={t('common.confirm')}
        message={t('trip.confirm.deletePlace')}
        confirmLabel={t('common.delete')}
        danger
      />

      <ConfirmDialog
        isOpen={!!pendingDeleteTrackId}
        onClose={() => setPendingDeleteTrackId(null)}
        onConfirm={() => { void confirmDeleteTrack() }}
        title={t('places.deleteTrack')}
        message={t('places.confirmDeleteTrack')}
        confirmLabel={t('common.delete')}
        danger
      />

      <FamilyTrackImportModal
        isOpen={trackImportOpen}
        onClose={() => setTrackImportOpen(false)}
        tripId={tripId}
        personId={personId}
        onImported={() => { void reloadTracks() }}
      />

      <ConfirmDialog
        isOpen={!!pendingRemoveItemId}
        onClose={() => setPendingRemoveItemId(null)}
        onConfirm={() => { void confirmRemoveItem() }}
        title={t('common.confirm')}
        message={t('inspector.removeFromDay')}
        confirmLabel={t('common.delete')}
        danger
      />

      <FamilyDayNoteSheet
        open={!!noteDay && !pendingDeleteNoteId}
        day={noteDay}
        dayIndexLabel={noteDayIndexLabel}
        existing={noteExisting}
        canMutate={canUseSchedule}
        onClose={() => setNoteDayId(null)}
        onSave={(body) => { void saveNote(body) }}
        onDelete={() => {
          if (!noteExisting) return
          setPendingDeleteNoteId(noteExisting.id)
        }}
      />

      <ConfirmDialog
        isOpen={!!pendingDeleteNoteId}
        onClose={() => setPendingDeleteNoteId(null)}
        onConfirm={() => { void confirmDeleteNote() }}
        title={t('dayplan.confirmDeleteNoteTitle')}
        message={t('dayplan.confirmDeleteNoteBody')}
        confirmLabel={t('common.delete')}
        danger
      />
    </div>
  )
}

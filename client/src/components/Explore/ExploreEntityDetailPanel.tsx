/**
 * W8.4–W8.6 Explore Catalog entity detail — hero + meta + Add to trip / purview + heart.
 * Phase 3: Bookmark (named lists) sits left of the heart; heart stays person_catalog_saves.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, Phone, ShieldAlert } from 'lucide-react'
import {
  exploreKindToMediaKind,
  fetchExploreCatalogDetail,
  type ExploreCatalogEntityDetail,
  type ExploreCatalogKind,
} from '../../data/supabase/catalogExploreLists'
import { listCatalogMediaUrlsForEntity, toDisplayImageUrl } from '../../data/supabase/catalogExploreMedia'
import {
  addCatalogHotelStayToTrip,
  addCatalogPlaceToTrip,
  addCatalogPlanItemToTrip,
  type AddToTripResult,
  type StageExploreOp,
} from '../../data/supabase/exploreAddToTrip'
import { isCatalogInPurview, purviewPlaceIdFor } from '../../data/supabase/explorePurview'
import type { FamilyScheduleItem } from '../../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import { usePrefetchHeroAround } from '../../lib/media/prefetchHeroImages'
import { useTranslation } from '../../i18n'
import { useToast } from '../shared/Toast'
import ConfirmDialog from '../shared/ConfirmDialog'
import FamilyDayPicker from '../Planner/family/FamilyDayPicker'
import ExploreHotelStayDialog from './ExploreHotelStayDialog'
import CatalogSaveHeartButton from './CatalogSaveHeartButton'
import CatalogAddToListButton from './CatalogAddToListButton'
import { useCatalogSave } from './useCatalogSave'
import { useCatalogListMembership } from './useCatalogListMembership'
import { useSaveToCollectionStore } from '../../store/saveToCollectionStore'
import { useCollectionsEnabled } from '../../store/familyFeatureStore'

const HERO_H = 280

const KIND_ACCENT: Record<ExploreCatalogKind, string> = {
  place: '#0ea5e9',
  experience: '#8b5cf6',
  food: '#f59e0b',
  hotel: '#10b981',
}

const KIND_LABEL_KEY: Record<ExploreCatalogKind, { key: string; fallback: string }> = {
  place: { key: 'trip.explore.kind.places', fallback: 'Places' },
  experience: { key: 'trip.explore.kind.experiences', fallback: 'Experiences' },
  food: { key: 'trip.explore.kind.foods', fallback: 'Foods' },
  hotel: { key: 'trip.explore.kind.hotels', fallback: 'Hotels' },
}

const ADD_ARIA: Record<ExploreCatalogKind, { key: string; fallback: string }> = {
  place: { key: 'trip.explore.add.aria.place', fallback: 'Add place to trip' },
  experience: { key: 'trip.explore.add.aria.experience', fallback: 'Add experience to trip plan' },
  food: { key: 'trip.explore.add.aria.food', fallback: 'Add food to trip plan' },
  hotel: { key: 'trip.explore.add.aria.hotel', fallback: 'Add hotel booking to trip' },
}

export type ExploreEntityDetailPanelProps = {
  kind: ExploreCatalogKind
  entityId: string
  onBack: () => void
  tripId: string
  canMutate: boolean
  writeMode?: 'direct' | 'draft' | 'nudge' | 'deny'
  nextSortOrder?: number
  stageOp?: StageExploreOp
  tripPlaceIds: readonly string[]
  days: FamilyTripDay[]
  scheduleItems: FamilyScheduleItem[]
  onItineraryChanged: () => Promise<void>
  familyId: string | null
  personId: string | null
}

export default function ExploreEntityDetailPanel({
  kind,
  entityId,
  onBack,
  tripId,
  canMutate,
  writeMode,
  nextSortOrder,
  stageOp,
  tripPlaceIds,
  days,
  scheduleItems,
  onItineraryChanged,
  familyId,
  personId,
}: ExploreEntityDetailPanelProps): React.ReactElement {
  const { t } = useTranslation()
  const toast = useToast()
  const tr = useCallback((key: string, fallback: string, params?: Record<string, string | number>) => {
    const v = t(key, params)
    return !v || v === key ? fallback : v
  }, [t])

  const backRef = useRef<HTMLButtonElement | null>(null)
  const [detail, setDetail] = useState<ExploreCatalogEntityDetail | null>(null)
  const [phase, setPhase] = useState<'loading' | 'loaded' | 'notFound' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [slide, setSlide] = useState(0)
  const [adding, setAdding] = useState(false)
  const [showDayPicker, setShowDayPicker] = useState(false)
  const [showHotel, setShowHotel] = useState(false)
  const [hotelConfirmed, setHotelConfirmed] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<'place' | 'plan' | 'hotel' | null>(null)
  const [pendingPlanDay, setPendingPlanDay] = useState<FamilyTripDay | null>(null)
  const loadGen = useRef(0)

  const writeModeResolved = writeMode ?? (canMutate ? 'direct' : 'deny')
  const canAdd = writeModeResolved === 'direct' || writeModeResolved === 'draft'
  const stageOpts = { writeMode: writeModeResolved, stageOp, nextSortOrder }

  const toastDenied = useCallback(() => {
    if (writeModeResolved === 'nudge') {
      toast.info(tr('trip.governance.nudgeDraft', 'Published plan is HOF-owned. Switch to My draft to explore and propose changes.'))
    } else {
      toast.error(tr('trip.explore.add.hofOnly', 'Only the family head can change published trip places'))
    }
  }, [toast, tr, writeModeResolved])
  const tripPlaceIdSet = useMemo(() => new Set(tripPlaceIds), [tripPlaceIds])
  const dialogOpen = pendingConfirm != null || showDayPicker || showHotel
  const collectionsEnabled = useCollectionsEnabled()
  const save = useCatalogSave({
    familyId,
    personId,
    kind,
    entityId,
    enabled: true,
  })
  const listMembership = useCatalogListMembership({
    familyId,
    kind,
    entityId,
    enabled: collectionsEnabled,
  })
  const openSaveToList = useSaveToCollectionStore(s => s.open)

  useEffect(() => {
    backRef.current?.focus()
  }, [kind, entityId])

  useEffect(() => {
    const gen = ++loadGen.current
    setPhase('loading')
    setError(null)
    setDetail(null)
    setImageUrls([])
    setSlide(0)
    setShowDayPicker(false)
    setShowHotel(false)
    setPendingConfirm(null)
    setPendingPlanDay(null)

    void fetchExploreCatalogDetail({ kind, id: entityId })
      .then(row => {
        if (gen !== loadGen.current) return
        if (!row) {
          setPhase('notFound')
          return
        }
        setDetail(row)
        setPhase('loaded')
      })
      .catch((err: unknown) => {
        if (gen !== loadGen.current) return
        setPhase('error')
        setError(err instanceof Error ? err.message : tr('trip.explore.detail.error', 'Something went wrong.'))
      })
  }, [kind, entityId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!detail) return
    const mediaKind = exploreKindToMediaKind(detail.kind)
    if (!mediaKind) {
      setImageUrls([])
      setMediaLoading(false)
      return
    }
    let cancelled = false
    setMediaLoading(true)
    setSlide(0)
    void listCatalogMediaUrlsForEntity(mediaKind, detail.id)
      .then(urls => {
        if (!cancelled) setImageUrls(urls)
      })
      .catch(() => {
        if (!cancelled) setImageUrls([])
      })
      .finally(() => {
        if (!cancelled) setMediaLoading(false)
      })
    return () => { cancelled = true }
  }, [detail])

  usePrefetchHeroAround(imageUrls, slide)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (dialogOpen) return
      e.preventDefault()
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, onBack])

  const retry = () => {
    setPhase('loading')
    setError(null)
    void fetchExploreCatalogDetail({ kind, id: entityId })
      .then(row => {
        if (!row) {
          setPhase('notFound')
          return
        }
        setDetail(row)
        setPhase('loaded')
      })
      .catch((err: unknown) => {
        setPhase('error')
        setError(err instanceof Error ? err.message : tr('trip.explore.detail.error', 'Something went wrong.'))
      })
  }

  const dayLabel = useCallback((day: FamilyTripDay) => {
    const sorted = [...days].sort((a, b) => a.dayIndex - b.dayIndex)
    const n = sorted.findIndex(d => d.id === day.id) + 1
    return day.title || t('dayplan.dayN', { n })
  }, [days, t])

  const applyResult = useCallback(async (
    result: AddToTripResult,
    success: { kind: 'place' | 'plan' | 'hotel'; day?: FamilyTripDay },
  ) => {
    if ('reason' in result) {
      if (result.reason === 'hofOnly') {
        toast.error(tr('trip.explore.add.hofOnly', 'Only the family head can change published trip places'))
      } else if (result.reason === 'switchToDraft') {
        toast.info(tr('trip.governance.nudgeDraft', 'Published plan is HOF-owned. Switch to My draft to explore and propose changes.'))
      } else if (result.reason === 'invalidDates') {
        toast.warning(tr('trip.explore.add.hotel.invalidDates', 'Check-out must be after check-in'))
      } else if (result.reason === 'noDays') {
        toast.warning(tr('trip.explore.add.noDays', 'Set trip dates in Plan before adding to a day'))
      } else if (result.reason === 'needsConfirm') {
        return
      } else {
        toast.error(result.message || tr('trip.explore.detail.error', 'Something went wrong.'))
      }
      return
    }
    if (result.outcome === 'already') {
      toast.info(
        success.kind === 'plan'
          ? tr('trip.explore.add.alreadyOnPlan', 'Already on this trip’s plan')
          : tr('trip.explore.add.alreadyOnTrip', 'Already on this trip'),
      )
      return
    }
    await onItineraryChanged().catch(() => undefined)
    if (result.outcome === 'drafted') {
      toast.success(tr('trip.governance.staged', 'Added to My draft'))
      return
    }
    if (success.kind === 'place' && detail) {
      toast.success(tr('trip.explore.add.addedPlace', `Added ${detail.name} to trip`, { name: detail.name }))
    } else if (success.kind === 'plan' && detail && success.day) {
      const kindWord = detail.kind === 'food'
        ? tr('trip.explore.add.kind.food', 'Food')
        : tr('trip.explore.add.kind.experience', 'Experience')
      toast.success(tr(
        'trip.explore.add.addedPlan',
        `${kindWord} added to ${dayLabel(success.day)}`,
        { kind: kindWord, day: dayLabel(success.day) },
      ))
    } else if (success.kind === 'hotel' && detail) {
      toast.success(tr('trip.explore.add.addedHotel', `Stay added for ${detail.name}`, { name: detail.name }))
    }
  }, [dayLabel, detail, onItineraryChanged, toast, tr])

  const runPlaceAdd = useCallback(async (confirmedOutOfPurview: boolean) => {
    if (!detail) return
    setAdding(true)
    try {
      const result = await addCatalogPlaceToTrip({
        tripId,
        placeId: detail.id,
        tripPlaceIds: tripPlaceIdSet,
        canMutate,
        confirmedOutOfPurview,
        ...stageOpts,
      })
      await applyResult(result, { kind: 'place' })
    } finally {
      setAdding(false)
    }
  }, [applyResult, canMutate, detail, stageOpts, tripId, tripPlaceIdSet])

  const runPlanAdd = useCallback(async (day: FamilyTripDay, confirmedOutOfPurview: boolean) => {
    if (!detail || (detail.kind !== 'experience' && detail.kind !== 'food')) return
    const outOfPurview = !isCatalogInPurview(detail.placeId, tripPlaceIdSet)
    if (outOfPurview && canAdd && !confirmedOutOfPurview) {
      setPendingPlanDay(day)
      setPendingConfirm('plan')
      return
    }
    setAdding(true)
    try {
      const result = await addCatalogPlanItemToTrip({
        tripId,
        kind: detail.kind,
        entityId: detail.id,
        name: detail.name,
        placeId: detail.placeId,
        address: detail.address,
        linkUrl: detail.linkUrl,
        day,
        scheduleItems,
        tripPlaceIds: tripPlaceIdSet,
        canMutate,
        confirmedOutOfPurview: confirmedOutOfPurview || !outOfPurview,
        ...stageOpts,
      })
      await applyResult(result, { kind: 'plan', day })
    } finally {
      setAdding(false)
    }
  }, [applyResult, canAdd, canMutate, detail, scheduleItems, stageOpts, tripId, tripPlaceIdSet])

  const runHotelAdd = useCallback(async (checkIn: string, checkOut: string, confirmedOutOfPurview: boolean) => {
    if (!detail || detail.kind !== 'hotel') return
    setAdding(true)
    try {
      const result = await addCatalogHotelStayToTrip({
        tripId,
        hotelId: detail.id,
        name: detail.name,
        placeId: detail.placeId,
        linkUrl: detail.linkUrl,
        checkIn,
        checkOut,
        days,
        tripPlaceIds: tripPlaceIdSet,
        canMutate,
        confirmedOutOfPurview,
        ...stageOpts,
      })
      await applyResult(result, { kind: 'hotel' })
      if (result.ok) setShowHotel(false)
    } finally {
      setAdding(false)
    }
  }, [applyResult, canMutate, days, detail, stageOpts, tripId, tripPlaceIdSet])

  const handleAddToTrip = useCallback(async () => {
    if (!detail || adding) return
    const purviewId = purviewPlaceIdFor(detail.kind, detail.id, detail.placeId)
    const outOfPurview = !isCatalogInPurview(purviewId, tripPlaceIdSet)

    if (detail.kind === 'place') {
      if (tripPlaceIdSet.has(detail.id)) {
        toast.info(tr('trip.explore.add.alreadyOnTrip', 'Already on this trip'))
        return
      }
      if (!canAdd) {
        toastDenied()
        return
      }
      if (outOfPurview) {
        setPendingConfirm('place')
        return
      }
      await runPlaceAdd(true)
      return
    }

    if (detail.kind === 'experience' || detail.kind === 'food') {
      if (days.length === 0) {
        toast.warning(tr('trip.explore.add.noDays', 'Set trip dates in Plan before adding to a day'))
        return
      }
      if (!canAdd) {
        toastDenied()
        return
      }
      if (days.length === 1) {
        await runPlanAdd(days[0], false)
        return
      }
      setShowDayPicker(true)
      return
    }

    if (!canAdd) {
      toastDenied()
      return
    }
    if (outOfPurview) {
      setPendingConfirm('hotel')
      return
    }
    setHotelConfirmed(false)
    setShowHotel(true)
  }, [adding, canAdd, days, detail, runPlaceAdd, runPlanAdd, toast, toastDenied, tr, tripPlaceIdSet])

  const confirmOutOfPurview = useCallback(() => {
    const which = pendingConfirm
    setPendingConfirm(null)
    if (which === 'place') void runPlaceAdd(true)
    if (which === 'plan' && pendingPlanDay) void runPlanAdd(pendingPlanDay, true)
    if (which === 'hotel') {
      setHotelConfirmed(true)
      setShowHotel(true)
    }
  }, [pendingConfirm, pendingPlanDay, runPlaceAdd, runPlanAdd])

  const accent = KIND_ACCENT[kind]
  const kindLabel = tr(KIND_LABEL_KEY[kind].key, KIND_LABEL_KEY[kind].fallback)
  const title = detail?.name ?? kindLabel
  const hasSlides = imageUrls.length > 0
  const current = hasSlides ? imageUrls[Math.min(slide, imageUrls.length - 1)] : null
  const coverOnly = !hasSlides && detail?.coverUrl ? toDisplayImageUrl(detail.coverUrl) : null
  const heroSrc = current || coverOnly

  const purviewId = detail ? purviewPlaceIdFor(detail.kind, detail.id, detail.placeId) : null
  const outOfPurview = detail ? !isCatalogInPurview(purviewId, tripPlaceIdSet) : false

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-grouped, var(--surface, #f8fafc))',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid var(--edge-faint, #e2e8f0)',
          background: 'var(--bg-grouped, var(--surface, #f8fafc))',
          flexShrink: 0,
        }}
      >
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          aria-label={tr('trip.explore.detail.back', 'Back')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid var(--edge-faint, #e2e8f0)',
            background: 'var(--bg-card, #fff)',
            cursor: 'pointer',
            color: 'var(--text-primary, #111)',
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <h1
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--text-primary, #111)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
        >
          {title}
        </h1>
        {collectionsEnabled && (
        <CatalogAddToListButton
          onAnyList={listMembership.onAnyList}
          disabled={!familyId || !personId}
          onClick={() => {
            if (!familyId || !personId) {
              toast.error(t('dashboard.propose.missingPerson'))
              return
            }
            openSaveToList({
              name: title,
              catalog_kind: kind,
              catalog_entity_id: entityId,
            })
          }}
        />
        )}
        <CatalogSaveHeartButton
          isSaved={save.isSaved}
          busy={save.busy}
          disabled={!familyId || !personId}
          onToggle={save.toggle}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {phase === 'loading' && (
          <div
            role="status"
            style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary, #64748b)', fontSize: 14 }}
          >
            {tr('trip.explore.detail.loading', 'Loading…')}
          </div>
        )}

        {phase === 'error' && (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)', marginBottom: 12 }}>
              {error ?? tr('trip.explore.detail.error', 'Something went wrong.')}
            </p>
            <button
              type="button"
              onClick={retry}
              style={{
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--accent, #2563eb)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {tr('trip.explore.detail.retry', 'Try again')}
            </button>
          </div>
        )}

        {phase === 'notFound' && (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #111)', margin: '0 0 8px' }}>
              {tr('trip.explore.detail.notFoundTitle', 'Not found')}
            </p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)', margin: 0 }}>
              {tr('trip.explore.detail.notFoundBody', 'This catalog item could not be found.')}
            </p>
          </div>
        )}

        {phase === 'loaded' && detail && (
          <>
            <div
              style={{
                position: 'relative',
                height: HERO_H,
                background: accent,
                overflow: 'hidden',
              }}
            >
              {mediaLoading && !heroSrc ? (
                <div
                  role="status"
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 14,
                  }}
                >
                  {tr('trip.explore.detail.loading', 'Loading…')}
                </div>
              ) : heroSrc ? (
                <img
                  src={heroSrc}
                  alt=""
                  decoding="async"
                  fetchPriority="high"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div
                  aria-hidden
                  style={{
                    height: '100%',
                    background: `linear-gradient(145deg, ${accent} 0%, #111827 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MapPin size={48} color="rgba(255,255,255,0.85)" strokeWidth={1.5} />
                </div>
              )}

              {(detail.typeLabel || kindLabel) && (
                <div
                  style={{
                    position: 'absolute',
                    left: 12,
                    bottom: 12,
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#fff',
                      background: 'rgba(15,23,42,0.45)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    {detail.typeLabel || kindLabel}
                  </span>
                </div>
              )}

              {hasSlides && imageUrls.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label={tr('trip.explore.detail.prevPhoto', 'Previous photo')}
                    onClick={() => setSlide(s => (s - 1 + imageUrls.length) % imageUrls.length)}
                    style={navBtnStyle('left')}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label={tr('trip.explore.detail.nextPhoto', 'Next photo')}
                    onClick={() => setSlide(s => (s + 1) % imageUrls.length)}
                    style={navBtnStyle('right')}
                  >
                    <ChevronRight size={18} />
                  </button>
                  <div
                    role="tablist"
                    aria-label={tr('trip.explore.detail.photos', 'Photos')}
                    style={{
                      position: 'absolute',
                      bottom: 12,
                      right: 12,
                      display: 'flex',
                      gap: 5,
                    }}
                  >
                    {imageUrls.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        role="tab"
                        aria-selected={i === slide}
                        aria-label={`${tr('trip.explore.detail.photo', 'Photo')} ${i + 1}`}
                        onClick={() => setSlide(i)}
                        style={{
                          width: i === slide ? 16 : 6,
                          height: 6,
                          borderRadius: 999,
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          background: i === slide ? '#fff' : 'rgba(255,255,255,0.5)',
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--text-primary, #111)',
                    lineHeight: 1.25,
                  }}
                >
                  {detail.name}
                </h2>
                {detail.typeLabel && (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>
                    {detail.typeLabel}
                  </p>
                )}
              </div>

              {detail.address && (
                <MetaRow icon={<MapPin size={16} aria-hidden />}>
                  {detail.address}
                </MetaRow>
              )}

              {detail.phone && (
                <MetaRow icon={<Phone size={16} aria-hidden />}>
                  <a href={`tel:${detail.phone.replace(/\s+/g, '')}`} style={linkStyle}>
                    {detail.phone}
                  </a>
                </MetaRow>
              )}

              {detail.linkUrl && (
                <MetaRow icon={<ExternalLink size={16} aria-hidden />}>
                  <a
                    href={detail.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkStyle}
                  >
                    {tr('trip.explore.detail.openLink', 'Open link')}
                  </a>
                </MetaRow>
              )}

              {detail.notes && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: 'var(--text-primary, #111)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {detail.notes}
                </p>
              )}

              {outOfPurview && (
                <div
                  role="status"
                  aria-label={
                    canMutate
                      ? tr('trip.explore.add.banner.hofA11y', 'Outside proposal purview; will expand trip destinations')
                      : tr('trip.explore.add.banner.nonHofA11y', 'Outside proposal purview; requires Admin or Patriarch approval')
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: 12,
                    borderRadius: 12,
                    background: 'color-mix(in srgb, var(--accent, #2563eb) 12%, transparent)',
                  }}
                >
                  <ShieldAlert size={16} aria-hidden style={{ marginTop: 2, flexShrink: 0, color: 'var(--accent, #2563eb)' }} />
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--text-secondary, #64748b)' }}>
                    {canMutate
                      ? tr(
                        'trip.explore.add.banner.hof',
                        'This sits outside the purview of the minted proposal and will expand trip destinations.',
                      )
                      : tr(
                        'trip.explore.add.banner.nonHof',
                        'This sits outside the purview of the minted proposal and will require approval from the Admin(s)/Pat.',
                      )}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => { void handleAddToTrip() }}
                disabled={adding}
                aria-busy={adding}
                aria-label={tr(ADD_ARIA[detail.kind].key, ADD_ARIA[detail.kind].fallback)}
                title={
                  outOfPurview
                    ? tr('trip.explore.add.hint.outOfPurview', 'Outside proposal purview; may require Admin or Patriarch approval')
                    : tr('trip.explore.add.hint.inPurview', 'Adds this catalog item to the current trip itinerary')
                }
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: adding ? 'wait' : 'pointer',
                  fontSize: 15,
                  fontWeight: 650,
                  fontFamily: 'inherit',
                  background: '#111827',
                  color: '#fff',
                  opacity: adding ? 0.7 : 1,
                }}
              >
                {adding
                  ? tr('trip.explore.add.adding', 'Adding…')
                  : tr('trip.explore.add.cta', 'Add to trip')}
              </button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={pendingConfirm != null}
        onClose={() => { setPendingConfirm(null); setPendingPlanDay(null) }}
        onConfirm={confirmOutOfPurview}
        danger={false}
        title={tr('trip.explore.add.confirm.title', 'Add outside purview?')}
        message={tr(
          'trip.explore.add.confirm.body',
          'This sits outside the minted proposal and will expand trip destinations. Add it to the published trip?',
        )}
        confirmLabel={tr('trip.explore.add.confirm.action', 'Add to trip')}
        cancelLabel={t('common.cancel')}
      />

      <FamilyDayPicker
        open={showDayPicker}
        days={days}
        title={tr('trip.explore.add.chooseDay', 'Choose day')}
        onClose={() => setShowDayPicker(false)}
        onPick={(dayId) => {
          setShowDayPicker(false)
          const day = days.find(d => d.id === dayId)
          if (day) void runPlanAdd(day, false)
        }}
      />

      <ExploreHotelStayDialog
        open={showHotel}
        hotelName={detail?.name ?? ''}
        days={days}
        busy={adding}
        onClose={() => setShowHotel(false)}
        onSave={(checkIn, checkOut) => {
          void runHotelAdd(checkIn, checkOut, hotelConfirmed || !outOfPurview)
        }}
      />
    </div>
  )
}

function MetaRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>
      <span style={{ marginTop: 2, flexShrink: 0, color: 'var(--text-secondary, #64748b)' }}>{icon}</span>
      <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{children}</span>
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  color: 'var(--accent, #2563eb)',
  textDecoration: 'underline',
  wordBreak: 'break-all',
}

function navBtnStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    [side]: 8,
    transform: 'translateY(-50%)',
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(15,23,42,0.45)',
    color: '#fff',
    cursor: 'pointer',
  }
}

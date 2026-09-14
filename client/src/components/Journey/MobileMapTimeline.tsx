import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { Plus } from 'lucide-react'
import JourneyMapAuto, { type JourneyMapAutoHandle } from './JourneyMapAuto'
import MobileEntryCard from './MobileEntryCard'
import EmptyState from '../shared/EmptyState'
import type { JourneyEntry } from '../../store/journeyStore'
import { DAY_COLORS } from './dayColors'
import { prefersReducedMotion } from './mobileJourneyModel'
import { useTranslation } from '../../i18n'

interface MapEntry {
  id: string
  lat: number
  lng: number
  title?: string | null
  mood?: string | null
  entry_date: string
}

interface Props {
  entries: JourneyEntry[] | any[]
  mapEntries: MapEntry[]
  trail?: { lat: number; lng: number }[]
  dark?: boolean
  readOnly?: boolean
  publicMap?: boolean
  onEntryClick: (entry: any) => void
  onAddEntry?: () => void
  publicPhotoUrl?: (photoId: number) => string
  carouselBottom?: string
}

function AddEntryFab({
  onAddEntry,
  label,
  bottom,
}: {
  onAddEntry: () => void
  label: string
  bottom: string
}) {
  return (
    <div className="fixed right-4 z-30" style={{ bottom }}>
      <button
        type="button"
        aria-label={label}
        onClick={onAddEntry}
        className="w-12 h-12 rounded-full bg-inverse text-inverse-text shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform touch-manipulation"
      >
        <Plus size={20} />
      </button>
    </div>
  )
}

export default function MobileMapTimeline({
  entries,
  mapEntries,
  trail,
  dark,
  readOnly,
  publicMap,
  onEntryClick,
  onAddEntry,
  publicPhotoUrl,
  carouselBottom = 'calc(var(--bottom-nav-h, 84px) + 8px)',
}: Props) {
  const { t } = useTranslation()
  const mapRef = useRef<JourneyMapAutoHandle>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const entryDayMeta = useMemo(() => {
    const uniqueDates = [...new Set(entries.map((e: any) => e.entry_date).sort())]
    const counters = new Map<string, number>()
    return entries.map((e: any) => {
      const dayIdx = uniqueDates.indexOf(e.entry_date)
      const dayLabel = (counters.get(e.entry_date) ?? 0) + 1
      counters.set(e.entry_date, dayLabel)
      return { dayLabel, dayColor: DAY_COLORS[dayIdx % DAY_COLORS.length] }
    })
  }, [entries])
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const syncMapToCarousel = useCallback((index: number) => {
    const entry = entries[index]
    if (!entry) return

    const mapEntry = mapEntries.find(m => String(m.id) === String(entry.id))
    if (mapEntry) {
      try { mapRef.current?.focusMarker(String(mapEntry.id)) } catch {}
    } else {
      try { mapRef.current?.highlightMarker(null) } catch {}
    }
  }, [entries, mapEntries])

  const pickNearestCard = useCallback(() => {
    const el = carouselRef.current
    if (!el) return
    const containerCenter = el.getBoundingClientRect().left + el.clientWidth / 2
    let bestIdx = 0
    let bestDist = Infinity
    cardRefs.current.forEach((node, idx) => {
      const r = node.getBoundingClientRect()
      const cardCenter = r.left + r.width / 2
      const d = Math.abs(cardCenter - containerCenter)
      if (d < bestDist) { bestDist = d; bestIdx = idx }
    })
    setActiveIndex(prev => {
      if (prev !== bestIdx) syncMapToCarousel(bestIdx)
      return bestIdx
    })
  }, [syncMapToCarousel])

  useEffect(() => {
    const el = carouselRef.current
    if (!el || entries.length === 0) return
    let settleTimer: number | null = null
    const onScroll = () => {
      if (settleTimer != null) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(pickNearestCard, 150)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (settleTimer != null) window.clearTimeout(settleTimer)
    }
  }, [entries.length, pickNearestCard])

  const scrollCardIntoCenter = useCallback((idx: number) => {
    const card = cardRefs.current.get(idx)
    card?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [])

  const handleMarkerClick = useCallback((id: string) => {
    const idx = entries.findIndex((e: any) => String(e.id) === id)
    if (idx === -1) return
    setActiveIndex(idx)
    scrollCardIntoCenter(idx)
  }, [entries, scrollCardIntoCenter])

  const handleCardTap = useCallback((entry: any, idx: number) => {
    if (idx === activeIndex) {
      onEntryClick(entry)
    } else {
      setActiveIndex(idx)
      scrollCardIntoCenter(idx)
    }
  }, [activeIndex, onEntryClick, scrollCardIntoCenter])

  useEffect(() => {
    if (entries.length > 0) {
      const timer = setTimeout(() => syncMapToCarousel(0), 500)
      return () => clearTimeout(timer)
    }
  }, [entries.length])

  const activeEntryId = entries[activeIndex]
    ? String(entries[activeIndex].id)
    : null

  const map = (
    <JourneyMapAuto
      ref={mapRef}
      entries={mapEntries}
      checkins={[]}
      trail={trail}
      height={9999}
      dark={dark}
      activeMarkerId={activeEntryId}
      onMarkerClick={handleMarkerClick}
      fullScreen
      paddingBottom={entries.length === 0 ? undefined : 200}
      publicMap={publicMap}
    />
  )

  if (entries.length === 0) {
    return (
      <div
        className="fixed left-0 right-0 z-10"
        style={{ top: 'var(--nav-h, 0px)', bottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {map}
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none px-6">
          <div className="pointer-events-auto max-w-sm rounded-2xl border border-edge bg-surface-card/90 shadow-modal">
            <EmptyState
              scene="journey"
              title={t('journey.detail.noEntries')}
              description={t('journey.detail.noEntriesHint')}
            />
          </div>
        </div>
        {!readOnly && onAddEntry && (
          <AddEntryFab
            onAddEntry={onAddEntry}
            label={t('journey.mobile.addEntry')}
            bottom="calc(var(--bottom-nav-h, 84px) + 16px)"
          />
        )}
      </div>
    )
  }

  return (
    <div
      className="fixed left-0 right-0 z-10"
      style={{ top: 'var(--nav-h, 0px)', bottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {map}

      <div
        className="fixed left-0 right-0 z-40"
        style={{ touchAction: 'pan-x', bottom: carouselBottom }}
      >
        <div
          ref={carouselRef}
          className="flex gap-3 overflow-x-auto px-4 pb-3 pt-1"
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {entries.map((entry: any, i: number) => (
            <div
              key={entry.id}
              data-idx={i}
              ref={node => { if (node) cardRefs.current.set(i, node); else cardRefs.current.delete(i); }}
              style={{ scrollSnapAlign: 'center' }}
            >
              <MobileEntryCard
                entry={entry}
                dayLabel={entryDayMeta[i]?.dayLabel ?? i + 1}
                dayColor={entryDayMeta[i]?.dayColor ?? DAY_COLORS[0]}
                isActive={i === activeIndex}
                onClick={() => handleCardTap(entry, i)}
                publicPhotoUrl={publicPhotoUrl}
              />
            </div>
          ))}
        </div>
      </div>

      {!readOnly && onAddEntry && (
        <AddEntryFab
          onAddEntry={onAddEntry}
          label={t('journey.mobile.addEntry')}
          bottom="calc(var(--bottom-nav-h, 84px) + 168px)"
        />
      )}
    </div>
  )
}

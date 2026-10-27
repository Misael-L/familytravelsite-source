import { FamilyDayToolbar } from './FamilyDayToolbar'
import { FamilyTripExportModal } from '../FamilyTripExportModal'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, ArrowUpDown, CalendarPlus, ChevronsDownUp, ChevronsUpDown, FileDown, Undo2,
} from 'lucide-react'
import { useTranslation } from '../../../i18n'
import { formatDate } from '../../../utils/formatters'
import Tooltip from '../../shared/Tooltip'
import { useToast } from '../../shared/Toast'
import { useAuthStore } from '../../../store/authStore'
import { downloadFamilyPlanIcs } from '../../../lib/plan/familyPlanIcs'
import { openFamilyPlanPdfOverlay } from '../../../lib/plan/familyPlanPdf'
import { FamilyCalendarSubscribeModal } from './FamilyCalendarSubscribeModal'
import FamilyDayHead from './FamilyDayHead'
import FamilyDayTimelineRow from './FamilyDayTimelineRow'
import { FamilyDayTimelineEntry } from './FamilyDayTimelineEntry'
import type { FamilyDayTimelineDay } from './familyDayTimeline'
import { DAY_CARD } from './familyDayPlanSurfaces'
import type { FamilyTripDay } from '../../../data/supabase/tripDays'
import type { FamilyScheduleItem } from '../../../data/supabase/scheduleItems'
import type { FamilyTripPlace } from '../../../data/supabase/tripPlaces'
import type { FamilyDayNote } from '../../../data/supabase/dayNotes'

type FamilyDayPlanSidebarProps = {
  tripId: string
  tripTitle: string
  days: FamilyTripDay[]
  itemsByDayId: Map<string, FamilyScheduleItem[]>
  placesById: Map<string, FamilyTripPlace>
  notesByCivilDay: Map<string, FamilyDayNote>
  selectedDayId: string | null
  onSelectDay: (id: string | null) => void
  onAddToDay?: (id: string) => void
  onRemoveItem: (itemId: string) => void
  onMoveItem: (dayId: string, itemId: string, direction: -1 | 1) => void
  onOpenNote: (day: FamilyTripDay) => void
  onSaveTitle: (dayId: string, title: string | null) => void
  canMutate: boolean
  onToastWrite: (kind?: 'edit' | 'import' | 'export' | 'reorder') => void
  onOpenTransport?: (opts: { dayId: string; automated: boolean }) => void
  isMobile?: boolean
  canUndo?: boolean
  onUndo?: () => void
  lastActionLabel?: string | null
  reservationTypes?: ReadonlyMap<string, string>
  timeline?: FamilyDayTimelineDay[]
  onOpenTimeline?: (kind: 'booking' | 'transport', id: string, trigger: HTMLElement) => void
}

const EXPAND_KEY = (tripId: string) => `family-day-expanded-${tripId}`

export default function FamilyDayPlanSidebar({
  tripId,
  tripTitle,
  days,
  itemsByDayId,
  placesById,
  notesByCivilDay,
  selectedDayId,
  onSelectDay,
  onAddToDay,
  onRemoveItem,
  onMoveItem,
  onOpenNote,
  onSaveTitle,
  canMutate,
  onToastWrite,
  onOpenTransport,
  isMobile = false,
  canUndo = false,
  onUndo,
  lastActionLabel = null,
  timeline,
  reservationTypes,
  onOpenTimeline,
}: FamilyDayPlanSidebarProps): React.ReactElement {
  const { t, locale } = useTranslation()
  const toast = useToast()
  const familyId = useAuthStore(s => s.familyId)
  const personId = useAuthStore(s => s.personId)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(EXPAND_KEY(tripId))
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch { /* ignore */ }
    return new Set(days.map(d => d.id))
  })
  const [exportOpen, setExportOpen] = useState(false)
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [editingTitleDayId, setEditingTitleDayId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const titleClosedRef = useRef(false)

  useEffect(() => {
    if (editingTitleDayId) titleInputRef.current?.focus()
  }, [editingTitleDayId])

  useEffect(() => {
    setExpandedDays(prev => {
      if (prev.size > 0) return prev
      return new Set(days.map(d => d.id))
    })
  }, [days])

  const persistExpanded = (next: Set<string>) => {
    setExpandedDays(next)
    try { localStorage.setItem(EXPAND_KEY(tripId), JSON.stringify([...next])) } catch { /* ignore */ }
  }

  const toggleDay = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(expandedDays)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    persistExpanded(next)
  }

  const allExpanded = days.length > 0 && days.every(d => expandedDays.has(d.id))
  const expandLabel = allExpanded ? t('dayplan.collapseAll') : t('dayplan.expandAll')

  const menuItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 'calc(12px * var(--fs-scale-body, 1))',
    color: 'var(--text-primary)', textAlign: 'left',
  }

  const sorted = useMemo(
    () => [...days].sort((a, b) => a.dayIndex - b.dayIndex),
    [days],
  )

  const exportInput = useMemo(() => ({
    tripTitle,
    days,
    itemsByDayId,
    placesById,
    notesByCivilDay,
  }), [tripTitle, days, itemsByDayId, placesById, notesByCivilDay])

  const exportPdf = () => {
    try {
      openFamilyPlanPdfOverlay(exportInput, {
        travelPlan: t('pdf.travelPlan'),
        saveAsPdf: t('pdf.saveAsPdf'),
        emptyDay: t('dayplan.emptyDay'),
        dayN: (n) => t('dayplan.dayN', { n }),
      }, locale)
    } catch {
      toast.error(t('dayplan.pdfError'))
    }
  }

  const exportIcs = () => {
    try {
      downloadFamilyPlanIcs(exportInput)
    } catch {
      toast.error(t('planner.icsExportFailed'))
    }
  }

  const openSubscribe = () => {
    if (!familyId || !personId) {
      toast.error(t('dashboard.propose.missingPerson'))
      return
    }
    setSubscribeOpen(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minHeight: 0, height: '100%', position: 'relative', fontFamily: 'var(--font-system)' }}>
      <FamilyDayToolbar allExpanded={allExpanded} onToggleAll={() => {
        const next = allExpanded ? new Set<string>() : new Set(days.map(day => day.id))
        setExpandedDays(next)
        try { localStorage.setItem(EXPAND_KEY(tripId), JSON.stringify([...next])) } catch { /* private storage */ }
      }} onExport={() => setExportOpen(true)} onUndo={onUndo} canUndo={canUndo} lastActionLabel={lastActionLabel} />
      <FamilyTripExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)}
        onPdf={exportPdf} onIcs={exportIcs} onSubscribe={openSubscribe}
        canSubscribe={!!familyId && !!personId} fileBase={tripTitle} />

      <div className="scroll-container trek-stagger flex flex-col gap-2 p-2" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {sorted.length === 0 ? null : sorted.map((day, index) => {
          const isSelected = selectedDayId === day.id
          const isExpanded = expandedDays.has(day.id)
          const formatted = formatDate(day.civilDay, locale)
          const title = day.title || t('dayplan.dayN', { n: index + 1 })
          const dayNote = notesByCivilDay.get(day.civilDay) ?? null
          const isEditingTitle = editingTitleDayId === day.id
          const dayItems = itemsByDayId.get(day.id) ?? []
          const timelineDay = timeline?.find(entry => entry.dayId === day.id)
          const displayIndex = index + 1

          const commitTitle = () => {
            if (titleClosedRef.current) return
            titleClosedRef.current = true
            setEditingTitleDayId(null)
            const next = titleDraft.trim() || null
            const prev = day.title?.trim() || null
            if (next === prev) return
            onSaveTitle(day.id, next)
          }
          const cancelTitle = () => {
            titleClosedRef.current = true
            setEditingTitleDayId(null)
          }

          return (
            <div key={day.id} className={DAY_CARD}>
              <FamilyDayHead
                day={day}
                displayIndex={displayIndex}
                title={title}
                formattedDate={formatted}
                noteBody={dayNote?.body ?? null}
                isSelected={isSelected}
                isExpanded={isExpanded}
                isEditingTitle={isEditingTitle}
                titleDraft={titleDraft}
                titleInputRef={titleInputRef}
                canMutate={canMutate}
                isMobile={isMobile}
                onSelect={() => onSelectDay(isSelected ? null : day.id)}
                onToggle={e => toggleDay(day.id, e)}
                onStartEdit={() => {
                  titleClosedRef.current = false
                  setTitleDraft(day.title ?? '')
                  setEditingTitleDayId(day.id)
                }}
                onTitleDraft={setTitleDraft}
                onCommitTitle={commitTitle}
                onCancelTitle={cancelTitle}
                onOpenNote={() => onOpenNote(day)}
                onOpenTransport={onOpenTransport
                  ? (automated) => onOpenTransport({ dayId: day.id, automated })
                  : undefined}
                onToastWrite={() => onToastWrite()}
                pills={timelineDay?.pills.map(pill => ({ key: pill.key, title: pill.title }))}
                onOpenPill={(key, trigger) => {
                  const pill = timelineDay?.pills.find(entry => entry.key === key)
                  if (!pill || !onOpenTimeline) return
                  onOpenTimeline(pill.detailTransportId ? 'transport' : 'booking', pill.detailTransportId ?? pill.detailBookingId ?? pill.id, trigger)
                }}
              />
              {isExpanded && (
                <div className="border-t border-edge-faint px-1.5 pb-1.5 pt-1.5">
                  {timelineDay ? (
                    timelineDay.rows.length === 0 && timelineDay.pills.length === 0 ? (
                      <div className="p-1 text-center">
                        {onAddToDay ? <button type="button" onClick={() => onAddToDay(day.id)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-edge px-3 py-2.5 font-semibold text-content-muted hover:border-content-faint hover:text-content"
                          style={{fontSize: 'calc(12px * var(--fs-scale-body, 1))'}}>
                          <Plus size={13} strokeWidth={2.2} />{t('dayplan.addPlaceHere')}
                        </button> : <span className="text-caption text-content-faint">{t('dayplan.emptyDay')}</span>}
                      </div>
                    ) : timelineDay.rows.map(row => row.source === 'schedule' ? (
                      <FamilyDayTimelineRow
                        key={row.key}
                        dayId={day.id}
                        item={dayItems.find(item => item.id === row.id) ?? {
                          id: row.id, tripId, activity: row.title, placeId: row.placeId, startsAt: null, endsAt: null,
                          address: null, timeZone: null, sortOrder: row.sortOrder, experienceId: null, foodId: null, linkUrl: null,
                        }}
                        place={row.placeId ? placesById.get(row.placeId) : undefined}
                        isFirst={false}
                        isLast={false}
                        clockLabel={row.clockLabel}
                        moveUpEnabled={row.moveUp}
                        moveDownEnabled={row.moveDown}
                        onActivate={row.detailBookingId && onOpenTimeline
                          ? trigger => onOpenTimeline('booking', row.detailBookingId!, trigger)
                          : undefined}
                        onMoveItem={onMoveItem}
                        onRemoveItem={onRemoveItem}
                      />
                    ) : (
                      <FamilyDayTimelineEntry
                        key={row.key}
                        row={row} type={reservationTypes?.get(row.id)}
                        onOpen={trigger => onOpenTimeline?.(row.detailTransportId ? 'transport' : 'booking', row.detailTransportId ?? row.detailBookingId ?? row.id, trigger)}
                      />
                    ))
                  ) : dayItems.length === 0 ? (
                    <div className="px-4 py-4 text-center">
                      <span className="text-caption text-content-faint">{t('dayplan.emptyDay')}</span>
                    </div>
                  ) : dayItems.map((item, itemIdx) => (
                    <FamilyDayTimelineRow
                      key={item.id}
                      dayId={day.id}
                      item={item}
                      place={item.placeId ? placesById.get(item.placeId) : undefined}
                      isFirst={itemIdx === 0}
                      isLast={itemIdx === dayItems.length - 1}
                      onMoveItem={onMoveItem}
                      onRemoveItem={onRemoveItem}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {subscribeOpen && familyId && personId && (
        <FamilyCalendarSubscribeModal
          familyId={familyId}
          personId={personId}
          onClose={() => setSubscribeOpen(false)}
        />
      )}
    </div>
  )
}

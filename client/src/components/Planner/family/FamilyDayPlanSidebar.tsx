import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowUp, ArrowUpDown, CalendarPlus, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown,
  FileDown, FileText, Pencil, Plus, Trash2, TramFront, Undo2,
} from 'lucide-react'
import { useTranslation } from '../../../i18n'
import { formatDate } from '../../../utils/formatters'
import Tooltip from '../../shared/Tooltip'
import PlaceAvatar from '../../shared/PlaceAvatar'
import { useToast } from '../../shared/Toast'
import { useAuthStore } from '../../../store/authStore'
import { downloadFamilyPlanIcs } from '../../../lib/plan/familyPlanIcs'
import { openFamilyPlanPdfOverlay } from '../../../lib/plan/familyPlanPdf'
import { FamilyCalendarSubscribeModal } from './FamilyCalendarSubscribeModal'
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
}

const EXPAND_KEY = (tripId: string) => `family-day-expanded-${tripId}`

const TOOLBAR_ICON_BTN: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  borderRadius: 8,
  border: '1px solid var(--border-primary)',
  background: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: 0,
}

export default function FamilyDayPlanSidebar({
  tripId,
  tripTitle,
  days,
  itemsByDayId,
  placesById,
  notesByCivilDay,
  selectedDayId,
  onSelectDay,
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
  const [pdfHover, setPdfHover] = useState(false)
  const [icsHover, setIcsHover] = useState(false)
  const [icsMenuVisible, setIcsMenuVisible] = useState(false)
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const icsMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [undoHover, setUndoHover] = useState(false)
  const [editingTitleDayId, setEditingTitleDayId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTitleDayId) titleInputRef.current?.focus()
  }, [editingTitleDayId])

  useEffect(() => () => {
    if (icsMenuTimeoutRef.current) clearTimeout(icsMenuTimeoutRef.current)
  }, [])

  const showIcsMenu = () => {
    if (icsMenuTimeoutRef.current) clearTimeout(icsMenuTimeoutRef.current)
    setIcsMenuVisible(true)
    setIcsHover(true)
  }
  const hideIcsMenu = () => {
    icsMenuTimeoutRef.current = setTimeout(() => {
      setIcsMenuVisible(false)
      setIcsHover(false)
    }, 120)
  }

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
    setIcsMenuVisible(false)
    setIcsHover(false)
    setSubscribeOpen(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', fontFamily: 'var(--font-system)' }}>
      <div className="border-b border-edge-faint" style={{ padding: '12px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={exportPdf}
              onMouseEnter={() => setPdfHover(true)}
              onMouseLeave={() => setPdfHover(false)}
              className="bg-accent text-accent-text"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 8, border: 'none',
                fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <FileDown size={13} strokeWidth={2} />
              {t('dayplan.pdf')}
            </button>
            {pdfHover && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 200,
                background: 'var(--bg-card, white)', color: 'var(--text-primary, #111827)',
                fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 500, padding: '5px 10px',
                borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: '1px solid var(--border-faint, #e5e7eb)',
              }}>
                {t('dayplan.pdfTooltip')}
              </div>
            )}
          </div>

          <div
            style={{ position: 'relative', flexShrink: 0 }}
            onMouseEnter={showIcsMenu}
            onMouseLeave={hideIcsMenu}
          >
            <button
              type="button"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 8,
                border: '1px solid var(--border-primary)', background: 'none',
                color: 'var(--text-muted)', fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <FileDown size={13} strokeWidth={2} />
              ICS
            </button>
            {(icsMenuVisible || icsHover) && (
              <div
                onMouseEnter={showIcsMenu}
                onMouseLeave={hideIcsMenu}
                style={{
                  position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                  zIndex: 200, minWidth: 160,
                  background: 'var(--bg-card, white)',
                  borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                  border: '1px solid var(--border-faint, #e5e7eb)',
                  overflow: 'hidden',
                }}
              >
                <button type="button" onClick={exportIcs} style={menuItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover, #f3f4f6)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <FileDown size={12} strokeWidth={2} />
                  Download ICS
                </button>
                <button type="button" onClick={openSubscribe} style={menuItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover, #f3f4f6)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <CalendarPlus size={12} strokeWidth={2} />
                  Subscribe to calendar
                </button>
              </div>
            )}
          </div>

          <Tooltip label={expandLabel} placement="bottom">
            <button
              type="button"
              onClick={() => persistExpanded(allExpanded ? new Set() : new Set(days.map(d => d.id)))}
              aria-label={expandLabel}
              aria-pressed={allExpanded}
              style={{
                ...TOOLBAR_ICON_BTN,
                position: 'relative',
                flexShrink: 0,
                color: 'var(--text-primary)',
                overflow: 'hidden',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: allExpanded ? 0 : 1,
                transform: allExpanded ? 'translateY(-8px) scale(0.6)' : 'translateY(0) scale(1)',
                transition: 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}>
                <ChevronsUpDown size={14} strokeWidth={2} />
              </span>
              <span style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: allExpanded ? 1 : 0,
                transform: allExpanded ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.6)',
                transition: 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}>
                <ChevronsDownUp size={14} strokeWidth={2} />
              </span>
            </button>
          </Tooltip>

          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                if (canUndo && onUndo) {
                  onUndo()
                  return
                }
                onToastWrite('reorder')
              }}
              aria-label={t('undo.button')}
              aria-disabled={!canUndo}
              onMouseEnter={() => setUndoHover(true)}
              onMouseLeave={() => setUndoHover(false)}
              style={{
                ...TOOLBAR_ICON_BTN,
                color: canUndo ? 'var(--text-primary)' : 'var(--border-primary)',
                cursor: canUndo ? 'pointer' : 'default',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              <Undo2 size={14} strokeWidth={2} />
            </button>
            {undoHover && (
              <div
                role="tooltip"
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 200,
                  background: 'var(--bg-card, white)', color: 'var(--text-primary, #111827)',
                  fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 500, padding: '5px 10px',
                  borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: '1px solid var(--border-faint, #e5e7eb)',
                }}
              >
                {canUndo && lastActionLabel
                  ? t('undo.tooltip', { action: lastActionLabel })
                  : t('undo.button')}
              </div>
            )}
          </div>

          <Tooltip label={t('dayplan.reorderDays')} placement="bottom">
            <button
              type="button"
              onClick={() => onToastWrite('reorder')}
              aria-label={t('dayplan.reorderDays')}
              style={{
                ...TOOLBAR_ICON_BTN,
                color: 'var(--text-primary)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <ArrowUpDown size={14} strokeWidth={2} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="scroll-container trek-stagger" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {sorted.length === 0 ? null : sorted.map((day, index) => {
          const isSelected = selectedDayId === day.id
          const isExpanded = expandedDays.has(day.id)
          const formatted = formatDate(day.civilDay, locale)
          const title = day.title || t('dayplan.dayN', { n: index + 1 })
          const dayNote = notesByCivilDay.get(day.civilDay) ?? null
          const isEditingTitle = editingTitleDayId === day.id
          const dayItems = itemsByDayId.get(day.id) ?? []
          const cell: React.CSSProperties = { padding: 7, cursor: 'pointer', display: 'grid', placeItems: 'center' }
          const div = '1px solid var(--border-faint)'

          const commitTitle = () => {
            setEditingTitleDayId(null)
            const next = titleDraft.trim() || null
            const prev = day.title?.trim() || null
            if (next === prev) return
            onSaveTitle(day.id, next)
          }

          return (
            <div key={day.id} style={{ borderBottom: '1px solid var(--border-faint)' }}>
              <div
                className="dp-day-header"
                data-selected={isSelected}
                onClick={() => {
                  if (isEditingTitle) return
                  onSelectDay(isSelected ? null : day.id)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px 11px 16px',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--bg-selected)' : 'transparent',
                  transition: 'background 0.12s',
                  userSelect: 'none',
                  touchAction: 'manipulation',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{
                  flexShrink: 0, alignSelf: 'flex-start',
                  width: 26, height: 26, borderRadius: '50%',
                  background: isSelected ? 'var(--accent)' : 'var(--bg-hover)',
                  color: isSelected ? 'var(--accent-text)' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 700,
                }}>
                  {index + 1}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    {isEditingTitle ? (
                      <input
                        ref={titleInputRef}
                        value={titleDraft}
                        onChange={e => setTitleDraft(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onBlur={commitTitle}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitTitle() }
                          if (e.key === 'Escape') { e.preventDefault(); setEditingTitleDayId(null) }
                        }}
                        placeholder={t('dayplan.dayN', { n: index + 1 })}
                        className="text-content"
                        style={{
                          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                          padding: 0, fontFamily: 'inherit',
                          fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 600,
                          borderBottom: '1.5px solid var(--text-primary)',
                        }}
                      />
                    ) : (
                      <>
                        <span style={{
                          fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 600,
                          color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0,
                        }}>
                          {title}
                        </span>
                        {canMutate && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              setTitleDraft(day.title ?? '')
                              setEditingTitleDayId(day.id)
                            }}
                            aria-label={t('common.edit')}
                            title={t('common.edit')}
                            className="text-content-faint"
                            style={{ border: 'none', background: 'none', padding: 2, cursor: 'pointer', display: 'flex', flexShrink: 0 }}
                          >
                            <Pencil size={12} strokeWidth={1.8} />
                          </button>
                        )}
                      </>
                    )}
                    {!isEditingTitle && formatted && (
                      <>
                        <span style={{ flexShrink: 0, width: 1, height: 11, background: 'var(--border-primary)' }} />
                        <span style={{
                          flexShrink: 0, fontSize: 'calc(11px * var(--fs-scale-caption, 1))',
                          fontWeight: 400, color: 'var(--text-faint)', whiteSpace: 'nowrap',
                        }}>
                          {formatted}
                        </span>
                      </>
                    )}
                  </div>
                  {dayNote?.body ? (
                    <div
                      className="text-content-faint"
                      style={{
                        marginTop: 3,
                        fontSize: 'calc(11px * var(--fs-scale-caption, 1))',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {dayNote.body}
                    </div>
                  ) : null}
                </div>

                {isMobile ? (
                  <div style={{ alignSelf: 'flex-start', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onOpenNote(day) }}
                      aria-label={t('dayplan.addNote')}
                      className="text-content-faint"
                      style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', display: 'flex' }}
                    >
                      <FileText size={16} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      onClick={e => toggleDay(day.id, e)}
                      className="text-content-faint"
                      style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', display: 'flex' }}
                    >
                      {isExpanded ? <ChevronDown size={16} strokeWidth={1.8} /> : <ChevronRight size={16} strokeWidth={1.8} />}
                    </button>
                  </div>
                ) : (
                  <div className="dp-day-actions" style={{ alignSelf: 'flex-start', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', border: div, borderRadius: 9, overflow: 'hidden' }}>
                    <button type="button" onClick={e => { e.stopPropagation(); onOpenTransport ? onOpenTransport({ dayId: day.id, automated: true }) : onToastWrite() }} title={t('transit.title')} aria-label={t('transit.title')} style={{ ...cell, border: 'none', borderRight: div, borderBottom: div }}>
                      <TramFront size={14} strokeWidth={1.8} />
                    </button>
                    <button type="button" onClick={e => { e.stopPropagation(); onOpenTransport ? onOpenTransport({ dayId: day.id, automated: false }) : onToastWrite() }} title={t('transport.addTransport')} style={{ ...cell, border: 'none', borderBottom: div }}>
                      <Plus size={14} strokeWidth={1.8} />
                    </button>
                    <button type="button" onClick={e => { e.stopPropagation(); onOpenNote(day) }} aria-label={t('dayplan.addNote')} style={{ ...cell, border: 'none', borderRight: div }}>
                      <FileText size={14} strokeWidth={1.8} />
                    </button>
                    <button type="button" onClick={e => toggleDay(day.id, e)} title={isExpanded ? t('common.collapse') : t('common.expand')} style={{ ...cell, border: 'none' }}>
                      {isExpanded ? <ChevronDown size={15} strokeWidth={1.8} /> : <ChevronRight size={15} strokeWidth={1.8} />}
                    </button>
                  </div>
                )}
              </div>

              {isExpanded && (
                <div style={{ background: 'var(--bg-hover)', paddingTop: 6, paddingBottom: 8 }}>
                  {dayItems.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', borderRadius: 8, border: '2px dashed transparent' }}>
                      <span className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))' }}>
                        {t('dayplan.emptyDay')}
                      </span>
                    </div>
                  ) : dayItems.map((item, itemIdx) => {
                    const place = item.placeId ? placesById.get(item.placeId) : undefined
                    const label = place?.name || item.activity
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px 8px 16px',
                          borderBottom: itemIdx < dayItems.length - 1 ? '1px solid var(--border-faint)' : 'none',
                        }}
                      >
                        <PlaceAvatar
                          place={{
                            id: place?.id ?? item.id,
                            name: label,
                            lat: place?.lat ?? null,
                            lng: place?.lng ?? null,
                            image_url: place?.imageUrl ?? null,
                            google_place_id: null,
                            osm_id: null,
                          }}
                          size={28}
                        />
                        <span className="text-content" style={{
                          flex: 1, minWidth: 0,
                          fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {label}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                          <button
                            type="button"
                            disabled={itemIdx === 0}
                            onClick={() => onMoveItem(day.id, item.id, -1)}
                            aria-label="Move up"
                            title="Move up"
                            style={{
                              ...TOOLBAR_ICON_BTN,
                              width: 24, height: 24,
                              opacity: itemIdx === 0 ? 0.35 : 1,
                              cursor: itemIdx === 0 ? 'default' : 'pointer',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <ArrowUp size={12} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            disabled={itemIdx === dayItems.length - 1}
                            onClick={() => onMoveItem(day.id, item.id, 1)}
                            aria-label="Move down"
                            title="Move down"
                            style={{
                              ...TOOLBAR_ICON_BTN,
                              width: 24, height: 24,
                              opacity: itemIdx === dayItems.length - 1 ? 0.35 : 1,
                              cursor: itemIdx === dayItems.length - 1 ? 'default' : 'pointer',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <ArrowDown size={12} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.id)}
                            aria-label={t('common.delete')}
                            style={{
                              ...TOOLBAR_ICON_BTN,
                              width: 24, height: 24,
                              color: 'var(--text-muted)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                          >
                            <Trash2 size={12} strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
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

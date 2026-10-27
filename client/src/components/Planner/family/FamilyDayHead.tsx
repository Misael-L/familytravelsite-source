import React from 'react'
import { ChevronDown, ChevronRight, FileText, Pencil, Plus, TramFront } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import type { FamilyTripDay } from '../../../data/supabase/tripDays'
import {
  DAY_HEAD_HOVER,
  DAY_HEAD_REST,
  DAY_HEAD_SELECTED,
  DAY_INDEX_TILE,
  DAY_INDEX_TILE_SELECTED,
} from './familyDayPlanSurfaces'

export type FamilyDayHeadProps = {
  day: FamilyTripDay
  displayIndex: number
  title: string
  formattedDate: string
  noteBody: string | null
  isSelected: boolean
  isExpanded: boolean
  isEditingTitle: boolean
  titleDraft: string
  titleInputRef: React.RefObject<HTMLInputElement | null>
  canMutate: boolean
  isMobile: boolean
  onSelect: () => void
  onToggle: (event: React.MouseEvent) => void
  onStartEdit: () => void
  onTitleDraft: (value: string) => void
  onCommitTitle: () => void
  onCancelTitle: () => void
  onOpenNote: () => void
  onOpenTransport?: (automated: boolean) => void
  onToastWrite: () => void
  pills?: { key: string; title: string }[]
  onOpenPill?: (key: string, trigger: HTMLElement) => void
}

export default function FamilyDayHead({
  day,
  displayIndex,
  title,
  formattedDate,
  noteBody,
  isSelected,
  isExpanded,
  isEditingTitle,
  titleDraft,
  titleInputRef,
  canMutate,
  isMobile,
  onSelect,
  onToggle,
  onStartEdit,
  onTitleDraft,
  onCommitTitle,
  onCancelTitle,
  onOpenNote,
  onOpenTransport,
  onToastWrite,
  pills = [],
  onOpenPill,
}: FamilyDayHeadProps): React.ReactElement {
  const { t } = useTranslation()
  const cell: React.CSSProperties = { padding: 7, cursor: 'pointer', display: 'grid', placeItems: 'center' }
  const div = '1px solid var(--border-faint)'

  return (
    <div
      className="dp-day-header"
      data-selected={isSelected}
      data-day-id={day.id}
      onClick={() => {
        if (isEditingTitle) return
        onSelect()
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 14px 11px 12px',
        cursor: 'pointer',
        background: isSelected ? DAY_HEAD_SELECTED : DAY_HEAD_REST,
        transition: 'background 0.12s',
        userSelect: 'none',
        touchAction: 'manipulation',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = DAY_HEAD_HOVER }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? DAY_HEAD_SELECTED : DAY_HEAD_REST }}
    >
      <div className={isSelected ? DAY_INDEX_TILE_SELECTED : DAY_INDEX_TILE} aria-hidden>
        {displayIndex}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={e => onTitleDraft(e.target.value)}
              onClick={e => e.stopPropagation()}
              onBlur={onCommitTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); onCommitTitle() }
                if (e.key === 'Escape') { e.preventDefault(); onCancelTitle() }
              }}
              placeholder={t('dayplan.dayN', { n: displayIndex })}
              aria-label={t('common.edit')}
              className="min-w-0 flex-1 border-0 border-b border-edge bg-transparent p-0 text-body font-semibold text-content outline-none"
            />
          ) : (
            <>
              <span className="min-w-0 flex-shrink truncate text-body font-semibold text-content">
                {title}
              </span>
              {canMutate && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    onStartEdit()
                  }}
                  aria-label={t('common.edit')}
                  title={t('common.edit')}
                  className="flex flex-none border-0 bg-transparent p-0.5 text-content-faint"
                >
                  <Pencil size={12} strokeWidth={1.8} />
                </button>
              )}
            </>
          )}
          {!isEditingTitle && formattedDate && (
            <>
              <span className="h-3 w-px flex-none bg-edge" />
              <span className="flex-none whitespace-nowrap text-caption text-content-faint">
                {formattedDate}
              </span>
            </>
          )}
        </div>
        {noteBody ? (
          <div className="mt-0.5 truncate text-caption text-content-faint">
            {noteBody}
          </div>
        ) : null}
        {pills.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {pills.map(pill => (
              <button
                key={pill.key}
                type="button"
                onClick={event => {
                  event.stopPropagation()
                  onOpenPill?.(pill.key, event.currentTarget)
                }}
                className="rounded-full border border-edge bg-surface-secondary px-2 py-0.5 text-caption text-content"
              >
                {pill.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {isMobile ? (
        <div style={{ alignSelf: 'flex-start', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onOpenNote() }}
            aria-label={t('dayplan.addNote')}
            className="flex border-0 bg-transparent p-1.5 text-content-faint"
          >
            <FileText size={16} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-label={isExpanded ? t('common.collapse') : t('common.expand')}
            aria-expanded={isExpanded}
            className="flex border-0 bg-transparent p-1.5 text-content-faint"
          >
            {isExpanded ? <ChevronDown size={16} strokeWidth={1.8} /> : <ChevronRight size={16} strokeWidth={1.8} />}
          </button>
        </div>
      ) : (
        <div className="dp-day-actions" style={{ alignSelf: 'flex-start', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', border: div, borderRadius: 9, overflow: 'hidden' }}>
          <button type="button" onClick={e => { e.stopPropagation(); onOpenTransport ? onOpenTransport(true) : onToastWrite() }} title={t('transit.title')} aria-label={t('transit.title')} style={{ ...cell, border: 'none', borderRight: div, borderBottom: div }}>
            <TramFront size={14} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); onOpenTransport ? onOpenTransport(false) : onToastWrite() }} title={t('transport.addTransport')} aria-label={t('transport.addTransport')} style={{ ...cell, border: 'none', borderBottom: div }}>
            <Plus size={14} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); onOpenNote() }} aria-label={t('dayplan.addNote')} style={{ ...cell, border: 'none', borderRight: div }}>
            <FileText size={14} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={onToggle} title={isExpanded ? t('common.collapse') : t('common.expand')} aria-label={isExpanded ? t('common.collapse') : t('common.expand')} aria-expanded={isExpanded} style={{ ...cell, border: 'none' }}>
            {isExpanded ? <ChevronDown size={15} strokeWidth={1.8} /> : <ChevronRight size={15} strokeWidth={1.8} />}
          </button>
        </div>
      )}
    </div>
  )
}

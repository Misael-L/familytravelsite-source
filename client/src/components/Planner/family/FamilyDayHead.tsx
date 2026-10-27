import React from 'react'
import { ContextMenu, useContextMenu } from '../../shared/ContextMenu'
import { fs } from '../../shared/DialogShell'
import { TimePill, SoftPill } from '../planParts'
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

export default function FamilyDayHead(p: FamilyDayHeadProps): React.ReactElement {
  const { t } = useTranslation()
  const menu = useContextMenu()
  const { day, displayIndex, title, formattedDate, noteBody, isSelected, isExpanded, isEditingTitle,
    titleDraft, titleInputRef, canMutate, onSelect, onToggle, onStartEdit, onTitleDraft,
    onCommitTitle, onCancelTitle, onOpenNote, onOpenTransport, onToastWrite, pills = [], onOpenPill } = p
  const hasDayPills = pills.length > 0 || !!noteBody
  return <>
    <div className="dp-day-header" role="button" tabIndex={0} data-selected={isSelected} data-day-id={day.id}
      onClick={() => { if (!isEditingTitle) onSelect() }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect() }
      }}
      style={{
        display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', columnGap: 10, rowGap: 4,
        alignItems: hasDayPills ? 'start' : 'center',
        paddingBlock: 10, paddingInlineEnd: 8, paddingInlineStart: 10,
        cursor: 'pointer', background: isSelected ? DAY_HEAD_SELECTED : DAY_HEAD_REST,
        transition: 'background 0.12s', userSelect: 'none', touchAction: 'manipulation',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = DAY_HEAD_HOVER }}
      onMouseLeave={e => { e.currentTarget.style.background = isSelected ? DAY_HEAD_SELECTED : DAY_HEAD_REST }}>
      <div className="flex flex-none flex-col items-center overflow-hidden rounded-[10px] font-geist font-bold tabular-nums shadow-sm"
        style={{ width: 32, gridRow: hasDayPills ? 'span 2' : undefined,
          background: isSelected ? 'var(--accent)' : 'var(--bg-card)', color: isSelected ? 'var(--accent-text)' : 'var(--text-muted)' }}>
        <div className="grid h-8 w-full place-items-center" style={{ ...fs(12), lineHeight: 1 }}>{displayIndex}</div>
      </div>
      <div className={hasDayPills ? 'min-w-0 pt-[5px]' : 'min-w-0'}>
        <div className="flex min-w-0 items-baseline gap-2">
          {isEditingTitle ? <input ref={titleInputRef} value={titleDraft} onChange={e => onTitleDraft(e.target.value)}
            onClick={e => e.stopPropagation()} onBlur={onCommitTitle} onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommitTitle() }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancelTitle() }
            }} aria-label={t('common.edit')} placeholder={t('dayplan.dayN', {n: displayIndex})}
            className="min-w-0 flex-1 border-0 border-b border-edge bg-transparent p-0 font-bold text-content outline-none" style={fs(13.5, 'body')} /> : <>
            <span className="min-w-0 truncate font-bold text-content" style={fs(13.5, 'body')}>{title}</span>
            {canMutate && <button type="button" onClick={e => { e.stopPropagation(); onStartEdit() }} aria-label={t('common.edit')}
              className="flex flex-none border-0 bg-transparent p-0.5 text-content-faint"><Pencil size={12} strokeWidth={1.8} /></button>}
          </>}
          {!isEditingTitle && formattedDate && <span className="flex-none whitespace-nowrap text-content-faint" style={fs(11)}>{formattedDate}</span>}
        </div>
      </div>
      <div className="-my-1 flex flex-none items-center gap-1">
        {canMutate && <button type="button" onClick={e => menu.open(e, [
          {label: t('dayplan.addNote'), icon: FileText, onClick: onOpenNote},
          {label: t('transport.addTransport'), icon: Plus, onClick: () => onOpenTransport ? onOpenTransport(false) : onToastWrite()},
          {label: t('transit.title'), icon: TramFront, onClick: () => onOpenTransport ? onOpenTransport(true) : onToastWrite()},
        ])} aria-label={t('planner.addToThisDay')} aria-haspopup="menu"
          className="dp-day-tools grid h-7 w-7 place-items-center rounded-full bg-surface-card text-content-muted shadow-sm hover:text-content">
          <Plus size={14} strokeWidth={2.2} />
        </button>}
        <button type="button" onClick={e => {e.stopPropagation(); onOpenNote()}} aria-label={t('dayplan.addNote')}
          className="grid h-7 w-7 place-items-center rounded-full text-content-muted hover:bg-surface-card hover:text-content"><FileText size={14} strokeWidth={2} /></button>
        <button type="button" onClick={onToggle} aria-label={isExpanded ? t('common.collapse') : t('common.expand')} aria-expanded={isExpanded}
          className="grid h-7 w-7 place-items-center rounded-full text-content-muted hover:bg-surface-card hover:text-content">
          {isExpanded ? <ChevronDown size={15} strokeWidth={2} /> : <ChevronRight size={15} strokeWidth={2} />}
        </button>
      </div>
      {hasDayPills && <div className="col-start-2 col-end-4 flex min-w-0 flex-wrap items-center gap-1">
        {noteBody && <span className="min-w-0 truncate text-content-faint" style={fs(11)}>{noteBody}</span>}
        {pills.map(pill => <button type="button" key={pill.key} onClick={e => {e.stopPropagation(); onOpenPill?.(pill.key, e.currentTarget)}}>
          <SoftPill>{pill.title}</SoftPill>
        </button>)}
      </div>}
    </div>
    <ContextMenu menu={menu.menu} onClose={menu.close} />
  </>
}

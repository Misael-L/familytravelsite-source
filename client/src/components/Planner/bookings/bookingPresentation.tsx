// Presentation copied from TREK d4da05b. Family controllers retain data and focus ownership.
import type { CSSProperties, ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import { typeInfo } from './bookingTypePresentation'
export const fs = (px: number, tier: 'caption' | 'body' | 'subtitle' = 'caption'): CSSProperties => ({ fontSize: `calc(${px}px * var(--fs-scale-${tier}, 1))` })
export const EYEBROW = 'font-geist font-bold uppercase tracking-[.08em] text-content-faint'
export const BOX = 'rounded-[10px] border border-edge-faint bg-surface-card'

export type StatusTone = 'confirmed' | 'pending' | 'transit'

const TONE_VAR: Record<StatusTone, string> = { confirmed: 'var(--success)', pending: 'var(--warning)', transit: 'var(--info)' }

/** The status colour, and the head band's tint derived from it. */
export const toneColor = (tone: StatusTone) => TONE_VAR[tone]
export const toneTint = (tone: StatusTone) => `color-mix(in srgb, ${TONE_VAR[tone]} 11%, transparent)`

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${EYEBROW} ${className}`} style={fs(9.5)}>{children}</div>
}

/** An uppercase label over a framed value, the field every phone card is made of. */
export function Field({ label, children, className = '', tabular = false }: { label: string; children: ReactNode; className?: string; tabular?: boolean }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <Eyebrow className="mb-[3px]">{label}</Eyebrow>
      <div className={`${BOX} truncate px-[10px] py-[7px] text-center font-semibold text-content ${tabular ? 'tabular-nums' : ''}`} style={fs(12.5, 'body')}>
        {children}
      </div>
    </div>
  )
}

/** Content longer than a field (a route, notes, people, files) under its own label, like every field. */
export function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <Eyebrow className="mb-[3px]">{label}</Eyebrow>
      {children}
    </div>
  )
}

export function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-full bg-surface-tertiary px-2 py-[2px] font-geist font-bold text-content-muted" style={fs(10)}>
      {children}
    </span>
  )
}

/** A collapsible section head: the label, what the day is, the count, and the chevron on the right. */
export function SectionHead({ label, sub, count, open, onToggle }: { label: string; sub?: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="mb-3 flex w-full items-center gap-2 px-0.5 text-start">
      <span className={EYEBROW} style={fs(11)}>{label}</span>
      {sub && <span className="truncate font-geist font-medium text-content-muted" style={fs(11.5)}>{sub}</span>}
      <CountPill>{count}</CountPill>
      {open
        ? <ChevronUp size={14} strokeWidth={2} className="ms-auto flex-none text-content-faint" />
        : <ChevronDown size={14} strokeWidth={2} className="ms-auto flex-none text-content-faint" />}
    </button>
  )
}

export function TypeChip({ type }: { type: string }) {
  const { t } = useTranslation()
  const info = typeInfo(type)
  return (
    <span className="inline-flex flex-none items-center gap-1 rounded-full border border-edge-faint bg-surface-card px-2 py-[2px] font-geist font-bold uppercase tracking-[.06em] text-content-muted" style={fs(9.5)}>
      <info.Icon size={11} strokeWidth={2.2} style={{ color: info.color }} />
      {t(info.chipKey)}
    </span>
  )
}

/** The square tile with the type's icon, used by rows and the detail pane. */
export function TypeTile({ type, size = 32, raised = false }: { type: string; size?: number; raised?: boolean }) {
  const info = typeInfo(type)
  return (
    <span className={`grid flex-none place-items-center ${raised ? 'rounded-[14px] bg-surface-card shadow-sm' : 'rounded-[10px] bg-surface-tertiary'}`} style={{ width: size, height: size }}>
      <info.Icon size={Math.round(size * 0.47)} strokeWidth={1.9} style={{ color: info.color }} />
    </span>
  )
}

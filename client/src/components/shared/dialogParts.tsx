// Presentation copied from TREK d4da05b. Family controllers retain data and focus ownership.
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { fs } from './DialogShell'
// The editors' fields in the cards' language: framed white boxes under small
// Geist eyebrows. The sizes are classes, not fs() styles, so components that
// only take a className (BookingLinkAndFiles, BookingCodeInput, AddressInput)
// get them too; both scale with the user's text size the same way.

/** A text input in the box look. Same height and inset as CustomSelect and CustomTimePicker, so they line up in a row. */
export const INPUT = 'block w-full min-w-0 rounded-[10px] border border-edge bg-surface-input px-3 py-2 text-[length:calc(13px*var(--fs-scale-body,1))] text-content outline-none placeholder:text-content-faint focus:ring-2 focus:ring-[color:var(--text-primary)] disabled:cursor-default disabled:opacity-50'
export const TEXTAREA = 'block w-full min-w-0 resize-none rounded-[10px] border border-edge bg-surface-input px-3 py-2 text-[length:calc(13px*var(--fs-scale-body,1))] leading-normal text-content outline-none placeholder:text-content-faint focus:ring-2 focus:ring-[color:var(--text-primary)] disabled:cursor-default disabled:opacity-50'
/** A value shown in the box look that cannot be typed into, such as an airport's timezone. */
export const READONLY_BOX = 'block w-full min-w-0 truncate rounded-[10px] border border-edge-faint bg-surface-tertiary px-3 py-2 text-[length:calc(12.5px*var(--fs-scale-body,1))] text-content-muted'
/** The eyebrow over a field, as a class for components that take a labelClass. */
export const LABEL = 'mb-[5px] block font-geist text-[length:calc(9.5px*var(--fs-scale-caption,1))] font-bold uppercase tracking-[.08em] text-content-faint'
/** Fields side by side; a narrow window stacks them. */
export const GRID_2 = 'grid grid-cols-2 items-start gap-3 max-sm:grid-cols-1'
export const GRID_3 = 'grid grid-cols-3 items-start gap-3 max-sm:grid-cols-1'
/** A framed group inside the body, such as one stop of a route: the card surface with white fields on it. */
export const PANEL = 'flex flex-col gap-3 rounded-[14px] border border-edge-faint bg-surface-secondary p-3'
/**
 * Wraps an AirportSelect or LocationSelect on a PANEL. Their search box keeps
 * the grey fill it has everywhere else; here it gets the white of the fields
 * beside it, set from outside because the phone shares the component.
 */
export const SEARCH_ON_PANEL = 'min-w-0 [&>div>div:first-child]:bg-surface-input'

/** An eyebrow label over one control, with an optional hint or error line under it. */
export function EditorField({ label, htmlFor, hint, error, className = '', children }: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  /** Shown in the danger colour in place of the hint. */
  error?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className={LABEL}>{label}</label>
      {children}
      {error
        ? <p className="m-0 mt-1 text-danger" style={fs(11)}>{error}</p>
        : hint ? <p className="m-0 mt-1 text-content-faint" style={fs(11)}>{hint}</p> : null}
    </div>
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

/** The track laid out as a grid of this many columns, for more choices than one row holds. */
const SEGMENTED_COLUMNS = { 2: 'grid w-full grid-cols-2', 3: 'grid w-full grid-cols-3' } as const

/** A row of choices on a grey track, the chosen one raised like the status filter (or filled like the view switcher). */
export function Segmented<T extends string>({ value, options, onChange, label, accent = false, fill = false, columns }: {
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  /** The group's accessible name. */
  label: string
  /** The chosen option in the accent fill instead of the raised card. */
  accent?: boolean
  /** Stretch across the row, each option taking an equal share. */
  fill?: boolean
  /** Wrap the options into a grid of this many equal columns on the same track. */
  columns?: keyof typeof SEGMENTED_COLUMNS
}) {
  const track = columns ? SEGMENTED_COLUMNS[columns] : fill ? 'flex w-full' : 'inline-flex'
  return (
    <div role="group" aria-label={label} className={`${track} flex-none gap-0.5 rounded-[10px] bg-surface-tertiary p-[3px]`}>
      {options.map(o => {
        const on = o.value === value
        const look = on ? (accent ? 'bg-accent text-accent-text' : 'bg-surface-card text-content shadow-sm') : 'text-content-muted hover:text-content'
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={on}
            className={`${fill ? 'flex-1' : ''} ${columns ? 'min-w-0' : ''} inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-3 py-1.5 font-medium ${look}`}
            style={fs(12.5, 'body')}>
            {o.icon}{o.label}
          </button>
        )
      })}
    </div>
  )
}

/** The dashed full-width button that adds a row: a stop, a leg. */
export function AddRowButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-edge px-3 py-2 font-semibold text-content-muted hover:border-content-faint hover:text-content disabled:cursor-default disabled:opacity-50"
      style={fs(12, 'body')}>
      <Plus size={13} strokeWidth={2.2} />{children}
    </button>
  )
}

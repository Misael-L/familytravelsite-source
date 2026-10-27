import { TypeTile } from '../bookings/bookingPresentation'
import { Ticket, Route } from 'lucide-react'
import { TimePill, SoftPill } from '../planParts'
import { fs } from '../../shared/DialogShell'
import type { FamilyDayTimelineRowModel } from './familyDayTimeline'
import { TIMELINE_ROW } from './familyDayPlanSurfaces'

export function FamilyDayTimelineEntry({
  row,
  type,
  onOpen,
}: {
  type?: string
  row: FamilyDayTimelineRowModel
  onOpen: (trigger: HTMLElement) => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={event => onOpen(event.currentTarget)}
      className={`${TIMELINE_ROW} w-full border-0 bg-transparent text-left`}
    >
      <TypeTile type={type ?? (row.source === 'transport' ? 'transport_other' : 'other')} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-content" style={fs(13, 'body')}>{row.title}</span>
        {row.clockLabel && <span className="mt-1 flex"><TimePill>{row.clockLabel}</TimePill></span>}
      </span>
    </button>
  )
}

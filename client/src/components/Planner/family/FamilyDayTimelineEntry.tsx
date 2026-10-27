import type { FamilyDayTimelineRowModel } from './familyDayTimeline'
import { TIMELINE_ROW } from './familyDayPlanSurfaces'

export function FamilyDayTimelineEntry({
  row,
  onOpen,
}: {
  row: FamilyDayTimelineRowModel
  onOpen: (trigger: HTMLElement) => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={event => onOpen(event.currentTarget)}
      className={`${TIMELINE_ROW} w-full border-0 bg-transparent text-left`}
    >
      <span className="min-w-0 flex-1 truncate text-body font-medium text-content">{row.title}</span>
      {row.clockLabel ? <span className="flex-none text-caption text-content-faint">{row.clockLabel}</span> : null}
    </button>
  )
}

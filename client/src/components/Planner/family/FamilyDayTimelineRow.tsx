import React from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import PlaceAvatar from '../../shared/PlaceAvatar'
import type { FamilyScheduleItem } from '../../../data/supabase/scheduleItems'
import type { FamilyTripPlace } from '../../../data/supabase/tripPlaces'
import { ROW_CONTROL, TIMELINE_ROW } from './familyDayPlanSurfaces'

export type FamilyDayTimelineRowProps = {
  dayId: string
  item: FamilyScheduleItem
  place: FamilyTripPlace | undefined
  isFirst: boolean
  isLast: boolean
  onMoveItem: (dayId: string, itemId: string, direction: -1 | 1) => void
  onRemoveItem: (itemId: string) => void
  clockLabel?: string | null
  moveUpEnabled?: boolean
  moveDownEnabled?: boolean
  onActivate?: (trigger: HTMLElement) => void
}

export default function FamilyDayTimelineRow({
  dayId,
  item,
  place,
  isFirst,
  isLast,
  onMoveItem,
  onRemoveItem,
  clockLabel = null,
  moveUpEnabled,
  moveDownEnabled,
  onActivate,
}: FamilyDayTimelineRowProps): React.ReactElement {
  const { t } = useTranslation()
  const label = place?.name || item.activity
  const upDisabled = moveUpEnabled != null ? !moveUpEnabled : isFirst
  const downDisabled = moveDownEnabled != null ? !moveDownEnabled : isLast

  return (
    <div className={TIMELINE_ROW}>
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
      {onActivate ? (
        <button type="button" onClick={event => onActivate?.(event.currentTarget)} className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-body font-medium text-content">
          {label}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate text-body font-medium text-content">
          {label}
        </span>
      )}
      {clockLabel ? <span className="flex-none text-caption text-content-faint">{clockLabel}</span> : null}
      <div className="flex flex-none items-center gap-0.5">
        <button
          type="button"
          disabled={upDisabled}
          onClick={() => onMoveItem(dayId, item.id, -1)}
          aria-label={t('dayplan.moveUp')}
          title={t('dayplan.moveUp')}
          className={ROW_CONTROL}
        >
          <ArrowUp size={12} strokeWidth={2} />
        </button>
        <button
          type="button"
          disabled={downDisabled}
          onClick={() => onMoveItem(dayId, item.id, 1)}
          aria-label={t('dayplan.moveDown')}
          title={t('dayplan.moveDown')}
          className={ROW_CONTROL}
        >
          <ArrowDown size={12} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => onRemoveItem(item.id)}
          aria-label={t('common.delete')}
          title={t('common.delete')}
          className={`${ROW_CONTROL} hover:text-danger`}
        >
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

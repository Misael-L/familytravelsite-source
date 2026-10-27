// Copied from TREK PlacesSidebarRow.tsx d4da05b; UUID view adapter, no Nest writes or drag payloads.
import React, { useId } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, Check, Star } from 'lucide-react'
import PlaceAvatar from '../../shared/PlaceAvatar'
import { Tooltip } from '../../shared/Tooltip'
import { fs } from '../../shared/DialogShell'
import { getCategoryIcon } from '../../shared/categoryIcons'
import { MoreButton, SoftPill, type MenuEntry } from '../planParts'
import type { FamilyTripPlace as Place } from '../../../data/supabase/tripPlaces'
type Category = { name: string; icon: string; color?: string }

interface MemoPlaceRowProps {
  place: Place
  category: Category | undefined
  isSelected: boolean
  isPlanned: boolean
  inDay: boolean
  isChecked: boolean
  selectMode: boolean
  selectedDayId: string | null
  canEditPlaces: boolean
  isMobile: boolean
  t: (key: string, params?: Record<string, any>) => string
  onPlaceClick: (id: string | null) => void
  onContextMenu: (e: React.MouseEvent, place: Place) => void
  /** The same entries as the right-click menu, for the row's "…". */
  menuItems: (place: Place, dayId: string | null) => MenuEntry[]
  onAssignToDay: (placeId: string, dayId?: string) => void
  toggleSelected: (id: string) => void
  setDayPickerPlace: (place: Place) => void
  registerPlaceRow: (placeId: string, element: HTMLDivElement | null) => void
}

export const FamilyPlaceRow = React.memo(function FamilyPlaceRow({
  place, category: cat, isSelected, inDay, isChecked,
  selectMode, selectedDayId, isMobile, t,
  onPlaceClick, onContextMenu, menuItems, onAssignToDay, toggleSelected, setDayPickerPlace, registerPlaceRow,
}: MemoPlaceRowProps) {
  const nameId = useId()
  const hasGeometry = false
  // Touch is reached through a long press instead of being locked out (#1616).
  const dragDisabled = true
  const showAddToDay = !selectMode && !inDay
  // Below lg a tap opens the day picker sheet, which carries the same actions.
  const showMore = !selectMode && !isMobile
  // One place for what a row does, so the keyboard path below cannot drift from the click.
  const activate = () => {
    if (selectMode) {
      toggleSelected(place.id)
    } else if (isMobile) {
      setDayPickerPlace(place)
    } else {
      onPlaceClick(isSelected ? null : place.id)
    }
  }
  let tone = 'hover:bg-surface-hover'
  if (isChecked) tone = 'bg-accent-subtle'
  else if (isSelected) tone = 'bg-surface-selected'
  const CatIcon = cat ? getCategoryIcon(cat.icon) : null
  const subline = place.notes || cat?.name
  return (
    <div
      ref={element => registerPlaceRow(place.id, element)}
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      // Named by the place alone: the indicators, the rating and the buttons inside
      // would otherwise run into the name a screen reader (and a test) reads first.
      aria-labelledby={nameId}
      data-place-id={place.id}
      draggable={!selectMode && !dragDisabled}
      onClick={activate}
      onKeyDown={e => {
        // Only when the row itself has focus — the buttons inside it keep their own key handling.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() }
      }}
      onContextMenu={selectMode ? undefined : e => onContextMenu(e, place)}
      className={`group mb-px flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--text-primary)] ${tone} ${selectMode || dragDisabled ? 'cursor-pointer' : 'cursor-grab'}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 52px' }}
    >
      {selectMode && (
        <span className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-full transition-colors ${isChecked ? 'bg-accent' : 'border-[1.5px] border-edge bg-surface-card'}`}>
          {isChecked && <Check size={11} strokeWidth={3} className="text-accent-text" />}
        </span>
      )}
      <PlaceAvatar place={{ id: place.id, name: place.name, lat: place.lat, lng: place.lng, image_url: place.imageUrl, google_place_id: null, osm_id: null }} category={cat} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* A stroke of the colour the track is drawn in — the map has no legend
              of its own, so this is what tells you which line is this row (#776).
              A line rather than another icon, so it doesn't read as a second
              category glyph next to the one beside it. */}
          {cat && CatIcon && (
            <Tooltip label={cat.name}>
              <span role="img" aria-label={cat.name} className="inline-flex flex-none">
                <CatIcon size={12} strokeWidth={2.2} style={{ color: cat.color || 'var(--text-muted)' }} />
              </span>
            </Tooltip>
          )}
          <span id={nameId} className="min-w-0 truncate font-semibold leading-tight text-content" style={fs(13, 'body')}>
            {place.name}
          </span>

        </div>
        {subline && (
          // Rendered, like the same line in the day plan: the description is
          // Markdown everywhere else, and printing it raw here was the one
          // place a formatted place read as `_underscores_`. Still clamped to
          // one line — the row is a list entry, not the inspector.
          <div className="collab-note-md mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-content-faint" style={{ ...fs(11), lineHeight: 1.2, maxHeight: '1.2em' }}>
            <Markdown remarkPlugins={[remarkGfm]}>{subline}</Markdown>
          </div>
        )}
      </div>
      {(showAddToDay || showMore) && (
        // The row selects on click; the buttons and the menu they open act on their own.
        <div role="presentation" className="flex flex-none items-center gap-0.5" onClick={e => e.stopPropagation()}>
          {showAddToDay && (
            <Tooltip label={t('planner.addToDay')}>
              <button type="button"
                onClick={() => onAssignToDay(place.id)}
                aria-label={t('planner.addToDay')}
                className="grid h-[26px] w-[26px] place-items-center rounded-full bg-surface-card text-content-muted shadow-sm ring-1 ring-edge-faint transition-colors hover:bg-accent hover:text-accent-text hover:ring-transparent"
              >
                <Plus size={13} strokeWidth={2.4} />
              </button>
            </Tooltip>
          )}
          {showMore && <MoreButton label={t('files.menu')} items={menuItems(place, selectedDayId)} />}
        </div>
      )}
    </div>
  )
})

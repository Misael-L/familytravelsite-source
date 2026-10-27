import FamilyPlacesEmptyState from './FamilyPlacesEmptyState'
import { FamilyPlacesHeader } from './FamilyPlacesHeader'
import { FamilyPlaceRow } from './FamilyPlaceRow'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronDown, MapPin, Navigation, Pencil, Plus, Route, Search, Trash2, Upload, X } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import PlaceAvatar from '../../shared/PlaceAvatar'
import { getCategoryIcon } from '../../shared/categoryIcons'
import { ContextMenu, useContextMenu } from '../../shared/ContextMenu'
import type { FamilyPlaceCategory } from '../../../data/supabase/familyPlaceCategories'
import type { FamilyTripPlace } from '../../../data/supabase/tripPlaces'
import type { FamilyTripTrack } from '../../../data/supabase/tripTracks'
import { geometryLengthMeters } from '../../../lib/tracks/parseGpxKml'
import type { LucideIcon } from 'lucide-react'

const UNCATEGORIZED_FILTER = 'uncategorized'

type FilterTab = 'all' | 'unplanned' | 'tracks'

type FamilyPlacesSidebarProps = {
  places: FamilyTripPlace[]
  tracks?: FamilyTripTrack[]
  plannedPlaceIds: Set<string>
  selectedPlaceId: string | null
  canMutate?: boolean
  onSelectPlace: (id: string | null) => void
  onAddPlace: () => void
  onDeletePlace: (id: string) => void
  onAssignToDay: (placeId: string) => void
  onImportFile: () => void
  onDeleteTrack: (id: string) => void
  onEditPlace: (id: string) => void
  onToastWrite: (kind?: 'edit' | 'import' | 'export' | 'reorder') => void
  isMobile?: boolean
  categories?: FamilyPlaceCategory[]
  categoriesEnabled?: boolean
}

function formatTrackKm(meters: number | null, t: (key: string, vars?: Record<string, string | number>) => string): string | null {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return null
  const km = meters / 1000
  const label = km >= 10 ? km.toFixed(0) : km.toFixed(1)
  return t('places.trackLengthKm', { km: label })
}

export default function FamilyPlacesSidebar({
  places,
  tracks = [],
  plannedPlaceIds,
  selectedPlaceId,
  canMutate = false,
  onSelectPlace,
  onAddPlace,
  onDeletePlace,
  onAssignToDay,
  onImportFile,
  onDeleteTrack,
  onEditPlace,
  onToastWrite,
  isMobile = false,
  categories = [],
  categoriesEnabled = true,
}: FamilyPlacesSidebarProps): React.ReactElement {
  const { t } = useTranslation()
  const ctxMenu = useContextMenu()
  const [search, setSearch] = useState('')
  const [sortByName, setSortByName] = useState(false)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set())
  const [catDropOpen, setCatDropOpen] = useState(false)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const hasTracks = tracks.length > 0

  useEffect(() => {
    if (filter === 'tracks' && !hasTracks) setFilter('all')
  }, [hasTracks, filter])

  useEffect(() => {
    if (!categoriesEnabled) {
      setCategoryFilters(new Set())
      setCatDropOpen(false)
    }
  }, [categoriesEnabled])

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    return places.filter(p => {
      if (categoryFilters.size > 0) {
        if (p.familyPlaceCategoryId == null) {
          if (!categoryFilters.has(UNCATEGORIZED_FILTER)) return false
        } else if (!categoryFilters.has(p.familyPlaceCategoryId)) return false
      }
      if (q && !p.name.toLowerCase().includes(q) && !(p.notes || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [places, search, categoryFilters])

  const filtered = useMemo(() => {
    if (filter === 'unplanned') return searched.filter(p => !plannedPlaceIds.has(p.id))
    if (filter === 'tracks') return []
    return sortByName ? [...searched].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) : searched
  }, [searched, filter, plannedPlaceIds, sortByName])

  const searchedTracks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tracks.filter(tr => !q || tr.name.toLowerCase().includes(q))
  }, [tracks, search])

  const counts = {
    all: searched.length,
    unplanned: searched.filter(p => !plannedPlaceIds.has(p.id)).length,
    tracks: searchedTracks.length,
  }

  const tabs: Array<{ id: FilterTab; label: string }> = [
    { id: 'all', label: t('places.all') },
    { id: 'unplanned', label: t('places.unplanned') },
  ]
  if (hasTracks) tabs.push({ id: 'tracks', label: t('places.filterTracks') })

  useEffect(() => {
    if (!selectedPlaceId) return
    const row = rowRefs.current.get(selectedPlaceId)
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [selectedPlaceId])

  const openContextMenu = (e: React.MouseEvent, place: FamilyTripPlace) => {
    const mapsUrl = place.lat != null && place.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
      : null
    const items: Array<{ label?: string; icon?: LucideIcon; onClick?: () => void; danger?: boolean; divider?: boolean }> = []
    if (categoriesEnabled) items.push({ label: t('common.edit'), icon: Pencil, onClick: () => onEditPlace(place.id) })
    items.push({ label: t('planner.addToDay'), icon: CalendarDays, onClick: () => onAssignToDay(place.id) })
    if (mapsUrl) items.push({ label: t('inspector.google'), icon: Navigation, onClick: () => window.open(mapsUrl, '_blank') })
    items.push({ divider: true })
    items.push({ label: t('common.delete'), icon: Trash2, danger: true, onClick: () => onDeletePlace(place.id) })
    ctxMenu.open(e, items)
  }

  const showingTracks = filter === 'tracks'
  const emptyLabel = showingTracks ? t('places.noneFoundTracks') : t('places.noneFound')
  const listCount = showingTracks
    ? (searchedTracks.length === 1 ? t('places.tracksCountSingular') : t('places.tracksCount', { count: searchedTracks.length }))
    : (filtered.length === 1 ? t('places.countSingular') : t('places.count', { count: filtered.length }))

  return (
    <div style={{ display: 'flex', flex: '1 1 0%', minHeight: 0, flexDirection: 'column', height: '100%', fontFamily: 'var(--font-system)', position: 'relative' }}>
      <FamilyPlacesHeader search={search} setSearch={setSearch} filter={filter} setFilter={value => setFilter(value as FilterTab)}
        tabs={tabs} counts={counts} onAddPlace={onAddPlace} onImportFile={onImportFile}
        sortByName={sortByName} onSort={() => setSortByName(value => !value)}>
        {categoriesEnabled && categories.length > 0 && (() => {
          const toggle = (id: string) => {
            setCategoryFilters(prev => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }
          const label = categoryFilters.size === 0
            ? t('places.allCategories')
            : categoryFilters.size === 1
              ? (categoryFilters.has(UNCATEGORIZED_FILTER)
                ? t('places.noCategory')
                : categories.find(c => categoryFilters.has(c.id))?.name || t('places.allCategories'))
              : `${categoryFilters.size} ${t('places.categoriesSelected')}`
          return (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setCatDropOpen(v => !v)}
                className="bg-surface-card text-content"
                style={{
                  maxWidth: 130, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-primary)',
                  fontSize: 'calc(12px * var(--fs-scale-body, 1))',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                <ChevronDown size={12} className="text-content-faint" style={{ flexShrink: 0, transform: catDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
              {catDropOpen && (
                <div className="bg-surface-card" style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4,
                  border: '1px solid var(--border-primary)', borderRadius: 10,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 4, maxHeight: 200, overflowY: 'auto',
                }}>
                  {categories.map(c => {
                    const active = categoryFilters.has(c.id)
                    const CatIcon = getCategoryIcon(c.iconKey)
                    return (
                      <button key={c.id} type="button" onClick={() => toggle(c.id)} className={`text-content ${active ? 'bg-surface-hover' : 'bg-transparent'}`} style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 'calc(12px * var(--fs-scale-body, 1))',
                        textAlign: 'left',
                      }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: active ? 'none' : '1.5px solid var(--border-primary)',
                          background: active ? (c.colorHex || 'var(--accent)') : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {active && <Check size={10} strokeWidth={3} color="white" />}
                        </div>
                        <CatIcon size={12} strokeWidth={2} color={c.colorHex || 'var(--text-muted)'} />
                        <span style={{ flex: 1 }}>{c.name}</span>
                      </button>
                    )
                  })}
                  {places.some(p => p.familyPlaceCategoryId == null) && (() => {
                    const active = categoryFilters.has(UNCATEGORIZED_FILTER)
                    return (
                      <button type="button" onClick={() => toggle(UNCATEGORIZED_FILTER)} className={`text-content-muted ${active ? 'bg-surface-hover' : 'bg-transparent'}`} style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 'calc(12px * var(--fs-scale-body, 1))',
                        textAlign: 'left', borderTop: '1px solid var(--border-faint)', marginTop: 2,
                      }}>
                        <div className={active ? 'bg-[var(--text-faint)]' : 'bg-transparent'} style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: active ? 'none' : '1.5px solid var(--border-primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {active && <Check size={10} strokeWidth={3} color="white" />}
                        </div>
                        <MapPin size={12} strokeWidth={2} color="var(--text-faint)" />
                        <span style={{ flex: 1 }}>{t('places.noCategory')}</span>
                      </button>
                    )
                  })()}
                  {categoryFilters.size > 0 && (
                    <button type="button" onClick={() => setCategoryFilters(new Set())} className="bg-transparent text-content-faint" style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      width: '100%', padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 'calc(11px * var(--fs-scale-caption, 1))',
                      marginTop: 2, borderTop: '1px solid var(--border-faint)',
                    }}>
                      <X size={10} /> {t('places.clearFilter')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })()}
      </FamilyPlacesHeader>

      <div style={{ padding: '6px 16px 4px', flexShrink: 0 }}>
        <span className="text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))' }}>
          {listCount}
        </span>
      </div>

      <div className="trek-stagger" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {showingTracks ? (
          searchedTracks.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px', gap: 8 }}>
              <span className="text-content-faint" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))' }}>
                {emptyLabel}
              </span>
            </div>
          ) : searchedTracks.map(track => {
            const km = formatTrackKm(geometryLengthMeters(track.geometry), t)
            return (
              <div
                key={track.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px 9px 16px',
                  borderBottom: '1px solid var(--border-faint)',
                }}
              >
                <div
                  className="bg-surface-hover text-content-faint"
                  style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Route size={16} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="text-content" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', lineHeight: 1.2 }}>
                    {track.name}
                  </span>
                  {km && (
                    <span className="text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', display: 'block', lineHeight: 1.2, marginTop: 2 }}>
                      {km}
                    </span>
                  )}
                </div>
                {canMutate && (
                  <button
                    type="button"
                    onClick={() => onDeleteTrack(track.id)}
                    className="bg-surface-hover text-content-faint"
                    aria-label={t('places.deleteTrack')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 20, height: 20, borderRadius: 6, border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            )
          })
        ) : filtered.length === 0 ? (
          <FamilyPlacesEmptyState scene="search" mood="confused" size={92} fill surface="var(--bg-secondary)"
            title={emptyLabel} action={<button type="button" onClick={onAddPlace}
              className="text-caption text-content underline underline-offset-2 hover:text-accent">{t('places.addPlace')}</button>} />
        ) : filtered.map(place => {
          const isSelected = place.id === selectedPlaceId
          return (
            <FamilyPlaceRow key={place.id} place={place}
              category={categoriesEnabled && place.familyPlaceCategoryId ? {name: place.familyPlaceCategoryName ?? '', icon: place.familyPlaceCategoryIcon ?? '', color: place.familyPlaceCategoryColor ?? undefined} : undefined}
              isSelected={isSelected} isPlanned={plannedPlaceIds.has(place.id)} inDay={false} isChecked={false} selectMode={false}
              selectedDayId={null} canEditPlaces={canMutate} isMobile={isMobile} t={t}
              onPlaceClick={onSelectPlace} onContextMenu={openContextMenu}
              menuItems={() => [
                categoriesEnabled && canMutate ? {label: t('common.edit'), icon: Pencil, onClick: () => onEditPlace(place.id)} : null,
                {label: t('planner.addToDay'), icon: CalendarDays, onClick: () => onAssignToDay(place.id)},
                canMutate ? {label: t('common.delete'), icon: Trash2, danger: true, onClick: () => onDeletePlace(place.id)} : null,
              ].filter(Boolean)}
              onAssignToDay={onAssignToDay} toggleSelected={() => {}} setDayPickerPlace={value => onSelectPlace(value.id)}
              registerPlaceRow={(id, el) => {if (el) rowRefs.current.set(id, el); else rowRefs.current.delete(id)}} />
          )
        })}
      </div>

      <ContextMenu menu={ctxMenu.menu} onClose={ctxMenu.close} />
    </div>
  )
}

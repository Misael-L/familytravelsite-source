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
    return searched
  }, [searched, filter, plannedPlaceIds])

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--font-system)', position: 'relative' }}>
      <div className="border-b border-edge-faint" style={{ padding: '14px 16px 10px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={onAddPlace}
          className="bg-accent text-accent-text"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '8px 12px', borderRadius: 12, border: 'none',
            fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10,
          }}
        >
          <Plus size={14} strokeWidth={2} /> {t('places.addPlace')}
        </button>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button
            type="button"
            onClick={onImportFile}
            className="border border-dashed border-edge text-content-faint"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              flex: 1, padding: '5px 12px', borderRadius: 8,
              background: 'none', fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Upload size={11} strokeWidth={2} /> {t('places.importFile')}
          </button>
          <button
            type="button"
            onClick={() => onToastWrite('import')}
            className="border border-dashed border-edge text-content-faint"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              flex: 1, padding: '5px 12px', borderRadius: 8,
              background: 'none', fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <MapPin size={11} strokeWidth={2} /> {t('places.importList')}
          </button>
        </div>
        <div className="bg-edge" style={{ height: 1, margin: '2px 0 10px' }} />

        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {tabs.map(tab => {
            const active = filter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={active ? 'bg-accent text-accent-text' : 'bg-surface-card text-content'}
                style={{
                  appearance: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 99,
                  fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 500, whiteSpace: 'nowrap',
                  boxShadow: active ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
                }}
              >
                {tab.label}
                <span className={active ? 'text-accent-text' : 'text-content-faint'} style={{
                  fontSize: 'calc(9px * var(--fs-scale-caption, 1))', fontWeight: 600, lineHeight: 1,
                  background: active ? 'color-mix(in srgb, var(--accent-text) 22%, transparent)' : 'var(--bg-tertiary)',
                  padding: '1px 5px', borderRadius: 99, minWidth: 14, textAlign: 'center',
                }}>
                  {counts[tab.id]}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={13} strokeWidth={1.8} color="var(--text-faint)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('places.search')}
            className="bg-surface-tertiary text-content"
            style={{
              width: '100%', padding: '7px 30px 7px 30px', borderRadius: 10,
              border: 'none', fontSize: 'calc(12px * var(--fs-scale-body, 1))',
              outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <X size={12} strokeWidth={2} color="var(--text-faint)" />
            </button>
          )}
        </div>

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
            <div style={{ marginTop: 6, position: 'relative' }}>
              <button
                type="button"
                onClick={() => setCatDropOpen(v => !v)}
                className="bg-surface-card text-content"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
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
      </div>

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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px', gap: 8 }}>
            <span className="text-content-faint" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))' }}>
              {emptyLabel}
            </span>
            <button type="button" onClick={onAddPlace} className="text-content" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
              {t('places.addPlace')}
            </button>
          </div>
        ) : filtered.map(place => {
          const isSelected = place.id === selectedPlaceId
          return (
            <div
              key={place.id}
              ref={el => {
                if (el) rowRefs.current.set(place.id, el)
                else rowRefs.current.delete(place.id)
              }}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelectPlace(isSelected && !isMobile ? null : place.id)}
              onContextMenu={e => openContextMenu(e, place)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px 9px 16px',
                cursor: 'pointer',
                background: isSelected ? 'var(--border-faint)' : 'transparent',
                borderBottom: '1px solid var(--border-faint)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
            >
              <PlaceAvatar
                place={{ id: place.id, name: place.name, lat: place.lat, lng: place.lng, image_url: place.imageUrl, google_place_id: null, osm_id: null }}
                size={34}
                category={categoriesEnabled && place.familyPlaceCategoryId
                  ? { color: place.familyPlaceCategoryColor ?? undefined, icon: place.familyPlaceCategoryIcon ?? undefined }
                  : null}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                  <span className="text-content" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                    {place.name}
                  </span>
                  {place.isPrimary && (
                    <span style={{
                      flexShrink: 0, fontSize: 'calc(9px * var(--fs-scale-caption, 1))', fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      color: 'var(--accent-text)', background: 'var(--accent)',
                      padding: '1px 6px', borderRadius: 99,
                    }}>
                      Primary
                    </span>
                  )}
                </div>
                {categoriesEnabled && place.familyPlaceCategoryName && (
                  <span className="text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', lineHeight: 1.2, marginTop: 2 }}>
                    {place.familyPlaceCategoryName}
                  </span>
                )}
                {place.notes && (
                  <span className="text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', lineHeight: 1.2, marginTop: 2 }}>
                    {place.notes}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onAssignToDay(place.id) }}
                className="bg-surface-hover text-content-faint"
                aria-label={t('planner.addToDay')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: 6, border: 'none', cursor: 'pointer', padding: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-text)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-faint)' }}
              >
                <Plus size={12} strokeWidth={2.5} />
              </button>
            </div>
          )
        })}
      </div>

      <ContextMenu menu={ctxMenu.menu} onClose={ctxMenu.close} />
    </div>
  )
}

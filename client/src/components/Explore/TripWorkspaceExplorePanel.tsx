/**
 * W8.3–W8.6 Workspace Explore tab — catalog lists, detail, Add to trip, Saved hearts.
 */
import React, { useEffect, useRef, useState } from 'react'
import { Heart } from 'lucide-react'
import {
  listExploreCatalog,
  listExploreCatalogByIds,
  type ExploreCatalogKind,
  type ExploreCatalogListItem,
  type ExploreDeepLink,
} from '../../data/supabase/catalogExploreLists'
import { listSavedCatalogEntityIds } from '../../data/supabase/catalogSaves'
import { toDisplayImageUrl } from '../../data/supabase/catalogExploreMedia'
import type { FamilyScheduleItem } from '../../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { StageExploreOp } from '../../data/supabase/exploreAddToTrip'
import { useTranslation } from '../../i18n'
import ExploreEntityDetailPanel from './ExploreEntityDetailPanel'

const KINDS: { id: ExploreCatalogKind; labelKey: string; fallback: string }[] = [
  { id: 'place', labelKey: 'trip.explore.kind.places', fallback: 'Places' },
  { id: 'experience', labelKey: 'trip.explore.kind.experiences', fallback: 'Experiences' },
  { id: 'food', labelKey: 'trip.explore.kind.foods', fallback: 'Foods' },
  { id: 'hotel', labelKey: 'trip.explore.kind.hotels', fallback: 'Hotels' },
]

type ListPhase = 'loading' | 'noCountries' | 'empty' | 'loaded' | 'error'

export type TripWorkspaceExplorePanelProps = {
  tripId: string
  countryIds: string[]
  pendingDeepLink: ExploreDeepLink | null
  onConsumeDeepLink: () => void
  canMutate: boolean
  writeMode?: 'direct' | 'draft' | 'nudge' | 'deny'
  writeModeFor?: (kind: ExploreCatalogKind) => 'direct' | 'draft' | 'nudge' | 'deny'
  nextSortOrder?: number
  stageOp?: StageExploreOp
  tripPlaceIds: readonly string[]
  days: FamilyTripDay[]
  scheduleItems: FamilyScheduleItem[]
  onItineraryChanged: () => Promise<void>
  familyId: string | null
  personId: string | null
}

export default function TripWorkspaceExplorePanel({
  tripId,
  countryIds,
  pendingDeepLink,
  onConsumeDeepLink,
  canMutate,
  writeMode,
  writeModeFor,
  nextSortOrder,
  stageOp,
  tripPlaceIds,
  days,
  scheduleItems,
  onItineraryChanged,
  familyId,
  personId,
}: TripWorkspaceExplorePanelProps): React.ReactElement {
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }

  const [kind, setKind] = useState<ExploreCatalogKind>(pendingDeepLink?.kind ?? 'place')
  const [items, setItems] = useState<ExploreCatalogListItem[]>([])
  const [phase, setPhase] = useState<ListPhase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [presentedEntity, setPresentedEntity] = useState<ExploreDeepLink | null>(null)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const loadGen = useRef(0)

  const onConsumeDeepLinkRef = useRef(onConsumeDeepLink)
  onConsumeDeepLinkRef.current = onConsumeDeepLink

  // Reset module navigation when trip changes
  useEffect(() => {
    setPresentedEntity(null)
    setKind('place')
    setShowSavedOnly(false)
  }, [tripId])

  // Deep-link: open detail by id immediately (iOS P4 — no list-membership required)
  useEffect(() => {
    if (!pendingDeepLink) return
    setKind(pendingDeepLink.kind)
    setPresentedEntity({ kind: pendingDeepLink.kind, id: pendingDeepLink.id })
    onConsumeDeepLinkRef.current()
  }, [pendingDeepLink])

  const loadRows = () => {
    if (showSavedOnly) {
      if (!familyId || !personId) return Promise.resolve([] as ExploreCatalogListItem[])
      return listSavedCatalogEntityIds({ familyId, personId, kind })
        .then(ids => listExploreCatalogByIds({ kind, countryIds, ids }))
    }
    return listExploreCatalog({ kind, countryIds })
  }

  useEffect(() => {
    if (presentedEntity) return // pause list refetch noise while on detail
    if (countryIds.length === 0) {
      setItems([])
      setPhase('noCountries')
      setError(null)
      return
    }

    const gen = ++loadGen.current
    setPhase('loading')
    setError(null)

    void loadRows()
      .then(rows => {
        if (gen !== loadGen.current) return
        setItems(rows)
        setPhase(rows.length === 0 ? 'empty' : 'loaded')
      })
      .catch((err: unknown) => {
        if (gen !== loadGen.current) return
        setItems([])
        setPhase('error')
        setError(err instanceof Error ? err.message : tr('trip.explore.error', 'Something went wrong.'))
      })
  }, [tripId, kind, countryIds.join(','), presentedEntity, showSavedOnly, familyId, personId]) // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => {
    setPhase('loading')
    setError(null)
    void loadRows()
      .then(rows => {
        setItems(rows)
        setPhase(rows.length === 0 ? 'empty' : 'loaded')
      })
      .catch((err: unknown) => {
        setItems([])
        setPhase('error')
        setError(err instanceof Error ? err.message : tr('trip.explore.error', 'Something went wrong.'))
      })
  }

  if (presentedEntity) {
    return (
      <ExploreEntityDetailPanel
        kind={presentedEntity.kind}
        entityId={presentedEntity.id}
        onBack={() => setPresentedEntity(null)}
        tripId={tripId}
        canMutate={canMutate}
        writeMode={writeModeFor?.(presentedEntity.kind) ?? writeMode}
        nextSortOrder={nextSortOrder}
        stageOp={stageOp}
        tripPlaceIds={tripPlaceIds}
        days={days}
        scheduleItems={scheduleItems}
        onItineraryChanged={onItineraryChanged}
        familyId={familyId}
        personId={personId}
      />
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-grouped, var(--surface, #f8fafc))',
      }}
    >
      <div
        role="tablist"
        aria-label={tr('trip.explore.kinds', 'Explore categories')}
        style={{
          display: 'flex',
          gap: 6,
          padding: '12px 16px 8px',
          flexWrap: 'wrap',
        }}
      >
        {KINDS.map(k => {
          const active = kind === k.id
          return (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setKind(k.id)}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 500,
                border: active ? '2px solid var(--text-primary, #111)' : '2px solid var(--border-primary, #e2e8f0)',
                background: active ? 'var(--bg-hover, #f1f5f9)' : 'var(--bg-card, #fff)',
                color: 'var(--text-primary, #111)',
              }}
            >
              {tr(k.labelKey, k.fallback)}
            </button>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '0 16px 8px',
        }}
      >
        <button
          type="button"
          onClick={() => setShowSavedOnly(v => !v)}
          aria-pressed={showSavedOnly}
          aria-label={tr('trip.explore.save.filter', 'Saved picks filter')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            borderRadius: 999,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 500,
            border: '1px solid var(--edge-faint, #e2e8f0)',
            background: showSavedOnly ? 'rgba(220, 38, 38, 0.12)' : 'var(--bg-card, #fff)',
            color: showSavedOnly ? 'rgba(220, 38, 38, 0.9)' : 'var(--text-secondary, #64748b)',
          }}
        >
          <Heart size={14} strokeWidth={2.2} fill={showSavedOnly ? 'currentColor' : 'none'} aria-hidden />
          {tr('trip.explore.save.chip', 'Saved')}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 24px' }}>
        {phase === 'loading' && (
          <div
            role="status"
            style={{
              padding: 48,
              textAlign: 'center',
              color: 'var(--text-secondary, #64748b)',
              fontSize: 14,
            }}
          >
            {tr('trip.explore.loading', 'Loading catalog…')}
          </div>
        )}

        {phase === 'noCountries' && (
          <EmptyState
            title={tr('trip.explore.noCountriesTitle', 'No trip countries')}
            subtitle={tr(
              'trip.explore.noCountriesBody',
              'Add countries on the Map or in trip setup to browse the Family Catalog here.',
            )}
          />
        )}

        {phase === 'empty' && (
          <EmptyState
            title={
              showSavedOnly
                ? tr('trip.explore.save.emptyTitle', 'No saved picks')
                : tr('trip.explore.emptyTitle', 'Nothing here yet')
            }
            subtitle={
              showSavedOnly
                ? tr(
                  'trip.explore.save.emptyBody',
                  'Heart catalog items from detail or the map to see them here for this trip’s countries.',
                )
                : tr(
                  'trip.explore.emptyBody',
                  'No catalog entries for this category in the trip countries.',
                )
            }
          />
        )}

        {phase === 'error' && (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)', marginBottom: 12 }}>
              {error ?? tr('trip.explore.error', 'Something went wrong.')}
            </p>
            <button
              type="button"
              onClick={retry}
              style={{
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--accent, #2563eb)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {tr('trip.explore.retry', 'Try again')}
            </button>
          </div>
        )}

        {phase === 'loaded' && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setPresentedEntity({ kind: item.kind, id: item.id })}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    padding: 10,
                    borderRadius: 12,
                    border: '1px solid var(--edge-faint, #e2e8f0)',
                    background: 'var(--bg-card, #fff)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: 'inherit',
                  }}
                >
                  {item.coverUrl ? (
                    <img
                      src={toDisplayImageUrl(item.coverUrl)}
                      alt=""
                      width={48}
                      height={48}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        objectFit: 'cover',
                        flexShrink: 0,
                        background: 'var(--bg-hover, #f1f5f9)',
                      }}
                    />
                  ) : (
                    <div
                      aria-hidden
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        flexShrink: 0,
                        background: 'var(--bg-hover, #f1f5f9)',
                      }}
                    />
                  )}
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 15,
                        fontWeight: 600,
                        color: 'var(--text-primary, #111)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.name}
                    </span>
                    {item.subtitle && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12,
                          color: 'var(--text-secondary, #64748b)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.subtitle}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #111)', margin: '0 0 8px' }}>
        {title}
      </p>
      <p style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)', margin: 0, lineHeight: 1.45 }}>
        {subtitle}
      </p>
    </div>
  )
}

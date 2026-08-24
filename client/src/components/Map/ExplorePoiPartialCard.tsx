import { useEffect, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, Phone, X } from 'lucide-react'
import { POI_CATEGORY_BY_KEY, type Poi } from './poiCategories'
import { parseCatalogPoiRef } from '../../lib/map/catalogPoiRef'
import { listCatalogMediaUrlsForEntity } from '../../data/supabase/catalogExploreMedia'
import { catalogPoiKindToExploreKind } from '../../data/supabase/catalogExploreLists'
import { usePrefetchHeroAround } from '../../lib/media/prefetchHeroImages'
import { useTranslation } from '../../i18n'
import CatalogSaveHeartButton from '../Explore/CatalogSaveHeartButton'
import CatalogAddToListButton from '../Explore/CatalogAddToListButton'
import { useCatalogSave } from '../Explore/useCatalogSave'
import { useCatalogListMembership } from '../Explore/useCatalogListMembership'
import { useSaveToCollectionStore } from '../../store/saveToCollectionStore'
import { useCollectionsEnabled } from '../../store/familyFeatureStore'
import { useToast } from '../shared/Toast'

interface Props {
  poi: Poi
  onDismiss: () => void
  onOpenExplore: () => void
  familyId: string | null
  personId: string | null
}

const HERO_H = 280
const CARD_MAX_W = 360

/**
 * W8.2 Explore POI partial — one floating media card over the live map.
 * Catalog: hero slideshow + Bookmark (named lists) left of heart. OSM: glyph only. No Add to trip.
 */
export default function ExplorePoiPartialCard({
  poi,
  onDismiss,
  onOpenExplore,
  familyId,
  personId,
}: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const collectionsEnabled = useCollectionsEnabled()
  const openSaveToList = useSaveToCollectionStore(s => s.open)
  const cat = POI_CATEGORY_BY_KEY[poi.category]
  const CatIcon = cat?.Icon
  const color = cat?.color ?? '#6b7280'
  const ref = parseCatalogPoiRef(poi.osm_id)
  const isCatalog = poi.source === 'catalog' && ref != null
  const exploreKind = ref ? catalogPoiKindToExploreKind(ref.kind) : null
  const save = useCatalogSave({
    familyId,
    personId,
    kind: exploreKind,
    entityId: ref?.id ?? null,
    enabled: isCatalog,
  })
  const listMembership = useCatalogListMembership({
    familyId,
    kind: exploreKind,
    entityId: ref?.id ?? null,
    enabled: isCatalog && collectionsEnabled,
  })

  const [urls, setUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(isCatalog)
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    let cancelled = false
    setSlide(0)
    if (!isCatalog || !ref) {
      setUrls([])
      setLoading(false)
      return
    }
    setLoading(true)
    void listCatalogMediaUrlsForEntity(ref.kind, ref.id)
      .then(list => {
        if (!cancelled) setUrls(list)
      })
      .catch(() => {
        if (!cancelled) setUrls([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [poi.osm_id, isCatalog, ref?.kind, ref?.id])

  const locationLine = poi.address?.trim() || (cat ? t(cat.labelKey) : poi.category)
  const typeLabel = cat ? t(cat.labelKey) : poi.category
  const typeExtra = poi.poi_type && poi.poi_type !== poi.category ? poi.poi_type : null
  const hasSlides = urls.length > 0
  const current = hasSlides ? urls[Math.min(slide, urls.length - 1)] : null
  usePrefetchHeroAround(urls, slide)

  return (
    <div
      role="dialog"
      aria-label={poi.name}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        width: `min(${CARD_MAX_W}px, calc(100% - 48px))`,
        zIndex: 30,
        pointerEvents: 'auto',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'var(--sidebar-bg, #fff)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Hero */}
      <div style={{ position: 'relative', height: HERO_H, background: color }}>
        {current ? (
          <img
            src={current}
            alt=""
            decoding="async"
            fetchPriority="high"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `linear-gradient(145deg, ${color} 0%, #111827 100%)`,
            }}
          >
            {loading ? (
              <span
                className="animate-spin"
                style={{
                  width: 28, height: 28, borderRadius: 999,
                  border: '3px solid rgba(255,255,255,0.35)',
                  borderTopColor: '#fff',
                }}
              />
            ) : CatIcon ? (
              <CatIcon size={56} color="rgba(255,255,255,0.92)" strokeWidth={1.6} />
            ) : null}
          </div>
        )}

        {/* Tags */}
        <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={tagStyle}>{typeLabel}</span>
          {typeExtra && <span style={tagStyle}>{typeExtra}</span>}
        </div>

        {/* Bookmark + heart (catalog only) + dismiss */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 2,
          }}
        >
          {isCatalog && collectionsEnabled && (
            <CatalogAddToListButton
              onAnyList={listMembership.onAnyList}
              disabled={!familyId || !personId}
              onClick={() => {
                if (!familyId || !personId) {
                  toast.error(t('dashboard.propose.missingPerson'))
                  return
                }
                if (!exploreKind || !ref) return
                openSaveToList({
                  name: poi.name,
                  catalog_kind: exploreKind,
                  catalog_entity_id: ref.id,
                })
              }}
            />
          )}
          {isCatalog && (
            <CatalogSaveHeartButton
              isSaved={save.isSaved}
              busy={save.busy}
              disabled={!familyId || !personId}
              onToggle={save.toggle}
            />
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 999, border: 'none',
              background: 'rgba(0,0,0,0.45)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>

        {hasSlides && urls.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => setSlide(s => (s - 1 + urls.length) % urls.length)}
              style={navBtnStyle('left')}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => setSlide(s => (s + 1) % urls.length)}
              style={navBtnStyle('right')}
            >
              <ChevronRight size={18} />
            </button>
            <div style={{
              position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 5,
            }}>
              {urls.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: i === slide ? 14 : 6, height: 6, borderRadius: 999,
                    background: i === slide ? '#fff' : 'rgba(255,255,255,0.5)',
                    transition: 'width 0.15s',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Meta */}
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{
          fontSize: 17, fontWeight: 700, color: 'var(--text-primary, #111)',
          lineHeight: 1.25, marginBottom: 8,
        }}>
          {poi.name}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-muted, #6b7280)' }}>
            <MapPin size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{locationLine}</span>
          </div>
          {poi.website && (
            <a
              href={poi.website.startsWith('http') ? poi.website : `https://${poi.website}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#2563eb', textDecoration: 'none' }}
            >
              <ExternalLink size={14} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{poi.website}</span>
            </a>
          )}
          {poi.phone && (
            <a
              href={`tel:${poi.phone}`}
              style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-muted, #6b7280)', textDecoration: 'none' }}
            >
              <Phone size={14} />
              <span>{poi.phone}</span>
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenExplore}
          style={{
            width: '100%',
            padding: '11px 14px',
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 650,
            fontFamily: 'inherit',
            background: '#111827',
            color: '#fff',
          }}
        >
          Open in Explore
        </button>
      </div>
    </div>
  )
}

const tagStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 650,
  color: '#fff',
  background: 'rgba(255,255,255,0.22)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: '1px solid rgba(255,255,255,0.35)',
}

function navBtnStyle(side: 'left' | 'right'): CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    [side]: 8,
    transform: 'translateY(-50%)',
    width: 32,
    height: 32,
    borderRadius: 999,
    border: 'none',
    background: 'rgba(0,0,0,0.4)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  }
}

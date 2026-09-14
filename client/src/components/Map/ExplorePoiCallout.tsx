import { MapPin, Tag } from 'lucide-react'
import { POI_CATEGORY_BY_KEY, type Poi } from './poiCategories'
import { useTranslation } from '../../i18n'

const CARD_W = 200

export type ExplorePoiCalloutScreenPos = { x: number; y: number }

interface Props {
  poi: Poi
  /** Pixel position of the pin within the map container (top-left origin). */
  screenPos: ExplorePoiCalloutScreenPos
  onDismiss?: () => void
  /** W8.2 will open partial; W8.1 no-ops or soft dismiss. */
  onOpenPartial?: () => void
}

/**
 * W8.1 Explore POI peek callout — iOS ExplorePoiCalloutView chrome (white card + down tail).
 * Anchored above the pin; parent reprojects `screenPos` on pan/zoom.
 */
export default function ExplorePoiCallout({ poi, screenPos, onOpenPartial }: Props) {
  const { t } = useTranslation()
  const cat = POI_CATEGORY_BY_KEY[poi.category]
  const CatIcon = cat?.Icon
  const color = cat?.color ?? '#6b7280'
  const locationLine = (poi.address?.trim() || (cat ? t(cat.labelKey) : poi.category))
  const typeLine = (poi.poi_type?.trim() || (cat ? t(cat.labelKey) : poi.category))

  // Card sits above the pin; tail points down to the pin center.
  const left = screenPos.x
  const top = screenPos.y

  return (
    <div
      role="dialog"
      aria-label={`${poi.name}, ${locationLine}`}
      style={{
        position: 'absolute',
        left,
        top,
        transform: 'translate(-50%, calc(-100% - 10px))',
        zIndex: 28,
        pointerEvents: 'auto',
        width: CARD_W,
        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))',
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onOpenPartial?.()
        }}
        style={{
          display: 'block',
          width: '100%',
          margin: 0,
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: onOpenPartial ? 'pointer' : 'default',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
        }}
      >
        <div
          className="explore-poi-callout-card"
          style={{
            padding: 12,
            borderRadius: 12,
            background: '#fff',
            boxSizing: 'border-box',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
            <div
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: 650,
                color: '#333',
                lineHeight: 1.25,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {poi.name}
            </div>
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                borderRadius: 999,
                background: color,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              {CatIcon ? <CatIcon size={11} strokeWidth={2.4} /> : null}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <MapPin size={12} color="#999" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: '#787878', lineHeight: 1.3 }}>{locationLine}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Tag size={12} color="#999" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: '#787878', lineHeight: 1.3 }}>{typeLine}</span>
            </div>
          </div>
        </div>
      </button>
    </div>
  )
}

import React from 'react'
import { Map as MapIcon, Navigation, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import PlaceAvatar from '../../shared/PlaceAvatar'
import { ActionButton } from '../PlaceInspector'
import type { FamilyTripPlace } from '../../../data/supabase/tripPlaces'
import FamilyFileAttach from '../../Files/FamilyFileAttach'

type FamilyPlaceInspectorProps = {
  place: FamilyTripPlace
  tripId: string
  familyId: string
  canMutate: boolean
  mePersonId: string | null
  onClose: () => void
  onDelete: () => void
  onAssignToDay: () => void
  onEdit?: () => void
  categoriesEnabled?: boolean
  onToastWrite: (kind?: 'edit' | 'import' | 'export' | 'reorder') => void
  leftWidth?: number
  rightWidth?: number
  mobile?: boolean
}

export default function FamilyPlaceInspector({
  place,
  tripId,
  familyId,
  canMutate,
  mePersonId,
  onClose,
  onDelete,
  onAssignToDay,
  onEdit,
  categoriesEnabled = true,
  onToastWrite: _onToastWrite,
  leftWidth = 0,
  rightWidth = 0,
  mobile = false,
}: FamilyPlaceInspectorProps): React.ReactElement {
  const { t } = useTranslation()
  const googleMapsUrl = place.lat != null && place.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
    : null
  const osmUrl = place.lat != null && place.lng != null
    ? `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=16/${place.lat}/${place.lng}`
    : place.name
      ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(place.name)}`
      : null

  const panel = (
    <div className="bg-surface-elevated" style={{
      backdropFilter: 'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      borderRadius: mobile ? '20px 20px 0 0' : 20,
      boxShadow: '0 8px 40px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      maxHeight: mobile ? '85vh' : '60vh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 16px 14px', borderBottom: '1px solid var(--border-faint)', flexShrink: 0 }}>
        <PlaceAvatar
          place={{ id: place.id, name: place.name, lat: place.lat, lng: place.lng, image_url: place.imageUrl, google_place_id: null, osm_id: null }}
          size={52}
          category={categoriesEnabled && place.familyPlaceCategoryId
            ? { color: place.familyPlaceCategoryColor ?? undefined, icon: place.familyPlaceCategoryIcon ?? undefined }
            : null}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className="text-content" style={{ fontWeight: 600, fontSize: 'calc(15px * var(--fs-scale-subtitle, 1))', lineHeight: '1.3' }}>
              {place.name}
            </span>
            {place.isPrimary && (
              <span style={{
                fontSize: 'calc(10px * var(--fs-scale-caption, 1))', fontWeight: 600,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                color: 'var(--accent-text)', background: 'var(--accent)',
                padding: '2px 8px', borderRadius: 99,
              }}>
                Primary
              </span>
            )}
          </div>
          {categoriesEnabled && place.familyPlaceCategoryName && (
            <div className="text-content-muted" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', marginTop: 2 }}>
              {place.familyPlaceCategoryName}
            </div>
          )}
          {place.lat != null && place.lng != null && (
            <div className="hidden sm:block text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {Number(place.lat).toFixed(6)}, {Number(place.lng).toFixed(6)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="bg-surface-hover"
          aria-label={t('common.close')}
          style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-start' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        >
          <X size={14} strokeWidth={2} color="var(--text-secondary)" />
        </button>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {place.notes && (
          <div className="bg-surface-hover text-content-muted" style={{ borderRadius: 10, fontSize: 'calc(12px * var(--fs-scale-body, 1))', lineHeight: '1.5', padding: '8px 12px', whiteSpace: 'pre-wrap' }}>
            {place.notes}
          </div>
        )}
        {place.timeZone && (
          <div className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))' }}>
            {place.timeZone}
          </div>
        )}
        <FamilyFileAttach
          tripId={tripId}
          familyId={familyId}
          canMutate={canMutate}
          mePersonId={mePersonId}
          placeId={place.id}
        />
      </div>

      <div className="border-t border-edge-faint" style={{ padding: '10px 16px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <ActionButton onClick={onAssignToDay} variant="primary" icon={<Plus size={13} />} label={t('inspector.addToDay')} />
        {googleMapsUrl && (
          <ActionButton onClick={() => window.open(googleMapsUrl, '_blank')} variant="ghost" icon={<Navigation size={13} />}
            label={<span className="hidden sm:inline">{t('inspector.google')}</span>} />
        )}
        {osmUrl && (
          <ActionButton onClick={() => window.open(osmUrl, '_blank')} variant="ghost" icon={<MapIcon size={13} />}
            label={<span className="hidden sm:inline">{t('inspector.openStreetMap')}</span>} />
        )}
        <div style={{ flex: 1 }} />
        {categoriesEnabled && onEdit && (
          <ActionButton onClick={onEdit} variant="ghost" icon={<Pencil size={13} />} label={<span className="hidden sm:inline">{t('common.edit')}</span>} />
        )}
        <ActionButton onClick={onDelete} variant="danger" icon={<Trash2 size={13} />} label={<span className="hidden sm:inline">{t('common.delete')}</span>} />
      </div>
    </div>
  )

  if (mobile) return panel

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: `calc(${leftWidth}px + (100% - ${leftWidth}px - ${rightWidth}px) / 2)`,
        transform: 'translateX(-50%)',
        width: `min(800px, calc(100% - ${leftWidth}px - ${rightWidth}px - 32px))`,
        zIndex: 50,
        fontFamily: 'var(--font-system)',
      }}
    >
      {panel}
    </div>
  )
}

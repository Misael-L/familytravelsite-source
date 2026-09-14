import React from 'react'
import { MapViewAuto } from '../Map/MapViewAuto'
import type { CollectionPlace } from '@trek/shared'
import { mappablePlaces, type CollectionEntityId } from '../../pages/collections/collectionsModel'

interface CollectionMapProps {
  places: CollectionPlace[]
  selectedPlaceId: CollectionEntityId | null
  onOpenPlace: (id: CollectionEntityId) => void
  /** Clicking the map background clears the selection. */
  onDeselect?: () => void
  dark: boolean
}

/**
 * Map view — reuses the trip map stack (MapViewAuto → Leaflet / GL with marker
 * clustering). One of the three list views; clicking a marker selects the place.
 * The parent `.col-mapwrap` supplies the rounded, bordered box + height, so this
 * just fills it.
 */
export default function CollectionMap({ places, selectedPlaceId, onOpenPlace, onDeselect }: CollectionMapProps): React.ReactElement {
  const pts = mappablePlaces(places)

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <MapViewAuto
        places={pts}
        selectedPlaceId={selectedPlaceId}
        hoverDisabled
        onMarkerClick={onOpenPlace}
        onMapClick={onDeselect ? () => onDeselect() : undefined}
        fitKey={pts.length}
      />
    </div>
  )
}

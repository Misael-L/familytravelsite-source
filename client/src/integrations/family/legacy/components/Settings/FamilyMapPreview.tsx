import { divIcon } from 'leaflet';
import { MapPin } from 'lucide-react';
import { Suspense } from 'react';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { GlMapPreviewMapbox, GlMapPreviewMaplibre } from '../../../../../components/Map/glLazy';
import { useWebGL2 } from '../../../../../components/Map/glSupport';
import { PREVIEW_CENTER, PREVIEW_ZOOM } from '../../../../../components/Settings/mapSettingsModel';
import ErrorBoundary from '../../../../../components/shared/ErrorBoundary';
import { attributionForTile } from '../../../../../constants/mapDefaults';
import { useTranslation } from '../../../../../i18n';
import { nativeRasterTemplate } from '../../../../../native/tileCache';
import { renderIconMarkupStrict } from '../../../../../utils/iconMarkup';
import { publicMapRender, type EffectiveMapRender } from '../Map/resolveMapRender';

const previewPin = divIcon({
  className:
    'flex items-center justify-center rounded-full border-[2.5px] border-edge bg-accent text-accent-text shadow-md',
  html: renderIconMarkupStrict(<MapPin size={15} strokeWidth={2.5} />),
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export default function FamilyMapPreview({
  map,
  enable3d = false,
  quality = false,
}: {
  map: EffectiveMapRender;
  enable3d?: boolean;
  quality?: boolean;
}) {
  const { t } = useTranslation();
  const webgl = useWebGL2();

  if (map.engine === 'leaflet' || !webgl) {
    const tileUrl = map.engine === 'leaflet' ? map.rasterUrl : publicMapRender().rasterUrl;
    return (
      <MapContainer
        center={PREVIEW_CENTER}
        zoom={PREVIEW_ZOOM}
        zoomControl={false}
        className="h-full w-full bg-[var(--overlay)]"
      >
        <TileLayer
          url={nativeRasterTemplate(tileUrl)}
          attribution={attributionForTile(tileUrl)}
          maxZoom={19}
          keepBuffer={8}
          updateWhenZooming={false}
          updateWhenIdle
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <Marker position={PREVIEW_CENTER} icon={previewPin} interactive={false} keyboard={false} />
      </MapContainer>
    );
  }

  const isMapbox = map.engine === 'mapbox-gl';
  const Preview = isMapbox ? GlMapPreviewMapbox : GlMapPreviewMaplibre;
  return (
    <ErrorBoundary
      boundaryId="family:map-preview"
      resetKeys={[map.engine, map.styleUrl, map.mapboxToken, map.credentialRevision, enable3d, quality]}
      fallback={
        <div role="alert" className="flex h-full items-center justify-center text-content-muted">
          {t('common.error')}
        </div>
      }
    >
      <Suspense fallback={null}>
        <Preview
          provider={map.engine}
          token={map.mapboxToken || ''}
          style={map.styleUrl || ''}
          lat={PREVIEW_CENTER[0]}
          lng={PREVIEW_CENTER[1]}
          zoom={PREVIEW_ZOOM}
          enable3d={isMapbox && enable3d}
          quality={isMapbox && quality}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

import { lazy, Suspense } from 'react'
import { isSupabaseDataPlane } from '../../data/supabase/auth'
import { useSettingsStore } from '../../store/settingsStore'
import { MapView } from './MapView'
import { useEffectiveMapConfig } from './useEffectiveMapConfig'

const MapViewGL = lazy(() => import('./MapViewGL').then(m => ({ default: m.MapViewGL })))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function MapViewAuto(props: any) {
  const publicMap = props.publicMap === true
  const map = useEffectiveMapConfig({ public: publicMap })
  const nestProvider = useSettingsStore(s => s.settings.map_provider)
  const nestToken = useSettingsStore(s => s.settings.mapbox_access_token)
  const supabasePlane = isSupabaseDataPlane()
  const tileUrl = publicMap || supabasePlane ? map.rasterUrl : (props.tileUrl || map.rasterUrl)
  const attribution = map.attribution

  const glProvider = publicMap
    ? null
    : map.engine === 'maplibre-gl'
      ? 'maplibre-gl'
      : map.engine === 'mapbox-gl' && map.mapboxToken
        ? 'mapbox-gl'
        : (!supabasePlane && nestProvider === 'maplibre-gl')
          ? 'maplibre-gl'
          : (!supabasePlane && nestProvider === 'mapbox-gl' && nestToken)
            ? 'mapbox-gl'
            : null

  const viewProps = { ...props, tileUrl, tileAttribution: attribution, publicMap: undefined }
  if (glProvider) {
    return (
      <Suspense fallback={<MapView {...viewProps} />}>
        <MapViewGL
          {...viewProps}
          glProvider={glProvider}
          resolvedToken={map.mapboxToken || nestToken || ''}
          resolvedStyle={map.styleUrl}
        />
      </Suspense>
    )
  }
  return <MapView {...viewProps} />
}

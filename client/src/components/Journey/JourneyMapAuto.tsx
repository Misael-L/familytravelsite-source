import { forwardRef, lazy, Suspense, useImperativeHandle, useRef } from 'react'
import { isSupabaseDataPlane } from '../../data/supabase/auth'
import { useSettingsStore } from '../../store/settingsStore'
import JourneyMap, { type JourneyMapHandle, type JourneyMapViewProps } from './JourneyMap'
import type { JourneyMapGLHandle } from './JourneyMapGL'
import { useEffectiveMapConfig } from '../Map/useEffectiveMapConfig'

const JourneyMapGL = lazy(() => import('./JourneyMapGL'))

export type JourneyMapAutoHandle = JourneyMapHandle

interface Props extends JourneyMapViewProps {
  publicMap?: boolean
}

const JourneyMapAuto = forwardRef<JourneyMapAutoHandle, Props>(function JourneyMapAuto(props, ref) {
  const { publicMap, tileUrl: _tileUrl, tileAttribution: _tileAttribution, ...mapProps } = props
  const map = useEffectiveMapConfig({ public: publicMap === true })
  const nestProvider = useSettingsStore(s => s.settings.map_provider)
  const nestToken = useSettingsStore(s => s.settings.mapbox_access_token)
  const supabasePlane = isSupabaseDataPlane()
  const leafletRef = useRef<JourneyMapHandle>(null)
  const glRef = useRef<JourneyMapGLHandle>(null)

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
  const useGL = !!glProvider

  useImperativeHandle(ref, () => ({
    highlightMarker: (id) => (useGL ? glRef.current : leafletRef.current)?.highlightMarker(id),
    focusMarker: (id) => (useGL ? glRef.current : leafletRef.current)?.focusMarker(id),
    invalidateSize: () => (useGL ? glRef.current : leafletRef.current)?.invalidateSize(),
  }), [useGL])

  if (useGL && glProvider) {
    return (
      <Suspense fallback={null}>
        <JourneyMapGL
          ref={glRef}
          checkins={mapProps.checkins}
          entries={mapProps.entries}
          trail={mapProps.trail}
          height={mapProps.height}
          dark={mapProps.dark}
          activeMarkerId={mapProps.activeMarkerId}
          onMarkerClick={mapProps.onMarkerClick}
          fullScreen={mapProps.fullScreen}
          paddingBottom={mapProps.paddingBottom}
          glProvider={glProvider}
          resolvedToken={map.mapboxToken || nestToken || ''}
          resolvedStyle={map.styleUrl}
        />
      </Suspense>
    )
  }
  return (
    <JourneyMap
      ref={leafletRef}
      checkins={mapProps.checkins}
      entries={mapProps.entries}
      trail={mapProps.trail}
      height={mapProps.height}
      dark={mapProps.dark}
      activeMarkerId={mapProps.activeMarkerId}
      onMarkerClick={mapProps.onMarkerClick}
      fullScreen={mapProps.fullScreen}
      paddingBottom={mapProps.paddingBottom}
      tileUrl={map.rasterUrl}
      tileAttribution={map.attribution}
    />
  )
})

export default JourneyMapAuto

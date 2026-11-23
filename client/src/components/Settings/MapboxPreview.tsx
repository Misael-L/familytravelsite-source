import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { isStandardFamily, supportsCustom3d, addCustom3dBuildings, addTerrainAndSky } from '../Map/mapboxSetup'
import { MAPBOX_DEFAULT_STYLE, normalizeStyleForProvider, type GlMapProvider } from '../Map/glProviders'
import { buildGlMap } from '../Map/glSupport'
import { fs } from '../shared/DialogShell'

interface Props {
  provider?: GlMapProvider
  token?: string
  style: string
  lat: number
  lng: number
  zoom: number
  enable3d: boolean
  quality?: boolean
  onClick?: (latlng: { lat: number; lng: number }) => void
  /**
   * The GL engine, injected instead of imported. Both SDKs used to be pulled in
   * statically here, so a single 2.8 MB chunk carried mapbox-gl and maplibre-gl
   * together and every map user downloaded both while only one ever ran.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gl: any
}

export default function GlMapPreview({ provider = 'mapbox-gl', token = '', style, lat, lng, zoom, enable3d, quality = false, onClick, gl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any | null>(null)
  const isMapLibre = provider === 'maplibre-gl'
  const glStyle = normalizeStyleForProvider(provider, style)
  const enableMapbox3d = !isMapLibre && enable3d
  const attempt = useMemo(
    () => ({ isMapLibre, token, glStyle, enableMapbox3d, quality, gl }),
    [isMapLibre, token, glStyle, enableMapbox3d, quality, gl],
  )
  const [failedAttempt, setFailedAttempt] = useState<typeof attempt | null>(null)
  const readCamera = useEffectEvent(() => ({ center: [lng, lat], zoom }))
  const reportClick = useEffectEvent((point: { lat: number; lng: number }) => onClick?.(point))

  useEffect(() => {
    const { isMapLibre, token, glStyle, enableMapbox3d, quality, gl } = attempt
    if (!containerRef.current || (!isMapLibre && !token)) return
    if (!isMapLibre) gl.accessToken = token

    const mapOptions: Record<string, unknown> = {
      container: containerRef.current,
      style: glStyle,
      ...readCamera(),
      pitch: enableMapbox3d ? 45 : 0,
      attributionControl: true,
      antialias: quality,
    }
    if (!isMapLibre) mapOptions.projection = quality ? 'globe' : 'mercator'
    // MapLibre's around-center mouse rotate ping-pongs near mid-screen (#1545)
    // — see MapViewGL. Keep the plain dx-based rotate everywhere.
    if (isMapLibre) mapOptions.aroundCenter = false

    // Null when the GPU refused WebGL2: the settings form has switched the preview to Leaflet by then.
    const map = buildGlMap(() => new gl.Map(mapOptions))
    if (!map) return
    mapRef.current = map

    let active = true
    let loaded = false
    map.on('error', () => {
      if (active && !loaded) setFailedAttempt(attempt)
    })
    map.on('load', () => {
      if (!active) return
      loaded = true
      setFailedAttempt(null)
      if (enableMapbox3d) {
        if (!isStandardFamily(glStyle)) addTerrainAndSky(map)
        if (supportsCustom3d(glStyle)) {
          const dark = document.documentElement.classList.contains('dark')
          addCustom3dBuildings(map, dark)
        }
      }
      if (glStyle === MAPBOX_DEFAULT_STYLE) {
        try { map.setTerrain(null) } catch { /* noop */ }
      }
    })

    map.on('click', (e) => {
      if (active) reportClick({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    })

    return () => {
      active = false
      try { map.remove() } catch { /* noop */ }
      mapRef.current = null
    }
  }, [attempt])

  // Recenter without rebuilding the map when lat/lng/zoom change externally
  useEffect(() => {
    if (!mapRef.current) return
    try { mapRef.current.jumpTo({ center: [lng, lat], zoom }) } catch { /* noop */ }
  }, [lat, lng, zoom])

  if (!isMapLibre && !token) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-tertiary px-4 text-center font-medium text-content-muted" style={fs(12)}>
        Enter a Mapbox access token to preview
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
      {failedAttempt === attempt && (
        <div role="alert" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-tertiary px-4 text-center font-medium text-content-muted" style={fs(12)}>
          Map preview failed to load. Check the style URL and token.
        </div>
      )}
    </div>
  )
}

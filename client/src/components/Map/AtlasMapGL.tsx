import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react'
import mapboxgl from 'mapbox-gl'
import maplibregl from 'maplibre-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import apiClient from '../../api/client'
import type { GeoJsonFeatureCollection } from '../../types'
import type { PluginAtlasLayer } from '../../api/client'
import { A2_TO_A3, normalizeRegionName, type AtlasData, type BucketItem } from '../../pages/atlas/atlasModel'
import { MAPBOX_DEFAULT_STYLE, OPENFREEMAP_DEFAULT_STYLE } from './glProviders'
import type { EffectiveMapRender } from './resolveMapRender'
import type { TranslationFn } from '../../types'
import { useFamilyMapStore } from '../../store/familyMapStore'

const COUNTRY_SOURCE = 'atlas-countries'
const COUNTRY_FILL = 'atlas-countries-fill'
const COUNTRY_LINE = 'atlas-countries-line'
const PLUGIN_SOURCE = 'atlas-plugins'
const PLUGIN_FILL = 'atlas-plugins-fill'
const REGION_SOURCE = 'atlas-regions'
const REGION_FILL = 'atlas-regions-fill'
const REGION_LINE = 'atlas-regions-line'
const BUCKET_SOURCE = 'atlas-buckets'
const BUCKET_CIRCLE = 'atlas-buckets-circle'

const VISITED_COLORS = ['#6366f1','#ec4899','#14b8a6','#f97316','#8b5cf6','#ef4444','#3b82f6','#22c55e','#06b6d4','#f43f5e']
const TONE_COLORS: Record<string, string> = { default: '#4F46E5', success: '#10b981', warn: '#f59e0b', danger: '#ef4444' }

function featureA3(f: GeoJSON.Feature): string {
  const props = f.properties || {}
  return String(props.ADM0_A3 || props.ISO_A3 || props['ISO3166-1-Alpha-3'] || f.id || '')
}

function whenStyleReady(map: mapboxgl.Map, fn: () => void): () => void {
  let cancelled = false
  const run = () => {
    if (cancelled) return
    fn()
  }
  if (map.isStyleLoaded()) run()
  else map.once('load', run)
  return () => {
    cancelled = true
    map.off('load', run)
  }
}

function featureA2(f: GeoJSON.Feature): string | null {
  const props = f.properties || {}
  const iso = props.ISO_A2
  if (typeof iso === 'string' && iso.length === 2 && iso !== '-99') return iso
  const a3 = featureA3(f)
  const found = Object.entries(A2_TO_A3).find(([, v]) => v === a3)
  return found ? found[0] : null
}

type ConfirmAction = {
  type: 'mark' | 'unmark' | 'choose' | 'bucket' | 'choose-region' | 'unmark-region'
  code: string
  name: string
  regionCode?: string
  countryName?: string
}

export type AtlasMapGLProps = {
  render: EffectiveMapRender
  dark: boolean
  loading: boolean
  geoData: GeoJsonFeatureCollection | null
  data: AtlasData | null
  pluginLayers: PluginAtlasLayer[]
  visitedRegions: Record<string, { code: string; name: string; placeCount: number; manuallyMarked?: boolean }[]>
  bucketList: BucketItem[]
  t: TranslationFn
  resolveName: (code: string) => string
  setConfirmAction: (action: ConfirmAction | null) => void
  onUnmarkCountry: (code: string) => void
  regionTooltipRef: RefObject<HTMLDivElement | null>
}

export default function AtlasMapGL({
  render,
  dark,
  loading,
  geoData,
  data,
  pluginLayers,
  visitedRegions,
  bucketList,
  t: _t,
  resolveName,
  setConfirmAction,
  onUnmarkCountry,
  regionTooltipRef,
}: AtlasMapGLProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const regionCache = useRef<Record<string, GeoJSON.FeatureCollection>>({})
  const [mapGeneration, setMapGeneration] = useState(0)
  const familyId = useFamilyMapStore(s => s.familyId)

  useEffect(() => {
    if (loading || !containerRef.current) return
    const isLibre = render.engine === 'maplibre-gl'
    if (!isLibre) mapboxgl.accessToken = render.mapboxToken || ''
    const style = render.styleUrl || (isLibre ? OPENFREEMAP_DEFAULT_STYLE : MAPBOX_DEFAULT_STYLE)
    const MapCtor = (isLibre ? maplibregl.Map : mapboxgl.Map) as unknown as typeof mapboxgl.Map
    const NavCtor = (isLibre ? maplibregl.NavigationControl : mapboxgl.NavigationControl) as unknown as typeof mapboxgl.NavigationControl
    const map = new MapCtor({
      container: containerRef.current,
      style,
      center: [0, 25],
      zoom: 3,
      minZoom: 3,
      maxZoom: 10,
      attributionControl: false,
      fadeDuration: 0,
    })
    map.addControl(new NavCtor({ showCompass: false }), 'bottom-right')
    mapRef.current = map
    setMapGeneration(n => n + 1)
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [loading, render.engine, render.styleUrl, render.mapboxToken, render.optionId, render.credentialRevision, familyId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !geoData) return

    const visitedA3 = new Set((data?.countries || []).map(c => A2_TO_A3[c.code]).filter(Boolean))
    const colorMap: Record<string, string> = {}
    ;[...visitedA3].forEach((a3, i) => { colorMap[a3] = VISITED_COLORS[i % VISITED_COLORS.length] })
    const countryByA2: Record<string, AtlasData['countries'][number]> = {}
    data?.countries.forEach(c => { countryByA2[c.code] = c })

    const apply = () => {
      if (!map.getSource(COUNTRY_SOURCE)) {
        map.addSource(COUNTRY_SOURCE, { type: 'geojson', data: geoData as GeoJSON.GeoJSON, promoteId: 'ADM0_A3' })
        map.addLayer({
          id: COUNTRY_FILL,
          type: 'fill',
          source: COUNTRY_SOURCE,
          paint: {
            'fill-color': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              dark ? '#818cf8' : '#4f46e5',
              ['match', ['to-string', ['get', 'ADM0_A3']], ...Object.entries(colorMap).flatMap(([k, v]) => [k, v]), dark ? '#1e1e2e' : '#e2e8f0'],
            ],
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false], 0.9,
              ['match', ['to-string', ['get', 'ADM0_A3']], ...[...visitedA3].flatMap(a3 => [a3, 0.7]), 0.3],
            ],
          },
        })
        map.addLayer({
          id: COUNTRY_LINE,
          type: 'line',
          source: COUNTRY_SOURCE,
          paint: { 'line-color': dark ? '#333' : '#cbd5e1', 'line-width': 0.5 },
        })
      } else {
        (map.getSource(COUNTRY_SOURCE) as mapboxgl.GeoJSONSource).setData(geoData as GeoJSON.GeoJSON)
      }
    }

    const stopReady = whenStyleReady(map, apply)

    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (map.getLayer(REGION_FILL) && map.getLayoutProperty(REGION_FILL, 'visibility') !== 'none') {
        const regionHits = map.queryRenderedFeatures(e.point, { layers: [REGION_FILL] })
        if (regionHits.length > 0) return
      }
      const feature = e.features?.[0]
      if (!feature) return
      const code = featureA2(feature as GeoJSON.Feature)
      if (!code) return
      const visited = countryByA2[code]
      const name = resolveName(code)
      if (visited) {
        if (visited.placeCount === 0 && visited.tripCount === 0) onUnmarkCountry(code)
        return
      }
      setConfirmAction({ type: 'choose', code, name })
    }
    map.on('click', COUNTRY_FILL, onClick)
    return () => {
      stopReady()
      map.off('click', COUNTRY_FILL, onClick)
    }
  }, [mapGeneration, geoData, data, dark, resolveName, setConfirmAction, onUnmarkCountry])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !geoData) return
    const toneByA3: Record<string, string> = {}
    for (const layer of pluginLayers) {
      for (const c of layer.countries) {
        const a3 = A2_TO_A3[c.code]
        if (a3) toneByA3[a3] = c.tone || 'default'
      }
    }
    const features = ((geoData as GeoJSON.FeatureCollection).features || [])
      .filter(f => toneByA3[featureA3(f)] !== undefined)
      .map(f => ({ ...f, properties: { ...f.properties, pluginTone: toneByA3[featureA3(f)] } }))
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
    const apply = () => {
      if (!map.getSource(PLUGIN_SOURCE)) {
        map.addSource(PLUGIN_SOURCE, { type: 'geojson', data: fc })
        map.addLayer({
          id: PLUGIN_FILL,
          type: 'fill',
          source: PLUGIN_SOURCE,
          paint: {
            'fill-color': ['match', ['get', 'pluginTone'], 'success', TONE_COLORS.success, 'warn', TONE_COLORS.warn, 'danger', TONE_COLORS.danger, TONE_COLORS.default],
            'fill-opacity': 0.18,
          },
        })
      } else {
        (map.getSource(PLUGIN_SOURCE) as mapboxgl.GeoJSONSource).setData(fc)
      }
    }
    return whenStyleReady(map, apply)
  }, [mapGeneration, geoData, pluginLayers])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const hideTooltip = () => {
      const tt = regionTooltipRef.current
      if (tt) tt.style.display = 'none'
    }

    const onRegionClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f) return
      const props = f.properties || {}
      const countryA2 = String(props.iso_a2 || '').toUpperCase()
      const regionName = String(props.name || '')
      const regionCode = String(props.iso_3166_2 || '')
      const countryName = String(props.admin || '')
      const visitedNames = new Set(
        (visitedRegions[countryA2] || []).map(r => normalizeRegionName(r.name)),
      )
      const visited = visitedNames.has(normalizeRegionName(regionName))
        || (visitedRegions[countryA2] || []).some(r => r.code === regionCode)
      setConfirmAction({
        type: visited ? 'unmark-region' : 'choose-region',
        code: countryA2,
        name: regionName,
        regionCode,
        countryName,
      })
    }

    const onRegionMove = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features?.[0]
      const tt = regionTooltipRef.current
      if (!f || !tt || !e.originalEvent) return
      const props = f.properties || {}
      const regionName = String(props.name || '')
      const countryName = String(props.admin || '')
      tt.style.display = 'block'
      tt.style.left = `${e.originalEvent.clientX + 12}px`
      tt.style.top = `${e.originalEvent.clientY - 10}px`
      tt.textContent = ''
      const title = document.createElement('div')
      title.style.fontWeight = '600'
      title.style.marginBottom = '3px'
      title.textContent = regionName
      const sub = document.createElement('div')
      sub.style.opacity = '0.5'
      sub.style.fontSize = '10px'
      sub.textContent = countryName
      tt.append(title, sub)
    }

    const loadRegions = () => {
      if (map.getZoom() < 5) {
        if (map.getLayer(REGION_FILL)) map.setLayoutProperty(REGION_FILL, 'visibility', 'none')
        if (map.getLayer(REGION_LINE)) map.setLayoutProperty(REGION_LINE, 'visibility', 'none')
        hideTooltip()
        return
      }
      const visible = map.getLayer(COUNTRY_FILL)
        ? map.queryRenderedFeatures({ layers: [COUNTRY_FILL] })
        : []
      const codes = new Set<string>()
      for (const f of visible) {
        const code = featureA2(f as GeoJSON.Feature)
        if (code) codes.add(code)
      }
      if (codes.size === 0 && geoData) {
        for (const f of (geoData as GeoJSON.FeatureCollection).features || []) {
          const code = featureA2(f)
          if (code) codes.add(code)
        }
      }
      const toLoad = [...codes].filter(c => !regionCache.current[c]).slice(0, 12)
      const applyMerged = () => {
        const features = Object.values(regionCache.current).flatMap(g => g.features || [])
        const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
        if (!map.getSource(REGION_SOURCE)) {
          map.addSource(REGION_SOURCE, { type: 'geojson', data: fc })
          map.addLayer({
            id: REGION_FILL,
            type: 'fill',
            source: REGION_SOURCE,
            paint: { 'fill-color': dark ? '#818cf8' : '#4f46e5', 'fill-opacity': 0.2 },
          })
          map.addLayer({
            id: REGION_LINE,
            type: 'line',
            source: REGION_SOURCE,
            paint: { 'line-color': dark ? '#888' : '#64748b', 'line-width': 1 },
          })
        } else {
          (map.getSource(REGION_SOURCE) as mapboxgl.GeoJSONSource).setData(fc)
        }
        if (map.getLayer(REGION_FILL)) map.setLayoutProperty(REGION_FILL, 'visibility', 'visible')
        if (map.getLayer(REGION_LINE)) map.setLayoutProperty(REGION_LINE, 'visibility', 'visible')
      }
      if (toLoad.length === 0) {
        applyMerged()
        return
      }
      apiClient.get(`/addons/atlas/regions/geo?countries=${toLoad.join(',')}`)
        .then(geoRes => {
          const geo = geoRes.data
          if (!geo?.features) return
          for (const c of toLoad) {
            const features = geo.features.filter((f: GeoJSON.Feature) => String(f.properties?.iso_a2 || '').toUpperCase() === c)
            if (features.length > 0) {
              regionCache.current[c] = { type: 'FeatureCollection', features }
            }
          }
          applyMerged()
        })
        .catch(() => { /* region overlays stay at last good cache */ })
    }
    const onMove = () => loadRegions()
    map.on('moveend', onMove)
    map.on('zoomend', onMove)
    map.on('click', REGION_FILL, onRegionClick)
    map.on('mousemove', REGION_FILL, onRegionMove)
    map.on('mouseleave', REGION_FILL, hideTooltip)
    const stopReady = whenStyleReady(map, loadRegions)
    return () => {
      stopReady()
      map.off('moveend', onMove)
      map.off('zoomend', onMove)
      map.off('click', REGION_FILL, onRegionClick)
      map.off('mousemove', REGION_FILL, onRegionMove)
      map.off('mouseleave', REGION_FILL, hideTooltip)
      hideTooltip()
    }
  }, [mapGeneration, geoData, visitedRegions, dark, setConfirmAction, regionTooltipRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: bucketList.filter(b => b.lat && b.lng).map(b => ({
        type: 'Feature' as const,
        properties: { name: b.name, notes: b.notes || '' },
        geometry: { type: 'Point' as const, coordinates: [b.lng as number, b.lat as number] },
      })),
    }
    const apply = () => {
      if (!map.getSource(BUCKET_SOURCE)) {
        map.addSource(BUCKET_SOURCE, { type: 'geojson', data: fc })
        map.addLayer({
          id: BUCKET_CIRCLE,
          type: 'circle',
          source: BUCKET_SOURCE,
          paint: { 'circle-radius': 8, 'circle-color': '#fbbf24', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
        })
      } else {
        (map.getSource(BUCKET_SOURCE) as mapboxgl.GeoJSONSource).setData(fc)
      }
    }
    return whenStyleReady(map, apply)
  }, [mapGeneration, bucketList])

  return (
    <div
      ref={containerRef}
      data-atlas-engine={render.engine}
      style={{ position: 'absolute', inset: 0, zIndex: 1, background: dark ? '#1a1a2e' : '#f0f0f0' }}
    />
  )
}

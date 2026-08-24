import { useState, useRef, useCallback, useMemo } from 'react'
import { listCatalogPoisInBbox } from '../../data/supabase/catalogPois'
import { listOsmPoisInBboxTiled, type LatLng } from '../../data/supabase/mapsPois'
import { isAbortError } from '../../lib/abort'
import {
  placeFootprintBoundingBox,
  placeFootprintContains,
  type PlaceFootprintFeature,
} from '../../lib/map/placeFootprints'
import type { Poi } from './poiCategories'

export interface Bbox { south: number; west: number; north: number; east: number }

function isValidBbox(b: Bbox | null | undefined): b is Bbox {
  return !!b && b.north > b.south && b.east > b.west
    && [b.south, b.west, b.north, b.east].every(Number.isFinite)
}

function intersectBbox(a: Bbox, b: Bbox): Bbox | null {
  const out = {
    south: Math.max(a.south, b.south),
    west: Math.max(a.west, b.west),
    north: Math.min(a.north, b.north),
    east: Math.min(a.east, b.east),
  }
  return isValidBbox(out) ? out : null
}

/**
 * Workspace explore POIs — iOS WorkspacePoiExploreModel spatial + dual-source parity.
 * Default OSM (Edge maps-pois, client-tiled); sticky Family Catalog when dial is on.
 */
export function useWorkspacePois(opts?: {
  placeCentroids?: LatLng[]
}) {
  const placeCentroids = opts?.placeCentroids ?? []
  const centroidsRef = useRef(placeCentroids)
  centroidsRef.current = placeCentroids

  const [active, setActive] = useState<Set<string>>(() => new Set())
  const [byCat, setByCat] = useState<Record<string, Poi[]>>({})
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(() => new Set())
  const [moved, setMoved] = useState(false)
  const [errorKeys, setErrorKeys] = useState<Set<string>>(() => new Set())
  const [usesFamilyCatalog, setUsesFamilyCatalogState] = useState(false)
  const [allowNearby, setAllowNearbyState] = useState(false)
  const [focusedPlaceName, setFocusedPlaceName] = useState<string | null>(null)
  const [focusedPlaceHasBoundary, setFocusedPlaceHasBoundary] = useState(false)
  const [clipFeature, setClipFeature] = useState<PlaceFootprintFeature | null>(null)

  const bboxRef = useRef<Bbox | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const catalogRef = useRef(usesFamilyCatalog)
  catalogRef.current = usesFamilyCatalog
  const allowNearbyRef = useRef(allowNearby)
  allowNearbyRef.current = allowNearby
  const focusNameRef = useRef(focusedPlaceName)
  focusNameRef.current = focusedPlaceName
  const focusBoundaryRef = useRef(focusedPlaceHasBoundary)
  focusBoundaryRef.current = focusedPlaceHasBoundary
  const clipFeatureRef = useRef(clipFeature)
  clipFeatureRef.current = clipFeature
  const abortRef = useRef<Record<string, AbortController>>({})
  const loadingCountRef = useRef(0)

  const isExploreEnabled = focusedPlaceName == null || focusedPlaceHasBoundary
  const shouldClipToPlace = focusedPlaceHasBoundary && !allowNearby && focusedPlaceName != null
  const showNearbyToggle = active.size > 0 && focusedPlaceHasBoundary
  const showBoundaryComingSoon = focusedPlaceName != null && !focusedPlaceHasBoundary

  const isExploreEnabledRef = useRef(isExploreEnabled)
  isExploreEnabledRef.current = isExploreEnabled
  const shouldClipRef = useRef(shouldClipToPlace)
  shouldClipRef.current = shouldClipToPlace

  const setLoading = useCallback((key: string, on: boolean) => setLoadingKeys(prev => {
    const next = new Set(prev)
    const had = prev.has(key)
    if (on) next.add(key); else next.delete(key)
    if (on && !had) loadingCountRef.current += 1
    if (!on && had) loadingCountRef.current = Math.max(0, loadingCountRef.current - 1)
    return next
  }), [])

  const setError = useCallback((key: string, on: boolean) => setErrorKeys(prev => {
    if (on === prev.has(key)) return prev
    const next = new Set(prev)
    if (on) next.add(key); else next.delete(key)
    return next
  }), [])

  const abortInFlight = useCallback(() => {
    Object.values(abortRef.current).forEach(c => c.abort())
  }, [])

  const clearLoading = useCallback(() => {
    loadingCountRef.current = 0
    setLoadingKeys(new Set())
  }, [])

  const clearActiveCategory = useCallback((bumpAbort = true) => {
    if (bumpAbort) {
      abortInFlight()
      abortRef.current = {}
    }
    clearLoading()
    setActive(new Set())
    setByCat({})
    setErrorKeys(new Set())
    setMoved(false)
  }, [abortInFlight, clearLoading])

  const resolveFetchBBox = useCallback((viewport: Bbox): Bbox | null => {
    if (!isValidBbox(viewport)) return null
    if (!shouldClipRef.current) return viewport
    const feature = clipFeatureRef.current
    if (!feature) return null
    const placeBox = placeFootprintBoundingBox(feature)
    if (!placeBox) return null
    return intersectBbox(viewport, placeBox)
  }, [])

  const fetchCat = useCallback(async (key: string, viewport: Bbox) => {
    if (!isExploreEnabledRef.current) return
    const fetchBox = resolveFetchBBox(viewport)
    abortRef.current[key]?.abort()
    const ctrl = new AbortController()
    abortRef.current[key] = ctrl
    setLoading(key, true)
    setError(key, false)
    if (!fetchBox) {
      setByCat(prev => (activeRef.current.has(key) ? { ...prev, [key]: [] } : prev))
      setLoading(key, false)
      delete abortRef.current[key]
      return
    }
    try {
      const pois = catalogRef.current
        ? await listCatalogPoisInBbox({ category: key, bbox: fetchBox, signal: ctrl.signal })
        : await listOsmPoisInBboxTiled({
          category: key,
          bbox: fetchBox,
          placeCentroids: centroidsRef.current,
          signal: ctrl.signal,
        })
      if (ctrl.signal.aborted) return
      setByCat(prev => (activeRef.current.has(key) ? { ...prev, [key]: pois } : prev))
    } catch (err) {
      if (isAbortError(err) || ctrl.signal.aborted) return
      setByCat(prev => (activeRef.current.has(key) ? { ...prev, [key]: [] } : prev))
      if (activeRef.current.has(key)) setError(key, true)
    } finally {
      // Only the current generation may clear the spinner. If callers wiped
      // abortRef after aborting (no replacement owner), still drop the key.
      if (abortRef.current[key] === ctrl) {
        setLoading(key, false)
        delete abortRef.current[key]
      } else if (ctrl.signal.aborted && abortRef.current[key] == null) {
        setLoading(key, false)
      }
    }
  }, [resolveFetchBBox, setLoading, setError])

  const onViewportChange = useCallback((bbox: Bbox) => {
    const had = bboxRef.current != null
    bboxRef.current = bbox
    if (!isExploreEnabledRef.current || activeRef.current.size === 0) return
    if (!had) {
      setMoved(false)
      activeRef.current.forEach(key => { void fetchCat(key, bbox) })
    } else if (loadingCountRef.current === 0) {
      setMoved(true)
    }
  }, [fetchCat])

  const toggle = useCallback((key: string) => {
    if (!isExploreEnabledRef.current) return
    const isOnlyActive = activeRef.current.has(key) && activeRef.current.size === 1
    setMoved(false)
    setErrorKeys(new Set())
    abortInFlight()
    if (isOnlyActive) {
      clearLoading()
      setActive(new Set())
      setByCat({})
      return
    }
    clearLoading()
    setActive(new Set([key]))
    setByCat({})
    if (bboxRef.current) void fetchCat(key, bboxRef.current)
  }, [abortInFlight, clearLoading, fetchCat])

  const searchArea = useCallback(() => {
    if (!isExploreEnabledRef.current) return
    const bbox = bboxRef.current
    if (!bbox) return
    setMoved(false)
    activeRef.current.forEach(key => { void fetchCat(key, bbox) })
  }, [fetchCat])

  const setUsesFamilyCatalog = useCallback((value: boolean) => {
    if (catalogRef.current === value) return
    catalogRef.current = value
    setUsesFamilyCatalogState(value)
    if (!isExploreEnabledRef.current) {
      abortInFlight()
      clearLoading()
      setByCat({})
      setMoved(false)
      return
    }
    setMoved(false)
    setErrorKeys(new Set())
    setByCat({})
    const bbox = bboxRef.current
    if (bbox && activeRef.current.size > 0) {
      activeRef.current.forEach(key => { void fetchCat(key, bbox) })
      return
    }
    abortInFlight()
    clearLoading()
  }, [abortInFlight, clearLoading, fetchCat])

  const setAllowNearby = useCallback((value: boolean) => {
    if (allowNearbyRef.current === value) return
    allowNearbyRef.current = value
    setAllowNearbyState(value)
    // iOS: clip filter updates immediately via shouldClip; mark moved for Search this area refetch.
    if (activeRef.current.size > 0) setMoved(true)
  }, [])

  const updatePlaceFocus = useCallback((opts: {
    name: string | null
    hasBoundary: boolean
    feature: PlaceFootprintFeature | null
  }) => {
    const placeChanged = opts.name !== focusNameRef.current
    focusNameRef.current = opts.name
    focusBoundaryRef.current = opts.hasBoundary
    clipFeatureRef.current = opts.feature
    setFocusedPlaceName(opts.name)
    setFocusedPlaceHasBoundary(opts.hasBoundary)
    setClipFeature(opts.feature)

    if (placeChanged) {
      allowNearbyRef.current = false
      setAllowNearbyState(false)
      if (activeRef.current.size > 0) {
        setByCat({})
        if (opts.hasBoundary || opts.name == null) {
          setMoved(true)
        }
      }
    }
    if (opts.name != null && !opts.hasBoundary) {
      clearActiveCategory()
    }
  }, [clearActiveCategory])

  const fetchedPois = useMemo(() => Object.values(byCat).flat(), [byCat])

  const pois = useMemo(() => {
    if (!shouldClipToPlace || !clipFeature) return fetchedPois
    return fetchedPois.filter(p => placeFootprintContains(clipFeature, p.lat, p.lng))
  }, [fetchedPois, shouldClipToPlace, clipFeature])

  const showEmptyFamilyPicks = usesFamilyCatalog
    && isExploreEnabled
    && active.size > 0
    && loadingKeys.size === 0
    && errorKeys.size === 0
    && !moved
    && pois.length === 0

  return {
    active,
    pois,
    loadingKeys,
    errorKeys,
    moved,
    toggle,
    searchArea,
    onViewportChange,
    usesFamilyCatalog,
    setUsesFamilyCatalog,
    showEmptyFamilyPicks,
    allowNearby,
    setAllowNearby,
    updatePlaceFocus,
    isExploreEnabled,
    showNearbyToggle,
    showBoundaryComingSoon,
  }
}

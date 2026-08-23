import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { listCatalogPoisInBbox } from '../../data/supabase/catalogPois'
import { listOsmPoisInBboxTiled } from '../../data/supabase/mapsPois'
import type { Poi } from './poiCategories'
import { useWorkspacePois, type Bbox } from './useWorkspacePois'

vi.mock('../../data/supabase/catalogPois', () => ({
  listCatalogPoisInBbox: vi.fn(),
}))

vi.mock('../../data/supabase/mapsPois', () => ({
  listOsmPoisInBboxTiled: vi.fn(),
}))

const BBOX: Bbox = { south: 40.40, west: -3.75, north: 40.50, east: -3.65 }

function poi(over: Partial<Poi> = {}): Poi {
  return {
    osm_id: 'osm:1',
    name: 'Casa Botín',
    lat: 40.414,
    lng: -3.708,
    category: 'restaurant',
    poi_type: 'restaurant',
    address: null,
    website: null,
    phone: null,
    opening_hours: null,
    cuisine: null,
    source: 'openstreetmap',
    ...over,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useWorkspacePois in-flight source switch', () => {
  const catalog = vi.mocked(listCatalogPoisInBbox)
  const osm = vi.mocked(listOsmPoisInBboxTiled)
  let catalogPending: ReturnType<typeof deferred<Poi[]>>[]

  beforeEach(() => {
    catalogPending = []
    catalog.mockReset()
    osm.mockReset()
    catalog.mockImplementation(() => {
      const d = deferred<Poi[]>()
      catalogPending.push(d)
      return d.promise
    })
    osm.mockResolvedValue([poi()])
  })

  afterEach(async () => {
    await act(async () => {
      catalogPending.forEach(d => d.resolve([]))
    })
  })

  it('FE-HOOK-WORKSPACEPOIS-001: Catalog → restaurants → Catalog off clears the pill spinner', async () => {
    const { result } = renderHook(() => useWorkspacePois())

    act(() => {
      result.current.onViewportChange(BBOX)
      result.current.setUsesFamilyCatalog(true)
      result.current.toggle('restaurant')
    })

    await waitFor(() => {
      expect(result.current.loadingKeys.has('restaurant')).toBe(true)
      expect(catalog).toHaveBeenCalled()
    })

    act(() => {
      result.current.setUsesFamilyCatalog(false)
    })

    await waitFor(() => {
      expect(osm).toHaveBeenCalled()
      expect(result.current.loadingKeys.has('restaurant')).toBe(false)
    })
    expect(result.current.pois).toEqual([poi()])
    expect(result.current.usesFamilyCatalog).toBe(false)

    const lateCatalog = [poi({ osm_id: 'catalog:food:1', source: 'catalog', name: 'Late catalog' })]
    await act(async () => {
      catalogPending[0]?.resolve(lateCatalog)
      await Promise.resolve()
    })

    expect(result.current.loadingKeys.has('restaurant')).toBe(false)
    expect(result.current.pois.some(p => p.source === 'catalog')).toBe(false)
  })

  it('FE-HOOK-WORKSPACEPOIS-002: turning the only category off while loading clears loadingKeys', async () => {
    const { result } = renderHook(() => useWorkspacePois())

    act(() => {
      result.current.onViewportChange(BBOX)
      result.current.setUsesFamilyCatalog(true)
      result.current.toggle('restaurant')
    })

    await waitFor(() => expect(result.current.loadingKeys.has('restaurant')).toBe(true))

    act(() => {
      result.current.toggle('restaurant')
    })

    expect(result.current.active.size).toBe(0)
    expect(result.current.loadingKeys.size).toBe(0)
  })

  it('FE-HOOK-WORKSPACEPOIS-003: catalog bbox fetch receives an AbortSignal', async () => {
    const { result } = renderHook(() => useWorkspacePois())

    act(() => {
      result.current.onViewportChange(BBOX)
      result.current.setUsesFamilyCatalog(true)
      result.current.toggle('restaurant')
    })

    await waitFor(() => expect(catalog).toHaveBeenCalled())
    expect(catalog.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      category: 'restaurant',
      signal: expect.any(AbortSignal),
    }))
  })
})

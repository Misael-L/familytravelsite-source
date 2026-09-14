import type { ReactElement, RefObject } from 'react'
import { useEffectiveMapConfig } from './useEffectiveMapConfig'
import AtlasMapGL, { type AtlasMapGLProps } from './AtlasMapGL'

type AtlasMapAutoProps = Omit<AtlasMapGLProps, 'render'> & {
  mapRef: RefObject<HTMLDivElement | null>
}

export default function AtlasMapAuto({ mapRef, dark, loading, ...overlay }: AtlasMapAutoProps): ReactElement {
  const render = useEffectiveMapConfig({ variant: 'atlas' })
  if (render.engine !== 'leaflet') {
    return (
      <AtlasMapGL
        render={render}
        dark={dark}
        loading={loading}
        {...overlay}
      />
    )
  }
  return (
    <div
      ref={mapRef}
      data-atlas-engine="leaflet"
      style={{ position: 'absolute', inset: 0, zIndex: 1, background: dark ? '#1a1a2e' : '#f0f0f0' }}
    />
  )
}

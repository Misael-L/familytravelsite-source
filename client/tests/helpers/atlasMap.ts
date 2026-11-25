import { vi } from 'vitest';

export interface MockGeoJson {
  data: { features?: Record<string, unknown>[] };
  options: Record<string, unknown>;
  entries: { feature: Record<string, unknown>; layer: MockLayer }[];
  styles: Record<string, unknown>[];
  /** Whether this layer is on the map right now: built is not the same as shown. */
  attached: boolean;
}

export interface MockLayer {
  handlers: Record<string, (e: unknown) => void>;
  bindTooltip: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  setStyle: ReturnType<typeof vi.fn>;
  getBounds: ReturnType<typeof vi.fn>;
}

export interface MockMarker {
  /** One list per event: the bucket marker binds two mouseover handlers. */
  handlers: Record<string, ((e?: unknown) => void)[]>;
  tooltipEl: HTMLElement;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  getLatLng: ReturnType<typeof vi.fn>;
  bindTooltip: ReturnType<typeof vi.fn>;
  getTooltip: () => { options: Record<string, unknown> } | undefined;
  closeTooltip: ReturnType<typeof vi.fn>;
}

export const lf = {
  mapHandlers: {} as Record<string, ((e?: unknown) => void)[]>,
  geoJson: [] as unknown[],
  panes: {} as Record<string, { style: Record<string, string> }>,
  zoom: 3,
  intersects: true,
  // The country codes the viewport is over, when a test needs to be selective about it.
  // null falls back to the blanket `intersects` answer.
  intersectsOnly: null as string[] | null,
  hasLayer: true,
  boundsThrows: false,
  mapsCreated: 0,
  mapsRemoved: 0,
  markers: 0,
  bucketMarkers: [] as MockMarker[],
  // Where the map places a marker inside its container; the container itself sits at
  // 0,0 in jsdom, so this doubles as the marker's screen position.
  markerPoint: { x: 500, y: 400 },
  scrollPropagationOff: [] as HTMLElement[],
  clickPropagationOff: [] as HTMLElement[],
  map: null as null | { setView: ReturnType<typeof vi.fn> },
  reset() {
    this.mapHandlers = {};
    this.geoJson = [];
    this.panes = { overlayPane: { style: {} } };
    this.zoom = 3;
    this.intersects = true;
    this.intersectsOnly = null;
    this.hasLayer = true;
    this.boundsThrows = false;
    this.mapsCreated = 0;
    this.mapsRemoved = 0;
    this.markers = 0;
    this.bucketMarkers = [];
    this.markerPoint = { x: 500, y: 400 };
    this.scrollPropagationOff = [];
    this.clickPropagationOff = [];
  },
};

// maplibre-gl-leaflet hangs the vector basemap into Leaflet's tile pane. The mock
// only has to be callable and hand back a layer with the three methods the callers
// use, since nothing here renders WebGL.
vi.mock('@maplibre/maplibre-gl-leaflet', () => ({
  maplibreGL: vi.fn(() => {
    // One GL map per layer, kept stable: a fresh object per call would hand the
    // assertions a different spy than the code just used.
    const gl = {
      setStyle: vi.fn(),
      on: vi.fn(),
      isStyleLoaded: () => false,
      getStyle: () => ({ layers: [] }),
      setLayoutProperty: vi.fn(),
    };
    const layer: Record<string, unknown> = { remove: vi.fn(), getMaplibreMap: vi.fn(() => gl) };
    layer.addTo = vi.fn(() => layer);
    return layer;
  }),
}));
vi.mock('../../src/components/Map/engines/maplibre', () => ({ default: {} }));
// jsdom refuses a WebGL context, and the basemap now believes it (#2288). These
// cases are about the GL layer, so the probe says yes here.
vi.mock('../../src/utils/webgl', () => ({ hasWebGL: () => true, resetWebGLProbe: () => {} }));

vi.mock('leaflet', () => {
  // The bounds a country layer reports carry its own code, so the map's bounds can
  // answer `intersects` per country instead of all-or-nothing.
  const makeLayer = (feature?: { properties?: Record<string, unknown> }) => {
    const code = typeof feature?.properties?.ISO_A2 === 'string' ? feature.properties.ISO_A2 : null;
    const handlers: Record<string, (e: unknown) => void> = {};
    const layer = {
      handlers,
      bindTooltip: vi.fn(() => layer),
      on: vi.fn((event: string, cb: (e: unknown) => void) => {
        handlers[event] = cb;
        return layer;
      }),
      setStyle: vi.fn(),
      getBounds: vi.fn(() => {
        if (lf.boundsThrows) throw new Error('no bounds');
        return { isValid: () => true, code };
      }),
    };
    return layer;
  };

  const mapContainer = document.createElement('div');

  const map = {
    setView: vi.fn(() => map),
    on: vi.fn((event: string, cb: () => void) => {
      (lf.mapHandlers[event] ||= []).push(cb);
      return map;
    }),
    off: vi.fn(() => map),
    remove: vi.fn(() => {
      lf.mapsRemoved += 1;
    }),
    fitBounds: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn((layer?: { record?: { attached: boolean } }) => {
      if (layer?.record) layer.record.attached = false;
    }),
    getZoom: vi.fn(() => lf.zoom),
    getCenter: vi.fn(() => ({ lat: 25, lng: 0 })),
    getBounds: vi.fn(() => ({
      intersects: (other?: { code?: string | null }) =>
        lf.intersectsOnly ? !!other?.code && lf.intersectsOnly.includes(other.code) : lf.intersects,
    })),
    hasLayer: vi.fn(() => lf.hasLayer),
    createPane: vi.fn((name: string) => {
      lf.panes[name] = { style: {} };
    }),
    getPane: vi.fn((name: string) => lf.panes[name]),
    getContainer: vi.fn(() => mapContainer),
    latLngToContainerPoint: vi.fn(() => lf.markerPoint),
  };
  // Published so a test can assert the map actually moved (place search flies
  // there before the region lookup returns).
  lf.map = map;

  const L = {
    map: vi.fn(() => {
      lf.mapsCreated += 1;
      return map;
    }),
    tileLayer: vi.fn(() => ({ addTo: vi.fn(), setUrl: vi.fn() })),
    control: { zoom: vi.fn(() => ({ addTo: vi.fn() })) },
    canvas: vi.fn(() => ({})),
    svg: vi.fn(() => ({})),
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => {
      lf.markers += 1;
      const handlers: Record<string, ((e?: unknown) => void)[]> = {};
      const tooltipEl = document.createElement('div');
      let tooltip: { options: Record<string, unknown>; getElement: () => HTMLElement } | undefined;
      const m: MockMarker = {
        handlers,
        tooltipEl,
        on: vi.fn((event: string, cb: (e?: unknown) => void) => {
          (handlers[event] ||= []).push(cb);
          return m;
        }),
        off: vi.fn(() => m),
        getLatLng: vi.fn(() => ({ lat: 0, lng: 0 })),
        bindTooltip: vi.fn((html: string, options: Record<string, unknown>) => {
          tooltipEl.innerHTML = html;
          tooltip = { options: { ...options }, getElement: () => tooltipEl };
          return m;
        }),
        getTooltip: vi.fn(() => tooltip),
        closeTooltip: vi.fn(),
      };
      lf.bucketMarkers.push(m);
      return m;
    }),
    layerGroup: vi.fn(() => ({ addTo: vi.fn(() => ({})) })),
    DomEvent: {
      disableScrollPropagation: vi.fn((el: HTMLElement) => {
        lf.scrollPropagationOff.push(el);
      }),
      disableClickPropagation: vi.fn((el: HTMLElement) => {
        lf.clickPropagationOff.push(el);
      }),
    },
    geoJSON: vi.fn((data: { features?: Record<string, unknown>[] }, options: Record<string, unknown>) => {
      const record = { data, options, entries: [] as unknown[], styles: [] as unknown[], attached: false };
      const style = options?.style as ((f: unknown) => unknown) | undefined;
      const onEachFeature = options?.onEachFeature as ((f: unknown, l: unknown) => void) | undefined;
      for (const feature of data?.features ?? []) {
        if (style) record.styles.push(style(feature));
        if (onEachFeature) {
          const layer = makeLayer(feature as { properties?: Record<string, unknown> });
          onEachFeature(feature, layer);
          record.entries.push({ feature, layer });
        }
      }
      lf.geoJson.push(record);
      const result = {
        record,
        addTo: vi.fn(() => {
          record.attached = true;
          return result;
        }),
        removeFrom: vi.fn(() => {
          record.attached = false;
        }),
        remove: vi.fn(() => {
          record.attached = false;
        }),
        clearLayers: vi.fn(),
        resetStyle: vi.fn(),
      };
      return result;
    }),
  };
  return { default: L, ...L };
});

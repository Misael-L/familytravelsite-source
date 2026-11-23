/** In-browser GPX / KML / KMZ → RFC 7946 lines. Does not insert catalog places. */

export const MAX_TRACK_VERTICES = 10_000
export const MAX_TRACK_FILE_BYTES = 10 * 1024 * 1024

export type TrackKind = 'track' | 'route' | 'waypoints'
export type TrackSource = 'gpx' | 'kml'

export type GeoJsonPosition = [number, number] | [number, number, number]

export type GeoJsonLineGeometry =
  | { type: 'LineString'; coordinates: GeoJsonPosition[] }
  | { type: 'MultiLineString'; coordinates: GeoJsonPosition[][] }

export type ParsedWaypoint = {
  name: string
  lat: number
  lng: number
  elevation: number | null
  sortOrder: number
}

export type ParsedTrack = {
  name: string
  kind: TrackKind
  source: TrackSource
  sourceFilename: string
  geometry: GeoJsonLineGeometry | null
  startLat: number
  startLng: number
  waypoints: ParsedWaypoint[]
}

export type ParseGpxKmlOptions = {
  includeTracks?: boolean
  includeRoutes?: boolean
  includeWaypoints?: boolean
  includeKmlPaths?: boolean
  includeKmlPoints?: boolean
}

export type TrackParseErrorCode = 'empty' | 'unsupported' | 'invalid' | 'too_large' | 'kmz'

export class TrackParseError extends Error {
  readonly code: TrackParseErrorCode

  constructor(code: TrackParseErrorCode, message: string) {
    super(message)
    this.name = 'TrackParseError'
    this.code = code
  }
}

function byLocal(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter(el => el.localName === localName)
}

function direct(el: Element, localName: string): Element[] {
  return Array.from(el.children).filter(c => c.localName === localName)
}

function textOf(el: Element, localName: string): string {
  const n = direct(el, localName)[0]
  return (n?.textContent ?? '').trim()
}

function fileStem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').trim() || filename
}

function extOf(filename: string): string {
  const parts = filename.toLowerCase().split('.')
  return parts.length > 1 ? (parts.pop() ?? '') : ''
}

function parseLatLng(latRaw: string | null, lonRaw: string | null): { lat: number; lng: number } | null {
  const lat = Number(latRaw)
  const lng = Number(lonRaw)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function elevationOf(el: Element): number | null {
  const raw = textOf(el, 'ele')
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function position(lng: number, lat: number, ele: number | null): GeoJsonPosition {
  return ele == null ? [lng, lat] : [lng, lat, ele]
}

function firstVertex(coords: GeoJsonPosition[] | GeoJsonPosition[][]): { lat: number; lng: number } | null {
  if (!coords.length) return null
  const head = coords[0]
  if (typeof head[0] === 'number') {
    const p = head as GeoJsonPosition
    return { lng: p[0], lat: p[1] }
  }
  const inner = head as unknown as GeoJsonPosition[]
  if (!inner.length) return null
  return { lng: inner[0][0], lat: inner[0][1] }
}

function perpendicularDistance(p: GeoJsonPosition, a: GeoJsonPosition, b: GeoJsonPosition): number {
  const [x, y] = p
  const [x1, y1] = a
  const [x2, y2] = b
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1)
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

function douglasPeucker(points: GeoJsonPosition[], epsilon: number): GeoJsonPosition[] {
  if (points.length <= 2) return points
  let maxD = 0
  let idx = 0
  const end = points.length - 1
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end])
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD > epsilon) {
    const left = douglasPeucker(points.slice(0, idx + 1), epsilon)
    const right = douglasPeucker(points.slice(idx), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [points[0], points[end]]
}

function uniformSample(points: GeoJsonPosition[], max: number): GeoJsonPosition[] {
  if (points.length <= max) return points
  const out: GeoJsonPosition[] = []
  const last = points.length - 1
  for (let i = 0; i < max - 1; i++) {
    out.push(points[Math.round((i * last) / (max - 1))])
  }
  out.push(points[last])
  return out
}

/** Cap a line at 10k vertices (Douglas–Peucker, then uniform sample). */
export function capLineVertices(points: GeoJsonPosition[], max = MAX_TRACK_VERTICES): GeoJsonPosition[] {
  if (points.length <= max) return points
  let epsilon = 1e-5
  let simplified = points
  while (simplified.length > max && epsilon < 2) {
    simplified = douglasPeucker(points, epsilon)
    epsilon *= 2
  }
  return uniformSample(simplified, max)
}

function lineGeometry(lines: GeoJsonPosition[][]): GeoJsonLineGeometry | null {
  const capped = lines.map(seg => capLineVertices(seg)).filter(seg => seg.length >= 2)
  if (capped.length === 0) return null
  if (capped.length === 1) return { type: 'LineString', coordinates: capped[0] }
  return { type: 'MultiLineString', coordinates: capped }
}

function gpxPoint(el: Element): { lat: number; lng: number; ele: number | null; pos: GeoJsonPosition } | null {
  const ll = parseLatLng(el.getAttribute('lat'), el.getAttribute('lon'))
  if (!ll) return null
  const ele = elevationOf(el)
  return { ...ll, ele, pos: position(ll.lng, ll.lat, ele) }
}

function parseGpx(doc: Document, filename: string, opts: Required<ParseGpxKmlOptions>): ParsedTrack[] {
  const source: TrackSource = 'gpx'
  const fallback = fileStem(filename)
  const out: ParsedTrack[] = []
  const metaName = textOf(doc.documentElement, 'name')

  if (opts.includeTracks) {
    byLocal(doc, 'trk').forEach((trk, idx) => {
      const segs = direct(trk, 'trkseg')
      const sources = segs.length ? segs : [trk]
      const lines: GeoJsonPosition[][] = []
      const named: ParsedWaypoint[] = []
      sources.forEach(seg => {
        const line: GeoJsonPosition[] = []
        byLocal(seg, 'trkpt').forEach(pt => {
          const parsed = gpxPoint(pt)
          if (!parsed) return
          line.push(parsed.pos)
          const n = textOf(pt, 'name')
          if (n) {
            named.push({
              name: n,
              lat: parsed.lat,
              lng: parsed.lng,
              elevation: parsed.ele,
              sortOrder: named.length,
            })
          }
        })
        if (line.length) lines.push(line)
      })
      const geometry = lineGeometry(lines)
      if (!geometry) return
      const start = firstVertex(geometry.coordinates)
      if (!start) return
      out.push({
        name: textOf(trk, 'name') || metaName || `${fallback} track ${idx + 1}`,
        kind: 'track',
        source,
        sourceFilename: filename,
        geometry,
        startLat: start.lat,
        startLng: start.lng,
        waypoints: named,
      })
    })
  }

  if (opts.includeRoutes) {
    byLocal(doc, 'rte').forEach((rte, idx) => {
      const line: GeoJsonPosition[] = []
      const named: ParsedWaypoint[] = []
      byLocal(rte, 'rtept').forEach(pt => {
        const parsed = gpxPoint(pt)
        if (!parsed) return
        line.push(parsed.pos)
        const n = textOf(pt, 'name')
        if (n) {
          named.push({
            name: n,
            lat: parsed.lat,
            lng: parsed.lng,
            elevation: parsed.ele,
            sortOrder: named.length,
          })
        }
      })
      const geometry = lineGeometry([line])
      if (!geometry) return
      const start = firstVertex(geometry.coordinates)
      if (!start) return
      out.push({
        name: textOf(rte, 'name') || metaName || `${fallback} route ${idx + 1}`,
        kind: 'route',
        source,
        sourceFilename: filename,
        geometry,
        startLat: start.lat,
        startLng: start.lng,
        waypoints: named,
      })
    })
  }

  if (opts.includeWaypoints) {
    const wpts = byLocal(doc, 'wpt')
      .map((el, i) => {
        const parsed = gpxPoint(el)
        if (!parsed) return null
        return {
          name: textOf(el, 'name') || `Waypoint ${i + 1}`,
          lat: parsed.lat,
          lng: parsed.lng,
          elevation: parsed.ele,
          sortOrder: i,
        } satisfies ParsedWaypoint
      })
      .filter((w): w is ParsedWaypoint => w != null)
    if (wpts.length) {
      out.push({
        name: metaName || `${fallback} waypoints`,
        kind: 'waypoints',
        source,
        sourceFilename: filename,
        geometry: null,
        startLat: wpts[0].lat,
        startLng: wpts[0].lng,
        waypoints: wpts.map((w, i) => ({ ...w, sortOrder: i })),
      })
    }
  }

  return out
}

function parseKmlCoordTuple(tuple: string): GeoJsonPosition | null {
  const parts = tuple.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const lng = Number(parts[0])
  const lat = Number(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  if (parts.length >= 3) {
    const ele = Number(parts[2])
    if (Number.isFinite(ele)) return [lng, lat, ele]
  }
  return [lng, lat]
}

function parseKmlCoordText(text: string): GeoJsonPosition[] {
  return text
    .trim()
    .split(/[\s\n]+/)
    .map(parseKmlCoordTuple)
    .filter((p): p is GeoJsonPosition => p != null)
}

function kmlCoordElement(el: Element): GeoJsonPosition[] {
  const coordEl = byLocal(el, 'coordinates')[0]
  if (!coordEl?.textContent) return []
  return parseKmlCoordText(coordEl.textContent)
}

function parseKml(doc: Document, filename: string, opts: Required<ParseGpxKmlOptions>): ParsedTrack[] {
  const source: TrackSource = 'kml'
  const fallback = fileStem(filename)
  const out: ParsedTrack[] = []
  const leftoverPoints: ParsedWaypoint[] = []

  byLocal(doc, 'Placemark').forEach((mark, idx) => {
    const name = textOf(mark, 'name') || `${fallback} ${idx + 1}`
    const lineEls = byLocal(mark, 'LineString')
    const pointEls = byLocal(mark, 'Point')

    if (opts.includeKmlPaths && lineEls.length) {
      const lines = lineEls.map(el => kmlCoordElement(el)).filter(seg => seg.length >= 2)
      const geometry = lineGeometry(lines)
      if (!geometry) return
      const start = firstVertex(geometry.coordinates)
      if (!start) return
      const named: ParsedWaypoint[] = []
      if (opts.includeKmlPoints) {
        pointEls.forEach(pt => {
          const coords = kmlCoordElement(pt)
          if (!coords.length) return
          const [lng, lat, ele] = coords[0]
          named.push({
            name: textOf(pt, 'name') || name,
            lat,
            lng,
            elevation: ele ?? null,
            sortOrder: named.length,
          })
        })
      }
      out.push({
        name,
        kind: 'track',
        source,
        sourceFilename: filename,
        geometry,
        startLat: start.lat,
        startLng: start.lng,
        waypoints: named,
      })
      return
    }

    if (opts.includeKmlPoints && pointEls.length) {
      pointEls.forEach(pt => {
        const coords = kmlCoordElement(pt)
        if (!coords.length) return
        const [lng, lat, ele] = coords[0]
        leftoverPoints.push({
          name,
          lat,
          lng,
          elevation: ele ?? null,
          sortOrder: leftoverPoints.length,
        })
      })
    }
  })

  if (leftoverPoints.length) {
    out.push({
      name: `${fallback} waypoints`,
      kind: 'waypoints',
      source,
      sourceFilename: filename,
      geometry: null,
      startLat: leftoverPoints[0].lat,
      startLng: leftoverPoints[0].lng,
      waypoints: leftoverPoints.map((w, i) => ({ ...w, sortOrder: i })),
    })
  }

  return out
}

function defaults(opts?: ParseGpxKmlOptions): Required<ParseGpxKmlOptions> {
  return {
    includeTracks: opts?.includeTracks !== false,
    includeRoutes: opts?.includeRoutes !== false,
    includeWaypoints: opts?.includeWaypoints !== false,
    includeKmlPaths: opts?.includeKmlPaths !== false,
    includeKmlPoints: opts?.includeKmlPoints !== false,
  }
}

export function parseGpxKmlXml(
  xml: string,
  filename: string,
  source: TrackSource,
  opts?: ParseGpxKmlOptions,
): ParsedTrack[] {
  const trimmed = xml.trim()
  if (!trimmed) throw new TrackParseError('empty', 'Empty file')
  const doc = new DOMParser().parseFromString(trimmed, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new TrackParseError('invalid', 'Invalid XML')
  }
  const resolved = defaults(opts)
  const tracks = source === 'gpx' ? parseGpx(doc, filename, resolved) : parseKml(doc, filename, resolved)
  if (tracks.length === 0) throw new TrackParseError('empty', 'No tracks or waypoints found')
  return tracks
}

async function xmlFromKmz(buffer: ArrayBuffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  let zip: { files: Record<string, { dir: boolean; async: (t: 'string') => Promise<string> }> }
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new TrackParseError('kmz', 'Could not read this KMZ file')
  }
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir && n.toLowerCase().endsWith('.kml'))
  const preferred = names.find(n => n.toLowerCase().endsWith('doc.kml')) ?? names[0]
  if (!preferred) throw new TrackParseError('empty', 'KMZ has no KML')
  return zip.files[preferred].async('string')
}

export async function parseGpxKmlFile(file: File, opts?: ParseGpxKmlOptions): Promise<ParsedTrack[]> {
  const ext = extOf(file.name)
  if (ext !== 'gpx' && ext !== 'kml' && ext !== 'kmz') {
    throw new TrackParseError('unsupported', 'Unsupported file type')
  }
  if (file.size > MAX_TRACK_FILE_BYTES) {
    throw new TrackParseError('too_large', 'File is too large')
  }
  const buffer = await file.arrayBuffer()
  if (ext === 'kmz') {
    const xml = await xmlFromKmz(buffer)
    return parseGpxKmlXml(xml, file.name, 'kml', opts)
  }
  const xml = new TextDecoder().decode(buffer)
  return parseGpxKmlXml(xml, file.name, ext === 'gpx' ? 'gpx' : 'kml', opts)
}

const EARTH_M = 6371000

function haversineM(a: GeoJsonPosition, b: GeoJsonPosition): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

function ringLengthM(coords: GeoJsonPosition[]): number {
  let sum = 0
  for (let i = 1; i < coords.length; i++) sum += haversineM(coords[i - 1], coords[i])
  return sum
}

/** Client-only length. Not stored. */
export function geometryLengthMeters(geometry: GeoJsonLineGeometry | null | undefined): number | null {
  if (!geometry) return null
  if (geometry.type === 'LineString') return ringLengthM(geometry.coordinates)
  return geometry.coordinates.reduce((acc, line) => acc + ringLengthM(line), 0)
}

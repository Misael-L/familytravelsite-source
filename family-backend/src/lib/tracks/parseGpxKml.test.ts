import { describe, expect, it } from 'vitest'
import {
  MAX_TRACK_VERTICES,
  TrackParseError,
  capLineVertices,
  geometryLengthMeters,
  parseGpxKmlFile,
  parseGpxKmlXml,
} from './parseGpxKml'

const GPX_NS = 'http://www.topografix.com/GPX/1/1'

function gpxTrack(name: string, pts: Array<[number, number]>): string {
  const body = pts.map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"></trkpt>`).join('')
  return `<?xml version="1.0"?><gpx xmlns="${GPX_NS}"><trk><name>${name}</name><trkseg>${body}</trkseg></trk></gpx>`
}

describe('parseGpxKmlXml', () => {
  it('throws empty for a blank file', () => {
    expect(() => parseGpxKmlXml('', 'blank.gpx', 'gpx')).toThrow(TrackParseError)
    try {
      parseGpxKmlXml('', 'blank.gpx', 'gpx')
    } catch (e) {
      expect(e).toMatchObject({ code: 'empty' })
    }
  })

  it('throws empty when GPX has no tracks or waypoints', () => {
    try {
      parseGpxKmlXml(`<gpx xmlns="${GPX_NS}"></gpx>`, 'empty.gpx', 'gpx')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(TrackParseError)
      expect(e).toMatchObject({ code: 'empty' })
    }
  })

  it('reads GPX track name including escaped XML', () => {
    const xml = gpxTrack('Ridge &amp; Lake', [
      [46.0, 11.0],
      [46.01, 11.02],
    ])
    const tracks = parseGpxKmlXml(xml, 'hike.gpx', 'gpx')
    expect(tracks).toHaveLength(1)
    expect(tracks[0].kind).toBe('track')
    expect(tracks[0].name).toBe('Ridge & Lake')
    expect(tracks[0].geometry?.type).toBe('LineString')
    expect(tracks[0].geometry?.coordinates[0]).toEqual([11.0, 46.0])
    expect(tracks[0].startLat).toBe(46.0)
    expect(tracks[0].startLng).toBe(11.0)
    expect(tracks[0].source).toBe('gpx')
  })

  it('imports file-level waypoints as kind=waypoints with null geometry', () => {
    const xml = `<?xml version="1.0"?><gpx xmlns="${GPX_NS}">
      <wpt lat="46.1" lon="11.2"><name>Picnic</name><ele>812</ele></wpt>
      <wpt lat="46.2" lon="11.3"><name>Spring</name></wpt>
    </gpx>`
    const tracks = parseGpxKmlXml(xml, 'pins.gpx', 'gpx')
    expect(tracks).toHaveLength(1)
    expect(tracks[0].kind).toBe('waypoints')
    expect(tracks[0].geometry).toBeNull()
    expect(tracks[0].waypoints.map(w => w.name)).toEqual(['Picnic', 'Spring'])
    expect(tracks[0].waypoints[0].elevation).toBe(812)
  })

  it('parses a KML LineString as kind=track with [lng,lat] order', () => {
    const xml = `<?xml version="1.0"?>
      <kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <Placemark><name>Coast</name>
          <LineString><coordinates>11.0,46.0,10 11.2,46.1,12</coordinates></LineString>
        </Placemark>
      </Document></kml>`
    const tracks = parseGpxKmlXml(xml, 'coast.kml', 'kml')
    expect(tracks[0].kind).toBe('track')
    expect(tracks[0].source).toBe('kml')
    expect(tracks[0].name).toBe('Coast')
    expect(tracks[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [11.0, 46.0, 10],
        [11.2, 46.1, 12],
      ],
    })
  })
})

describe('capLineVertices', () => {
  it('simplifies lines over the 10k vertex cap', () => {
    const pts = Array.from({ length: MAX_TRACK_VERTICES + 50 }, (_, i) => [11 + i * 0.00001, 46 + i * 0.00001] as [number, number])
    const capped = capLineVertices(pts)
    expect(capped.length).toBeLessThanOrEqual(MAX_TRACK_VERTICES)
    expect(capped[0]).toEqual(pts[0])
    expect(capped[capped.length - 1]).toEqual(pts[pts.length - 1])
  })
})

describe('parseGpxKmlFile', () => {
  it('rejects unsupported extensions', async () => {
    const file = new File(['nope'], 'notes.txt', { type: 'text/plain' })
    await expect(parseGpxKmlFile(file)).rejects.toMatchObject({ code: 'unsupported' })
  })

  it('parses a File of GPX XML', async () => {
    const xml = gpxTrack('UID Ridge', [
      [45.5, 10.5],
      [45.6, 10.6],
    ])
    const file = new File([xml], 'uid-ridge.gpx', { type: 'application/gpx+xml' })
    const tracks = await parseGpxKmlFile(file)
    expect(tracks[0].name).toBe('UID Ridge')
    expect(tracks[0].sourceFilename).toBe('uid-ridge.gpx')
  })

  it('unzips KMZ to KML', async () => {
    const JSZip = (await import('jszip')).default
    const xml = `<?xml version="1.0"?>
      <kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <Placemark><name>KMZ path</name>
          <LineString><coordinates>11.0,46.0 11.2,46.1</coordinates></LineString>
        </Placemark>
      </Document></kml>`
    const zip = new JSZip()
    zip.file('doc.kml', xml)
    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([bytes], 'path.kmz', { type: 'application/vnd.google-earth.kmz' })
    const tracks = await parseGpxKmlFile(file)
    expect(tracks[0].name).toBe('KMZ path')
    expect(tracks[0].source).toBe('kml')
  })
})

describe('geometryLengthMeters', () => {
  it('returns a positive length for a two-point line', () => {
    const m = geometryLengthMeters({
      type: 'LineString',
      coordinates: [
        [11, 46],
        [11.1, 46],
      ],
    })
    expect(m).toBeGreaterThan(5000)
    expect(m).toBeLessThan(12000)
  })
})

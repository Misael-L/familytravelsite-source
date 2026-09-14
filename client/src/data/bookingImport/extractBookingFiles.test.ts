import { describe, expect, it } from 'vitest'
import { extractBookingFiles } from './extractBookingFiles'
import { extractFromPlainText } from './heuristics'
import { itemsFromJsonLd } from './jsonLd'
import { importItemToDraft, importItemToTransportDraft } from './mapToDraft'
import { parsePassJson } from './pkpass'
import { extractJsonLdBlocks } from './htmlText'
import type { FamilyTripDay } from '../supabase/tripDays'
import type { FamilyTripPlace } from '../supabase/tripPlaces'

function fileOf(name: string, body: string, type = 'text/plain'): File {
  return new File([body], name, { type })
}

const LODGING_HTML = `<!doctype html><html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LodgingReservation",
  "reservationNumber": "HTL9981",
  "checkinTime": "2026-09-04",
  "checkoutTime": "2026-09-07",
  "reservationFor": {
    "@type": "LodgingBusiness",
    "name": "Hotel Lungarno",
    "address": { "streetAddress": "Borgo San Jacopo 14", "addressLocality": "Florence" }
  }
}
</script>
</head><body><p>Thanks for booking</p></body></html>`

const FLIGHT_JSON = {
  '@context': 'https://schema.org',
  '@type': 'FlightReservation',
  reservationNumber: 'ABC123',
  reservationFor: { '@type': 'Flight', name: 'AA 100', departureTime: '2026-09-01T10:00:00' },
}

const EVENT_PASS = {
  formatVersion: 1,
  passTypeIdentifier: 'pass.example.event',
  serialNumber: 'E-44',
  organizationName: 'Uffizi',
  description: 'Gallery entry',
  eventTicket: {
    primaryFields: [{ key: 'event', value: 'Uffizi Reserved' }],
    auxiliaryFields: [{ key: 'conf', value: 'UFZ44' }],
  },
  relevantDate: '2026-09-10T09:00:00+02:00',
}

describe('itemsFromJsonLd', () => {
  it('maps LodgingReservation to a hotel booking', () => {
    const blocks = extractJsonLdBlocks(LODGING_HTML)
    const items = itemsFromJsonLd(blocks, 'hotel.html')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'booking',
      type: 'hotel',
      title: 'Hotel Lungarno',
      confirmationCode: 'HTL9981',
      startsAt: '2026-09-04T00:00:00.000Z',
      endsAt: '2026-09-07T00:00:00.000Z',
      venueName: 'Hotel Lungarno',
    })
    expect(items[0].location).toContain('Florence')
  })

  it('classifies FlightReservation as skipped transport', () => {
    const items = itemsFromJsonLd([FLIGHT_JSON], 'flight.json')
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('transport')
    expect(items[0].type).toBe('flight')
    expect(items[0].confirmationCode).toBe('ABC123')
  })
})

describe('extractFromPlainText', () => {
  it('pulls confirmation and check-in dates from a confirmation letter', () => {
    const text = `Hotel Lungarno
Confirmation code: HTL9981
Check-in 2026-09-04
Check-out 2026-09-07
`
    const items = extractFromPlainText(text, 'confirm.txt')
    expect(items[0].confirmationCode).toBe('HTL9981')
    expect(items[0].type).toBe('hotel')
    expect(items[0].startsAt).toBe('2026-09-04T00:00:00.000Z')
    expect(items[0].endsAt).toBe('2026-09-07T00:00:00.000Z')
  })
})

describe('parsePassJson', () => {
  it('maps eventTicket pkpass JSON to an event booking', () => {
    const item = parsePassJson(EVENT_PASS, 'uffizi.pkpass')
    expect(item?.kind).toBe('booking')
    expect(item?.type).toBe('event')
    expect(item?.confirmationCode).toBe('UFZ44')
    expect(item?.startsAt?.startsWith('2026-09-10')).toBe(true)
  })

  it('maps boardingPass to transport', () => {
    const item = parsePassJson({
      organizationName: 'American Airlines',
      description: 'AA 100',
      boardingPass: { transitType: 'PKTransitTypeAir', primaryFields: [] },
      serialNumber: 'PNR1',
    }, 'aa.pkpass')
    expect(item?.kind).toBe('transport')
    expect(item?.type).toBe('flight')
  })
})

describe('extractBookingFiles', () => {
  it('extracts JSON-LD lodging from an HTML file', async () => {
    const { items } = await extractBookingFiles([fileOf('stay.html', LODGING_HTML, 'text/html')])
    expect(items[0]?.title).toBe('Hotel Lungarno')
    expect(items[0]?.kind).toBe('booking')
  })

  it('extracts lodging JSON-LD from a multipart EML', async () => {
    const eml = [
      'From: bookings@hotel.example',
      'Subject: Your stay',
      'Content-Type: multipart/alternative; boundary="BOUND"',
      '',
      '--BOUND',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'See HTML version',
      '--BOUND',
      'Content-Type: text/html; charset=utf-8',
      '',
      LODGING_HTML,
      '--BOUND--',
      '',
    ].join('\r\n')
    const { items } = await extractBookingFiles([fileOf('stay.eml', eml, 'message/rfc822')])
    expect(items[0]?.confirmationCode).toBe('HTL9981')
  })
})

describe('importItemToDraft', () => {
  const days: FamilyTripDay[] = [
    { id: 'd1', tripId: 't', civilDay: '2026-09-04', dayIndex: 0, title: null },
    { id: 'd2', tripId: 't', civilDay: '2026-09-07', dayIndex: 3, title: null },
  ]
  const places: FamilyTripPlace[] = [
    { id: 'p1', name: 'Hotel Lungarno', lat: 0, lng: 0, notes: null, timeZone: null, countryId: null, placeTypeId: null, isPrimary: true, imageUrl: null, familyPlaceCategoryId: null, familyPlaceCategoryName: null, familyPlaceCategoryColor: null, familyPlaceCategoryIcon: null },
  ]

  it('matches an existing trip place and exact trip days; does not invent hotel_id', () => {
    const items = itemsFromJsonLd(extractJsonLdBlocks(LODGING_HTML), 'hotel.html')
    const draft = importItemToDraft(items[0], places, days)
    expect(draft?.placeId).toBe('p1')
    expect(draft?.startTripDayId).toBe('d1')
    expect(draft?.endTripDayId).toBe('d2')
    expect(draft?.hotelId).toBeNull()
    expect(draft?.status).toBe('pending')
    expect(draft?.metadata.location).toContain('Florence')
  })

  it('returns null for transport items', () => {
    const items = itemsFromJsonLd([FLIGHT_JSON], 'flight.json')
    expect(importItemToDraft(items[0], places, days)).toBeNull()
  })

  it('does not clamp unmatched dates to a nearby day', () => {
    const items = itemsFromJsonLd(extractJsonLdBlocks(LODGING_HTML), 'hotel.html')
    const otherDays: FamilyTripDay[] = [
      { id: 'x', tripId: 't', civilDay: '2026-08-01', dayIndex: 0, title: null },
    ]
    const draft = importItemToDraft(items[0], [], otherDays)
    expect(draft?.startTripDayId).toBeNull()
    expect(draft?.placeId).toBeNull()
  })
})

describe('importItemToTransportDraft', () => {
  const days: FamilyTripDay[] = [
    { id: 'd0', tripId: 't', civilDay: '2026-09-01', dayIndex: 0, title: null },
    { id: 'd1', tripId: 't', civilDay: '2026-09-04', dayIndex: 3, title: null },
  ]

  it('seeds two named endpoints and exact-matches civil days without airport_id', () => {
    const items = itemsFromJsonLd([FLIGHT_JSON], 'flight.json')
    const draft = importItemToTransportDraft(items[0], days)
    expect(draft?.type).toBe('flight')
    expect(draft?.title).toBe('AA 100')
    expect(draft?.confirmationCode).toBe('ABC123')
    expect(draft?.startTripDayId).toBe('d0')
    expect(draft?.endpoints).toHaveLength(2)
    expect(draft?.endpoints[0].name).toBe('AA 100')
    expect(draft?.endpoints[0].airportId ?? null).toBeNull()
  })

  it('does not clamp unmatched transport dates', () => {
    const items = itemsFromJsonLd([FLIGHT_JSON], 'flight.json')
    const otherDays: FamilyTripDay[] = [
      { id: 'x', tripId: 't', civilDay: '2026-08-01', dayIndex: 0, title: null },
    ]
    const draft = importItemToTransportDraft(items[0], otherDays)
    expect(draft?.startTripDayId).toBeNull()
    expect(draft?.endTripDayId).toBeNull()
    expect(draft?.endpoints[0].localDate).toBe('2026-09-01')
  })

  it('returns null for booking items', () => {
    const items = itemsFromJsonLd(extractJsonLdBlocks(LODGING_HTML), 'hotel.html')
    expect(importItemToTransportDraft(items[0], days)).toBeNull()
  })

  it('copies exact IATA onto endpoint code without guessing airport_id', () => {
    const items = itemsFromJsonLd([{
      '@type': 'FlightReservation',
      reservationNumber: 'XYZ',
      reservationFor: {
        '@type': 'Flight',
        name: 'LH 400',
        departureTime: '2026-09-01T10:00:00',
        arrivalTime: '2026-09-01T22:00:00',
        departureAirport: { iataCode: 'jfk' },
        arrivalAirport: { iataCode: 'FCO' },
      },
    }], 'lh.json')
    const draft = importItemToTransportDraft(items[0], days)
    expect(draft?.endpoints[0].code).toBe('JFK')
    expect(draft?.endpoints[1].code).toBe('FCO')
    expect(draft?.endpoints[0].airportId ?? null).toBeNull()
  })
})

import type { FamilyImportItem } from './types'

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function fieldValue(pass: Record<string, unknown>, key: 'primaryFields' | 'secondaryFields' | 'auxiliaryFields' | 'headerFields'): string | null {
  const style = passStyle(pass)
  const block = asRecord(style)
  const fields = block?.[key]
  if (!Array.isArray(fields) || fields.length === 0) return null
  const first = asRecord(fields[0])
  return str(first?.value) ?? str(first?.label)
}

function passStyle(pass: Record<string, unknown>): unknown {
  return pass.boardingPass ?? pass.eventTicket ?? pass.generic ?? pass.coupon ?? pass.storeCard
}

function relevantDate(pass: Record<string, unknown>): string | null {
  const raw = str(pass.relevantDate) ?? str(pass.expirationDate)
  if (!raw) return null
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}))?/)
  if (!m) return null
  return m[2] ? `${m[1]}T${m[2]}:00.000Z` : `${m[1]}T00:00:00.000Z`
}

const LODGING_RE = /hotel|inn|resort|lodge|check[-\s]?in|accommodation/i

export function parsePassJson(pass: Record<string, unknown>, fileName: string): FamilyImportItem | null {
  const desc = str(pass.description) ?? str(pass.logoText) ?? ''
  const org = str(pass.organizationName)
  const title = desc || org || fileName.replace(/\.pkpass$/i, '')
  const confirmation = fieldValue(pass, 'auxiliaryFields')
    ?? fieldValue(pass, 'secondaryFields')
    ?? str(pass.serialNumber)
  const when = relevantDate(pass)
  const loc = (() => {
    const locs = pass.locations
    if (!Array.isArray(locs) || !locs[0]) return null
    return str(asRecord(locs[0])?.relevantText)
  })()

  if (pass.boardingPass) {
    return {
      kind: 'transport',
      type: 'flight',
      title: title || 'Flight',
      confirmationCode: confirmation,
      startsAt: when,
      endsAt: null,
      location: loc,
      url: str(pass.webServiceURL),
      venueName: org,
      sourceFileName: fileName,
      needsReview: true,
    }
  }

  if (pass.eventTicket) {
    return {
      kind: 'booking',
      type: 'event',
      title: title || 'Event',
      confirmationCode: confirmation,
      startsAt: when,
      endsAt: null,
      location: loc,
      url: null,
      venueName: org,
      sourceFileName: fileName,
      needsReview: !when,
    }
  }

  const blob = `${desc} ${org} ${title}`
  if (pass.generic && LODGING_RE.test(blob)) {
    return {
      kind: 'booking',
      type: 'hotel',
      title: title || org || 'Hotel',
      confirmationCode: confirmation,
      startsAt: when,
      endsAt: null,
      location: loc,
      url: null,
      venueName: org ?? title,
      sourceFileName: fileName,
      needsReview: !when,
    }
  }

  return {
    kind: 'booking',
    type: 'other',
    title: title || 'Pass',
    confirmationCode: confirmation,
    startsAt: when,
    endsAt: null,
    location: loc,
    url: null,
    venueName: org,
    sourceFileName: fileName,
    needsReview: true,
  }
}

export async function extractPkpass(buffer: ArrayBuffer, fileName: string): Promise<FamilyImportItem | null> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const file = zip.file('pass.json')
  if (!file) return null
  const raw = await file.async('string')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  const rec = asRecord(parsed)
  if (!rec) return null
  return parsePassJson(rec, fileName)
}

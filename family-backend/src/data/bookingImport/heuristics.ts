import type { FamilyImportItem } from './types'

const CONFIRM_RE = /\b(?:confirmation(?:\s*(?:no\.?|num(?:ber)?|#|code))?|booking\s*(?:ref(?:erence)?|code)|(?:conf|pnr)[:\s#]+)[:\s#]*([A-Z0-9]{4,12})\b/i
const ISO_DATE_RE = /\b(20\d{2}-\d{2}-\d{2})\b/g
const CHECK_IN_RE = /check[-\s]?in[^0-9]{0,24}(20\d{2}-\d{2}-\d{2})/i
const CHECK_OUT_RE = /check[-\s]?out[^0-9]{0,24}(20\d{2}-\d{2}-\d{2})/i

function stemTitle(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  return base || fileName
}

function guessTitle(text: string, fileName: string): string {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (const line of lines.slice(0, 12)) {
    if (line.length < 3 || line.length > 80) continue
    if (/^(confirmation|itinerary|booking|reservation|dear|hello)\b/i.test(line)) continue
    if (/^https?:/i.test(line)) continue
    if (/^\d+$/.test(line)) continue
    return line
  }
  return stemTitle(fileName)
}

function guessType(text: string): FamilyImportItem['type'] {
  if (/hotel|check[-\s]?in|lodging|accommodation/i.test(text)) return 'hotel'
  if (/restaurant|dinner|table for/i.test(text)) return 'restaurant'
  if (/ticket|concert|museum|event\b/i.test(text)) return 'event'
  if (/tour|excursion/i.test(text)) return 'tour'
  return 'other'
}

export function extractFromPlainText(text: string, fileName: string): FamilyImportItem[] {
  const trimmed = text.replace(/\u0000/g, ' ').trim()
  if (trimmed.length < 8) return []

  const confirm = trimmed.match(CONFIRM_RE)?.[1] ?? null
  const checkIn = trimmed.match(CHECK_IN_RE)?.[1] ?? null
  const checkOut = trimmed.match(CHECK_OUT_RE)?.[1] ?? null
  const isoDates = [...trimmed.matchAll(ISO_DATE_RE)].map(m => m[1])
  const startCivil = checkIn ?? isoDates[0] ?? null
  const endCivil = checkOut ?? (isoDates.length > 1 ? isoDates[1] : null)
  const title = guessTitle(trimmed, fileName)
  const type = guessType(trimmed)
  const needsReview = !confirm || !startCivil

  return [{
    kind: 'booking',
    type,
    title,
    confirmationCode: confirm,
    startsAt: startCivil ? `${startCivil}T00:00:00.000Z` : null,
    endsAt: endCivil ? `${endCivil}T00:00:00.000Z` : null,
    location: null,
    url: null,
    venueName: type === 'hotel' || type === 'restaurant' ? title : null,
    sourceFileName: fileName,
    needsReview,
  }]
}

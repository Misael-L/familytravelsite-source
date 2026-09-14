import type { JourneyEntry } from '../../store/journeyStore'
import { GRADIENTS } from './JourneyDetailPage.constants'

function hashId(id: string | number): number {
  if (typeof id === 'number' && Number.isFinite(id)) return Math.abs(Math.trunc(id))
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function pickGradient(id: string | number): string {
  return GRADIENTS[hashId(id) % GRADIENTS.length]
}

export function isPersistedJourneyEntry(id: string | number): boolean {
  return id !== 0 && id !== '0' && id !== ''
}

export function journeyCoverSrc(cover?: string | null): string {
  if (!cover) return ''
  if (/^(https?:|blob:|data:)/i.test(cover)) return cover
  return `/uploads/${cover}`
}

export function groupByDate(entries: JourneyEntry[]): Map<string, JourneyEntry[]> {
  const groups = new Map<string, JourneyEntry[]>()
  for (const e of entries) {
    const d = e.entry_date
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d)!.push(e)
  }
  return groups
}

export function formatDate(d: string, locale?: string): { weekday: string; month: string; day: number } {
  const date = new Date(d + 'T00:00:00')
  // Pass the app's selected locale so weekday/month follow the UI language
  // instead of the browser's navigator.language.
  return {
    weekday: date.toLocaleDateString(locale, { weekday: 'long' }),
    month: date.toLocaleDateString(locale, { month: 'long' }),
    day: date.getDate(),
  }
}

export function photoUrl(p: {
  photo_id: string | number
  file_path?: string | null
  thumbnail_path?: string | null
}, size: 'thumbnail' | 'original' = 'thumbnail'): string {
  const signed = size === 'original'
    ? (p.file_path || p.thumbnail_path)
    : (p.thumbnail_path || p.file_path)
  if (signed && (typeof p.photo_id === 'string' || signed.startsWith('http') || signed.startsWith('blob:'))) {
    return signed
  }
  if (typeof p.photo_id === 'string') return signed || ''
  return `/api/photos/${p.photo_id}/${size}`
}

export function groupPhotosByDate(photos: any[]): { date: string; label: string; assets: any[] }[] {
  const map = new Map<string, any[]>()
  for (const asset of photos) {
    const key = asset.takenAt ? asset.takenAt.slice(0, 10) : '__unknown__'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(asset)
  }
  return [...map.entries()].map(([date, assets]) => ({
    date,
    label: date === '__unknown__'
      ? 'Unknown date'
      : new Date(date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    assets,
  }))
}

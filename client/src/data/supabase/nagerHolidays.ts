/** Public holidays from date.nager.at — no secret; Nest is only a CORS proxy today. */

const NAGER_BASE = 'https://date.nager.at/api/v3'

export type NagerCountry = {
  countryCode: string
  name: string
}

export type NagerPublicHoliday = {
  date: string
  name: string
  localName: string
  global: boolean
  counties: string[] | null
}

async function nagerJson<T>(path: string): Promise<T> {
  const res = await fetch(`${NAGER_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`Nager holidays ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function fetchNagerCountries(): Promise<NagerCountry[]> {
  const rows = await nagerJson<NagerCountry[]>('/AvailableCountries')
  return Array.isArray(rows) ? rows : []
}

export async function fetchNagerPublicHolidays(year: number, countryCode: string): Promise<NagerPublicHoliday[]> {
  const cc = countryCode.trim().toUpperCase()
  if (!cc) return []
  const rows = await nagerJson<NagerPublicHoliday[]>(`/PublicHolidays/${year}/${cc}`)
  return Array.isArray(rows) ? rows : []
}

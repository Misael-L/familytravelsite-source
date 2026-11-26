const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A real Gregorian calendar date in the four-digit civil date range. */
export function isCivilDate(value: string): boolean {
  if (!ISO_DATE.test(value) || value.startsWith('0000-')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

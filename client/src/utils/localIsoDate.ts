/**
 * The user's local calendar date as `YYYY-MM-DD`.
 *
 * Never derive "today" from `toISOString().split('T')[0]` — that is the UTC
 * date, which disagrees with the wall clock between local midnight and the UTC
 * rollover. Trip and journey dates are civil dates, so every today/past/upcoming
 * comparison must use this instead.
 */
export function localIsoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Shift a civil `YYYY-MM-DD` by a whole number of local calendar days. */
export function addLocalIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  return localIsoDate(new Date(year, month - 1, day + days))
}

/** Inclusive civil-date range as `YYYY-MM-DD` strings (never UTC `toISOString`). */
export function eachLocalIsoDay(start: string, end: string): string[] {
  if (!start || !end || start > end) return []
  const out: string[] = []
  for (let iso = start; iso <= end; iso = addLocalIsoDays(iso, 1)) {
    out.push(iso)
  }
  return out
}

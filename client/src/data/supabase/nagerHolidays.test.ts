import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchNagerCountries, fetchNagerPublicHolidays } from './nagerHolidays'

describe('nagerHolidays', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GETs AvailableCountries from date.nager.at', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ countryCode: 'IT', name: 'Italy' }],
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchNagerCountries()).resolves.toEqual([{ countryCode: 'IT', name: 'Italy' }])
    expect(fetchMock).toHaveBeenCalledWith('https://date.nager.at/api/v3/AvailableCountries')
  })

  it('GETs PublicHolidays/{year}/{cc}', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ date: '2026-01-01', name: 'New Year', localName: 'Capodanno', global: true, counties: null }],
    })
    vi.stubGlobal('fetch', fetchMock)
    const rows = await fetchNagerPublicHolidays(2026, 'it')
    expect(fetchMock).toHaveBeenCalledWith('https://date.nager.at/api/v3/PublicHolidays/2026/IT')
    expect(rows[0].localName).toBe('Capodanno')
  })

  it('throws when Nager is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ([]) }))
    await expect(fetchNagerCountries()).rejects.toThrow(/502/)
  })
})

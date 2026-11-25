import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let weather: typeof import('./upstream/weatherService');
const provider = vi.fn<typeof fetch>();
const future = '2026-11-20';
const recent = '2026-11-14';
const today = '2026-11-17';
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const daily = (date: string, patch: Record<string, unknown> = {}) => ({
  daily: {
    time: [date],
    temperature_2m_max: [24],
    temperature_2m_min: [12],
    weathercode: [0],
    precipitation_sum: [0],
    ...patch,
  },
});
const forecast = { temp: 18, temp_max: 24, temp_min: 12, main: 'Clear', description: 'Clear sky', type: 'forecast' };

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
  provider.mockReset().mockRejectedValue(new Error('Unexpected provider request'));
  vi.stubGlobal('fetch', provider);
  weather = await import('./upstream/weatherService');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('copied browser weather forecast contract', () => {
  it.each([future, recent])(
    'returns the selected daily reading for %s with unchanged query parameters',
    async (date) => {
      provider.mockResolvedValueOnce(response(daily(date)));
      expect(await weather.getWeather('19.04', '-98.19', date, 'en')).toEqual(forecast);
      expect(provider).toHaveBeenCalledTimes(1);
      const [url, options] = provider.mock.calls[0];
      const query = new URL(String(url));
      expect(query.origin + query.pathname).toBe('https://api.open-meteo.com/v1/forecast');
      expect(Object.fromEntries(query.searchParams)).toEqual({
        latitude: '19.04',
        longitude: '-98.19',
        daily: 'temperature_2m_max,temperature_2m_min,weathercode',
        timezone: 'auto',
        ...(date === recent ? { past_days: '5', forecast_days: '2' } : { forecast_days: '16' }),
      });
      expect(options?.signal).toBeDefined();
    }
  );
  it.each([future, recent])('keeps zero, negative temperatures and unknown codes for %s', async (date) => {
    provider.mockResolvedValueOnce(
      response(
        daily(date, {
          temperature_2m_max: [0],
          temperature_2m_min: [-8],
          weathercode: [999],
        })
      )
    );
    expect(await weather.getWeather('19', '-99', date, 'de')).toEqual({
      temp: -4,
      temp_max: 0,
      temp_min: -8,
      main: 'Clouds',
      description: '',
      type: 'forecast',
    });
  });
  it('selects the matching date index, rather than the first temperature', async () => {
    provider.mockResolvedValueOnce(
      response(
        daily(future, {
          time: ['2026-11-19', future],
          temperature_2m_max: [99, 24],
          temperature_2m_min: [88, 12],
          weathercode: [95, 0],
        })
      )
    );
    expect(await weather.getWeather('19', '-99', future, 'en')).toEqual(forecast);
  });
  it.each([undefined, null, { time: [] }, { time: ['2026-11-19'] }])(
    'keeps climate fallback when the forward daily block has no matching date: %j',
    async (block) => {
      provider.mockResolvedValueOnce(response({ daily: block })).mockResolvedValueOnce(response(daily('2025-11-20')));
      expect(await weather.getWeather('19', '-99', future, 'en')).toEqual({
        temp: 18,
        temp_max: 24,
        temp_min: 12,
        main: 'Clear',
        description: '',
        type: 'climate',
      });
      expect(provider).toHaveBeenCalledTimes(2);
      expect(String(provider.mock.calls[1][0])).toContain('https://archive-api.open-meteo.com/v1/archive?');
    }
  );
  it.each([
    { daily: undefined },
    { daily: null },
    { daily: { time: [] } },
    daily(recent, { temperature_2m_max: [null] }),
    daily(recent, { temperature_2m_min: [null] }),
  ])('keeps archive fallback when recent-past daily data is unavailable: %j', async (body) => {
    provider.mockResolvedValueOnce(response(body)).mockResolvedValueOnce(response(daily(recent)));
    expect(await weather.getWeather('19', '-99', recent, 'en')).toEqual(forecast);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(String(provider.mock.calls[1][0])).toContain('start_date=' + recent + '&end_date=' + recent);
  });
  it('uses the recent-past forecast after the forward window misses a local-today reading', async () => {
    provider.mockResolvedValueOnce(response({})).mockResolvedValueOnce(response(daily(today)));
    expect(await weather.getWeather('19', '-99', today, 'en')).toEqual(forecast);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(String(provider.mock.calls[1][0])).toContain('past_days=5&forecast_days=2');
  });
  it.each([future, recent])('keeps malformed matched temperature arrays as failures for %s', async (date) => {
    provider.mockResolvedValueOnce(response(daily(date, { temperature_2m_max: undefined })));
    await expect(weather.getWeather('19', '-99', date, 'en')).rejects.toBeInstanceOf(TypeError);
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('does not invent a missing forward minimum-temperature reading', async () => {
    provider.mockResolvedValueOnce(response(daily(future, { temperature_2m_min: [] })));
    const result = await weather.getWeather('19', '-99', future, 'en');
    expect(result.temp).toBeNaN();
    expect(result.temp_min).toBeNaN();
    expect(result.temp_max).toBe(24);
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it.each([future, recent])('preserves provider refusal status and message for %s', async (date) => {
    provider.mockResolvedValueOnce(response({ error: true, reason: 'rate limited' }, 429));
    await expect(weather.getWeather('19', '-99', date, 'en')).rejects.toMatchObject({
      status: 429,
      message: 'rate limited',
    });
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('keeps the response byte cap and generic parse refusal', async () => {
    const body = new Response('not parsed', { headers: { 'content-length': String(1024 * 1024 + 1) } });
    provider.mockResolvedValueOnce(body);
    await expect(weather.getWeather('19', '-99', future, 'en')).rejects.toMatchObject({
      status: 502,
      message: 'Open-Meteo API error',
    });
    expect(body.body?.locked).toBe(false);
  });
  it('keeps in-flight sharing, language-specific cache entries and expiry', async () => {
    provider.mockResolvedValueOnce(response(daily(future)));
    const [a, b] = await Promise.all([
      weather.getWeather('19', '-99', future, 'en'),
      weather.getWeather('19', '-99', future, 'en'),
    ]);
    expect(a).toEqual(forecast);
    expect(b).toBe(a);
    expect(await weather.getWeather('19', '-99', future, 'en')).toBe(a);
    expect(provider).toHaveBeenCalledTimes(1);
    provider.mockResolvedValueOnce(response(daily(future)));
    expect((await weather.getWeather('19', '-99', future, 'de')).description).toBe('Klar');
    expect(provider).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date('2026-11-17T13:00:00.001Z'));
    provider.mockResolvedValueOnce(response(daily(future)));
    expect(await weather.getWeather('19', '-99', future, 'en')).toEqual(forecast);
    expect(provider).toHaveBeenCalledTimes(3);
  });
  it('releases a failed in-flight request so a retry can succeed', async () => {
    provider.mockRejectedValueOnce(new Error('Network refused')).mockResolvedValueOnce(response(daily(future)));
    await expect(weather.getWeather('19', '-99', future, 'en')).rejects.toThrow('Network refused');
    expect(await weather.getWeather('19', '-99', future, 'en')).toEqual(forecast);
    expect(provider).toHaveBeenCalledTimes(2);
  });
});

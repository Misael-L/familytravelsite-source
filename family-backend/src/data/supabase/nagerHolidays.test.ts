import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNagerCountries, fetchNagerPublicHolidays } from './nagerHolidays';
import { installFamilyOperationContext } from './operationContext';

const country = { countryCode: 'IT', name: 'Italy' };
const holiday = {
  date: '2026-01-01',
  name: 'New Year',
  countryCode: 'IT',
  nationalHoliday: true,
  subdivisionCodes: null,
  holidayTypes: ['Public'],
};
const response = (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' }, ...init });
function mock(value: unknown) {
  const fetcher = vi.fn().mockResolvedValue(response(value));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('public holiday v4 adapter', () => {
  it('loads countries with no credentials or referrer and no redirects', async () => {
    const fetcher = mock([country]);
    await expect(fetchNagerCountries()).resolves.toEqual([country]);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      'https://nagerholidays.com/api/v4/Countries/Available',
      expect.objectContaining({
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      })
    );
  });
  it('normalizes the country argument and retains the legacy holiday shape', async () => {
    const fetcher = mock([holiday]);
    await expect(fetchNagerPublicHolidays(2026, ' it ')).resolves.toEqual([
      { date: holiday.date, name: 'New Year', localName: 'New Year', global: true, counties: null },
    ]);
    expect(fetcher.mock.calls[0][0]).toBe('https://nagerholidays.com/api/v4/Holidays/IT/2026');
  });
  it('keeps regional codes and the public English fallback', async () => {
    mock([{ ...holiday, nationalHoliday: false, subdivisionCodes: ['IT-BZ'], name: 'Regional day' }]);
    await expect(fetchNagerPublicHolidays(2026, 'IT')).resolves.toEqual([
      { date: holiday.date, name: 'Regional day', localName: 'Regional day', global: false, counties: ['IT-BZ'] },
    ]);
  });
  it('keeps a real midnight civil date without a timezone conversion', async () => {
    mock([{ ...holiday, date: '2024-02-29' }]);
    expect((await fetchNagerPublicHolidays(2024, 'IT'))[0].date).toBe('2024-02-29');
  });
  it('accepts an explicit empty country list', async () => {
    mock([]);
    await expect(fetchNagerCountries()).resolves.toEqual([]);
  });
  it('accepts an explicit empty holiday list', async () => {
    mock([]);
    await expect(fetchNagerPublicHolidays(2026, 'IT')).resolves.toEqual([]);
  });
  it.each([1899, 2201, 2026.5, NaN, Infinity])('rejects invalid year %s before any network request', async (year) => {
    const fetcher = mock([]);
    await expect(fetchNagerPublicHolidays(year, 'IT')).rejects.toThrow(RangeError);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['', '../IT', 'ITA', 'IT/2026', 'I1', 'ÎT'])('rejects unsafe country %s before networking', async (code) => {
    const fetcher = mock([]);
    await expect(fetchNagerPublicHolidays(2026, code)).rejects.toThrow(RangeError);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    [{ name: 'Italy' }],
    [{ ...country, countryCode: 'it' }],
    [{ ...country, name: '' }],
    [country, country],
  ])('rejects malformed or ambiguous country responses %j', async (rows) => {
    mock(rows);
    await expect(fetchNagerCountries()).rejects.toThrow(/invalid response/);
  });
  it('bounds country row counts', async () => {
    mock(Array.from({ length: 677 }, () => country));
    await expect(fetchNagerCountries()).rejects.toThrow(/invalid response/);
  });
  it.each([
    { date: '2025-12-31' },
    { date: '2026-02-30' },
    { date: '2026-01-01T00:00:00Z' },
    { countryCode: 'US' },
    { name: '' },
    { nationalHoliday: 'true' },
    { subdivisionCodes: ['US-CA'] },
    { subdivisionCodes: ['IT/XX'] },
    { nationalHoliday: false, subdivisionCodes: null },
    { nationalHoliday: false, subdivisionCodes: [] },
    { holidayTypes: ['Unknown'] },
    { holidayTypes: null },
    { holidayTypes: [] },
  ])('rejects invalid holiday facts %j without partial rows', async (patch) => {
    mock([holiday, { ...holiday, ...patch }]);
    await expect(fetchNagerPublicHolidays(2026, 'IT')).rejects.toThrow(/invalid response/);
  });
  it('rejects a v3 row instead of silently treating it as v4', async () => {
    mock([{ date: holiday.date, name: holiday.name, localName: 'Capodanno', global: true, counties: null }]);
    await expect(fetchNagerPublicHolidays(2026, 'IT')).rejects.toThrow(/invalid response/);
  });
  it('rejects a missing region field', async () => {
    const { subdivisionCodes: _unused, ...row } = holiday;
    mock([row]);
    await expect(fetchNagerPublicHolidays(2026, 'IT')).rejects.toThrow(/invalid response/);
  });
  it('bounds holiday row counts', async () => {
    mock(Array.from({ length: 2001 }, () => holiday));
    await expect(fetchNagerPublicHolidays(2026, 'IT')).rejects.toThrow(/invalid response/);
  });
  it.each([403, 404, 429, 503])(
    'reports HTTP %s instead of an empty successful calendar and does not retry',
    async (status) => {
      const fetcher = vi.fn().mockResolvedValue(response([], { status }));
      vi.stubGlobal('fetch', fetcher);
      await expect(fetchNagerCountries()).rejects.toThrow(String(status));
      expect(fetcher).toHaveBeenCalledOnce();
    }
  );
  it('keeps network failure distinct from a real empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')));
    await expect(fetchNagerCountries()).rejects.toThrow('network unavailable');
  });
  it('rejects a bodyless success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(fetchNagerCountries()).rejects.toThrow(/invalid response/);
  });
  it('rejects invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>unavailable</html>')));
    await expect(fetchNagerCountries()).rejects.toThrow(/invalid response/);
  });
  it('rejects invalid UTF-8', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([255, 254]))));
    await expect(fetchNagerCountries()).rejects.toThrow();
  });
  it('rejects excessive declared content before reading the body', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Length': '1048577' } })));
    await expect(fetchNagerCountries()).rejects.toThrow(/size limit/);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('bounds streamed bytes even when Content-Length is missing', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(1048577));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(fetchNagerCountries()).rejects.toThrow(/size limit/);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('accepts exactly the byte limit across chunk boundaries', async () => {
    const bytes = new TextEncoder().encode(' '.repeat(1048574) + '[]');
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 600000));
        c.enqueue(bytes.slice(600000));
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(fetchNagerCountries()).resolves.toEqual([]);
  });
  it('does not issue a fetch when the caller already cancelled', async () => {
    const fetcher = mock([]),
      caller = new AbortController();
    caller.abort();
    await expect(fetchNagerCountries(caller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('times out headers even when a transport ignores its signal', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetcher);
    const pending = fetchNagerCountries(),
      assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
  });
  it('cancels a stalled body on timeout, not just the header request', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const pending = fetchNagerCountries(),
      assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('cancels body reading and removes its caller listener', async () => {
    const cancel = vi.fn(),
      caller = new AbortController(),
      remove = vi.spyOn(caller.signal, 'removeEventListener');
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const pending = fetchNagerCountries(caller.signal),
      assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(body.locked).toBe(true));
    caller.abort();
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
  it('does not accept a late response from a retired captured operation', async () => {
    let current = true,
      resolve!: (r: Response) => void;
    const stop = installFamilyOperationContext(() => ({
      assertCurrent() {
        if (!current) throw new Error('original owner retired');
      },
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          })
      )
    );
    try {
      const pending = fetchNagerCountries(),
        assertion = expect(pending).rejects.toThrow('original owner retired');
      current = false;
      resolve(response([country]));
      await assertion;
    } finally {
      stop();
    }
  });
  it('discards a late response body after an ignored header abort', async () => {
    const caller = new AbortController(),
      cancel = vi.fn();
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          })
      )
    );
    const pending = fetchNagerCountries(caller.signal),
      assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    caller.abort();
    await assertion;
    resolve(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
  it('discards unread headers when the captured operation is retired', async () => {
    let current = true,
      resolve!: (response: Response) => void;
    const cancel = vi.fn(),
      stop = installFamilyOperationContext(() => ({
        assertCurrent() {
          if (!current) throw Error('retired');
        },
      }));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          })
      )
    );
    try {
      const pending = fetchNagerCountries(),
        assertion = expect(pending).rejects.toThrow('retired');
      current = false;
      resolve(new Response(new ReadableStream<Uint8Array>({ cancel })));
      await assertion;
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      stop();
    }
  });
});

import { captureFamilyOperation } from './operationContext';

/** Public Nager.Holidays v4 data; no Nest proxy, credentials or database writes. */
const NAGER_BASE = 'https://nagerholidays.com/api/v4';
const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 10_000;
const HOLIDAY_TYPES = new Set(['Public', 'Bank', 'School', 'Authorities', 'Optional', 'Observance']);

export type NagerCountry = { countryCode: string; name: string };
export type NagerPublicHoliday = {
  date: string;
  name: string;
  localName: string;
  global: boolean;
  counties: string[] | null;
};

function invalid(): never {
  throw new Error('Nager holidays returned an invalid response.');
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function name(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
}
function check(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}
/** Also releases the caller when a mocked/broken transport ignores AbortSignal. Never retries a request. */
function abortable<T>(task: Promise<T>, signal: AbortSignal, discard?: (value: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    task.then(
      (value) => {
        signal.removeEventListener('abort', aborted);
        if (signal.aborted) {
          discard?.(value);
          aborted();
        } else resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', aborted);
        reject(error);
      }
    );
  });
}

async function nagerJson(path: string, caller?: AbortSignal): Promise<unknown> {
  const operation = captureFamilyOperation();
  const controller = new AbortController();
  const abort = () => controller.abort(caller?.reason ?? new DOMException('Aborted', 'AbortError'));
  caller?.addEventListener('abort', abort, { once: true });
  if (caller?.aborted) abort();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Nager holidays timed out.', 'TimeoutError')),
    TIMEOUT_MS
  );
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let finished = false;
  const cancel = () => {
    if (reader) void reader.cancel().catch(() => {});
  };
  controller.signal.addEventListener('abort', cancel, { once: true });
  try {
    return await operation.perform(async () => {
      check(controller.signal);
      response = await abortable(
        fetch(NAGER_BASE + path, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          redirect: 'error',
        }),
        controller.signal,
        (late) => {
          void late.body?.cancel().catch(() => {});
        }
      );
      operation.assertCurrent();
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Error(`Nager holidays ${response.status}`);
      }
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) {
        void response.body?.cancel().catch(() => {});
        throw new Error('Nager holidays response exceeds the size limit.');
      }
      if (!response.body) invalid();
      reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let text = '',
        bytes = 0;
      while (true) {
        const chunk = await abortable(reader.read(), controller.signal);
        operation.assertCurrent();
        check(controller.signal);
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BYTES) throw new Error('Nager holidays response exceeds the size limit.');
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      finished = true;
      reader.releaseLock();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return invalid();
      }
    });
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', cancel);
    if (reader && !finished)
      void reader
        .cancel()
        .then(() => reader?.releaseLock())
        .catch(() => {});
    else if (!finished) void response?.body?.cancel().catch(() => {});
  }
}

export async function fetchNagerCountries(signal?: AbortSignal): Promise<NagerCountry[]> {
  const rows = await nagerJson('/Countries/Available', signal);
  if (!Array.isArray(rows) || rows.length > 676) invalid();
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!object(row) || typeof row.countryCode !== 'string' || !/^[A-Z]{2}$/.test(row.countryCode) || !name(row.name))
      invalid();
    if (seen.has(row.countryCode)) invalid();
    seen.add(row.countryCode);
    return { countryCode: row.countryCode, name: row.name };
  });
}

export async function fetchNagerPublicHolidays(
  year: number,
  countryCode: string,
  signal?: AbortSignal
): Promise<NagerPublicHoliday[]> {
  if (!Number.isInteger(year) || year < 1900 || year > 2200)
    throw new RangeError('Choose a calendar year from 1900 to 2200.');
  if (typeof countryCode !== 'string' || !/^[A-Z]{2}$/.test(countryCode.trim().toUpperCase()))
    throw new RangeError('Choose a two-letter holiday country code.');
  const cc = countryCode.trim().toUpperCase();
  const rows = await nagerJson(`/Holidays/${cc}/${year}`, signal);
  if (!Array.isArray(rows) || rows.length > 2000) invalid();
  return rows.map((row) => {
    if (
      !object(row) ||
      row.countryCode !== cc ||
      !name(row.name) ||
      typeof row.date !== 'string' ||
      !new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(row.date) ||
      !Number.isFinite(Date.parse(row.date + 'T00:00:00Z')) ||
      new Date(row.date + 'T00:00:00Z').toISOString().slice(0, 10) !== row.date ||
      typeof row.nationalHoliday !== 'boolean' ||
      !Array.isArray(row.holidayTypes) ||
      !row.holidayTypes.length ||
      row.holidayTypes.length > HOLIDAY_TYPES.size ||
      row.holidayTypes.some((type) => typeof type !== 'string' || !HOLIDAY_TYPES.has(type))
    )
      invalid();
    const counties = row.subdivisionCodes;
    if (
      counties !== null &&
      (!Array.isArray(counties) ||
        counties.length > 1000 ||
        counties.some((code) => typeof code !== 'string' || !new RegExp(`^${cc}-[A-Z0-9]{1,3}$`).test(code)))
    )
      invalid();
    if (!row.nationalHoliday && (!Array.isArray(counties) || !counties.length)) invalid();
    return {
      date: row.date,
      name: row.name,
      localName: row.name,
      global: row.nationalHoliday,
      counties: counties as string[] | null,
    };
  });
}

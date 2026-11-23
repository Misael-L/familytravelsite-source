import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

export type FamilyRequest = {
  method: string;
  pathname: string;
  query: URLSearchParams;
  body: unknown;
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
};
export type FamilyHandler = (request: FamilyRequest) => Promise<unknown>;

/** Original TREK request contracts, backed by canonical Family repositories. */
export function familyReadHandler(repo: FamilyFrontendRepository): FamilyHandler {
  return async (request) => {
    if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (request.method !== 'GET')
      throw new FamilyApiError(
        501,
        'adapter_not_connected',
        'This frontend action has not been connected to Family Travel.'
      );
    const { pathname: p, query } = request;
    if (p === '/trips') return repo.listTrips(query.get('archived') === '1');
    if (p === '/categories') return repo.categories();
    const match = p.match(/^\/trips\/([^/]+)(?:\/(.*))?$/);
    if (!match) throw new FamilyApiError(501, 'adapter_not_connected', `The Family backend does not implement ${p}.`);
    const [, tripId, suffix = ''] = match;
    if (!suffix) return repo.trip(tripId);
    if (suffix === 'days') return repo.dayList(tripId);
    if (suffix === 'places') return repo.placeList(tripId);
    if (suffix === 'reservations') return repo.reservationList(tripId);
    if (suffix === 'budget') return repo.expenseList(tripId);
    if (suffix === 'files') return repo.fileList(tripId, query.get('trash') === 'true');
    if (suffix === 'members') return repo.members(tripId);
    const place = suffix.match(/^places\/([^/]+)$/);
    if (place) {
      const v = await repo.views();
      const id = v.ids.uuid('place', place[1]);
      const all = await repo.placeList(tripId);
      const row = all.places.find((p) => v.ids.uuid('place', p.id) === id);
      if (!row) throw new FamilyApiError(404, 'place_unavailable', 'This trip place is unavailable.');
      return { place: row };
    }
    const assignments = suffix.match(/^days\/([^/]+)\/assignments$/);
    if (assignments) {
      const v = await repo.views();
      const dayId = v.ids.uuid('day', assignments[1]);
      const all = await repo.dayList(tripId);
      const day = all.days.find((d) => v.ids.uuid('day', d.id) === dayId);
      if (!day) throw new FamilyApiError(404, 'day_unavailable', 'This trip day is unavailable.');
      return { assignments: day.assignments };
    }
    throw new FamilyApiError(501, 'adapter_not_connected', `The Family backend does not implement ${p}.`);
  };
}

function familyAxiosBody(config: InternalAxiosRequestConfig): unknown {
  if (typeof config.data !== 'string' || !config.data) return config.data;
  try {
    return JSON.parse(config.data);
  } catch {
    throw new AxiosError('Invalid Family request body', 'ERR_BAD_REQUEST', config);
  }
}

function retryHeaders(get: (key: string) => unknown): Record<string, string> {
  return Object.fromEntries(
    ['x-idempotency-key', 'x-base-updated-at'].flatMap((key) => {
      const value = get(key);
      return typeof value === 'string' && value ? [[key, value]] : [];
    })
  );
}

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}
/** A custom adapter must perform status rejection itself; Axios does not settle it. */
export function createFamilyAxiosAdapter(handle: FamilyHandler): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    if (config.signal?.aborted) throw new AxiosError('canceled', 'ERR_CANCELED', config);
    const url = new URL(config.url ?? '', 'https://family-adapter.invalid');
    const query = new URLSearchParams(url.search);
    for (const [key, value] of Object.entries(config.params ?? {})) if (value != null) query.set(key, String(value));
    const body = familyAxiosBody(config);
    try {
      const data = await handle({
        method: (config.method ?? 'GET').toUpperCase(),
        pathname: url.pathname.replace(/^\/api(?=\/)/, ''),
        query,
        headers: retryHeaders((key) => config.headers.get(key)),
        body,
        signal: config.signal as AbortSignal,
      });
      if (config.signal?.aborted) throw abortError();
      return {
        data,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders({ 'content-type': 'application/json' }),
        config,
      };
    } catch (error) {
      if (config.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError'))
        throw new AxiosError('canceled', 'ERR_CANCELED', config);
      const e =
        error instanceof FamilyApiError
          ? error
          : new FamilyApiError(
              503,
              'family_backend_error',
              error instanceof Error ? error.message : 'Family backend unavailable.'
            );
      throw new AxiosError(e.message, e.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST', config, undefined, {
        data: { error: e.message, code: e.code },
        status: e.status,
        statusText: e.code,
        headers: new AxiosHeaders({ 'content-type': 'application/json' }),
        config,
      });
    }
  };
}

/** Capture only this frontend's /api namespace. Auth, Storage and map hosts are untouched. */
export function createFamilyFetch(handle: FamilyHandler, network: typeof fetch, origin: string): typeof fetch {
  return async (input, init) => {
    const request = new Request(
      new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, origin),
      input instanceof Request ? input : init
    );
    const url = new URL(request.url);
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return network(input, init);
    if (request.signal.aborted) throw abortError();
    try {
      const multipart = request.headers.get('content-type')?.includes('multipart/form-data');
      const text = multipart ? '' : await request.text();
      const body = multipart ? await request.formData() : text ? JSON.parse(text) : undefined;
      const data = await handle({
        method: request.method.toUpperCase(),
        pathname: url.pathname.slice(4),
        query: url.searchParams,
        headers: retryHeaders((key) => request.headers.get(key)),
        body,
        signal: request.signal,
      });
      if (request.signal.aborted) throw abortError();
      return data instanceof Response ? data : Response.json(data);
    } catch (error) {
      if (request.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw abortError();
      const e =
        error instanceof FamilyApiError
          ? error
          : new FamilyApiError(
              503,
              'family_backend_error',
              error instanceof Error ? error.message : 'Family backend unavailable.'
            );
      return Response.json({ error: e.message, code: e.code }, { status: e.status });
    }
  };
}

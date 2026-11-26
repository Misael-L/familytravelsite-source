import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { FamilyApiError } from './repository';
import { createFamilyAxiosAdapter, createFamilyFetch } from './transport';
describe('Family frontend transport boundary', () => {
  it('retains the copied frontend API shape, params and transformed request body', async () => {
    const handle = vi.fn(async (_request: import('./transport').FamilyRequest) => ({
      assignment: { id: 10 },
    }));
    const api = axios.create({ baseURL: '/api', adapter: createFamilyAxiosAdapter(handle) });
    const result = await api.post('/trips/20/days/30/assignments', { place_id: 40 }, { params: { show: 'all' } });
    expect(result.data.assignment.id).toBe(10);
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        pathname: '/trips/20/days/30/assignments',
        body: { place_id: 40 },
      })
    );
    expect(handle.mock.calls[0][0].query.get('show')).toBe('all');
  });
  it('rejects authorization and backend errors instead of resolving a failed Axios response', async () => {
    const handle = vi.fn(async () => {
      throw new FamilyApiError(403, 'action_denied', 'Denied');
    });
    const api = axios.create({ adapter: createFamilyAxiosAdapter(handle) });
    await expect(api.delete('/trips/20/places/40')).rejects.toMatchObject({
      response: { status: 403, data: { code: 'action_denied' } },
    });
  });
  it('leaves map tiles, Supabase auth/storage, and non-API requests on their original network path', async () => {
    const network = vi.fn(async () => new Response('network'));
    const handle = vi.fn(async () => ({ ok: true }));
    const fetcher = createFamilyFetch(handle, network, 'https://family.fixture.invalid');
    const urls = [
      'https://map.fixture.invalid/tiles/1/2/3',
      'https://backend.fixture.invalid/auth/v1/token',
      'https://backend.fixture.invalid/storage/v1/object',
      '/assets/trek.svg',
    ];
    for (const url of urls) expect(await (await fetcher(url)).text()).toBe('network');
    expect(network).toHaveBeenCalledTimes(4);
    expect(handle).not.toHaveBeenCalled();
    expect(await (await fetcher('/api/trips')).json()).toEqual({ ok: true });
    expect(handle).toHaveBeenCalledTimes(1);
  });
  it('does not turn an unsupported or failed API into an empty successful list', async () => {
    const handle = vi.fn(async () => {
      throw new FamilyApiError(501, 'adapter_not_connected', 'Not connected');
    });
    const response = await createFamilyFetch(handle, vi.fn(), 'https://family.fixture.invalid')('/api/trips/20/tags');
    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ code: 'adapter_not_connected' });
  });
  it('rejects a stale completion after request cancellation', async () => {
    const controller = new AbortController();
    const handle = vi.fn(async () => {
      controller.abort();
      return { trip: { title: 'Old trip' } };
    });
    const api = axios.create({ adapter: createFamilyAxiosAdapter(handle) });
    await expect(api.get('/trips/20', { signal: controller.signal })).rejects.toMatchObject({
      code: 'ERR_CANCELED',
    });
  });
});

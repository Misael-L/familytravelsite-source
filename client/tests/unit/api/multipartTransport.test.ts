import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient as nativeClient, postMultipart as nativeUpload } from '../../../src/api/client';
import {
  apiClient as legacyClient,
  postMultipart as legacyUpload,
} from '../../../src/integrations/family/legacy/api/transport';

const path = '/transport-fixture/files';
const transports = [
  ['native', nativeClient, nativeUpload],
  ['legacy', legacyClient, legacyUpload],
] as const;

function reply(xhr: XMLHttpRequest, status: number, body: unknown) {
  Object.defineProperties(xhr, {
    status: { value: status },
    statusText: { value: 'Fixture response' },
    responseText: { value: JSON.stringify(body) },
  });
  xhr.dispatchEvent(new ProgressEvent('loadend'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(transports)('%s multipart transport', (_name, client, upload) => {
  it('passes the original form to the browser with credentials and no upload deadline', async () => {
    const send = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => {});
    const header = vi.spyOn(XMLHttpRequest.prototype, 'setRequestHeader');
    const form = new FormData();
    form.append('file', new File(['fixture'], 'sample.txt', { type: 'text/plain' }));
    const pending = upload<{ id: number }>(path, form, {
      idempotencyKey: 'fixture-operation',
    });

    await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith(form));
    const xhr = send.mock.contexts[0] as XMLHttpRequest;
    expect(client.defaults.timeout).toBeGreaterThan(0);
    expect(xhr.timeout).toBe(0);
    expect(xhr.withCredentials).toBe(true);
    expect(header).toHaveBeenCalledWith('X-Idempotency-Key', 'fixture-operation');
    expect(header.mock.calls.some(([name]) => name.toLowerCase() === 'content-type')).toBe(false);
    reply(xhr, 200, { id: 7 });

    await expect(pending).resolves.toEqual({ id: 7 });
  });

  it('forwards the original progress callback and returns the response data object', async () => {
    const progress = vi.fn();
    const data = { id: 7 };
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
      config,
      data,
      status: 200,
      statusText: 'Fixture response',
      headers: new AxiosHeaders(),
    }));
    const original = client.defaults.adapter;
    client.defaults.adapter = adapter;
    try {
      await expect(upload<typeof data>(path, new FormData(), { onUploadProgress: progress })).resolves.toBe(data);
    } finally {
      client.defaults.adapter = original;
    }
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0]?.[0].onUploadProgress).toBe(progress);
  });

  it('returns the Axios cancellation when the caller aborts an in-flight upload', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const send = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => {});
    const abort = vi.spyOn(XMLHttpRequest.prototype, 'abort');
    const controller = new AbortController();
    const pending = upload(path, new FormData(), { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' });

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    controller.abort();

    await rejected;
    expect(abort).toHaveBeenCalledTimes(1);
    expect(abort.mock.contexts[0]).toBe(send.mock.contexts[0]);
  });

  it('preserves the HTTP error and the server error body', async () => {
    const send = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => {});
    const payload = { error: 'Fixture refusal' };
    const pending = upload(path, new FormData());
    const rejected = expect(pending).rejects.toMatchObject({ response: { status: 422, data: payload } });

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    reply(send.mock.contexts[0] as XMLHttpRequest, 422, payload);

    await rejected;
  });
});

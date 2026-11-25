import { createClient } from '@supabase/supabase-js';
import { http, passthrough } from 'msw';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { invalidateOfflineSession } from '../../db/offlineDb';
import { setAuthed } from '../../sync/authGate';
import { setForcedOffline } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import { createFamilyFilePreviewPort, readObservedFileWithBody } from './filePreview';
import { readPreparationFileBody } from './privateFileAcquisition';
import { FamilyFrontendRepository, familyReaders } from './repository';
import { createFamilyFetch } from './transport';

const sdk = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk.get() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk.get() }));
type Fixture = {
  api: string;
  anon_key: string;
  access_token: string;
  outsider_token: string;
  user_id: string;
  person_id: string;
  family_id: string;
  trip_id: string;
  file_id: string;
  storage_path: string;
  sha256: string;
  bytes: number;
};
const path = process.env.FAMILY_FILE_PREVIEW_FIXTURE;
const input: Fixture | null = path ? JSON.parse(readFileSync(path, 'utf8')) : null;
if (input && input.api !== 'http://127.0.0.1:55331') throw new Error('Refusing a non-disposable private-file fixture.');
function fixture() {
  if (!input) throw new Error('Explicit marked disposable private-file fixture required.');
  return input;
}
function client(token: string) {
  const f = fixture();
  return createClient(f.api, f.anon_key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
async function repository() {
  const f = fixture();
  const repo = new FamilyFrontendRepository(async () => ({
    userId: f.user_id,
    personId: f.person_id,
    familyId: f.family_id,
    user: {
      username: 'Synthetic private file',
      email: 'fixture@example.invalid',
      avatar_url: null,
      created_at: '2026-01-01',
    },
  }));
  const row = (await repo.fileList(f.trip_id)).files[0];
  if (!row?.url) throw new Error('Actual private file view missing.');
  return { repo, url: row.url };
}
const suite = describe.runIf(Boolean(path));
suite('Family previews with actual disposable Auth MFA, Data API and Storage bytes', () => {
  beforeEach(() => {
    fixture();
    server.use(http.all('http://127.0.0.1:55331/*', () => passthrough()));
    localStorage.clear();
    invalidateOfflineSession();
    setAuthed(true);
    setForcedOffline(false);
    sdk.get.mockReturnValue(client(fixture().access_token));
  });
  afterEach(() => {
    setAuthed(false);
    invalidateOfflineSession();
    vi.restoreAllMocks();
  });
  it('authorizes real metadata and delivers exactly the uploaded private bytes through a preview lease', async () => {
    const f = fixture(),
      { repo, url } = await repository();
    let bytes: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      bytes = blob as Blob;
      return 'blob:synthetic-live';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const network = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input).startsWith(f.api + '/storage/v1/object/sign/trip-files/')).toBe(true);
      expect(new URL(String(input)).searchParams.getAll('token')).toHaveLength(1);
      return fetch(input, init);
    });
    const port = createFamilyFilePreviewPort(repo, network, window.location.origin);
    try {
      const lease = await port.acquire(url);
      expect(lease.url).toBe('blob:synthetic-live');
      expect(bytes?.size).toBe(f.bytes);
      if (!bytes) throw new Error('Missing authorized bytes.');
      expect(
        createHash('sha256')
          .update(Buffer.from(await bytes.arrayBuffer()))
          .digest('hex')
      ).toBe(f.sha256);
      const observation = await repo.observeFile(f.file_id);
      const strict = await readObservedFileWithBody({
        repo,
        observation,
        network,
        readBody: (response) =>
          readPreparationFileBody({
            response,
            expected: { size_bytes: observation.row.sizeBytes, mime_type: observation.row.mimeType ?? '' },
            check: observation.assertCurrent,
          }),
      });
      expect(
        createHash('sha256')
          .update(Buffer.from(await strict.arrayBuffer()))
          .digest('hex')
      ).toBe(f.sha256);
      expect(strict.size).toBe(f.bytes);
      invalidateOfflineSession();
      expect(lease.current()).toBe(false);
      expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(lease.url);
    } finally {
      port.dispose();
    }
  });
  it('the actual Family fetch handler returns the same real private file bytes', async () => {
    const f = fixture(),
      { repo, url } = await repository();
    const request = createFamilyFetch(createFamilyApplicationHandler(repo), fetch, window.location.origin);
    const response = await request(url);
    expect(response.status).toBe(200);
    expect(
      createHash('sha256')
        .update(Buffer.from(await response.arrayBuffer()))
        .digest('hex')
    ).toBe(f.sha256);
  });
  it('real Storage and metadata policies refuse a signed-in outsider without granting a preview', async () => {
    const f = fixture(),
      outsider = client(f.outsider_token);
    sdk.get.mockReturnValue(outsider);
    const rows = await familyReaders.files.listTripFiles(f.trip_id);
    expect(rows).toEqual([]);
    const signed = await outsider.storage.from('trip-files').createSignedUrl(f.storage_path, 120);
    expect(signed.error).not.toBeNull();
    expect(signed.data).toBeNull();
  });
});

import { beforeEach, expect, it, vi } from 'vitest';
import { FamilyIdentityRegistry } from './identity';
import { handlePreviewJournalPhoto } from './previewJournalPhoto';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => ({ rpc }) }));
vi.mock('../../sync/networkMode', () => ({ isEffectivelyOffline: () => false }));

const trip = '00000000-0000-4000-8000-000000000001';
const journey = '00000000-0000-4000-8000-000000000002';
const entry = '00000000-0000-4000-8000-000000000003';
const photo = '00000000-0000-4000-8000-000000000004';
const ids = new FamilyIdentityRegistry(trip);
const entryId = ids.register('journeyEntry', entry);
const photoId = ids.register('journeyPhoto', photo);

function request(method: string, body?: unknown, query = '') {
  const input: FamilyRequest = {
    method, body, query: new URLSearchParams(query), pathname: '/journeys/1/preview-photo',
  };
  return handlePreviewJournalPhoto(input, {} as FamilyFrontendRepository, ids, trip, journey);
}

beforeEach(() => rpc.mockReset());

it('maps an entry’s recoverable association to its Gallery identity', async () => {
  rpc.mockResolvedValueOnce({ data: { revision: 2, photos: [{ id: photo, attached: false }] } });
  await expect(request('GET', undefined, 'entryId=' + entryId)).resolves.toEqual({
    revision: 2, photos: [{ id: photoId, attached: false }],
  });
  expect(rpc).toHaveBeenCalledWith('manage_family_trip_journal_photo_v1', {
    p_trip_id: trip, p_journey_id: journey, p_entry_id: entry, p_action: 'list',
    p_photo_id: null, p_expected_revision: null,
  });
});

it('keeps the observed entry revision and checks the requested attachment state', async () => {
  const command = { action: 'restore-photo', entryId, photoId, revision: 2 };
  rpc.mockResolvedValueOnce({ error: { code: 'PT409' } });
  await expect(request('PATCH', command)).rejects.toMatchObject({ status: 409 });
  expect(rpc).toHaveBeenCalledWith('manage_family_trip_journal_photo_v1', {
    p_trip_id: trip, p_journey_id: journey, p_entry_id: entry, p_action: 'restore-photo',
    p_photo_id: photo, p_expected_revision: 2,
  });
  rpc.mockResolvedValueOnce({ data: { revision: 3, photos: [{ id: photo, attached: false }] } });
  await expect(request('PATCH', command)).rejects.toMatchObject({ status: 503 });
  expect(rpc).toHaveBeenCalledTimes(2);
  rpc.mockResolvedValueOnce({ data: { revision: 3, photos: [{ id: photo, attached: true }] } });
  rpc.mockResolvedValueOnce({
    data: [{ id: entry, revision: 3, title: 'Story', story: 'Late edit', entry_date: '2027-04-01', trashed: false }],
  });
  await expect(request('PATCH', command)).resolves.toMatchObject([{ id: entryId, revision: 3, story: 'Late edit' }]);
});

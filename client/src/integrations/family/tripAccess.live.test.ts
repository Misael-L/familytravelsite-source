import { createClient } from '@supabase/supabase-js';
import { http, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import api from '../../api/client';
import { invalidateOfflineSession } from '../../db/offlineDb';
import { tripCoverRepo } from '../../repo/tripCoverRepo';
import { tripLinksRepo } from '../../repo/tripLinksRepo';
import { tripMembersRepo } from '../../repo/tripMembersRepo';
import { setAuthed } from '../../sync/authGate';
import { setForcedOffline } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';
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
  travelers: string[];
};
const path = process.env.FAMILY_TRIP_ACCESS_FIXTURE;
const input: Fixture | null = path ? JSON.parse(readFileSync(path, 'utf8')) : null;
if (input && input.api !== 'http://127.0.0.1:55331') throw new Error('Refusing non-disposable Trip access fixture.');
function fixture() {
  if (!input) throw new Error('Explicit marked disposable Trip access fixture required.');
  return input;
}
function client(token: string) {
  const f = fixture();
  return createClient(f.api, f.anon_key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
const original = api.defaults.adapter;
let repo: FamilyFrontendRepository, key: number;
const suite = describe.runIf(Boolean(path));
suite('Trip access through actual disposable Auth MFA, RLS and Family handlers', () => {
  beforeEach(async () => {
    const f = fixture();
    server.use(http.all('http://127.0.0.1:55331/*', () => passthrough()));
    localStorage.clear();
    invalidateOfflineSession();
    setAuthed(true);
    setForcedOffline(false);
    sdk.get.mockReturnValue(client(f.access_token));
    repo = new FamilyFrontendRepository(async () => ({
      userId: f.user_id,
      personId: f.person_id,
      familyId: f.family_id,
      user: { username: 'Synthetic', email: 'local@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
    }));
    key = (await repo.views()).ids.register('trip', f.trip_id);
    api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(repo));
  });
  afterEach(() => {
    api.defaults.adapter = original;
    setAuthed(false);
    invalidateOfflineSession();
    vi.restoreAllMocks();
  });
  it('returns real travelers and Family color without fabricating native ownership', async () => {
    const f = fixture(),
      rows = await tripMembersRepo.list(key),
      views = await repo.views();
    expect(rows.map((row) => views.ids.uuid('person', row.id)).sort()).toEqual([...f.travelers].sort());
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: 'Owner traveler', color: '#112233' }),
        expect.objectContaining({ username: 'Other traveler', color: '#445566' }),
      ])
    );
    expect((await tripMembersRepo.roster(key)).owner).toBeUndefined();
  });
  it('actual metadata policies refuse a signed-in outsider instead of serving owner data', async () => {
    sdk.get.mockReturnValue(client(fixture().outsider_token));
    expect(await tripMembersRepo.list(key)).toEqual([]);
    await expect(tripLinksRepo.share.get(key)).rejects.toMatchObject({ response: { status: 403 } });
  });
  it('authorized but unsupported native link, member and cover writes remain refused', async () => {
    const before = await tripMembersRepo.list(key);
    for (const run of [
      () => tripLinksRepo.share.create(key, { share_map: true }),
      () => tripLinksRepo.invite.create(key),
      () => tripCoverRepo.update(key, 'https://fixture.invalid/cover'),
      () => tripMembersRepo.add(key, 'Other traveler'),
    ]) {
      await expect(run()).rejects.toMatchObject({ response: { status: 501 } });
    }
    expect(await tripMembersRepo.list(key)).toEqual(before);
  });
});

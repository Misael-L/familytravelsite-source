import { copyFamilyListPlacesToTrip } from '@family/backend/supabase/copyFamilyListPlacesToTrip';
import { loadFamilyAccountSettings, updateFamilyDisplayName } from '@family/backend/supabase/familySettings';
import { familyAvatarObjectExists, signAvatarUrls, uploadPersonAvatar } from '@family/backend/supabase/personAvatars';
import { emptyTripFileTrash, uploadTripFile } from '@family/backend/supabase/tripFiles';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { createFamilyApplicationHandler } from './applicationHandler';
import { installFamilyFrontend } from './bootstrap';
import { uploadFamilyListCover } from './legacy/data/supabase/familyLists';
import { uploadJourneyImage } from './legacy/data/supabase/journeys';
import { familyAuthStore, FamilyFrontendRepository } from './repository';
import { scopeFamilyOperations } from './requestContext';
import { createFamilyAxiosAdapter } from './transport';

const io = vi.hoisted(() => ({
  query: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
  updateUser: vi.fn(),
  getUser: vi.fn(),
  sign: vi.fn(),
  signs: vi.fn(),
  normalize: vi.fn(),
}));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('../../../../../family-backend/src/utils/convertHeic', () => ({ normalizeImageFile: io.normalize }));
vi.mock('./legacy/data/supabase/auth', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/auth')>()),
  onSupabaseAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
}));
vi.mock('./legacy/data/supabase/familyRealtime', () => ({
  familyRealtime: { startSession: vi.fn(), bindItinerary: vi.fn(), stopAll: vi.fn() },
}));
vi.mock('../../api/websocket', async (original) => ({
  ...(await original<typeof import('../../api/websocket')>()),
  installRealtimeDriver: vi.fn(),
}));
const originalAuth = familyAuthStore.getState();
let dispose: (() => void) | void;
vi.mock('./legacy/utils/convertHeic', () => ({ normalizeImageFile: io.normalize }));
type Reply = { data: unknown; error: unknown };
const ok = (data: unknown = null): Reply => ({ data, error: null });
const sdk = {
  from(table: string) {
    let values: unknown;
    const filters: unknown[] = [];
    const q = {
      select: () => q,
      limit: () => q,
      insert: (v: unknown) => {
        values = v;
        return q;
      },
      update: (v: unknown) => {
        values = v;
        return q;
      },
      eq: (...v: unknown[]) => {
        filters.push(v);
        return q;
      },
      is: () => q,
      not: () => q,
      order: () => q,
      maybeSingle: () => q,
      then(resolve: (v: Reply) => unknown, reject: (e: unknown) => unknown) {
        return Promise.resolve(io.query(table, values, filters)).then(resolve, reject);
      },
    };
    return q;
  },
  storage: {
    from: () => ({ upload: io.upload, remove: io.remove, createSignedUrl: io.sign, createSignedUrls: io.signs }),
  },
  functions: { invoke: io.invoke },
  rpc: io.rpc,
  auth: { updateUser: io.updateUser, getUser: io.getUser },
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const uid = '10000000-0000-4000-8000-000000000001';
const person = '10000000-0000-4000-8000-000000000002';
const family = '10000000-0000-4000-8000-000000000003';
const nameInput = { userId: uid, personId: person, displayName: 'New name' };
const uploadInput = () => ({
  familyId: family,
  tripId: uid,
  uploadedBy: person,
  file: new File(['pdf'], 'ticket.pdf', { type: 'application/pdf' }),
});
let repo: FamilyFrontendRepository;
function scoped() {
  return scopeFamilyOperations(repo, {
    uploadTripFile,
    emptyTripFileTrash,
    updateFamilyDisplayName,
    loadFamilyAccountSettings,
    uploadPersonAvatar,
    signAvatarUrls,
    familyAvatarObjectExists,
    copyFamilyListPlacesToTrip,
  });
}
function avatarInput() {
  const file = new File(['photo'], 'avatar.jpg', { type: 'image/jpeg' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1, 2, 3]).buffer });
  return { familyId: family, personId: person, file };
}
beforeEach(() => {
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fixture.invalid');
  familyAuthStore.setState({
    isAuthenticated: true,
    authGate: 'ok',
    authUserId: uid,
    personId: person,
    familyId: family,
    user: buildUser(),
    loadUser: async () => {},
  });
  repo = new FamilyFrontendRepository(async () => ({
    userId: uid,
    personId: person,
    familyId: family,
    user: buildUser(),
  }));
  for (const mock of Object.values(io)) mock.mockReset();
  io.query.mockResolvedValue(ok());
  io.upload.mockResolvedValue(ok());
  io.remove.mockResolvedValue(ok());
  io.invoke.mockResolvedValue(ok({ result: { id: 'file-id', media_id: 'media-id' } }));
  io.rpc.mockResolvedValue(ok());
  io.updateUser.mockResolvedValue(ok());
  io.getUser.mockResolvedValue(ok({ user: { email: 'test@example.invalid' } }));
  io.normalize.mockImplementation(async (file: File) => file);
  io.sign.mockResolvedValue(ok({ signedUrl: 'https://fixture.invalid/avatar' }));
  io.signs.mockResolvedValue(ok([]));
});
afterEach(() => {
  if (dispose) dispose();
  dispose = undefined;
  familyAuthStore.setState(originalAuth, true);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('real carried backend orchestration with fake SDK/table/Storage boundaries', () => {
  it('stops upload after normalization outlives its repository context', async () => {
    const wait = deferred<File>(),
      input = uploadInput();
    io.normalize.mockReturnValueOnce(wait.promise);
    const pending = scoped().uploadTripFile(input),
      rejected = expect(pending).rejects.toBeTruthy();
    repo.clear();
    wait.resolve(input.file);
    await rejected;
    expect(io.upload).not.toHaveBeenCalled();
    expect(io.invoke).not.toHaveBeenCalled();
  });
  it('does not finalize an upload after its context changes', async () => {
    const wait = deferred<Reply>();
    io.upload.mockReturnValueOnce(wait.promise);
    const pending = scoped().uploadTripFile(uploadInput()),
      rejected = expect(pending).rejects.toBeTruthy();
    await vi.waitFor(() => expect(io.upload).toHaveBeenCalledOnce());
    repo.clear();
    wait.resolve(ok());
    await rejected;
    expect(io.invoke).not.toHaveBeenCalled();
    expect(io.remove).not.toHaveBeenCalled();
  });
  it.each(['lost acknowledgment', 'denied'])('retains uploaded source on %s finalizer failure', async (message) => {
    io.invoke.mockRejectedValueOnce(new Error(message));
    await expect(scoped().uploadTripFile(uploadInput())).rejects.toThrow(message);
    expect(io.remove).not.toHaveBeenCalled();
  });
  it('does not perform cleanup on a stale rejected finalization', async () => {
    const wait = deferred<Reply>();
    io.invoke.mockReturnValueOnce(wait.promise);
    const pending = scoped().uploadTripFile(uploadInput()),
      rejected = expect(pending).rejects.toBeTruthy();
    await vi.waitFor(() => expect(io.invoke).toHaveBeenCalledOnce());
    repo.clear();
    wait.reject(new Error('network'));
    await rejected;
    expect(io.remove).not.toHaveBeenCalled();
  });
  it('preserves healthy upload path, options and finalizer payload', async () => {
    const input = uploadInput();
    expect(await scoped().uploadTripFile(input)).toBe('file-id');
    const path = io.upload.mock.calls[0][0] as string;
    expect(path).toMatch(new RegExp(`^${family}/${uid}/.+_ticket.pdf$`));
    expect(io.upload).toHaveBeenCalledWith(path, input.file, { contentType: 'application/pdf', upsert: false });
    expect(io.invoke).toHaveBeenCalledWith('finalize-private-upload', {
      body: expect.objectContaining({ kind: 'trip_file', path, trip_id: uid, original_name: 'ticket.pdf' }),
    });
    expect(io.remove).not.toHaveBeenCalled();
  });
  it('stops profile follow-up writes in the actual HTTP handler', async () => {
    const wait = deferred<Reply>();
    io.query.mockReturnValueOnce(wait.promise);
    const http = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
    const pending = http.put('/auth/me', { username: 'New name' }),
      rejected = expect(pending).rejects.toBeTruthy();
    await vi.waitFor(() =>
      expect(io.query).toHaveBeenCalledWith('profiles', { display_name: 'New name' }, [['id', uid]])
    );
    familyAuthStore.setState({ personId: 'replacement' });
    wait.resolve(ok());
    await rejected;
    expect(io.query.mock.calls.map((c) => c[0])).toEqual(['profiles']);
    expect(io.updateUser).not.toHaveBeenCalled();
  });
  it('preserves healthy profile update arguments and order', async () => {
    await scoped().updateFamilyDisplayName(nameInput);
    expect(io.query.mock.calls).toEqual([
      ['profiles', { display_name: 'New name' }, [['id', uid]]],
      ['people', { display_name: 'New name' }, [['id', person]]],
    ]);
    expect(io.updateUser).toHaveBeenCalledWith({ data: { full_name: 'New name', username: 'New name' } });
  });
  it('stops account read follow-ups after context replacement', async () => {
    const wait = deferred<Reply>();
    io.query.mockReturnValueOnce(wait.promise);
    const pending = scoped().loadFamilyAccountSettings(nameInput),
      rejected = expect(pending).rejects.toBeTruthy();
    await vi.waitFor(() => expect(io.query).toHaveBeenCalledOnce());
    repo.clear();
    wait.resolve(ok());
    await rejected;
    expect(io.query).toHaveBeenCalledOnce();
    expect(io.getUser).not.toHaveBeenCalled();
  });
  it('does not empty more trash after the first purge loses its context', async () => {
    io.query.mockImplementation(async (table: string) => ok(table === 'trip_files' ? [{ id: 'a' }, { id: 'b' }] : []));
    const wait = deferred<Reply>();
    io.rpc.mockReturnValueOnce(wait.promise);
    const pending = scoped().emptyTripFileTrash(uid),
      rejected = expect(pending).rejects.toBeTruthy();
    await vi.waitFor(() => expect(io.rpc).toHaveBeenCalledOnce());
    repo.clear();
    wait.resolve(ok());
    await rejected;
    expect(io.rpc).toHaveBeenCalledExactlyOnceWith('purge_trip_file', { p_file_id: 'a' });
  });
  it('does not insert or copy another list item after its existence query loses context', async () => {
    const wait = deferred<Reply>();
    io.query.mockReturnValueOnce(wait.promise);
    const items = ['a', 'b'].map((id) => ({ id, name: id, catalog_kind: 'place', catalog_entity_id: id }));
    const pending = scoped().copyFamilyListPlacesToTrip({
        tripId: uid,
        items,
        canMutate: true,
        tripPlaceIds: new Set(),
      }),
      rejected = expect(pending).rejects.toBeTruthy();
    await vi.waitFor(() => expect(io.query).toHaveBeenCalledOnce());
    repo.clear();
    wait.resolve(ok([]));
    await rejected;
    expect(io.query).toHaveBeenCalledOnce();
  });
  it('preserves list-copy deduplication and exact destination identities', async () => {
    io.query.mockResolvedValue(ok([]));
    const items = ['a', 'a', 'b'].map((id) => ({ id, name: id, catalog_kind: 'place', catalog_entity_id: id }));
    expect(
      await scoped().copyFamilyListPlacesToTrip({ tripId: uid, items, canMutate: true, tripPlaceIds: new Set() })
    ).toEqual({ copied: 2, skipped: [{ id: 'a', name: 'a' }] });
    expect(io.query.mock.calls.filter((c) => c[1] !== undefined).map((c) => c[1])).toEqual([
      { trip_id: uid, place_id: 'a', is_primary: false },
      { trip_id: uid, place_id: 'b', is_primary: false },
    ]);
  });
  it('does not upload an avatar after the existing-media query loses context', async () => {
    const wait = deferred<Reply>();
    io.query.mockReturnValueOnce(wait.promise);
    const pending = scoped().uploadPersonAvatar(avatarInput()),
      rejected = expect(pending).rejects.toBeTruthy();
    await vi.waitFor(() => expect(io.query).toHaveBeenCalledOnce());
    repo.clear();
    wait.resolve(ok());
    await rejected;
    expect(io.upload).not.toHaveBeenCalled();
    expect(io.invoke).not.toHaveBeenCalled();
  });
  it('retains the avatar source after ambiguous finalization failure', async () => {
    io.invoke.mockRejectedValueOnce(new Error('lost acknowledgment'));
    await expect(scoped().uploadPersonAvatar(avatarInput())).rejects.toBeTruthy();
    expect(io.invoke).toHaveBeenCalledOnce();
    expect(io.remove).not.toHaveBeenCalled();
  });
  it('does not sign another avatar bucket after a stale soft failure', async () => {
    const wait = deferred<Reply>();
    io.signs.mockReturnValueOnce(wait.promise);
    const refs = ['one', 'two'].map((bucket, i) => ({
      personId: String(i),
      familyId: family,
      displayName: null,
      color: null,
      avatarMediaId: null,
      bucket,
      storagePath: 'avatar.jpg',
    }));
    const pending = scoped().signAvatarUrls(refs, ['0', '1']),
      rejected = expect(pending).rejects.toBeTruthy();
    repo.clear();
    wait.resolve({ data: null, error: new Error('Unavailable') });
    await rejected;
    expect(io.signs).toHaveBeenCalledOnce();
  });
  it('does not turn an ordinary current-context avatar probe failure into an exception', async () => {
    io.sign.mockRejectedValueOnce(new Error('not found'));
    expect(await scoped().familyAvatarObjectExists(sdk.storage, 'missing.jpg')).toBe(false);
  });
  it.each(['person', 'family', 'user', 'source', 'gate', 'ABA'])(
    'fences a standalone backend call through the installed bootstrap after %s replacement',
    async (kind) => {
      dispose = installFamilyFrontend();
      const wait = deferred<Reply>();
      io.query.mockReturnValueOnce(wait.promise);
      const pending = updateFamilyDisplayName(nameInput),
        rejected = expect(pending).rejects.toBeTruthy();
      await vi.waitFor(() => expect(io.query).toHaveBeenCalledOnce());
      if (kind === 'source') vi.stubEnv('VITE_SUPABASE_URL', 'https://other.invalid');
      else if (kind === 'gate') familyAuthStore.setState({ authGate: 'mfa_challenge' });
      else if (kind === 'family') familyAuthStore.setState({ familyId: 'replacement' });
      else if (kind === 'user') familyAuthStore.setState({ authUserId: 'replacement' });
      else {
        familyAuthStore.setState({ personId: 'replacement' });
        if (kind === 'ABA') familyAuthStore.setState({ personId: person });
      }
      wait.resolve(ok());
      await rejected;
      expect(io.query).toHaveBeenCalledOnce();
      expect(io.updateUser).not.toHaveBeenCalled();
    }
  );
  it('keeps concurrent request owners independent and the next standalone call healthy', async () => {
    const wait = deferred<Reply>();
    io.query.mockReturnValueOnce(wait.promise);
    const stale = scoped().updateFamilyDisplayName(nameInput),
      rejected = expect(stale).rejects.toBeTruthy();
    await vi.waitFor(() => expect(io.query).toHaveBeenCalledOnce());
    repo.clear();
    await scoped().updateFamilyDisplayName({ ...nameInput, displayName: 'Second name' });
    wait.resolve(ok());
    await rejected;
    expect(io.updateUser).toHaveBeenCalledExactlyOnceWith({
      data: { full_name: 'Second name', username: 'Second name' },
    });
    await updateFamilyDisplayName({ ...nameInput, displayName: 'Standalone name' });
    expect(io.updateUser).toHaveBeenCalledTimes(2);
  });
  it('keeps a trip layer owner through nested finalizer calls even with a healthy host actor', async () => {
    dispose = installFamilyFrontend();
    const wait = deferred<Reply>();
    io.upload.mockReturnValueOnce(wait.promise);
    const operations = scopeFamilyOperations(repo, { uploadTripFile }, repo.captureContext(uid, { revision: false }));
    const pending = operations.uploadTripFile(uploadInput()),
      rejected = expect(pending).rejects.toBeTruthy();
    await vi.waitFor(() => expect(io.upload).toHaveBeenCalledOnce());
    repo.setLayer(uid, 'myDraft');
    wait.resolve(ok());
    await rejected;
    expect(io.invoke).not.toHaveBeenCalled();
  });
  it('does not hide lost avatar context behind the optional signed-URL fallback', async () => {
    dispose = installFamilyFrontend();
    const wait = deferred<Reply>();
    io.query.mockImplementation((table: string) =>
      table === 'people_avatar_refs' ? wait.promise : Promise.resolve(ok())
    );
    const pending = uploadPersonAvatar(avatarInput()),
      rejected = expect(pending).rejects.toMatchObject({ code: 'stale_family_actor' });
    await vi.waitFor(() => expect(io.invoke).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(io.query).toHaveBeenCalledTimes(2));
    familyAuthStore.setState({ personId: 'replacement' });
    wait.resolve(ok([]));
    await rejected;
    expect(io.signs).not.toHaveBeenCalled();
    expect(io.remove).not.toHaveBeenCalled();
  });
  it('stale bootstrap disposal cannot unregister the replacement backend owner', async () => {
    const old = installFamilyFrontend();
    dispose = installFamilyFrontend();
    old?.();
    const wait = deferred<Reply>();
    io.query.mockReturnValueOnce(wait.promise);
    const pending = updateFamilyDisplayName(nameInput),
      rejected = expect(pending).rejects.toBeTruthy();
    await vi.waitFor(() => expect(io.query).toHaveBeenCalledOnce());
    familyAuthStore.setState({ personId: 'replacement' });
    wait.resolve(ok());
    await rejected;
    expect(io.updateUser).not.toHaveBeenCalled();
  });
  describe.each(['collection', 'journey'] as const)('%s shared-finalizer caller', (kind) => {
    const invoke = (file: File) => {
      const ops = scopeFamilyOperations(repo, { uploadFamilyListCover, uploadJourneyImage });
      return kind === 'collection'
        ? ops.uploadFamilyListCover({ familyId: family, listId: person, file })
        : ops.uploadJourneyImage({ familyId: family, journeyId: person, entryId: uid, file });
    };
    it('does not upload after normalization loses its owner', async () => {
      const wait = deferred<File>(),
        file = avatarInput().file;
      io.normalize.mockReturnValueOnce(wait.promise);
      const pending = invoke(file),
        rejected = expect(pending).rejects.toBeTruthy();
      repo.clear();
      wait.resolve(file);
      await rejected;
      expect(io.upload).not.toHaveBeenCalled();
    });
    it('does not finalize or compensate after an uploaded file loses its owner', async () => {
      const wait = deferred<Reply>();
      io.upload.mockReturnValueOnce(wait.promise);
      const pending = invoke(avatarInput().file),
        rejected = expect(pending).rejects.toBeTruthy();
      await vi.waitFor(() => expect(io.upload).toHaveBeenCalledOnce());
      repo.clear();
      wait.resolve(ok());
      await rejected;
      expect(io.invoke).not.toHaveBeenCalled();
      expect(io.remove).not.toHaveBeenCalled();
    });
    it('retains source after an unconfirmed finalization error', async () => {
      io.invoke.mockRejectedValueOnce(new Error('lost acknowledgment'));
      await expect(invoke(avatarInput().file)).rejects.toThrow('lost acknowledgment');
      expect(io.remove).not.toHaveBeenCalled();
    });
    it('preserves healthy object paths and exact finalizer kind and identities', async () => {
      const file = avatarInput().file;
      await invoke(file);
      const path = io.upload.mock.calls[0][0] as string;
      const payload =
        kind === 'collection'
          ? { kind: 'list_cover', list_id: person }
          : { kind: 'journey_image', journey_id: person, entry_id: uid };
      expect(path).toMatch(
        new RegExp(`^${family}/${kind === 'collection' ? 'lists' : 'journeys'}/${person}/.+\\.jpg$`)
      );
      expect(io.invoke).toHaveBeenCalledWith('finalize-private-upload', {
        body: expect.objectContaining({ ...payload, path, filename: path.split('/').pop() }),
      });
      expect(io.upload).toHaveBeenCalledWith(path, file, { contentType: 'image/jpeg', upsert: false });
      expect(io.remove).not.toHaveBeenCalled();
    });
  });
});

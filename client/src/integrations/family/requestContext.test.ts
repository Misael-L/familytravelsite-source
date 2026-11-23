import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  familyAuthStore,
  familyFrontend,
  FamilyFrontendRepository,
  familyReaders,
  type FamilySession,
} from './repository';
import { scopedFamilyRequest } from './requestContext';
import { createFamilyAxiosAdapter } from './transport';

const id = (n: number) => `10000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const trip = id(4);
const session: FamilySession = {
  userId: id(1),
  personId: id(2),
  familyId: id(3),
  user: { username: 'Fixture', email: 'fixture@example.invalid', avatar_url: null, created_at: '2026-01-01' },
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
afterEach(() => {
  familyFrontend.clear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Family request context orchestration', () => {
  it.each(['person', 'family', 'source', 'layer'])(
    'blocks a follow-up repository call after a %s switch between awaits',
    async (kind) => {
      let actor = { ...session },
        source = 'https://one.invalid';
      const repo = new FamilyFrontendRepository(
        async () => actor,
        familyReaders,
        () => ({ ...actor, source })
      );
      await repo.session();
      const wait = deferred(),
        dispatch = vi.fn(async () => ({ ok: true })),
        entered = vi.fn();
      const handle = scopedFamilyRequest(repo, (scoped) => async () => {
        entered();
        await wait.promise;
        await scoped.views();
        return dispatch();
      });
      const client = axios.create({ adapter: createFamilyAxiosAdapter(handle) });
      const body = { operation_id: id(9), expected_revision: 7, notes: 'Original intent' };
      const result = client.post(`/trips/${trip}/fixture`, body),
        stale = expect(result).rejects.toMatchObject({ response: { status: 409 } });
      await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce());
      if (kind === 'source') source = 'https://two.invalid';
      else if (kind === 'layer') repo.setLayer(trip, 'myDraft');
      else {
        actor = { ...actor, [kind === 'person' ? 'personId' : 'familyId']: id(80) };
        repo.acceptSession(actor);
      }
      wait.resolve();
      await stale;
      expect(dispatch).not.toHaveBeenCalled();
      expect(body).toEqual({ operation_id: id(9), expected_revision: 7, notes: 'Original intent' });
    }
  );
  it('allows healthy request-owned invalidation and forwards the exact body once', async () => {
    const repo = new FamilyFrontendRepository(async () => session);
    await repo.session();
    const dispatch = vi.fn(async (body: unknown) => body);
    const handle = scopedFamilyRequest(repo, (scoped) => async (request) => {
      const result = await dispatch(request.body);
      scoped.invalidate(trip);
      return result;
    });
    const client = axios.create({ adapter: createFamilyAxiosAdapter(handle) }),
      body = { operation_id: id(9), base_token: 'unchanged', payload: { notes: 'Original' } };
    expect((await client.post(`/trips/${trip}/fixture`, body)).data).toEqual(body);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(body);
  });
  it.each(['person', 'family', 'gate'])(
    'observes real legacy Auth %s A/B/A transitions without changing stable IDs',
    async (kind) => {
      const original = familyAuthStore.getState();
      vi.stubEnv('VITE_SUPABASE_URL', 'https://project.invalid');
      familyAuthStore.setState({
        isAuthenticated: true,
        authGate: 'ok',
        authUserId: session.userId,
        personId: session.personId,
        familyId: session.familyId,
        user: {
          ...session.user,
          id: 0,
          role: 'user',
          maps_api_key: null,
          must_change_password: false,
        },
        loadUser: async () => {},
      });
      try {
        familyFrontend.acceptSession(session);
        const first = await familyFrontend.views(),
          key = first.ids.register('trip', trip),
          context = familyFrontend.captureContext();
        const replacement =
          kind === 'gate'
            ? { authGate: 'mfa_challenge' as const }
            : kind === 'person'
              ? { personId: id(80) }
              : { familyId: id(80) };
        familyAuthStore.setState(replacement);
        familyAuthStore.setState({ authGate: 'ok', personId: session.personId, familyId: session.familyId });
        expect(() => context.assertCurrent()).toThrow('Family context changed');
        familyFrontend.acceptSession(session);
        const second = await familyFrontend.views();
        expect(second.ids).not.toBe(first.ids);
        expect(second.ids.register('trip', trip)).toBe(key);
      } finally {
        familyAuthStore.setState(original, true);
      }
    }
  );
  it('does not discard the context on cosmetic Auth updates or the same accepted session', async () => {
    let actor = { ...session };
    const repo = new FamilyFrontendRepository(
      async () => actor,
      familyReaders,
      () => ({ ...actor, source: 'https://project.invalid/' })
    );
    const views = await repo.views(),
      context = repo.captureContext();
    actor = { ...actor, user: { ...actor.user, username: 'New name' } };
    repo.acceptSession(actor);
    expect((await repo.views()).ids).toBe(views.ids);
    expect(() => context.assertCurrent()).not.toThrow();
  });
});

it('rejects a request after an itinerary layer A/B/A transition', async () => {
  const repo = new FamilyFrontendRepository(async () => session);
  await repo.session();
  const wait = deferred(),
    entered = vi.fn(),
    dispatch = vi.fn(async () => ({ ok: true }));
  const handle = scopedFamilyRequest(repo, (scoped) => async () => {
    entered();
    await wait.promise;
    await scoped.views();
    return dispatch();
  });
  const client = axios.create({ adapter: createFamilyAxiosAdapter(handle) });
  const result = client.post(`/trips/${trip}/fixture`, { original: true });
  const stale = expect(result).rejects.toMatchObject({ response: { status: 409 } });
  await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce());
  repo.setLayer(trip, 'myDraft');
  repo.setLayer(trip, 'published');
  wait.resolve();
  await stale;
  expect(dispatch).not.toHaveBeenCalled();
});

it('consumes an issued rejection when a repository method changes context synchronously', async () => {
  const repo = new FamilyFrontendRepository(async () => session);
  await repo.session();
  repo.session = () => {
    repo.clear();
    return Promise.reject(new Error('Old backend rejection'));
  };
  const handle = scopedFamilyRequest(repo, (scoped) => async () => scoped.session());
  const client = axios.create({ adapter: createFamilyAxiosAdapter(handle) });
  await expect(client.get('/trips')).rejects.toMatchObject({ response: { status: 409 } });
  await new Promise((resolve) => setTimeout(resolve, 0));
});

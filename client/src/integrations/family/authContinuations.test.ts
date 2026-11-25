import { DEFAULT_DATE_FORMAT, DEFAULT_WEEK_START } from '@trek/shared';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { apiClient, settingsApi } from '../../api/client';
import { useSettingsStore as nativeSettings } from '../../store/settingsStore';
import { createFamilyApplicationHandler } from './applicationHandler';
import * as auth from './legacy/data/supabase/auth';
import { compiledFeatureMap } from './legacy/data/supabase/familyFeatures';
import { builtinEffectiveMapSettings } from './legacy/data/supabase/familyMaps';
import type { EffectivePreferences } from './legacy/data/supabase/familyPreferences';
import * as schedule from './legacy/data/supabase/scheduleItems';
import { useFamilyFeatureStore as features } from './legacy/store/familyFeatureStore';
import { useFamilyMapStore as maps, resetFamilyMapStoreForTests } from './legacy/store/familyMapStore';
import { useSettingsStore as preferences } from './legacy/store/settingsStore';
import { handleFamilyNotifications } from './notificationHandler';
import { familyAuthStore, familyFrontend, FamilyFrontendRepository, familyReaders } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const io = vi.hoisted(() => ({
  prefs: vi.fn(),
  updatePrefs: vi.fn(),
  profileRead: vi.fn(),
  profileWrite: vi.fn(),
  features: vi.fn(),
  maps: vi.fn(),
  updateMap: vi.fn(),
  name: vi.fn(),
  email: vi.fn(),
  page: vi.fn(),
  count: vi.fn(),
}));
vi.mock('@family/backend/supabase/profileDisplayPreferences', () => ({
  getMyProfileDisplayPreferences: io.profileRead,
  updateMyProfileDisplayPreferences: io.profileWrite,
}));
vi.mock('./legacy/data/supabase/familyPreferences', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/familyPreferences')>()),
  getMyEffectivePreferences: io.prefs,
  updateMyFamilyPreferences: io.updatePrefs,
}));
vi.mock('./legacy/data/supabase/familyFeatures', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/familyFeatures')>()),
  getMyEffectiveFeatures: io.features,
}));
vi.mock('./legacy/data/supabase/familyMaps', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/familyMaps')>()),
  getMyEffectiveMapSettings: io.maps,
  updateMyMapPreference: io.updateMap,
}));
vi.mock('./legacy/data/supabase/familySettings', () => ({
  updateFamilyDisplayName: io.name,
  updateFamilyEmail: io.email,
}));
vi.mock('./legacy/data/supabase/familyNotifications', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/familyNotifications')>()),
  listMyNotifications: io.page,
  countMyUnreadNotifications: io.count,
}));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = id(1),
  person = id(2),
  family = id(3),
  trip = id(4),
  day = id(5);
const initial = {
  auth: familyAuthStore.getState(),
  prefs: preferences.getState(),
  features: features.getState(),
  maps: maps.getState(),
};
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function prefResult(p = person): EffectivePreferences {
  const empty = { temperatureUnit: null, distanceUnit: null, timeFormat: null, displayCurrency: null };
  return {
    familyId: family,
    personId: p,
    family: empty,
    overrides: empty,
    effective: { ...empty, temperatureUnit: 'fahrenheit' },
    sources: { temperatureUnit: 'member', distanceUnit: 'builtin', timeFormat: 'builtin', displayCurrency: 'builtin' },
  };
}
function session() {
  const s = familyAuthStore.getState();
  return {
    userId: s.authUserId ?? user,
    personId: s.personId ?? person,
    familyId: s.familyId ?? family,
    user: buildUser(),
  };
}
function change(kind: string) {
  if (kind === 'source') vi.stubEnv('VITE_SUPABASE_URL', 'https://other.invalid');
  else if (kind === 'gate') familyAuthStore.setState({ authGate: 'mfa_challenge' });
  else if (kind === 'user') familyAuthStore.setState({ authUserId: id(80) });
  else familyAuthStore.setState(kind === 'family' ? { familyId: id(80) } : { personId: id(80) });
}
beforeEach(() => {
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fixture.invalid');
  localStorage.clear();
  familyFrontend.clear();
  preferences.setState(initial.prefs, true);
  features.getState().reset();
  resetFamilyMapStoreForTests();
  familyAuthStore.setState({
    isAuthenticated: true,
    authGate: 'ok',
    authUserId: user,
    personId: person,
    familyId: family,
    user: buildUser(),
    loadUser: async () => {},
  });
  io.prefs.mockReset().mockImplementation(async () => prefResult(familyAuthStore.getState().personId ?? person));
  io.name.mockReset();
  io.email.mockReset();
  io.updatePrefs.mockReset();
  io.profileRead.mockReset().mockResolvedValue(undefined);
  io.profileWrite.mockReset();
  io.features.mockReset().mockResolvedValue(compiledFeatureMap());
  io.maps.mockReset().mockImplementation(async () => ({
    ...builtinEffectiveMapSettings(family, familyAuthStore.getState().personId),
    selectedOptionId: 'osm',
  }));
  io.updateMap.mockReset();
});
afterEach(() => {
  familyFrontend.clear();
  familyAuthStore.setState(initial.auth, true);
  preferences.setState(initial.prefs, true);
  features.getState().reset();
  resetFamilyMapStoreForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Family Auth/store continuations with fake backend operations', () => {
  it.each(['person', 'family', 'user', 'source', 'gate'])(
    'does not publish old display preferences after a %s change',
    async (kind) => {
      const wait = deferred<EffectivePreferences>();
      io.prefs.mockReturnValueOnce(wait.promise);
      const pending = preferences.getState().hydrateFamilyPreferences(family);
      await vi.waitFor(() => expect(io.prefs).toHaveBeenCalledOnce());
      change(kind);
      wait.resolve(prefResult());
      await pending;
      expect(preferences.getState().settings.temperature_unit).not.toBe('fahrenheit');
    }
  );
  it('does not publish old same-Family feature permissions without another hydrate', async () => {
    const wait = deferred<ReturnType<typeof compiledFeatureMap>>();
    io.features.mockReturnValueOnce(wait.promise);
    const pending = features.getState().hydrate(family);
    change('person');
    wait.resolve({ ...compiledFeatureMap(), vacay: false });
    await pending;
    expect(features.getState().features.vacay).not.toBe(false);
    expect(features.getState().hydrated).toBe(false);
  });
  it('does not publish an old map selection or snapshot for a new person', async () => {
    const wait = deferred<ReturnType<typeof builtinEffectiveMapSettings>>();
    io.maps.mockReturnValueOnce(wait.promise);
    const pending = maps.getState().hydrate(family);
    change('person');
    wait.resolve({
      ...builtinEffectiveMapSettings(family, person),
      selectedOptionId: 'osm-de',
      effectiveOptionId: 'osm-de',
    });
    await pending;
    expect(maps.getState().settings?.effectiveOptionId).not.toBe('osm-de');
    expect(localStorage.getItem(`fta_family_map_v1:${family}:${person}`)).toBeNull();
  });
  it('retains legacy local provider intent when its migration finishes after person replacement', async () => {
    localStorage.setItem('fta_map_provider', 'mapbox-gl');
    localStorage.setItem('fta_mapbox_access_token', 'pk.local-fixture');
    io.maps.mockResolvedValueOnce({
      ...builtinEffectiveMapSettings(family, person),
      enabledOptionIds: ['osm', 'mapbox-standard'],
      mapboxPublicToken: 'pk.fixture',
      mapboxConfigured: true,
    });
    const wait = deferred<ReturnType<typeof builtinEffectiveMapSettings>>();
    io.updateMap.mockReturnValueOnce(wait.promise);
    const pending = maps.getState().hydrate(family);
    await vi.waitFor(() => expect(io.updateMap).toHaveBeenCalledOnce());
    change('person');
    wait.resolve({ ...builtinEffectiveMapSettings(family, person), selectedOptionId: 'mapbox-standard' });
    await pending;
    expect(localStorage.getItem('fta_map_provider')).toBe('mapbox-gl');
    expect(localStorage.getItem('fta_mapbox_access_token')).toBe('pk.local-fixture');
  });
  it('does not roll a stale failed map save over a replacement selection', async () => {
    maps.setState({
      familyId: family,
      personId: person,
      hydrated: true,
      settings: builtinEffectiveMapSettings(family, person),
    });
    const wait = deferred<ReturnType<typeof builtinEffectiveMapSettings>>();
    io.updateMap.mockReturnValueOnce(wait.promise);
    const pending = maps.getState().selectOption('osm-de'),
      rejected = expect(pending).rejects.toBeTruthy();
    change('person');
    maps.setState({
      familyId: family,
      personId: id(80),
      settings: { ...builtinEffectiveMapSettings(family, id(80)), effectiveOptionId: 'osm-de' },
    });
    wait.reject(new Error('Old save failed'));
    await rejected;
    expect(maps.getState().settings?.effectiveOptionId).toBe('osm-de');
  });
  it('does not roll a stale failed portable preference save over the new view', async () => {
    const wait = deferred<EffectivePreferences>();
    io.updatePrefs.mockReturnValueOnce(wait.promise);
    const pending = preferences.getState().updateSetting('temperature_unit', 'fahrenheit'),
      rejected = expect(pending).rejects.toBeTruthy();
    change('person');
    preferences.setState((s) => ({ settings: { ...s.settings, temperature_unit: 'fahrenheit' } }));
    wait.reject(new Error('Old save failed'));
    await rejected;
    expect(preferences.getState().settings.temperature_unit).toBe('fahrenheit');
  });
  it('isolates actual /auth/me flights and rejects the old response before native publication', async () => {
    const repo = new FamilyFrontendRepository(),
      client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
    const wait = deferred<EffectivePreferences>();
    io.prefs.mockReturnValueOnce(wait.promise);
    const old = client.get('/auth/me').then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error })
    );
    await vi.waitFor(() => expect(io.prefs).toHaveBeenCalledOnce());
    change('person');
    const next = client.get('/auth/me').then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error })
    );
    const independent = await vi
      .waitFor(() => expect(io.prefs).toHaveBeenCalledTimes(2), { timeout: 600 })
      .then(
        () => true,
        () => false
      );
    wait.resolve(prefResult());
    const [first, second] = await Promise.all([old, next]);
    expect(independent).toBe(true);
    expect(first).toMatchObject({ ok: false, error: { response: { status: 409 } } });
    if (second.ok === false) throw second.error;
    expect(second.value.data.user.id).not.toBe((await repo.views()).ids.register('person', person));
  });
  it('keeps healthy preference, feature and map hydration working through /auth/me', async () => {
    const client = axios.create({
      adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
    });
    expect((await client.get('/auth/me')).data.user.username).toBeTruthy();
    expect(preferences.getState().settings.temperature_unit).toBe('fahrenheit');
    expect(features.getState().hydrated).toBe(true);
    expect(maps.getState().hydrated).toBe(true);
  });
  it("does not reuse another project's cached effective map settings on an offline read", async () => {
    io.maps.mockResolvedValueOnce({
      ...builtinEffectiveMapSettings(family, person),
      source: 'member',
      selectedOptionId: 'osm-de',
      effectiveOptionId: 'osm-de',
    });
    await maps.getState().hydrate(family);
    change('source');
    io.maps.mockRejectedValueOnce(new Error('Offline'));
    await maps.getState().hydrate(family);
    expect(maps.getState().settings?.source).toBe('builtin');
  });
});

describe('Actual legacy multi-step handler orchestration', () => {
  it.each(['person', 'layer'])('does not dispatch the second day-clear write after a %s change', async (kind) => {
    const rows = [id(10), id(11)].map((value) => ({
      id: value,
      tripId: trip,
      activity: 'Visit',
      placeId: null,
      startsAt: '2026-08-13T08:00:00.000Z',
      endsAt: null,
      address: null,
      timeZone: null,
      sortOrder: 0,
      experienceId: null,
      foodId: null,
      linkUrl: null,
    }));
    const readers = {
      ...familyReaders,
      trips: {
        ...familyReaders.trips,
        fetchTripById: vi.fn(
          async () =>
            ({ id: trip, family_id: family, title: 'Fixture' }) as NonNullable<
              Awaited<ReturnType<typeof familyReaders.trips.fetchTripById>>
            >
        ),
      },
      days: {
        ...familyReaders.days,
        listTripDays: vi.fn(async () => [{ id: day, tripId: trip, civilDay: '2026-08-13', dayIndex: 0, title: 'Day' }]),
      },
      places: { ...familyReaders.places, listTripPlaces: vi.fn(async () => []) },
      schedule: { ...familyReaders.schedule, listScheduleItems: vi.fn(async () => rows) },
      notes: { ...familyReaders.notes, listDayNotes: vi.fn(async () => []) },
      capabilities: { ...familyReaders.capabilities, canMutateTrip: vi.fn(async () => true) },
      permissions: {
        ...familyReaders.permissions,
        listTripActionOutcomes: vi.fn(async () => ({
          tripId: trip,
          familyId: family,
          outcomes: { 'trip.schedule.manage': 'direct' as const },
        })),
      },
    };
    const repo = new FamilyFrontendRepository(
      async () => session(),
      readers,
      () => ({ ...session(), source: 'https://fixture.invalid' })
    );
    const wait = deferred<void>(),
      remove = vi.spyOn(schedule, 'deleteScheduleItem').mockReturnValueOnce(wait.promise).mockResolvedValue();
    const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
    const request = client.delete(`/trips/${trip}/days/${day}/assignments`),
      stale = expect(request).rejects.toMatchObject({ response: { status: 409 } });
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    if (kind === 'layer') repo.setLayer(trip, 'myDraft');
    else change('person');
    wait.resolve();
    await stale;
    expect(remove).toHaveBeenCalledExactlyOnceWith(rows[0].id);
  });
});

it('stops an account-profile email follow-up after the original name update changes person', async () => {
  const wait = deferred<void>();
  io.name.mockReturnValueOnce(wait.promise);
  io.email.mockResolvedValue(undefined);
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  const pending = client.put('/auth/me', { username: 'Original name', email: 'original-intent@example.invalid' });
  const stale = expect(pending).rejects.toMatchObject({ response: { status: 409 } });
  await vi.waitFor(() => expect(io.name).toHaveBeenCalledOnce());
  change('person');
  wait.resolve();
  await stale;
  expect(io.email).not.toHaveBeenCalled();
  expect(io.name).toHaveBeenCalledWith({ userId: user, personId: person, displayName: 'Original name' });
});
it('forwards a healthy profile update with the original actor and body', async () => {
  io.name.mockResolvedValue(undefined);
  io.email.mockResolvedValue(undefined);
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  await client.put('/auth/me', {
    username: 'Healthy',
    email: 'healthy@example.invalid',
    current_password: 'fixture-secret',
  });
  expect(io.email).toHaveBeenCalledExactlyOnceWith({
    personId: person,
    email: 'healthy@example.invalid',
    currentPassword: 'fixture-secret',
  });
});

it('rejects a stale protected Auth settings response', async () => {
  const wait = deferred<EffectivePreferences>();
  io.prefs.mockReturnValueOnce(wait.promise);
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  const pending = client.get('/auth/me/settings'),
    stale = expect(pending).rejects.toMatchObject({ response: { status: 409 } });
  await vi.waitFor(() => expect(io.prefs).toHaveBeenCalledOnce());
  change('person');
  wait.resolve(prefResult());
  await stale;
});
it('does not advance an old MFA disable flow after reauthentication changes person', async () => {
  vi.spyOn(auth, 'listTotpFactors').mockResolvedValue([{ id: id(70), status: 'verified' }] as Awaited<
    ReturnType<typeof auth.listTotpFactors>
  >);
  const wait = deferred<void>();
  const reauth = vi.spyOn(auth, 'reauthenticateWithPassword').mockReturnValueOnce(wait.promise);
  const verify = vi.spyOn(auth, 'verifyTotpFactor').mockResolvedValue(undefined),
    unenroll = vi.spyOn(auth, 'unenrollTotpFactor').mockResolvedValue(undefined);
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  const pending = client.post('/auth/mfa/disable', { password: 'fixture-secret', code: '123456' }),
    stale = expect(pending).rejects.toMatchObject({ response: { status: 409 } });
  await vi.waitFor(() => expect(reauth).toHaveBeenCalledOnce());
  change('person');
  wait.resolve();
  await stale;
  expect(verify).not.toHaveBeenCalled();
  expect(unenroll).not.toHaveBeenCalled();
});
it('does not walk notification pages in a replacement actor context', async () => {
  const wait = deferred<{
    items: { id: string }[];
    nextCursor: { beforeId: string; beforeCreatedAt: string } | null;
  }>();
  io.page.mockReset().mockReturnValueOnce(wait.promise).mockResolvedValue({ items: [], nextCursor: null });
  io.count.mockReset().mockResolvedValue(0);
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  const pending = client.get('/notifications/in-app?offset=2&limit=1'),
    stale = expect(pending).rejects.toMatchObject({ response: { status: 409 } });
  await vi.waitFor(() => expect(io.page).toHaveBeenCalledOnce());
  change('person');
  wait.resolve({ items: [{ id: id(50) }], nextCursor: { beforeId: id(50), beforeCreatedAt: '2026-01-01' } });
  await stale;
  expect(io.page).toHaveBeenCalledOnce();
  expect(io.count).not.toHaveBeenCalled();
});

it('rejects a project switch while the first Auth session is warming', async () => {
  const wait = deferred<void>(),
    loader = vi.fn(() => wait.promise);
  familyAuthStore.setState({
    isAuthenticated: false,
    authUserId: null,
    personId: null,
    familyId: null,
    authGate: null,
    user: null,
    loadUser: loader,
  });
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  const pending = client.get('/auth/me'),
    stale = expect(pending).rejects.toMatchObject({ response: { status: 409 } });
  await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
  change('source');
  familyAuthStore.setState({
    isAuthenticated: true,
    authUserId: user,
    personId: person,
    familyId: family,
    authGate: 'ok',
    user: buildUser(),
  });
  wait.resolve();
  await stale;
  expect(io.prefs).not.toHaveBeenCalled();
});

it('allows the intended same-actor MFA assurance transitions during disable', async () => {
  vi.spyOn(auth, 'listTotpFactors').mockResolvedValue([{ id: id(70), status: 'verified' }] as Awaited<
    ReturnType<typeof auth.listTotpFactors>
  >);
  vi.spyOn(auth, 'reauthenticateWithPassword').mockImplementation(async () => {
    familyAuthStore.setState({ authGate: 'mfa_challenge' });
  });
  const verify = vi.spyOn(auth, 'verifyTotpFactor').mockImplementation(async () => {
    familyAuthStore.setState({ authGate: 'ok' });
  });
  const unenroll = vi.spyOn(auth, 'unenrollTotpFactor').mockResolvedValue(undefined);
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  expect(
    (await client.post('/auth/mfa/disable', { password: 'fixture-secret', code: '123456' })).data.mfa_enabled
  ).toBe(false);
  expect(verify).toHaveBeenCalledOnce();
  expect(unenroll).toHaveBeenCalledExactlyOnceWith(id(70));
});
it('stops MFA continuation when access is revoked and restored while reauthentication waits', async () => {
  vi.spyOn(auth, 'listTotpFactors').mockResolvedValue([{ id: id(70), status: 'verified' }] as Awaited<
    ReturnType<typeof auth.listTotpFactors>
  >);
  const wait = deferred<void>(),
    reauth = vi.spyOn(auth, 'reauthenticateWithPassword').mockReturnValueOnce(wait.promise);
  const verify = vi.spyOn(auth, 'verifyTotpFactor').mockResolvedValue(undefined);
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  const pending = client.post('/auth/mfa/disable', { password: 'fixture-secret', code: '123456' }),
    stale = expect(pending).rejects.toMatchObject({ response: { status: 409 } });
  await vi.waitFor(() => expect(reauth).toHaveBeenCalledOnce());
  familyAuthStore.setState({ authGate: 'suspended' });
  familyAuthStore.setState({ authGate: 'ok' });
  wait.resolve();
  await stale;
  expect(verify).not.toHaveBeenCalled();
});

describe('U03 actual-entry bootstrap regressions', () => {
  it('accepts validated same-user membership after a persisted unknown gate', async () => {
    familyAuthStore.setState({
      authGate: null,
      loadUser: async () => {
        familyAuthStore.setState({ authGate: 'ok' });
      },
    });
    const repo = new FamilyFrontendRepository();
    const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
    const response = await client.get('/auth/me');
    expect(response.status).toBe(200);
    expect(response.data.user.id).toBe((await repo.views()).ids.register('person', person));
  });
  it('starts a fresh auth view after the repository is cleared for the same actor', async () => {
    const repo = new FamilyFrontendRepository();
    const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
    const wait = deferred<EffectivePreferences>();
    io.prefs.mockReturnValueOnce(wait.promise);
    const first = client.get('/auth/me').then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error })
    );
    await vi.waitFor(() => expect(io.prefs).toHaveBeenCalledOnce());
    repo.clear();
    const second = client.get('/auth/me').then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error })
    );
    const independent = await vi
      .waitFor(() => expect(io.prefs).toHaveBeenCalledTimes(2), { timeout: 600 })
      .then(
        () => true,
        () => false
      );
    wait.resolve(prefResult());
    const answers = await Promise.all([first, second]);
    expect(independent).toBe(true);
    expect(answers[1].ok).toBe(true);
  });
});

it('returns signed-out when the SDK has no session despite a cached display identity', async () => {
  familyAuthStore.setState({
    authGate: null,
    loadUser: async () => {
      familyAuthStore.setState({
        isAuthenticated: false,
        authUserId: null,
        personId: null,
        familyId: null,
        user: null,
      });
    },
  });
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  await expect(client.get('/auth/me')).rejects.toMatchObject({ response: { status: 401 } });
  expect(io.prefs).not.toHaveBeenCalled();
});
it.each(['person', 'family', 'user', 'source'])(
  'rejects a cached-identity bootstrap when its %s changes during validation',
  async (kind) => {
    const wait = deferred<void>(),
      loader = vi.fn(() => wait.promise);
    familyAuthStore.setState({ authGate: null, loadUser: loader });
    const client = axios.create({
      adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
    });
    const pending = client.get('/auth/me'),
      stale = expect(pending).rejects.toMatchObject({ response: { status: 409 } });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    change(kind);
    familyAuthStore.setState({ authGate: 'ok' });
    wait.resolve();
    await stale;
    expect(io.prefs).not.toHaveBeenCalled();
  }
);

it('does not publish a temporary auth identity while membership is still unknown', async () => {
  familyAuthStore.setState({ authGate: null, loadUser: async () => {} });
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  await expect(client.get('/auth/me')).rejects.toMatchObject({
    response: { status: 503, data: { code: 'family_validation_pending' } },
  });
  expect(io.prefs).not.toHaveBeenCalled();
});

it('refuses an old ok gate when its fresh Family validation failed', async () => {
  familyAuthStore.setState({ authGate: 'ok', authCheckFailed: true, loadUser: async () => {} });
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  await expect(client.get('/auth/me')).rejects.toMatchObject({
    response: { status: 503, data: { code: 'family_validation_pending' } },
  });
  expect(io.prefs).not.toHaveBeenCalled();
});
it('does not reuse the accepted repository session after Family validation becomes unavailable', async () => {
  const repo = new FamilyFrontendRepository();
  repo.acceptSession(session());
  familyAuthStore.setState({ authCheckFailed: true, loadUser: async () => {} });
  await expect(repo.session()).rejects.toMatchObject({ status: 503, code: 'family_validation_pending' });
});

it('classifies unavailable Family validation as pending rather than authoritative sign-out when display evidence is absent', async () => {
  familyAuthStore.setState({
    isAuthenticated: false,
    authUserId: null,
    personId: null,
    familyId: null,
    user: null,
    authCheckFailed: true,
    authGate: null,
    loadUser: async () => {},
  });
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  await expect(client.get('/auth/me')).rejects.toMatchObject({
    response: { status: 503, data: { code: 'family_validation_pending' } },
  });
  expect(io.prefs).not.toHaveBeenCalled();
});

const terminalInboxPage = () => ({
  items: [
    {
      id: id(50),
      familyId: family,
      eventKey: 'proposal.created',
      destinationKind: 'proposal',
      sourceId: id(51),
      tripId: trip,
      label: 'Inbox example',
      resolvedStatus: null,
      readAt: null,
      dismissedAt: null,
      createdAt: '2026-11-17T00:00:00Z',
    },
  ],
  nextCursor: null,
});
it('returns an empty list after walking to a terminal inbox page', async () => {
  io.page.mockReset().mockResolvedValue(terminalInboxPage());
  io.count.mockReset().mockResolvedValue(3);
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  const result = await client.get('/notifications/in-app?offset=2&limit=1');
  expect(result.data).toMatchObject({ notifications: [], total: 2, unread_count: 3, has_more: false });
  expect(io.page).toHaveBeenCalledOnce();
  expect(io.count).toHaveBeenCalledOnce();
});
it('still reads the first inbox page at offset zero when its cursor is terminal', async () => {
  io.page.mockReset().mockResolvedValue(terminalInboxPage());
  io.count.mockReset().mockResolvedValue(3);
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  const result = await client.get('/notifications/in-app?offset=0&limit=1');
  expect(result.data.notifications).toHaveLength(1);
  expect(result.data).toMatchObject({ total: 1, unread_count: 3, has_more: false });
  expect(io.page).toHaveBeenCalledOnce();
});
it('does not restart a cached terminal inbox cursor', async () => {
  io.page.mockReset().mockResolvedValue(terminalInboxPage());
  io.count.mockReset().mockResolvedValue(3);
  const repo = new FamilyFrontendRepository();
  await repo.session();
  await handleFamilyNotifications(repo, {
    pathname: '/notifications/in-app',
    method: 'GET',
    body: undefined,
    query: new URLSearchParams({ offset: '0', limit: '1' }),
  });
  io.page.mockClear();
  io.count.mockClear();
  const result = await handleFamilyNotifications(repo, {
    pathname: '/notifications/in-app',
    method: 'GET',
    body: undefined,
    query: new URLSearchParams({ offset: '1', limit: '1' }),
  });
  expect(result).toMatchObject({ notifications: [], total: 1, unread_count: 3, has_more: false });
  expect(io.page).not.toHaveBeenCalled();
  expect(io.count).toHaveBeenCalledOnce();
});
it('rejects a terminal inbox count after its actor context is retired', async () => {
  const wait = deferred<number>();
  io.page.mockReset().mockResolvedValue(terminalInboxPage());
  io.count.mockReset().mockReturnValue(wait.promise);
  const client = axios.create({
    adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(new FamilyFrontendRepository())),
  });
  const pending = client.get('/notifications/in-app?offset=2&limit=1'),
    stale = expect(pending).rejects.toMatchObject({ response: { status: 409 } });
  await vi.waitFor(() => expect(io.count).toHaveBeenCalledOnce());
  change('person');
  wait.resolve(3);
  await stale;
  expect(io.page).toHaveBeenCalledOnce();
});

describe('Family date settings through the native settings API', () => {
  const selected = { date_format: 'DD.MM.YYYY', week_start: 'sunday' } as const;
  const defaults = { date_format: DEFAULT_DATE_FORMAT, week_start: DEFAULT_WEEK_START };
  let previousAdapter: typeof apiClient.defaults.adapter;

  function profileKey() {
    return [import.meta.env.VITE_SUPABASE_URL, familyAuthStore.getState().authUserId].join(':');
  }

  beforeEach(() => {
    const profiles = new Map<string, typeof defaults>();
    io.profileRead.mockImplementation(async () => profiles.get(profileKey()) ?? defaults);
    io.profileWrite.mockImplementation(async (patch, familyPatch) => {
      const key = profileKey();
      const display = { ...(profiles.get(key) ?? defaults), ...patch };
      profiles.set(key, display);
      return {
        display,
        family: familyPatch
          ? { ...prefResult(), effective: { ...prefResult().effective, ...familyPatch.patch } }
          : null,
      };
    });
    previousAdapter = apiClient.defaults.adapter;
    const repo = new FamilyFrontendRepository(async () => session(), familyReaders);
    apiClient.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(repo));
    nativeSettings.getState().resetSettings();
  });

  afterEach(() => {
    apiClient.defaults.adapter = previousAdapter;
    nativeSettings.getState().resetSettings();
  });

  async function changeDisplayDates() {
    await nativeSettings.getState().updateSetting('date_format', selected.date_format);
    await nativeSettings.getState().updateSettings({ week_start: selected.week_start });
  }

  it('loads both preferences in a fresh store after single and bulk writes', async () => {
    await changeDisplayDates();
    expect(nativeSettings.getState().settings).toMatchObject(selected);
    preferences.setState(initial.prefs, true);
    nativeSettings.getState().resetSettings();
    await nativeSettings.getState().loadSettings();
    expect(nativeSettings.getState().settings).toMatchObject(selected);
    expect(io.updatePrefs).not.toHaveBeenCalled();
  });

  it.each(['person', 'family', 'user', 'source', 'gate'])(
    'loads the authenticated profile’s preferences after a %s change',
    async (kind) => {
      await changeDisplayDates();
      change(kind);
      nativeSettings.getState().resetSettings();
      await nativeSettings.getState().loadSettings();
      expect(nativeSettings.getState().isLoaded).toBe(true);
      expect(nativeSettings.getState().settings).toMatchObject(
        kind === 'user' || kind === 'source' ? defaults : selected
      );
    }
  );

  it('gives a different account defaults after sign-out and sign-in', async () => {
    await changeDisplayDates();
    familyAuthStore.setState({
      isAuthenticated: false,
      authGate: null,
      authUserId: null,
      personId: null,
      familyId: null,
    });
    familyAuthStore.setState({
      isAuthenticated: true,
      authGate: 'ok',
      authUserId: id(80),
      personId: id(81),
      familyId: family,
    });
    nativeSettings.getState().resetSettings();
    await nativeSettings.getState().loadSettings();
    expect(nativeSettings.getState().isLoaded).toBe(true);
    expect(nativeSettings.getState().settings).toMatchObject(defaults);
  });
  it('saves mixed display and Family fields through the single combined command', async () => {
    await nativeSettings.getState().updateSettings({ week_start: 'sunday', distance_unit: 'imperial' });
    expect(io.profileWrite).toHaveBeenCalledWith(
      { week_start: 'sunday' },
      { id: family, patch: { distanceUnit: 'imperial' } }
    );
    expect(io.updatePrefs).not.toHaveBeenCalled();
    expect(preferences.getState().settings).toMatchObject({ week_start: 'sunday', distance_unit: 'imperial' });
  });

  it('propagates a failed combined write without mutating the Family store', async () => {
    io.profileWrite.mockRejectedValueOnce(new Error('Fixture write rejected'));
    await expect(settingsApi.setBulk({ week_start: 'sunday', distance_unit: 'imperial' })).rejects.toThrow();
    expect(io.updatePrefs).not.toHaveBeenCalled();
    expect(preferences.getState().settings).toMatchObject({ week_start: DEFAULT_WEEK_START, distance_unit: 'metric' });
  });

  it('rejects an invalid date preference before sending a write', async () => {
    await expect(settingsApi.set('week_start', 1)).rejects.toThrow();
    expect(io.profileWrite).not.toHaveBeenCalled();
  });

  it('keeps a newer date save when an earlier settings read arrives late', async () => {
    const stalled = deferred<typeof defaults>();
    io.profileRead.mockReturnValueOnce(stalled.promise);
    const loading = nativeSettings.getState().loadSettings();
    await vi.waitFor(() => expect(io.profileRead).toHaveBeenCalledOnce());
    await changeDisplayDates();
    stalled.resolve(defaults);
    await loading;
    expect(nativeSettings.getState().settings).toMatchObject(selected);
  });
});

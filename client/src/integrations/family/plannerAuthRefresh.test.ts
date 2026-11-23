import { beforeEach, expect, it, vi } from 'vitest';
import { capturePlannerAuthRefresh } from './plannerAuthRefresh';
const wire = vi.hoisted(() => ({
  owner: null as null | { get: () => { trip: string; layer: string } | null },
  port: null as null | { hydrateTrip: ReturnType<typeof vi.fn> },
  trip: {} as object,
  actor: true,
  session: true,
  active: true,
  native: { isAuthenticated: true, authCheckFailed: false },
  family: { isAuthenticated: true, authCheckFailed: false, authGate: 'ok' },
}));
vi.mock('../../repo/plannerReadPort', () => ({ currentPlannerReadPort: () => wire.port }));
vi.mock('../../store/authStore', () => ({ useAuthStore: { getState: () => wire.native } }));
vi.mock('../../store/tripStore', () => ({ useTripStore: { getState: () => ({ trip: wire.trip }) } }));
vi.mock('../../sync/readSession', () => ({ captureReadSession: () => ({ current: () => wire.session }) }));
vi.mock('./actorContext', () => ({ captureFamilyActor: () => ({ current: () => wire.actor }) }));
vi.mock('./plannerBoundaryOwner', () => ({ currentPlannerBoundaryOwner: () => wire.owner }));
vi.mock('./repository', () => ({ familyAuthStore: { getState: () => wire.family } }));
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Missing test fixture');
  return value;
}
beforeEach(() => {
  wire.owner = { get: () => ({ trip: 'original-trip', layer: 'published' }) };
  wire.port = { hydrateTrip: vi.fn(async () => {}) };
  wire.trip = {};
  wire.actor = wire.session = wire.active = true;
  wire.native = { isAuthenticated: true, authCheckFailed: false };
  wire.family = { isAuthenticated: true, authCheckFailed: false, authGate: 'ok' };
  window.history.replaceState({}, '', '/trips/1');
});
it('uses a fresh complete read after retiring the old publication, never its saved authority', async () => {
  const refresh = capturePlannerAuthRefresh(() => wire.active),
    port = required(wire.port);
  required(wire.owner).get = () => null;
  await required(refresh)();
  expect(port.hydrateTrip).toHaveBeenCalledExactlyOnceWith('original-trip');
});
it.each([
  'disposed',
  'actor',
  'session',
  'owner',
  'port',
  'trip',
  'route',
  'native-signout',
  'native-failed',
  'family-signout',
  'family-failed',
  'gate',
])('refuses a delayed refresh after %s changes', async (change) => {
  const refresh = capturePlannerAuthRefresh(() => wire.active),
    port = required(wire.port);
  if (change === 'disposed') wire.active = false;
  if (change === 'actor') wire.actor = false;
  if (change === 'session') wire.session = false;
  if (change === 'owner') wire.owner = { get: () => null };
  if (change === 'port') wire.port = { hydrateTrip: vi.fn() };
  if (change === 'trip') wire.trip = {};
  if (change === 'route') window.history.replaceState({}, '', '/dashboard');
  if (change === 'native-signout') wire.native.isAuthenticated = false;
  if (change === 'native-failed') wire.native.authCheckFailed = true;
  if (change === 'family-signout') wire.family.isAuthenticated = false;
  if (change === 'family-failed') wire.family.authCheckFailed = true;
  if (change === 'gate') wire.family.authGate = 'mfa_challenge';
  await required(refresh)();
  expect(port.hydrateTrip).not.toHaveBeenCalled();
});
it.each(['owner', 'draft', 'port'])('does not fabricate a refresh for absent/private %s', (missing) => {
  if (missing === 'owner') wire.owner = null;
  if (missing === 'publication') required(wire.owner).get = () => null;
  if (missing === 'draft') required(wire.owner).get = () => ({ trip: 'original-trip', layer: 'myDraft' });
  if (missing === 'trip') wire.trip = null as unknown as object;
  if (missing === 'port') wire.port = null;
  expect(capturePlannerAuthRefresh(() => true)).toBeNull();
});
it('leaves queue/publication refusal to the complete reader and never retries automatically', async () => {
  const held = new Error('Planner refresh held for original local work');
  required(wire.port).hydrateTrip.mockRejectedValue(held);
  await expect(required(capturePlannerAuthRefresh(() => true))()).rejects.toBe(held);
  expect(required(wire.port).hydrateTrip).toHaveBeenCalledTimes(1);
});

it('restarts the guarded route load during cold Auth refresh without requiring an already published Trip', async () => {
  required(wire.owner).get = () => null;
  wire.trip = null as unknown as object;
  wire.session = false; // Auth startup may still own the anonymous database before accepting the user.
  const loadTrip = vi.fn(async () => {});
  wire.port = { loadTrip } as unknown as NonNullable<typeof wire.port>;
  await required(capturePlannerAuthRefresh(() => true))();
  expect(loadTrip).toHaveBeenCalledExactlyOnceWith('1');
});
it('does not read a stale Trip left in the store on a different route', () => {
  window.history.replaceState({}, '', '/dashboard');
  expect(capturePlannerAuthRefresh(() => true)).toBeNull();
});

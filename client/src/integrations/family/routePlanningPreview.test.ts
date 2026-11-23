import { afterEach, expect, it, vi } from 'vitest';
import { isFamilyRoutePlanningPreview, isRoutePlanningFixture } from './routePlanningPreview';
import * as sourceProfile from './coreHttpsWriterProfile';

const origin = 'http://127.0.0.1:55671';
const trip = '11555555-2222-4333-8444-555555555555';
const otherTrip = '22555555-2222-4333-8444-555555555555';

function locate(pageOrigin: string, path: string) {
  vi.stubGlobal('window', { location: { origin: pageOrigin, pathname: path } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('admits only the configured local trip', () => {
  vi.stubEnv('VITE_SUPABASE_URL', origin);
  vi.stubEnv('VITE_FAMILY_ROUTE_PLANNING_FIXTURE', trip);
  locate(origin, `/trips/${trip}`);
  expect(isFamilyRoutePlanningPreview()).toBe(true);
  expect(isRoutePlanningFixture(trip)).toBe(true);
  expect(isRoutePlanningFixture(otherTrip)).toBe(false);
});

it.each([
  ['', origin, origin, trip],
  ['fixture', origin, origin, 'fixture'],
  [trip, 'https://example.test', origin, trip],
  [trip, origin, 'https://example.test', trip],
  [trip, origin, origin, otherTrip],
])('keeps the preview off for %s / %s / %s / %s', (flag, source, pageOrigin, pathTrip) => {
  vi.stubEnv('VITE_SUPABASE_URL', source);
  vi.stubEnv('VITE_FAMILY_ROUTE_PLANNING_FIXTURE', flag);
  locate(pageOrigin, `/trips/${pathTrip}`);
  expect(isFamilyRoutePlanningPreview()).toBe(false);
});

it('admits a hosted fixture only from the integration origin with the approved API source', () => {
  const preview = 'https://familytravelsite-integration-preview.lmisael0721.workers.dev';
  vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', 'primary-core-mexico-preview-read-v1');
  vi.stubGlobal('__FAMILY_MEXICO_PREVIEW_TRIP__', trip);
  const approvedSource = vi.spyOn(sourceProfile, 'coreHttpsWriterProfileEnabled').mockReturnValue(true);
  locate(preview, `/trips/${trip}`);
  expect(isRoutePlanningFixture(trip)).toBe(true);

  locate(preview, `/trips/${otherTrip}`);
  expect(isFamilyRoutePlanningPreview()).toBe(false);
  locate('https://example.test', `/trips/${trip}`);
  expect(isFamilyRoutePlanningPreview()).toBe(false);
  locate(preview, `/trips/${trip}`);
  approvedSource.mockReturnValue(false);
  expect(isFamilyRoutePlanningPreview()).toBe(false);
});

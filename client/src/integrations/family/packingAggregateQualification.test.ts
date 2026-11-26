import { afterEach, expect, it, vi } from 'vitest';
import {
  completePreparationSource,
  offlineTripQualificationEnabled,
  packingAggregateQualificationEnabled,
  packingIdentityQualificationEnabled,
} from './offlineTripQualification';
import { createPublicVariantCache } from './publicVariantCache';
const state = vi.hoisted(() => ({ source: 'http://127.0.0.1:55731' }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => state.source }));
afterEach(() => {
  vi.unstubAllEnvs();
  state.source = 'http://127.0.0.1:55731';
});
it.each(['', 'local-v2', 'unknown'])('default or wrong aggregate flag %s leaves125 inactive', (flag) => {
  vi.stubEnv('VITE_FAMILY_PACKING_AGGREGATE_QUALIFICATION', flag);
  expect(packingAggregateQualificationEnabled()).toBe(false);
  expect(completePreparationSource(state.source, 'family.offline-trip.v3')).toBe(false);
});
it.each([
  'https://fixture.supabase.invalid',
  'http://localhost:55731',
  'http://127.0.0.1:55631',
  'http://127.0.0.1:55732',
])('explicit flag cannot activate another source %s', (source) => {
  state.source = source;
  vi.stubEnv('VITE_FAMILY_PACKING_AGGREGATE_QUALIFICATION', 'local-v3');
  expect(packingAggregateQualificationEnabled()).toBe(false);
});
it('only marked125 admits new aggregate activation and v3 preparation', () => {
  vi.stubEnv('VITE_FAMILY_PACKING_AGGREGATE_QUALIFICATION', 'local-v3');
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
  expect(packingAggregateQualificationEnabled()).toBe(true);
  expect(offlineTripQualificationEnabled()).toBe(true);
  expect(packingIdentityQualificationEnabled()).toBe(false);
  expect(completePreparationSource(state.source, 'family.offline-trip.v3')).toBe(true);
  expect(completePreparationSource(state.source, 'family.offline-trip.v2')).toBe(false);
});
it('124 identity and older preparation source contracts remain separate', () => {
  state.source = 'http://127.0.0.1:55631';
  vi.stubEnv('VITE_FAMILY_PACKING_IDENTITY_QUALIFICATION', 'local-v2');
  expect(packingIdentityQualificationEnabled()).toBe(true);
  expect(packingAggregateQualificationEnabled()).toBe(false);
  expect(completePreparationSource(state.source, 'family.offline-trip.v3')).toBe(true);
  expect(completePreparationSource('http://127.0.0.1:55331', 'family.offline-trip.v1')).toBe(true);
});

it('new public-byte cache source stays125-only and explicitly qualified', () => {
  expect(() => createPublicVariantCache({ source: state.source })).toThrow();
  vi.stubEnv('VITE_FAMILY_PACKING_AGGREGATE_QUALIFICATION', 'local-v3');
  expect(() => createPublicVariantCache({ source: state.source })).not.toThrow();
  for (const source of ['http://localhost:55731', 'https://fixture.supabase.invalid', 'http://127.0.0.1:55732'])
    expect(() => createPublicVariantCache({ source })).toThrow();
});

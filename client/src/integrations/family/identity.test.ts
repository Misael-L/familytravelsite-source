import { describe, expect, it } from 'vitest';
import { FamilyIdentityRegistry } from './identity';
const scope = '11111111-1111-4111-8111-111111111111';
const trip = '22222222-2222-4222-8222-222222222222';
const day = '33333333-3333-4333-8333-333333333333';
describe('Family presentation identity boundary', () => {
  it('keeps UUIDs intact while upstream numeric view keys remain stable across order and reload', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const first = new FamilyIdentityRegistry(scope, storage);
    const tripKey = first.register('trip', trip);
    first.register('day', day);
    const next = new FamilyIdentityRegistry(scope, storage);
    expect(next.register('trip', trip)).toBe(tripKey);
    expect(next.uuid('trip', tripKey)).toBe(trip);
    expect(next.uuid('trip', trip)).toBe(trip);
    expect(next.canonicalTripPath(`/trips/${tripKey}`)).toBe(`/trips/${trip}`);
  });
  it('rejects unknown and cross-kind keys before a backend operation', () => {
    const registry = new FamilyIdentityRegistry(scope);
    const key = registry.register('day', day);
    expect(() => registry.uuid('trip', key)).toThrow('unknown_view_key');
    expect(() => registry.uuid('trip', 1)).toThrow('unknown_view_key');
    expect(() => registry.register('trip', 'NaN')).toThrow('invalid_uuid');
  });
  it('rejects collisions rather than assigning another record to an existing view key', () => {
    const registry = new FamilyIdentityRegistry(scope, undefined, () => 1);
    registry.register('trip', trip);
    expect(() => registry.register('day', day)).toThrow('collision');
    expect(registry.uuid('trip', 1)).toBe(trip);
  });
  it('does not share identity lookup state between Family sessions', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const first = new FamilyIdentityRegistry(scope, storage);
    const key = first.register('trip', trip);
    const second = new FamilyIdentityRegistry(day, storage);
    expect(() => second.uuid('trip', key)).toThrow('unknown_view_key');
  });
});

// Two logins linked to one person must not share the copied frontend's offline DB key.
it('scopes view keys to the authenticated account as well as the entity kind', () => {
  const person = '00000000-0000-4000-8000-000000000099';
  const first = new FamilyIdentityRegistry('00000000-0000-4000-8000-000000000001');
  const second = new FamilyIdentityRegistry('00000000-0000-4000-8000-000000000002');
  expect(first.register('person', person)).not.toBe(second.register('person', person));
});

it('scope matching is presentation-only and refuses another actor or malformed identity', () => {
  const actor = '11111111-1111-4111-8111-111111111111';
  const ids = new FamilyIdentityRegistry(actor);
  expect(ids.isScopedTo(actor.toUpperCase())).toBe(true);
  expect(ids.isScopedTo('22222222-2222-4222-8222-222222222222')).toBe(false);
  expect(ids.isScopedTo('not-an-actor')).toBe(false);
});

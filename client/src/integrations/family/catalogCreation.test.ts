import type { CatalogHit } from '@family/backend/supabase/catalogDiscovery';
import { describe, expect, it } from 'vitest';
import { placeFormPayload, prefillForm } from '../../components/Planner/PlaceFormModal.helpers';
import type { PlaceSubmitData } from '../../types/placeForm';
import { catalogLocationCreate } from './catalogCreation';
import { FamilyIdentityRegistry } from './identity';
import type { FormValues } from './locationFormContract';
import { nativeLocationValues } from './nativeLocationForm';
const id = 'f5000000-0000-4000-8000-000000000001';
const hit: CatalogHit = {
  id,
  kind: 'food',
  name: 'Restaurant',
  latitude: 19.4,
  longitude: -99.1,
  address: 'Venue address',
  website: null,
  phone: null,
  description: 'Catalog description',
  typeLabel: 'Restaurant',
  contextPlaceId: 'f5000000-0000-4000-8000-000000000002',
  countryId: null,
  thumbUrl: null,
  heroUrl: null,
};
const blank: FormValues = {
  name: '',
  description: null,
  notes: null,
  address: null,
  website: null,
  phone: null,
  latitude: null,
  longitude: null,
  family_place_category_id: null,
};
const ids = new FamilyIdentityRegistry('f5000000-0000-4000-8000-000000000003');
const form = (over: Partial<PlaceSubmitData> = {}) =>
  ({
    name: 'Restaurant',
    description: '',
    notes: '',
    address: 'Venue address',
    website: '',
    lat: 19.4,
    lng: -99.1,
    category_id: '',
    transport_mode: 'walking',
    osm_id: 'catalog:food:' + id,
    ...over,
  }) as PlaceSubmitData;
describe('catalog inheritance and per-Trip overrides', () => {
  it('keeps description inherited and Trip notes separate', () => {
    expect(catalogLocationCreate(form(), hit, ids, blank)).toEqual({
      source: { kind: 'food', id },
      notes: null,
      family_place_category_id: null,
    });
  });
  it('stores intentional per-Trip overrides without writing shared catalog data', () => {
    expect(
      catalogLocationCreate(
        form({ name: 'Our dinner', notes: 'Ask for patio', description: '', fieldOrigins: { description: 'user' } }),
        hit,
        ids,
        blank
      )
    ).toMatchObject({
      source: { kind: 'food', id },
      label: 'Our dinner',
      description_override: '',
      notes: 'Ask for patio',
    });
  });
  it('refuses original/transform photo choices and disconnected upload fields', () => {
    for (const image_url of [
      'https://catalog.example.invalid/original.jpg',
      'https://catalog.example.invalid/storage/v1/render/image/public/catalog/x',
    ])
      expect(() => catalogLocationCreate(form({ image_url }), hit, ids, blank)).toThrow();
    expect(() => catalogLocationCreate(form({ _pendingFiles: [new File(['x'], 'x.txt')] }), hit, ids, blank)).toThrow();
  });
  it('retains a known catalog identity on edits while refusing reassociation', () => {
    expect(
      nativeLocationValues(form(), { shown: blank }, { image_url: null, osm_id: 'catalog:food:' + id }, ids).name
    ).toBe('Restaurant');
    expect(() =>
      nativeLocationValues(
        form({ osm_id: 'catalog:hotel:' + id }),
        { shown: blank },
        { image_url: null, osm_id: 'catalog:food:' + id },
        ids
      )
    ).toThrow();
  });
});

it('accepts the actual native POI payload with absent duration, but refuses a real unsupported duration', () => {
  const opened = prefillForm(
    { name: hit.name, lat: hit.latitude, lng: hit.longitude, osm_id: 'catalog:food:' + id, address: hit.address! },
    { stop_type: null, duration_minutes: undefined }
  );
  const payload = placeFormPayload(opened, [], null);
  expect(Object.prototype.hasOwnProperty.call(payload, 'duration_minutes')).toBe(true);
  expect(catalogLocationCreate(payload, hit, ids, blank)).toMatchObject({ source: { kind: 'food', id }, notes: null });
  expect(() => catalogLocationCreate({ ...payload, duration_minutes: 90 }, hit, ids, blank)).toThrow(
    /duration_minutes/
  );
});

it('refuses silently clearing an inherited catalog image without a supported override contract', () => {
  const hero = 'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/fixture/hero.webp';
  const ready = { ...hit, heroUrl: hero };
  expect(catalogLocationCreate(form(), ready, ids, blank).source).toEqual({ kind: 'food', id });
  expect(catalogLocationCreate(form({ image_url: hero }), ready, ids, blank).source).toEqual({ kind: 'food', id });
  expect(() => catalogLocationCreate(form({ image_url: null }), ready, ids, blank)).toThrow(/image_url/);
  expect(catalogLocationCreate(form({ image_url: null }), hit, ids, blank).source).toEqual({ kind: 'food', id });
});

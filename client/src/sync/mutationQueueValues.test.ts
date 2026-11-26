import { describe, expect, it } from 'vitest';
import type { QueuedMutation } from '../db/offlineDb';
import {
  bodyToSend,
  doneByNotFound,
  entityKey,
  extractConflictServer,
  isRetryableStatus,
  remapBodyRefs,
} from './mutationQueueValues';

function mutation(patch: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: '00000000-0000-4000-8000-000000000014',
    tripId: 1,
    method: 'POST',
    url: '/trips/1/places',
    body: {},
    createdAt: 1,
    status: 'pending',
    attempts: 0,
    lastError: null,
    ...patch,
  };
}

describe('queue value boundaries without IO', () => {
  it('keeps zero target ids ahead of temporary ids and separates resource identities', () => {
    expect(entityKey(mutation({ resource: 'places', entityId: 0, tempEntityId: -2, tempId: -3 }))).toBe('places:0');
    expect(entityKey(mutation({ resource: 'reservations', entityId: 0 }))).toBe('reservations:0');
  });

  it('uses the offline-create identity only for POST and leaves unscoped rows without a key', () => {
    expect(entityKey(mutation({ resource: 'places', tempId: -3 }))).toBe('places:-3');
    expect(entityKey(mutation({ resource: 'places', method: 'PATCH', tempId: -3 }))).toBeUndefined();
    expect(entityKey(mutation({ resource: 'places', method: 'PATCH', tempEntityId: -2, tempId: -3 }))).toBe(
      'places:-2'
    );
    expect(entityKey(mutation({ entityId: 5 }))).toBeUndefined();
  });

  it('keeps current conflict objects by identity and distinguishes absent from explicit undefined server data', () => {
    const server = Object.freeze({ id: 2, updated_at: 'current' });
    expect(extractConflictServer({ response: { data: { server } } })).toBe(server);
    expect(extractConflictServer({ response: { data: { server: undefined } } })).toBeUndefined();
    expect(extractConflictServer({ response: { data: {} } })).toBeNull();
    expect(extractConflictServer({ response: { data: { server: null } } })).toBeNull();
    expect(extractConflictServer(null)).toBeNull();
  });

  it('preserves unchanged bodies and opaque primitive/array payloads by identity', () => {
    const ids = new Map([[-1, 11]]),
      array = Object.freeze([-1]),
      body = Object.freeze({ place_id: 3, unrelated_id: -1 });
    for (const value of [null, undefined, false, 0, 'opaque', array, body]) {
      expect(remapBodyRefs(value, ids)).toBe(value);
      expect(bodyToSend(value, ids)).toBe(value);
    }
  });

  it('copies only changed supported links and lists while retaining unrelated references and original input', () => {
    const nested = Object.freeze({ place_id: -1, name: 'Hotel' }),
      unrelated = Object.freeze({ place_id: -1 });
    const orderedIds = Object.freeze([-2, -8, 0, '-1', 5]);
    const body = Object.freeze({
      place_id: -1,
      reservation_id: -2,
      accommodation_id: 5,
      create_accommodation: nested,
      unrelated,
      orderedIds,
    });
    const ids = new Map([
      [-1, 11],
      [-2, 22],
      [5, 55],
    ]);
    const savedIds = [...ids];
    const result = remapBodyRefs(body, ids);
    expect(result).toEqual({
      place_id: 11,
      reservation_id: 22,
      accommodation_id: 5,
      create_accommodation: { place_id: 11, name: 'Hotel' },
      unrelated,
      orderedIds: [22, -8, 0, '-1', 55],
    });
    expect(result).not.toBe(body);
    if (!result || typeof result !== 'object' || !('unrelated' in result)) throw new Error('Expected a mapped object');
    expect(result.unrelated).toBe(unrelated);
    expect(body.place_id).toBe(-1);
    expect(body.create_accommodation).toBe(nested);
    expect(body.orderedIds).toBe(orderedIds);
    expect([...ids]).toEqual(savedIds);
  });

  it('trims unresolved visit-list ids without deleting an unresolved scalar reference or mutating the body', () => {
    const orderedIds = Object.freeze([-2, -99, 0, 4, 'manual']);
    const body = Object.freeze({ place_id: -99, orderedIds });
    expect(bodyToSend(body, new Map([[-2, 22]]))).toEqual({ place_id: -99, orderedIds: [22, 4, 'manual'] });
    expect(body.orderedIds).toBe(orderedIds);
    expect(body.orderedIds).toEqual([-2, -99, 0, 4, 'manual']);
  });

  it('retains a zero list entry when the original negative-id trimming condition does not apply', () => {
    const body = Object.freeze({ orderedIds: Object.freeze([0, 4, 'manual']) });
    expect(bodyToSend(body, new Map())).toBe(body);
  });

  it('keeps transient timeouts/too-early responses distinct from authorization and edit-conflict refusals', () => {
    expect(isRetryableStatus(401)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(425)).toBe(true);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(409)).toBe(false);
    expect(isRetryableStatus(undefined)).toBe(false);
    expect(isRetryableStatus(500)).toBe(false);
  });

  it('does not turn a disabled addon or unrelated resource 404 into successful settlement', () => {
    expect(
      doneByNotFound(mutation({ resource: 'tourStationVisits' }), {
        response: { data: { error: 'Tours addon disabled' } },
      })
    ).toBe(false);
    expect(
      doneByNotFound(mutation({ resource: 'places' }), { response: { data: { error: 'Station not found' } } })
    ).toBe(false);
  });
  it.each(['Trip not found', 'Assignment not found', 'City walk not found', 'Station not found'])(
    'settles a missing station-visit ancestor on 404: %s',
    (reason) => {
      expect(
        doneByNotFound(mutation({ resource: 'tourStationVisits' }), { response: { data: { error: reason } } })
      ).toBe(true);
    }
  );

  it('settles an already-absent DELETE without requiring a station-visit body', () => {
    expect(doneByNotFound(mutation({ method: 'DELETE', resource: 'places' }), undefined)).toBe(true);
  });
});

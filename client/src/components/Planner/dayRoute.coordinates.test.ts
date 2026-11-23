import { describe, expect, it } from 'vitest';
import { buildAssignment, buildDay, buildPlace } from '../../../tests/helpers/factories';
import { dayExportStops, optimizeDayOrder } from './dayRoute';

const day = buildDay({ id: 20, day_number: 2 });
const stop = (id: number, lat: number, lng: number, time: string | null = null) =>
  buildAssignment({ id, day_id: day.id, place: buildPlace({ id, name: 'Stop ' + id, lat, lng, place_time: time }) });

describe('day-route coordinate and identity contract', () => {
  it.each([
    [0, 0],
    [-0, 3],
    [Number.NaN, 1],
    [1, Number.NaN],
    [Number.POSITIVE_INFINITY, 1],
    [1, Number.NEGATIVE_INFINITY],
  ])('preserves the existing non-null coordinate domain for %s,%s', (lat, lng) => {
    const a = stop(1, lat, lng);
    expect(dayExportStops(day, [day], [a], [], false)).toEqual([{ lat, lng, name: 'Stop 1' }]);
  });
  it.each([
    undefined,
    null,
    buildPlace({ lat: null, lng: 2 }),
    buildPlace({ lat: 1, lng: null }),
    buildPlace({ lat: undefined, lng: undefined }),
  ])('omits a missing place or coordinate without dropping the next located stop: %j', (place) => {
    const a = buildAssignment({ id: 1, day_id: day.id, ...(place === null ? {} : { place }) });
    if (place === null) {
      // Inject the malformed value after the factory has populated the assignment.
      Object.defineProperty(a, 'place', { value: null });
    }
    const b = stop(2, 10, 20);
    expect(dayExportStops(day, [day], [a, b], [], false)).toEqual([{ lat: 10, lng: 20, name: 'Stop 2' }]);
  });
  it('retains the existing first-match lookup for duplicate assignment IDs without cloning', () => {
    const first = stop(7, 10, 10);
    const second = stop(7, 10, 20);
    const inputs = [first, second];
    const before = structuredClone(inputs);
    const result = optimizeDayOrder(day, [day], inputs, [], false);
    expect(result?.order).toHaveLength(2);
    expect(result?.order[0]).toBe(first);
    expect(result?.order[1]).toBe(first);
    expect(result?.usedHotel).toBe(false);
    expect(inputs).toEqual(before);
  });
  it('preserves timed slots and the identities and metadata of reordered and unlocated assignments', () => {
    const timed = stop(9, 40, 40, '08:00');
    const missing = buildAssignment({ id: 8, day_id: day.id, notes: 'Keep this note', place: undefined });
    const a = stop(3, 10, 10);
    const b = stop(4, 10, 30);
    const c = stop(5, 10, 20);
    const inputs = [timed, missing, a, b, c];
    const before = structuredClone(inputs);
    const result = optimizeDayOrder(day, [day], inputs, [], false);
    expect(result?.order).toHaveLength(inputs.length);
    for (const [index, item] of [timed, a, c, b, missing].entries()) expect(result?.order[index]).toBe(item);
    expect(inputs).toEqual(before);
  });
});

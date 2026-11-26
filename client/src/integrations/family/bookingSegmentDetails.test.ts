import { describe, expect, it } from 'vitest';
import { buildReservation } from '../../../tests/helpers/factories';
import { bookingFacts, type FactsContext } from '../../components/Planner/bookings/bookingFacts';
import { searchText } from '../../components/Planner/bookings/bookingsModel';
import { getFlightLegs, getTrainLegs } from '../../utils/flightLegs';
import { getFlightLegs as legacyFlightLegs, getTrainLegs as legacyTrainLegs } from './legacy/utils/flightLegs';

const ctx: FactsContext = {
  t: (key) => key,
  locale: 'en-US',
  timeFormat: '24h',
  days: [],
  assignmentLookup: {},
  hasLinkedCost: false,
};
const variants = [
  ['flight', getFlightLegs, legacyFlightLegs],
  ['train', getTrainLegs, legacyTrainLegs],
] as const;

describe.each(variants)('%s segment details', (type, native, legacy) => {
  it.each([
    { name: 'null', invalid: null },
    { name: 'a number', invalid: 42 },
    { name: 'an array', invalid: [] },
  ])('uses the booking details when a stored leg is $name', ({ invalid }) => {
    const fields = {
      departure_airport: 'JFK',
      arrival_airport: 'SFO',
      train_number: 'ICE 84',
      platform: '3',
      seat: '12',
    };
    const fallback = buildReservation({
      type,
      day_id: 11,
      end_day_id: 17,
      confirmation_number: 'BOOKING-REF',
      metadata: JSON.stringify(fields),
    });
    const metadata = JSON.stringify({
      ...fields,
      legs: [{ from: 'ORD', confirmation_number: 'SEGMENT-REF' }, invalid],
    });
    const damaged = { ...fallback, metadata };

    expect(native(damaged)).toEqual(native(fallback));
    expect(legacy(damaged)).toEqual(legacy(fallback));
    expect(native(damaged)).toMatchObject([{ confirmation_number: 'BOOKING-REF', dep_day_id: 11, arr_day_id: 17 }]);
    expect(bookingFacts(damaged, ctx).legCodes).toEqual([]);
    const indexed = searchText(damaged, type);
    expect(indexed).toContain('booking-ref');
    expect(indexed).toContain('segment-ref');
    expect(damaged.metadata).toBe(metadata);
  });

  it('keeps stored sequence and individual references when all segments are valid', () => {
    const metadata = JSON.stringify(
      JSON.stringify({
        legs: [
          { from: 'Bravo', to: 'Charlie', confirmation_number: 'SEGMENT-ONE' },
          { from: 'Alpha', to: 'Bravo', confirmation_number: 'SEGMENT-TWO' },
        ],
      })
    );
    const trip = buildReservation({ type, confirmation_number: 'BOOKING-REF', metadata });

    expect(native(trip).map((leg) => leg.from)).toEqual(['Bravo', 'Alpha']);
    expect(legacy(trip).map((leg) => leg.from)).toEqual(['Bravo', 'Alpha']);
    expect(bookingFacts(trip, ctx).legCodes).toEqual([
      { route: 'Bravo → Charlie', code: 'SEGMENT-ONE' },
      { route: 'Alpha → Bravo', code: 'SEGMENT-TWO' },
    ]);
    expect(searchText(trip, type)).toContain('segment-one segment-two');
  });
});

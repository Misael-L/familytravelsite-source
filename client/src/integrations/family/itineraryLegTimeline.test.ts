import { describe, expect, it } from 'vitest';
import { getTransportForDay as nativeForDay } from '../../utils/dayMerge';
import { getTransportForDay as legacyForDay } from './legacy/utils/dayMerge';

const days = [
  { id: 61, day_number: 1, date: '2026-09-10' },
  { id: 12, day_number: 2, date: null },
  { id: 5, day_number: 3, date: '2026-09-12' },
  { id: 77, day_number: 4, date: '2026-09-13' },
];
const timelines = [
  ['native', nativeForDay],
  ['legacy', legacyForDay],
] as const;

describe.each(timelines)('%s itinerary transport leg projection', (_name, forDay) => {
  const rows = (booking: unknown, dayId: number) =>
    forDay({ reservations: [booking], dayId, dayAssignmentIds: [], days });

  it('keeps train legs on all spanned days with their own position and train details', () => {
    const metadata = {
      legs: [
        {
          from: 'Berlin',
          to: 'Vienna',
          dep_day_id: 61,
          arr_day_id: 5,
          dep_time: '22:15',
          arr_time: '07:25',
          day_positions: { 12: 0.75 },
          train_number: 'NJ 404',
          platform: '4',
          seat: '12',
        },
        { from: 'Vienna', to: 'Graz', dep_day_id: 5, dep_time: '09:15' },
      ],
    };
    const booking = {
      id: 19,
      type: 'train',
      day_id: 61,
      end_day_id: 5,
      day_positions: { 12: 9 },
      day_plan_position: 4,
      metadata: JSON.stringify(JSON.stringify(metadata)),
    };

    const first = {
      day_id: 61,
      end_day_id: 5,
      reservation_time: '2026-09-10T22:15',
      reservation_end_time: '2026-09-12T07:25',
      day_positions: { 12: 0.75 },
      day_plan_position: undefined,
      __leg: { index: 0, total: 2, from: 'Berlin', to: 'Vienna', train_number: 'NJ 404', platform: '4', seat: '12' },
    };
    expect(rows(booking, 61)).toMatchObject([first]);
    const projected = rows(booking, 12);
    expect(projected).toMatchObject([first]);
    expect(rows(booking, 5)).toMatchObject([
      first,
      {
        day_id: 5,
        end_day_id: 5,
        reservation_time: '2026-09-12T09:15',
        reservation_end_time: null,
        day_positions: undefined,
        __leg: { index: 1, total: 2, from: 'Vienna', to: 'Graz', train_number: null, platform: null, seat: null },
      },
    ]);
    expect(rows(booking, 77)).toEqual([]);
    expect(booking.day_positions).toEqual({ 12: 9 });
    expect(booking.day_plan_position).toBe(4);
  });

  it('uses the booking day and bare local time when a flight leg has no dates', () => {
    const booking = {
      id: 20,
      type: 'flight',
      day_id: 12,
      end_day_id: 5,
      metadata: {
        legs: [
          { dep_time: '08:35', from: 'JFK', to: 'ORD', airline: 'UA', flight_number: '213', platform: 'unused' },
          { dep_day_id: 5, from: 'ORD', to: 'SFO' },
        ],
      },
    };

    const projected = rows(booking, 12);
    expect(projected).toMatchObject([
      { day_id: 12, end_day_id: 12, reservation_time: '08:35', reservation_end_time: null },
    ]);
    expect(projected[0].__leg).toEqual({
      index: 0,
      total: 2,
      from: 'JFK',
      to: 'ORD',
      airline: 'UA',
      flight_number: '213',
    });
  });

  it.each([
    { name: 'null', malformed: null },
    { name: 'a string', malformed: 'unusable' },
    { name: 'an array', malformed: [] },
  ])('retains the booking when a stored leg is $name', ({ malformed }) => {
    const booking = {
      id: 21,
      type: 'flight',
      day_id: 61,
      end_day_id: 5,
      metadata: JSON.stringify({ legs: [{ dep_day_id: 61, from: 'JFK', to: 'ORD' }, malformed] }),
    };

    const projected = rows(booking, 61);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toBe(booking);
  });
});

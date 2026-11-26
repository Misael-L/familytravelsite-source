// organize-imports-ignore
// sort-imports-ignore
// Initialize the existing cohort mocks before importing the planner.
import '../../../tests/helpers/familyPlannerCohort/state';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { expect, it } from 'vitest';
import { bookingFixture, contentSetup } from '../../../tests/helpers/familyPlannerCohort/contents';
import { load, required } from '../../../tests/helpers/familyPlannerCohort/core';
import { cohortState, day, uuid } from '../../../tests/helpers/familyPlannerCohort/state';
import {
  groupReservations,
  groupTransports,
  sortReservations,
  startKey,
} from '../../components/Planner/bookings/bookingsModel';
import { useTripStore } from '../../store/tripStore';

const departureDate = '2027-03-30';
const headerDate = '2027-03-31';
const recordedMidnight = '2027-04-01T00:00:00.000Z';
const labels = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  transit: 'Transit',
  before: 'Before the trip',
  after: 'After the trip',
  undated: 'Undated',
  dayN: (number: number) => 'Day ' + number,
  typeLabel: (type: string) => type,
  dayDate: (date: string) => date,
};

type Scenario = {
  name: string;
  endpointDate: string | null;
  role: 'from' | 'to';
  expectedDate?: string;
  header?: string;
  start?: string;
  linked?: boolean;
};

const cases: Scenario[] = [
  {
    name: 'uses a date-only departure without coordinates',
    endpointDate: departureDate,
    role: 'from',
    expectedDate: departureDate,
  },
  {
    name: 'honors an explicit header date',
    endpointDate: departureDate,
    role: 'from',
    header: headerDate,
    expectedDate: headerDate,
  },
  {
    name: 'honors a genuine midnight',
    endpointDate: departureDate,
    role: 'from',
    header: headerDate,
    start: recordedMidnight,
    expectedDate: '2027-04-01',
  },
  { name: 'honors a linked trip day', endpointDate: departureDate, role: 'from', linked: true },
  { name: 'leaves an arrival-only transport undated', endpointDate: departureDate, role: 'to' },
  { name: 'leaves a transport undated with a missing departure date', endpointDate: null, role: 'from' },
  { name: 'leaves a transport undated with an invalid departure date', endpointDate: '2027-02-30', role: 'from' },
];

it.each(cases)('$name', async (scenario) => {
  await contentSetup();
  const { linked, start = null } = scenario;
  const transport = bookingFixture({
    title: 'Family transport',
    type: 'flight',
    starts_at: start,
    start_trip_day_id: linked ? day : null,
    created_at: '2026-11-10T12:00:00.000Z',
  });
  if (!linked) transport.dates.start_date = scenario.header ?? null;
  transport.endpoints = [
    {
      id: uuid(9710),
      reservation_id: transport.record.id,
      role: scenario.role,
      sequence: 0,
      name: 'Airport',
      code: 'FROM',
      airport_id: null,
      place_id: null,
      latitude: null,
      longitude: null,
      time_zone: 'America/Los_Angeles',
      local_date: scenario.endpointDate,
      local_time: null,
    },
  ];
  const undated = bookingFixture({
    id: uuid(9701),
    title: 'Undated transport',
    type: 'train',
    created_at: '2026-11-09T12:00:00.000Z',
  });
  cohortState.bookingRows = [transport, undated];
  const originalRows = structuredClone(cohortState.bookingRows);

  await load();

  const { reservations, days } = useTripStore.getState();
  const held = required(reservations.find((reservation) => reservation.title === transport.record.title));
  const expectedDate = linked ? transport.dates.start_date : (scenario.expectedDate ?? null);
  const recordedDate = start?.slice(0, 10) ?? transport.dates.start_date;
  expect(held.reservation_time).toBe(start ?? transport.dates.start_date);
  expect(held.endpoints).toEqual([]);
  expect(startKey(held, days)).toBe(recordedDate && recordedDate + 'T00:00');
  expect(cohortState.bookingRows).toEqual(originalRows);
  const expected = expectedDate
    ? [transport.record.title, undated.record.title]
    : [undated.record.title, transport.record.title];

  const sorted = sortReservations(reservations, { days, by: 'date', dir: 'asc', labelOf: labels.typeLabel });
  expect(sorted.map((reservation) => reservation.title)).toEqual(expected);
  expect(groupTransports(reservations, days).confirmed.map((reservation) => reservation.title)).toEqual(expected);

  const groups = groupReservations(sorted, { days, by: 'day', tripStart: null, tripEnd: null, labels });
  const matchingDay = days.find((candidate) => candidate.date === expectedDate);
  expect(groups.find((group) => group.items.includes(held))?.id).toBe(
    matchingDay ? 'day-' + matchingDay.id : expectedDate ? 'date-' + expectedDate : 'undated'
  );
});

import { z } from 'zod';
import type { CompleteTripData } from './completeTripSnapshot';
import { taskTimestamp } from './taskContract';
const civil = z
  .string()
  .date()
  .refine((s) => s >= '0001-01-01');
function zone(value: string | null) {
  if (value !== null) new Intl.DateTimeFormat('en-US', { timeZone: value });
}
function local(value: string | null | undefined) {
  if (value == null) return;
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/.test(value))
    throw new Error('Invalid local clock');
  civil.parse(value.slice(0, 10));
}
/** Validate clocks without Date round-tripping away PostgreSQL microseconds or named zones. */
export function checkCompleteTripDates(data: CompleteTripData) {
  const state = data.planner.view.state;
  for (const row of state.days) {
    civil.parse(row.civil_day);
    taskTimestamp.parse(row.updated_at);
  }
  for (const row of state.notes) {
    civil.parse(row.civil_day);
    taskTimestamp.parse(row.updated_at);
  }
  for (const row of state.locations) {
    zone(row.time_zone);
    taskTimestamp.parse(row.created_at);
    taskTimestamp.parse(row.updated_at);
  }
  for (const row of state.visits) {
    zone(row.time_zone);
    taskTimestamp.parse(row.updated_at);
    local(row.start_local);
    local(row.end_local);
    for (const clock of [row.starts_at, row.ends_at]) if (clock !== null) taskTimestamp.parse(clock);
  }
  for (const row of data.booking.bookings) {
    for (const date of [row.dates.start_date, row.dates.end_date]) if (date !== null) civil.parse(date);
    for (const clock of [row.record.starts_at, row.record.ends_at]) if (clock !== null) taskTimestamp.parse(clock);
    for (const endpoint of row.endpoints) {
      zone(endpoint.time_zone);
      if (endpoint.local_date !== null) civil.parse(endpoint.local_date);
      if (endpoint.local_time !== null) local('2000-01-01T' + endpoint.local_time);
    }
  }
}

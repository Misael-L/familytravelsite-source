import type { ReservationEndpoint } from '../../types';

type TimedEndpoint = Pick<ReservationEndpoint, 'local_date' | 'local_time' | 'timezone'>;

function parseInTz(isoLocal: string, tz: string): number {
  const [datePart, timePart] = isoLocal.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = (timePart || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // A malformed date/time (e.g. an imported booking whose time is missing its
  // minutes) makes Date.UTC NaN; bail before formatToParts, which throws on a
  // non-finite date and would blank the whole trip. formatTransportDuration's finiteness
  // check then drops the duration cleanly.
  if (!Number.isFinite(guess)) return Number.NaN;
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    // Imported endpoint time zones may be invalid. The duration can be omitted.
    if (error instanceof RangeError) return Number.NaN;
    throw error;
  }
  const parts = Object.fromEntries(
    fmt
      .formatToParts(new Date(guess))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return guess - (asUtc - guess);
}

function datedTransportTimes(
  from: TimedEndpoint,
  to: TimedEndpoint,
  fallbackStart: string | null,
  fallbackEnd: string | null
): [string, string] | null {
  let start = from.local_date && from.local_time ? `${from.local_date}T${from.local_time}` : fallbackStart;
  let end = to.local_date && to.local_time ? `${to.local_date}T${to.local_time}` : fallbackEnd;
  if (!start || !end) return null;

  if (!start.includes('T') && end.includes('T')) start = `${end.split('T')[0]}T${start}`;
  if (!end.includes('T') && start.includes('T')) end = `${start.split('T')[0]}T${end}`;
  if (!start.includes('T') || !end.includes('T')) return null;
  return [start, end];
}

/** "2h 5m" between the two ends, read in their own time zones; null when it cannot be told. */
export function formatTransportDuration(
  from: TimedEndpoint,
  to: TimedEndpoint,
  fallbackStart: string | null,
  fallbackEnd: string | null
): string | null {
  const times = datedTransportTimes(from, to, fallbackStart, fallbackEnd);
  if (!times) return null;
  const [start, end] = times;

  const fromTz = from.timezone || to.timezone;
  const toTz = to.timezone || fromTz;

  let startMs: number, endMs: number;
  if (fromTz && toTz) {
    startMs = parseInTz(start, fromTz);
    endMs = parseInTz(end, toTz);
  } else {
    startMs = new Date(start).getTime();
    endMs = new Date(end).getTime();
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  if (endMs <= startMs) endMs += 24 * 60 * 60000;
  const minutes = Math.round((endMs - startMs) / 60000);
  if (minutes <= 0 || minutes > 48 * 60) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Uses the renderer's waypoint order and still shows distance when duration is absent. */
export function formatTransportLabels(
  waypoints: readonly Pick<ReservationEndpoint, 'code'>[],
  duration: string | null,
  distanceKm: number
): { mainLabel: string | null; subLabel: string } {
  const fromCode = waypoints[0]?.code;
  const toCode = waypoints[waypoints.length - 1]?.code;
  let mainLabel: string | null = null;
  if (fromCode && toCode) {
    mainLabel = waypoints.every((waypoint) => waypoint.code)
      ? waypoints.map((waypoint) => waypoint.code).join(' → ')
      : `${fromCode} → ${toCode}`;
  }

  const distance = `${Math.round(distanceKm)} km`;
  return { mainLabel, subLabel: duration ? `${duration} · ${distance}` : distance };
}

import type { Assignment, Day, DayNote, Place, Reservation } from '../../types';
import type { MergedItem } from '../../utils/dayMerge';
import { projectFamilyDayTimeline } from './legacy/components/Planner/family/familyDayTimeline';
import type { FamilyScheduleItem } from './legacy/data/supabase/scheduleItems';
import type { FamilyTransportReservation, FamilyTripReservation } from './legacy/data/supabase/tripReservations';
import { familyFrontend } from './repository';
/** Apply the accepted Family civil-clock/endpoint/span contract to the copied row presentation. */
export function familyTimelineDay(
  input: {
    days: Day[];
    assignments: Record<string, Assignment[]>;
    dayNotes: Record<string, DayNote[]>;
    reservations: Reservation[];
    places: Place[];
  },
  dayKey: number
): { items: MergedItem[]; pills: Reservation[] } | null {
  const v = familyFrontend.knownViews();
  if (!v) return null;
  const day = input.days.find((d) => d.id === dayKey);
  if (!day) return null;
  const assignments = Object.values(input.assignments).flat() as Array<
    Assignment & { family_record?: FamilyScheduleItem }
  >;
  const bookings = input.reservations as Array<
    Reservation & { family_record?: FamilyTripReservation | FamilyTransportReservation }
  >;
  const canonical = bookings.flatMap((r) => (r.family_record ? [r.family_record] : []));
  const tripId = v.ids.uuid('trip', day.trip_id!);
  const days = input.days.map((d) => ({
    id: v.ids.uuid('day', d.id),
    tripId,
    civilDay: d.date!,
    dayIndex: (d.day_number ?? 1) - 1,
    title: d.title ?? null,
  }));
  const projected = projectFamilyDayTimeline({
    days,
    scheduleItems: assignments.flatMap((a) => (a.family_record ? [a.family_record] : [])),
    notes: [],
    bookings: canonical.filter((r): r is FamilyTripReservation => 'scheduleItemId' in r),
    transports: canonical.filter((r): r is FamilyTransportReservation => 'endpoints' in r),
    placesById: new Map(),
  });
  const result = projected.find((p) => p.dayId === v.ids.uuid('day', dayKey));
  if (!result) return null;
  const reservation = (row: (typeof result.rows)[number]) => {
    const original = bookings.find((r) => r.family_record?.id === row.id);
    if (!original) return null;
    const phase =
      row.phase === 'pill'
        ? 'middle'
        : row.phase === 'arrive' || row.phase === 'end'
          ? 'end'
          : row.phase === 'depart' || row.phase === 'start'
            ? 'start'
            : 'single';
    const clock =
      row.minutes === null
        ? null
        : `${day.date}T${String(Math.floor(row.minutes / 60)).padStart(2, '0')}:${String(row.minutes % 60).padStart(2, '0')}`;
    return {
      ...original,
      __family_span_phase: phase,
      __family_clock: clock,
      __family_clock_label: row.clockLabel ?? '',
      __family_endpoint_id: row.endpointId,
      __family_phase_label: row.phase === 'stop' ? 'Stop' : undefined,
    };
  };
  const items: MergedItem[] = result.rows.flatMap<MergedItem>((row, index) => {
    if (row.source === 'schedule') {
      const assignment = assignments.find((a) => a.family_record?.id === row.id);
      return assignment
        ? [
            {
              type: 'place' as const,
              sortKey: index,
              data: {
                ...assignment,
                __family_move_up: row.moveUp,
                __family_move_down: row.moveDown,
                __family_clock_label: row.clockLabel,
              },
            },
          ]
        : [];
    }
    const r = reservation(row);
    return r ? [{ type: 'transport' as const, sortKey: index, data: r }] : [];
  });
  // Notes retain TREK's source note presentation and identity; they are never reservation rows.
  for (const note of input.dayNotes[String(dayKey)] ?? [])
    items.push({ type: 'note', sortKey: items.length, data: note });
  return {
    items,
    pills: result.pills.map(reservation).filter((r): r is NonNullable<typeof r> => r !== null),
  };
}

import type { TourListItem } from '@trek/shared';
import type { Assignment } from '../../types';

/**
 * The place form's day context: while a place is edited, the whole day plan to check its times
 * against and, TIME-02, the tour that place is, whose end the time fields work out from its start.
 */
export function placeFormContext(
  editingPlace: { id: number } | null,
  assignments: Record<string, Assignment[]>,
  tours: readonly TourListItem[],
  observedAssignment?: Assignment | null
): { dayAssignments: Assignment[]; tour: TourListItem | null } {
  if (!editingPlace) return { dayAssignments: [], tour: null };
  return {
    dayAssignments: observedAssignment
      ? [
          ...Object.values(assignments)
            .flat()
            .filter((v) => v.id !== observedAssignment.id),
          observedAssignment,
        ]
      : Object.values(assignments).flat(),
    tour: tours.find((item) => item.place_id === editingPlace.id) ?? null,
  };
}

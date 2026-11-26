import { FamilyApiError } from './errors';
import type { ArrangementPacket } from './plannerArrangementContract';
import { createPlannerIntentQueue } from './plannerIntentQueue';

export const arrangementIntentUrl = (p: ArrangementPacket) =>
  `/trips/${p.scope.trip_id}/family/planner-arrange-command`;

export const {
  matchesOriginal: matchesArrangementOriginal,
  assertOriginal: assertArrangementOriginal,
  assertAvailable: assertArrangementAvailable,
  retain: retainArrangementIntent,
  acknowledge: acknowledgeArrangementIntent,
  parkRefusal: parkArrangementRefusal,
} = createPlannerIntentQueue<ArrangementPacket>({
  tripId: (p) => p.scope.trip_id,
  url: arrangementIntentUrl,
  changed: () =>
    new FamilyApiError(
      409,
      'arrangement_original_changed',
      'The original arrangement or retained work changed. Nothing was removed.'
    ),
  refusalMessage: 'Original arrangement refused; retained intact.',
});

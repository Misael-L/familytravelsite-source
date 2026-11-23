import type { BookingStayView } from '../../src/integrations/family/bookingStayContract';
import type { CompleteTripV4Capture, CompleteTripV4Data } from '../../src/integrations/family/completeTripV4';
import { packingCategorySnapshotV2 } from '../../src/integrations/family/packingCategoryV2Contract';
import { bookingStayFixture } from './familyBookingStays';
import { completeId, completeTripCaptureFixture, completeTripData } from './familyCompleteTrip';
/** Synthetic representative ancillary data attached to the actual canonical coherent fixture's scope/calendar. */
export function coherentTripData(core: BookingStayView = bookingStayFixture()): CompleteTripV4Data {
  const scope = core.planner.scope,
    old = completeTripData(scope),
    packing = old.packing;
  for (const item of packing.items) {
    item.recipient_person_ids = [scope.person_id];
    item.contributor_person_ids = [scope.person_id];
  }
  for (const bag of packing.bags) bag.member_person_ids = [scope.person_id];
  old.companions.links = [];
  old.header.start_date = core.days[0]?.civil_day ?? null;
  old.header.end_date = core.days[core.days.length - 1]?.civil_day ?? null;
  const packet = packingCategorySnapshotV2.parse({
    version: 2,
    scope: packing.scope,
    collection_revision: packing.collection_revision,
    packing: structuredClone(packing),
    categories: [
      {
        id: completeId(400),
        trip_id: scope.trip_id,
        owner_person_id: scope.person_id,
        name: 'Clothes',
        revision: 1,
        created_at: packing.items[0].created_at,
        updated_at: packing.items[0].updated_at,
        assignments: [],
        retained_when_empty: false,
        sort_order: 0,
        deleted_at: null,
        deleted_by_person_id: null,
      },
    ],
    item_categories: packing.items.map((r) => ({ item_id: r.id, category_id: completeId(400) })),
    people: [{ id: scope.person_id, display_name: 'Synthetic member', is_guest: false, eligible: true }],
  });
  return {
    core,
    variants: [],
    header: old.header,
    tasks: old.tasks,
    packing,
    packing_categories_v2: packet,
    companions: old.companions,
  };
}
export function coherentTripCapture(): CompleteTripV4Capture {
  const data = coherentTripData(),
    base = completeTripCaptureFixture(data.core.planner.scope);
  return {
    source: base.source,
    scope: base.scope,
    ownership: base.ownership,
    capturedAt: base.capturedAt,
    verifiedAt: base.capturedAt,
    data,
  };
}

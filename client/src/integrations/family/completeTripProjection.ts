import { checkedNativeStayCore } from './bookingStayContract';
import type { CompleteTripCompanions } from './completeTripCompanions';
import { deriveCompleteTripV4, type StoredCompleteTrip } from './completeTripV4';
import { FamilyApiError } from './errors';
import { FamilyIdentityRegistry } from './identity';
import type { CostCategory, FamilyTripExpense } from './legacy/data/supabase/tripExpenses';
import { nativeStayReadiness } from './nativeStayReadiness';
import { packingCategoryPeople } from './packingCategoryContract';
import { projectBooking } from './plannerBookings';
import { reconcilePlannerResources } from './plannerCohortRelations';
import { projectPacking } from './plannerPacking';
import { projectPlannerState, type ProjectedPlannerState } from './plannerProjection';
import { projectTask } from './plannerTasks';
import type { PublicVariantResolver } from './publicVariantImages';
import { FamilyViews } from './views';

function expenseRows(c: CompleteTripCompanions): FamilyTripExpense[] {
  return c.expenses.map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    name: row.name,
    category: row.category as CostCategory,
    totalAmount: Number(row.total_amount),
    currencyCode: row.currency_code,
    exchangeRate: Number(row.exchange_rate ?? 1),
    expenseDate: row.expense_date,
    note: row.note,
    reservationId: row.reservation_id,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    shares: c.shares
      .filter((r) => r.expense_id === row.id)
      .map((r) => ({
        expenseId: r.expense_id,
        personId: r.person_id,
        amount: r.amount === null ? null : Number(r.amount),
      })),
    payers: c.payers
      .filter((r) => r.expense_id === row.id)
      .map((r) => ({ expenseId: r.expense_id, personId: r.person_id, amount: Number(r.amount) })),
    ticketLines:
      row.ticket_lines === null
        ? null
        : (row.ticket_lines as Record<string, unknown>[]).map((r, i) => ({
            id: typeof r.id === 'string' ? r.id : 'ticket-' + i,
            name: String(r.name ?? ''),
            price: Number(r.price),
            personIds: (r.person_ids ?? r.personIds ?? []) as string[],
          })),
  }));
}
function projectNativeArrivals(
  envelope: StoredCompleteTrip,
  state: ProjectedPlannerState,
  ids: FamilyIdentityRegistry
) {
  if (envelope.format !== 'family.offline-trip.v4' || !envelope.data.native_stay_format) return;
  checkedNativeStayCore(envelope.data.core, envelope.scope);
  const owned = new Map<string, string>();
  for (const visit of envelope.data.core.planner.state.visits)
    if (visit.owning_stay_id) owned.set(visit.id, visit.owning_stay_id);
  for (const day of state.native.days)
    for (const assignment of day.assignments ?? []) {
      const stay = owned.get(ids.uuid('assignment', assignment.id));
      if (stay) assignment.accommodation_id = ids.register('stay', stay);
    }
}
/** One projection of one validated generation. Never fetch an absent companion or media body. */
export async function projectCompleteTrip(
  envelope: StoredCompleteTrip,
  fence: () => void,
  display?: PublicVariantResolver
) {
  const { scope } = envelope,
    data = envelope.format === 'family.offline-trip.v4' ? deriveCompleteTripV4(envelope.data) : envelope.data,
    c = data.companions,
    ids = new FamilyIdentityRegistry(scope.user_id),
    views = new FamilyViews(ids);
  const state = await projectPlannerState(
    data.planner.view.state,
    ids,
    async () => fence(),
    new Map(data.planner.variants.map((v) => [v.mediaAssetId, v])),
    display
  );
  fence();
  projectNativeArrivals(envelope, state, ids);
  if (!state.readiness.ready) throw new Error('The saved planner has unresolved legacy records.');
  const roster = c.members.map((r) => ({
    personId: r.person_id,
    displayName: (Array.isArray(r.people) ? r.people[0] : r.people).display_name,
  }));
  const packing = projectPacking(
      data.packing,
      ids,
      packingCategoryPeople(data.packing_categories_v2 ?? data.packing_categories, roster),
      data.packing_categories_v2 ?? data.packing_categories
    ),
    names = new Map(roster.map((r) => [r.personId, r.displayName]));
  const related = reconcilePlannerResources(
    {
      todoItems: data.tasks.tasks.map((r) => projectTask(r, data.tasks.scope, data.tasks.collection_revision, ids)),
      packingItems: packing.items,
      reservations: data.booking.bookings.map((r) => projectBooking(r, data.booking, views)),
      budgetItems: expenseRows(c).map((r) => views.expense(r, names)),
      files: c.files.map((r) =>
        views.file({
          id: r.id,
          tripId: r.trip_id,
          storagePath: r.storage_path,
          originalName: r.original_name,
          mimeType: r.mime_type,
          sizeBytes: r.size_bytes,
          uploadedBy: r.uploaded_by,
          starred: r.starred,
          description: r.description,
          deletedAt: null,
          createdAt: r.created_at,
          links: c.links
            .filter((l) => l.file_id === r.id)
            .map((l) => ({
              id: l.id,
              fileId: l.file_id,
              placeId: l.place_id,
              reservationId: l.reservation_id,
              tripDayId: l.trip_day_id,
            })),
        })
      ),
      members: c.members.map((r) => ({
        id: ids.register('person', r.person_id),
        username: names.get(r.person_id) ?? '',
        color: (Array.isArray(r.people) ? r.people[0] : r.people).color,
      })),
      categories: c.categories.map((r) => ({
        id: ids.register('category', r.id),
        name: r.name,
        color: r.color_hex,
        icon: r.icon_key,
      })),
      tags: [],
    },
    state,
    ids
  );
  const files = related.files.map((f) => ({
    ...f,
    mime_type: f.mime_type ?? '',
    created_at: f.created_at ?? '',
    starred: f.starred ?? undefined,
    reservation_title: f.reservation_title ?? undefined,
  }));
  for (const binding of envelope.bindings)
    if (ids.register(binding.kind as import('./identity').IdentityKind, binding.uuid) !== binding.key)
      throw new Error('The saved identity map changed.');
  const stayReadiness =
    envelope.format === 'family.offline-trip.v4'
      ? nativeStayReadiness(envelope.data.core, ids, { nativeArrivals: envelope.data.native_stay_format !== undefined })
      : null;
  if (stayReadiness?.status === 'unsupported')
    throw Object.assign(
      new FamilyApiError(
        409,
        'native_stay_unrepresentable',
        'These stays contain dates or clocks the native planner cannot display without losing facts.'
      ),
      { blockers: stayReadiness.blockers }
    );
  return {
    accommodations: stayReadiness?.status === 'ready' ? stayReadiness.accommodations : undefined,
    ids,
    state,
    packing,
    bundle: {
      trip: completeHeader(data.header, scope, ids, state.trip_revision),
      days: state.native.days,
      places: state.native.places,
      ...related,
      files,
      familyTaskSnapshot: data.tasks,
      familyPackingSnapshot: data.packing,
      ...(data.packing_categories_v2 || data.packing_categories
        ? { familyPackingCategorySnapshot: data.packing_categories_v2 ?? data.packing_categories }
        : {}),
    },
  };
}

function completeHeader(
  header: import('./completeTripSnapshot').CompleteTripData['header'],
  scope: import('./plannerViewContract').PlannerScope,
  ids: FamilyIdentityRegistry,
  revision: number
) {
  return {
    ...header,
    id: ids.register('trip', scope.trip_id),
    user_id: 0,
    is_owner: 0,
    is_archived: header.is_archived ?? 0,
    reminder_days: header.reminder_days ?? 0,
    family_uuid: scope.trip_id,
    family_calendar: {
      trip_revision: revision,
      start_date: header.start_date,
      end_date: header.end_date,
    },
  };
}

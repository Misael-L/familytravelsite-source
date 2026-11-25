import type { TripFileListItem } from '@trek/shared';
import type { Assignment, BudgetItem, Day, Place, Reservation } from '../../types';
import type { FamilyIdentityRegistry } from './identity';
import type { FamilyDayNote } from './legacy/data/supabase/dayNotes';
import type { FamilyScheduleItem } from './legacy/data/supabase/scheduleItems';
import { utcCivilDay } from './legacy/data/supabase/scheduleItems';
import type { FamilyTripDay } from './legacy/data/supabase/tripDays';
import type { FamilyTripExpense } from './legacy/data/supabase/tripExpenses';
import type { FamilyTripFile } from './legacy/data/supabase/tripFiles';
import type { FamilyTripPlace } from './legacy/data/supabase/tripPlaces';
import type { FamilyTransportReservation, FamilyTripReservation } from './legacy/data/supabase/tripReservations';
import type { FamilyDashboardTrip } from './legacy/pages/dashboard/familyDashboardModel';

/** Wire DTOs for the copied frontend. These are never Family persistence models. */
export class FamilyViews {
  constructor(readonly ids: FamilyIdentityRegistry) {}
  trip(row: FamilyDashboardTrip) {
    // The Family model has no Nest creator. Do not invent user_id or ownership.
    return {
      ...row,
      id: this.ids.register('trip', row.id),
      is_owner: row.is_owner ?? 0,
      family_uuid: row.id,
      family_id: row.family_id,
      hub_members: row.hub_members?.map((m) => ({
        ...m,
        id: this.ids.register('person', m.personId),
      })),
    };
  }
  place(tripId: string, row: FamilyTripPlace): Place & { family_time_zone: string | null } {
    return {
      id: this.ids.register('place', row.id),
      trip_id: this.ids.register('trip', tripId),
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      description: row.notes,
      notes: row.notes,
      image_url: row.imageUrl,
      category_id: row.familyPlaceCategoryId ? this.ids.register('category', row.familyPlaceCategoryId) : null,
      category: row.familyPlaceCategoryId
        ? {
            id: this.ids.register('category', row.familyPlaceCategoryId),
            name: row.familyPlaceCategoryName,
            color: row.familyPlaceCategoryColor,
            icon: row.familyPlaceCategoryIcon,
          }
        : null,
      tags: [],
      family_time_zone: row.timeZone,
    };
  }
  assignment(
    row: FamilyScheduleItem,
    day: FamilyTripDay,
    places: FamilyTripPlace[]
  ): Assignment & { family_record: FamilyScheduleItem } {
    const place = places.find((p) => p.id === row.placeId);
    const clock = (value: string | null) =>
      value && !/T00:00:00(?:\.000)?Z$/.test(value) ? new Date(value).toISOString().slice(11, 16) : null;
    return {
      family_record: row,
      id: this.ids.register('assignment', row.id),
      day_id: this.ids.register('day', day.id),
      place_id: row.placeId ? this.ids.register('place', row.placeId) : 0,
      order_index: row.sortOrder,
      assignment_time: clock(row.startsAt),
      assignment_end_time: clock(row.endsAt),
      // A standalone schedule activity has no catalog Place. Zero is an explicit
      // absent relation; it never resolves through the identity boundary.
      place: place ? this.place(row.tripId, place) : { id: 0, name: row.activity, lat: null, lng: null },
    };
  }
  days(
    rows: FamilyTripDay[],
    schedule: FamilyScheduleItem[],
    notes: FamilyDayNote[],
    places: FamilyTripPlace[]
  ): Day[] {
    return rows.map((day) => ({
      id: this.ids.register('day', day.id),
      trip_id: this.ids.register('trip', day.tripId),
      date: day.civilDay,
      day_number: day.dayIndex + 1,
      title: day.title,
      assignments: schedule
        .filter((s) => utcCivilDay(s.startsAt) === day.civilDay)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
        .map((s) => this.assignment(s, day, places)),
      notes_items: notes
        .filter((n) => n.civilDay === day.civilDay)
        .map((n) => ({
          id: this.ids.register('note', n.id),
          day_id: this.ids.register('day', day.id),
          trip_id: this.ids.register('trip', day.tripId),
          text: n.body,
          icon: n.icon,
          sort_order: n.sortOrder,
        })),
    }));
  }
  reservation(
    row: FamilyTripReservation | FamilyTransportReservation,
    days: FamilyTripDay[] = []
  ): Reservation & { family_record: FamilyTripReservation | FamilyTransportReservation } {
    const booking = 'scheduleItemId' in row ? row : null;
    const meta: Record<string, unknown> = { ...row.metadata };
    if ('legs' in row && row.legs.length) {
      const endpoints = [...row.endpoints].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
      const day = (date: string | null, header: string | null) => {
        const actual = days.find((d) => d.civilDay === date)?.id ?? header;
        return actual ? this.ids.register('day', actual) : null;
      };
      const legs = [...row.legs]
        .sort((a, b) => a.sequence - b.sequence)
        .map((leg, index) => {
          const from = endpoints.find((e) => e.id === leg.fromEndpointId) ?? endpoints[index],
            to = endpoints.find((e) => e.id === leg.toEndpointId) ?? endpoints[index + 1];
          return {
            from: from?.code || from?.name,
            to: to?.code || to?.name,
            airline: leg.carrierName,
            flight_number: leg.serviceNumber,
            train_number: leg.serviceNumber,
            platform: leg.platform,
            seat: leg.seat,
            dep_day_id: day(from?.localDate ?? null, row.startTripDayId),
            arr_day_id: day(to?.localDate ?? null, row.endTripDayId),
            dep_time: from?.localTime ?? null,
            arr_time: to?.localTime ?? null,
          };
        });
      meta.legs = legs;
      Object.assign(meta, {
        airline: legs[0]?.airline,
        flight_number: legs[0]?.flight_number,
        train_number: legs[0]?.train_number,
        platform: legs[0]?.platform,
        seat: legs[0]?.seat,
      });
    }
    return {
      family_record: row,
      id: this.ids.register('reservation', row.id),
      trip_id: this.ids.register('trip', row.tripId),
      day_id: row.startTripDayId ? this.ids.register('day', row.startTripDayId) : null,
      end_day_id: row.endTripDayId ? this.ids.register('day', row.endTripDayId) : null,
      title: row.title,
      type: row.type,
      status: row.status,
      reservation_time: row.startsAt,
      reservation_end_time: row.endsAt,
      confirmation_number: row.confirmationCode,
      notes: row.notes,
      url: row.url,
      place_id: booking?.placeId ? this.ids.register('place', booking.placeId) : null,
      assignment_id: booking?.scheduleItemId ? this.ids.register('assignment', booking.scheduleItemId) : null,
      metadata: JSON.stringify(meta),
      day_plan_position: row.sortOrder,
      created_at: row.createdAt,
      endpoints:
        'endpoints' in row
          ? row.endpoints.map((e) => ({
              id: this.ids.register('endpoint', e.id),
              reservation_id: this.ids.register('reservation', row.id),
              role: e.role,
              sequence: e.sequence,
              name: e.name,
              code: e.code,
              lat: e.latitude as number,
              lng: e.longitude as number,
              timezone: e.timeZone,
              local_date: e.localDate,
              local_time: e.localTime,
            }))
          : [],
    };
  }
  expense(row: FamilyTripExpense, names: ReadonlyMap<string, string> = new Map()): BudgetItem {
    return {
      id: this.ids.register('expense', row.id),
      trip_id: this.ids.register('trip', row.tripId),
      name: row.name,
      category: row.category,
      total_price: row.totalAmount,
      currency: row.currencyCode,
      exchange_rate: row.exchangeRate,
      note: row.note,
      reservation_id: row.reservationId ? this.ids.register('reservation', row.reservationId) : null,
      expense_date: row.expenseDate,
      sort_order: row.sortOrder,
      created_at: row.createdAt,
      ticket_json: row.ticketLines
        ? JSON.stringify({
            items: row.ticketLines.map((line) => ({
              name: line.name,
              price: String(line.price),
              parts: line.personIds.map((id) => this.ids.register('person', id)),
            })),
          })
        : null,
      // Family stores actual payer contributions, not a separate per-person paid checkbox.
      // This is a read projection; the transport must never persist this derived flag.
      members: row.shares.map((s) => ({
        user_id: this.ids.register('person', s.personId),
        amount: s.amount,
        username: names.get(s.personId) ?? '',
        paid:
          row.payers.filter((p) => p.personId === s.personId).reduce((sum, p) => sum + p.amount, 0) >=
          (s.amount ?? row.totalAmount / Math.max(1, row.shares.length))
            ? 1
            : 0,
      })),
      payers: row.payers.map((p) => ({
        user_id: this.ids.register('person', p.personId),
        amount: p.amount,
      })),
    };
  }
  file(row: FamilyTripFile): TripFileListItem {
    const placeIds = row.links.filter((l) => l.placeId).map((l) => this.ids.register('place', l.placeId!));
    const reservationIds = row.links
      .filter((l) => l.reservationId)
      .map((l) => this.ids.register('reservation', l.reservationId!));
    return {
      id: this.ids.register('file', row.id),
      trip_id: this.ids.register('trip', row.tripId),
      filename: row.storagePath,
      original_name: row.originalName,
      mime_type: row.mimeType || 'application/octet-stream',
      file_size: row.sizeBytes,
      starred: row.starred ? 1 : 0,
      description: row.description,
      deleted_at: row.deletedAt,
      created_at: row.createdAt,
      place_id: null,
      reservation_id: null,
      linked_place_ids: placeIds,
      linked_reservation_ids: reservationIds,
      linked_assignment_ids: [],
      linked_budget_item_ids: [],
      note_id: null,
      uploaded_by: row.uploadedBy ? this.ids.register('person', row.uploadedBy) : null,
      message_id: null,
      reservation_title: null,
      uploaded_by_name: null,
      uploaded_by_avatar: null,
      // Resolved on open, not a signed URL persisted in an offline DTO.
      url: `/api/family/files/${this.ids.register('file', row.id)}/open`,
    };
  }
}

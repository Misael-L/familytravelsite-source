import { FamilyApiError } from './errors';
import type { IdentityKind } from './identity';
import type * as changesBackend from './legacy/data/supabase/tripChangeRequests';
import type * as expensesBackend from './legacy/data/supabase/tripExpenses';
import type * as placesBackend from './legacy/data/supabase/tripPlaces';
import type * as reservationsBackend from './legacy/data/supabase/tripReservations';
import type { FamilyFrontendRepository } from './repository';

type Views = Awaited<ReturnType<FamilyFrontendRepository['views']>>;
type Core = Awaited<ReturnType<FamilyFrontendRepository['core']>>;
type Booking = Awaited<ReturnType<typeof reservationsBackend.listTripBookings>>[number];
type Transport = Awaited<ReturnType<typeof reservationsBackend.listTripTransports>>[number];
type CommonReservation = Pick<
  reservationsBackend.FamilyBookingDraft,
  'id' | 'title' | 'status' | 'startTripDayId' | 'endTripDayId' | 'confirmationCode' | 'notes' | 'url'
>;
export type TripResourceMutationState = Readonly<{
  repo: FamilyFrontendRepository;
  tripId: string;
  suffix: string;
  m: string;
  b: Record<string, unknown>;
  c: Core;
  views: Views;
  id: (kind: IdentityKind, value: unknown) => string;
  ref: (kind: IdentityKind, value: unknown) => string | null;
}>;
export type TripResourceMutationOperations = Readonly<{
  places: typeof placesBackend;
  reservations: typeof reservationsBackend;
  expenses: typeof expensesBackend;
  changes: typeof changesBackend;
  staged: (
    repo: FamilyFrontendRepository,
    tripId: string,
    input: Omit<changesBackend.UpsertTripChangeDraftOpInput, 'tripId'>
  ) => Promise<never>;
  metadata: (value: unknown) => Record<string, string>;
  transportLegDrafts: typeof import('./transportDraft').transportLegDrafts;
  expenseDraft: typeof import('./expenseDraft').expenseDraft;
  expenseRates: typeof import('./expenseDraft').expenseRates;
  object: (value: unknown) => Record<string, unknown>;
  text: (value: unknown, fallback?: string) => string;
  optionalText: (value: unknown) => string | null;
  number: (value: unknown, fallback?: number) => number;
  array: (value: unknown) => unknown[];
  unsupported: (message: string) => never;
}>;
type TransportInput = {
  common: CommonReservation;
  transports: Transport[];
  reservationId: string | null;
  type: reservationsBackend.FamilyTransportDraft['type'];
};
type BookingInput = {
  common: CommonReservation;
  bookings: Booking[];
  reservationId: string | null;
  type: string;
};

/** Only checked, request-local repository state and already-scoped operations enter this adapter. */
export function handleFamilyTripResourceMutation(
  s: TripResourceMutationState,
  o: TripResourceMutationOperations
): Promise<unknown> {
  const place = s.suffix.match(/^places(?:\/([^/]+))?$/);
  if (place) return savePlace(s, o, place);
  const reservation = s.suffix.match(/^reservations(?:\/([^/]+))?$/);
  if (reservation) return saveReservation(s, o, reservation);
  const expense = s.suffix.match(/^budget(?:\/([^/]+))?$/);
  if (expense) return saveExpense(s, o, expense);
  throw new FamilyApiError(
    501,
    'family_action_unavailable',
    'The Family backend does not implement ' + s.m + ' ' + s.suffix + '.'
  );
}

async function savePlace(
  s: TripResourceMutationState,
  o: TripResourceMutationOperations,
  placeRoute: RegExpMatchArray
) {
  const { repo, tripId, m, b, c, views, id, ref } = s;
  const { places, changes, staged, unsupported } = o;
  const placeId = placeRoute[1] ? id('place', placeRoute[1]) : ref('place', b.family_place_id ?? b.place_id);
  if (!placeId) return unsupported('Choose a place from the Family catalog before adding it to the trip.');
  if (m === 'POST') {
    await repo.write(
      tripId,
      'trip.places.manage',
      () => places.upsertTripPlace(tripId, placeId),
      () =>
        staged(repo, tripId, {
          module: 'trip_place',
          op: 'add',
          targetTable: 'trip_places',
          payload: changes.payloadTripPlaceAdd(placeId),
        })
    );
    return {
      place: (await repo.placeList(tripId)).places.find((x) => views.ids.uuid('place', x.id) === placeId),
    };
  }
  if (!c.places.some((p) => p.id === placeId))
    throw new FamilyApiError(404, 'place_unavailable', 'Trip place unavailable.');
  if (m === 'DELETE') {
    await repo.write(
      tripId,
      'trip.places.manage',
      () => places.deleteTripPlace(tripId, placeId),
      () =>
        staged(repo, tripId, {
          module: 'trip_place',
          op: 'remove',
          targetTable: 'trip_places',
          targetId: placeId,
          payload: changes.payloadTripPlaceRemove(placeId),
        })
    );
    return { success: true };
  }
  if (m === 'PUT' && Object.keys(b).every((k) => k === 'category_id')) {
    const category = ref('category', b.category_id);
    await repo.write(
      tripId,
      'trip.places.manage',
      () => places.updateTripPlaceCategory(tripId, placeId, category),
      () =>
        staged(repo, tripId, {
          module: 'trip_place',
          op: 'update',
          targetTable: 'trip_places',
          targetId: placeId,
          payload: changes.payloadTripPlaceUpdateCategory(placeId, category),
        })
    );
    return {
      place: (await repo.placeList(tripId)).places.find((x) => views.ids.uuid('place', x.id) === placeId),
    };
  }
  unsupported('Catalog place identity and details are maintained by the Family catalog.');
}

async function saveReservation(
  s: TripResourceMutationState,
  o: TripResourceMutationOperations,
  reservationRoute: RegExpMatchArray
) {
  const { repo, tripId, m, b, views, id } = s;
  const { reservations, changes, staged, text } = o;
  const reservationId = reservationRoute[1] ? id('reservation', reservationRoute[1]) : null;
  const [bookings, transports] = await Promise.all([
    reservations.listTripBookings(tripId),
    reservations.listTripTransports(tripId),
  ]);
  const existing = [...bookings, ...transports].find((r) => r.id === reservationId);
  if (reservationId && !existing) throw new FamilyApiError(404, 'reservation_unavailable', 'Reservation unavailable.');
  if (m === 'DELETE' && reservationId) {
    await repo.write(
      tripId,
      'trip.reservations.manage',
      () => reservations.deleteTripReservation(reservationId),
      () =>
        staged(repo, tripId, {
          module: 'reservation',
          op: 'remove',
          targetTable: 'trip_reservations',
          targetId: reservationId,
          payload: changes.payloadRemoveMarker(),
        })
    );
    return { success: true };
  }
  if (existing && m === 'PUT' && Object.keys(b).every((key) => key === 'status'))
    return updateReservationStatus(s, o, existing);
  const type = text(b.type, existing?.type ?? 'other');
  const common = reservationCommon(s, o, { existing, reservationId });
  let saved: string;
  if (reservations.isTransportType(type)) {
    saved = await saveTransport(s, o, { common, transports, reservationId, type });
  } else {
    saved = await saveBooking(s, o, { common, bookings, reservationId, type });
  }
  const updated = [
    ...(await reservations.listTripBookings(tripId)),
    ...(await reservations.listTripTransports(tripId)),
  ].find((r) => r.id === saved);
  if (!updated)
    throw new FamilyApiError(
      503,
      'saved_reservation_read_failed',
      'The save succeeded but the reservation could not be reloaded.'
    );
  return { reservation: views.reservation(updated) };
}

function reservationCommon(
  s: TripResourceMutationState,
  o: TripResourceMutationOperations,
  input: { existing: Booking | Transport | undefined; reservationId: string | null }
): CommonReservation {
  const { b, ref } = s;
  const { text, optionalText } = o;
  const { existing, reservationId } = input;
  return {
    id: reservationId,
    title: text(b.title, existing?.title),
    status:
      (b.status === undefined ? existing?.status : b.status) === 'confirmed'
        ? ('confirmed' as const)
        : ('pending' as const),
    startTripDayId: b.day_id === undefined ? existing?.startTripDayId : ref('day', b.day_id),
    endTripDayId: b.end_day_id === undefined ? existing?.endTripDayId : ref('day', b.end_day_id),
    confirmationCode:
      b.confirmation_number === undefined ? existing?.confirmationCode : optionalText(b.confirmation_number),
    notes: b.notes === undefined ? existing?.notes : optionalText(b.notes),
    url: b.url === undefined ? existing?.url : optionalText(b.url),
  };
}

async function updateReservationStatus(
  s: TripResourceMutationState,
  o: TripResourceMutationOperations,
  existing: Booking | Transport
) {
  const { repo, tripId, b, views } = s;
  const { reservations, changes, staged, unsupported } = o;
  if (existing.type === 'transit') unsupported('Stored transit records are read-only.');
  const status = b.status === 'confirmed' ? ('confirmed' as const) : ('pending' as const);
  await repo.write(
    tripId,
    'trip.reservations.manage',
    () => reservations.setTripReservationStatus(existing.id, status),
    reservations.isBookingType(existing.type)
      ? () =>
          staged(repo, tripId, {
            module: 'reservation',
            op: 'update',
            targetTable: 'trip_reservations',
            targetId: existing.id,
            payload: changes.payloadReservationUpsert({
              ...existing,
              type: existing.type as reservationsBackend.BookingType,
              status,
            }),
          })
      : undefined
  );
  return {
    reservation: (await repo.reservationList(tripId)).reservations.find(
      (r) => views.ids.uuid('reservation', r.id) === existing.id
    ),
  };
}

async function saveTransport(s: TripResourceMutationState, o: TripResourceMutationOperations, input: TransportInput) {
  const { repo, tripId, b, id } = s;
  const { reservations, array, object, text, optionalText, number, metadata, transportLegDrafts } = o;
  const { common, transports, reservationId, type } = input;
  const old = transports.find((r) => r.id === reservationId);
  const endpoints =
    b.endpoints === undefined
      ? (old?.endpoints.map((e) => ({
          id: e.id,
          name: e.name,
          code: e.code,
          airportId: e.airportId,
          placeId: e.placeId,
          latitude: e.latitude,
          longitude: e.longitude,
          timeZone: e.timeZone,
          localDate: e.localDate,
          localTime: e.localTime,
        })) ?? [])
      : array(b.endpoints).map((raw, index) => {
          const e = object(raw);
          const prior = old?.endpoints[index];
          return {
            id: e.id != null ? id('endpoint', e.id) : prior?.id,
            name: text(e.name),
            code: optionalText(e.code),
            airportId: prior?.airportId,
            placeId: prior?.placeId,
            latitude: e.lat == null ? null : number(e.lat),
            longitude: e.lng == null ? null : number(e.lng),
            timeZone: optionalText(e.timezone),
            localDate: optionalText(e.local_date),
            localTime: optionalText(e.local_time),
          };
        });
  const rawMeta =
    b.metadata === undefined
      ? {}
      : typeof b.metadata === 'string'
        ? object(JSON.parse(b.metadata))
        : object(b.metadata);
  const draft: reservationsBackend.FamilyTransportDraft = {
    ...common,
    type,
    headerStartsAt: old?.startsAt,
    headerEndsAt: old?.endsAt,
    endpoints,
    metadata: b.metadata === undefined ? undefined : metadata(rawMeta),
    legs: transportLegDrafts(rawMeta, old, type),
  };
  return repo.write(tripId, 'trip.reservations.manage', () => reservations.upsertTripTransport(tripId, draft));
}

async function saveBooking(s: TripResourceMutationState, o: TripResourceMutationOperations, input: BookingInput) {
  const { repo, tripId, b, ref } = s;
  const { reservations, changes, staged, metadata, optionalText, unsupported } = o;
  const { common, bookings, reservationId, type } = input;
  if (!reservations.isBookingType(type)) return unsupported('Unsupported Family booking type.');
  const old = bookings.find((r) => r.id === reservationId);
  const draft: reservationsBackend.FamilyBookingDraft = {
    ...common,
    type,
    startsAt: b.reservation_time === undefined ? old?.startsAt : optionalText(b.reservation_time),
    endsAt: b.reservation_end_time === undefined ? old?.endsAt : optionalText(b.reservation_end_time),
    placeId: b.place_id === undefined ? old?.placeId : ref('place', b.place_id),
    hotelId: old?.hotelId,
    scheduleItemId: b.assignment_id === undefined ? old?.scheduleItemId : ref('assignment', b.assignment_id),
    metadata: b.metadata === undefined ? old?.metadata : metadata(b.metadata),
  };
  return repo.write(
    tripId,
    'trip.reservations.manage',
    () => reservations.upsertTripBooking(tripId, draft),
    async () => {
      if (
        JSON.stringify(draft.metadata ?? {}) !== JSON.stringify(old?.metadata ?? {}) ||
        (draft.scheduleItemId !== (old?.scheduleItemId ?? null) && Boolean(draft.scheduleItemId))
      )
        throw new FamilyApiError(
          422,
          'draft_fields_unavailable',
          'Metadata and new schedule links cannot be changed in this draft module.'
        );
      return staged(repo, tripId, {
        module: 'reservation',
        op: reservationId ? 'update' : 'add',
        targetTable: 'trip_reservations',
        targetId: reservationId,
        payload: changes.payloadReservationUpsert(draft),
        tripDayId: draft.startTripDayId,
      });
    }
  );
}

async function saveExpense(
  s: TripResourceMutationState,
  o: TripResourceMutationOperations,
  expenseRoute: RegExpMatchArray
) {
  const { repo, tripId, m, b, c, views, id } = s;
  const { expenses, changes, staged, expenseDraft, expenseRates } = o;
  const expenseId = expenseRoute[1] ? id('expense', expenseRoute[1]) : null;
  const existing = expenseId ? (await expenses.listTripExpenses(tripId)).find((e) => e.id === expenseId) : null;
  if (expenseId && !existing) throw new FamilyApiError(404, 'expense_unavailable', 'Expense unavailable.');
  if (m === 'DELETE' && expenseId) {
    await repo.write(
      tripId,
      'trip.costs.manage',
      () => expenses.deleteTripExpense(expenseId),
      () =>
        staged(repo, tripId, {
          module: 'expense',
          op: 'remove',
          targetTable: 'trip_expenses',
          targetId: expenseId,
          payload: changes.payloadRemoveMarker(),
        })
    );
    return { success: true };
  }
  if (expenseId && Object.keys(b).length === 1 && b.reservation_id === null) {
    await repo.write(tripId, 'trip.costs.manage', () => expenses.unlinkExpenseReservation(expenseId));
    return {
      item: (await repo.expenseList(tripId)).items.find((x) => views.ids.uuid('expense', x.id) === expenseId),
    };
  }
  const draft = expenseDraft(b, existing ?? null, views.ids, c.trip.currency);
  const session = await repo.session();
  const saved = await repo.write(
    tripId,
    'trip.costs.manage',
    () =>
      expenses.upsertTripExpense({
        tripId,
        draft,
        tripCurrency: c.trip.currency,
        rates: expenseRates(b, existing ?? null, draft.currencyCode, c.trip.currency),
        createdByPersonId: session.personId,
      }),
    async () => {
      if (
        changes.expenseDraftHasBlockingUnstagedFields(draft) ||
        draft.participantIds.length ||
        draft.payerContributions?.length
      )
        throw new FamilyApiError(
          422,
          'draft_fields_unavailable',
          'Receipt splits, payers, participants and reservation links cannot be staged in this draft module.'
        );
      return staged(repo, tripId, {
        module: 'expense',
        op: expenseId ? 'update' : 'add',
        targetTable: 'trip_expenses',
        targetId: expenseId,
        payload: changes.payloadExpenseUpsert(
          draft,
          expenseRates(b, existing ?? null, draft.currencyCode, c.trip.currency)?.[draft.currencyCode] ?? 1
        ),
      });
    }
  );
  return {
    item: (await repo.expenseList(tripId)).items.find((x) => views.ids.uuid('expense', x.id) === saved),
  };
}

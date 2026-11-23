import type { CompleteTripData, CompleteTripEnvelope } from './completeTripSnapshot';
import { FamilyIdentityRegistry, type IdentityKind } from './identity';

function invalid(): never {
  throw new Error('Inconsistent complete Trip relationships');
}
/** Catalogue source IDs remain explicit; never replace a restaurant identity with its city's coordinates. */
export function completeTripBindings(
  data: CompleteTripData,
  format: CompleteTripEnvelope['format'] = 'family.offline-trip.v1'
) {
  const ids = new FamilyIdentityRegistry(data.planner.view.scope.user_id);
  const add = (kind: IdentityKind, value: string | null | undefined) => {
    if (value) ids.register(kind, value);
  };
  const { state } = data.planner.view,
    { companions: c, booking, tasks, packing } = data;
  add('trip', state.trip_id);
  for (const row of c.members) add('person', row.person_id);
  for (const row of state.days) add('day', row.id);
  for (const row of state.notes) add('note', row.id);
  for (const row of state.locations) {
    add('place', row.id);
    add('category', row.category?.id);
    add('media', row.cover_media_id);
    if (row.source.kind === 'place') add('place', row.source.id);
  }
  for (const row of state.visits) add('assignment', row.id);
  for (const row of c.categories) add('category', row.id);
  for (const row of tasks.tasks) {
    add('todo', row.id);
    add('person', row.assigned_person_id);
  }
  for (const row of packing.items) {
    add('packing', row.id);
    add('person', row.owner_person_id);
    [...row.recipient_person_ids, ...row.contributor_person_ids].forEach((p) => add('person', p));
  }
  for (const row of packing.bags) {
    add('packingBag', row.id);
    row.member_person_ids.forEach((p) => add('person', p));
  }
  Object.values(packing.category_assignees)
    .flat()
    .forEach((p) => add('person', p));
  for (const row of booking.bookings) {
    add('reservation', row.record.id);
    row.endpoints.forEach((e) => add('endpoint', e.id));
    row.legs.forEach((l) => add('leg', l.id));
  }
  expenseBindings(c.expenses, add);
  [...c.shares, ...c.payers].forEach((r) => add('person', r.person_id));
  for (const row of c.files) {
    add('file', row.id);
    add('person', row.uploaded_by);
  }
  for (const row of c.links) {
    add('fileLink', row.id);
    add('place', row.place_id);
  }
  if (format === 'family.offline-trip.v3') categoryIdentityBindings(data, add);
  return ids.bindings();
}
function categoryIdentityBindings(data: CompleteTripData, add: (kind: IdentityKind, value: string) => void) {
  const categories = data.packing_categories_v2;
  if (!categories || data.packing_categories) invalid();
  for (const category of categories.categories) add('packingCategory', category.id);
  for (const person of categories.people) add('person', person.id);
}
export function checkCompleteTripRelations(data: CompleteTripData) {
  const { state } = data.planner.view,
    { companions: c } = data;
  const days = new Set(state.days.map((d) => d.id)),
    bookings = new Set(data.booking.bookings.map((b) => b.record.id));
  const expenses = new Set(c.expenses.map((e) => e.id)),
    files = new Set(c.files.map((f) => f.id));
  for (const rows of [c.expenses, c.files, c.links, c.categories]) unique(rows.map((r) => r.id));
  unique(c.members.map((r) => r.person_id));
  for (const rows of [c.shares, c.payers]) unique(rows.map((r) => r.expense_id + ':' + r.person_id));
  if (
    c.expenses.some((e) => e.trip_id !== state.trip_id || (e.reservation_id && !bookings.has(e.reservation_id))) ||
    c.files.some((f) => f.trip_id !== state.trip_id) ||
    c.categories.some((k) => k.family_id !== state.family_id) ||
    [...c.shares, ...c.payers].some((r) => !expenses.has(r.expense_id)) ||
    invalidFileLinks(data, files, days, bookings)
  )
    invalid();
  unique(data.booking.bookings.flatMap((r) => r.endpoints.map((e) => e.id)));
  unique(data.booking.bookings.flatMap((r) => r.legs.map((l) => l.id)));
  for (const row of data.booking.bookings) {
    const visit = row.record.schedule_item_id;
    if (row.visit_state === 'active' && !state.visits.some((v) => v.id === visit)) invalid();
  }
  if (data.header.start_date && data.header.end_date && data.header.start_date > data.header.end_date) invalid();
  const { start_date, end_date } = data.header;
  if (start_date && state.days.some((d) => d.civil_day < start_date)) invalid();
  if (end_date && state.days.some((d) => d.civil_day > end_date)) invalid();
}

function unique(keys: string[]) {
  if (new Set(keys).size !== keys.length) invalid();
}
function invalidFileLinks(data: CompleteTripData, files: Set<string>, days: Set<string>, bookings: Set<string>) {
  return data.companions.links.some(
    (r) =>
      r.trip_id !== data.planner.view.state.trip_id ||
      !files.has(r.file_id) ||
      (r.trip_day_id && !days.has(r.trip_day_id)) ||
      (r.reservation_id && !bookings.has(r.reservation_id))
  );
}

function expenseBindings(
  rows: CompleteTripData['companions']['expenses'],
  add: (kind: IdentityKind, id: string) => void
) {
  for (const row of rows) {
    add('expense', row.id);
    if (row.ticket_lines === null) continue;
    if (!Array.isArray(row.ticket_lines)) invalid();
    for (const line of row.ticket_lines) {
      if (!line || typeof line !== 'object') invalid();
      const people = line.person_ids ?? line.personIds;
      if (people !== undefined && !Array.isArray(people)) invalid();
      (people ?? []).forEach((p: string) => add('person', p));
    }
  }
}

import { session, trip } from '../planner-native/demo.mjs';
const uuid = (n) => `a0490000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const person = uuid(1),
  packing = uuid(2),
  bag = uuid(3),
  todo = uuid(4),
  expense = uuid(5),
  file = uuid(6);
const tables = {
  trip_travelers: [
    { person_id: session.personId, people: { display_name: 'Fixture planner', color: '#336699' } },
    { person_id: person, people: { display_name: 'Fixture companion', color: '#993366' } },
  ],
  packing_items: [
    {
      id: packing,
      trip_id: trip,
      name: 'Rehearsal raincoat',
      checked: false,
      category: 'Clothing',
      sort_order: 0,
      quantity: 1,
      weight_grams: 350,
      bag_id: bag,
      is_private: false,
      owner_person_id: session.personId,
    },
  ],
  packing_item_recipients: [{ item_id: packing, person_id: person }],
  packing_item_contributors: [{ item_id: packing, person_id: session.personId }],
  packing_bags: [
    { id: bag, trip_id: trip, name: 'Cabin bag', color: '#336699', weight_limit_grams: 8000, sort_order: 0 },
  ],
  packing_bag_members: [{ bag_id: bag, person_id: person }],
  todo_items: [
    {
      id: todo,
      trip_id: trip,
      name: 'Check local museum hours',
      checked: false,
      category: 'Preparation',
      sort_order: 0,
      due_date: '2027-08-19',
      description: 'Synthetic rehearsal task',
      assigned_person_id: person,
      priority: 1,
    },
  ],
  trip_expenses: [
    {
      id: expense,
      trip_id: trip,
      name: 'Shared rehearsal meal',
      category: 'food',
      total_amount: 40,
      currency_code: 'EUR',
      exchange_rate: 1,
      expense_date: '2027-08-19',
      note: 'Synthetic rehearsal cost',
      ticket_lines: [],
      reservation_id: null,
      sort_order: 0,
      created_at: '2026-11-08T00:00:00Z',
    },
  ],
  trip_expense_shares: [
    { expense_id: expense, person_id: person, amount: 20 },
    { expense_id: expense, person_id: session.personId, amount: 20 },
  ],
  trip_expense_payers: [{ expense_id: expense, person_id: session.personId, amount: 40 }],
  trip_expense_settlements: [],
  trip_files: [
    {
      id: file,
      trip_id: trip,
      storage_path: `${trip}/rehearsal.pdf`,
      original_name: 'Rehearsal guide.pdf',
      mime_type: 'application/pdf',
      size_bytes: 256,
      uploaded_by: session.personId,
      starred: true,
      description: 'Synthetic metadata only',
      deleted_at: null,
      created_at: '2026-11-08T00:00:00Z',
    },
  ],
  trip_file_links: [],
};
/** Only SELECTs on the named fixture tables are supported; unknown reads and every write fail. */
export function query(table, fixture, inTransaction) {
  if (!Object.hasOwn(tables, table)) throw new Error(`Unexpected fixture table ${table}`);
  const filters = [];
  const chain = {
    select: () => chain,
    order: () => chain,
    eq: (column, value) => {
      filters.push({ kind: 'eq', column, value });
      return chain;
    },
    in: (column, value) => {
      filters.push({ kind: 'in', column, value });
      return chain;
    },
    is: (column, value) => {
      filters.push({ kind: 'is', column, value });
      return chain;
    },
    not: (column, operator, value) => {
      filters.push({ kind: 'not', column, operator, value });
      return chain;
    },
    then: (resolve, reject) => {
      if (inTransaction()) throw new Error('SDK query inherited an IndexedDB transaction');
      fixture.queries.push({ table, filters });
      if (filters.some((f) => f.column === 'trip_id' && f.value !== trip)) throw new Error('Wrong fixture Trip');
      return Promise.resolve({ data: globalThis.structuredClone(tables[table]), error: null }).then(resolve, reject);
    },
  };
  return chain;
}

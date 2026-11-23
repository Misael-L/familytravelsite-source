import { beforeEach, describe, expect, it, vi } from 'vitest';

const inserts: Array<{ table: string; payload: unknown }> = [];

function done(data: unknown = { id: 'exp-1' }) {
  const result = Promise.resolve({ data, error: null });
  return Object.assign(result, {
    select: () => ({ single: async () => ({ data, error: null }) }),
  });
}

vi.mock('./legacy/data/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from(table: string) {
      return {
        insert(payload: unknown) {
          inserts.push({ table, payload });
          return done({ id: 'exp-1' });
        },
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    },
  }),
}));

import { upsertTripExpense, type TripExpenseDraft } from './legacy/data/supabase/tripExpenses';

const base = {
  name: 'Dinner',
  category: 'food' as const,
  totalAmount: 20,
  currencyCode: 'USD',
  note: '',
  participantIds: [] as string[],
  splitMode: 'equally' as const,
  customAmounts: {},
  ticketLines: [],
};

describe('trip expense payers', () => {
  beforeEach(() => {
    inserts.length = 0;
  });

  it('rejects a non-finite or negative contribution', async () => {
    const draft: TripExpenseDraft = {
      ...base,
      payerContributions: [{ personId: 'p1', amount: -1 }],
    };
    await expect(upsertTripExpense({ tripId: 'trip', draft, tripCurrency: 'USD' })).rejects.toThrow(
      'Invalid payer contribution'
    );
    expect(inserts).toEqual([]);
  });

  it('writes one payer row per contribution', async () => {
    await upsertTripExpense({
      tripId: 'trip',
      tripCurrency: 'USD',
      draft: {
        ...base,
        payerContributions: [
          { personId: 'p1', amount: 12 },
          { personId: 'p2', amount: 8 },
        ],
      },
    });
    const payers = inserts.find((row) => row.table === 'trip_expense_payers');
    expect(payers?.payload).toEqual([
      { expense_id: 'exp-1', person_id: 'p1', amount: 12 },
      { expense_id: 'exp-1', person_id: 'p2', amount: 8 },
    ]);
  });

  it('falls back to a single payerPersonId row when contributions are absent', async () => {
    await upsertTripExpense({
      tripId: 'trip',
      tripCurrency: 'USD',
      draft: { ...base, payerPersonId: 'p1' },
    });
    const payers = inserts.find((row) => row.table === 'trip_expense_payers');
    expect(payers?.payload).toEqual([{ expense_id: 'exp-1', person_id: 'p1', amount: 20 }]);
  });
});

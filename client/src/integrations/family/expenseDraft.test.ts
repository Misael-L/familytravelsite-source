import { describe, expect, it } from 'vitest';
import { expenseDraft, expenseRates } from './expenseDraft';
import { FamilyIdentityRegistry } from './identity';
import type { FamilyTripExpense } from './legacy/data/supabase/tripExpenses';
const person = '88888888-8888-4888-8888-888888888888',
  other = '77777777-7777-4777-8777-777777777777';
const ids = new FamilyIdentityRegistry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const existing: FamilyTripExpense = {
  id: '66666666-6666-4666-8666-666666666666',
  tripId: '11111111-1111-4111-8111-111111111111',
  name: 'Meal',
  category: 'food',
  totalAmount: 20,
  currencyCode: 'USD',
  exchangeRate: 0.87,
  expenseDate: '2026-10-27',
  note: 'Keep this note',
  ticketLines: [{ id: 'line', name: 'Dinner', price: 20, personIds: [person, other] }],
  reservationId: null,
  sortOrder: 4,
  createdAt: '2026-10-27T00:00:00Z',
  shares: [
    { expenseId: 'expense', personId: person, amount: 10 },
    { expenseId: 'expense', personId: other, amount: 10 },
  ],
  payers: [
    { expenseId: 'expense', personId: person, amount: 12 },
    { expenseId: 'expense', personId: other, amount: 8 },
  ],
};
describe('Family expense editor compatibility', () => {
  it('keeps receipt lines, all payers, notes and the frozen FX rate on a title-only save', () => {
    const draft = expenseDraft({ name: 'Updated' }, existing, ids, 'EUR');
    expect(draft).toMatchObject({
      name: 'Updated',
      splitMode: 'ticket',
      ticketLines: existing.ticketLines,
      note: existing.note,
      payerContributions: [
        { personId: person, amount: 12 },
        { personId: other, amount: 8 },
      ],
    });
    expect(expenseRates({}, existing, draft.currencyCode)).toEqual({ USD: 0.87 });
  });
  it('translates source receipt participant view IDs back to canonical people', () => {
    const key = ids.register('person', person);
    const draft = expenseDraft(
      { ticket_json: JSON.stringify({ items: [{ name: 'Lunch', price: '12.50', parts: [key] }] }) },
      existing,
      ids,
      'EUR'
    );
    expect(draft.ticketLines).toEqual([{ id: 'line', name: 'Lunch', price: 12.5, personIds: [person] }]);
  });
  it('rejects malformed receipts and a new foreign currency without a recorded rate before any write', () => {
    expect(() => expenseDraft({ ticket_json: '{bad' }, existing, ids, 'EUR')).toThrow('receipt');
    expect(() => expenseDraft({ currency: 'GBP' }, existing, ids, 'EUR')).toThrow('exchange rate');
  });
  it('allows explicitly changing a receipt split and using a recorded new rate', () => {
    const draft = expenseDraft(
      {
        currency: 'GBP',
        exchange_rate: 1.2,
        ticket_json: null,
        members: [{ user_id: ids.register('person', person), amount: 20 }],
      },
      existing,
      ids,
      'EUR'
    );
    expect(draft.splitMode).toBe('custom');
    expect(draft.ticketLines).toEqual([]);
    expect(expenseRates({ exchange_rate: 1.2 }, existing, draft.currencyCode)).toEqual({ GBP: 1.2 });
  });
});

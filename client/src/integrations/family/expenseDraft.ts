import { FamilyIdentityRegistry } from './identity';
import type { FamilyTripExpense, TripExpenseDraft } from './legacy/data/supabase/tripExpenses';
import { FamilyApiError } from './repository';
type Body = Record<string, unknown>;
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const obj = (v: unknown): Body => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Body) : {});
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
export function expenseRates(
  body: Body,
  existing: Pick<FamilyTripExpense, 'currencyCode' | 'exchangeRate'> | null,
  currency: string,
  tripCurrency?: string
): Record<string, number> | null {
  if (existing && currency.toUpperCase() === (existing.currencyCode ?? currency).toUpperCase())
    return { [currency.toUpperCase()]: existing.exchangeRate };
  if (typeof body.exchange_rate === 'number' && Number.isFinite(body.exchange_rate) && body.exchange_rate > 0)
    return { [currency.toUpperCase()]: body.exchange_rate };
  const fallback = obj(body.fallback_fx),
    rates = obj(fallback.rates),
    rate = rates[currency.toUpperCase()];
  if (tripCurrency && fallback.base === tripCurrency && typeof rate === 'number' && Number.isFinite(rate) && rate > 0)
    return { [currency.toUpperCase()]: rate };
  return null;
}
type ExpensePerson = (v: unknown) => string;

function expenseMembers(b: Body, existing: FamilyTripExpense | null, ids: FamilyIdentityRegistry) {
  return b.members === undefined
    ? (existing?.shares.map((s) => ({
        user_id: ids.register('person', s.personId),
        amount: s.amount,
      })) ?? [])
    : arr(b.members).map(obj);
}

function expenseTicketLines(b: Body, existing: FamilyTripExpense | null, person: ExpensePerson) {
  let ticketLines = existing?.ticketLines ?? [];
  if (b.ticket_json !== undefined) {
    if (b.ticket_json === null || b.ticket_json === '') ticketLines = [];
    else
      try {
        const raw = obj(typeof b.ticket_json === 'string' ? JSON.parse(b.ticket_json) : b.ticket_json);
        if (!Array.isArray(raw.items)) throw Error('Missing receipt lines');
        ticketLines = raw.items.map((rawLine: unknown, index: number) => {
          const line = obj(rawLine);
          const price = Number(line.price);
          if (!Number.isFinite(price) || price < 0) throw Error('Invalid receipt price');
          return {
            id: ticketLines[index]?.id,
            name: str(line.name),
            price,
            personIds: arr(line.parts).map(person),
          };
        });
      } catch {
        throw new FamilyApiError(
          422,
          'invalid_receipt',
          'The receipt lines could not be read. No expense was changed.'
        );
      }
  }
  return ticketLines;
}

function expenseReservation(b: Body, existing: FamilyTripExpense | null, ids: FamilyIdentityRegistry) {
  return b.reservation_id === undefined
    ? existing?.reservationId
    : b.reservation_id == null
      ? null
      : ids.uuid('reservation', typeof b.reservation_id === 'number' ? b.reservation_id : str(b.reservation_id));
}

function expensePayers(b: Body, existing: FamilyTripExpense | null, person: ExpensePerson) {
  return b.payers === undefined
    ? (existing?.payers.map((p) => ({ personId: p.personId, amount: p.amount })) ?? [])
    : arr(b.payers).map((raw) => {
        const p = obj(raw);
        return { personId: person(p.user_id), amount: num(p.amount) };
      });
}

/** Translate the editor payload without dropping canonical receipt lines or payer contributions. */
export function expenseDraft(
  b: Body,
  existing: FamilyTripExpense | null,
  ids: FamilyIdentityRegistry,
  tripCurrency: string
): TripExpenseDraft {
  const person = (v: unknown) => ids.uuid('person', typeof v === 'number' ? v : str(v));
  const members = expenseMembers(b, existing, ids);
  const ticketLines = expenseTicketLines(b, existing, person);
  const participants =
    b.member_ids !== undefined ? arr(b.member_ids).map(person) : members.map((m) => person(m.user_id));
  const currency = str(b.currency, existing?.currencyCode ?? tripCurrency).toUpperCase();
  if (currency !== tripCurrency.toUpperCase() && !expenseRates(b, existing, currency, tripCurrency))
    throw new FamilyApiError(422, 'exchange_rate_required', 'A recorded exchange rate is required for this currency.');
  return {
    id: existing?.id,
    name: str(b.name, existing?.name),
    category: str(b.category, existing?.category ?? 'other') as TripExpenseDraft['category'],
    totalAmount: num(b.total_price, existing?.totalAmount ?? 0),
    currencyCode: currency,
    expenseDate: b.expense_date === undefined ? existing?.expenseDate : str(b.expense_date) || null,
    note: str(b.note, existing?.note ?? ''),
    reservationId: expenseReservation(b, existing, ids),
    participantIds: participants,
    splitMode: ticketLines.length ? 'ticket' : members.some((m) => m.amount != null) ? 'custom' : 'equally',
    customAmounts: Object.fromEntries(
      members.filter((m) => m.amount != null).map((m) => [person(m.user_id), num(m.amount)])
    ),
    ticketLines,
    payerContributions: expensePayers(b, existing, person),
  };
}

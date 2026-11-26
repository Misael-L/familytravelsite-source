import { calculateSettlement, expenseIsUnfinished } from './budgetMath';
import { expenseRates } from './expenseDraft';
import * as settlementsBackend from './legacy/data/supabase/tripExpenseSettlements';
import { NOT_HANDLED } from './listHandler';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { scopeFamilyOperations } from './requestContext';
import type { FamilyRequest } from './transport';
async function budgetTrip(repo: FamilyFrontendRepository, tripId: string, method: string) {
  return method === 'GET' ? repo.tripHeader(tripId) : (await repo.core(tripId)).trip;
}
type BudgetPersonView = (id: string) => { user_id: number; username: string; avatar_url: null };
type BudgetViews = Awaited<ReturnType<FamilyFrontendRepository['views']>>;
type BudgetTrip = Awaited<ReturnType<typeof budgetTrip>>;
type BudgetExpense = Awaited<ReturnType<FamilyFrontendRepository['readers']['expenses']['listTripExpenses']>>[number];
type BudgetConversion = (amount: number, currency: string | null, fx: number) => number;
type BudgetFlow = { from: { user_id: number }; to: { user_id: number }; amount: number };

function budgetSettlementView(row: settlementsBackend.FamilyTripExpenseSettlement, tripId: string, v: BudgetViews) {
  return {
    id: v.ids.register('settlement', row.id),
    trip_id: v.ids.register('trip', tripId),
    from_user_id: v.ids.register('person', row.fromPersonId),
    to_user_id: v.ids.register('person', row.toPersonId),
    amount: row.amount,
    currency: row.currencyCode,
    exchange_rate: row.exchangeRate,
    created_at: row.createdAt,
    created_by_user_id: row.createdByPersonId ? v.ids.register('person', row.createdByPersonId) : null,
  };
}

function budgetDisplay(trip: BudgetTrip, request: FamilyRequest) {
  const tripCurrency = trip.currency || 'EUR';
  const requested = (request.query.get('base') || tripCurrency).toUpperCase();
  const quote = Number(request.query.get('base_rate'));
  const display = requested === tripCurrency || quote > 0 ? requested : tripCurrency;
  const rate = display === tripCurrency ? 1 : quote;
  return { tripCurrency, display, rate };
}

function budgetFronted(included: BudgetExpense[], pid: string, v: BudgetViews, converted: BudgetConversion) {
  return included
    .filter((e) => !expenseIsUnfinished(e))
    .flatMap((e) =>
      e.payers
        .filter((p) => p.personId === pid)
        .map((p) => ({
          item_id: v.ids.register('expense', e.id),
          cents: Math.round(converted(p.amount, e.currencyCode, e.exchangeRate) * 100),
        }))
    );
}

function budgetMoved(
  payments: settlementsBackend.FamilyTripExpenseSettlement[],
  pid: string,
  v: BudgetViews,
  converted: BudgetConversion
) {
  return payments
    .filter((p) => p.fromPersonId === pid || p.toPersonId === pid)
    .map((p) => {
      // Like the settlement engine, read a legacy payment without a currency in display units.
      const amount = p.currencyCode ? converted(p.amount, p.currencyCode, p.exchangeRate) : p.amount;
      return {
        settlement_id: v.ids.register('settlement', p.id),
        from_user_id: v.ids.register('person', p.fromPersonId),
        to_user_id: v.ids.register('person', p.toPersonId),
        cents: Math.round(amount * 100) * (p.toPersonId === pid ? 1 : -1),
      };
    });
}

function budgetOutstanding(flows: BudgetFlow[], balance: { user_id: number }) {
  return flows
    .filter((f) => f.from.user_id === balance.user_id || f.to.user_id === balance.user_id)
    .map((f) => ({
      from_user_id: f.from.user_id,
      to_user_id: f.to.user_id,
      cents: Math.round(f.amount * 100) * (f.to.user_id === balance.user_id ? 1 : -1),
    }));
}

function budgetUnconvertedCurrencies(
  expenses: BudgetExpense[],
  rows: settlementsBackend.FamilyTripExpenseSettlement[],
  included: BudgetExpense[],
  payments: settlementsBackend.FamilyTripExpenseSettlement[],
  tripCurrency: string
) {
  return [
    ...new Set(
      [...expenses.filter((e) => !included.includes(e)), ...rows.filter((p) => !payments.includes(p))].map(
        (e) => e.currencyCode || tripCurrency
      )
    ),
  ];
}

function budgetPaymentCurrency(
  b: Record<string, unknown>,
  existing: settlementsBackend.FamilyTripExpenseSettlement | undefined,
  trip: BudgetTrip
) {
  return typeof b.currency === 'string' ? b.currency : existing?.currencyCode || trip.currency || 'EUR';
}

function budgetSnapshotViews(snapshot: ReturnType<typeof calculateSettlement>, personView: BudgetPersonView) {
  const flows = snapshot.flows.map((f) => ({
    from: personView(f.fromPersonId),
    to: personView(f.toPersonId),
    amount: f.amount,
  }));
  const balances = snapshot.balances.map((r) => ({
    ...personView(r.personId),
    balance: r.balance,
  }));
  return { flows, balances };
}

export async function handleFamilyBudget(
  repo: FamilyFrontendRepository,
  request: FamilyRequest,
  tripId: string,
  suffix: string
) {
  const settlements = scopeFamilyOperations(repo, settlementsBackend);
  if (!/^budget\/(settlement|settlements)(\/|$)/.test(suffix)) return NOT_HANDLED;
  const v = await repo.views(),
    session = await repo.session(),
    trip = await budgetTrip(repo, tripId, request.method);
  const b = (request.body ?? {}) as Record<string, unknown>,
    m = request.method;
  const [rows, travelers] = await Promise.all([
    settlements.listTripExpenseSettlements(tripId),
    repo.readers.listTripTravelers(tripId),
  ]);
  const person = (value: unknown) => v.ids.uuid('person', typeof value === 'number' ? value : String(value));
  const personView = (id: string) => ({
    user_id: v.ids.register('person', id),
    username: travelers.find((t) => t.personId === id)?.displayName ?? '',
    avatar_url: null,
  });
  const view = (row: settlementsBackend.FamilyTripExpenseSettlement) => budgetSettlementView(row, tripId, v);
  if (suffix === 'budget/settlement' && m === 'GET') {
    const expenses = await repo.readers.expenses.listTripExpenses(tripId);
    const { tripCurrency, display, rate } = budgetDisplay(trip, request);
    const convertible = (currency: string | null, fx: number) =>
      (currency || tripCurrency).toUpperCase() === tripCurrency.toUpperCase() || (fx > 0 && fx !== 1);
    const included = expenses.filter((e) => convertible(e.currencyCode, e.exchangeRate)),
      payments = rows.filter((e) => convertible(e.currencyCode, e.exchangeRate));
    const snapshot = calculateSettlement({
      expenses: included.map((e) => ({ ...e, isUnfinished: expenseIsUnfinished(e) })),
      settlements: payments,
      travelers: travelers.map((t) => ({ id: t.personId, displayName: t.displayName })),
      mePersonId: session.personId,
      tripCurrency,
      displayCurrency: display,
      rates: { [tripCurrency]: 1 / rate },
    });
    const converted = (amount: number, currency: string | null, fx: number) =>
      (amount / ((currency || tripCurrency).toUpperCase() === tripCurrency.toUpperCase() ? 1 : fx)) * rate;
    const { flows, balances } = budgetSnapshotViews(snapshot, personView);
    const finalBudgets = balances.map((balance) => {
      const pid = v.ids.uuid('person', balance.user_id);
      const fronted = budgetFronted(included, pid, v, converted);
      const moved = budgetMoved(payments, pid, v, converted);
      const outstanding = budgetOutstanding(flows, balance);
      const expenses = fronted.reduce((a, r) => a + r.cents, 0),
        reimbursed = moved.reduce((a, r) => a + r.cents, 0),
        pending = Math.round(balance.balance * 100);
      return {
        ...personView(pid),
        expenses: expenses / 100,
        reimbursed: reimbursed / 100,
        pending: pending / 100,
        final: (expenses - reimbursed - pending) / 100,
        sources: { fronted, moved, outstanding },
      };
    });
    return {
      balances,
      flows,
      finalBudgets,
      settlements: rows.map(view),
      currency: display,
      unconverted: {
        item_ids: expenses.filter((e) => !included.includes(e)).map((e) => v.ids.register('expense', e.id)),
        settlement_ids: rows.filter((p) => !payments.includes(p)).map((p) => v.ids.register('settlement', p.id)),
        currencies: budgetUnconvertedCurrencies(expenses, rows, included, payments, tripCurrency),
      },
    };
  }
  const key = suffix.split('/')[2],
    id = key ? v.ids.uuid('settlement', key) : null,
    existing = rows.find((r) => r.id === id);
  if (id && !existing) throw new FamilyApiError(404, 'settlement_unavailable', 'This payment is unavailable.');
  if (m === 'DELETE' && id) {
    await repo.write(tripId, 'trip.costs.settle', () => settlements.deleteTripExpenseSettlement(id));
    return { success: true };
  }
  if (m === 'POST' || m === 'PUT') {
    if (b.note || b.settled_at)
      throw new FamilyApiError(
        422,
        'payment_fields_unavailable',
        'The Family payment record does not store a separate note or payment date. Clear those optional fields to save.'
      );
    const currency = budgetPaymentCurrency(b, existing, trip);
    const rates = expenseRates(
      b,
      existing ? { currencyCode: existing.currencyCode, exchangeRate: existing.exchangeRate } : null,
      currency,
      trip.currency
    );
    if (currency !== trip.currency && !rates)
      throw new FamilyApiError(422, 'exchange_rate_required', 'A recorded exchange rate is required for this payment.');
    const saved = await repo.write(tripId, 'trip.costs.settle', () =>
      settlements.upsertTripExpenseSettlement({
        tripId,
        draft: {
          id,
          fromPersonId: person(b.from_user_id),
          toPersonId: person(b.to_user_id),
          amount: Number(b.amount),
          currencyCode: currency,
        },
        tripCurrency: trip.currency,
        rates,
        createdByPersonId: session.personId,
      })
    );
    return {
      settlement: view((await settlements.listTripExpenseSettlements(tripId)).find((r) => r.id === saved)!),
    };
  }
  throw new FamilyApiError(422, 'payment_action_unavailable', 'Payment action unavailable.');
}

// organize-imports-ignore
// sort-imports-ignore
// Preserve the original test runtime module evaluation order.
import { invalidateOfflineSession } from '../../db/offlineDb';
import { invalidateTripReads } from '../../store/tripReadScope';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { render, screen, waitFor, fireEvent, within } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/helpers/msw/server';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePermissionsStore } from '../../store/permissionsStore';
import { clearExchangeRateCache } from '../../hooks/useExchangeRates';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildUser, buildTrip } from '../../../tests/helpers/factories';
import CostsPanel from './CostsPanel';
import './CostsPanel.helpers';
import './useFreezeMissingRates';
import {
  tripMembers,
  type Flow,
  expense,
  mount,
  pickOption,
  seedAlice,
  dinner,
  taxi,
} from '../../../tests/helpers/costsPanel/fixtures';

beforeEach(async () => {
  invalidateTripReads();
  invalidateOfflineSession();
  await resetOfflineTestDatabase();
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'EUR' }) });
});

describe('CostsPanel — overview', () => {
  beforeEach(seedAlice);

  it('FE-W5COSTS-001: heads the panel with the trip span and the traveler chips', async () => {
    seedStore(useTripStore, {
      trip: buildTrip({ id: 1, currency: 'EUR', start_date: '2025-06-01', end_date: '2025-06-05' }),
    });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(
      <CostsPanel
        tripId={1}
        tripMembers={[
          { id: 1, username: 'alice', avatar_url: '/uploads/avatars/a.png' },
          { id: 2, username: 'bob', avatar_url: null },
        ]}
      />
    );

    const span = await screen.findByText('5 days');
    expect(span.parentElement).toHaveTextContent('Jun 1 – Jun 5');
    expect(screen.getByText('2 travelers')).toBeInTheDocument();
    // Alice has an uploaded avatar, Bob falls back to his initial.
    expect(document.querySelectorAll('img[src="/uploads/avatars/a.png"]').length).toBeGreaterThan(0);
    expect(screen.getAllByText('B').length).toBeGreaterThan(0);
  });

  it('FE-W5COSTS-002: a trip without dates gets no span chip', async () => {
    seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'EUR', start_date: null, end_date: null } as never) });
    mount([]);

    expect(await screen.findByText('2 travelers')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ days$/)).toBeNull();
  });

  it('FE-W5COSTS-003: balances render credit, debt and a settled zero', async () => {
    mount([], {
      balances: [
        { user_id: 1, username: 'alice', avatar_url: null, balance: 45 },
        { user_id: 2, username: 'bob', avatar_url: null, balance: -45 },
      ],
    });

    expect(await screen.findByText('+45,00 €')).toBeInTheDocument();
    expect(screen.getByText('−45,00 €')).toBeInTheDocument();
  });

  it('FE-W5COSTS-004: a member with no balance row is shown as square', async () => {
    mount([], { balances: [{ user_id: 1, username: 'alice', avatar_url: null, balance: 0 }] });

    // Both travellers appear; neither has a signed amount.
    const balances = (await screen.findByRole('region', { name: 'Balances' })) as HTMLElement;
    await waitFor(() => expect(within(balances).getAllByText('0,00 €')).toHaveLength(2));
  });

  it('FE-W5COSTS-004b: the final budget gives one amount per traveler and its arithmetic on click', async () => {
    // Dinner is 100 USD fronted by Alice, booked by the server at the rate frozen
    // on entry as 92 €; taxi 30 € by Bob; both split evenly, so the trip costs each
    // of them 61. Bob has sent 15 of the 31 he owed, 16 is still open. No live rate
    // is loaded here, so a client converting the dinner itself would print 100 €.
    const user = userEvent.setup();
    mount([{ ...dinner(), currency: 'USD', total_price: 100, payers: [{ user_id: 1, amount: 100 }] }, taxi()], {
      balances: [
        { user_id: 1, username: 'alice', avatar_url: null, balance: 16 },
        { user_id: 2, username: 'bob', avatar_url: null, balance: -16 },
      ],
      flows: [{ from: { user_id: 2, username: 'bob' }, to: { user_id: 1, username: 'alice' }, amount: 16 }],
      settlements: [
        { id: 9, from_user_id: 2, to_user_id: 1, amount: 15, currency: 'EUR', created_at: '2025-06-17 10:00:00' },
      ],
      finalBudgets: [
        {
          user_id: 1,
          username: 'alice',
          avatar_url: null,
          expenses: 92,
          reimbursed: 15,
          pending: 16,
          final: 61,
          sources: {
            fronted: [{ item_id: 101, cents: 9200 }],
            moved: [{ settlement_id: 9, from_user_id: 2, to_user_id: 1, cents: 1500 }],
            outstanding: [{ from_user_id: 2, to_user_id: 1, cents: 1600 }],
          },
        },
        {
          user_id: 2,
          username: 'bob',
          avatar_url: null,
          expenses: 30,
          reimbursed: -15,
          pending: -16,
          final: 61,
          sources: {
            fronted: [{ item_id: 102, cents: 3000 }],
            moved: [{ settlement_id: 9, from_user_id: 2, to_user_id: 1, cents: -1500 }],
            outstanding: [{ from_user_id: 2, to_user_id: 1, cents: -1600 }],
          },
        },
      ],
    });

    const card = (await screen.findByRole('region', { name: 'Final budget' })) as HTMLElement;
    await waitFor(() => expect(within(card).getAllByText('61,00 €')).toHaveLength(2));
    // The main view stays one figure per person until someone asks for more.
    expect(within(card).queryByText('Expenses paid')).toBeNull();

    const alice = within(card).getByRole('button', { name: /You/ });
    await user.click(alice);
    expect(alice).toHaveAttribute('aria-expanded', 'true');
    // The dinner is the server's 92 €, once as the line and once as its only row; the
    // 100 USD is never converted again here. What was entered labels the row (#2525).
    expect(within(card).getAllByText('+92,00 €')).toHaveLength(2);
    expect(within(card).queryByText(/100,00/)).toBeNull();
    expect(await within(card).findByText('$100.00')).toBeInTheDocument();
    // Received and still pending both lower her cost, each line with its one row.
    expect(within(card).getAllByText('−15,00 €')).toHaveLength(2);
    expect(within(card).getAllByText('−16,00 €')).toHaveLength(2);
    expect(within(card).getByText('Dinner')).toBeInTheDocument();
    expect(within(card).queryByText('Taxi')).toBeNull();
    expect(within(card).getAllByText(/^bob → /)).toHaveLength(2);

    // Opening Bob closes Alice: what he sent back and what he still owes raise his.
    await user.click(within(card).getByRole('button', { name: /bob/ }));
    expect(alice).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).getAllByText('+30,00 €')).toHaveLength(2);
    expect(within(card).getAllByText('+15,00 €')).toHaveLength(2);
    expect(within(card).getAllByText('+16,00 €')).toHaveLength(2);
    expect(within(card).getByText('Taxi')).toBeInTheDocument();
    expect(within(card).queryByText('Dinner')).toBeNull();
  });

  it('FE-W5COSTS-005: the category breakdown ranks categories by spend', async () => {
    mount([dinner(), taxi()]);

    await screen.findByText('Dinner');
    const breakdown = screen.getByRole('region', { name: 'By category' }) as HTMLElement;
    const labels = within(breakdown)
      .getAllByText(/Food & drink|Transport/)
      .map((el) => el.textContent);
    // Bars are ordered by spend, so the 90 € food row comes before the 30 € taxi.
    expect(labels).toEqual(['Food & drink', 'Transport']);
    expect(within(breakdown).getByText('90 €')).toBeInTheDocument();
    expect(within(breakdown).getByText('30 €')).toBeInTheDocument();
  });

  it('FE-W5COSTS-006: an empty trip shows the empty ledger and the empty breakdown', async () => {
    mount([]);

    expect(await screen.findByText('No expenses yet. Add your first one.')).toBeInTheDocument();
    expect(screen.getByText('No expenses yet.')).toBeInTheDocument();
    expect(await screen.findByText("Everyone's square")).toBeInTheDocument();
  });

  it('FE-W5COSTS-007: an unknown currency falls back to a plainly formatted amount', async () => {
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: '' } });
    seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'XX' }) });
    mount([expense({ id: 110, name: 'Mystery', category: 'other', total_price: 90 })]);

    await screen.findByText('Mystery');
    const card = screen.getByRole('region', { name: 'Total trip spend' });
    expect(card).toHaveTextContent('90.00 XX');
  });
});

describe('CostsPanel — settle up', () => {
  beforeEach(seedAlice);

  const flows: Flow[] = [
    { from: { user_id: 2, username: 'bob' }, to: { user_id: 1, username: 'alice' }, amount: 45 },
    { from: { user_id: 3, username: 'cara' }, to: { user_id: 1, username: 'alice' }, amount: 15 },
  ];

  it('FE-W5COSTS-008: outstanding flows are listed and settling one records the transfer', async () => {
    const posted: Record<string, unknown>[] = [];
    server.use(
      http.post('/api/trips/1/budget/settlements', async ({ request }) => {
        posted.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ settlement: { id: 1 } });
      })
    );
    mount([], { flows: [flows[0]] });

    await screen.findByText('45,00 €');
    // The "you're owed" card names who still owes me.
    expect(screen.getByText("You're owed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Settle(:|$)/ }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ from_user_id: 2, to_user_id: 1, amount: 45, currency: 'EUR' });
  });

  it('FE-W5COSTS-009: Settle up clears every outstanding flow at once', async () => {
    const posted: Record<string, unknown>[] = [];
    server.use(
      http.post('/api/trips/1/budget/settlements', async ({ request }) => {
        posted.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ settlement: { id: 1 } });
      })
    );
    mount([], { flows });

    const settleAll = await screen.findByRole('button', { name: 'Settle up' });
    await waitFor(() => expect(settleAll).not.toBeDisabled());
    fireEvent.click(settleAll);

    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted.map((p) => p.amount)).toEqual([45, 15]);
  });

  it('FE-W5COSTS-010: Settle up is disabled while nothing is outstanding', async () => {
    mount([]);

    expect(await screen.findByRole('button', { name: 'Settle up' })).toBeDisabled();
  });

  it('FE-W5COSTS-011: a failing settle surfaces an error toast', async () => {
    const addToast = vi.fn();
    window.__addToast = addToast as unknown as typeof window.__addToast;
    server.use(http.post('/api/trips/1/budget/settlements', () => HttpResponse.json({ error: 'no' }, { status: 500 })));
    mount([], { flows: [flows[0]] });

    fireEvent.click(await screen.findByRole('button', { name: /^Settle(:|$)/ }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Unknown error', 'error', undefined));

    addToast.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Settle up' }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Unknown error', 'error', undefined));
    delete window.__addToast;
  });

  it('FE-W5COSTS-012: undoing a payment deletes it, and a failure is reported', async () => {
    const addToast = vi.fn();
    window.__addToast = addToast as unknown as typeof window.__addToast;
    let deleted = 0;
    server.use(
      http.delete('/api/trips/1/budget/settlements/7', () => {
        deleted += 1;
        return deleted === 1
          ? HttpResponse.json({ success: true })
          : HttpResponse.json({ error: 'no' }, { status: 500 });
      })
    );
    mount([], {
      settlements: [{ id: 7, from_user_id: 2, to_user_id: 1, amount: 30, created_at: '2025-06-16 10:00:00' }],
    });

    fireEvent.click(await screen.findByRole('button', { name: /^Undo(:|$)/ }));
    await waitFor(() => expect(deleted).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: /^Undo(:|$)/ }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Unknown error', 'error', undefined));
    delete window.__addToast;
  });

  it('FE-W5COSTS-059: a settle-up that fails midway still reloads the transfers that went through', async () => {
    const addToast = vi.fn();
    window.__addToast = addToast as unknown as typeof window.__addToast;
    let posted = 0;
    let reads = 0;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => {
        reads += 1;
        return HttpResponse.json({ balances: [], flows: posted > 0 ? [flows[1]] : flows, settlements: [] });
      }),
      http.post('/api/trips/1/budget/settlements', () => {
        posted += 1;
        return posted === 1
          ? HttpResponse.json({ settlement: { id: 1 } })
          : HttpResponse.json({ error: 'no' }, { status: 500 });
      })
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    const settleAll = await screen.findByRole('button', { name: 'Settle up' });
    await waitFor(() => expect(settleAll).not.toBeDisabled());
    const readsBefore = reads;
    fireEvent.click(settleAll);

    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Unknown error', 'error', undefined));
    // The failed second transfer must not swallow the refresh: bob's 45 € was
    // recorded, and leaving it listed invites a second, doubled settle-up.
    await waitFor(() => expect(reads).toBeGreaterThan(readsBefore));
    expect(posted).toBe(2);
    delete window.__addToast;
  });

  it('FE-W5COSTS-060: a settlement read that fails says so instead of claiming everyone is square', async () => {
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ error: 'no' }, { status: 500 }))
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await screen.findByText('Balances');
    // Settle up, Balances and Final budget all hang off the one failed request.
    await waitFor(() => expect(screen.getAllByText('Unknown error')).toHaveLength(3));
    expect(screen.queryByText("Everyone's square")).toBeNull();
    expect(screen.queryAllByText("You're all settled up")).toHaveLength(0);
    expect(screen.getByRole('region', { name: 'You owe' })).not.toHaveTextContent('$0.00');
    expect(screen.getByRole('region', { name: "You're owed" })).not.toHaveTextContent('$0.00');
  });

  it('FE-W5COSTS-013: the "you owe" card lists who I still have to pay', async () => {
    mount([], {
      flows: [{ from: { user_id: 1, username: 'alice' }, to: { user_id: 2, username: 'bob' }, amount: 20 }],
    });

    await screen.findByText('You owe');
    const card = screen.getByRole('region', { name: 'You owe' }) as HTMLElement;
    expect(await within(card).findByText('To')).toBeInTheDocument();
    expect(within(card).getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('Nothing owed to you')).toBeInTheDocument();
  });
});

describe('CostsPanel — expense rows', () => {
  beforeEach(() => {
    seedAlice();
    clearExchangeRateCache();
  });
  afterEach(clearExchangeRateCache);

  it('FE-W5COSTS-020: each expense row shows who fronted it and the day subtotal', async () => {
    mount([dinner(), taxi()]);

    await screen.findByText('Dinner');
    // Each row carries a payer chip plus the row total, both in the base currency.
    expect(screen.getAllByText('90,00 €')).toHaveLength(2);
    expect(screen.getAllByText('30,00 €')).toHaveLength(2);
    // Days are grouped, each with its own spent line.
    expect(screen.getByText('90,00 € spent')).toBeInTheDocument();
    expect(screen.getByText('30,00 € spent')).toBeInTheDocument();
    // Same-currency rows show the category alone, with no conversion suffix.
    expect(screen.getAllByText('Food & drink')).toHaveLength(2);
  });

  it('FE-W5COSTS-021: a foreign-currency expense shows the original and the converted amount', async () => {
    localStorage.setItem('trek_fx_EUR', JSON.stringify({ rates: { EUR: 1, USD: 2 }, ts: Date.now() }));
    mount(
      [
        expense({
          id: 130,
          name: 'Diner',
          category: 'food',
          total_price: 100,
          currency: 'USD',
          expense_date: '2025-06-15',
          payers: [{ user_id: 1, amount: 100 }],
          members: [
            { user_id: 1, username: 'alice' },
            { user_id: 2, username: 'bob' },
          ],
        }),
      ],
      {
        settlements: [
          { id: 8, from_user_id: 2, to_user_id: 1, amount: 20, currency: 'USD', created_at: '2025-06-15 09:00:00' },
        ],
      }
    );

    await screen.findByText('Diner');
    expect(screen.getByText(/\$100\.00 → 50,00 €/)).toBeInTheDocument();
    // The payer chip and the settlement row are converted the same way.
    expect(await screen.findByText(/\$20\.00 → 10,00 €/)).toBeInTheDocument();
  });

  it('FE-W5COSTS-078: a booked rate outlives the live one, for the expense and for the transfer', async () => {
    // What a tester hit after settling up: the euro moved, and so did a bill that had
    // already been paid. A cost is money that changed hands at a rate that was true that
    // day, so the frozen rate wins over whatever the market says this morning.
    localStorage.setItem('trek_fx_EUR', JSON.stringify({ rates: { EUR: 1, USD: 2 }, ts: Date.now() }));
    mount(
      [
        expense({
          id: 131,
          name: 'Diner',
          category: 'food',
          total_price: 120,
          currency: 'USD',
          exchange_rate: 1.2,
          expense_date: '2025-06-15',
          payers: [{ user_id: 1, amount: 120 }],
          members: [
            { user_id: 1, username: 'alice' },
            { user_id: 2, username: 'bob' },
          ],
        }),
      ],
      {
        settlements: [
          {
            id: 9,
            from_user_id: 2,
            to_user_id: 1,
            amount: 24,
            currency: 'USD',
            exchange_rate: 1.2,
            created_at: '2025-06-15 09:00:00',
          },
        ],
      }
    );

    await screen.findByText('Diner');
    // 120 USD at the booked 1.2 per euro is 100 euro. At today's 2 it would read 60,00 euro.
    expect(screen.getByText(/\$120\.00 → 100,00 €/)).toBeInTheDocument();
    expect(screen.queryByText(/60,00 €/)).toBeNull();
    // The settled transfer is read back the same way: 24 USD booked at 1.2 is 20 euro.
    expect(await screen.findByText(/\$24\.00 → 20,00 €/)).toBeInTheDocument();
  });

  it('FE-W5COSTS-023: ?create=expense opens the add modal straight away', async () => {
    mount([], {}, ['/trips/1?create=expense']);

    expect(await screen.findByPlaceholderText('e.g. Dinner, souvenirs, gas…')).toBeInTheDocument();
  });

  it('FE-W5COSTS-024: a viewer without edit rights gets no write affordances', async () => {
    seedStore(usePermissionsStore, { permissions: { budget_edit: 'admin' } });
    mount([dinner()], {
      flows: [{ from: { user_id: 2, username: 'bob' }, to: { user_id: 1, username: 'alice' }, amount: 45 }],
      settlements: [{ id: 7, from_user_id: 2, to_user_id: 1, amount: 30, created_at: '2025-06-16 10:00:00' }],
    });

    await screen.findByText('Dinner');
    expect(screen.queryByRole('button', { name: 'Add expense' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settle up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Settle(:|$)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete(:|$)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Undo(:|$)/ })).not.toBeInTheDocument();
  });
});

describe('CostsPanel — mobile layout', () => {
  const desktopMatchMedia = window.matchMedia;

  beforeEach(() => {
    seedAlice();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('1023'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = desktopMatchMedia;
  });

  it('FE-W5COSTS-025: the mobile column stacks the totals, owe/owed and outstanding cards', async () => {
    mount(
      [
        dinner(),
        expense({
          id: 140,
          name: 'Hotel',
          category: 'accommodation',
          total_price: 60,
          payers: [],
          members: [{ user_id: 1, username: 'alice' }],
        }),
      ],
      {
        flows: [{ from: { user_id: 2, username: 'bob' }, to: { user_id: 1, username: 'alice' }, amount: 45 }],
      }
    );

    await screen.findByText('Hotel');
    // The desktop summary grid is replaced by the mobile stack.
    expect(document.querySelector('.costs-summary')).toBeNull();
    expect(screen.getByText('Total trip spend')).toBeInTheDocument();
    expect(screen.getByText('You owe')).toBeInTheDocument();
    expect(screen.getByText("You're owed")).toBeInTheDocument();
    expect(screen.getByText('Outstanding amount')).toBeInTheDocument();
    // The unfinished expense is flagged with a badge on its icon instead of a pill.
    expect(screen.getByRole('img', { name: 'Total only: not settled yet' })).toHaveTextContent('!');
    expect(screen.queryByText('Unfinished')).not.toBeInTheDocument();
  });

  it('FE-W5COSTS-026: the mobile ledger keeps search, filters and the empty text', async () => {
    const user = userEvent.setup();
    mount([dinner()]);

    await screen.findByText('Dinner');
    await user.type(screen.getByPlaceholderText('Search expenses…'), 'zzz');
    expect(screen.getByText('No expenses match your search.')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('Search expenses…'));
    fireEvent.click(screen.getByRole('button', { name: /All days/ }));
    pickOption('Sun, Jun 15');
    expect(screen.getByText('Sunday, June 15')).toBeInTheDocument();
  });

  it('FE-W5COSTS-027: the mobile total card opens the add-expense modal', async () => {
    mount([]);

    // isMobile settles in an effect, which swaps the whole body out.
    await waitFor(() => expect(document.querySelector('.costs-summary')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(await screen.findByPlaceholderText('e.g. Dinner, souvenirs, gas…')).toBeInTheDocument();
  });
});

describe('CostsPanel — remaining paths', () => {
  beforeEach(seedAlice);

  it('FE-W5COSTS-042: the CSV export escapes, orders and strips ticket notes', async () => {
    seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'EUR', title: '///' }) });
    let exported: Blob | null = null;
    let downloadName = '';
    const createObjURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      exported = b as Blob;
      return 'blob:mock';
    });
    const revokeObjURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloadName = this.download;
    });
    mount([
      expense({
        id: 201,
        name: 'Dinner "deluxe"',
        category: 'food',
        total_price: 90,
        expense_date: '2025-06-15',
        note: 'with;semicolon',
      }),
      expense({
        id: 202,
        name: 'Tickets',
        category: 'activities',
        total_price: 20,
        expense_date: '2025-06-14',
        note: 'TICKETJSON:{"items":[]}',
      }),
      expense({ id: 203, name: 'Tip', category: 'tips', total_price: 5, expense_date: null, note: null }),
    ]);

    await screen.findByText('Tip');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    const lines = (await exported!.text()).replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toBe('Date;Name;Category;Amount;Currency;Amount (EUR);Note');
    // Oldest first, dateless rows leading.
    expect(lines[1]).toBe(';Tip;Tips;5.00;EUR;5.00;');
    // The ticket payload is machine data, so it never reaches the note column.
    expect(lines[2]).toBe('06/14/2025;Tickets;Activities;20.00;EUR;20.00;');
    expect(lines[3]).toBe('06/15/2025;"Dinner ""deluxe""";Food & drink;90.00;EUR;90.00;"with;semicolon"');
    // A title made only of illegal characters still yields a usable file name.
    expect(downloadName).toBe('costs-.csv');
    createObjURL.mockRestore();
    revokeObjURL.mockRestore();
    clickSpy.mockRestore();
  });

  it('FE-W5COSTS-061: the CSV export neutralises names a spreadsheet would run as a formula', async () => {
    seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'EUR', title: 'Rome' }) });
    let exported: Blob | null = null;
    const createObjURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      exported = b as Blob;
      return 'blob:mock';
    });
    const revokeObjURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount([
      expense({
        id: 204,
        name: '=HYPERLINK("http://evil","click")',
        category: 'food',
        total_price: 12,
        expense_date: '2025-06-15',
        note: '@SUM(A1:A9)',
      }),
      expense({ id: 205, name: '-5 refund', category: 'misc', total_price: 5, expense_date: '2025-06-16', note: null }),
    ]);

    await screen.findByText('-5 refund');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    const lines = (await exported!.text()).replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[1]).toBe(
      '06/15/2025;"\'=HYPERLINK(""http://evil"",""click"")";Food & drink;12.00;EUR;12.00;\'@SUM(A1:A9)'
    );
    expect(lines[2]).toBe("06/16/2025;'-5 refund;Other;5.00;EUR;5.00;");
    createObjURL.mockRestore();
    revokeObjURL.mockRestore();
    clickSpy.mockRestore();
  });

  it('FE-W5COSTS-044: both modals can be dismissed with Cancel', async () => {
    const user = userEvent.setup();
    mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('e.g. Dinner, souvenirs, gas…')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add payment' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('0.00')).not.toBeInTheDocument();
  });

  it('FE-W5COSTS-045: an explicit member amount is used as my share instead of an equal split', async () => {
    mount([
      expense({
        id: 210,
        name: 'Dinner',
        category: 'food',
        total_price: 100,
        payers: [{ user_id: 2, amount: 100 }],
        members: [
          { user_id: 1, username: 'alice', amount: 80 },
          { user_id: 2, username: 'bob', amount: 20 },
        ],
      }),
    ]);

    await screen.findByText('Dinner');
    const card = screen.getByRole('region', { name: 'Total trip spend' }) as HTMLElement;
    // Not the 50/50 an equal split would have produced.
    expect(within(card).getByText('80 €')).toBeInTheDocument();
    expect(within(card).getByText('0 €')).toBeInTheDocument();
  });

  it('FE-W5COSTS-046: an expense I am not part of contributes nothing to my share', async () => {
    mount([
      expense({
        id: 211,
        name: 'Bob solo',
        category: 'food',
        total_price: 40,
        payers: [{ user_id: 2, amount: 40 }],
        members: [{ user_id: 2, username: 'bob' }],
      }),
    ]);

    await screen.findByText('Bob solo');
    const card = screen.getByRole('region', { name: 'Total trip spend' }) as HTMLElement;
    expect(within(card).getAllByText('0 €')).toHaveLength(2);
  });

  it('FE-W5COSTS-047: with no display and no trip currency the panel falls back to euro', async () => {
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: '' } });
    seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: '' }) });
    mount([expense({ id: 220, name: 'Dinner', category: 'food', total_price: 90, currency: null })]);

    await screen.findByText('Dinner');
    const card = screen.getByRole('region', { name: 'Total trip spend' });
    expect(card).toHaveTextContent('90,00 €');
  });

  it('FE-W5COSTS-048: a payment in a currency with no symbol keeps its code, and the sender can be swapped', async () => {
    const user = userEvent.setup();
    let put: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/trips/1/budget/settlements/9', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ settlement: { id: 9 } });
      })
    );
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () =>
        HttpResponse.json({
          balances: [],
          flows: [],
          settlements: [
            { id: 9, from_user_id: 2, to_user_id: 1, amount: 30, currency: 'XBT', created_at: '2025-06-16 10:00:00' },
          ],
        })
      )
    );
    render(<CostsPanel tripId={1} tripMembers={[...tripMembers, { id: 3, username: 'cara', avatar_url: null }]} />);

    await user.click(await screen.findByRole('button', { name: /^Edit(:|$)/ }));
    // No symbol is known, so the code itself prefixes the amount and labels the option.
    await screen.findByPlaceholderText('0.00');
    expect(screen.getAllByText('XBT').length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole('button', { name: 'bob' }));
    pickOption('cara');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(put).toBeTruthy());
    expect(put).toMatchObject({ from_user_id: 3, to_user_id: 1, amount: 30, currency: 'XBT' });
  });

  it('FE-W5COSTS-055: an expense in a currency with no symbol prefixes the code', async () => {
    const user = userEvent.setup();
    mount([
      expense({
        id: 240,
        name: 'Mining rig',
        category: 'other',
        total_price: 2,
        currency: 'XBT',
        payers: [{ user_id: 1, amount: 2 }],
        members: [{ user_id: 1, username: 'alice' }],
      }),
    ]);

    await screen.findByText('Mining rig');
    await user.click(screen.getByRole('button', { name: /^Edit(:|$)/ }));

    // XBT is unknown to the locale map → dot separator, two decimals (#2175).
    expect(await screen.findByDisplayValue('2.00')).toBeInTheDocument();
    expect(screen.getAllByText('XBT').length).toBeGreaterThanOrEqual(2);
  });

  it('FE-W5COSTS-049: a solo trip defaults the payment counterpart to myself', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(<CostsPanel tripId={1} tripMembers={[{ id: 1, username: 'alice', avatar_url: null }]} />);

    await user.click(await screen.findByRole('button', { name: 'Add payment' }));
    await user.type(await screen.findByPlaceholderText('0,00'), '10');

    // From and To both resolve to me, so the transfer stays unsavable.
    const submits = screen.getAllByRole('button', { name: 'Add payment' });
    expect(submits[submits.length - 1]).toBeDisabled();
  });

  it('FE-W5COSTS-050: the expense modal shows uploaded avatars and rejects over-precise input', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(
      <CostsPanel
        tripId={1}
        tripMembers={[
          { id: 1, username: 'alice', avatar_url: '/uploads/avatars/a.png' },
          { id: 2, username: 'bob', avatar_url: '/uploads/avatars/b.png' },
        ]}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(screen.getByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Dinner');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '100');

    // Payer rows and split rows both fall back to the uploaded picture.
    await user.click(screen.getByRole('button', { name: 'Multiple people paid' }));
    expect(document.querySelectorAll('img[src="/uploads/avatars/b.png"]').length).toBeGreaterThanOrEqual(2);

    // Excluding Bob leaves the include hint; tapping it puts him back on the bill.
    await user.click(screen.getAllByTestId('payer-toggle')[1]);
    await user.click(screen.getAllByTestId('payer-toggle')[1]);
    await user.click(screen.getAllByTestId('payer-toggle')[1]);
    expect(screen.getAllByTestId('payer-amount')).toHaveLength(2);

    // Three decimals are not a valid money amount, so the field ignores them.
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    const splitInput = screen.getAllByPlaceholderText('50,00')[0] as HTMLInputElement;
    await user.type(splitInput, '12,345');
    expect(splitInput.value).toBe('12,34');
  });

  it('FE-W5COSTS-051: ticket prices ignore an over-precise entry and participants toggle back on', async () => {
    const user = userEvent.setup();
    mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(screen.getByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Groceries');
    await user.click(screen.getByRole('button', { name: 'Ticket' }));
    await user.click(screen.getByRole('button', { name: /Add item/i }));

    await user.type(screen.getByPlaceholderText('Item name'), 'Apples');
    const price = screen.getAllByPlaceholderText('0,00')[1] as HTMLInputElement;
    await user.type(price, '10,999');
    expect(price.value).toBe('10,99');

    // Toggling a participant off and on again leaves the shares unchanged.
    const bob = screen.getAllByRole('checkbox', { name: /bob/i })[0];
    await user.click(bob);
    await user.click(bob);
    // 10.99 across two people leaves the odd cent with the lower user id.
    expect(screen.getByText('Individual shares')).toBeInTheDocument();
    expect(screen.getByText('5,50 €')).toBeInTheDocument();
    expect(screen.getByText('5,49 €')).toBeInTheDocument();
  });
});

describe('CostsPanel — mobile extras', () => {
  const desktopMatchMedia = window.matchMedia;

  beforeEach(() => {
    seedAlice();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('1023'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = desktopMatchMedia;
  });

  it('FE-W5COSTS-052: the mobile ledger filters by owner and by category', async () => {
    mount([dinner(), taxi()]);

    await screen.findByText('Taxi');
    fireEvent.click(screen.getByRole('button', { name: 'Paid by me' }));
    expect(screen.queryByText('Taxi')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: /All categories/ }));
    pickOption('Transport');
    expect(screen.getByText('Taxi')).toBeInTheDocument();
    expect(screen.queryByText('Dinner')).not.toBeInTheDocument();
  });

  it('FE-W5COSTS-053: the mobile settle-up card can record a manual payment', async () => {
    mount([]);

    await waitFor(() => expect(document.querySelector('.costs-summary')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Add payment' }));

    expect(await screen.findByPlaceholderText('0,00')).toBeInTheDocument();
  });

  it('FE-W5COSTS-062: the mobile search box keeps the caret across keystrokes', async () => {
    const user = userEvent.setup();
    mount([dinner(), taxi()]);

    await screen.findByText('Taxi');
    const box = screen.getByPlaceholderText('Search expenses…');
    await user.type(box, 'din');

    // The whole word has to land: if the body is remounted per keystroke the input
    // loses focus and everything after the first character goes nowhere.
    expect((box as HTMLInputElement).value).toBe('din');
    expect(document.activeElement).toBe(box);
    expect(screen.queryByText('Taxi')).not.toBeInTheDocument();
  });

  it('FE-W5COSTS-054: an unknown currency degrades to a plain amount on mobile too', async () => {
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: '' } });
    seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'XX' }) });
    mount([expense({ id: 230, name: 'Mystery', category: 'other', total_price: 90 })]);

    await screen.findByText('Mystery');
    expect(screen.getByText('Total trip spend').parentElement).toHaveTextContent('90.00 XX');
  });
});

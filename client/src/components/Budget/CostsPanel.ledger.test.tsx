// organize-imports-ignore
// sort-imports-ignore
// Preserve the original test runtime module evaluation order.
import { invalidateOfflineSession } from '../../db/offlineDb';
import { invalidateTripReads } from '../../store/tripReadScope';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { render, screen, waitFor, within } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/helpers/msw/server';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { useSettingsStore } from '../../store/settingsStore';
import '../../store/permissionsStore';
import '../../hooks/useExchangeRates';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildUser, buildTrip, buildBudgetItem } from '../../../tests/helpers/factories';
import CostsPanel from './CostsPanel';
import './CostsPanel.helpers';
import './useFreezeMissingRates';
import { tripMembers, bobInForm, mount, pickOption, seedAlice } from '../../../tests/helpers/costsPanel/fixtures';

beforeEach(async () => {
  invalidateTripReads();
  invalidateOfflineSession();
  await resetOfflineTestDatabase();
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'EUR' }) });
});

describe('CostsPanel — settlements in the ledger', () => {
  it('renders a settle-up payment as a ledger row with an undo action', async () => {
    const item = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Dinner' }),
      total_price: 90,
      expense_date: '2025-06-15',
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] })),
      http.get('/api/trips/1/budget/settlement', () =>
        HttpResponse.json({
          balances: [],
          flows: [],
          settlements: [
            {
              id: 7,
              trip_id: 1,
              from_user_id: 2,
              to_user_id: 1,
              amount: 30,
              created_at: '2025-06-16 10:00:00',
              from_username: 'bob',
              to_username: 'alice',
            },
          ],
        })
      )
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    // The expense and the settlement (payment) both appear in the unified ledger.
    await screen.findByText('Dinner');
    await screen.findByText('Payment');
    // The payment row exposes an inline undo (no need to open a separate History modal).
    expect(screen.getByRole('button', { name: /^Undo(:|$)/ })).toBeInTheDocument();
  });

  it('records a manual payment via the Add payment button', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.post('/api/trips/1/budget/settlements', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ settlement: { id: 1, ...posted } });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await user.click(await screen.findByRole('button', { name: 'Add payment' }));
    await user.type(await screen.findByPlaceholderText('0,00'), '25');
    // The footer submit is the second "Add payment" control once the modal is open.
    const addButtons = screen.getAllByRole('button', { name: 'Add payment' });
    const submit = addButtons[addButtons.length - 1];
    await user.click(submit);
    await waitFor(() => expect(posted).toMatchObject({ amount: 25 }));
  });

  it('hides payment rows while a text search is active', async () => {
    const item = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Dinner' }),
      total_price: 90,
      expense_date: '2025-06-15',
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] })),
      http.get('/api/trips/1/budget/settlement', () =>
        HttpResponse.json({
          balances: [],
          flows: [],
          settlements: [
            {
              id: 7,
              trip_id: 1,
              from_user_id: 2,
              to_user_id: 1,
              amount: 30,
              created_at: '2025-06-16 10:00:00',
              from_username: 'bob',
              to_username: 'alice',
            },
          ],
        })
      )
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await screen.findByText('Payment');
    await user.type(screen.getByPlaceholderText('Search expenses…'), 'Dinner');
    // Payment rows have no name, so a search hides them while the matching expense stays.
    expect(screen.queryByText('Payment')).not.toBeInTheDocument();
    expect(screen.getByText('Dinner')).toBeInTheDocument();
  });

  it('supports custom split amounts on save', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: { ...buildBudgetItem({ trip_id: 1, name: 'Dinner' }), id: 5 } });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(await screen.findByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Dinner');
    const nums = () => screen.getAllByPlaceholderText('0,00') as HTMLInputElement[];
    await user.type(nums()[0], '100'); // total = 100

    await user.click(screen.getByRole('button', { name: /Custom/i }));

    const customInputs = screen.getAllByPlaceholderText('50,00');
    await user.type(customInputs[0], '30');
    await user.type(customInputs[1], '70');

    const addBtns = screen.getAllByRole('button', { name: 'Add expense' });
    await user.click(addBtns[addBtns.length - 1]); // footer submit
    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted!.total_price).toBe(100);
    expect(posted!.payers).toEqual([expect.objectContaining({ amount: 100 })]);
    expect(posted!.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: 1, amount: 30 }),
        expect.objectContaining({ user_id: 2, amount: 70 }),
      ])
    );
  });

  it('accepts a comma as the decimal separator in the total amount (#1256)', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: { ...buildBudgetItem({ trip_id: 1, name: 'AirTags' }), id: 6 } });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(await screen.findByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'AirTags');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '39,99'); // comma → normalized to 39.99

    const addBtns = screen.getAllByRole('button', { name: 'Add expense' });
    await user.click(addBtns[addBtns.length - 1]); // footer submit
    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted!.total_price).toBe(39.99);
  });

  it('marks an expense with no payer as Unfinished', async () => {
    const item = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Hotel' }),
      total_price: 90,
      payers: [],
      members: [{ user_id: 1, username: 'alice', paid: 0 }],
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);
    await screen.findByText('Hotel');
    expect(screen.getByText('Unfinished')).toBeInTheDocument();
  });

  // ── Notes on an expense (#1658) ────────────────────────────────────────────

  it('shows a note on the row and expands it on click', async () => {
    const long = 'Bought the whole week of breakfasts here, Ben pays back his half once the card statement lands';
    const item = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Supermarket' }),
      total_price: 60,
      note: long,
      payers: [{ user_id: 1, amount: 60, username: 'alice' }],
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    // Re-queried after each click: the row is re-created on every render of the
    // panel, so a handle taken before the click points at a detached node.
    const noteToggle = () => screen.getByRole('button', { name: new RegExp(long.slice(0, 20)) });
    await screen.findByText('Supermarket');
    expect(noteToggle()).toHaveAttribute('aria-expanded', 'false');
    await user.click(noteToggle());
    expect(noteToggle()).toHaveAttribute('aria-expanded', 'true');
    await user.click(noteToggle());
    expect(noteToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('never renders a receipt blob as a note', async () => {
    const item = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Market' }),
      total_price: 20,
      // How the receipt was stored before it got its own column.
      note: 'TICKETJSON:{"items":[{"name":"Cheese","price":"20","parts":[1]}]}',
      payers: [{ user_id: 1, amount: 20, username: 'alice' }],
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await screen.findByText('Market');
    expect(screen.queryByText(/TICKETJSON/)).toBeNull();
  });

  it('keeps an existing note when the expense is saved again', async () => {
    const item = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Lunch' }),
      total_price: 30,
      note: 'split with the neighbours',
      payers: [{ user_id: 1, amount: 30, username: 'alice' }],
    };
    let patched: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.put('/api/trips/1/budget/:id', async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: { ...item, ...patched } });
      })
    );
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await screen.findByText('Lunch');
    await user.click(screen.getAllByRole('button', { name: /^Edit(:|$)/ })[0]);
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patched).toBeTruthy());
    expect(patched!.note).toBe('split with the neighbours');
  });

  it('shows the net hint on a settled expense row and hides it while unfinished', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
    // alice fronted the whole 90 for a two-way split, so she is 45 up.
    const lent = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Dinner' }),
      total_price: 90,
      payers: [{ user_id: 1, amount: 90, username: 'alice' }],
      members: [
        { user_id: 1, username: 'alice', paid: 1 },
        { user_id: 2, username: 'bob', paid: 0 },
      ],
    };
    const unpaid = {
      ...buildBudgetItem({ trip_id: 1, category: 'lodging', name: 'Hotel' }),
      total_price: 90,
      payers: [],
      members: [
        { user_id: 1, username: 'alice', paid: 0 },
        { user_id: 2, username: 'bob', paid: 0 },
      ],
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [lent, unpaid] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    const dinnerRow = (await screen.findByText('Dinner')).closest('.exp-row') as HTMLElement;
    expect(within(dinnerRow).getByText(/you lent/)).toHaveTextContent('45');

    const hotelRow = (await screen.findByText('Hotel')).closest('.exp-row') as HTMLElement;
    expect(within(hotelRow).queryByText(/you lent|you borrowed/)).toBeNull();
  });

  it('lists who an expense is split between, with each part, in the row (#1763)', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
    const custom = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Dinner' }),
      total_price: 90,
      payers: [{ user_id: 1, amount: 90, username: 'alice' }],
      members: [
        { user_id: 1, username: 'alice', paid: 1, amount: 60 },
        { user_id: 2, username: 'bob', paid: 0, amount: 30 },
      ],
    };
    const crowd = {
      ...buildBudgetItem({ trip_id: 1, category: 'activity', name: 'Boat' }),
      total_price: 80,
      payers: [{ user_id: 1, amount: 80, username: 'alice' }],
      members: Array.from({ length: 8 }, (_, i) => ({ user_id: i + 1, username: `p${i + 1}`, paid: 0 })),
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [custom, crowd] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    const dinnerRow = (await screen.findByText('Dinner')).closest('.exp-row') as HTMLElement;
    const chips = within(dinnerRow).getAllByTestId('split-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveTextContent('60');
    expect(chips[1]).toHaveTextContent('30');
    // alice marked her part as paid; bob has not.
    expect(within(chips[0]).getByLabelText('paid')).toBeInTheDocument();
    expect(within(chips[1]).queryByLabelText('paid')).toBeNull();

    // Eight people fold into five chips and a "+3".
    const boatRow = (await screen.findByText('Boat')).closest('.exp-row') as HTMLElement;
    expect(within(boatRow).getAllByTestId('split-chip')).toHaveLength(5);
    expect(within(boatRow).getByText('+3')).toBeInTheDocument();
    expect(within(boatRow).getAllByTestId('split-chip')[0]).toHaveTextContent('10');
  });

  it('sums only unfinished expenses in the Outstanding amount card', async () => {
    // Display in the trip's own currency so FX conversion is an identity — keeps the asserted sum deterministic.
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
    const paid = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Dinner' }),
      total_price: 60,
      payers: [{ user_id: 1, amount: 60, username: 'alice' }],
      members: [{ user_id: 1, username: 'alice', paid: 1 }],
    };
    const unfinishedA = {
      ...buildBudgetItem({ trip_id: 1, category: 'lodging', name: 'Hotel' }),
      total_price: 90,
      payers: [],
      members: [{ user_id: 1, username: 'alice', paid: 0 }],
    };
    const unfinishedB = {
      ...buildBudgetItem({ trip_id: 1, category: 'transport', name: 'Taxi' }),
      total_price: 30,
      payers: [],
      members: [{ user_id: 1, username: 'alice', paid: 0 }],
    };
    const zero = {
      ...buildBudgetItem({ trip_id: 1, category: 'misc', name: 'Freebie' }),
      total_price: 0,
      payers: [],
      members: [{ user_id: 1, username: 'alice', paid: 0 }],
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [paid, unfinishedA, unfinishedB, zero] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    // Footer only shows the count once unfinished expenses have loaded.
    const foot = await screen.findByText('expenses need a payer');
    expect(foot).toHaveTextContent('2 expenses need a payer'); // the two payer-less, non-zero expenses
    // Sum is 90 + 30 = 120 — the paid (60) and zero-total items are excluded.
    // Sum is 90 + 30 = 120 — the paid (60) and zero-total items are excluded.
    const card = screen.getByRole('region', { name: 'Outstanding amount' });
    expect(card).toHaveTextContent('120'); // 120,00 € (locale separator), i.e. 90 + 30
  });

  // #2225 follow-up — the ledger stopped charging payer-less expenses, but this
  // tile kept counting them, so it contradicted the balances right beside it.
  it('keeps a payer-less expense out of Your share, like the balances do', async () => {
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
    seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
    const paid = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Dinner' }),
      total_price: 60,
      payers: [{ user_id: 1, amount: 60, username: 'alice' }],
      members: [{ user_id: 1, username: 'alice', paid: 1 }],
    };
    const noPayer = {
      ...buildBudgetItem({ trip_id: 1, category: 'transport', name: 'Taxi' }),
      total_price: 40,
      payers: [],
      members: [{ user_id: 1, username: 'alice', paid: 0 }],
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [paid, noPayer] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await screen.findByText('Taxi');
    // "Your share" is the first of the two bold figures in the Total spend card's
    // footer; the second is "You paid". 60 from the paid expense only — the 40
    // nobody has paid for is not a share, though it still counts as spend.
    const card = screen.getByRole('region', { name: 'Total trip spend' })!;
    const figures = [...card.querySelectorAll('b')].map((b) => b.textContent ?? '');
    expect(figures[0]).toContain('60');
    expect(figures[0]).not.toContain('100');
  });

  it('records a recorded-total expense with nobody to split with (#1286)', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: { ...buildBudgetItem({ trip_id: 1, name: 'Hotel' }), id: 9 } });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(await screen.findByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Hotel');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '120'); // total only, paid on-site later

    // Deselect everyone so the cost carries no split, and mark it as unpaid: a picked
    // payer now always goes out (#1766), so "nobody paid" must be said explicitly.
    await user.click(screen.getByRole('checkbox', { name: 'You' }));
    await user.click(screen.getByRole('checkbox', { name: 'bob' }));
    await user.click(screen.getByRole('radio', { name: 'No one paid yet' }));

    const addBtns = screen.getAllByRole('button', { name: 'Add expense' });
    const submit = addBtns[addBtns.length - 1]; // footer submit
    expect(submit).not.toBeDisabled();
    await user.click(submit);

    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted!.total_price).toBe(120);
    expect(posted!.member_ids).toEqual([]);
    expect(posted!.payers).toEqual([]);
  });

  it('keeps a picked payer when nobody splits the expense (#1766)', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: { ...buildBudgetItem({ trip_id: 1, name: 'Flight' }), id: 11 } });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(await screen.findByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Flight');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '100');

    // A personal expense: alice (the default "You" payer) fronted it, but nobody shares
    // the split. The web used to drop the payer once no participants remained.
    await user.click(screen.getByRole('checkbox', { name: 'You' }));
    await user.click(screen.getByRole('checkbox', { name: 'bob' }));

    const addBtns = screen.getAllByRole('button', { name: 'Add expense' });
    const submit = addBtns[addBtns.length - 1]; // footer submit
    expect(submit).not.toBeDisabled();
    await user.click(submit);

    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted!.member_ids).toEqual([]);
    expect(posted!.payers).toEqual([{ user_id: 1, amount: 100 }]);
  });

  it('keeps "no one paid yet" when reopening a payer-less expense (#1533)', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
    let put: Record<string, unknown> | null = null;
    const item = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Hotel' }),
      id: 5,
      total_price: 120,
      payers: [],
      members: [
        { user_id: 1, username: 'alice', paid: 0 },
        { user_id: 2, username: 'bob', paid: 0 },
      ],
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.put('/api/trips/1/budget/5', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await screen.findByText('Hotel');
    await user.click(screen.getByRole('button', { name: /^Edit(:|$)/ }));

    // Nobody paid this expense — reopening it must not silently reselect "You".
    expect(await screen.findByRole('radio', { name: 'No one paid yet' })).toBeChecked();

    // …and saving an untouched edit must not assign the current user as payer.
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toBeTruthy());
    expect(put!.payers).toEqual([]);
  });

  it('still defaults a brand-new expense to "You" as the payer', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    expect(await screen.findByRole('radio', { name: 'You' })).toBeChecked();
  });

  // ── Multi-payer (#1426 regression) ─────────────────────────────────────────
  // 3.2.0 collapsed payers[] to a single payer, so a bill fronted by two people
  // credited all of it to one and skewed settle-up. The ledger always supported N
  // payers; only the form could no longer send them.

  it('records an expense paid by two people with their own amounts', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: { ...buildBudgetItem({ trip_id: 1, name: 'Dinner' }), id: 11 } });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(await screen.findByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Dinner');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '90');

    await user.click(screen.getByRole('button', { name: 'Multiple people paid' }));

    // Alice (me) is seeded as the sole payer; including Bob rebalances to 45/45.
    await user.click(screen.getAllByTestId('payer-toggle')[1]);
    expect(screen.getAllByTestId('payer-amount').map((i) => (i as HTMLInputElement).value)).toEqual(['45,00', '45,00']);

    const addBtns = screen.getAllByRole('button', { name: 'Add expense' });
    await user.click(addBtns[addBtns.length - 1]);

    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted!.total_price).toBe(90);
    expect(posted!.payers).toEqual(
      expect.arrayContaining([
        { user_id: 1, amount: 45 },
        { user_id: 2, amount: 45 },
      ])
    );
    expect(posted!.payers).toHaveLength(2);
  });

  it('blocks saving when the payer amounts do not add up to the total', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: buildBudgetItem({ trip_id: 1, name: 'Dinner' }) });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(await screen.findByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Dinner');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '90');
    await user.click(screen.getByRole('button', { name: 'Multiple people paid' }));
    await user.click(screen.getAllByTestId('payer-toggle')[1]);

    // Pin both payers at 20 of a 90 bill, so nobody is left to absorb the rest.
    const amounts = () => screen.getAllByTestId('payer-amount') as HTMLInputElement[];
    await user.clear(amounts()[0]);
    await user.type(amounts()[0], '20');
    await user.clear(amounts()[1]);
    await user.type(amounts()[1], '20');

    // An unbalanced payer list would make the server re-derive total_price as 40.
    expect(screen.getByText(/must add up to/i)).toBeInTheDocument();
    const addBtns = screen.getAllByRole('button', { name: 'Add expense' });
    expect(addBtns[addBtns.length - 1]).toBeDisabled();
    expect(posted).toBeNull();
  });

  it('reopens a two-payer expense with both payers intact', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
    let put: Record<string, unknown> | null = null;
    const item = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Dinner' }),
      id: 7,
      total_price: 90,
      payers: [
        { user_id: 1, amount: 45, username: 'alice' },
        { user_id: 2, amount: 45, username: 'bob' },
      ],
      members: [
        { user_id: 1, username: 'alice', paid: 0 },
        { user_id: 2, username: 'bob', paid: 0 },
      ],
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.put('/api/trips/1/budget/7', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await screen.findByText('Dinner');
    await user.click(screen.getByRole('button', { name: /^Edit(:|$)/ }));

    // Loading used to be payers.find(...), which silently dropped the second payer.
    // Seeded with two decimals since #2175, localized for EUR.
    const amounts = await screen.findAllByTestId('payer-amount');
    expect(amounts.map((i) => (i as HTMLInputElement).value)).toEqual(['45,00', '45,00']);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toBeTruthy());
    expect(put!.payers).toHaveLength(2);
  });

  it('exports the expenses as a CSV download (#1500)', async () => {
    // Display in the trip's own currency so FX conversion is an identity.
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
    let exported: Blob | null = null;
    const createObjURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      exported = b as Blob;
      return 'blob:mock';
    });
    const revokeObjURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const item = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Dinner; tapas' }),
      total_price: 90,
      expense_date: '2025-06-15',
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await screen.findByText('Dinner; tapas');
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(exported).toBeTruthy();
    const text = await exported!.text();
    expect(text).toContain('Date;Name;Category;Amount;Currency;Amount (EUR);Note');
    expect(text).toContain('"Dinner; tapas"'); // separator inside the name gets quoted
    expect(text).toContain('Food & drink'); // category label, not the raw key
    expect(text).toContain('90.00;EUR');
    createObjURL.mockRestore();
    revokeObjURL.mockRestore();
    clickSpy.mockRestore();
  });

  it('supports itemized receipt ticket manual entry and split assignment', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: { ...buildBudgetItem({ trip_id: 1, name: 'Dinner' }), id: 10 } });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(await screen.findByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Dinner');

    await user.click(screen.getByRole('button', { name: 'Ticket' }));

    const addBtn = screen.getByRole('button', { name: /Add item/i });
    await user.click(addBtn);
    await user.click(addBtn);
    await user.click(addBtn);

    const itemNames = screen.getAllByPlaceholderText('Item name');
    const itemPrices = screen.getAllByPlaceholderText('0,00');

    await user.type(itemNames[0], 'Apples');
    await user.type(itemPrices[1], '10');

    await user.type(itemNames[1], 'chocolate cake');
    await user.type(itemPrices[2], '50');
    const bobButtons = bobInForm();
    await user.click(bobButtons[1]);

    await user.type(itemNames[2], 'Milk');
    await user.type(itemPrices[3], '40');

    expect(screen.getByDisplayValue('100,00')).toBeDisabled();

    expect(screen.getByText('Individual shares')).toBeInTheDocument();
    expect(screen.getByText(/75,00/)).toBeInTheDocument();
    expect(screen.getByText(/25,00/)).toBeInTheDocument();

    const addBtns = screen.getAllByRole('button', { name: 'Add expense' });
    await user.click(addBtns[addBtns.length - 1]);

    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted!.total_price).toBe(100);
    expect(posted!.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: 1, amount: 75 }),
        expect.objectContaining({ user_id: 2, amount: 25 }),
      ])
    );
    // The receipt has its own column since #1658; `note` is the user's text.
    expect(JSON.parse(posted!.ticket_json as string).items).toHaveLength(3);
    expect(posted!.note).toBeNull();
  });

  // ── Display currency ───────────────────────────────────────────────────────

  it('shows amounts in the trip currency when the user has no display currency set', async () => {
    // No personal preference → the trip's own currency wins, instead of a hardcoded one.
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: '' } });
    seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'JPY' }) });
    const item = {
      ...buildBudgetItem({ trip_id: 1, category: 'food', name: 'Sushi' }),
      total_price: 3000,
      currency: 'JPY',
      payers: [],
      members: [{ user_id: 1, username: 'alice', paid: 0 }],
    };
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await screen.findByText('Sushi');
    const card = screen.getByRole('region', { name: 'Total trip spend' });
    // Yen, unconverted and with JPY's zero decimals — not a euro/dollar default.
    expect(card).toHaveTextContent('￥3,000');
  });

  // ── Payment currency ───────────────────────────────────────────────────────
  // A transfer settling a shared bill can be made in any currency, so it carries its
  // own rather than being assumed to be in the display one.

  it('records a payment in the display currency by default', async () => {
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.post('/api/trips/1/budget/settlements', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ settlement: { id: 1, ...posted } });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await user.click(await screen.findByRole('button', { name: 'Add payment' }));
    await user.type(await screen.findByPlaceholderText('0,00'), '25');
    const addButtons = screen.getAllByRole('button', { name: 'Add payment' });
    await user.click(addButtons[addButtons.length - 1]);

    await waitFor(() => expect(posted).toMatchObject({ amount: 25, currency: 'EUR' }));
  });

  it('records a payment made in another currency', async () => {
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] })),
      http.post('/api/trips/1/budget/settlements', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ settlement: { id: 1, ...posted } });
      })
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await user.click(await screen.findByRole('button', { name: 'Add payment' }));
    await user.type(await screen.findByPlaceholderText('0,00'), '25');
    // Bob paid me back in dollars — the server freezes the USD rate on write.
    await user.click(screen.getByText(/^EUR/));
    await user.click(await screen.findByText(/^USD/));
    const addButtons = screen.getAllByRole('button', { name: 'Add payment' });
    await user.click(addButtons[addButtons.length - 1]);

    await waitFor(() => expect(posted).toMatchObject({ amount: 25, currency: 'USD' }));
  });

  it('reopens a foreign-currency payment with its own currency', async () => {
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () =>
        HttpResponse.json({
          balances: [],
          flows: [],
          settlements: [
            {
              id: 7,
              trip_id: 1,
              from_user_id: 2,
              to_user_id: 1,
              amount: 30,
              currency: 'USD',
              exchange_rate: 1.1,
              created_at: '2025-06-16 10:00:00',
              from_username: 'bob',
              to_username: 'alice',
            },
          ],
        })
      )
    );
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await screen.findByText('Payment');
    await user.click(screen.getByRole('button', { name: /^Edit(:|$)/ }));

    // The stored USD amount comes back as-is (padded to two decimals, #2175),
    // not silently reread as euros.
    expect(((await screen.findByPlaceholderText('0.00')) as HTMLInputElement).value).toBe('30.00');
    expect(screen.getByText(/^USD/)).toBeInTheDocument();
  });
});

describe('CostsPanel — payment modal', () => {
  beforeEach(seedAlice);

  it('FE-W5COSTS-028: editing a payment updates it in place', async () => {
    const user = userEvent.setup();
    let put: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/trips/1/budget/settlements/7', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ settlement: { id: 7 } });
      })
    );
    mount([], {
      settlements: [{ id: 7, from_user_id: 2, to_user_id: 1, amount: 30, created_at: '2025-06-16 10:00:00' }],
    });

    await user.click(await screen.findByRole('button', { name: /^Edit(:|$)/ }));
    const amount = await screen.findByPlaceholderText('0,00');
    await user.clear(amount);
    await user.type(amount, '12,50');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(put).toBeTruthy());
    expect(put).toMatchObject({ from_user_id: 2, to_user_id: 1, amount: 12.5 });
  });

  it('FE-W5COSTS-029: a transfer to yourself cannot be saved', async () => {
    const user = userEvent.setup();
    mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add payment' }));
    await user.type(await screen.findByPlaceholderText('0,00'), '10');

    // Default is You → bob; pointing "to" back at me makes it a no-op transfer.
    await user.click(screen.getByRole('button', { name: 'bob' }));
    pickOption('You');

    const submits = screen.getAllByRole('button', { name: 'Add payment' });
    expect(submits[submits.length - 1]).toBeDisabled();
  });

  it('FE-W5COSTS-030: a failing payment save is reported', async () => {
    const user = userEvent.setup();
    const addToast = vi.fn();
    window.__addToast = addToast as unknown as typeof window.__addToast;
    server.use(http.post('/api/trips/1/budget/settlements', () => HttpResponse.json({ error: 'no' }, { status: 500 })));
    mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add payment' }));
    await user.type(await screen.findByPlaceholderText('0,00'), '10');
    const submits = screen.getAllByRole('button', { name: 'Add payment' });
    await user.click(submits[submits.length - 1]);

    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Unknown error', 'error', undefined));
    delete window.__addToast;
  });

  it('FE-W5COSTS-074: a new payment defaults its day to today, by the local calendar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const behindUtc = new Date(2026, 7, 12).getTimezoneOffset() > 0;
    vi.setSystemTime(new Date(2026, 7, 12, behindUtc ? 23 : 1, 30, 0));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/trips/1/budget/settlements', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ settlement: { id: 9 } });
      })
    );
    mount([]);

    try {
      await user.click(await screen.findByRole('button', { name: 'Add payment' }));
      await user.type(await screen.findByPlaceholderText('0,00'), '10');
      const submits = screen.getAllByRole('button', { name: 'Add payment' });
      await user.click(submits[submits.length - 1]);

      await waitFor(() => expect(posted).toBeTruthy());
      expect(posted!.settled_at).toBe('2026-08-12');
    } finally {
      vi.useRealTimers();
    }
  });

  it('FE-W5COSTS-075: editing a payment keeps its own settled day, not the day it was recorded', async () => {
    const user = userEvent.setup();
    let put: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/trips/1/budget/settlements/7', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ settlement: { id: 7 } });
      })
    );
    mount([], {
      settlements: [
        {
          id: 7,
          from_user_id: 2,
          to_user_id: 1,
          amount: 30,
          settled_at: '2025-06-10',
          created_at: '2025-06-16 10:00:00',
        },
      ],
    });

    await user.click(await screen.findByRole('button', { name: /^Edit(:|$)/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(put).toBeTruthy());
    expect(put!.settled_at).toBe('2025-06-10');
  });

  it('FE-W5COSTS-077: a payment cannot be saved without a day', async () => {
    // Cleared, the server would store NULL and the ledger would quietly move
    // the payment back to the day it was recorded on.
    const user = userEvent.setup();
    mount([], {
      settlements: [
        {
          id: 7,
          from_user_id: 2,
          to_user_id: 1,
          amount: 30,
          settled_at: '2025-06-10',
          created_at: '2025-06-16 10:00:00',
        },
      ],
    });

    await user.click(await screen.findByRole('button', { name: /^Edit(:|$)/ }));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();

    await user.click(document.querySelector('button[aria-haspopup="dialog"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Clear date' }));
    expect(save).toBeDisabled();
  });
});

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
import { buildUser, buildTrip, buildBudgetItem, buildSettings } from '../../../tests/helpers/factories';
import type { BudgetItem } from '../../types';
import CostsPanel, { ExpenseModal } from './CostsPanel';
import { splitEqualShares, calculateTicketShares, type TicketItem } from './CostsPanel.helpers';
import { resetFreezeAttempts } from './useFreezeMissingRates';
import { tripMembers, bobInForm, expense, mount, seedAlice, dinner } from '../../../tests/helpers/costsPanel/fixtures';

beforeEach(async () => {
  invalidateTripReads();
  invalidateOfflineSession();
  await resetOfflineTestDatabase();
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'EUR' }) });
});

describe('CostsPanel — expense modal', () => {
  beforeEach(() => {
    seedAlice();
    clearExchangeRateCache();
  });
  afterEach(clearExchangeRateCache);

  const openAdd = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await screen.findByPlaceholderText('e.g. Dinner, souvenirs, gas…');
  };

  it('FE-W5COSTS-031: reopening a ticket expense restores its items and lets them be edited', async () => {
    const user = userEvent.setup();
    let put: Record<string, unknown> | null = null;
    const note =
      'TICKETJSON:' +
      JSON.stringify({
        items: [
          { name: 'Apples', price: '10', parts: [1, 2] },
          { name: 'Cake', price: '20', parts: [2] },
        ],
      });
    server.use(
      http.put('/api/trips/1/budget/150', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    mount([
      expense({
        id: 150,
        name: 'Market run',
        category: 'groceries',
        total_price: 30,
        note,
        payers: [{ user_id: 1, amount: 30 }],
        members: [
          { user_id: 1, username: 'alice', amount: 15 },
          { user_id: 2, username: 'bob', amount: 15 },
        ],
      }),
    ]);

    await screen.findByText('Market run');
    await user.click(screen.getByRole('button', { name: /^Edit(:|$)/ }));

    expect(await screen.findByDisplayValue('Apples')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Cake')).toBeInTheDocument();

    // Drop the second item and take Bob off the first one.
    const rows = screen.getAllByPlaceholderText('Item name');
    await user.click(rows[1].parentElement!.parentElement!.querySelectorAll('button')[0]);
    expect(screen.queryByDisplayValue('Cake')).not.toBeInTheDocument();
    await user.click(bobInForm()[0]);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toBeTruthy());
    expect(put!.total_price).toBe(10);
    expect(put!.members).toEqual(expect.arrayContaining([expect.objectContaining({ user_id: 1, amount: 10 })]));
  });

  it('FE-W5COSTS-032: an unparsable ticket note opens with an empty item list', async () => {
    const user = userEvent.setup();
    mount([
      expense({
        id: 151,
        name: 'Market run',
        category: 'groceries',
        total_price: 30,
        note: 'TICKETJSON:{oops',
        payers: [{ user_id: 1, amount: 30 }],
        members: [{ user_id: 1, username: 'alice' }],
      }),
    ]);

    await screen.findByText('Market run');
    await user.click(screen.getByRole('button', { name: /^Edit(:|$)/ }));

    expect(await screen.findByRole('button', { name: /Add item/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Item name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('FE-W5COSTS-033: reopening a custom split restores the per-member amounts', async () => {
    const user = userEvent.setup();
    let put: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/trips/1/budget/160', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    mount([
      expense({
        id: 160,
        name: 'Dinner',
        category: 'food',
        total_price: 100,
        payers: [{ user_id: 1, amount: 100 }],
        members: [
          { user_id: 1, username: 'alice', amount: 70 },
          { user_id: 2, username: 'bob', amount: 30 },
        ],
      }),
    ]);

    await screen.findByText('Dinner');
    await user.click(screen.getByRole('button', { name: /^Edit(:|$)/ }));

    // Custom shares reopen padded to two decimals (#2175), localized for EUR.
    expect((await screen.findByDisplayValue('70,00')).tagName).toBe('INPUT');
    expect(screen.getByDisplayValue('30,00')).toBeInTheDocument();

    // Excluding Bob drops his amount; the split no longer matches the total.
    expect(bobInForm()).toHaveLength(1);
    await user.click(bobInForm()[0]);
    expect(screen.getByText(/Sum of splits/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    // Bringing him back in via the excluded-state hint restores an empty field,
    // pre-filled as a placeholder with what is still missing from the total.
    await user.click(bobInForm()[0]);
    await user.type(screen.getByPlaceholderText('30,00'), '30');

    expect(screen.getByText('Split matches total')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toBeTruthy());
    expect(put!.members).toEqual([
      { user_id: 1, amount: 70 },
      { user_id: 2, amount: 30 },
    ]);
  });

  it('FE-W5COSTS-034: changing the currency previews the converted total', async () => {
    const user = userEvent.setup();
    localStorage.setItem('trek_fx_EUR', JSON.stringify({ rates: { EUR: 1, USD: 2 }, ts: Date.now() }));
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    mount([]);
    await openAdd(user);

    await user.type(screen.getByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Diner');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '100');
    await user.click(screen.getByText(/^EUR/));
    await user.click(await screen.findByText(/^USD/));

    expect(screen.getByText('live rate', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('50,00 €')).toBeInTheDocument();

    // A different category than the default is carried into the payload.
    await user.click(screen.getByRole('button', { name: /^Category:/ }));
    await user.click(screen.getByRole('button', { name: 'Sightseeing' }));
    const submits = screen.getAllByRole('button', { name: 'Add expense' });
    await user.click(submits[submits.length - 1]);

    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted).toMatchObject({ currency: 'USD', category: 'sightseeing', total_price: 100 });
  });

  it('FE-W5COSTS-035: collapsing multi-payer mode keeps the first payer for the whole bill', async () => {
    const user = userEvent.setup();
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    mount([]);
    await openAdd(user);

    await user.type(screen.getByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Dinner');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '90');
    await user.click(screen.getByRole('button', { name: 'Multiple people paid' }));
    await user.click(screen.getAllByTestId('payer-toggle')[1]);
    // Dropping Bob again leaves Alice absorbing the whole amount.
    await user.click(screen.getAllByTestId('payer-toggle')[1]);
    expect(screen.getAllByTestId('payer-toggle')[1]).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: 'One person paid' }));

    const submits = screen.getAllByRole('button', { name: 'Add expense' });
    await user.click(submits[submits.length - 1]);

    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted!.payers).toEqual([{ user_id: 1, amount: 90 }]);
  });

  it('FE-W5COSTS-036: a nobody-paid expense can be recorded from the payer dropdown', async () => {
    const user = userEvent.setup();
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    mount([]);
    await openAdd(user);

    await user.type(screen.getByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Hotel');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '120');
    await user.click(screen.getByRole('radio', { name: 'No one paid yet' }));

    const submits = screen.getAllByRole('button', { name: 'Add expense' });
    await user.click(submits[submits.length - 1]);

    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted!.payers).toEqual([]);
    expect(posted!.member_ids).toEqual([1, 2]);
  });

  it('FE-W5COSTS-037: a failing expense save is reported and the modal stays open', async () => {
    const user = userEvent.setup();
    const addToast = vi.fn();
    window.__addToast = addToast as unknown as typeof window.__addToast;
    server.use(http.post('/api/trips/1/budget', () => HttpResponse.json({ error: 'no' }, { status: 500 })));
    mount([]);
    await openAdd(user);

    await user.type(screen.getByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Dinner');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '90');
    const submits = screen.getAllByRole('button', { name: 'Add expense' });
    await user.click(submits[submits.length - 1]);

    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Unknown error', 'error', undefined));
    expect(screen.getByPlaceholderText('e.g. Dinner, souvenirs, gas…')).toBeInTheDocument();
    delete window.__addToast;
  });

  it('FE-W5COSTS-038: a prefilled expense opens with the booking’s name, amount and category', async () => {
    const user = userEvent.setup();
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    const onSaved = vi.fn();
    render(
      <ExpenseModal
        tripId={1}
        base="EUR"
        people={tripMembers}
        me={1}
        editing={null}
        prefill={{ name: 'Hotel Astoria', category: 'accommodation', amount: 240, reservationId: 12 }}
        onClose={() => {}}
        onSaved={onSaved}
      />
    );

    expect(screen.getByDisplayValue('Hotel Astoria')).toBeInTheDocument();
    // The prefilled amount is padded to the base currency's decimals (#2175).
    expect(screen.getByDisplayValue('240,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted).toMatchObject({
      name: 'Hotel Astoria',
      category: 'accommodation',
      total_price: 240,
      reservation_id: 12,
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('FE-W5COSTS-096: offers Scan receipt beside Add expense only when the AI model reads images', async () => {
    server.use(http.get('/api/llm/capabilities', () => HttpResponse.json({ images: true })));
    const { unmount } = render(<CostsPanel tripId={1} tripMembers={tripMembers} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Scan receipt' }))[0]);
    expect(screen.getByRole('dialog', { name: 'Scan a receipt' })).toBeInTheDocument();
    unmount();

    server.use(http.get('/api/llm/capabilities', () => HttpResponse.json({ images: false })));
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);
    await screen.findAllByRole('button', { name: 'Add expense' });
    expect(screen.queryByRole('button', { name: 'Scan receipt' })).not.toBeInTheDocument();
  });

  it('FE-W5COSTS-095: a scanned receipt opens in its own currency and day, with its photo waiting to be attached', () => {
    const photo = new File(['x'], 'bill.jpg', { type: 'image/jpeg' });
    render(
      <ExpenseModal
        tripId={1}
        base="EUR"
        people={tripMembers}
        me={1}
        editing={null}
        prefill={{
          name: 'Sushi Dai',
          amount: 4200,
          currency: 'JPY',
          date: '2026-09-20',
          lines: [{ name: 'Omakase', price: 4200 }],
          receiptFiles: [photo],
        }}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    expect(screen.getByDisplayValue('Sushi Dai')).toBeInTheDocument();
    // Yen has no minor unit, so the amount is not padded.
    expect(screen.getByDisplayValue('4200')).toBeInTheDocument();
    expect(screen.getByText('bill.jpg')).toBeInTheDocument();
  });

  // The mobile sheet already dates a new expense by the traveller's own clock;
  // the desktop modal filed it under the UTC day, so the same expense entered
  // late in Tokyo or early in Los Angeles landed on a different day per surface.
  it('FE-W5COSTS-065: a new expense is dated by the local calendar day, not the UTC one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // A wall-clock time on whichever side of midnight puts the runner's UTC date
    // on a different day. On UTC itself the two spellings agree and there is
    // nothing here to catch.
    const behindUtc = new Date(2026, 7, 12).getTimezoneOffset() > 0;
    vi.setSystemTime(new Date(2026, 7, 12, behindUtc ? 23 : 1, 30, 0));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    render(
      <ExpenseModal
        tripId={1}
        base="EUR"
        people={tripMembers}
        me={1}
        editing={null}
        prefill={{ name: 'Ramen', category: 'food', amount: 18 }}
        onClose={() => {}}
        onSaved={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add expense' }));

    try {
      await waitFor(() => expect(posted).toBeTruthy());
      expect(posted!.expense_date).toBe('2026-08-12');
    } finally {
      vi.useRealTimers();
    }
  });

  it('FE-W5COSTS-038b: a prefill from a place links the expense to that place (#1298)', async () => {
    const user = userEvent.setup();
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    render(
      <ExpenseModal
        tripId={1}
        base="EUR"
        people={tripMembers}
        me={1}
        editing={null}
        prefill={{ name: 'Louvre', category: 'activities', amount: 34, placeId: 7 }}
        onClose={() => {}}
        onSaved={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted).toMatchObject({ name: 'Louvre', category: 'activities', total_price: 34, place_id: 7 });
    expect(posted).not.toHaveProperty('reservation_id');
  });
});

describe('CostsPanel — split modes and guests', () => {
  beforeEach(seedAlice);

  it('FE-W5COSTS-056: switching back to an equal split restores the per-head amounts', async () => {
    const user = userEvent.setup();
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(screen.getByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Dinner');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '90');

    await user.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByText(/Sum of splits/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Equally' }));
    expect(screen.getByText('45,00 € per person')).toBeInTheDocument();

    const submits = screen.getAllByRole('button', { name: 'Add expense' });
    await user.click(submits[submits.length - 1]);
    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted!.members).toEqual([
      { user_id: 1, amount: null },
      { user_id: 2, amount: null },
    ]);
  });

  it('FE-W5COSTS-1709: a custom split typed in percent saves the matching amounts', async () => {
    const user = userEvent.setup();
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(screen.getByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Bag storage');
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '30');
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    await user.click(screen.getByRole('button', { name: '%' }));

    const [alice, bob] = screen.getAllByRole('textbox', { name: / %$/ });
    await user.type(alice, '60');
    expect(screen.getByText('60 % of 100 % assigned')).toBeInTheDocument();
    await user.type(bob, '40');
    expect(screen.getByText('Split matches total')).toBeInTheDocument();
    expect(screen.getByText('18,00 €')).toBeInTheDocument();

    const submits = screen.getAllByRole('button', { name: 'Add expense' });
    await user.click(submits[submits.length - 1]);
    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted!.members).toEqual([
      { user_id: 1, amount: 18 },
      { user_id: 2, amount: 12 },
    ]);
  });

  it('FE-W5COSTS-057: multi-payer on a payer-less expense seeds and collapses back to me', async () => {
    const user = userEvent.setup();
    let put: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/trips/1/budget/250', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    mount([
      expense({
        id: 250,
        name: 'Hotel',
        category: 'accommodation',
        total_price: 120,
        payers: [],
        members: [
          { user_id: 1, username: 'alice' },
          { user_id: 2, username: 'bob' },
        ],
      }),
    ]);

    await screen.findByText('Hotel');
    await user.click(screen.getByRole('button', { name: /^Edit(:|$)/ }));

    // Nobody paid, so switching to multi-payer seeds me as the only payer.
    await user.click(await screen.findByRole('button', { name: 'Multiple people paid' }));
    expect(screen.getAllByTestId('payer-amount')).toHaveLength(1);

    // Dropping myself leaves the list empty; collapsing then falls back to me.
    await user.click(screen.getAllByTestId('payer-toggle')[0]);
    expect(screen.queryAllByTestId('payer-amount')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'One person paid' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(put).toBeTruthy());
    expect(put!.payers).toEqual([{ user_id: 1, amount: 120 }]);
  });

  it('FE-W5COSTS-058: a guest traveler is badged in the split list', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(
      <CostsPanel
        tripId={1}
        tripMembers={[
          { id: 1, username: 'alice', avatar_url: null },
          { id: 2, username: 'gus', avatar_url: '/uploads/avatars/g.png', is_guest: true },
        ]}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.click(screen.getByRole('button', { name: 'Ticket' }));
    await user.click(screen.getByRole('button', { name: /Add item/i }));

    // The uploaded picture is reused for the per-item participant chips.
    expect(document.querySelectorAll('img[src="/uploads/avatars/g.png"]').length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getByRole('button', { name: 'Equally' }));
    expect(screen.getByText('Guest')).toBeInTheDocument();
  });
});

// ── #2175: edit inputs are padded to the currency's decimals ────────────────
describe('CostsPanel — decimal padding on edit (#2175)', () => {
  beforeEach(() => {
    seedAlice();
    clearExchangeRateCache();
  });
  afterEach(clearExchangeRateCache);

  it('FE-W5COSTS-066: reopens 4,90 as "4,90" and 5,00 as "5,00", not "4,9" and "5"', async () => {
    const user = userEvent.setup();
    mount([
      expense({
        id: 301,
        name: 'Coffee',
        category: 'food',
        total_price: 4.9,
        payers: [{ user_id: 1, amount: 4.9 }],
        members: [{ user_id: 1, username: 'alice' }],
      }),
      expense({
        id: 302,
        name: 'Toll',
        category: 'transport',
        total_price: 5,
        payers: [{ user_id: 1, amount: 5 }],
        members: [{ user_id: 1, username: 'alice' }],
      }),
    ]);

    await screen.findByText('Coffee');
    await user.click(screen.getAllByRole('button', { name: /^Edit(:|$)/ })[0]);
    expect(await screen.findByDisplayValue('4,90')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getAllByRole('button', { name: /^Edit(:|$)/ })[1]);
    expect(await screen.findByDisplayValue('5,00')).toBeInTheDocument();
  });

  it('FE-W5COSTS-071: a three-decimal currency seeds three places and the split field still takes input', async () => {
    const user = userEvent.setup();
    render(
      <ExpenseModal
        tripId={1}
        base="KWD"
        people={tripMembers}
        me={1}
        onClose={() => {}}
        onSaved={vi.fn()}
        editing={expense({
          id: 340,
          name: 'Museum',
          category: 'activities',
          currency: 'KWD',
          total_price: 3,
          payers: [{ user_id: 1, amount: 3 }],
          members: [
            { user_id: 1, username: 'alice', amount: 1.5 },
            { user_id: 2, username: 'bob', amount: 1.5 },
          ],
        })}
      />
    );

    expect(await screen.findByDisplayValue('3.000')).toBeInTheDocument();
    const shares = screen.getAllByDisplayValue('1.500') as HTMLInputElement[];

    // The seed is three decimals, so a two-decimal guard would reject every further
    // keystroke, including one typed in front of the decimal point.
    await user.type(shares[0], '2', { initialSelectionStart: 0, initialSelectionEnd: 0 });
    expect(shares[0].value).toBe('21.500');

    // A fourth decimal is still not a fils.
    await user.clear(shares[1]);
    await user.type(shares[1], '1.5005');
    expect(shares[1].value).toBe('1.500');
  });
});

// ── #2176: negative amounts record partial reimbursements ───────────────────
describe('CostsPanel — negative amounts (#2176)', () => {
  beforeEach(() => {
    seedAlice();
    clearExchangeRateCache();
  });
  afterEach(clearExchangeRateCache);

  it('FE-W5COSTS-067: "-100" can be typed and saves a negative expense with its payer', async () => {
    const user = userEvent.setup();
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/trips/1/budget', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: { ...buildBudgetItem({ trip_id: 1, name: 'Hotel refund' }), id: 12 } });
      })
    );
    mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    await user.type(await screen.findByPlaceholderText('e.g. Dinner, souvenirs, gas…'), 'Hotel refund');
    // The reported symptom: the '-' was stripped on input, so this was untypeable.
    await user.type(screen.getAllByPlaceholderText('0,00')[0], '-100');

    const submits = screen.getAllByRole('button', { name: 'Add expense' });
    expect(submits[submits.length - 1]).not.toBeDisabled();
    await user.click(submits[submits.length - 1]);

    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted!.total_price).toBe(-100);
    expect(posted!.payers).toEqual([{ user_id: 1, amount: -100 }]);
    expect(posted!.member_ids).toEqual([1, 2]);
  });

  it('FE-W5COSTS-068: a refund reopens with its negative payer intact and saves it back', async () => {
    const user = userEvent.setup();
    let put: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/trips/1/budget/310', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: dinner() });
      })
    );
    mount([
      expense({
        id: 310,
        name: 'Hotel refund',
        category: 'lodging',
        total_price: -100,
        payers: [{ user_id: 1, amount: -100 }],
        members: [
          { user_id: 1, username: 'alice' },
          { user_id: 2, username: 'bob' },
        ],
      }),
    ]);

    // The row shows the amount twice — total pill and the payer chip, which used
    // to be filtered to positive amounts and left the refund's recipient invisible.
    const row = (await screen.findByText('Hotel refund')).closest('.exp-row') as HTMLElement;
    expect(within(row).getAllByText(/100,00/).length).toBeGreaterThanOrEqual(2);
    // Not "Unfinished": the refund has its recipient recorded.
    expect(within(row).queryByText('Unfinished')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Edit(:|$)/ }));
    // The negative payer reopens selected instead of resetting to "Nobody",
    // and the total is seeded signed and padded.
    expect(await screen.findByRole('radio', { name: 'You' })).toBeChecked();
    expect(screen.getByDisplayValue('-100,00')).toBeInTheDocument();

    // Saving untouched must not silently drop the negative payer.
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toBeTruthy());
    expect(put!.total_price).toBe(-100);
    expect(put!.payers).toEqual([{ user_id: 1, amount: -100 }]);
  });

  it('FE-W5COSTS-069: a payer-less refund is marked Unfinished like a payer-less bill', async () => {
    mount([
      expense({
        id: 320,
        name: 'Pending refund',
        category: 'misc',
        total_price: -50,
        payers: [],
        members: [{ user_id: 1, username: 'alice' }],
      }),
    ]);

    await screen.findByText('Pending refund');
    expect(screen.getByText('Unfinished')).toBeInTheDocument();
  });

  it('FE-W5COSTS-070: the category breakdown nets refunds and keeps a net-negative category listed', async () => {
    mount([
      expense({
        id: 330,
        name: 'Dinner',
        category: 'food',
        total_price: 90,
        payers: [{ user_id: 1, amount: 90 }],
        members: [{ user_id: 1, username: 'alice' }],
      }),
      expense({
        id: 331,
        name: 'Meal refund',
        category: 'food',
        total_price: -30,
        payers: [{ user_id: 1, amount: -30 }],
        members: [{ user_id: 1, username: 'alice' }],
      }),
      expense({
        id: 332,
        name: 'Cancelled tour',
        category: 'activities',
        total_price: -20,
        payers: [{ user_id: 1, amount: -20 }],
        members: [{ user_id: 1, username: 'alice' }],
      }),
    ]);

    await screen.findByText('Dinner');
    const breakdown = screen.getByRole('region', { name: 'By category' }) as HTMLElement;
    // Food nets 90 − 30 = 60; the fully refunded tour keeps a row of its own.
    expect(within(breakdown).getByText('60 €')).toBeInTheDocument();
    expect(within(breakdown).getByText(/[-−]20\s*€/)).toBeInTheDocument();
  });

  it('FE-W5COSTS-072: the custom-split hint reads under and over the right way round on a refund', async () => {
    const user = userEvent.setup();
    render(
      <ExpenseModal
        tripId={1}
        base="EUR"
        people={tripMembers}
        me={1}
        onClose={() => {}}
        onSaved={vi.fn()}
        editing={expense({
          id: 341,
          name: 'Hotel refund',
          category: 'accommodation',
          total_price: -100,
          payers: [{ user_id: 1, amount: -100 }],
          members: [
            { user_id: 1, username: 'alice', amount: -70 },
            { user_id: 2, username: 'bob' },
          ],
        })}
      />
    );

    // -70 of -100: 30 still to hand out, not 30 too much.
    expect(await screen.findByText('Sum of splits: -70,00 € of -100,00 € (under by 30,00 €)')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('-30,00'), '-40');
    expect(screen.getByText('Sum of splits: -110,00 € of -100,00 € (over by 10,00 €)')).toBeInTheDocument();
  });

  it('FE-W5COSTS-073: the total can be turned into a refund without a minus key', async () => {
    const user = userEvent.setup();
    render(
      <ExpenseModal
        tripId={1}
        base="EUR"
        people={tripMembers}
        me={1}
        editing={null}
        onClose={() => {}}
        onSaved={vi.fn()}
      />
    );

    const total = (await screen.findAllByPlaceholderText('0,00'))[0] as HTMLInputElement;
    await user.type(total, '100');

    // The iOS decimal pad has no minus key, so the sign has to be reachable without one.
    const toggle = screen.getByRole('button', { name: 'Switch between expense and refund' });
    await user.click(toggle);

    expect(total.value).toBe('-100');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('CostsPanel — split maths', () => {
  it('FE-W5COSTS-039: an equal split with nobody to split with is empty', () => {
    expect(splitEqualShares(90, [], 1)).toEqual({});
  });

  it('FE-W5COSTS-040: the equal split spreads the remainder cents by item id', () => {
    // 10.00 over 3 people = 3.34 / 3.33 / 3.33, with the extra cent rotating per item.
    expect(splitEqualShares(10, [{ user_id: 1 }, { user_id: 2 }, { user_id: 3 }], 0)).toEqual({
      1: 3.34,
      2: 3.33,
      3: 3.33,
    });
    expect(splitEqualShares(10, [{ user_id: 1 }, { user_id: 2 }, { user_id: 3 }], 1)).toEqual({
      1: 3.33,
      2: 3.34,
      3: 3.33,
    });
  });

  it('FE-W5COSTS-041: a receipt line nobody is assigned to is carried by everyone on the receipt', () => {
    const items: TicketItem[] = [
      { id: 'a', name: 'Apples', price: '10', participants: new Set([1, 2]) },
      { id: 'b', name: 'Service', price: '5', participants: new Set() },
      { id: 'c', name: 'Cake', price: 'x', participants: new Set([2]) },
    ];

    // The service line used to count toward the total without landing on anyone,
    // so the shares stayed a permanent 5.00 short of it (#1382).
    expect(calculateTicketShares(items)).toEqual({ shares: { 1: 7.5, 2: 7.5 }, total: 15 });
  });
});

// The reworked expense modal shipped with English written straight into the JSX,
// so the receipt panel and the split summary stayed English on a German phone
// while everything around them translated.
describe('CostsPanel — expense modal in another language', () => {
  beforeEach(() => {
    seedAlice();
    seedStore(useSettingsStore, { settings: buildSettings({ language: 'de', default_currency: 'EUR' }) });
    clearExchangeRateCache();
  });
  afterEach(clearExchangeRateCache);

  const openModal = () =>
    render(
      <ExpenseModal
        tripId={1}
        base="EUR"
        people={tripMembers}
        me={1}
        editing={null}
        onClose={() => {}}
        onSaved={vi.fn()}
      />
    );

  it('FE-W5COSTS-063: the receipt panel is translated', async () => {
    const user = userEvent.setup();
    openModal();

    // The locale bundle is fetched, so the first paint is still English.
    await user.click(await screen.findByRole('button', { name: 'Beleg' }));
    await user.click(screen.getByRole('button', { name: /Artikel hinzufügen/ }));

    expect(screen.getByPlaceholderText('Artikelname')).toBeInTheDocument();
    expect(screen.getByText('Aufteilen auf:')).toBeInTheDocument();
    expect(screen.getByText('Anteil pro Person')).toBeInTheDocument();
    expect(screen.queryByText('Individual shares')).not.toBeInTheDocument();
  });

  it('FE-W5COSTS-064: the split summary and the excluded marker are translated', async () => {
    const user = userEvent.setup();
    openModal();

    await user.type(await screen.findByPlaceholderText('0,00'), '90');
    await user.click(screen.getByRole('button', { name: 'Individuell' }));

    // Nothing entered yet, so the whole 90 is still unaccounted for.
    expect(screen.getByText('Summe der Anteile: 0,00 € von 90,00 € (es fehlen 90,00 €)')).toBeInTheDocument();

    const shares = screen.getAllByPlaceholderText('45,00');
    await user.type(shares[0], '90');
    expect(screen.getByText('Aufteilung passt zur Summe')).toBeInTheDocument();

    await user.type(shares[1], '10');
    expect(screen.getByText('Summe der Anteile: 100,00 € von 90,00 € (10,00 € zu viel)')).toBeInTheDocument();

    // Back to the equal split: a member taken out of it is marked, not dropped.
    await user.click(screen.getByRole('button', { name: 'Gleichmäßig' }));
    // Taken out, the box is simply unticked; no English word leaks into the German dialog.
    await user.click(screen.getByRole('checkbox', { name: /bob/i }));
    expect(screen.getByRole('checkbox', { name: /bob/i })).not.toBeChecked();
    expect(screen.queryByText('Excluded')).not.toBeInTheDocument();
  });
});

// ── #2525: a bill entered in the display currency on a trip kept in another ───
describe('CostsPanel: a bill entered in the display currency (#2525)', () => {
  // The reporter's setup: a euro trip, read in dollars, with the bill entered in
  // dollars. It was booked at 1.17 dollars to the euro, 685.26 EUR, and that is what
  // the balances and settle-up net. Today the euro buys 1.1551 dollars, so those
  // euros are $791.55. The dollar's own quote is rounded separately (0.865706 per
  // dollar is 1.155126 per euro), which is why the panel converts with the euro's.
  beforeEach(() => {
    seedAlice();
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'USD' } });
    clearExchangeRateCache();
    localStorage.setItem('trek_fx_USD', JSON.stringify({ rates: { USD: 1, EUR: 0.865706 }, ts: Date.now() }));
    localStorage.setItem('trek_fx_EUR', JSON.stringify({ rates: { EUR: 1, USD: 1.1551, SEK: 10 }, ts: Date.now() }));
  });
  afterEach(clearExchangeRateCache);

  const hotel = (over: Partial<BudgetItem> = {}) =>
    expense({
      id: 401,
      name: 'Aparthotel Silver',
      category: 'accommodation',
      total_price: 801.76,
      currency: 'USD',
      exchange_rate: 1.17,
      expense_date: '2026-08-06',
      payers: [{ user_id: 1, amount: 801.76 }],
      members: [
        { user_id: 1, username: 'alice' },
        { user_id: 2, username: 'bob' },
      ],
      ...over,
    });

  it('FE-W5COSTS-079: a bill whose rate moved shows what was entered and what it was booked at', async () => {
    mount([hotel()]);

    await screen.findByText('Aparthotel Silver');
    // A bill in the display currency counts as typed (#2965), as the balances net it:
    // row total and payer chip read the dollars entered, nothing to explain under it,
    // and what I lent is half of them, which settle-up offers too.
    expect(screen.queryByText(/^\$801\.76 → /)).toBeNull();
    expect(screen.getAllByText('$801.76')).toHaveLength(2);
    expect(screen.getByText('you lent $400.88')).toBeInTheDocument();
  });

  it("FE-W5COSTS-087: a bill booked at today's rate reads exactly as typed everywhere on the page", async () => {
    mount([
      hotel({
        id: 407,
        name: 'Villa',
        total_price: 12345.67,
        exchange_rate: 1.1551,
        payers: [{ user_id: 1, amount: 12345.67 }],
      }),
      hotel({ id: 408, name: 'Unpaid deposit', total_price: 250, exchange_rate: 1.1551, payers: [], members: [] }),
    ]);

    await screen.findByText('Villa');
    // Pill and payer chip; converting back with the dollar's own quote gave $12,346.05.
    expect(screen.getAllByText('$12,345.67')).toHaveLength(2);
    expect(screen.queryByText(/12,346\.0[56]/)).toBeNull();
    expect(screen.getByText('$12,595.67 spent')).toBeInTheDocument();
    const total = screen.getByText('Total trip spend').parentElement!.parentElement!.parentElement!;
    expect(total.textContent).toContain('$12,595.67');
    const outstanding = screen.getByText('Outstanding amount').parentElement!.parentElement!.parentElement!;
    expect(outstanding.textContent).toContain('$250.00');
    // Nothing to explain under either row.
    expect(screen.queryByText(/^\$12,345\.67 →/)).toBeNull();
    expect(screen.queryByText(/^\$250\.00 →/)).toBeNull();
  });

  it('FE-W5COSTS-088: the CSV export adds the trip-currency amount every sum is built from', async () => {
    let exported: Blob | null = null;
    const createObjURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      exported = b as Blob;
      return 'blob:mock';
    });
    const revokeObjURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      mount([hotel()]);
      await screen.findByText('Aparthotel Silver');
      fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
      await waitFor(() => expect(exported).toBeTruthy());
      const lines = (await exported!.text()).replace(/^\uFEFF/, '').split('\r\n');
      expect(lines[0]).toBe('Date;Name;Category;Amount;Currency;Amount (EUR);Amount (USD);Note');
      // The trip-currency figure it was booked at, then the dollars as typed (#2965).
      expect(lines[1]).toMatch(/;801\.76;USD;685\.26;801\.76;$/);
    } finally {
      createObjURL.mockRestore();
      revokeObjURL.mockRestore();
      clickSpy.mockRestore();
    }
  });

  it('FE-W5COSTS-080: the totals add up the figures the rows show', async () => {
    mount([
      hotel(),
      hotel({ id: 402, name: 'Dinner', category: 'food', total_price: 120, payers: [{ user_id: 2, amount: 120 }] }),
    ]);

    await screen.findByText('Aparthotel Silver');
    // Both in the display currency, both as typed (#2965): $801.76 and $120.00 make
    // $921.76, on the day header and on the total spend card.
    expect(screen.queryByText(/^\$120\.00 → /)).toBeNull();
    expect(screen.getByText('$921.76 spent')).toBeInTheDocument();
    // Label, its text block, the header row, then the card itself.
    const card = screen.getByText('Total trip spend').parentElement!.parentElement!.parentElement!;
    expect(card.textContent).toContain('$921.76');
  });

  it('FE-W5COSTS-084: the totals follow the rates when they arrive after the expenses', async () => {
    // Nothing cached: the rates land after the expenses and the settlement, and the
    // totals used to keep the figure they were first added up with.
    clearExchangeRateCache();
    server.use(
      http.get('https://api.frankfurter.dev/v2/rates', async () => {
        await new Promise((r) => setTimeout(r, 150));
        return HttpResponse.json([{ quote: 'EUR', rate: 0.8 }]);
      })
    );
    mount([
      hotel({
        id: 406,
        name: 'Museum',
        category: 'activities',
        total_price: 100,
        currency: 'EUR',
        exchange_rate: 1,
        payers: [{ user_id: 1, amount: 100 }],
      }),
    ]);

    // 100 euro at 0.8 euro to the dollar.
    expect(await screen.findByText(/100,00\s€ → \$125\.00/)).toBeInTheDocument();
    const card = screen.getByText('Total trip spend').parentElement!.parentElement!.parentElement!;
    await waitFor(() => expect(card.textContent).toContain('$125.00'));
  });

  it('FE-W5COSTS-081: a euro row converts live, a third currency shows the euros it was booked at', async () => {
    mount([
      hotel({
        id: 403,
        name: 'Museum',
        category: 'activities',
        total_price: 100,
        currency: 'EUR',
        exchange_rate: 1,
        payers: [{ user_id: 1, amount: 100 }],
      }),
      hotel({
        id: 404,
        name: 'Ferry',
        category: 'transport',
        total_price: 1000,
        currency: 'SEK',
        exchange_rate: 10,
        payers: [{ user_id: 1, amount: 1000 }],
      }),
      // Written before the freeze existed: nothing was booked, so dollars stay dollars.
      hotel({
        id: 405,
        name: 'Old taxi',
        category: 'transport',
        total_price: 50,
        currency: 'USD',
        exchange_rate: 1,
        payers: [{ user_id: 1, amount: 50 }],
      }),
    ]);

    await screen.findByText('Museum');
    // The trip currency has no frozen rate of its own and goes to dollars live.
    expect(screen.getByText(/^100,00\s€ → \$115\.51$/)).toBeInTheDocument();
    // 1000 SEK at 10 per euro is 100 euro, then live to dollars in the pill.
    expect(screen.getByText(/^1\s000,00\skr → 100,00\s€$/)).toBeInTheDocument();
    expect(screen.getAllByText('$50.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/^\$50\.00 →/)).toBeNull();
  });

  it('FE-W5COSTS-082: a payment recorded in dollars reads as entered, a legacy one too (#2965)', async () => {
    mount([hotel()], {
      settlements: [
        {
          id: 21,
          from_user_id: 2,
          to_user_id: 1,
          amount: 400.88,
          currency: 'USD',
          exchange_rate: 1.17,
          created_at: '2026-08-07 09:00:00',
        },
        // Rows from before transfers had a currency were entered in the display
        // currency, which is how the server settles them.
        { id: 22, from_user_id: 2, to_user_id: 1, amount: 30, currency: null, created_at: '2026-08-08 09:00:00' },
      ],
    });

    await screen.findByText('Aparthotel Silver');
    // The hotel's split chips can carry the same figure, so look past them to the payment.
    const outsideChips = (text: string) =>
      screen.queryAllByText(text).filter((el) => !el.closest('[data-testid="split-chip"]'));
    expect(await screen.findByText('$30.00')).toBeInTheDocument();
    expect(screen.queryByText(/\$400\.88 → /)).toBeNull();
    expect(outsideChips('$400.88')).toHaveLength(1);
    expect(outsideChips('$30.00')).toHaveLength(1);
    expect(screen.queryByText('$34.65')).toBeNull();
  });

  it('FE-W5COSTS-085: the edit dialog has nothing to convert for a bill in the display currency (#2965)', async () => {
    const user = userEvent.setup();
    mount([hotel()]);

    await screen.findByText('Aparthotel Silver');
    await user.click(screen.getByRole('button', { name: /^Edit(:|$)/ }));
    expect(await screen.findByDisplayValue('801.76')).toBeInTheDocument();
    // The list reads the dollars typed, so there is no conversion to preview.
    expect(screen.queryByText(/live rate/)).toBeNull();
    expect(screen.getByText(/\$400\.88 per person/)).toBeInTheDocument();
    expect(screen.queryByText(/\$400\.88 → /)).toBeNull();
  });

  it('FE-W5COSTS-086: the final budget names the bill by what was entered beside its booked figure', async () => {
    const user = userEvent.setup();
    mount([hotel()], {
      balances: [
        { user_id: 1, username: 'alice', avatar_url: null, balance: 395.78 },
        { user_id: 2, username: 'bob', avatar_url: null, balance: -395.78 },
      ],
      flows: [{ from: { user_id: 2, username: 'bob' }, to: { user_id: 1, username: 'alice' }, amount: 395.78 }],
      finalBudgets: [
        {
          user_id: 1,
          username: 'alice',
          avatar_url: null,
          expenses: 791.55,
          reimbursed: 0,
          pending: 395.78,
          final: 395.77,
          sources: {
            fronted: [{ item_id: 401, cents: 79155 }],
            moved: [],
            outstanding: [{ from_user_id: 2, to_user_id: 1, cents: 39578 }],
          },
        },
      ],
    });

    const card = (await screen.findByRole('region', { name: 'Final budget' })) as HTMLElement;
    await user.click(await within(card).findByRole('button', { name: /You/ }));
    expect(within(card).getAllByText('+$791.55')).toHaveLength(2);
    expect(await within(card).findByText('Aparthotel Silver')).toBeInTheDocument();
    expect(within(card).getByText('$801.76')).toBeInTheDocument();
  });

  it('FE-W5COSTS-089: the final budget lists a bill that reads as typed without a second amount', async () => {
    const user = userEvent.setup();
    mount([hotel({ exchange_rate: 1.1551 })], {
      balances: [
        { user_id: 1, username: 'alice', avatar_url: null, balance: 400.88 },
        { user_id: 2, username: 'bob', avatar_url: null, balance: -400.88 },
      ],
      flows: [{ from: { user_id: 2, username: 'bob' }, to: { user_id: 1, username: 'alice' }, amount: 400.88 }],
      finalBudgets: [
        {
          user_id: 1,
          username: 'alice',
          avatar_url: null,
          expenses: 801.76,
          reimbursed: 0,
          pending: 400.88,
          final: 400.88,
          sources: {
            fronted: [{ item_id: 401, cents: 80176 }],
            moved: [],
            outstanding: [{ from_user_id: 2, to_user_id: 1, cents: 40088 }],
          },
        },
      ],
    });

    const card = (await screen.findByRole('region', { name: 'Final budget' })) as HTMLElement;
    await user.click(await within(card).findByRole('button', { name: /You/ }));
    expect(within(card).getAllByText('+$801.76')).toHaveLength(2);
    expect(within(card).queryByText('$801.76')).toBeNull();
  });

  it('FE-W5COSTS-083: an expense saved without a currency opens in the trip currency, not the display one', async () => {
    const user = userEvent.setup();
    let put: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/trips/1/budget/405', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ item: hotel({ id: 405, currency: 'EUR' }) });
      })
    );
    mount([
      hotel({
        id: 405,
        name: 'Tram pass',
        category: 'transport',
        total_price: 100,
        currency: null,
        exchange_rate: 1,
        payers: [{ user_id: 1, amount: 100 }],
      }),
    ]);

    await screen.findByText('Tram pass');
    // The list reads the missing currency as the trip's own.
    expect(screen.getByText(/100,00\s€ → \$115\.51/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Edit(:|$)/ }));
    expect(await screen.findByDisplayValue('100,00')).toBeInTheDocument();
    // Seeding the display currency here would label 100 euro as 100 dollars, and a
    // plain save would then store it that way.
    expect(screen.getByText(/^EUR/)).toBeInTheDocument();
    expect(screen.queryByText(/^USD/)).toBeNull();

    // Saving without touching anything keeps the 100 euro.
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toMatchObject({ total_price: 100, currency: 'EUR' }));
  });
});

// ── A bill the server cannot convert: VND on an AUD trip ────────────────────────
describe('CostsPanel: a bill the server cannot convert', () => {
  // The reporter's setup: an AUD trip whose server cannot fetch rates while the browser
  // can. An 8,920,000 VND dinner that never froze a rate was counted as 8,920,000 AUD.
  // The settlement now leaves it out and lists it, and an editor's browser lends its AUD
  // table to freeze a rate on it.
  const pho = () =>
    expense({
      id: 501,
      name: 'Pho',
      category: 'food',
      total_price: 8920000,
      currency: 'VND',
      exchange_rate: 1,
      expense_date: '2026-09-20',
      payers: [{ user_id: 1, amount: 8920000 }],
      members: [
        { user_id: 1, username: 'alice' },
        { user_id: 2, username: 'bob' },
      ],
    });
  const leftOut = {
    balances: [],
    flows: [],
    settlements: [],
    currency: 'AUD',
    unconverted: { item_ids: [501], settlement_ids: [], currencies: ['VND'] },
  };

  beforeEach(() => {
    seedAlice();
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'AUD' } });
    seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'AUD' }) });
    clearExchangeRateCache();
    resetFreezeAttempts();
    localStorage.setItem('trek_fx_AUD', JSON.stringify({ rates: { AUD: 1, VND: 18241.3, EUR: 0.61 }, ts: Date.now() }));
  });
  afterEach(clearExchangeRateCache);

  it('FE-W5COSTS-090: VND/AUD regression: an editor heals the bill with the cached quote and the healed balances load', async () => {
    let healed = false;
    const frozen: unknown[] = [];
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [pho()] })),
      http.get('/api/trips/1/budget/settlement', () =>
        HttpResponse.json(
          healed
            ? {
                // 8,920,000 VND at 18,241.3 is 489.00 AUD, half of it Bob's.
                balances: [
                  { user_id: 1, username: 'alice', avatar_url: null, balance: 244.5 },
                  { user_id: 2, username: 'bob', avatar_url: null, balance: -244.5 },
                ],
                flows: [
                  { from: { user_id: 2, username: 'bob' }, to: { user_id: 1, username: 'alice' }, amount: 244.5 },
                ],
                settlements: [],
                currency: 'AUD',
                unconverted: { item_ids: [], settlement_ids: [], currencies: [] },
              }
            : leftOut
        )
      ),
      http.post('/api/trips/1/budget/freeze-rates', async ({ request }) => {
        frozen.push(await request.json());
        healed = true;
        return HttpResponse.json({ items: [{ ...pho(), exchange_rate: 18241.3 }], settlements: [], unresolved: [] });
      })
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    // Only the currency the settlement is missing, at the rate the browser holds.
    await waitFor(() => expect(frozen).toEqual([{ fallback_fx: { base: 'AUD', rates: { VND: 18241.3 } } }]));
    // The settlement is read again and Bob's half can be settled.
    expect(await screen.findByRole('button', { name: /^Settle(:|$)/ })).toBeInTheDocument();
    expect(screen.getAllByText(/244\.50/).length).toBeGreaterThan(0);
    // Nothing on the page counts the bill as 8,920,000 dollars any more.
    expect(screen.queryByText(/\$8,920,000/)).toBeNull();
    expect(frozen).toHaveLength(1);
  });

  it("FE-W5COSTS-091: a viewer's browser never freezes anything", async () => {
    seedStore(usePermissionsStore, { permissions: { budget_edit: 'admin' } });
    let frozen = 0;
    server.use(
      http.post('/api/trips/1/budget/freeze-rates', () => {
        frozen += 1;
        return HttpResponse.json({ items: [], settlements: [], unresolved: [] });
      })
    );
    mount([pho()], leftOut);

    await screen.findByText('Pho');
    await new Promise((r) => setTimeout(r, 50));
    expect(frozen).toBe(0);
  });

  it('FE-W5COSTS-092: settle-up in the display currency lends its rate and asks the settlement in it', async () => {
    // Read in euros: the browser has the AUD table, the server has no quote at all.
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
    const asked: { base: string | null; baseRate: string | null }[] = [];
    const posted: Record<string, unknown>[] = [];
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', ({ request }) => {
        const url = new URL(request.url);
        asked.push({ base: url.searchParams.get('base'), baseRate: url.searchParams.get('base_rate') });
        return HttpResponse.json({
          balances: [],
          settlements: [],
          currency: 'EUR',
          unconverted: { item_ids: [], settlement_ids: [], currencies: [] },
          flows: [{ from: { user_id: 2, username: 'bob' }, to: { user_id: 1, username: 'alice' }, amount: 20 }],
        });
      }),
      http.post('/api/trips/1/budget/settlements', async ({ request }) => {
        posted.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ settlement: { id: 1 } });
      })
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    fireEvent.click(await screen.findByRole('button', { name: /^Settle(:|$)/ }));
    await waitFor(() => expect(posted).toHaveLength(1));
    // The transfer freezes at the rate the settlement was labelled with, so it cancels its
    // flow to the cent.
    expect(posted[0]).toMatchObject({
      from_user_id: 2,
      to_user_id: 1,
      amount: 20,
      currency: 'EUR',
      fallback_fx: { base: 'AUD', rates: { EUR: 0.61 } },
    });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((a) => a.base === 'EUR' && a.baseRate === '0.61')).toBe(true);

    const settleAll = screen.getByRole('button', { name: 'Settle up' });
    fireEvent.click(settleAll);
    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toMatchObject({
      amount: 20,
      currency: 'EUR',
      fallback_fx: { base: 'AUD', rates: { EUR: 0.61 } },
    });
  });

  it('FE-W5COSTS-093: a payment added by hand lends the rate for its currency too', async () => {
    const user = userEvent.setup();
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/trips/1/budget/settlements', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ settlement: { id: 1 } });
      })
    );
    mount([]);

    await user.click(await screen.findByRole('button', { name: 'Add payment' }));
    await user.type(await screen.findByPlaceholderText('0,00'), '25');
    const submits = screen.getAllByRole('button', { name: 'Add payment' });
    await user.click(submits[submits.length - 1]);

    await waitFor(() => expect(posted).toBeTruthy());
    expect(posted).toMatchObject({ amount: 25, currency: 'EUR', fallback_fx: { base: 'AUD', rates: { EUR: 0.61 } } });
  });

  it('FE-W5COSTS-094: a display rate the settlement query would refuse is not sent', async () => {
    // A trip in gold read in rials: 2.6 billion rials to the ounce is past the 1e9 the query
    // takes, and sent as `base_rate` it would fail the whole settlement with a 400.
    seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'XAU' }) });
    seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'IRR' } });
    localStorage.setItem('trek_fx_XAU', JSON.stringify({ rates: { XAU: 1, IRR: 2.6e9 }, ts: Date.now() }));
    localStorage.setItem('trek_fx_IRR', JSON.stringify({ rates: { IRR: 1, XAU: 1 / 2.6e9 }, ts: Date.now() }));
    const asked: { base: string | null; baseRate: string | null }[] = [];
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/1/budget/settlement', ({ request }) => {
        const url = new URL(request.url);
        asked.push({ base: url.searchParams.get('base'), baseRate: url.searchParams.get('base_rate') });
        return HttpResponse.json({
          balances: [],
          flows: [],
          settlements: [],
          currency: 'XAU',
          unconverted: { item_ids: [], settlement_ids: [], currencies: [] },
        });
      })
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);

    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    // Still asked in rials, only without the figure; the server answers in the trip
    // currency when it has no quote of its own.
    expect(asked.every((a) => a.base === 'IRR' && a.baseRate === null)).toBe(true);
  });
});

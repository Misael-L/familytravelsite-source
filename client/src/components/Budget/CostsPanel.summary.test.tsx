import { cleanup } from '@testing-library/react';
import { invalidateOfflineSession } from '../../db/offlineDb';
// FE-COSTS-2604-001 to -004: the summary footers and won amounts in the Costs panel (#2604)
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { buildBudgetItem, buildTrip, buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTripStore } from '../../store/tripStore';
import type { BudgetItem } from '../../types';
import CostsPanel, { ExpenseModal } from './CostsPanel';

const tripMembers = [
  { id: 1, username: 'alice', avatar_url: null },
  { id: 2, username: 'bob', avatar_url: null },
];

type MemberFixture = { user_id: number; username?: string; amount?: number; paid?: number };
type Flow = { from: { user_id: number; username: string }; to: { user_id: number; username: string }; amount: number };
const expense = (over: Partial<Omit<BudgetItem, 'members'>> & { members?: MemberFixture[] }): BudgetItem =>
  ({ ...buildBudgetItem({ trip_id: 1 }), payers: [], members: [], ...over }) as unknown as BudgetItem;

function mount(items: BudgetItem[], settlement: { flows?: Flow[] } = {}) {
  server.use(
    http.get('/api/trips/1/budget', () => HttpResponse.json({ items })),
    http.get('/api/trips/1/budget/settlement', () =>
      HttpResponse.json({ balances: [], flows: [], settlements: [], ...settlement })
    )
  );
  return render(<CostsPanel tripId={1} tripMembers={tripMembers} />);
}

// Alice is the signed-in user; the euro display currency keeps FX an identity.
function seedAlice() {
  // A fixture reset ends its session, including any still-pending native cache reads.
  invalidateOfflineSession();
  resetAllStores();
  seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'EUR' }) });
  seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
  seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
}

describe('CostsPanel: summary footers and won amounts (#2604)', () => {
  beforeEach(seedAlice);

  const owedByBob = () =>
    expense({
      id: 601,
      name: 'Museum',
      category: 'activities',
      total_price: 40,
      expense_date: '2025-06-15',
      payers: [{ user_id: 1, amount: 40 }],
      members: [
        { user_id: 1, username: 'alice' },
        { user_id: 2, username: 'bob' },
      ],
    });

  it('FE-COSTS-2604-001: the outstanding card says settled up only once no payment is left to make', async () => {
    mount([owedByBob()], {
      flows: [{ from: { user_id: 2, username: 'bob' }, to: { user_id: 1, username: 'alice' }, amount: 20 }],
    });
    // The flow comes with the settlement, which can arrive after the expense.
    await screen.findByRole('button', { name: /^Settle: bob → you/ });
    expect(screen.getByRole('region', { name: 'Outstanding amount' })).not.toHaveTextContent("You're all settled up");
  });

  it('FE-COSTS-2604-002: with nothing left to settle the outstanding card still says so', async () => {
    mount([owedByBob()]);
    await screen.findByText('Museum');
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Outstanding amount' })).toHaveTextContent("You're all settled up")
    );
  });

  it('FE-COSTS-2604-003: a single expense without a payer reads in the singular', async () => {
    mount([
      expense({
        id: 602,
        name: 'Taxi',
        category: 'transport',
        total_price: 30,
        members: [{ user_id: 1, username: 'alice' }],
      }),
    ]);
    await screen.findByText('Taxi');
    expect(screen.getByRole('region', { name: 'Outstanding amount' })).toHaveTextContent('1 expense needs a payer');
  });

  it('FE-COSTS-2604-004: a won expense shows whole won, and the custom split suggests its shares as a placeholder', async () => {
    const user = userEvent.setup();
    render(
      <ExpenseModal
        tripId={1}
        base="KRW"
        people={tripMembers}
        me={1}
        onClose={() => {}}
        onSaved={vi.fn()}
        editing={expense({
          id: 603,
          name: 'BBQ',
          category: 'food',
          currency: 'KRW',
          total_price: 60000,
          payers: [{ user_id: 1, amount: 60000 }],
          members: [
            { user_id: 1, username: 'alice' },
            { user_id: 2, username: 'bob' },
          ],
        })}
      />
    );

    expect(await screen.findByDisplayValue('60000')).toBeInTheDocument();
    expect(screen.getByText('₩30,000 per person')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Custom' }));
    const shares = screen.getAllByPlaceholderText('30000') as HTMLInputElement[];
    expect(shares).toHaveLength(2);
    // A suggestion, not a value: empty, and drawn in the faint placeholder style.
    expect(shares[0].value).toBe('');
    expect(shares[0].className).toContain('placeholder:text-content-faint');

    // A digit after the point is dropped, not read as one more whole won.
    await user.type(shares[0], '1000.5');
    expect(shares[0].value).toBe('1000.');
  });

  it('FE-COSTS-2604-005: edit and delete on a row say which expense they act on', async () => {
    mount([owedByBob()]);
    await screen.findByText('Museum');
    expect(screen.getByRole('button', { name: 'Edit: Museum' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete: Museum' })).toBeInTheDocument();
  });

  it('FE-COSTS-2604-006: a settle-up row and its button name who pays whom', async () => {
    mount([owedByBob()], {
      flows: [{ from: { user_id: 2, username: 'bob' }, to: { user_id: 1, username: 'alice' }, amount: 20 }],
    });
    await screen.findByText('Museum');
    expect(await screen.findByRole('button', { name: /^Settle: bob → you, 20,00\s€$/ })).toBeInTheDocument();
    expect(screen.getAllByText('bob → you').length).toBeGreaterThan(0);
  });
  it('FE-COSTS-2604-007: a previous fixture request cannot replace the next fixture expense', async () => {
    let oldStart!: () => void, newStart!: () => void, releaseOld!: () => void, releaseNew!: () => void;
    const oldStarted = new Promise<void>((r) => (oldStart = r)),
      newStarted = new Promise<void>((r) => (newStart = r));
    const oldGate = new Promise<void>((r) => (releaseOld = r)),
      newGate = new Promise<void>((r) => (releaseNew = r));
    seedAlice();
    let oldTask!: Promise<void>;
    const load = useTripStore.getState().loadBudgetItems;
    useTripStore.setState({
      loadBudgetItems: (id) => {
        oldTask = load(id);
        return oldTask;
      },
    });
    server.use(
      http.get('/api/trips/1/budget', async () => {
        oldStart();
        await oldGate;
        return HttpResponse.json({ items: [expense({ id: 601, name: 'Museum', total_price: 40 })] });
      }),
      http.get('/api/trips/1/budget/settlement', () => HttpResponse.json({ balances: [], flows: [], settlements: [] }))
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);
    await oldStarted;
    cleanup();
    seedAlice();
    server.use(
      http.get('/api/trips/1/budget', async () => {
        newStart();
        await newGate;
        return HttpResponse.json({
          items: [expense({ id: 602, name: 'Taxi', total_price: 30, members: [{ user_id: 1, username: 'alice' }] })],
        });
      })
    );
    render(<CostsPanel tripId={1} tripMembers={tripMembers} />);
    await newStarted;
    releaseOld();
    await oldTask;
    releaseNew();
    await screen.findByText('Taxi');
    expect(screen.queryByText('Museum')).not.toBeInTheDocument();
  });
});

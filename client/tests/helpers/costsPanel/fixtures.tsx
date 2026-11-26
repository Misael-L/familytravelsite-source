// organize-imports-ignore
// sort-imports-ignore
// Preserve the original test runtime module evaluation order.
import '../../../src/db/offlineDb';
import '../../../src/store/tripReadScope';
import '../offlineDb';
import { render, screen, fireEvent, within } from '../render';
import '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { useAuthStore } from '../../../src/store/authStore';
import '../../../src/store/tripStore';
import { useSettingsStore } from '../../../src/store/settingsStore';
import '../../../src/store/permissionsStore';
import '../../../src/hooks/useExchangeRates';
import { seedStore } from '../store';
import { buildUser, buildBudgetItem } from '../factories';
import type { BudgetParticipantFinal } from '@trek/shared';
import type { BudgetItem } from '../../../src/types';
import CostsPanel from '../../../src/components/Budget/CostsPanel';
import '../../../src/components/Budget/CostsPanel.helpers';
import '../../../src/components/Budget/useFreezeMissingRates';

export const tripMembers = [
  { id: 1, username: 'alice', avatar_url: null },
  { id: 2, username: 'bob', avatar_url: null },
];

/** Bob's buttons in the expense form — his final-budget row in the sidebar answers to his name too. */
export const bobInForm = () => screen.getAllByRole('checkbox', { name: /bob/i });

// ── The rest of the panel ────────────────────────────────────────────────────

export type Flow = {
  from: { user_id: number; username: string };
  to: { user_id: number; username: string };
  amount: number;
};

export type Balance = { user_id: number; username: string; avatar_url: string | null; balance: number };

export type Payment = {
  id: number;
  from_user_id: number;
  to_user_id: number;
  amount: number;
  currency?: string | null;
  exchange_rate?: number;
  created_at?: string;
  settled_at?: string | null;
};

// `members` here is the wire shape the panel reads; `paid` is only set by the server.
export type MemberFixture = { user_id: number; username?: string; amount?: number; paid?: number };

export const expense = (over: Partial<Omit<BudgetItem, 'members'>> & { members?: MemberFixture[] }): BudgetItem =>
  ({ ...buildBudgetItem({ trip_id: 1 }), payers: [], members: [], ...over }) as unknown as BudgetItem;

export function mount(
  items: BudgetItem[],
  settlement: {
    balances?: Balance[];
    flows?: Flow[];
    settlements?: Payment[];
    finalBudgets?: BudgetParticipantFinal[];
  } = {},
  entries?: string[]
) {
  server.use(
    http.get('/api/trips/1/budget', () => HttpResponse.json({ items })),
    http.get('/api/trips/1/budget/settlement', () =>
      HttpResponse.json({ balances: [], flows: [], settlements: [], ...settlement })
    )
  );
  return render(<CostsPanel tripId={1} tripMembers={tripMembers} />, entries ? { initialEntries: entries } : undefined);
}

/** CustomSelect renders its options into a body portal. */
export function pickOption(label: string | RegExp) {
  const dropdown = document.querySelector('div[style*="z-index: 99999"]') as HTMLElement;
  fireEvent.click(within(dropdown).getByRole('button', { name: label }));
}

// Alice is the signed-in user throughout; the euro display currency keeps FX an identity.
export function seedAlice() {
  seedStore(useAuthStore, { user: buildUser({ id: 1, username: 'alice' }), isAuthenticated: true });
  seedStore(useSettingsStore, { settings: { ...useSettingsStore.getState().settings, default_currency: 'EUR' } });
}

export const dinner = () =>
  expense({
    id: 101,
    name: 'Dinner',
    category: 'food',
    total_price: 90,
    expense_date: '2025-06-15',
    payers: [{ user_id: 1, amount: 90 }],
    members: [
      { user_id: 1, username: 'alice' },
      { user_id: 2, username: 'bob' },
    ],
  });

export const taxi = () =>
  expense({
    id: 102,
    name: 'Taxi',
    category: 'transport',
    total_price: 30,
    expense_date: '2025-06-16',
    payers: [{ user_id: 2, amount: 30 }],
    members: [
      { user_id: 1, username: 'alice' },
      { user_id: 2, username: 'bob' },
    ],
  });

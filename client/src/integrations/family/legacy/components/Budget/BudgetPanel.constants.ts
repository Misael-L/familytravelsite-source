import {
  CURRENCIES as nativeCurrencies,
  SYMBOLS as nativeSymbols,
} from '../../../../../components/Budget/BudgetPanel.constants';

// Start with the native catalog while keeping the retained module’s own collections.
export const CURRENCIES = [...nativeCurrencies];
export const SYMBOLS: Record<string, string> = { ...nativeSymbols };

// Keep a currency the user already saved selectable even after it leaves the
// supported set (e.g. archived BGN/HRK), so opening an existing item or settings
// row doesn't silently blank the field and wipe the value on the next save.
export function currenciesWith(current?: string | null): readonly string[] {
  const cur = (current || '').toUpperCase();
  return cur && !CURRENCIES.includes(cur) ? [...CURRENCIES, cur] : CURRENCIES;
}

export const PIE_COLORS = [
  '#6366f1',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
  '#f97316',
  '#06b6d4',
  '#84cc16',
  '#a855f7',
];

export const SPLIT_COLORS = [
  { solid: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)' },
  { solid: '#ec4899', gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)' },
  { solid: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #22c55e)' },
  { solid: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #f97316)' },
  { solid: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)' },
  { solid: '#a855f7', gradient: 'linear-gradient(135deg, #a855f7, #d946ef)' },
];

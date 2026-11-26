// Pure constants + helpers + types for the todo list. No React, no side effects.

export const KAT_COLORS = [
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#22c55e',
  '#f97316',
  '#06b6d4',
  '#ef4444',
  '#eab308',
  '#8b5cf6',
  '#14b8a6',
];

const PRIO_PALETTE = { urgent: '#ef4444', soon: '#f59e0b', later: '#3b82f6' } as const;

export const PRIO_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: 'P1', color: PRIO_PALETTE.urgent },
  2: { label: 'P2', color: PRIO_PALETTE.soon },
  3: { label: 'P3', color: PRIO_PALETTE.later },
};

export function katColor(kat: string, allCategories: string[]) {
  const idx = allCategories.indexOf(kat);
  if (idx >= 0) return KAT_COLORS[idx % KAT_COLORS.length];
  let h = 0;
  for (let i = 0; i < kat.length; i++) h = ((h << 5) - h + kat.charCodeAt(i)) | 0;
  return KAT_COLORS[Math.abs(h) % KAT_COLORS.length];
}

export type FilterType = 'all' | 'my' | 'overdue' | 'done' | string;

export interface Member {
  id: number | string;
  username: string;
  avatar: string | null;
  is_guest?: boolean;
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<{ op: string; table: string; payload?: unknown }> = [];

function chain(result: { data: unknown; error: null }) {
  const next = () => chain(result);
  return {
    eq: next,
    select: () => ({ single: async () => result }),
    single: async () => result,
  };
}

vi.mock('./legacy/data/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from(table: string) {
      return {
        update(payload: unknown) {
          calls.push({ op: 'update', table, payload });
          return chain({
            data: {
              id: 'row-1',
              trip_id: 'trip-1',
              activity: 'Visit',
              place_id: null,
              starts_at: '2026-10-29T09:00:00.000Z',
              ends_at: '2026-10-29T10:00:00.000Z',
              address: null,
              time_zone: null,
              sort_order: 2,
              experience_id: null,
              food_id: null,
              link_url: null,
            },
            error: null,
          });
        },
        insert(payload: unknown) {
          calls.push({ op: 'insert', table, payload });
          return chain({ data: null, error: null });
        },
      };
    },
  }),
}));

import { updateScheduleTiming } from './legacy/data/supabase/scheduleItems';

describe('updateScheduleTiming', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('updates the same schedule row and does not insert', async () => {
    const saved = await updateScheduleTiming('trip-1', 'row-1', {
      startsAt: '2026-10-29T09:00:00.000Z',
      endsAt: '2026-10-29T10:00:00.000Z',
      sortOrder: 2,
    });
    expect(saved.id).toBe('row-1');
    expect(calls.map((call) => call.op)).toEqual(['update']);
    expect(calls[0]).toMatchObject({
      table: 'schedule_items',
      payload: {
        starts_at: '2026-10-29T09:00:00.000Z',
        ends_at: '2026-10-29T10:00:00.000Z',
        sort_order: 2,
      },
    });
  });
});

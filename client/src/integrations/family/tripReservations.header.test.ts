import { beforeEach, describe, expect, it, vi } from 'vitest';

const headers: unknown[] = [];

function write(payload: unknown) {
  headers.push(payload);
  const result = Promise.resolve({ data: { id: 'res-1' }, error: null });
  return Object.assign(result, {
    eq: () => result,
    select: () => ({ single: async () => ({ data: { id: 'res-1' }, error: null }) }),
  });
}

vi.mock('./legacy/data/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from() {
      return {
        update: (payload: unknown) => write(payload),
        insert: (payload: unknown) => write(payload),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    },
  }),
}));

import { upsertTripTransport, type FamilyTransportDraft } from './legacy/data/supabase/tripReservations';

function draft(extra: Partial<FamilyTransportDraft> = {}): FamilyTransportDraft {
  return {
    id: 'res-1',
    type: 'flight',
    status: 'confirmed',
    title: 'Home',
    endpoints: [],
    legs: [],
    ...extra,
  };
}

describe('transport header clocks and metadata', () => {
  beforeEach(() => {
    headers.length = 0;
  });

  it('uses header clocks when the draft has no endpoints', async () => {
    await upsertTripTransport(
      'trip',
      draft({
        headerStartsAt: '2026-10-29T08:00:00.000Z',
        headerEndsAt: '2026-10-29T11:00:00.000Z',
      })
    );
    expect(headers[0]).toMatchObject({
      starts_at: '2026-10-29T08:00:00.000Z',
      ends_at: '2026-10-29T11:00:00.000Z',
    });
    expect(headers[0]).not.toHaveProperty('metadata');
  });

  it('lets endpoint clocks override header clocks', async () => {
    await upsertTripTransport(
      'trip',
      draft({
        headerStartsAt: '2026-10-29T08:00:00.000Z',
        headerEndsAt: '2026-10-29T11:00:00.000Z',
        endpoints: [
          { name: 'A', localDate: '2026-10-29', localTime: '09:30' },
          { name: 'B', localDate: '2026-10-29', localTime: '12:15' },
        ],
      })
    );
    expect(headers[0]).toMatchObject({
      starts_at: '2026-10-29T09:30:00.000Z',
      ends_at: '2026-10-29T12:15:00.000Z',
    });
  });

  it('writes metadata only when the draft includes it', async () => {
    await upsertTripTransport('trip', draft({ metadata: { airline: 'AY' } }));
    expect(headers[0]).toMatchObject({ metadata: { airline: 'AY' } });
  });
});

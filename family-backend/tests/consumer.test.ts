import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseBrowserClient } from '@family/backend/supabase/client';
import { listTripDays } from '@family/backend/supabase/tripDays';

const tripId = '11111111-1111-4111-8111-111111111111';
const dayId = '22222222-2222-4222-8222-222222222222';
const http = vi.fn<typeof fetch>();

beforeEach(() => {
  http.mockReset();
  vi.stubGlobal('fetch', http);
});

afterAll(() => getSupabaseBrowserClient().auth.stopAutoRefresh());

describe('copied adapters through workspace package exports and the real Supabase SDK', () => {
  it('sends the Family UUID filter and maps a REST response without changing the source adapter', async () => {
    http.mockResolvedValueOnce(new Response(JSON.stringify([{
      id: dayId,
      trip_id: tripId,
      civil_day: '2026-08-12',
      day_index: 0,
      title: null,
    }]), { headers: { 'Content-Type': 'application/json' } }));

    await expect(listTripDays(tripId)).resolves.toEqual([{
      id: dayId, tripId, civilDay: '2026-08-12', dayIndex: 0, title: null,
    }]);
    expect(http).toHaveBeenCalledTimes(1);
    const url = new URL(String(http.mock.calls[0][0]));
    expect(url.origin).toBe('https://family-carryover.invalid');
    expect(url.pathname).toBe('/rest/v1/trip_days');
    expect(url.searchParams.get('trip_id')).toBe(`eq.${tripId}`);
  });

  it('propagates a denied REST read instead of displaying an empty success', async () => {
    http.mockResolvedValueOnce(new Response(JSON.stringify({
      code: '42501', message: 'permission denied', details: null, hint: null,
    }), { status: 403, headers: { 'Content-Type': 'application/json' } }));

    await expect(listTripDays(tripId)).rejects.toMatchObject({ code: '42501', message: 'permission denied' });
    expect(http).toHaveBeenCalledTimes(1);
  });
});

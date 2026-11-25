import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { listHubTripTravelers } from './tripTravelers'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('listHubTripTravelers', () => {
  const from = vi.fn()
  const inFn = vi.fn()

  beforeEach(() => {
    from.mockReset()
    inFn.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from } as never)
  })

  it('returns [] without querying when tripIds is empty', async () => {
    await expect(listHubTripTravelers([])).resolves.toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('queries .in(trip_id, ids) and maps people embeds without avatar_url', async () => {
    inFn.mockResolvedValue({
      data: [
        {
          trip_id: 't1',
          person_id: 'p1',
          people: { display_name: 'Ada', color: '#111' },
        },
        {
          trip_id: 't2',
          person_id: 'p2',
          people: [{ display_name: 'Bob', color: null }],
        },
        { trip_id: 't1', person_id: null, people: { display_name: 'Skip', color: null } },
      ],
      error: null,
    })
    const select = vi.fn().mockReturnValue({ in: inFn })
    from.mockReturnValue({ select })

    const rows = await listHubTripTravelers(['t1', 't2'])
    expect(from).toHaveBeenCalledWith('trip_travelers')
    expect(select).toHaveBeenCalledWith('trip_id,person_id,people(display_name,color)')
    expect(inFn).toHaveBeenCalledWith('trip_id', ['t1', 't2'])
    expect(rows).toEqual([
      { tripId: 't1', personId: 'p1', displayName: 'Ada', color: '#111', avatarUrl: null },
      { tripId: 't2', personId: 'p2', displayName: 'Bob', color: null, avatarUrl: null },
    ])
  })

  it('throws on { error }', async () => {
    inFn.mockResolvedValue({ data: null, error: { message: 'rls' } })
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: inFn }),
    })
    await expect(listHubTripTravelers(['t1'])).rejects.toMatchObject({ message: 'rls' })
  })
})

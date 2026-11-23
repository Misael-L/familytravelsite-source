import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { duplicateTrip } from './tripProposals'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

const rpc = vi.fn()

beforeEach(() => {
  rpc.mockReset()
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
})

describe('duplicateTrip', () => {
  it('calls duplicate_trip with p_source_trip_id and parses ids', async () => {
    rpc.mockResolvedValue({
      data: { trip_id: 't-new', proposal_id: 'p-new' },
      error: null,
    })
    await expect(duplicateTrip('t-src')).resolves.toEqual({
      tripId: 't-new',
      proposalId: 'p-new',
    })
    expect(rpc).toHaveBeenCalledWith('duplicate_trip', { p_source_trip_id: 't-src' })
  })

  it('throws on rpc error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Not an active member of this family' },
    })
    await expect(duplicateTrip('t-src')).rejects.toMatchObject({
      message: 'Not an active member of this family',
    })
  })
})

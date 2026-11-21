import { beforeEach, describe, expect, it, vi } from 'vitest'
import { packingItemWeight, upsertPackingItem } from './packing'
import { todoIsOverdue } from './todos'
import { filesForPlace, TRIP_FILE_MAX_BYTES } from './tripFiles'
import { getSupabaseBrowserClient } from './client'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

const from = vi.fn()
const rpc = vi.fn()

beforeEach(() => {
  from.mockReset()
  rpc.mockReset()
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from, rpc } as never)
})

function chain(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {}
  const self = () => q
  q.select = vi.fn(self)
  q.eq = vi.fn(self)
  q.insert = vi.fn(self)
  q.update = vi.fn(self)
  q.delete = vi.fn(self)
  q.order = vi.fn(self)
  q.single = vi.fn(async () => result)
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return q
}

describe('packing adapters', () => {
  it('throws on upsert error', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'nope' } }))
    await expect(upsertPackingItem('trip-1', { name: 'Passport' })).rejects.toMatchObject({ message: 'nope' })
  })

  it('weights quantity times grams', () => {
    expect(packingItemWeight({ weightGrams: 250, quantity: 2 })).toBe(500)
    expect(packingItemWeight({ weightGrams: null, quantity: 3 })).toBe(0)
  })
})

describe('todo helpers', () => {
  it('marks unchecked past due dates overdue', () => {
    expect(todoIsOverdue({
      id: '1', tripId: 't', name: 'x', checked: false, category: '', sortOrder: 0,
      dueDate: '2026-01-01', description: null, assignedPersonId: null, priority: 1,
    }, '2026-08-17')).toBe(true)
    expect(todoIsOverdue({
      id: '1', tripId: 't', name: 'x', checked: true, category: '', sortOrder: 0,
      dueDate: '2026-01-01', description: null, assignedPersonId: null, priority: 1,
    }, '2026-08-17')).toBe(false)
  })
})

describe('trip file helpers', () => {
  it('keeps the 50 MB app cap below the 100 MiB bucket', () => {
    expect(TRIP_FILE_MAX_BYTES).toBe(50 * 1024 * 1024)
    expect(TRIP_FILE_MAX_BYTES).toBeLessThan(100 * 1024 * 1024)
  })

  it('filters files linked to a catalog place', () => {
    const files = [
      {
        id: 'a', tripId: 't', storagePath: 'p', originalName: 'a.pdf', mimeType: 'application/pdf',
        sizeBytes: 1, uploadedBy: null, starred: false, description: null, deletedAt: null, createdAt: '',
        links: [{ id: 'l1', fileId: 'a', placeId: 'place-1', reservationId: null, tripDayId: null }],
      },
      {
        id: 'b', tripId: 't', storagePath: 'p', originalName: 'b.pdf', mimeType: 'application/pdf',
        sizeBytes: 1, uploadedBy: null, starred: false, description: null, deletedAt: null, createdAt: '',
        links: [{ id: 'l2', fileId: 'b', placeId: null, reservationId: 'res-1', tripDayId: null }],
      },
    ]
    expect(filesForPlace(files, 'place-1').map(f => f.id)).toEqual(['a'])
  })
})

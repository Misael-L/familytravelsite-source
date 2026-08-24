import { describe, expect, it } from 'vitest'
import { toFileManagerFile } from './familyFileManager'
import type { FamilyTripFile } from '../../data/supabase/tripFiles'

const base: FamilyTripFile = {
  id: 'file-1',
  tripId: 'trip-1',
  storagePath: 'fam/trip/a.pdf',
  originalName: 'boarding.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  uploadedBy: 'person-1',
  starred: true,
  description: 'Gate B',
  deletedAt: null,
  createdAt: '2026-08-18T12:00:00Z',
  links: [
    { id: 'l1', fileId: 'file-1', placeId: 'place-a', reservationId: null, tripDayId: null },
    { id: 'l2', fileId: 'file-1', placeId: 'place-b', reservationId: null, tripDayId: null },
    { id: 'l3', fileId: 'file-1', placeId: null, reservationId: 'res-1', tripDayId: null },
    { id: 'l4', fileId: 'file-1', placeId: null, reservationId: null, tripDayId: 'day-1' },
  ],
}

describe('toFileManagerFile', () => {
  it('maps junction links onto TREK primary + extra ids without coercing UUIDs', () => {
    const view = toFileManagerFile(base, 'https://signed.example/a.pdf', { name: 'Ada' })
    expect(view.id).toBe('file-1')
    expect(view.trip_id).toBe('trip-1')
    expect(view.original_name).toBe('boarding.pdf')
    expect(view.file_size).toBe(2048)
    expect(view.starred).toBe(1)
    expect(view.url).toBe('https://signed.example/a.pdf')
    expect(view.uploaded_by_name).toBe('Ada')
    expect(view.place_id).toBe('place-a')
    expect(view.linked_place_ids).toEqual(['place-b'])
    expect(view.reservation_id).toBe('res-1')
    expect(view.linked_day_ids).toEqual(['day-1'])
    expect(view.note_id).toBeNull()
  })
})

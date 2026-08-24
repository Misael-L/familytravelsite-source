import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signedTripFileUrl, type FamilyTripFile } from '../../data/supabase/tripFiles'
import { createFamilyFileManagerOps, toFileManagerFile } from './familyFileManager'

vi.mock('../../data/supabase/tripFiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripFiles')>()
  return {
    ...actual,
    signedTripFileUrl: vi.fn(),
  }
})

const familyFile: FamilyTripFile = {
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
  links: [],
}

describe('createFamilyFileManagerOps.resolveActionUrl', () => {
  beforeEach(() => {
    vi.mocked(signedTripFileUrl).mockReset()
  })

  it('mints a fresh signed URL from storagePath on every action', async () => {
    vi.mocked(signedTripFileUrl)
      .mockResolvedValueOnce('https://signed.example/1')
      .mockResolvedValueOnce('https://signed.example/2')
    const ops = createFamilyFileManagerOps({
      tripId: 'trip-1',
      getSnapshot: () => ({ files: [familyFile], trash: [] }),
    })
    const view = toFileManagerFile(familyFile, 'https://stale.example/old')
    await expect(ops.resolveActionUrl!(view)).resolves.toBe('https://signed.example/1')
    await expect(ops.resolveActionUrl!(view)).resolves.toBe('https://signed.example/2')
    expect(signedTripFileUrl).toHaveBeenCalledTimes(2)
    expect(signedTripFileUrl).toHaveBeenCalledWith('fam/trip/a.pdf', 120)
  })
})

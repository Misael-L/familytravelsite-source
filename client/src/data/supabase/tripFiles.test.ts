import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { finalizePrivateUpload } from './privateUploads'
import { permanentlyDeleteTripFile, uploadTripFile } from './tripFiles'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

vi.mock('./privateUploads', () => ({
  finalizePrivateUpload: vi.fn(),
}))

vi.mock('../../utils/convertHeic', () => ({
  normalizeImageFile: async (file: File) => file,
}))

describe('tripFiles trusted upload', () => {
  const rpc = vi.fn()
  const upload = vi.fn()
  const remove = vi.fn()

  beforeEach(() => {
    rpc.mockReset()
    upload.mockReset()
    remove.mockReset()
    vi.mocked(finalizePrivateUpload).mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc,
      storage: { from: vi.fn(() => ({ upload, remove })) },
    } as never)
  })

  it('uploads then finalizes and does not insert trip_files directly', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
    upload.mockResolvedValueOnce({ error: null })
    vi.mocked(finalizePrivateUpload).mockResolvedValueOnce({ id: 'file-1' })
    const file = new File([new Uint8Array([1, 2, 3])], 'a.pdf', { type: 'application/pdf' })
    await expect(uploadTripFile({
      familyId: 'fam-1',
      tripId: 'trip-1',
      file,
      uploadedBy: 'p-1',
    })).resolves.toBe('file-1')
    expect(finalizePrivateUpload).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'trip_file',
      tripId: 'trip-1',
    }))
    expect(rpc).not.toHaveBeenCalled()
    uuid.mockRestore()
  })

  it('purges through RPC without client Storage delete', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null })
    await permanentlyDeleteTripFile({ id: 'file-1', storagePath: 'fam-1/trip-1/a.pdf' })
    expect(rpc).toHaveBeenCalledWith('purge_trip_file', { p_file_id: 'file-1' })
    expect(remove).not.toHaveBeenCalled()
  })
})

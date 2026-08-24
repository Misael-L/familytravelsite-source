import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  FAMILY_AVATAR_BUCKET,
  uploadPersonAvatar,
} from './personAvatars'
import { finalizePrivateUpload } from './privateUploads'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

vi.mock('./privateUploads', () => ({
  finalizePrivateUpload: vi.fn(),
}))

vi.mock('../../utils/convertHeic', () => ({
  normalizeImageFile: async (file: File) => file,
}))

function thenable(result: { data: unknown; error: unknown }) {
  const t: Record<string, unknown> = {}
  const self = () => t
  for (const m of ['select', 'eq', 'in', 'is', 'maybeSingle', 'single']) {
    t[m] = vi.fn(self)
  }
  t.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return t
}

describe('uploadPersonAvatar', () => {
  const from = vi.fn()
  const rpc = vi.fn()
  const upload = vi.fn()
  const remove = vi.fn()
  const createSignedUrls = vi.fn()

  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
    upload.mockReset()
    remove.mockReset()
    createSignedUrls.mockReset()
    vi.mocked(finalizePrivateUpload).mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      from,
      rpc,
      storage: { from: vi.fn(() => ({ upload, remove, createSignedUrls })) },
    } as never)
  })

  it('uploads to family/people path then finalize-private-upload and rolls back on error', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
    from.mockImplementation((table: string) => {
      if (table === 'media_assets') return thenable({ data: null, error: null })
      return thenable({ data: [], error: null })
    })
    upload.mockResolvedValueOnce({ error: null })
    vi.mocked(finalizePrivateUpload).mockRejectedValueOnce({ message: 'nope' })
    remove.mockResolvedValueOnce({ error: null })
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'a.jpg', { type: 'image/jpeg' })
    const personId = '22222222-2222-4222-8222-222222222222'
    await expect(uploadPersonAvatar({ familyId: 'fam-1', personId, file }))
      .rejects.toEqual({ message: 'nope' })
    const path = `fam-1/people/${personId}/11111111-1111-4111-8111-111111111111.jpg`
    expect(upload).toHaveBeenCalledWith(
      path,
      expect.any(File),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    )
    expect(finalizePrivateUpload).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'person_avatar',
      path,
      personId,
    }))
    expect(remove).toHaveBeenCalledWith([path])
    expect(FAMILY_AVATAR_BUCKET).toBe('family')
    uuid.mockRestore()
  })
})

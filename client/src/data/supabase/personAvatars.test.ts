import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  AVATAR_OBJECT_PROBE_EXPIRES_SEC,
  FAMILY_AVATAR_BUCKET,
  PERSON_AVATAR_MAX_BYTES,
  PersonAvatarError,
  SIGNED_URL_EXPIRES_SEC,
  asPersonAvatarError,
  familyAvatarObjectExists,
  personAvatarMessageKey,
  resolveCurrentPersonAvatarUrl,
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
  for (const m of ['select', 'eq', 'in', 'is', 'maybeSingle', 'single', 'update']) {
    t[m] = vi.fn(self)
  }
  t.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return t
}

const familyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const personId = '22222222-2222-4222-8222-222222222222'
const existingPath = `${familyId}/people/${personId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`
const probeUrl = 'https://storage.example/probe-do-not-persist'
const displayUrl = 'https://storage.example/display-1h'

describe('uploadPersonAvatar', () => {
  const from = vi.fn()
  const rpc = vi.fn()
  const upload = vi.fn()
  const remove = vi.fn()
  const createSignedUrl = vi.fn()
  const createSignedUrls = vi.fn()

  function jpegFile() {
    return new File([new Uint8Array([1, 2, 3, 4])], 'a.jpg', { type: 'image/jpeg' })
  }

  function existingMatch() {
    return thenable({
      data: { id: 'media-1', storage_path: existingPath, filename: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg' },
      error: null,
    })
  }

  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
    upload.mockReset()
    remove.mockReset()
    createSignedUrl.mockReset()
    createSignedUrls.mockReset()
    vi.mocked(finalizePrivateUpload).mockReset()
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      from,
      rpc,
      storage: { from: vi.fn(() => ({ upload, remove, createSignedUrl, createSignedUrls })) },
    } as never)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reuses a live object without upload or finalize', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'media_assets') return existingMatch()
      return thenable({
        data: [{
          person_id: personId,
          family_id: familyId,
          display_name: 'Pat',
          color: null,
          avatar_media_id: 'media-1',
          bucket: FAMILY_AVATAR_BUCKET,
          storage_path: existingPath,
        }],
        error: null,
      })
    })
    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: probeUrl }, error: null })
    rpc.mockResolvedValueOnce({ data: { media_id: 'media-1', storage_action: 'reused' }, error: null })
    createSignedUrls.mockResolvedValueOnce({
      data: [{ signedUrl: displayUrl, error: null, path: existingPath }],
      error: null,
    })

    const url = await uploadPersonAvatar({ familyId, personId, file: jpegFile() })
    expect(url).toBe(displayUrl)
    expect(createSignedUrl).toHaveBeenCalledWith(existingPath, AVATAR_OBJECT_PROBE_EXPIRES_SEC)
    expect(fetch).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(finalizePrivateUpload).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('register_person_avatar', expect.objectContaining({
      p_person_id: personId,
      p_storage_path: existingPath,
    }))
    expect(url).not.toBe(probeUrl)
  })

  it('uploads and finalizes when metadata exists but the object is missing', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
    from.mockImplementation((table: string) => {
      if (table === 'media_assets') return existingMatch()
      return thenable({ data: [], error: null })
    })
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
    upload.mockResolvedValueOnce({ error: null })
    vi.mocked(finalizePrivateUpload).mockResolvedValueOnce({ media_id: 'media-1', storage_action: 'repaired' })
    createSignedUrls.mockResolvedValueOnce({ data: [], error: null })

    await uploadPersonAvatar({ familyId, personId, file: jpegFile() })
    const path = `${familyId}/people/${personId}/11111111-1111-4111-8111-111111111111.jpg`
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
    expect(rpc).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    uuid.mockRestore()
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
    await expect(uploadPersonAvatar({ familyId, personId, file: jpegFile() }))
      .rejects.toMatchObject({ name: 'PersonAvatarError', code: 'unavailable' })
    const path = `${familyId}/people/${personId}/11111111-1111-4111-8111-111111111111.jpg`
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

  it('rejects unsupported MIME and oversized files before upload', async () => {
    await expect(uploadPersonAvatar({
      familyId,
      personId,
      file: new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' }),
    })).rejects.toMatchObject({ code: 'bad-type' })
    const big = new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: PERSON_AVATAR_MAX_BYTES + 1 })
    await expect(uploadPersonAvatar({ familyId, personId, file: big }))
      .rejects.toMatchObject({ code: 'too-large' })
    expect(upload).not.toHaveBeenCalled()
    expect(finalizePrivateUpload).not.toHaveBeenCalled()
  })

  it('rejects missing ids', async () => {
    await expect(uploadPersonAvatar({ familyId: ' ', personId, file: jpegFile() }))
      .rejects.toMatchObject({ code: 'missing-ids' })
  })
})

describe('personAvatarMessageKey', () => {
  it('maps stable codes and never exposes raw database text', () => {
    expect(personAvatarMessageKey(new PersonAvatarError('too-large'))).toBe('settings.avatarErrorTooLarge')
    expect(personAvatarMessageKey(new PersonAvatarError('bad-type'))).toBe('settings.avatarErrorType')
    expect(personAvatarMessageKey(new PersonAvatarError('not-authorized'))).toBe('settings.avatarUnauthorized')
    expect(personAvatarMessageKey(new Error('storage object missing'))).toBe('settings.avatarUnavailable')
    expect(personAvatarMessageKey(new Error('not authorized'))).toBe('settings.avatarUnauthorized')
    expect(asPersonAvatarError({ message: 'P0002' }).code).toBe('unavailable')
  })
})

describe('familyAvatarObjectExists', () => {
  const createSignedUrl = vi.fn()
  const storage = { from: vi.fn(() => ({ createSignedUrl })) }

  beforeEach(() => {
    createSignedUrl.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('treats a successful sign as live and discards the URL without fetching', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: probeUrl }, error: null })
    await expect(familyAvatarObjectExists(storage, existingPath)).resolves.toBe(true)
    expect(createSignedUrl).toHaveBeenCalledWith(existingPath, AVATAR_OBJECT_PROBE_EXPIRES_SEC)
    expect(fetch).not.toHaveBeenCalled()
    expect(localStorage.getItem('trek_auth_snapshot') ?? '').not.toContain(probeUrl)
  })

  it('treats a missing-object or network sign error as absent without fetching', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
    await expect(familyAvatarObjectExists(storage, existingPath)).resolves.toBe(false)
    createSignedUrl.mockRejectedValueOnce(new Error('network'))
    await expect(familyAvatarObjectExists(storage, existingPath)).resolves.toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('resolveCurrentPersonAvatarUrl', () => {
  const from = vi.fn()
  const createSignedUrls = vi.fn()

  beforeEach(() => {
    from.mockReset()
    createSignedUrls.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      from,
      storage: { from: vi.fn(() => ({ createSignedUrls })) },
    } as never)
  })

  it('signs only the current person for the one-hour display window', async () => {
    from.mockReturnValue(thenable({
      data: [{
        person_id: personId,
        family_id: familyId,
        display_name: 'Pat',
        color: null,
        avatar_media_id: 'media-1',
        bucket: FAMILY_AVATAR_BUCKET,
        storage_path: existingPath,
      }],
      error: null,
    }))
    createSignedUrls.mockResolvedValueOnce({
      data: [{ signedUrl: displayUrl, error: null, path: existingPath }],
      error: null,
    })
    await expect(resolveCurrentPersonAvatarUrl({ familyId, personId })).resolves.toBe(displayUrl)
    expect(createSignedUrls).toHaveBeenCalledWith([existingPath], SIGNED_URL_EXPIRES_SEC)
    expect(localStorage.getItem('trek_auth_snapshot') ?? '').not.toContain(displayUrl)
  })

  it('returns null when the person has no avatar pointer', async () => {
    from.mockReturnValue(thenable({ data: [], error: null }))
    await expect(resolveCurrentPersonAvatarUrl({ familyId, personId })).resolves.toBeNull()
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('throws on a soft signing failure so callers can keep the runtime URL', async () => {
    from.mockReturnValue(thenable({
      data: [{
        person_id: personId,
        family_id: familyId,
        display_name: 'Pat',
        color: null,
        avatar_media_id: 'media-1',
        bucket: FAMILY_AVATAR_BUCKET,
        storage_path: existingPath,
      }],
      error: null,
    }))
    createSignedUrls.mockResolvedValueOnce({ data: [{ signedUrl: null, error: 'sign failed' }], error: null })
    await expect(resolveCurrentPersonAvatarUrl({ familyId, personId })).rejects.toThrow('avatar-sign-unavailable')
  })
})


import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { finalizePrivateUpload, readFunctionsErrorMessage } from './privateUploads'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('readFunctionsErrorMessage', () => {
  it('surfaces the Edge Function error code from FunctionsHttpError context', async () => {
    const error = {
      context: { json: async () => ({ error: 'owner_mismatch' }) },
      message: 'Edge Function returned a non-2xx status code',
    }
    await expect(readFunctionsErrorMessage(error)).resolves.toBe('owner_mismatch')
  })

  it('does not leak raw response bodies', async () => {
    const error = {
      context: { json: async () => ({ error: 'object_stat_failed', details: 'GET /rest/v1/objects' }) },
      message: 'Edge Function returned a non-2xx status code',
    }
    const msg = await readFunctionsErrorMessage(error)
    expect(msg).toBe('object_stat_failed')
    expect(msg).not.toMatch(/objects/)
  })
})

describe('finalizePrivateUpload', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseBrowserClient).mockReset()
  })

  it('throws the stable error code instead of the generic non-2xx message', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: {
        context: { json: async () => ({ error: 'size_or_mime_rejected' }) },
        message: 'Edge Function returned a non-2xx status code',
      },
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ functions: { invoke } } as never)
    await expect(finalizePrivateUpload({ kind: 'person_avatar', path: 'x' }))
      .rejects.toThrow('size_or_mime_rejected')
  })
})

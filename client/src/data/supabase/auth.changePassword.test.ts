import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { changePassword } from './auth'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

const signInWithPassword = vi.fn()
const updateUser = vi.fn()
const getUser = vi.fn()

beforeEach(() => {
  signInWithPassword.mockReset()
  updateUser.mockReset()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { email: 'a@b.c' } }, error: null })
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({
    auth: { signInWithPassword, updateUser, getUser },
  } as never)
})

describe('changePassword', () => {
  it('throws no_email without calling Auth', async () => {
    getUser.mockResolvedValue({ data: { user: { email: null } }, error: null })
    await expect(changePassword({
      email: '  ',
      currentPassword: 'oldpass1',
      newPassword: 'newpass12',
      confirmPassword: 'newpass12',
    })).rejects.toMatchObject({ code: 'no_email' })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('throws too_short for new passwords under 8 characters', async () => {
    await expect(changePassword({
      email: 'a@b.c',
      currentPassword: 'oldpass1',
      newPassword: 'short',
      confirmPassword: 'short',
    })).rejects.toMatchObject({ code: 'too_short' })
  })

  it('throws mismatch when confirm does not match', async () => {
    await expect(changePassword({
      email: 'a@b.c',
      currentPassword: 'oldpass1',
      newPassword: 'newpass12',
      confirmPassword: 'otherpass',
    })).rejects.toMatchObject({ code: 'mismatch' })
  })

  it('maps invalid current password to current_incorrect', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials', status: 400 },
    })
    await expect(changePassword({
      email: 'a@b.c',
      currentPassword: 'wrongpass',
      newPassword: 'newpass12',
      confirmPassword: 'newpass12',
    })).rejects.toMatchObject({ code: 'current_incorrect' })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('re-auths then updateUser, and throws on update error', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 't' } },
      error: null,
    })
    updateUser.mockResolvedValue({ error: { message: 'weak password' } })
    await expect(changePassword({
      email: 'a@b.c',
      currentPassword: 'oldpass1',
      newPassword: 'newpass12',
      confirmPassword: 'newpass12',
    })).rejects.toMatchObject({ code: 'update_failed', message: 'weak password' })
  })

  it('succeeds when re-auth and updateUser return no error', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 't' } },
      error: null,
    })
    updateUser.mockResolvedValue({ error: null })
    await changePassword({
      email: 'a@b.c',
      currentPassword: 'oldpass1',
      newPassword: 'newpass12',
      confirmPassword: 'newpass12',
    })
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'oldpass1' })
    expect(updateUser).toHaveBeenCalledWith({ password: 'newpass12' })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  normalizeAccentHex,
  updateFamilyDisplayName,
  updateFamilyEmail,
  updatePersonAccentHex,
  updatePreferredTimeZone,
} from './familySettings'
import { PasswordChangeError } from './auth'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

const { signInMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
}))
vi.mock('./auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth')>()
  return { ...actual, signInWithPassword: signInMock }
})

function thenable(result: { data: unknown; error: unknown }) {
  const t: Record<string, unknown> = {}
  const self = () => t
  for (const m of ['select', 'eq', 'in', 'is', 'update', 'maybeSingle', 'single', 'limit']) {
    t[m] = vi.fn(self)
  }
  t.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return t
}

describe('normalizeAccentHex', () => {
  it('uppercases #RRGGBB like iOS AccentStore', () => {
    expect(normalizeAccentHex('#4f45e6')).toBe('#4F45E6')
    expect(normalizeAccentHex('1FA6A0')).toBe('#1FA6A0')
    expect(normalizeAccentHex('nope')).toBeNull()
  })
})

describe('familySettings adapter', () => {
  const from = vi.fn()
  const rpc = vi.fn()
  const updateUser = vi.fn()
  const getUser = vi.fn()

  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
    updateUser.mockReset()
    getUser.mockReset()
    signInMock.mockReset()
    signInMock.mockResolvedValue({})
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      from,
      rpc,
      auth: { updateUser, getUser },
    } as never)
  })

  it('writes display_name to profiles, people, and Auth metadata', async () => {
    from.mockReturnValue(thenable({ data: null, error: null }))
    updateUser.mockResolvedValue({ data: {}, error: null })
    await updateFamilyDisplayName({ userId: 'user-1', personId: 'p-1', displayName: '  Misael  ' })
    expect(from).toHaveBeenCalledWith('profiles')
    expect(from).toHaveBeenCalledWith('people')
    expect(updateUser).toHaveBeenCalledWith({ data: { full_name: 'Misael', username: 'Misael' } })
  })

  it('throws on profile update error', async () => {
    from.mockReturnValue(thenable({ data: null, error: { message: 'denied' } }))
    await expect(updateFamilyDisplayName({ userId: 'user-1', personId: 'p-1', displayName: 'Mom' }))
      .rejects.toMatchObject({ message: 'denied' })
  })

  it('writes preferred_time_zone and accent_hex', async () => {
    from.mockReturnValue(thenable({ data: null, error: null }))
    await updatePreferredTimeZone({ userId: 'user-1', timeZone: 'America/Bogota' })
    expect(from).toHaveBeenCalledWith('profiles')
    await updatePersonAccentHex({ personId: 'p-1', hex: '#1fa6a0' })
    expect(from).toHaveBeenCalledWith('people')
  })

  it('re-auths then updateUser; pending when Auth email did not switch', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'old@example.com' } }, error: null })
    updateUser.mockResolvedValue({ data: { user: { email: 'old@example.com' } }, error: null })
    const result = await updateFamilyEmail({
      email: 'new@example.com',
      currentPassword: 'secret',
      personId: 'p-1',
    })
    expect(signInMock).toHaveBeenCalledWith('old@example.com', 'secret')
    expect(updateUser).toHaveBeenCalledWith({ email: 'new@example.com' })
    expect(result.pendingConfirmation).toBe(true)
    expect(from).not.toHaveBeenCalled()
  })

  it('syncs linked roster email via RPC when Auth already applied the new address', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'old@example.com' } }, error: null })
    updateUser.mockResolvedValue({ data: { user: { email: 'new@example.com' } }, error: null })
    rpc.mockResolvedValue({ data: { updated: 1 }, error: null })
    const result = await updateFamilyEmail({
      email: 'new@example.com',
      currentPassword: 'secret',
      personId: 'p-1',
    })
    expect(result.pendingConfirmation).toBe(false)
    expect(rpc).toHaveBeenCalledWith('sync_my_linked_person_email')
    expect(from).not.toHaveBeenCalled()
  })

  it('throws PasswordChangeError when current password is wrong', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'old@example.com' } }, error: null })
    signInMock.mockRejectedValue({ code: 'invalid_credentials', message: 'Invalid login credentials' })
    await expect(updateFamilyEmail({
      email: 'new@example.com',
      currentPassword: 'nope',
      personId: 'p-1',
    })).rejects.toBeInstanceOf(PasswordChangeError)
  })
})

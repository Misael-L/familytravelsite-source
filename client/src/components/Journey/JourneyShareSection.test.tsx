import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import JourneyShareSection from './JourneyShareSection'
import { journeyApi } from '../../api/client'

const { isSupabaseMock, toastInfo } = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => true),
  toastInfo: vi.fn(),
}))

vi.mock('../../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('../shared/Toast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: toastInfo,
  }),
}))

const getShareLink = vi.spyOn(journeyApi, 'getShareLink')
const createShareLink = vi.spyOn(journeyApi, 'createShareLink')

describe('JourneyShareSection Family chrome', () => {
  beforeEach(() => {
    isSupabaseMock.mockReturnValue(true)
    toastInfo.mockReset()
    getShareLink.mockReset()
    createShareLink.mockReset()
  })

  it('keeps Public Share chrome and toasts instead of calling Nest share APIs', async () => {
    const user = userEvent.setup()
    render(<JourneyShareSection journeyId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" />)

    expect(await screen.findByText('Public Share')).toBeInTheDocument()
    expect(screen.getByText('Create share link')).toBeInTheDocument()
    expect(getShareLink).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /create share link/i }))
    expect(createShareLink).not.toHaveBeenCalled()
    expect(toastInfo).toHaveBeenCalledWith('Public sharing disabled')
  })
})

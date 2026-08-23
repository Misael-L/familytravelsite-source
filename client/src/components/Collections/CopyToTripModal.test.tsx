import React from 'react'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedStore, resetAllStores } from '../../../tests/helpers/store'
import { useAuthStore } from '../../store/authStore'
import { buildUser } from '../../../tests/helpers/factories'
import { tripsApi } from '../../api/client'
import { listFamilyTrips } from '../../data/supabase/trips'

const { isSupabaseMock } = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => true),
}))

vi.mock('../../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>()
  return { ...actual, tripsApi: { ...actual.tripsApi, list: vi.fn() } }
})

vi.mock('../../data/supabase/trips', () => ({
  listFamilyTrips: vi.fn(),
}))

import CopyToTripModal from './CopyToTripModal'

describe('CopyToTripModal', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
    seedStore(useAuthStore, {
      isAuthenticated: true,
      user: buildUser(),
      familyId: 'fam-1',
      personId: 'p1',
    })
  })

  it('loads Family trips and does not call Nest tripsApi', async () => {
    isSupabaseMock.mockReturnValue(true)
    vi.mocked(listFamilyTrips).mockResolvedValue({
      trips: [{
        id: 'trip-1',
        family_id: 'fam-1',
        title: 'Umbria',
        description: null,
        start_date: '2026-09-01',
        end_date: '2026-09-08',
        cover_image: null,
        is_archived: 0,
        currency: 'EUR',
        reminder_days: 0,
        status: 'planning',
      } as never],
      archivedTrips: [],
    })
    const onCopy = vi.fn().mockResolvedValue({ copied: 1, skipped: [] })
    render(
      <CopyToTripModal
        isOpen
        onClose={vi.fn()}
        placeIds={['item-1']}
        onCopy={onCopy}
        t={(k: string) => k}
      />,
    )
    expect(await screen.findByText('Umbria')).toBeInTheDocument()
    expect(listFamilyTrips).toHaveBeenCalledWith('fam-1')
    expect(tripsApi.list).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /umbria/i }))
    await waitFor(() => expect(onCopy).toHaveBeenCalledWith('trip-1'))
  })

  it('Nest google path skips Family listFamilyTrips', async () => {
    isSupabaseMock.mockReturnValue(false)
    vi.mocked(tripsApi.list).mockResolvedValue({
      trips: [{ id: 7, title: 'Paris' }],
    })
    render(
      <CopyToTripModal
        isOpen
        onClose={vi.fn()}
        placeIds={[9]}
        onCopy={vi.fn().mockResolvedValue({ copied: 0, skipped: [] })}
        t={(k: string) => k}
      />,
    )
    expect(await screen.findByText('Paris')).toBeInTheDocument()
    expect(listFamilyTrips).not.toHaveBeenCalled()
    expect(tripsApi.list).toHaveBeenCalled()
  })
})

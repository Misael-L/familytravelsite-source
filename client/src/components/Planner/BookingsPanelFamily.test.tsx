import React from 'react'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ToastContainer } from '../shared/Toast'
import { deleteTripReservation, listTripBookings } from '../../data/supabase/tripReservations'
import BookingsPanelFamily from './BookingsPanelFamily'

vi.mock('../../data/supabase/tripReservations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripReservations')>()
  return {
    ...actual,
    listTripBookings: vi.fn(),
    deleteTripReservation: vi.fn(),
    setTripReservationStatus: vi.fn(),
  }
})

vi.mock('../../data/supabase/tripExpenses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripExpenses')>()
  return {
    ...actual,
    listTripExpenses: vi.fn().mockResolvedValue([]),
  }
})

const booking = {
  id: 'r-1',
  tripId: 'trip-1',
  type: 'hotel' as const,
  status: 'pending' as const,
  title: 'Villa Erba',
  startTripDayId: null,
  endTripDayId: null,
  startsAt: null,
  endsAt: null,
  confirmationCode: null,
  notes: null,
  url: null,
  placeId: null,
  hotelId: null,
  scheduleItemId: null,
  metadata: {},
  sortOrder: 0,
  createdAt: '2026-08-20',
}

function renderPanel(opts: {
  onStageDraft?: (draft: unknown) => Promise<boolean>
  onStageDelete?: (id: string) => Promise<boolean>
}) {
  render(
    <>
      <ToastContainer />
      <BookingsPanelFamily
        tripId="trip-1"
        canMutate
        familyId="fam-1"
        mePersonId="p1"
        days={[]}
        places={[]}
        scheduleItems={[]}
        currencyCode="EUR"
        onOpenCostsPrefill={vi.fn()}
        onStageDraft={opts.onStageDraft}
        onStageDelete={opts.onStageDelete}
      />
    </>,
  )
}

describe('BookingsPanelFamily draft staging', () => {
  beforeEach(() => {
    vi.mocked(listTripBookings).mockResolvedValue([booking])
    vi.mocked(deleteTripReservation).mockResolvedValue(undefined as never)
  })

  it('keeps import on Published and discloses that on My Draft', async () => {
    const user = userEvent.setup()
    renderPanel({ onStageDraft: vi.fn().mockResolvedValue(true) })
    await screen.findByText('Villa Erba')
    await user.click(screen.getByRole('button', { name: /import/i }))
    expect(await screen.findByText(/Switch to Published/)).toBeInTheDocument()
  })

  it('stages booking removal instead of deleting the published row', async () => {
    const user = userEvent.setup()
    const onStageDelete = vi.fn().mockResolvedValue(true)
    renderPanel({ onStageDelete })
    await screen.findByText('Villa Erba')
    await user.click(screen.getByTitle('Delete'))
    const deletes = screen.getAllByRole('button', { name: 'Delete' })
    await user.click(deletes[deletes.length - 1])
    await waitFor(() => expect(onStageDelete).toHaveBeenCalledWith('r-1'))
    expect(deleteTripReservation).not.toHaveBeenCalled()
    expect(await screen.findByText('Staged removal')).toBeInTheDocument()
  })
})

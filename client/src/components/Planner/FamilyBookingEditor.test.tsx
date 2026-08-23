import React from 'react'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ToastContainer } from '../shared/Toast'
import { upsertTripBooking } from '../../data/supabase/tripReservations'
import FamilyBookingEditor from './FamilyBookingEditor'

vi.mock('../Files/FamilyFileAttach', () => ({
  default: () => null,
}))

vi.mock('../../data/supabase/tripReservations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripReservations')>()
  return {
    ...actual,
    upsertTripBooking: vi.fn().mockResolvedValue('r-1'),
  }
})

function renderEditor(opts: {
  onStageDraft?: (draft: unknown) => Promise<boolean>
  canMutate?: boolean
}) {
  const onSaved = vi.fn().mockResolvedValue(undefined)
  render(
    <>
      <ToastContainer />
      <FamilyBookingEditor
        open
        tripId="trip-1"
        reservation={null}
        days={[{ id: 'd1', tripId: 'trip-1', civilDay: '2026-08-12', dayIndex: 0, title: 'Arrive' }]}
        places={[]}
        scheduleItems={[]}
        linkedExpense={null}
        currencyCode="EUR"
        locale="en"
        canMutate={opts.canMutate ?? true}
        onStageDraft={opts.onStageDraft}
        familyId="fam-1"
        mePersonId="p1"
        onClose={vi.fn()}
        onSaved={onSaved}
        onOpenCostsPrefill={vi.fn()}
        onExpenseUnlinked={vi.fn().mockResolvedValue(undefined)}
      />
    </>,
  )
  return { onSaved }
}

describe('FamilyBookingEditor change-request staging', () => {
  it('stages apply-v1 fields on My Draft and skips the booking adapter', async () => {
    const user = userEvent.setup()
    const onStageDraft = vi.fn().mockResolvedValue(true)
    renderEditor({ onStageDraft })
    await user.type(screen.getByPlaceholderText('e.g. Lufthansa LH123, Hotel Adlon, ...'), 'Hotel Erba')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(onStageDraft).toHaveBeenCalled())
    expect(upsertTripBooking).not.toHaveBeenCalled()
    expect(onStageDraft.mock.calls[0][0]).toMatchObject({ title: 'Hotel Erba', type: 'hotel' })
    expect(await screen.findByText('Added to My draft')).toBeInTheDocument()
  })

  it('keeps HOF published saves on upsertTripBooking', async () => {
    const user = userEvent.setup()
    renderEditor({})
    await user.type(screen.getByPlaceholderText('e.g. Lufthansa LH123, Hotel Adlon, ...'), 'Hotel Erba')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(upsertTripBooking).toHaveBeenCalledWith('trip-1', expect.objectContaining({ title: 'Hotel Erba' })))
  })
})

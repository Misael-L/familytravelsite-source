import React from 'react'
import { render, screen, waitFor, within } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ToastContainer } from '../shared/Toast'
import { deleteTripReservation, listTripBookings, upsertTripBooking } from '../../data/supabase/tripReservations'
import { listTripExpenses } from '../../data/supabase/tripExpenses'
import { listTripFiles, signedTripFileUrl } from '../../data/supabase/tripFiles'
import { openFile } from '../../utils/fileDownload'
import { formatDate } from '../../utils/formatters'
import type { FamilyTripExpense } from '../../data/supabase/tripExpenses'
import type { FamilyTripFile } from '../../data/supabase/tripFiles'
import BookingsPanelFamily from './BookingsPanelFamily'

vi.mock('../Files/FamilyFileAttach', () => ({
  default: () => null,
}))

vi.mock('../../data/supabase/tripFiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripFiles')>()
  return {
    ...actual,
    listTripFiles: vi.fn().mockResolvedValue([]),
    signedTripFileUrl: vi.fn(),
  }
})

vi.mock('../../utils/fileDownload', () => ({
  openFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../data/supabase/tripReservations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripReservations')>()
  return {
    ...actual,
    listTripBookings: vi.fn(),
    deleteTripReservation: vi.fn(),
    setTripReservationStatus: vi.fn(),
    upsertTripBooking: vi.fn(),
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

  it('keeps an edit from the Villa Erba card until the user discards it', async () => {
    const user = userEvent.setup()
    renderPanel({})
    await screen.findByText('Villa Erba')
    await user.click(screen.getByTitle('Edit'))
    const title = await screen.findByRole('textbox', { name: /title/i })
    expect(title).toHaveValue('Villa Erba')
    await user.type(title, ' west')
    await user.keyboard('{Escape}')
    const question = screen.getByRole('alertdialog', { name: 'Discard Changes' })
    await user.click(within(question).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Villa Erba west')
    await user.keyboard('{Escape}')
    await user.click(within(screen.getByRole('alertdialog', { name: 'Discard Changes' })).getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /reservation/i })).not.toBeInTheDocument())
    expect(upsertTripBooking).not.toHaveBeenCalled()

    await user.click(screen.getByTitle('Edit'))
    expect(await screen.findByRole('textbox', { name: /title/i })).toHaveValue('Villa Erba')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /reservation/i })).not.toBeInTheDocument())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

const DAY_ID = 'day-1'
const harbor = {
  ...booking,
  id: '22222222-2222-4222-8222-222222222222',
  type: 'restaurant' as const,
  title: 'Harbor lunch',
  startTripDayId: DAY_ID,
  endTripDayId: null,
  confirmationCode: 'AB12',
}

function expense(id: string, reservationId: string, name: string, currencyCode: string | null, amount: number): FamilyTripExpense {
  return {
    id,
    tripId: 'trip-1',
    name,
    category: 'food',
    totalAmount: amount,
    currencyCode,
    exchangeRate: 1,
    expenseDate: null,
    note: null,
    ticketLines: null,
    reservationId,
    sortOrder: 0,
    createdAt: '2026-08-20T00:00:00.000Z',
    shares: [],
    payers: [],
  }
}

function linkedFile(id: string, reservationId: string, name: string): FamilyTripFile {
  return {
    id,
    tripId: 'trip-1',
    storagePath: `files/${id}.pdf`,
    originalName: name,
    mimeType: 'application/pdf',
    sizeBytes: 20,
    uploadedBy: null,
    starred: false,
    description: null,
    deletedAt: null,
    createdAt: '2026-08-20T00:00:00.000Z',
    links: [{ id: `${id}-link`, fileId: id, placeId: null, reservationId, tripDayId: null }],
  }
}

describe('BookingsPanelFamily booking details', () => {
  beforeEach(() => {
    vi.mocked(listTripBookings).mockResolvedValue([harbor])
    vi.mocked(listTripExpenses).mockResolvedValue([])
    vi.mocked(listTripFiles).mockReset()
    vi.mocked(listTripFiles).mockResolvedValue([])
    vi.mocked(signedTripFileUrl).mockReset()
    vi.mocked(openFile).mockReset()
    vi.mocked(openFile).mockResolvedValue(undefined)
    vi.mocked(upsertTripBooking).mockClear()
  })

  function renderDetails(opts: { canMutate?: boolean; onStageDraft?: (draft: unknown) => Promise<boolean>; strict?: boolean } = {}) {
    const panel = (
      <BookingsPanelFamily
        tripId="trip-1"
        canMutate={opts.canMutate ?? true}
        familyId="fam-1"
        mePersonId="p1"
        days={[{ id: DAY_ID, tripId: 'trip-1', civilDay: '2026-08-12', dayIndex: 0, title: 'Arrive' }]}
        places={[]}
        scheduleItems={[]}
        currencyCode="EUR"
        onOpenCostsPrefill={vi.fn()}
        onStageDraft={opts.onStageDraft}
      />
    )
    render(
      <>
        <ToastContainer />
        {opts.strict ? <React.StrictMode>{panel}</React.StrictMode> : panel}
      </>,
    )
  }

  it('shows day-id dates, both expense currencies, and copies the code without writing', async () => {
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    vi.mocked(listTripExpenses).mockResolvedValue([
      expense('usd', harbor.id, 'Taxi', 'USD', 40),
      expense('blank', harbor.id, 'Lunch', null, 12),
      expense('other', 'someone-else', 'Other', 'GBP', 9),
    ])
    vi.mocked(listTripFiles).mockResolvedValue([
      linkedFile('a', harbor.id, 'Boarding.pdf'),
      linkedFile('b', harbor.id, 'Menu.pdf'),
    ])
    renderDetails()
    await screen.findByRole('button', { name: 'Harbor lunch' })
    expect(listTripFiles).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Harbor lunch' }))
    const dialog = await screen.findByRole('dialog', { name: 'Harbor lunch' })
    expect(within(dialog).getByText(formatDate('2026-08-12', 'en')!)).toBeInTheDocument()
    expect(within(dialog).getByText('Taxi')).toBeInTheDocument()
    expect(within(dialog).getByText('Lunch')).toBeInTheDocument()
    expect(within(dialog).getByText('$40.00')).toBeInTheDocument()
    expect(within(dialog).getByText('12,00 €')).toBeInTheDocument()
    expect(within(dialog).queryByText('Other')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Boarding.pdf' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Menu.pdf' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Copy' }))
    expect(write).toHaveBeenCalledWith('AB12')
    expect(upsertTripBooking).not.toHaveBeenCalled()
    expect(deleteTripReservation).not.toHaveBeenCalled()
    write.mockRestore()
  })

  it('distinguishes an empty file list from a failed load', async () => {
    const user = userEvent.setup()
    vi.mocked(listTripFiles).mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([])
    renderDetails()
    await user.click(await screen.findByRole('button', { name: 'Harbor lunch' }))
    const dialog = await screen.findByRole('dialog', { name: 'Harbor lunch' })
    expect(await within(dialog).findByText('Error')).toBeInTheDocument()
    expect(within(dialog).queryByText('No files yet')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(await within(dialog).findByText('No files yet')).toBeInTheDocument()
    expect(listTripFiles).toHaveBeenCalledTimes(2)
  })

  it('refreshes a signature on every open and keeps the row when signing or delivery fails', async () => {
    const user = userEvent.setup()
    vi.mocked(listTripFiles).mockResolvedValue([linkedFile('a', harbor.id, 'Boarding.pdf')])
    vi.mocked(signedTripFileUrl)
      .mockResolvedValueOnce('https://signed.example/1')
      .mockRejectedValueOnce(new Error('sign'))
      .mockResolvedValueOnce('https://signed.example/2')
    vi.mocked(openFile).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('deliver'))
    renderDetails()
    await user.click(await screen.findByRole('button', { name: 'Harbor lunch' }))
    const dialog = await screen.findByRole('dialog', { name: 'Harbor lunch' })
    const row = await within(dialog).findByRole('button', { name: 'Boarding.pdf' })
    await user.click(row)
    await waitFor(() => expect(signedTripFileUrl).toHaveBeenCalledWith('files/a.pdf', 120))
    expect(openFile).toHaveBeenCalledWith('https://signed.example/1', 'Boarding.pdf')
    await user.click(row)
    expect(await screen.findByText('Could not open file')).toBeInTheDocument()
    expect(openFile).toHaveBeenCalledTimes(1)
    expect(within(dialog).getByRole('button', { name: 'Boarding.pdf' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Boarding.pdf' }))
    await waitFor(() => expect(openFile).toHaveBeenCalledWith('https://signed.example/2', 'Boarding.pdf'))
    expect(await screen.findAllByText('Could not open file')).toHaveLength(2)
    expect(within(dialog).getByRole('button', { name: 'Boarding.pdf' })).toBeInTheDocument()
  })

  it('ignores a file response that arrives after the detail closes', async () => {
    const user = userEvent.setup()
    let resolveFiles: (files: FamilyTripFile[]) => void = () => {}
    vi.mocked(listTripFiles).mockImplementation(() => new Promise(resolve => { resolveFiles = resolve }))
    renderDetails()
    await user.click(await screen.findByRole('button', { name: 'Harbor lunch' }))
    expect(await screen.findByText('Loading...')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Harbor lunch' })).not.toBeInTheDocument())
    resolveFiles([linkedFile('a', harbor.id, 'Late.pdf')])
    await waitFor(() => expect(listTripFiles).toHaveBeenCalled())
    expect(screen.queryByText('Late.pdf')).not.toBeInTheDocument()
  })

  it('hides edit and delete for a read-only member', async () => {
    const user = userEvent.setup()
    renderDetails({ canMutate: false })
    await user.click(await screen.findByRole('button', { name: 'Harbor lunch' }))
    const dialog = await screen.findByRole('dialog', { name: 'Harbor lunch' })
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('AB12')).toBeInTheDocument()
  })

  it('returns focus from details to the title and again after the editor closes', async () => {
    const user = userEvent.setup()
    const onStageDraft = vi.fn().mockResolvedValue(true)
    renderDetails({ onStageDraft })
    const title = await screen.findByRole('button', { name: 'Harbor lunch' })
    await user.click(title)
    const dialog = await screen.findByRole('dialog', { name: 'Harbor lunch' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(title).toHaveFocus())

    await user.click(title)
    await user.click(within(await screen.findByRole('dialog', { name: 'Harbor lunch' })).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByRole('dialog', { name: 'Edit Reservation' })).toBeInTheDocument()
    expect(onStageDraft).not.toHaveBeenCalled()
    expect(upsertTripBooking).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(title).toHaveFocus())
    expect(title.isConnected).toBe(true)
  })

  it('keeps the title focused through Edit and Delete under StrictMode', async () => {
    const user = userEvent.setup()
    renderDetails({ strict: true, onStageDraft: vi.fn().mockResolvedValue(true) })
    const title = await screen.findByRole('button', { name: 'Harbor lunch' })
    await user.click(title)
    await user.click(within(await screen.findByRole('dialog', { name: 'Harbor lunch' })).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByRole('dialog', { name: 'Edit Reservation' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(title).toHaveFocus())

    await user.click(title)
    await user.click(within(await screen.findByRole('dialog', { name: 'Harbor lunch' })).getByRole('button', { name: 'Delete' }))
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveFocus()
    await user.click(cancel)
    await waitFor(() => expect(title).toHaveFocus())
    expect(deleteTripReservation).not.toHaveBeenCalled()
  })
})

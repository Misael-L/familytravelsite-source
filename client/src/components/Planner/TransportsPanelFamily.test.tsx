import React from 'react'
import { render, screen, waitFor, within } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ToastContainer } from '../shared/Toast'
import {
  deleteTripReservation,
  listTripTransports,
  setTripReservationStatus,
  upsertTripTransport,
  type FamilyTransportReservation,
} from '../../data/supabase/tripReservations'
import { listTripExpenses } from '../../data/supabase/tripExpenses'
import { listTripFiles, signedTripFileUrl } from '../../data/supabase/tripFiles'
import { openFile } from '../../utils/fileDownload'
import { formatDate } from '../../utils/formatters'
import type { FamilyTripExpense } from '../../data/supabase/tripExpenses'
import type { FamilyTripFile } from '../../data/supabase/tripFiles'
import TransportsPanelFamily from './TransportsPanelFamily'

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
    listTripTransports: vi.fn(),
    deleteTripReservation: vi.fn(),
    setTripReservationStatus: vi.fn(),
    upsertTripTransport: vi.fn(),
  }
})

vi.mock('../../data/supabase/tripExpenses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripExpenses')>()
  return {
    ...actual,
    listTripExpenses: vi.fn().mockResolvedValue([]),
  }
})

const TRIP = 'trip-1'
const DAY_ID = 'day-1'

const nightBus: FamilyTransportReservation = {
  id: '22222222-2222-4222-8222-222222222222',
  tripId: TRIP,
  type: 'bus',
  status: 'pending',
  title: 'Night bus',
  startTripDayId: DAY_ID,
  endTripDayId: null,
  startsAt: null,
  endsAt: null,
  confirmationCode: 'AB12',
  notes: null,
  url: null,
  metadata: {},
  sortOrder: 0,
  createdAt: '2026-08-20T00:00:00.000Z',
  endpoints: [
    {
      id: 'rome',
      role: 'from',
      sequence: 0,
      name: 'Rome',
      code: 'ROM',
      airportId: null,
      placeId: null,
      latitude: null,
      longitude: null,
      timeZone: 'Europe/Rome',
      localDate: '2026-08-12',
      localTime: '22:00',
    },
    {
      id: 'zurich',
      role: 'to',
      sequence: 1,
      name: 'Zurich',
      code: null,
      airportId: null,
      placeId: null,
      latitude: null,
      longitude: null,
      timeZone: null,
      localDate: '2026-08-13',
      localTime: null,
    },
  ],
  legs: [{
    id: 'leg-1',
    sequence: 0,
    fromEndpointId: 'rome',
    toEndpointId: 'zurich',
    carrierName: 'Flix',
    serviceNumber: 'N12',
    platform: null,
    seat: null,
  }],
}

function expense(id: string, name: string, currencyCode: string | null, amount: number): FamilyTripExpense {
  return {
    id,
    tripId: TRIP,
    name,
    category: 'transport',
    totalAmount: amount,
    currencyCode,
    exchangeRate: 1,
    expenseDate: null,
    note: null,
    ticketLines: null,
    reservationId: nightBus.id,
    sortOrder: 0,
    createdAt: '2026-08-20T00:00:00.000Z',
    shares: [],
    payers: [],
  }
}

function linkedFile(id: string, name: string): FamilyTripFile {
  return {
    id,
    tripId: TRIP,
    storagePath: `files/${id}.pdf`,
    originalName: name,
    mimeType: 'application/pdf',
    sizeBytes: 20,
    uploadedBy: null,
    starred: false,
    description: null,
    deletedAt: null,
    createdAt: '2026-08-20T00:00:00.000Z',
    links: [{ id: `${id}-link`, fileId: id, placeId: null, reservationId: nightBus.id, tripDayId: null }],
  }
}

describe('TransportsPanelFamily transport details', () => {
  beforeEach(() => {
    vi.mocked(listTripTransports).mockResolvedValue([nightBus])
    vi.mocked(listTripExpenses).mockResolvedValue([])
    vi.mocked(listTripFiles).mockReset()
    vi.mocked(listTripFiles).mockResolvedValue([])
    vi.mocked(signedTripFileUrl).mockReset()
    vi.mocked(openFile).mockReset()
    vi.mocked(openFile).mockResolvedValue(undefined)
    vi.mocked(upsertTripTransport).mockReset()
    vi.mocked(deleteTripReservation).mockReset()
    vi.mocked(setTripReservationStatus).mockReset()
  })

  function renderPanel(opts: { canMutate?: boolean; strict?: boolean; onOpenCostsPrefill?: (prefill: unknown) => void } = {}) {
    const panel = (
      <TransportsPanelFamily
        tripId={TRIP}
        canMutate={opts.canMutate ?? true}
        familyId="fam-1"
        mePersonId="p1"
        days={[{ id: DAY_ID, tripId: TRIP, civilDay: '2026-08-01', dayIndex: 0, title: 'Leave' }]}
        places={[]}
        scheduleItems={[]}
        currencyCode="EUR"
        onOpenCostsPrefill={opts.onOpenCostsPrefill ?? vi.fn()}
      />
    )
    render(
      <>
        <ToastContainer />
        {opts.strict ? <React.StrictMode>{panel}</React.StrictMode> : panel}
      </>,
    )
  }

  it('shows recorded endpoint facts and copies the code without writing', async () => {
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    vi.mocked(listTripExpenses).mockResolvedValue([
      expense('usd', 'Taxi', 'USD', 40),
      expense('blank', 'Fare', null, 12),
    ])
    vi.mocked(listTripFiles).mockResolvedValue([
      linkedFile('a', 'Ticket.pdf'),
    ])
    renderPanel()
    await screen.findByRole('button', { name: 'Night bus' })
    expect(listTripFiles).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Night bus' }))
    const dialog = await screen.findByRole('dialog', { name: 'Night bus' })
    expect(dialog.textContent).toContain(formatDate('2026-08-12', 'en'))
    expect(dialog.textContent).toContain(formatDate('2026-08-13', 'en'))
    expect(within(dialog).getByText(/Rome · ROM · .* · 22:00 · Europe\/Rome/)).toBeInTheDocument()
    expect(within(dialog).getByText('Zurich · Thu, Aug 13')).toBeInTheDocument()
    expect(within(dialog).queryByText('22:15')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Rome → Zurich · Flix N12')).toBeInTheDocument()
    expect(within(dialog).getByText('Taxi')).toBeInTheDocument()
    expect(within(dialog).getByText('$40.00')).toBeInTheDocument()
    expect(within(dialog).getByText((content) => content.replace(/\s/g, ' ') === '12,00 €')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Copy' }))
    expect(write).toHaveBeenCalledWith('AB12')
    await user.keyboard('{Escape}')
    expect(upsertTripTransport).not.toHaveBeenCalled()
    expect(deleteTripReservation).not.toHaveBeenCalled()
    expect(setTripReservationStatus).not.toHaveBeenCalled()
    write.mockRestore()
  })

  it('stays readable when mutation is unavailable', async () => {
    const user = userEvent.setup()
    renderPanel({ canMutate: false })
    await user.click(await screen.findByRole('button', { name: 'Night bus' }))
    const dialog = await screen.findByRole('dialog', { name: 'Night bus' })
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('AB12')).toBeInTheDocument()
    expect(within(dialog).getByText(/22:00/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(upsertTripTransport).not.toHaveBeenCalled()
    expect(deleteTripReservation).not.toHaveBeenCalled()
    expect(setTripReservationStatus).not.toHaveBeenCalled()
  })

  it('distinguishes an empty file list from a failed load', async () => {
    const user = userEvent.setup()
    vi.mocked(listTripFiles).mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([])
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Night bus' }))
    const dialog = await screen.findByRole('dialog', { name: 'Night bus' })
    expect(await within(dialog).findByText('Error')).toBeInTheDocument()
    expect(within(dialog).queryByText('No files yet')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(await within(dialog).findByText('No files yet')).toBeInTheDocument()
    expect(listTripFiles).toHaveBeenCalledTimes(2)
  })

  it('refreshes a signature on every open and keeps the row when signing or delivery fails', async () => {
    const user = userEvent.setup()
    vi.mocked(listTripFiles).mockResolvedValue([linkedFile('a', 'Ticket.pdf')])
    vi.mocked(signedTripFileUrl)
      .mockResolvedValueOnce('https://signed.example/1')
      .mockRejectedValueOnce(new Error('sign'))
      .mockResolvedValueOnce('https://signed.example/2')
    vi.mocked(openFile).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('deliver'))
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Night bus' }))
    const dialog = await screen.findByRole('dialog', { name: 'Night bus' })
    const row = await within(dialog).findByRole('button', { name: 'Ticket.pdf' })
    await user.click(row)
    await waitFor(() => expect(signedTripFileUrl).toHaveBeenCalledWith('files/a.pdf', 120))
    expect(openFile).toHaveBeenCalledWith('https://signed.example/1', 'Ticket.pdf')
    await user.click(row)
    expect(await screen.findByText('Could not open file')).toBeInTheDocument()
    expect(openFile).toHaveBeenCalledTimes(1)
    expect(within(dialog).getByRole('button', { name: 'Ticket.pdf' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Ticket.pdf' }))
    await waitFor(() => expect(openFile).toHaveBeenCalledWith('https://signed.example/2', 'Ticket.pdf'))
    expect(within(dialog).getByRole('button', { name: 'Ticket.pdf' })).toBeInTheDocument()
  })

  it('ignores a file response that arrives after the detail closes', async () => {
    const user = userEvent.setup()
    let resolveFiles: (files: FamilyTripFile[]) => void = () => {}
    vi.mocked(listTripFiles).mockImplementation(() => new Promise(resolve => { resolveFiles = resolve }))
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Night bus' }))
    expect(await screen.findByText('Loading...')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Night bus' })).not.toBeInTheDocument())
    resolveFiles([linkedFile('a', 'Late.pdf')])
    await waitFor(() => expect(listTripFiles).toHaveBeenCalled())
    expect(screen.queryByText('Late.pdf')).not.toBeInTheDocument()
  })

  it('returns focus from Edit and does not restore it across a costs handoff', async () => {
    const user = userEvent.setup()
    const onOpenCostsPrefill = vi.fn()
    vi.mocked(upsertTripTransport).mockResolvedValue(nightBus.id)
    renderPanel({ onOpenCostsPrefill })
    const title = await screen.findByRole('button', { name: 'Night bus' })
    await user.click(title)
    await user.click(within(await screen.findByRole('dialog', { name: 'Night bus' })).getByRole('button', { name: 'Edit' }))
    const editor = await screen.findByRole('dialog', { name: 'Edit transport' })
    expect(editor.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(title).toHaveFocus())

    await user.click(title)
    await user.click(within(await screen.findByRole('dialog', { name: 'Night bus' })).getByRole('button', { name: 'Edit' }))
    await user.click(await screen.findByRole('button', { name: 'Create expense' }))
    await waitFor(() => expect(onOpenCostsPrefill).toHaveBeenCalledWith(expect.objectContaining({
      reservationId: nightBus.id,
      name: 'Night bus',
    })))
    expect(title).not.toHaveFocus()
    expect(screen.queryByRole('dialog', { name: 'Edit transport' })).not.toBeInTheDocument()
  })

  it('opens add transport without taking or restoring focus', async () => {
    const user = userEvent.setup()
    renderPanel()
    const title = await screen.findByRole('button', { name: 'Night bus' })
    await user.click(screen.getByRole('button', { name: 'Transport' }))
    expect(await screen.findByText('Add transport')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add transport' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Add transport')).not.toBeInTheDocument())
    expect(title).not.toHaveFocus()
  })

  it('keeps the title focused through Edit and Delete under StrictMode', async () => {
    const user = userEvent.setup()
    renderPanel({ strict: true })
    const title = await screen.findByRole('button', { name: 'Night bus' })
    await user.click(title)
    await user.click(within(await screen.findByRole('dialog', { name: 'Night bus' })).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByRole('dialog', { name: 'Edit transport' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(title).toHaveFocus())

    await user.click(title)
    await user.click(within(await screen.findByRole('dialog', { name: 'Night bus' })).getByRole('button', { name: 'Delete' }))
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(title).toHaveFocus())
    expect(deleteTripReservation).not.toHaveBeenCalled()

    await user.click(title)
    await user.click(within(await screen.findByRole('dialog', { name: 'Night bus' })).getByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(title).toHaveFocus())
    expect(deleteTripReservation).not.toHaveBeenCalled()
  })
})

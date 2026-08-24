import React from 'react'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ToastContainer } from '../shared/Toast'
import { upsertTripExpense } from '../../data/supabase/tripExpenses'
import CostsPanelFamily from './CostsPanelFamily'

vi.mock('../../hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({ rates: { EUR: 1 }, convert: (n: number) => n }),
}))

vi.mock('../../data/supabase/tripExpenses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/tripExpenses')>()
  return {
    ...actual,
    listTripExpenses: vi.fn().mockResolvedValue([]),
    upsertTripExpense: vi.fn().mockResolvedValue('e-1'),
  }
})

vi.mock('../../data/supabase/tripTravelers', () => ({
  listTripTravelers: vi.fn().mockResolvedValue([{ personId: 'p1', displayName: 'Ada', color: null }]),
}))

vi.mock('../../data/supabase/tripExpenseSettlements', () => ({
  listTripExpenseSettlements: vi.fn().mockResolvedValue([]),
  upsertTripExpenseSettlement: vi.fn(),
  deleteTripExpenseSettlement: vi.fn(),
  settleTripExpenseFlows: vi.fn(),
}))

describe('CostsPanelFamily change-request staging', () => {
  beforeEach(() => {
    vi.mocked(upsertTripExpense).mockClear()
  })

  it('stages a header-only expense on My Draft and discloses unstaged extras', async () => {
    const user = userEvent.setup()
    const onStageExpense = vi.fn().mockResolvedValue(true)
    render(
      <>
        <ToastContainer />
        <CostsPanelFamily
          tripId="trip-1"
          currencyCode="EUR"
          canMutate={false}
          canEditExpenses
          mePersonId="p1"
          onStageExpense={onStageExpense}
        />
      </>,
    )
    await user.click(await screen.findByRole('button', { name: 'Add expense' }))
    await user.type(screen.getByPlaceholderText(/e\.g\. Dinner/), 'Dinner')
    const amount = screen.getByPlaceholderText('0.00')
    await user.clear(amount)
    await user.type(amount, '40')
    const addButtons = screen.getAllByRole('button', { name: 'Add expense' })
    await user.click(addButtons[addButtons.length - 1])
    await waitFor(() => expect(onStageExpense).toHaveBeenCalled())
    expect(upsertTripExpense).not.toHaveBeenCalled()
    expect(await screen.findByText(/Drafts save the expense header only/)).toBeInTheDocument()
  })

  it('refuses ticket/custom/reservation extras instead of dropping them', async () => {
    const user = userEvent.setup()
    const onStageExpense = vi.fn().mockResolvedValue(true)
    render(
      <>
        <ToastContainer />
        <CostsPanelFamily
          tripId="trip-1"
          currencyCode="EUR"
          canMutate={false}
          canEditExpenses
          mePersonId="p1"
          prefill={{ name: 'Stay', category: 'accommodation', reservationId: 'r-1' }}
          onStageExpense={onStageExpense}
        />
      </>,
    )
    const amount = await screen.findByPlaceholderText('0.00')
    await user.type(amount, '200')
    const addButtons = screen.getAllByRole('button', { name: 'Add expense' })
    await user.click(addButtons[addButtons.length - 1])
    expect(await screen.findByText(/drafts cannot store/i)).toBeInTheDocument()
    expect(onStageExpense).not.toHaveBeenCalled()
    expect(upsertTripExpense).not.toHaveBeenCalled()
  })
})

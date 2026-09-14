import { getSupabaseBrowserClient } from './client'
import {
  calculateTicketShares,
  encodeTicketLines,
  frozenExchangeRate,
  type CostTicketLine,
} from '../../lib/costs/settlementEngine'

export type CostCategory =
  | 'accommodation'
  | 'food'
  | 'groceries'
  | 'transport'
  | 'flights'
  | 'activities'
  | 'sightseeing'
  | 'shopping'
  | 'fees'
  | 'health'
  | 'tips'
  | 'other'

export type CostSplitMode = 'equally' | 'custom' | 'ticket'

export type FamilyTripExpenseShare = {
  expenseId: string
  personId: string
  amount: number | null
}

export type FamilyTripExpensePayer = {
  expenseId: string
  personId: string
  amount: number
}

export type FamilyTripExpense = {
  id: string
  tripId: string
  name: string
  category: CostCategory
  totalAmount: number
  currencyCode: string | null
  exchangeRate: number
  expenseDate: string | null
  note: string | null
  ticketLines: CostTicketLine[] | null
  reservationId: string | null
  sortOrder: number
  createdAt: string
  shares: FamilyTripExpenseShare[]
  payers: FamilyTripExpensePayer[]
}

export type TripExpenseDraft = {
  id?: string | null
  name: string
  category: CostCategory
  totalAmount: number
  currencyCode: string
  expenseDate?: string | null
  note: string
  reservationId?: string | null
  payerPersonId?: string | null
  participantIds: string[]
  splitMode: CostSplitMode
  customAmounts: Record<string, number>
  ticketLines: CostTicketLine[]
}

type ExpenseHeaderRow = {
  id: string
  trip_id: string
  name: string
  category: string
  total_amount: number | string
  currency_code: string | null
  exchange_rate: number | string | null
  expense_date: string | null
  note: string | null
  ticket_lines: unknown
  reservation_id: string | null
  sort_order: number | null
  created_at: string
}

type ShareRow = { expense_id: string; person_id: string; amount: number | string | null }
type PayerRow = { expense_id: string; person_id: string; amount: number | string }

const HEADER_SELECT =
  'id,trip_id,name,category,total_amount,currency_code,exchange_rate,expense_date,note,ticket_lines,reservation_id,sort_order,created_at'

const COST_CATEGORIES = new Set<string>([
  'accommodation', 'food', 'groceries', 'transport', 'flights',
  'activities', 'sightseeing', 'shopping', 'fees', 'health', 'tips', 'other',
])

function asNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value == null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function parseTicketLines(raw: unknown): CostTicketLine[] | null {
  if (raw == null || !Array.isArray(raw)) return null
  return raw.map((line, i) => {
    const o = (line ?? {}) as Record<string, unknown>
    const personIdsRaw = o.person_ids ?? o.personIds
    const personIds = Array.isArray(personIdsRaw) ? personIdsRaw.map(String).filter(Boolean) : []
    return {
      id: typeof o.id === 'string' ? o.id : `ticket-${i}`,
      name: typeof o.name === 'string' ? o.name : '',
      price: asNumber(o.price as number | string | null),
      personIds,
    }
  })
}

function rowCategory(raw: string): CostCategory {
  return COST_CATEGORIES.has(raw) ? (raw as CostCategory) : 'other'
}

export function expenseIsUnfinished(e: FamilyTripExpense): boolean {
  return e.totalAmount > 0 && !e.payers.some(p => p.amount > 0)
}

export async function listTripExpenses(tripId: string): Promise<FamilyTripExpense[]> {
  const sb = getSupabaseBrowserClient()
  const { data: headers, error } = await sb
    .from('trip_expenses')
    .select(HEADER_SELECT)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })

  if (error) throw error
  const headerRows = (headers ?? []) as ExpenseHeaderRow[]
  if (headerRows.length === 0) return []

  const ids = headerRows.map(h => h.id)
  const [{ data: shareData, error: shareErr }, { data: payerData, error: payerErr }] =
    await Promise.all([
      sb.from('trip_expense_shares').select('expense_id,person_id,amount').in('expense_id', ids),
      sb.from('trip_expense_payers').select('expense_id,person_id,amount').in('expense_id', ids),
    ])
  if (shareErr) throw shareErr
  if (payerErr) throw payerErr

  const sharesBy = new Map<string, FamilyTripExpenseShare[]>()
  for (const r of (shareData ?? []) as ShareRow[]) {
    const list = sharesBy.get(r.expense_id) ?? []
    list.push({
      expenseId: r.expense_id,
      personId: r.person_id,
      amount: asNumberOrNull(r.amount),
    })
    sharesBy.set(r.expense_id, list)
  }

  const payersBy = new Map<string, FamilyTripExpensePayer[]>()
  for (const r of (payerData ?? []) as PayerRow[]) {
    const list = payersBy.get(r.expense_id) ?? []
    list.push({
      expenseId: r.expense_id,
      personId: r.person_id,
      amount: asNumber(r.amount),
    })
    payersBy.set(r.expense_id, list)
  }

  return headerRows.map(h => ({
    id: h.id,
    tripId: h.trip_id,
    name: h.name,
    category: rowCategory(h.category),
    totalAmount: asNumber(h.total_amount),
    currencyCode: h.currency_code,
    exchangeRate: asNumber(h.exchange_rate, 1),
    expenseDate: h.expense_date,
    note: h.note,
    ticketLines: parseTicketLines(h.ticket_lines),
    reservationId: h.reservation_id,
    sortOrder: h.sort_order ?? 0,
    createdAt: h.created_at,
    shares: sharesBy.get(h.id) ?? [],
    payers: payersBy.get(h.id) ?? [],
  }))
}

export async function upsertTripExpense(opts: {
  tripId: string
  draft: TripExpenseDraft
  tripCurrency: string
  rates?: Record<string, number> | null
  createdByPersonId?: string | null
}): Promise<string> {
  const { tripId, draft, tripCurrency, rates, createdByPersonId } = opts
  const name = draft.name.trim()
  if (!name) throw new Error('Name is required')

  let total: number
  const shareAmounts = new Map<string, number | null>()
  let ticketPayload: ReturnType<typeof encodeTicketLines> | null = null

  switch (draft.splitMode) {
    case 'ticket': {
      const calc = calculateTicketShares(draft.ticketLines)
      total = calc.total
      for (const [id, amount] of Object.entries(calc.shares)) shareAmounts.set(id, amount)
      for (const line of draft.ticketLines) {
        for (const pid of line.personIds) {
          if (!shareAmounts.has(pid)) shareAmounts.set(pid, 0)
        }
      }
      ticketPayload = encodeTicketLines(draft.ticketLines)
      break
    }
    case 'custom': {
      total = draft.totalAmount
      for (const id of draft.participantIds) {
        shareAmounts.set(id, draft.customAmounts[id] ?? null)
      }
      break
    }
    default: {
      total = draft.totalAmount
      for (const id of draft.participantIds) shareAmounts.set(id, null)
      break
    }
  }

  const currency = draft.currencyCode.toUpperCase()
  const exchangeRate = frozenExchangeRate(currency, tripCurrency, rates ?? null)
  const note = draft.note.trim()
  const expenseDate = draft.expenseDate ?? null
  const now = new Date().toISOString()
  const sb = getSupabaseBrowserClient()

  let expenseId: string

  if (draft.id) {
    const { error } = await sb
      .from('trip_expenses')
      .update({
        name,
        category: draft.category,
        total_amount: total,
        currency_code: currency,
        exchange_rate: exchangeRate,
        expense_date: expenseDate,
        note: note || null,
        ticket_lines: ticketPayload,
        reservation_id: draft.reservationId ?? null,
        updated_at: now,
      })
      .eq('id', draft.id)
    if (error) throw error
    expenseId = draft.id

    const { error: delShares } = await sb.from('trip_expense_shares').delete().eq('expense_id', expenseId)
    if (delShares) throw delShares
    const { error: delPayers } = await sb.from('trip_expense_payers').delete().eq('expense_id', expenseId)
    if (delPayers) throw delPayers
  } else {
    const { data, error } = await sb
      .from('trip_expenses')
      .insert({
        trip_id: tripId,
        name,
        category: draft.category,
        total_amount: total,
        currency_code: currency,
        exchange_rate: exchangeRate,
        expense_date: expenseDate,
        note: note || null,
        ticket_lines: ticketPayload,
        reservation_id: draft.reservationId ?? null,
        created_by_person_id: createdByPersonId ?? null,
        updated_at: now,
      })
      .select('id')
      .single()
    if (error) throw error
    expenseId = (data as { id: string }).id
  }

  if (shareAmounts.size > 0) {
    const inserts = [...shareAmounts.entries()].map(([person_id, amount]) => ({
      expense_id: expenseId,
      person_id,
      amount,
    }))
    const { error } = await sb.from('trip_expense_shares').insert(inserts)
    if (error) throw error
  }

  if (draft.payerPersonId && total > 0) {
    const { error } = await sb.from('trip_expense_payers').insert({
      expense_id: expenseId,
      person_id: draft.payerPersonId,
      amount: total,
    })
    if (error) throw error
  }

  return expenseId
}

export async function deleteTripExpense(id: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('trip_expenses')
    .delete()
    .eq('id', id)
  if (error) throw error
}

/** Clear trip_expenses.reservation_id (ON DELETE SET NULL already covers reservation delete). */
export async function unlinkExpenseReservation(expenseId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('trip_expenses')
    .update({ reservation_id: null, updated_at: new Date().toISOString() })
    .eq('id', expenseId)
  if (error) throw error
}

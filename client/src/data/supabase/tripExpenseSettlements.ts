import { getSupabaseBrowserClient } from './client'
import { frozenExchangeRate, round2, type SettleFlow } from '../../lib/costs/settlementEngine'

export type FamilyTripExpenseSettlement = {
  id: string
  tripId: string
  fromPersonId: string
  toPersonId: string
  amount: number
  currencyCode: string | null
  exchangeRate: number
  createdAt: string
  createdByPersonId: string | null
}

export type TripSettlementDraft = {
  id?: string | null
  fromPersonId: string | null
  toPersonId: string | null
  amount: number
  currencyCode: string
}

type SettlementRow = {
  id: string
  trip_id: string
  from_person_id: string
  to_person_id: string
  amount: number | string
  currency_code: string | null
  exchange_rate: number | string | null
  created_at: string
  created_by_person_id: string | null
}

const SETTLEMENT_SELECT =
  'id,trip_id,from_person_id,to_person_id,amount,currency_code,exchange_rate,created_at,created_by_person_id'

function asNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value == null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function rowToSettlement(r: SettlementRow): FamilyTripExpenseSettlement {
  return {
    id: r.id,
    tripId: r.trip_id,
    fromPersonId: r.from_person_id,
    toPersonId: r.to_person_id,
    amount: asNumber(r.amount),
    currencyCode: r.currency_code,
    exchangeRate: asNumber(r.exchange_rate, 1),
    createdAt: r.created_at,
    createdByPersonId: r.created_by_person_id,
  }
}

export async function listTripExpenseSettlements(
  tripId: string,
): Promise<FamilyTripExpenseSettlement[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_expense_settlements')
    .select(SETTLEMENT_SELECT)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as SettlementRow[]).map(rowToSettlement)
}

export async function upsertTripExpenseSettlement(opts: {
  tripId: string
  draft: TripSettlementDraft
  tripCurrency: string
  rates?: Record<string, number> | null
  createdByPersonId?: string | null
}): Promise<string> {
  const { tripId, draft, tripCurrency, rates, createdByPersonId } = opts
  const from = draft.fromPersonId
  const to = draft.toPersonId
  if (!from || !to || from === to) throw new Error('Pick two different people')
  if (!(draft.amount > 0)) throw new Error('Amount must be greater than zero')

  const currency = draft.currencyCode.toUpperCase()
  const exchangeRate = frozenExchangeRate(currency, tripCurrency, rates ?? null)
  const sb = getSupabaseBrowserClient()

  if (draft.id) {
    const { error } = await sb
      .from('trip_expense_settlements')
      .update({
        from_person_id: from,
        to_person_id: to,
        amount: draft.amount,
        currency_code: currency,
        exchange_rate: exchangeRate,
      })
      .eq('id', draft.id)
    if (error) throw error
    return draft.id
  }

  const { data, error } = await sb
    .from('trip_expense_settlements')
    .insert({
      trip_id: tripId,
      from_person_id: from,
      to_person_id: to,
      amount: draft.amount,
      currency_code: currency,
      exchange_rate: exchangeRate,
      created_by_person_id: createdByPersonId ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function deleteTripExpenseSettlement(id: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('trip_expense_settlements')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function settleTripExpenseFlows(opts: {
  tripId: string
  flows: SettleFlow[]
  currencyCode: string
  tripCurrency: string
  rates?: Record<string, number> | null
}): Promise<number> {
  const { tripId, flows, currencyCode, tripCurrency, rates } = opts
  if (flows.length === 0) return 0

  const currency = currencyCode.toUpperCase()
  const exchangeRate = frozenExchangeRate(currency, tripCurrency, rates ?? null)
  const p_flows = flows.map(flow => ({
    from_person_id: flow.fromPersonId,
    to_person_id: flow.toPersonId,
    amount: round2(flow.amount),
    currency_code: currency,
    exchange_rate: exchangeRate,
  }))

  const { data, error } = await getSupabaseBrowserClient().rpc('settle_trip_expense_flows', {
    p_trip_id: tripId,
    p_flows,
  })
  if (error) throw error
  return typeof data === 'number' ? data : Number(data ?? 0)
}

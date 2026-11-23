/**
 * Pure Costs settlement math — port of iOS CostsSettlementEngine.
 * UUIDs normalized uppercase for sort + stableModulo (match Foundation UUID.uuidString).
 */

export type CostTicketLine = {
  id?: string
  name: string
  price: number
  personIds: string[]
}

export type TripExpenseShareInput = {
  personId: string
  amount: number | null
}

export type TripExpensePayerInput = {
  personId: string
  amount: number
}

export type SettlementExpenseInput = {
  id: string
  totalAmount: number
  currencyCode: string | null
  exchangeRate: number
  shares: TripExpenseShareInput[]
  payers: TripExpensePayerInput[]
  isUnfinished: boolean
}

export type SettlementPaymentInput = {
  fromPersonId: string
  toPersonId: string
  amount: number
  currencyCode: string | null
  exchangeRate: number
}

export type SettlementTraveler = {
  id: string
  displayName: string
  color?: string | null
}

export type PersonBalance = {
  personId: string
  displayName: string
  balance: number
}

export type SettleFlow = {
  fromPersonId: string
  toPersonId: string
  amount: number
}

export type SettlementSnapshot = {
  balances: PersonBalance[]
  flows: SettleFlow[]
  youOwe: number
  youAreOwed: number
  outstanding: number
  totalSpend: number
  yourShare: number
  youPaid: number
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function encodeTicketLines(lines: CostTicketLine[]): Array<{
  name: string
  price: number
  person_ids: string[]
}> {
  return lines
    .filter(l => l.name.trim() !== '' || l.price > 0)
    .map(l => ({
      name: l.name,
      price: l.price,
      person_ids: l.personIds,
    }))
}

function uuidKey(id: string): string {
  return id.toUpperCase()
}

export function stableModulo(expenseId: string, n: number): number {
  if (n <= 0) return 0
  let hash = 0
  const s = uuidKey(expenseId)
  for (let i = 0; i < s.length; i++) {
    hash = (Math.imul(hash, 31) + s.charCodeAt(i)) & 0x7fffffff
  }
  return hash % n
}

export function splitEqualShares(
  total: number,
  personIds: string[],
  expenseId: string,
): Record<string, number> {
  const n = personIds.length
  if (n === 0) return {}

  const totalCents = Math.round(total * 100)
  const baseCents = Math.floor(totalCents / n)
  const remainder = totalCents % n
  const sorted = [...personIds].sort((a, b) =>
    uuidKey(a) < uuidKey(b) ? -1 : uuidKey(a) > uuidKey(b) ? 1 : 0,
  )
  const startIndex = stableModulo(expenseId, n)
  const shares: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const person = sorted[i]
    const hasExtra = ((i - startIndex + n) % n) < remainder
    shares[person] = (baseCents + (hasExtra ? 1 : 0)) / 100
  }
  return shares
}

export function calculateTicketShares(
  lines: CostTicketLine[],
): { shares: Record<string, number>; total: number } {
  const shareCents: Record<string, number> = {}
  let totalCents = 0
  for (const line of lines) {
    const priceCents = Math.round(line.price * 100)
    totalCents += priceCents
    const partIds = line.personIds
    const n = partIds.length
    if (n === 0) continue
    const baseCents = Math.floor(priceCents / n)
    const remainder = priceCents % n
    const sorted = [...partIds].sort((a, b) =>
      uuidKey(a) < uuidKey(b) ? -1 : uuidKey(a) > uuidKey(b) ? 1 : 0,
    )
    for (let i = 0; i < n; i++) {
      const id = sorted[i]
      shareCents[id] = (shareCents[id] ?? 0) + baseCents + (i < remainder ? 1 : 0)
    }
  }
  const shares: Record<string, number> = {}
  for (const [id, cents] of Object.entries(shareCents)) {
    shares[id] = cents / 100
  }
  return { shares, total: totalCents / 100 }
}

export function calculateSettlement(opts: {
  expenses: SettlementExpenseInput[]
  settlements: SettlementPaymentInput[]
  travelers: SettlementTraveler[]
  mePersonId: string | null | undefined
  tripCurrency: string
  displayCurrency: string
  rates: Record<string, number> | null | undefined
}): SettlementSnapshot {
  const tripCur = opts.tripCurrency.toUpperCase()
  const display = opts.displayCurrency.toUpperCase()
  const rates = opts.rates ?? null
  const mePersonId = opts.mePersonId ?? null
  const nameById = new Map(opts.travelers.map(t => [t.id, t.displayName]))

  function toTrip(amount: number, itemCurrency: string | null, itemRate: number | null): number {
    const cur = (itemCurrency ?? tripCur).toUpperCase()
    if (cur === tripCur) return amount
    if (itemRate != null && itemRate > 0 && itemRate !== 1) return amount / itemRate
    if (!rates) return amount
    const rCur = rates[cur]
    const rTrip = rates[tripCur]
    if (rCur != null && rCur > 0 && rTrip != null && rTrip > 0) {
      return (amount / rCur) * rTrip
    }
    return amount
  }

  function toDisplay(v: number): number {
    if (display === tripCur) return v
    if (!rates) return v
    const rTrip = rates[tripCur]
    if (rTrip == null || !(rTrip > 0)) return v
    return v / rTrip
  }

  function settleToTrip(amount: number, sCurrency: string | null, sRate: number | null): number {
    if (sCurrency) {
      const cur = sCurrency.toUpperCase()
      if (cur === tripCur) return amount
      if (sRate != null && sRate > 0 && sRate !== 1) return amount / sRate
      if (rates) {
        const rCur = rates[cur]
        const rTrip = rates[tripCur]
        if (rCur != null && rCur > 0 && rTrip != null && rTrip > 0) {
          return (amount / rCur) * rTrip
        }
      }
      return amount
    }
    if (display === tripCur) return amount
    if (!rates) return amount
    const rTrip = rates[tripCur]
    if (rTrip == null || !(rTrip > 0)) return amount
    return amount * rTrip
  }

  const raw = new Map<string, number>()
  function ensure(id: string) {
    if (!raw.has(id)) raw.set(id, 0)
  }

  let outstandingTrip = 0
  let totalSpendTrip = 0
  let yourShareTrip = 0
  let youPaidTrip = 0

  for (const expense of opts.expenses) {
    const converted = toTrip(expense.totalAmount, expense.currencyCode, expense.exchangeRate)
    totalSpendTrip += converted
    if (expense.isUnfinished) outstandingTrip += converted
    if (expense.shares.length === 0) continue

    for (const p of expense.payers) {
      if (!(p.amount > 0)) continue
      ensure(p.personId)
      const paid = toTrip(p.amount, expense.currencyCode, expense.exchangeRate)
      raw.set(p.personId, (raw.get(p.personId) ?? 0) + paid)
      if (p.personId === mePersonId) youPaidTrip += paid
    }

    const hasCustom = expense.shares.some(s => s.amount != null)
    const equalShares = hasCustom
      ? ({} as Record<string, number>)
      : splitEqualShares(
          expense.totalAmount,
          expense.shares.map(s => s.personId),
          expense.id,
        )

    for (const m of expense.shares) {
      ensure(m.personId)
      const shareAmount = hasCustom && m.amount != null
        ? m.amount
        : (equalShares[m.personId] ?? 0)
      const shareTrip = toTrip(shareAmount, expense.currencyCode, expense.exchangeRate)
      raw.set(m.personId, (raw.get(m.personId) ?? 0) - shareTrip)
      if (m.personId === mePersonId) yourShareTrip += shareTrip
    }
  }

  for (const s of opts.settlements) {
    const inTrip = settleToTrip(s.amount, s.currencyCode, s.exchangeRate)
    ensure(s.fromPersonId)
    ensure(s.toPersonId)
    raw.set(s.fromPersonId, (raw.get(s.fromPersonId) ?? 0) + inTrip)
    raw.set(s.toPersonId, (raw.get(s.toPersonId) ?? 0) - inTrip)
  }

  const balances: PersonBalance[] = [...raw.entries()]
    .map(([personId, bal]) => ({
      personId,
      displayName: nameById.get(personId) ?? '?',
      balance: round2(toDisplay(bal)),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))

  let debtors = [...raw.entries()]
    .filter(([, bal]) => bal < -0.01)
    .map(([id, bal]) => ({ id, amt: -bal }))
    .sort((a, b) => b.amt - a.amt)

  let creditors = [...raw.entries()]
    .filter(([, bal]) => bal > 0.01)
    .map(([id, bal]) => ({ id, amt: bal }))
    .sort((a, b) => b.amt - a.amt)

  const flows: SettleFlow[] = []
  let di = 0
  let ci = 0
  while (di < debtors.length && ci < creditors.length) {
    const transfer = Math.min(debtors[di].amt, creditors[ci].amt)
    if (transfer > 0.01) {
      flows.push({
        fromPersonId: debtors[di].id,
        toPersonId: creditors[ci].id,
        amount: round2(toDisplay(transfer)),
      })
    }
    debtors[di] = { ...debtors[di], amt: debtors[di].amt - transfer }
    creditors[ci] = { ...creditors[ci], amt: creditors[ci].amt - transfer }
    if (debtors[di].amt < 0.01) di += 1
    if (creditors[ci].amt < 0.01) ci += 1
  }

  let youOwe = 0
  let youAreOwed = 0
  if (mePersonId) {
    const mine = balances.find(b => b.personId === mePersonId)
    if (mine) {
      if (mine.balance < -0.01) youOwe = -mine.balance
      if (mine.balance > 0.01) youAreOwed = mine.balance
    }
  }

  return {
    balances,
    flows,
    youOwe: round2(youOwe),
    youAreOwed: round2(youAreOwed),
    outstanding: round2(toDisplay(outstandingTrip)),
    totalSpend: round2(toDisplay(totalSpendTrip)),
    yourShare: round2(toDisplay(yourShareTrip)),
    youPaid: round2(toDisplay(youPaidTrip)),
  }
}

export function frozenExchangeRate(
  fromCurrency: string,
  tripCurrency: string,
  rates: Record<string, number> | null | undefined,
): number {
  const from = fromCurrency.toUpperCase()
  const trip = tripCurrency.toUpperCase()
  if (from === trip) return 1
  if (!rates) return 1
  const r = rates[from]
  if (r != null && r > 0) return r
  const rFrom = rates[from]
  const rTrip = rates[trip]
  if (rFrom != null && rFrom > 0 && rTrip != null && rTrip > 0) {
    return rFrom / rTrip
  }
  return 1
}

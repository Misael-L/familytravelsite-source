/**
 * W6 Family Costs panel — same TREK pixels as CostsPanel, Supabase data plane.
 * Nest CostsPanel (budgetApi / numeric ids) is untouched; this is the string-id path.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ArrowDown, ArrowUp, BarChart3, Plus, Search, ArrowRight, ArrowLeftRight,
  Check, RotateCcw, Pencil, Trash2, AlertCircle, Download,
} from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'
import { useExchangeRates } from '../../hooks/useExchangeRates'
import { useIsMobile } from '../../hooks/useIsMobile'
import { formatMoney, currencyDecimals, currencyLocale } from '../../utils/formatters'
import Modal from '../shared/Modal'
import CustomSelect from '../shared/CustomSelect'
import { CustomDatePicker } from '../shared/CustomDateTimePicker'
import { SYMBOLS, currenciesWith, SPLIT_COLORS } from './BudgetPanel.constants'
import { COST_CATEGORY_LIST, catMeta } from './costsCategories'
import { NumericInput } from '../shared/NumericInput'

import {
  listTripExpenses,
  upsertTripExpense,
  deleteTripExpense,
  expenseIsUnfinished,
  type FamilyTripExpense,
  type TripExpenseDraft,
  type CostCategory,
} from '../../data/supabase/tripExpenses'
import { expenseDraftHasBlockingUnstagedFields } from '../../data/supabase/tripChangeRequests'
import type { FamilyExpensePrefill } from '../../data/supabase/tripReservations'
import {
  listTripExpenseSettlements,
  upsertTripExpenseSettlement,
  deleteTripExpenseSettlement,
  settleTripExpenseFlows,
  type FamilyTripExpenseSettlement,
} from '../../data/supabase/tripExpenseSettlements'
import { listTripTravelers, type FamilyTripTraveler } from '../../data/supabase/tripTravelers'
import {
  calculateSettlement,
  calculateTicketShares,
  splitEqualShares,
  type CostTicketLine,
  type SettlementSnapshot,
} from '../../lib/costs/settlementEngine'

/** UI ticket line — price as string for NumericInput; personIds as Set for toggles. */
type FamilyTicketItem = {
  id: string
  name: string
  price: string
  participants: Set<string>
}

// ── helpers ──────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100
const FIELD_H = 40

type LedgerEntry =
  | { kind: 'expense'; date: string; e: FamilyTripExpense }
  | { kind: 'payment'; date: string; s: FamilyTripExpenseSettlement }

/** Derive a stable color hex from person position in trip list */
function personColor(t: FamilyTripTraveler | undefined, idx: number): string {
  if (t?.color) return t.color
  return SPLIT_COLORS[idx % SPLIT_COLORS.length].gradient
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CostsPanelFamilyProps {
  tripId: string
  currencyCode: string
  canMutate: boolean
  canEditExpenses?: boolean
  mePersonId: string | null
  prefill?: FamilyExpensePrefill | null
  onPrefillConsumed?: () => void
  onStageExpense?: (draft: TripExpenseDraft) => Promise<boolean>
  onStageDeleteExpense?: (id: string) => Promise<boolean>
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CostsPanelFamily({
  tripId,
  currencyCode,
  canMutate,
  canEditExpenses,
  mePersonId,
  prefill = null,
  onPrefillConsumed,
  onStageExpense,
  onStageDeleteExpense,
}: CostsPanelFamilyProps) {
  const toast = useToast()
  const { t, locale } = useTranslation()
  const isMobile = useIsMobile()
  const canEditExpenseRows = canEditExpenses ?? canMutate

  const displayCurrency = useSettingsStore(s => s.settings.default_currency)
  const base = (displayCurrency || currencyCode || 'EUR').toUpperCase()
  const { rates, convert } = useExchangeRates(base)

  // ── data ──────────────────────────────────────────────────────────────────
  const [travelers, setTravelers] = useState<FamilyTripTraveler[]>([])
  const [expenses, setExpenses] = useState<FamilyTripExpense[]>([])
  const [recordedSettlements, setRecordedSettlements] = useState<FamilyTripExpenseSettlement[]>([])
  const [loading, setLoading] = useState(true)

  // modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<FamilyTripExpense | null>(null)
  const [editingSettlement, setEditingSettlement] = useState<FamilyTripExpenseSettlement | null>(null)
  const [addingPayment, setAddingPayment] = useState(false)
  const [activePrefill, setActivePrefill] = useState<FamilyExpensePrefill | null>(null)

  // filter state
  const [filter, setFilter] = useState<'all' | 'mine' | 'owed'>('all')
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [dayFilter, setDayFilter] = useState('')

  const loadAll = useCallback(async () => {
    if (!tripId) return
    try {
      const [t2, e, s] = await Promise.all([
        listTripTravelers(tripId),
        listTripExpenses(tripId),
        listTripExpenseSettlements(tripId),
      ])
      setTravelers(t2)
      setExpenses(e)
      setRecordedSettlements(s)
    } catch {
      toast.error(t('common.unknownError'))
    } finally {
      setLoading(false)
    }
  }, [tripId]) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadExpenses = useCallback(async () => {
    try { setExpenses(await listTripExpenses(tripId)) } catch { toast.error(t('common.unknownError')) }
  }, [tripId]) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadSettlements = useCallback(async () => {
    try { setRecordedSettlements(await listTripExpenseSettlements(tripId)) } catch { toast.error(t('common.unknownError')) }
  }, [tripId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadAll() }, [loadAll])

  useEffect(() => {
    if (!prefill || !canEditExpenseRows) return
    if (prefill.expenseId) {
      if (loading) return
      const found = expenses.find(e => e.id === prefill.expenseId)
      if (found) {
        setEditingExpense(found)
        setActivePrefill(null)
        setModalOpen(true)
      }
      onPrefillConsumed?.()
      return
    }
    setEditingExpense(null)
    setActivePrefill(prefill)
    setModalOpen(true)
    onPrefillConsumed?.()
  }, [prefill, canEditExpenseRows, expenses, loading, onPrefillConsumed])

  // ── lookup helpers ────────────────────────────────────────────────────────
  const travelerById = useMemo(() => {
    const m = new Map<string, FamilyTripTraveler & { idx: number }>()
    travelers.forEach((tr, idx) => m.set(tr.personId, { ...tr, idx }))
    return m
  }, [travelers])

  const personName = useCallback(
    (id: string) => id === mePersonId ? t('costs.you') : (travelerById.get(id)?.displayName ?? '?'),
    [mePersonId, travelerById, t],
  )
  const initial = useCallback(
    (id: string) => id === mePersonId ? t('costs.youShort') : (travelerById.get(id)?.displayName ?? '?').charAt(0).toUpperCase(),
    [mePersonId, travelerById, t],
  )
  const colorFor = useCallback(
    (id: string) => { const tr = travelerById.get(id); return personColor(tr, tr?.idx ?? 0) },
    [travelerById],
  )

  const fmt = useCallback((v: number, c = base) => formatMoney(v, c, locale), [base, locale])
  const fmt0 = useCallback((v: number, c = base) => formatMoney(v, c, locale, { decimals: 0 }), [base, locale])

  // ── settlement snapshot ───────────────────────────────────────────────────
  const snapshot = useMemo<SettlementSnapshot>(() => calculateSettlement({
    expenses: expenses.map(e => ({
      id: e.id,
      totalAmount: e.totalAmount,
      currencyCode: e.currencyCode,
      exchangeRate: e.exchangeRate,
      shares: e.shares.map(s => ({ personId: s.personId, amount: s.amount })),
      payers: e.payers.map(p => ({ personId: p.personId, amount: p.amount })),
      isUnfinished: expenseIsUnfinished(e),
    })),
    settlements: recordedSettlements.map(s => ({
      fromPersonId: s.fromPersonId,
      toPersonId: s.toPersonId,
      amount: s.amount,
      currencyCode: s.currencyCode,
      exchangeRate: s.exchangeRate,
    })),
    travelers: travelers.map(tr => ({ id: tr.personId, displayName: tr.displayName })),
    mePersonId,
    tripCurrency: currencyCode || 'EUR',
    displayCurrency: base,
    rates,
  }), [expenses, recordedSettlements, travelers, mePersonId, currencyCode, base, rates])

  // ── derived expense math (display currency) ───────────────────────────────
  const baseTotal = useCallback(
    (e: FamilyTripExpense) => convert(e.totalAmount, e.currencyCode ?? currencyCode),
    [convert, currencyCode],
  )
  const myPaidOf = useCallback(
    (e: FamilyTripExpense) => {
      if (!mePersonId) return 0
      return e.payers.filter(p => p.personId === mePersonId).reduce((a, p) => a + convert(p.amount, e.currencyCode ?? currencyCode), 0)
    },
    [mePersonId, convert, currencyCode],
  )
  const myShareOf = useCallback(
    (e: FamilyTripExpense) => {
      if (!mePersonId) return 0
      const myMember = e.shares.find(s => s.personId === mePersonId)
      if (!myMember) return 0
      if (myMember.amount != null) return convert(myMember.amount, e.currencyCode ?? currencyCode)
      const shareMap = splitEqualShares(e.totalAmount, e.shares.map(s => s.personId), e.id)
      return convert(shareMap[mePersonId] ?? 0, e.currencyCode ?? currencyCode)
    },
    [mePersonId, convert, currencyCode],
  )

  // ── filter controls ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = expenses.slice()
    if (filter === 'mine') list = list.filter(e => myPaidOf(e) > 0)
    if (filter === 'owed') list = list.filter(e => round2(myPaidOf(e) - myShareOf(e)) > 0)
    if (catFilter) list = list.filter(e => catMeta(e.category).key === catFilter)
    if (dayFilter) list = list.filter(e => (e.expenseDate || '') === dayFilter)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(e => e.name.toLowerCase().includes(q))
    return list
  }, [expenses, filter, search, catFilter, dayFilter, myPaidOf, myShareOf])

  const filteredSettlements = useMemo(() => {
    if (search.trim() || catFilter) return []
    if (filter === 'owed') return []
    let list = recordedSettlements.slice()
    if (filter === 'mine') list = list.filter(s => s.fromPersonId === mePersonId || s.toPersonId === mePersonId)
    if (dayFilter) list = list.filter(s => (s.createdAt || '').slice(0, 10) === dayFilter)
    return list
  }, [recordedSettlements, filter, search, catFilter, dayFilter, mePersonId])

  const dayGroups = useMemo(() => {
    const labelOf = (date: string) => {
      if (!date) return t('costs.noDate')
      try { return new Date(date + 'T00:00:00Z').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) } catch { return date }
    }
    const entries: LedgerEntry[] = [
      ...filtered.map(e => ({ kind: 'expense' as const, date: e.expenseDate || '', e })),
      ...filteredSettlements.map(s => ({ kind: 'payment' as const, date: s.createdAt.slice(0, 10), s })),
    ]
    const sorted = entries.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    const groups: { day: string; entries: LedgerEntry[] }[] = []
    for (const en of sorted) {
      const day = labelOf(en.date)
      let g = groups.find(x => x.day === day)
      if (!g) { g = { day, entries: [] }; groups.push(g) }
      g.entries.push(en)
    }
    return groups
  }, [filtered, filteredSettlements, locale, t])

  const categoryOptions = useMemo(() => [
    { value: '', label: t('costs.filter.allCategories') },
    ...COST_CATEGORY_LIST.map(c => ({ value: c.key, label: t(c.labelKey), icon: <c.Icon size={14} style={{ color: c.color }} /> })),
  ], [t])

  const dayOptions = useMemo(() => {
    const days = Array.from(new Set(expenses.map(e => e.expenseDate).filter(Boolean) as string[])).sort((a, b) => b.localeCompare(a))
    const fmtDay = (d: string) => { try { return new Date(d + 'T00:00:00Z').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) } catch { return d } }
    return [{ value: '', label: t('costs.filter.allDays') }, ...days.map(d => ({ value: d, label: fmtDay(d) }))]
  }, [expenses, locale, t])

  // ── settle handlers ───────────────────────────────────────────────────────
  const handleSettleFlow = async (fromPersonId: string, toPersonId: string, amount: number) => {
    try {
      await upsertTripExpenseSettlement({ tripId, draft: { fromPersonId, toPersonId, amount, currencyCode: base }, tripCurrency: currencyCode || 'EUR', rates: rates ?? null, createdByPersonId: mePersonId })
      await reloadSettlements()
    } catch { toast.error(t('common.unknownError')) }
  }

  const handleUndoSettlement = async (id: string) => {
    try { await deleteTripExpenseSettlement(id); await reloadSettlements() } catch { toast.error(t('common.unknownError')) }
  }

  const handleSettleAll = async () => {
    if (!snapshot.flows.length) return
    try {
      await settleTripExpenseFlows({ tripId, flows: snapshot.flows, currencyCode: base, tripCurrency: currencyCode || 'EUR', rates: rates ?? null })
      await reloadSettlements()
    } catch { toast.error(t('common.unknownError')) }
  }

  const handleDeleteExpense = async (id: string) => {
    try {
      if (onStageDeleteExpense) {
        const ok = await onStageDeleteExpense(id)
        if (ok) toast.success(t('trip.governance.stagedRemove'))
        return
      }
      await deleteTripExpense(id)
      await reloadExpenses()
      await reloadSettlements()
    } catch { toast.error(t('common.unknownError')) }
  }

  const handleExportCsv = () => {
    const sep = ';'
    const esc = (v: unknown) => { const s = String(v ?? ''); return s.includes(sep) || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s }
    const fmtDate = (iso: string) => { if (!iso) return ''; try { return new Date(iso + 'T00:00:00Z').toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) } catch { return iso } }
    const header = ['Date', 'Name', 'Category', 'Amount', 'Currency', 'Amount (' + base + ')', 'Note']
    const rows = [header.join(sep)]
    const items = expenses.slice().sort((a, b) => (a.expenseDate || '').localeCompare(b.expenseDate || ''))
    for (const e of items) {
      const cur = e.currencyCode ?? currencyCode
      const note = e.note && !e.note.startsWith('TICKETJSON:') ? e.note : ''
      rows.push([
        esc(fmtDate(e.expenseDate || '')), esc(e.name), esc(t(catMeta(e.category).labelKey)),
        (e.totalAmount).toFixed(currencyDecimals(cur)), cur,
        baseTotal(e).toFixed(currencyDecimals(base)),
        esc(note),
      ].join(sep))
    }
    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `costs-trip.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── presentational helpers ────────────────────────────────────────────────
  const Avatar = useCallback(({ id, size = 24 }: { id: string; size?: number }) => (
    <span style={{ width: size, height: size, borderRadius: '50%', background: colorFor(id), color: '#fff', display: 'grid', placeItems: 'center', fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>{initial(id)}</span>
  ), [colorFor, initial])

  const cardCls = 'bg-surface-card border border-edge'
  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-content-faint'

  const bigMoney = (amount: number, smallSize: number, mutedColor: string) => {
    let parts: Intl.NumberFormatPart[] | null = null
    try {
      const d = currencyDecimals(base)
      parts = new Intl.NumberFormat(currencyLocale(base), { style: 'currency', currency: base, minimumFractionDigits: d, maximumFractionDigits: d }).formatToParts(amount || 0)
    } catch { return <>{fmt(amount)}</> }
    const isBig = (p: Intl.NumberFormatPart) => p.type === 'integer' || p.type === 'group' || p.type === 'minusSign'
    return <>{parts.map((p, i) => <span key={i} style={isBig(p) ? undefined : { fontSize: smallSize, fontWeight: 500, color: mutedColor }}>{p.value}</span>)}</>
  }

  const filterControls = (
    <>
      <CustomSelect value={catFilter} onChange={v => setCatFilter(String(v))} options={categoryOptions} size="sm" style={{ minWidth: 148 }} />
      <CustomSelect value={dayFilter} onChange={v => setDayFilter(String(v))} options={dayOptions} size="sm" searchable style={{ minWidth: 140 }} />
    </>
  )

  const dayFilterTotal = dayFilter ? filtered.reduce((a, e) => a + baseTotal(e), 0) : 0
  const dayFilterLabel = dayFilter
    ? (() => { try { return new Date(dayFilter + 'T00:00:00Z').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) } catch { return dayFilter } })()
    : ''
  const dayBanner = dayFilter ? (
    <div className={cardCls} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div className="text-content" style={{ fontSize: 'calc(15px * var(--fs-scale-subtitle, 1))', fontWeight: 700, letterSpacing: '-0.01em' }}>{dayFilterLabel}</div>
        <div className="text-content-muted" style={{ marginTop: 3, fontSize: 'calc(12px * var(--fs-scale-body, 1))' }}>{t('costs.expensesCount', { count: filtered.length })}</div>
      </div>
      <div className="text-content" style={{ fontSize: 'calc(26px * var(--fs-scale-title, 1))', fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{bigMoney(dayFilterTotal, 15, 'var(--text-muted)')}</div>
    </div>
  ) : null

  if (loading) {
    return <div style={{ padding: '60px 24px', textAlign: 'center' }} className="text-content-faint">Loading…</div>
  }

  return (
    <div className="costs-root" style={{ minHeight: '100%', background: 'var(--c-bg)', padding: isMobile ? '6px 14px 28px' : '40px 24px 48px' }}>
      {isMobile ? <MobileBody /> : (
        <div style={{ maxWidth: '100%', margin: '0 auto' }}>
          {/* ── Header bar ── */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 28, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className="bg-surface-card border border-edge text-content-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px 8px 10px', borderRadius: 999, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500 }}>
                <span style={{ display: 'inline-flex' }}>
                  {travelers.slice(0, 4).map((tr, i) => (
                    <span key={tr.personId} style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--bg-card)', marginLeft: i ? -8 : 0, flexShrink: 0, background: personColor(tr, i), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 'calc(9px * var(--fs-scale-caption, 1))', fontWeight: 700 }}>
                      {(tr.personId === mePersonId ? t('costs.youShort') : tr.displayName.charAt(0)).toUpperCase()}
                    </span>
                  ))}
                </span>
                <b className="text-content">{t('costs.travelers', { count: travelers.length })}</b>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {canMutate && (
                <button onClick={() => { void handleSettleAll() }} disabled={!snapshot.flows.length}
                  className="bg-surface-card border border-edge text-content disabled:opacity-40"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 12, fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Check size={16} /> {t('costs.settleUp')}
                </button>
              )}
              {canEditExpenseRows && (
                <button onClick={() => { setEditingExpense(null); setModalOpen(true) }}
                  className="bg-[var(--text-primary)] text-[var(--bg-primary)]"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 12, fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 600, border: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Plus size={16} /> {t('costs.addExpense')}
                </button>
              )}
            </div>
          </div>

          {/* ── Summary cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 36 }} className="costs-summary">
            <SummaryCard label={t('costs.youOwe')} sub={t('costs.youOweSub')} amount={snapshot.youOwe} currency={base} locale={locale}
              icon={<ArrowDown size={18} />} tone="owe"
              foot={snapshot.youOwe > 0.01
                ? <FlowPills ids={snapshot.flows.filter(f => f.fromPersonId === mePersonId).map(f => f.toPersonId)} lead={t('costs.to')} Avatar={Avatar} name={personName} />
                : <span className="text-content-faint">{t('costs.allSettled')}</span>} />
            <SummaryCard label={t('costs.youreOwed')} sub={t('costs.youreOwedSub')} amount={snapshot.youAreOwed} currency={base} locale={locale}
              icon={<ArrowUp size={18} />} tone="owed"
              foot={snapshot.youAreOwed > 0.01
                ? <FlowPills ids={snapshot.flows.filter(f => f.toPersonId === mePersonId).map(f => f.fromPersonId)} lead={t('costs.from')} Avatar={Avatar} name={personName} />
                : <span className="text-content-faint">{t('costs.nothingOwed')}</span>} />
            <SummaryCard label={t('costs.outstanding')} sub={t('costs.outstandingSub')} amount={snapshot.outstanding} currency={base} locale={locale}
              icon={<AlertCircle size={18} />} tone="unfinished"
              foot={expenses.filter(expenseIsUnfinished).length > 0
                ? <span><b>{expenses.filter(expenseIsUnfinished).length}</b> {t('costs.outstandingItems')}</span>
                : <span className="text-content-faint">{t('costs.allSettled')}</span>} />
            <SummaryCard label={t('costs.totalSpend')} sub={t('costs.totalSpendSub')} amount={snapshot.totalSpend} currency={base} locale={locale}
              icon={<BarChart3 size={18} />} tone="total"
              foot={<span style={{ display: 'flex', gap: 16 }}><span>{t('costs.yourShare')} · <b>{fmt0(snapshot.yourShare)}</b></span><span>{t('costs.youPaid')} · <b>{fmt0(snapshot.youPaid)}</b></span></span>} />
          </div>

          {/* ── Main grid ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'start' }} className="costs-grid">
            {/* expenses */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                <h3 className="text-content" style={{ fontSize: 'calc(24px * var(--fs-scale-title, 1))', fontWeight: 600, letterSpacing: '-0.025em', margin: 0 }}>{t('costs.expenses')}</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="bg-surface-input border border-edge" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '0 10px', height: 34 }}>
                    <Search size={15} className="text-content-faint" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('costs.searchPlaceholder')}
                      className="text-content" style={{ border: 0, background: 'none', outline: 'none', fontSize: 'calc(13px * var(--fs-scale-body, 1))', width: 150, fontFamily: 'inherit' }} />
                  </div>
                  {filterControls}
                  <div className="bg-surface-secondary" style={{ display: 'flex', borderRadius: 9, padding: 3 }}>
                    {(['all', 'mine', 'owed'] as const).map(f => (
                      <button key={f} onClick={() => setFilter(f)}
                        className={filter === f ? 'bg-surface-card text-content' : 'text-content-muted'}
                        style={{ padding: '6px 11px', fontSize: 'calc(12px * var(--fs-scale-body, 1))', borderRadius: 7, fontWeight: 500, border: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {t('costs.filter.' + f)}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleExportCsv} title={t('budget.exportCsv')} disabled={!expenses.length}
                    className="bg-surface-input border border-edge text-content-muted disabled:opacity-40"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    <Download size={15} />
                  </button>
                </div>
              </div>

              {dayBanner}
              {dayGroups.length === 0 ? (
                <div className="text-content-faint" style={{ textAlign: 'center', padding: '60px 20px' }}>
                  {search ? t('costs.noMatch') : t('costs.emptyText')}
                </div>
              ) : dayGroups.map(g => {
                const dtot = g.entries.reduce((a, en) => en.kind === 'expense' ? a + baseTotal(en.e) : a, 0)
                return (
                  <div key={g.day} style={{ marginBottom: 22 }}>
                    {!dayFilter && (
                      <div className={labelCls} style={{ display: 'flex', alignItems: 'center', margin: '0 0 10px 4px' }}>
                        {g.day}<span className="text-content-muted" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: 'calc(12px * var(--fs-scale-body, 1))' }}>{t('costs.spent', { amount: fmt(dtot) })}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {g.entries.map(en => en.kind === 'expense'
                        ? <ExpenseRow key={'e' + en.e.id} e={en.e} />
                        : <SettlementRow key={'s' + en.s.id} s={en.s} />)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={cardCls} style={{ borderRadius: 22, padding: '22px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div className={labelCls}>{t('costs.settleUp')} · <span className="text-content">{snapshot.flows.length}</span></div>
                  {canMutate && (
                    <button onClick={() => setAddingPayment(true)}
                      className="text-content-muted bg-surface-secondary border border-edge"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, fontSize: 'calc(11.5px * var(--fs-scale-caption, 1))', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Plus size={13} /> {t('costs.addPayment')}
                    </button>
                  )}
                </div>
                <SettleFlows />
              </div>
              <div className={cardCls} style={{ borderRadius: 22, padding: '22px 24px' }}>
                <div className={labelCls} style={{ marginBottom: 14 }}>{t('costs.balances')}</div>
                <BalancesList />
              </div>
              <div className={cardCls} style={{ borderRadius: 22, padding: '22px 24px' }}>
                <div className={labelCls} style={{ marginBottom: 14 }}>{t('costs.byCategory')}</div>
                <CategoryBreakdown />
              </div>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <FamilyExpenseModal
          tripId={tripId}
          tripCurrency={currencyCode || 'EUR'}
          base={base}
          rates={rates}
          people={travelers}
          mePersonId={mePersonId}
          editing={editingExpense}
          prefill={activePrefill}
          onClose={() => { setModalOpen(false); setActivePrefill(null) }}
          onSaved={async () => { setModalOpen(false); setActivePrefill(null); await reloadExpenses(); await reloadSettlements() }}
          onStageExpense={onStageExpense}
        />
      )}

      {(editingSettlement || addingPayment) && (
        <FamilySettlementModal
          tripId={tripId}
          tripCurrency={currencyCode || 'EUR'}
          base={base}
          rates={rates}
          people={travelers}
          mePersonId={mePersonId}
          editing={editingSettlement}
          onClose={() => { setEditingSettlement(null); setAddingPayment(false) }}
          onSaved={async () => { setEditingSettlement(null); setAddingPayment(false); await reloadSettlements() }}
        />
      )}

      <style>{`
        .costs-root {
          --c-bg: #f8fafc; --c-bg2: oklch(0.965 0.01 70);
          --c-surface: #ffffff; --c-surface2: oklch(0.985 0.006 78);
          --c-ink: oklch(0.22 0.012 65); --c-ink2: oklch(0.42 0.012 65); --c-ink3: oklch(0.62 0.01 65);
          --c-line: oklch(0.92 0.008 70);
        }
        html.dark .costs-root {
          --c-bg: #121215; --c-bg2: #18181c;
          --c-surface: #1a1a1e; --c-surface2: #202027;
          --c-ink: #f4f4f5; --c-ink2: #a1a1aa; --c-ink3: #71717a;
          --c-line: #2a2a31;
        }
        .costs-root .bg-surface-card { background: var(--c-surface) !important; }
        .costs-root .bg-surface-secondary, .costs-root .bg-surface-input { background: var(--c-surface2) !important; }
        .costs-root .border-edge { border-color: var(--c-line) !important; }
        html.dark .costs-root .bg-surface-card {
          background: rgba(255,255,255,0.035) !important;
          border-color: rgba(255,255,255,0.08) !important;
          backdrop-filter: blur(20px) saturate(1.4);
          -webkit-backdrop-filter: blur(20px) saturate(1.4);
        }
        html.dark .costs-root .bg-surface-secondary,
        html.dark .costs-root .bg-surface-input { background: rgba(255,255,255,0.05) !important; }
        html.dark .costs-root .border-edge { border-color: rgba(255,255,255,0.08) !important; }
        .costs-root .text-content { color: var(--c-ink) !important; }
        .costs-root .text-content-muted { color: var(--c-ink2) !important; }
        .costs-root .text-content-faint { color: var(--c-ink3) !important; }
        @media (max-width: 1100px) {
          .costs-root .costs-summary { grid-template-columns: 1fr 1fr !important; }
          .costs-root .costs-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .costs-root .costs-summary { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )

  // ── inner sub-components (close over outer helpers) ───────────────────────

  function SettleFlows() {
    if (!snapshot.flows.length) return (
      <div style={{ textAlign: 'center', padding: '14px 8px' }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', margin: '0 auto 10px', display: 'grid', placeItems: 'center', background: 'rgba(22,163,74,0.12)', color: '#16a34a' }}><Check size={22} /></div>
        <div className="text-content" style={{ fontSize: 'calc(14.5px * var(--fs-scale-body, 1))', fontWeight: 600 }}>{t('costs.everyoneSquare')}</div>
        <div className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', marginTop: 2 }}>{t('costs.nothingOutstanding')}</div>
      </div>
    )
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {snapshot.flows.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Avatar id={f.fromPersonId} size={32} /><ArrowRight size={15} className="text-content-faint" /><Avatar id={f.toPersonId} size={32} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span className="text-content" style={{ fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 700 }}>{fmt(f.amount)}</span>
              {canMutate && <button onClick={() => { void handleSettleFlow(f.fromPersonId, f.toPersonId, f.amount) }} className="bg-[var(--text-primary)] text-[var(--bg-primary)]" style={{ padding: '7px 12px', borderRadius: 9, fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 600, border: 0, cursor: 'pointer', fontFamily: 'inherit' }}>{t('costs.settle')}</button>}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function MobileBody() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
        <section style={{ background: 'linear-gradient(135deg,#1f2937,#111827)', color: '#fff', borderRadius: 22, padding: '20px 20px 16px', boxShadow: '0 8px 24px -8px rgba(0,0,0,0.28)' }}>
          <div style={{ fontSize: 'calc(11.5px * var(--fs-scale-caption, 1))', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{t('costs.totalSpend')}</div>
          <div style={{ fontSize: 'calc(44px * var(--fs-scale-title, 1))', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 8, display: 'flex', alignItems: 'baseline' }}>{bigMoney(snapshot.totalSpend, 24, 'rgba(255,255,255,0.6)')}</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 'calc(12px * var(--fs-scale-body, 1))', color: 'rgba(255,255,255,0.6)', flexWrap: 'wrap' }}>
            <span>{t('costs.yourShare')} · <b style={{ color: '#fff', fontWeight: 600 }}>{fmt0(snapshot.yourShare)}</b></span>
            <span>{t('costs.youPaid')} · <b style={{ color: '#fff', fontWeight: 600 }}>{fmt0(snapshot.youPaid)}</b></span>
          </div>
          {canEditExpenseRows && (
            <button onClick={() => { setEditingExpense(null); setModalOpen(true) }} style={{ marginTop: 16, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', padding: 13, borderRadius: 14, fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={17} /> {t('costs.addExpense')}
            </button>
          )}
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className={cardCls} style={{ borderRadius: 18, padding: 16 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', marginBottom: 10, background: '#dc262622', color: '#dc2626' }}><ArrowDown size={17} /></div>
            <div className="text-content" style={{ fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 600 }}>{t('costs.youOwe')}</div>
            <div className="text-content-faint" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))' }}>{t('costs.youOweSub')}</div>
            <div style={{ fontSize: 'calc(27px * var(--fs-scale-title, 1))', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 12, display: 'flex', alignItems: 'baseline', color: '#dc2626' }}>{bigMoney(snapshot.youOwe, 16, 'var(--c-ink3)')}</div>
          </div>
          <div className={cardCls} style={{ borderRadius: 18, padding: 16 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', marginBottom: 10, background: '#16a34a22', color: '#16a34a' }}><ArrowUp size={17} /></div>
            <div className="text-content" style={{ fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 600 }}>{t('costs.youreOwed')}</div>
            <div className="text-content-faint" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))' }}>{t('costs.youreOwedSub')}</div>
            <div style={{ fontSize: 'calc(27px * var(--fs-scale-title, 1))', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 12, display: 'flex', alignItems: 'baseline', color: '#16a34a' }}>{bigMoney(snapshot.youAreOwed, 16, 'var(--c-ink3)')}</div>
          </div>
        </div>

        <div className={cardCls} style={{ borderRadius: 18, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#d9770622', color: '#d97706', flexShrink: 0 }}><AlertCircle size={17} /></div>
            <div style={{ minWidth: 0 }}>
              <div className="text-content" style={{ fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 600 }}>{t('costs.outstanding')}</div>
              <div className="text-content-faint" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))' }}>{t('costs.outstandingSub')}</div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 'calc(27px * var(--fs-scale-title, 1))', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, display: 'flex', alignItems: 'baseline', color: '#d97706' }}>{bigMoney(snapshot.outstanding, 16, 'var(--c-ink3)')}</div>
          </div>
        </div>

        <div className={cardCls} style={{ borderRadius: 18, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8 }}>
            <div className="text-content" style={{ fontSize: 'calc(19px * var(--fs-scale-subtitle, 1))', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'baseline', gap: 8 }}>{t('costs.settleUp')} <span className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 500 }}>{snapshot.flows.length}</span></div>
            {canMutate && <button onClick={() => setAddingPayment(true)} className="text-content-muted bg-surface-card border border-edge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 9, fontSize: 'calc(11.5px * var(--fs-scale-caption, 1))', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}><Plus size={13} /> {t('costs.addPayment')}</button>}
          </div>
          <SettleFlows />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div className="text-content" style={{ fontSize: 'calc(19px * var(--fs-scale-subtitle, 1))', fontWeight: 700, letterSpacing: '-0.02em' }}>{t('costs.expenses')}</div>
            <button onClick={handleExportCsv} title={t('budget.exportCsv')} disabled={!expenses.length}
              className="bg-surface-card border border-edge text-content-muted disabled:opacity-40"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
              <Download size={15} />
            </button>
          </div>
          <div className="bg-surface-card border border-edge" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 12, padding: '0 12px', height: 42 }}>
            <Search size={16} className="text-content-faint" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('costs.searchPlaceholder')} className="text-content" style={{ border: 0, background: 'none', outline: 'none', fontSize: 'calc(14px * var(--fs-scale-body, 1))', width: '100%', fontFamily: 'inherit' }} />
          </div>
          <div className="bg-surface-secondary" style={{ display: 'flex', borderRadius: 11, padding: 3, gap: 2 }}>
            {(['all', 'mine', 'owed'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'bg-surface-card text-content' : 'text-content-muted'} style={{ flex: 1, padding: '8px 6px', fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 500, borderRadius: 8, border: 0, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{t('costs.filter.' + f)}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <CustomSelect value={catFilter} onChange={v => setCatFilter(String(v))} options={categoryOptions} size="sm" style={{ flex: 1, minWidth: 0 }} />
            <CustomSelect value={dayFilter} onChange={v => setDayFilter(String(v))} options={dayOptions} size="sm" searchable style={{ flex: 1, minWidth: 0 }} />
          </div>
          {dayBanner}
          {dayGroups.length === 0
            ? <div className="text-content-faint" style={{ textAlign: 'center', padding: '36px 16px', fontSize: 'calc(13px * var(--fs-scale-body, 1))' }}>{search ? t('costs.noMatch') : t('costs.emptyText')}</div>
            : dayGroups.map(g => {
              const dtot = g.entries.reduce((a, en) => en.kind === 'expense' ? a + baseTotal(en.e) : a, 0)
              return (
                <div key={g.day} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!dayFilter && <div className={labelCls} style={{ display: 'flex', alignItems: 'center', padding: '0 2px' }}>{g.day}<span className="text-content-muted" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: 'calc(11.5px * var(--fs-scale-caption, 1))' }}>{t('costs.spent', { amount: fmt(dtot) })}</span></div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{g.entries.map(en => en.kind === 'expense'
                    ? <ExpenseRow key={'e' + en.e.id} e={en.e} />
                    : <SettlementRow key={'s' + en.s.id} s={en.s} />)}</div>
                </div>
              )
            })}
        </div>

        <div className={cardCls} style={{ borderRadius: 18, padding: 16 }}>
          <div className={labelCls} style={{ marginBottom: 14 }}>{t('costs.balances')}</div>
          <BalancesList />
        </div>
        <div className={cardCls} style={{ borderRadius: 18, padding: 16 }}>
          <div className={labelCls} style={{ marginBottom: 14 }}>{t('costs.byCategory')}</div>
          <CategoryBreakdown />
        </div>
      </div>
    )
  }

  function ExpenseRow({ e }: { e: FamilyTripExpense }) {
    const c = catMeta(e.category)
    const Icon = c.Icon
    const cur = e.currencyCode ?? currencyCode
    const payers = e.payers.filter(p => p.amount > 0)
    const myNet = mePersonId ? round2(myPaidOf(e) - myShareOf(e)) : 0
    const unfinished = expenseIsUnfinished(e)
    return (
      <div className="bg-surface-card border border-edge" style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 16, alignItems: 'center', borderRadius: 18, padding: '16px 20px' }}>
        <span style={{ position: 'relative', width: 46, height: 46, borderRadius: 13, display: 'grid', placeItems: 'center', background: c.color + '22', color: c.color }}>
          <Icon size={21} />
          {isMobile && unfinished && (
            <span title={t('costs.unfinishedHint')} style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: '#d97706', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 800, lineHeight: 1, border: '2px solid var(--bg-card)' }}>!</span>
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <span className="text-content" style={{ fontSize: 'calc(15px * var(--fs-scale-subtitle, 1))', fontWeight: 600 }}>{e.name}</span>
            {unfinished && !isMobile && (
              <span title={t('costs.unfinishedHint')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px 2px 6px', borderRadius: 999, background: 'rgba(217,119,6,0.14)', color: '#d97706', fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 700, flexShrink: 0 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#d97706', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 'calc(10px * var(--fs-scale-caption, 1))', fontWeight: 800 }}>!</span>
                {t('costs.unfinished')}
              </span>
            )}
          </div>
          {payers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 5 }}>
              {payers.map(p => (
                <span key={p.personId} className="bg-surface-secondary border border-edge" title={personName(p.personId)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px 3px 3px', borderRadius: 999, fontSize: 'calc(11.5px * var(--fs-scale-caption, 1))' }}>
                  <Avatar id={p.personId} size={18} />
                  <span className="text-content" style={{ fontWeight: 700 }}>{fmt(convert(p.amount, cur))}</span>
                </span>
              ))}
            </div>
          )}
          {!isMobile && (
            <div className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t(c.labelKey)}{cur !== base ? ` · ${fmt(e.totalAmount, cur)} → ${fmt(baseTotal(e))}` : ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'center' }}>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <div className="text-content" style={{ fontSize: 'calc(18px * var(--fs-scale-subtitle, 1))', fontWeight: 600 }}>{fmt(baseTotal(e))}</div>
            {!unfinished && e.shares.length > 0 && Math.abs(myNet) > 0.01 && (
              <div style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', marginTop: 2, fontWeight: 500, whiteSpace: 'nowrap', color: myNet > 0 ? '#16a34a' : '#dc2626' }}>
                {myNet > 0 ? t('costs.youLent', { amount: fmt(myNet) }) : t('costs.youBorrowed', { amount: fmt(-myNet) })}
              </div>
            )}
          </div>
          {canEditExpenseRows && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button title={t('common.edit')} onClick={() => { setEditingExpense(e); setModalOpen(true) }} className="bg-surface-secondary border border-edge text-content-muted" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, cursor: 'pointer' }}><Pencil size={13} /></button>
              <button title={t('common.delete')} onClick={() => { void handleDeleteExpense(e.id) }} className="bg-surface-secondary border border-edge" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, cursor: 'pointer', color: '#dc2626' }}><Trash2 size={13} /></button>
            </div>
          )}
        </div>
      </div>
    )
  }

  function SettlementRow({ s }: { s: FamilyTripExpenseSettlement }) {
    const cur = (s.currencyCode || base).toUpperCase()
    return (
      <div className="bg-surface-card border border-edge" style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 16, alignItems: 'center', borderRadius: 18, padding: '16px 20px' }}>
        <span style={{ width: 46, height: 46, borderRadius: 13, display: 'grid', placeItems: 'center', background: 'rgba(22,163,74,0.12)', color: '#16a34a' }}><ArrowLeftRight size={21} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="text-content" style={{ fontSize: 'calc(15px * var(--fs-scale-subtitle, 1))', fontWeight: 600, marginBottom: 6 }}>
            {t('costs.payment')}
            {cur !== base && <span className="text-content-faint" style={{ fontWeight: 400, fontSize: 'calc(12px * var(--fs-scale-body, 1))' }}> · {fmt(s.amount, cur)} → {fmt(convert(s.amount, cur))}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <Avatar id={s.fromPersonId} size={20} /><ArrowRight size={13} className="text-content-faint" /><Avatar id={s.toPersonId} size={20} />
            <span className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{personName(s.fromPersonId)} → {personName(s.toPersonId)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'center' }}>
          <div className="text-content" style={{ fontSize: 'calc(18px * var(--fs-scale-subtitle, 1))', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(convert(s.amount, cur))}</div>
          {canMutate && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button title={t('common.edit')} onClick={() => setEditingSettlement(s)} className="bg-surface-secondary border border-edge text-content-muted" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, cursor: 'pointer' }}><Pencil size={13} /></button>
              <button title={t('costs.undo')} onClick={() => { void handleUndoSettlement(s.id) }} className="bg-surface-secondary border border-edge" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, cursor: 'pointer', color: '#dc2626' }}><RotateCcw size={13} /></button>
            </div>
          )}
        </div>
      </div>
    )
  }

  function BalancesList() {
    const rows = travelers.map(tr => {
      const b = snapshot.balances.find(b => b.personId === tr.personId)
      return { personId: tr.personId, displayName: tr.displayName, balance: b?.balance ?? 0 }
    })
    const max = Math.max(1, ...rows.map(r => Math.abs(r.balance)))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map(r => {
          const pct = Math.min(100, Math.abs(r.balance) / max * 100)
          const pos = r.balance > 0.01, neg = r.balance < -0.01
          return (
            <div key={r.personId} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center' }}>
              <Avatar id={r.personId} size={28} />
              <div>
                <div className="text-content" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600 }}>{personName(r.personId)}</div>
                <div className="bg-surface-secondary" style={{ height: 5, borderRadius: 3, marginTop: 5, position: 'relative', overflow: 'hidden' }}>
                  <span style={{ position: 'absolute', left: '50%', top: -1, bottom: -1, width: 1, background: 'var(--border-primary)' }} />
                  {pos && <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: pct / 2 + '%', background: '#16a34a', borderRadius: 3 }} />}
                  {neg && <span style={{ position: 'absolute', right: '50%', top: 0, bottom: 0, width: pct / 2 + '%', background: '#dc2626', borderRadius: 3 }} />}
                </div>
              </div>
              <div style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600, textAlign: 'right', color: pos ? '#16a34a' : neg ? '#dc2626' : 'var(--text-faint)' }}>
                {pos ? '+' + fmt(r.balance) : neg ? '−' + fmt(-r.balance) : fmt(0)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function CategoryBreakdown() {
    const tot: Record<string, number> = {}
    for (const e of expenses) { const k = catMeta(e.category).key; tot[k] = (tot[k] || 0) + baseTotal(e) }
    const rows = COST_CATEGORY_LIST.filter(c => (tot[c.key] || 0) > 0).sort((a, b) => (tot[b.key] || 0) - (tot[a.key] || 0))
    if (rows.length === 0) return <div className="text-content-faint" style={{ fontSize: 'calc(12.5px * var(--fs-scale-body, 1))' }}>{t('costs.noCategories')}</div>
    const maxCat = Math.max(0, ...rows.map(c => tot[c.key] || 0))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map(c => {
          const v = tot[c.key]; const pct = maxCat ? v / maxCat * 100 : 0
          return (
            <div key={c.key} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
              <span className="text-content" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500 }}>{t(c.labelKey)}</span>
              <span className="text-content-muted" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600 }}>{fmt0(v)}</span>
              <div className="bg-surface-secondary" style={{ gridColumn: '1 / -1', height: 5, borderRadius: 3, overflow: 'hidden', marginTop: -2 }}>
                <span style={{ display: 'block', height: '100%', width: pct + '%', background: c.color, borderRadius: 3 }} />
              </div>
            </div>
          )
        })}
      </div>
    )
  }
}

// ── Pure shared sub-components ────────────────────────────────────────────────

function SummaryCard({ label, sub, amount, currency, locale, icon, foot, tone }: {
  label: string; sub: string; amount: number; currency: string; locale: string
  icon: React.ReactNode; foot: React.ReactNode; tone: 'owe' | 'owed' | 'total' | 'unfinished'
}) {
  const total = tone === 'total'
  const accent = tone === 'owe' ? '#dc2626' : tone === 'owed' ? '#16a34a' : tone === 'unfinished' ? '#d97706' : undefined
  const muted = total ? 'rgba(255,255,255,0.55)' : 'var(--text-faint)'
  let parts: Intl.NumberFormatPart[] | null = null
  try {
    const d = currencyDecimals(currency)
    parts = new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency: (currency || 'EUR').toUpperCase(), minimumFractionDigits: d, maximumFractionDigits: d }).formatToParts(amount || 0)
  } catch { parts = null }
  const big = (p: Intl.NumberFormatPart) => p.type === 'integer' || p.type === 'group' || p.type === 'minusSign'
  return (
    <div className={total ? '' : 'bg-surface-card border border-edge'}
      style={{ borderRadius: 22, padding: '26px 28px', position: 'relative', overflow: 'hidden', ...(total ? { background: 'linear-gradient(135deg,#1f2937,#111827)', color: '#fff' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: total ? 'rgba(255,255,255,0.12)' : (accent + '22'), color: total ? '#fff' : accent }}>{icon}</span>
        <div>
          <div style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600 }} className={total ? '' : 'text-content'}>{label}</div>
          <div style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', opacity: total ? 0.6 : 1 }} className={total ? '' : 'text-content-faint'}>{sub}</div>
        </div>
      </div>
      <div style={{ fontSize: 'calc(46px * var(--fs-scale-title, 1))', fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1, marginTop: 20, display: 'flex', alignItems: 'baseline', color: total ? '#fff' : accent }}>
        {parts
          ? parts.map((p, i) => <span key={i} style={big(p) ? undefined : { fontSize: 'calc(26px * var(--fs-scale-title, 1))', fontWeight: 500, color: muted }}>{p.value}</span>)
          : <span>{formatMoney(amount, currency, locale)}</span>}
      </div>
      <div style={{ marginTop: 16, fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', opacity: total ? 0.85 : 1 }}>{foot}</div>
    </div>
  )
}

function FlowPills({ ids, lead, Avatar, name }: {
  ids: string[]
  lead: string
  Avatar: (p: { id: string; size?: number }) => React.JSX.Element
  name: (id: string) => string
}) {
  const uniq = Array.from(new Set(ids))
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="text-content-faint">{lead}</span>
      {uniq.map(id => (
        <span key={id} className="bg-surface-secondary border border-edge text-content" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px 3px 3px', borderRadius: 999, fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 600 }}>
          <Avatar id={id} size={18} />{name(id)}
        </span>
      ))}
    </span>
  )
}

// ── Family Settlement Modal ───────────────────────────────────────────────────

function FamilySettlementModal({ tripId, tripCurrency, base, rates, people, mePersonId, editing, onClose, onSaved }: {
  tripId: string; tripCurrency: string; base: string; rates: Record<string, number> | null
  people: FamilyTripTraveler[]; mePersonId: string | null; editing: FamilyTripExpenseSettlement | null
  onClose: () => void; onSaved: () => Promise<void>
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const otherDefault = people.find(p => p.personId !== mePersonId)?.personId ?? (people[0]?.personId ?? '')
  const [fromId, setFromId] = useState(editing?.fromPersonId ?? mePersonId ?? otherDefault)
  const [toId, setToId] = useState(editing?.toPersonId ?? otherDefault)
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [cur, setCur] = useState((editing?.currencyCode || base).toUpperCase())
  const [saving, setSaving] = useState(false)

  const amt = parseFloat(amount) || 0
  const valid = amt > 0 && fromId !== toId
  const opts = people.map(p => ({ value: p.personId, label: p.personId === mePersonId ? t('costs.you') : p.displayName }))
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-content-faint mb-[6px]'

  const save = async () => {
    if (!valid) return
    setSaving(true)
    try {
      await upsertTripExpenseSettlement({ tripId, draft: { id: editing?.id, fromPersonId: fromId, toPersonId: toId, amount: amt, currencyCode: cur }, tripCurrency, rates, createdByPersonId: mePersonId })
      await onSaved()
    } catch { toast.error(t('common.unknownError')) } finally { setSaving(false) }
  }

  return (
    <Modal isOpen onClose={onClose} title={editing ? t('costs.editPayment') : t('costs.addPayment')} size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} className="text-content-muted border border-edge" style={{ padding: '8px 16px', borderRadius: 10, background: 'none', fontSize: 'calc(13px * var(--fs-scale-body, 1))', cursor: 'pointer', fontFamily: 'inherit' }}>{t('common.cancel')}</button>
          <button onClick={() => { void save() }} disabled={!valid || saving} className="bg-[var(--text-primary)] text-[var(--bg-primary)]" style={{ padding: '8px 20px', borderRadius: 10, border: 0, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: !valid || saving ? 0.5 : 1 }}>{editing ? t('common.save') : t('costs.addPayment')}</button>
        </div>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label className={labelCls}>{t('costs.from')}</label><CustomSelect value={fromId} onChange={v => setFromId(String(v))} options={opts} style={{ width: '100%' }} /></div>
        <div><label className={labelCls}>{t('costs.to')}</label><CustomSelect value={toId} onChange={v => setToId(String(v))} options={opts} style={{ width: '100%' }} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <label className={labelCls}>{t('costs.amount')}</label>
            <div className="bg-surface-input border border-edge" style={{ height: FIELD_H, boxSizing: 'border-box', display: 'flex', alignItems: 'center', borderRadius: 10, padding: '0 12px' }}>
              <span className="text-content-faint" style={{ fontSize: 'calc(14px * var(--fs-scale-body, 1))' }}>{SYMBOLS[cur] || (cur + ' ')}</span>
              <input type="text" inputMode="decimal" placeholder="0.00" value={amount}
                onChange={e => setAmount(e.target.value.replace(',', '.'))}
                className="text-content" style={{ flex: 1, border: 0, background: 'none', outline: 'none', fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 600, paddingLeft: 6, width: '100%' }} />
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <label className={labelCls}>{t('costs.currency')}</label>
            <CustomSelect value={cur} onChange={v => setCur(String(v))} searchable
              options={currenciesWith(cur).map(c => ({ value: c, label: SYMBOLS[c] ? `${c}  ${SYMBOLS[c]}` : c }))}
              style={{ width: '100%' }} />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Family Expense Modal ──────────────────────────────────────────────────────

function FamilyExpenseModal({ tripId, tripCurrency, base, rates, people, mePersonId, editing, prefill, onClose, onSaved, onStageExpense }: {
  tripId: string; tripCurrency: string; base: string; rates: Record<string, number> | null
  people: FamilyTripTraveler[]; mePersonId: string | null; editing: FamilyTripExpense | null
  prefill?: FamilyExpensePrefill | null
  onClose: () => void; onSaved: () => Promise<void>
  onStageExpense?: (draft: TripExpenseDraft) => Promise<boolean>
}) {
  const { t, locale } = useTranslation()
  const toast = useToast()
  const { convert } = useExchangeRates(base)
  const sym = (c: string) => SYMBOLS[c] || (c + ' ')

  const [name, setName] = useState(editing?.name || prefill?.name || '')
  const [cat, setCat] = useState<CostCategory>(editing ? (editing.category as CostCategory) : (prefill?.category ?? 'food'))
  const [currency, setCurrency] = useState((editing?.currencyCode || base).toUpperCase())
  const [day, setDay] = useState(editing?.expenseDate || new Date().toISOString().slice(0, 10))
  const [total, setTotal] = useState<string>(editing?.totalAmount ? String(editing.totalAmount) : '')
  const [participants, setParticipants] = useState<Set<string>>(() =>
    editing ? new Set(editing.shares.map(s => s.personId)) : new Set(people.map(p => p.personId)))
  const [payerId, setPayerId] = useState<string>(() => {
    const existing = editing?.payers.find(p => p.amount > 0)
    if (existing) return existing.personId
    return editing ? '' : (mePersonId ?? (people[0]?.personId ?? ''))
  })
  const [splitMode, setSplitMode] = useState<'equally' | 'custom' | 'ticket'>(() => {
    if (editing?.ticketLines && editing.ticketLines.length > 0) return 'ticket'
    if (editing && editing.shares.some(s => s.amount != null)) return 'custom'
    return 'equally'
  })
  const [ticketItems, setTicketItems] = useState<FamilyTicketItem[]>(() => {
    if (editing?.ticketLines && editing.ticketLines.length > 0) {
      return editing.ticketLines.map((line, i) => ({
        id: line.id ?? `ticket-${i}`,
        name: line.name,
        price: String(line.price),
        participants: new Set(line.personIds),
      }))
    }
    return []
  })
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    if (editing) for (const s of editing.shares) { if (s.amount != null) m[s.personId] = String(s.amount) }
    return m
  })
  const [saving, setSaving] = useState(false)

  const isTicketMode = splitMode === 'ticket'

  const ticketLinesForCalc: CostTicketLine[] = useMemo(() =>
    ticketItems.map(item => ({
      id: item.id,
      name: item.name,
      price: parseFloat(item.price) || 0,
      personIds: [...item.participants],
    })), [ticketItems])

  const ticketInfo = useMemo(() => calculateTicketShares(ticketLinesForCalc), [ticketLinesForCalc])

  const totalNum = isTicketMode ? ticketInfo.total : (parseFloat(total) || 0)
  const splitSum = [...participants].reduce((sum, id) => sum + (parseFloat(customAmounts[id] || '0') || 0), 0)
  const customBalanced = Math.round(splitSum * 100) === Math.round(totalNum * 100)
  const equalShares = useMemo(() => splitEqualShares(totalNum, [...participants], editing?.id ?? 'new'), [totalNum, participants, editing])

  const ticketValid = ticketItems.length > 0
    && ticketItems.every(item => item.name.trim().length > 0 && (parseFloat(item.price) || 0) > 0 && item.participants.size > 0)
  const valid = name.trim().length > 0 && (
    isTicketMode
      ? ticketValid
      : totalNum > 0 && (participants.size === 0 || splitMode === 'equally' || customBalanced)
  )

  const inputCls = 'w-full bg-surface-input border border-edge text-content'
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-content-faint mb-[6px]'

  const placeholderShares = useMemo(() => {
    const empty = [...participants].filter(id => !customAmounts[id])
    if (empty.length === 0) return {} as Record<string, number>
    const entered = [...participants].filter(id => customAmounts[id]).reduce((s, id) => s + (parseFloat(customAmounts[id]) || 0), 0)
    const remaining = Math.max(0, totalNum - entered)
    return splitEqualShares(remaining, empty, editing?.id ?? 'new')
  }, [totalNum, participants, customAmounts, editing])

  const handleAddEmptyItem = () => {
    setTicketItems(prev => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        name: '',
        price: '',
        participants: new Set(people.map(p => p.personId)),
      },
    ])
  }

  const handleUpdateItemName = (id: string, nextName: string) => {
    setTicketItems(prev => prev.map(item => item.id === id ? { ...item, name: nextName } : item))
  }

  const handleUpdateItemPrice = (id: string, price: string) => {
    const next = price.replace(',', '.')
    if (/^\d*\.?\d{0,2}$/.test(next) || next === '') {
      setTicketItems(prev => prev.map(item => item.id === id ? { ...item, price: next } : item))
    }
  }

  const handleRemoveItem = (id: string) => {
    setTicketItems(prev => prev.filter(item => item.id !== id))
  }

  const handleToggleItemParticipant = (itemId: string, personId: string) => {
    setTicketItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      const nextParts = new Set(item.participants)
      if (nextParts.has(personId)) nextParts.delete(personId)
      else nextParts.add(personId)
      return { ...item, participants: nextParts }
    }))
  }

  const save = async () => {
    if (!valid) return
    setSaving(true)
    const ticketLines: CostTicketLine[] = isTicketMode
      ? ticketItems.map(item => ({
          id: item.id,
          name: item.name.trim(),
          price: parseFloat(item.price) || 0,
          personIds: [...item.participants],
        }))
      : []
    const participantIds = isTicketMode
      ? [...new Set(ticketLines.flatMap(l => l.personIds))]
      : [...participants]
    const draft: TripExpenseDraft = {
      id: editing?.id ?? null,
      name: name.trim(),
      category: cat,
      totalAmount: totalNum,
      currencyCode: currency,
      expenseDate: day || null,
      note: '',
      reservationId: editing?.reservationId ?? prefill?.reservationId ?? null,
      payerPersonId: payerId || null,
      participantIds,
      splitMode,
      customAmounts: Object.fromEntries(Object.entries(customAmounts).map(([k, v]) => [k, parseFloat(v) || 0])),
      ticketLines,
    }
    try {
      if (onStageExpense) {
        if (expenseDraftHasBlockingUnstagedFields(draft)) {
          toast.error(t('trip.governance.expenseBlocked'))
          return
        }
        toast.info(t('trip.governance.expenseUnstaged'))
        const ok = await onStageExpense(draft)
        if (ok) await onSaved()
        return
      }
      await upsertTripExpense({ tripId, draft, tripCurrency, rates, createdByPersonId: mePersonId })
      await onSaved()
    } catch { toast.error(t('common.unknownError')) } finally { setSaving(false) }
  }

  return (
    <Modal isOpen onClose={onClose} title={editing ? t('costs.editExpense') : t('costs.addExpense')} size="2xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} className="text-content-muted border border-edge" style={{ padding: '8px 16px', borderRadius: 10, background: 'none', fontSize: 'calc(13px * var(--fs-scale-body, 1))', cursor: 'pointer', fontFamily: 'inherit' }}>{t('common.cancel')}</button>
          <button onClick={() => { void save() }} disabled={!valid || saving} className="bg-[var(--text-primary)] text-[var(--bg-primary)]" style={{ padding: '8px 20px', borderRadius: 10, border: 0, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: !valid || saving ? 0.5 : 1 }}>{editing ? t('common.save') : t('costs.addExpense')}</button>
        </div>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className={labelCls}>{t('costs.whatFor')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('costs.namePlaceholder')} className={inputCls} style={{ borderRadius: 10, padding: '11px 13px', fontSize: 'calc(14px * var(--fs-scale-body, 1))', outline: 'none' }} />
        </div>

        <div>
          <label className={labelCls}>{t('costs.totalAmount')}</label>
          <div className="bg-surface-input border border-edge" style={{ height: FIELD_H, boxSizing: 'border-box', display: 'flex', alignItems: 'center', borderRadius: 10, padding: '0 12px', opacity: isTicketMode ? 0.6 : 1 }}>
            <span className="text-content-faint" style={{ fontSize: 'calc(15px * var(--fs-scale-subtitle, 1))' }}>{sym(currency)}</span>
            <NumericInput mode="decimal" placeholder="0.00" value={isTicketMode ? ticketInfo.total.toFixed(2) : total}
              onValueChange={v => setTotal(v.replace(',', '.'))}
              disabled={isTicketMode}
              className="text-content" style={{ flex: 1, border: 0, background: 'none', outline: 'none', fontSize: 'calc(15px * var(--fs-scale-subtitle, 1))', fontWeight: 600, paddingLeft: 6, width: '100%' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <label className={labelCls}>{t('costs.currency')}</label>
            <CustomSelect value={currency} onChange={v => setCurrency(String(v))} searchable
              options={currenciesWith(currency).map(c => ({ value: c, label: SYMBOLS[c] ? `${c}  ${SYMBOLS[c]}` : c }))}
              style={{ width: '100%' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <label className={labelCls}>{t('costs.day')}</label>
            <CustomDatePicker value={day} onChange={setDay} style={{ width: '100%' }} />
          </div>
        </div>

        {currency !== base && totalNum > 0 && (
          <div className="bg-surface-secondary border border-edge text-content-muted" style={{ borderRadius: 10, padding: '10px 12px', fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{formatMoney(totalNum, currency, locale)}</span>
            <span className="text-content-faint">≈</span>
            <span className="text-content" style={{ fontWeight: 600 }}>{formatMoney(convert(totalNum, currency), base, locale)}</span>
            <span className="text-content-faint">· {t('costs.liveRate')}</span>
          </div>
        )}

        <div>
          <label className={labelCls}>{t('costs.category')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {COST_CATEGORY_LIST.map(c => {
              const Icon = c.Icon; const on = cat === c.key
              return (
                <button key={c.key} onClick={() => setCat(c.key as CostCategory)}
                  className={on ? 'bg-surface-card text-content border' : 'bg-surface-secondary text-content-muted border border-edge'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px 6px 7px', borderRadius: 999, fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', borderColor: on ? 'var(--text-primary)' : undefined }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center', background: c.color + '22', color: c.color }}><Icon size={12} /></span>
                  {t(c.labelKey)}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className={labelCls}>{t('costs.whoPaid')}</label>
          <CustomSelect value={payerId} onChange={v => setPayerId(String(v))}
            options={[
              { value: '', label: t('costs.noOnePaid') || 'Nobody (planning entry)' },
              ...people.map(p => ({ value: p.personId, label: p.personId === mePersonId ? t('costs.you') : p.displayName })),
            ]}
            style={{ width: '100%' }} />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label className={labelCls}>{t('costs.split') || 'Split'}</label>
            <div className="bg-surface-secondary" style={{ display: 'flex', borderRadius: 8, padding: 2 }}>
              <button type="button" onClick={() => setSplitMode('equally')}
                className={splitMode === 'equally' ? 'bg-surface-card text-content' : 'text-content-muted'}
                style={{ padding: '4px 10px', fontSize: 11.5, borderRadius: 6, fontWeight: 600, border: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                {t('costs.splitEqually') || 'Equally'}
              </button>
              <button type="button" onClick={() => setSplitMode('custom')}
                className={splitMode === 'custom' ? 'bg-surface-card text-content' : 'text-content-muted'}
                style={{ padding: '4px 10px', fontSize: 11.5, borderRadius: 6, fontWeight: 600, border: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                {t('costs.splitCustom') || 'Custom'}
              </button>
              <button type="button" onClick={() => setSplitMode('ticket')}
                className={splitMode === 'ticket' ? 'bg-surface-card text-content' : 'text-content-muted'}
                style={{ padding: '4px 10px', fontSize: 11.5, borderRadius: 6, fontWeight: 600, border: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                {t('costs.splitTicket') || 'Ticket'}
              </button>
            </div>
          </div>

          {splitMode === 'ticket' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ticketItems.map(item => (
                  <div key={item.id} className="bg-surface-secondary border border-edge" style={{ padding: 10, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px auto', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Item name"
                        value={item.name}
                        onChange={e => handleUpdateItemName(item.id, e.target.value)}
                        className="bg-surface-input border border-edge text-content"
                        style={{ minWidth: 0, padding: '6px 10px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border-color)', outline: 'none' }}
                      />
                      <div className="bg-surface-input border border-edge" style={{ display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 8 }}>
                        <span className="text-content-faint" style={{ fontSize: 12 }}>{sym(currency)}</span>
                        <NumericInput
                          mode="decimal"
                          placeholder="0.00"
                          value={item.price}
                          onValueChange={v => handleUpdateItemPrice(item.id, v)}
                          className="text-content"
                          style={{ width: '100%', border: 0, background: 'none', outline: 'none', fontSize: 13, fontWeight: 600, textAlign: 'right', padding: '6px 0' }}
                        />
                      </div>
                      <button type="button" onClick={() => handleRemoveItem(item.id)} className="text-content-muted" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 4 }}>
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                      <span className="text-content-faint" style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', marginRight: 4 }}>Splitting:</span>
                      {people.map((p, pIdx) => {
                        const active = item.participants.has(p.personId)
                        return (
                          <button
                            type="button"
                            key={p.personId}
                            onClick={() => handleToggleItemParticipant(item.id, p.personId)}
                            className={active ? 'bg-surface-card text-content border' : 'bg-surface-secondary text-content-muted border border-edge'}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid var(--text-primary)' : undefined }}
                          >
                            <span style={{ width: 14, height: 14, borderRadius: '50%', background: personColor(p, pIdx), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 7, fontWeight: 700 }}>
                              {(p.personId === mePersonId ? t('costs.youShort') : p.displayName.charAt(0)).toUpperCase()}
                            </span>
                            <span>{p.personId === mePersonId ? t('costs.you') : p.displayName}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={handleAddEmptyItem} className="border border-dashed border-edge text-content-muted" style={{ padding: '8px 12px', borderRadius: 10, background: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Plus size={14} /> Add item
              </button>

              {ticketItems.length > 0 && (
                <div className="bg-surface-secondary border border-edge" style={{ padding: 12, borderRadius: 10 }}>
                  <div className="text-content" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Individual Shares Summary</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {people.map(p => {
                      const share = ticketInfo.shares[p.personId] || 0
                      return (
                        <div key={p.personId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span className="text-content-muted">{p.personId === mePersonId ? t('costs.you') : p.displayName}</span>
                          <span className="text-content" style={{ fontWeight: 600 }}>{sym(currency)}{share.toFixed(2)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {people.map((p, idx) => {
                  const on = participants.has(p.personId)
                  const toggleParticipant = () => {
                    const next = new Set(participants)
                    if (next.has(p.personId)) { next.delete(p.personId); setCustomAmounts(prev => { const copy = { ...prev }; delete copy[p.personId]; return copy }) }
                    else next.add(p.personId)
                    setParticipants(next)
                  }
                  return (
                    <div key={p.personId} className="bg-surface-secondary border border-edge" style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10, alignItems: 'center', padding: '8px 11px', borderRadius: 10, opacity: on ? 1 : 0.5 }}>
                      <button type="button" onClick={toggleParticipant} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', padding: 0, minWidth: 0, textAlign: 'left' }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: personColor(p, idx), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0, opacity: on ? 1 : 0.45 }}>
                          {(p.personId === mePersonId ? t('costs.youShort') : p.displayName.charAt(0)).toUpperCase()}
                        </span>
                        <span className="text-content" style={{ fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.personId === mePersonId ? t('costs.you') : p.displayName}
                        </span>
                      </button>
                      {splitMode === 'equally'
                        ? on
                          ? <span className="text-content" style={{ fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 600, textAlign: 'right', paddingRight: 10 }}>{sym(currency)}{(equalShares[p.personId] || 0).toFixed(2)}</span>
                          : <span className="text-content-faint" style={{ fontSize: 12, textAlign: 'right', paddingRight: 10 }}>Excluded</span>
                        : on
                          ? <div className="bg-surface-input border border-edge" style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 8, padding: '0 10px' }}>
                              <span className="text-content-faint" style={{ fontSize: 13 }}>{sym(currency)}</span>
                              <input type="text" inputMode="decimal"
                                placeholder={(placeholderShares[p.personId] || 0).toFixed(2)}
                                value={customAmounts[p.personId] || ''}
                                onChange={e => setCustomAmounts(prev => ({ ...prev, [p.personId]: e.target.value.replace(',', '.') }))}
                                className="text-content" style={{ width: '100%', border: 0, background: 'none', outline: 'none', fontSize: 14, fontWeight: 600, padding: '8px 0', textAlign: 'right' }} />
                            </div>
                          : <button type="button" onClick={toggleParticipant} className="text-content-faint" style={{ background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, textAlign: 'right' }}>{t('costs.tapToInclude')}</button>
                      }
                    </div>
                  )
                })}
              </div>
              {splitMode === 'custom' && (
                <div style={{ marginTop: 10, fontSize: 12.5, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, color: customBalanced ? '#16a34a' : '#dc2626' }}>
                    {customBalanced ? 'Split matches total' : `Sum: ${sym(currency)}${splitSum.toFixed(2)} of ${sym(currency)}${totalNum.toFixed(2)}`}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

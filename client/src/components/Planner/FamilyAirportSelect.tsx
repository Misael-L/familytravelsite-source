import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { Plane, X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { searchAirports, type FamilyAirportSearchRow } from '../../data/supabase/airports'

export type FamilyAirportPick = {
  id: string | null
  name: string
  iataCode: string
  latitude: number | null
  longitude: number | null
}

function formatLabel(a: FamilyAirportPick): string {
  return a.iataCode ? `${a.name} (${a.iataCode})` : a.name
}

export default function FamilyAirportSelect({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: FamilyAirportPick | null
  onChange: (airport: FamilyAirportPick | null) => void
  placeholder?: string
  style?: CSSProperties
}): ReactElement {
  const { t } = useTranslation()
  const [query, setQuery] = useState(value ? formatLabel(value) : '')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<FamilyAirportSearchRow[]>([])
  const [highlight, setHighlight] = useState(-1)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setQuery(value ? formatLabel(value) : '')
  }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed.length < 2 || (value && trimmed === formatLabel(value))) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      void searchAirports(trimmed)
        .then(rows => {
          setResults(rows)
          setHighlight(-1)
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 220)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, value])

  const pick = (a: FamilyAirportSearchRow) => {
    onChange({
      id: a.id,
      name: a.name,
      iataCode: a.iataCode,
      latitude: a.latitude,
      longitude: a.longitude,
    })
    setQuery(formatLabel({ id: a.id, name: a.name, iataCode: a.iataCode, latitude: a.latitude, longitude: a.longitude }))
    setOpen(false)
    setResults([])
  }

  const clear = () => {
    onChange(null)
    setQuery('')
    setResults([])
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); pick(results[highlight]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <div className="bg-surface-tertiary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border-primary)' }}>
        <Plane size={14} className="text-content-faint" style={{ flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          placeholder={placeholder ?? t('airport.searchPlaceholder')}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(null) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="bg-transparent text-content"
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 'calc(13px * var(--fs-scale-body, 1))' }}
        />
        {value && (
          <button type="button" onClick={clear} className="bg-transparent text-content-faint" style={{ border: 'none', padding: 2, cursor: 'pointer', display: 'flex' }} aria-label={t('common.delete')}>
            <X size={14} />
          </button>
        )}
      </div>

      {open && (loading || results.length > 0) && (
        <div className="bg-surface-card" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, border: '1px solid var(--border-primary)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 260, overflowY: 'auto', zIndex: 1000 }}>
          {loading && results.length === 0 && (
            <div className="text-content-faint" style={{ padding: 10, fontSize: 'calc(12px * var(--fs-scale-body, 1))' }}>{t('common.loading')}</div>
          )}
          {results.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => pick(a)}
              onMouseEnter={() => setHighlight(i)}
              className={`text-content ${i === highlight ? 'bg-surface-hover' : 'bg-transparent'}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <span className="text-content-muted" style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 700, minWidth: 32 }}>{a.iataCode}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { Search, X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import {
  FAMILY_LIST_CATALOG_KINDS,
  searchCatalogForList,
  type CatalogListHit,
  type FamilyListCatalogKind,
} from '../../data/supabase/familyLists'

const KIND_LABEL_KEY: Record<FamilyListCatalogKind, string> = {
  place: 'trip.explore.kind.places',
  experience: 'trip.explore.kind.experiences',
  food: 'trip.explore.kind.foods',
  hotel: 'trip.explore.kind.hotels',
}

type FamilyCatalogListItemPickerProps = {
  open: boolean
  excludeByKind: Partial<Record<FamilyListCatalogKind, string[]>>
  onClose: () => void
  onPick: (kind: FamilyListCatalogKind, entityId: string) => Promise<void> | void
}

export default function FamilyCatalogListItemPicker({
  open,
  excludeByKind,
  onClose,
  onPick,
}: FamilyCatalogListItemPickerProps): React.ReactElement | null {
  const { t } = useTranslation()
  const [kind, setKind] = useState<FamilyListCatalogKind>('place')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<CatalogListHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickingId, setPickingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setKind('place')
      setQuery('')
      setHits([])
      setError(null)
      setPickingId(null)
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      const q = query.trim()
      if (q.length < 2) {
        setHits([])
        setLoading(false)
        setError(null)
        return
      }
      setLoading(true)
      searchCatalogForList({
        kind,
        query: q,
        excludeIds: excludeByKind[kind] ?? [],
        limit: 80,
      })
        .then(rows => {
          if (cancelled) return
          setHits(rows)
          setError(null)
        })
        .catch(() => {
          if (!cancelled) {
            setHits([])
            setError(t('common.error'))
          }
        })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [open, query, kind, excludeByKind, t])

  if (!open) return null

  const hint = query.trim().length < 2 ? t('collections.addPlaceHint') : null

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 trek-backdrop-enter bg-[rgba(15,23,42,0.5)]"
      style={{ paddingBottom: 'var(--bottom-nav-h)' }}
      onClick={onClose}
    >
      <div
        className="trek-modal-enter rounded-2xl shadow-2xl w-full max-w-md bg-surface-card"
        style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-edge-faint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
          <span className="text-content" style={{ fontWeight: 600, fontSize: 'calc(14px * var(--fs-scale-body, 1))' }}>
            {t('collections.addPlace')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="bg-surface-tertiary text-content"
            aria-label={t('common.close')}
            style={{ border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3" role="tablist" aria-label={t('trip.explore.kinds')}>
          {FAMILY_LIST_CATALOG_KINDS.map(k => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`px-2.5 py-1 rounded-lg text-[12px] font-medium ${kind === k ? 'bg-accent text-accent-text' : 'text-content-secondary hover:bg-surface-hover'}`}
            >
              {t(KIND_LABEL_KEY[k])}
            </button>
          ))}
        </div>

        <div style={{ padding: '12px 16px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} strokeWidth={1.8} color="var(--text-faint)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('collections.addPlaceSearch')}
              className="bg-surface-tertiary text-content"
              style={{
                width: '100%', padding: '8px 12px 8px 30px', borderRadius: 10,
                border: 'none', fontSize: 'calc(13px * var(--fs-scale-body, 1))',
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 160, padding: '0 8px 12px' }}>
          {loading && (
            <div className="text-content-faint" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>{t('common.loading')}</div>
          )}
          {!loading && error && (
            <div className="text-content-faint" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>{error}</div>
          )}
          {!loading && !error && hint && (
            <div className="text-content-faint" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>{hint}</div>
          )}
          {!loading && !error && !hint && hits.length === 0 && (
            <div className="text-content-faint" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>{t('places.noneFound')}</div>
          )}
          {!loading && !error && hits.map(hit => (
            <button
              key={hit.id}
              type="button"
              disabled={pickingId != null}
              onClick={async () => {
                setPickingId(hit.id)
                try {
                  await onPick(kind, hit.id)
                } finally {
                  setPickingId(null)
                }
              }}
              className="text-content"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 12px', border: 'none', borderRadius: 10,
                background: pickingId === hit.id ? 'var(--bg-hover)' : 'transparent',
                cursor: pickingId ? 'wait' : 'pointer', fontFamily: 'inherit',
                fontSize: 'calc(13px * var(--fs-scale-body, 1))', textAlign: 'left',
              }}
              onMouseEnter={e => { if (!pickingId) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = pickingId === hit.id ? 'var(--bg-hover)' : 'transparent' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hit.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

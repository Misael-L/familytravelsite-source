import React, { useEffect } from 'react'
import ReactDOM from 'react-dom'
import { Check, MapPin, X } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import { getCategoryIcon } from '../../shared/categoryIcons'
import type { FamilyPlaceCategory } from '../../../data/supabase/familyPlaceCategories'

type FamilyPlaceCategoryPickerProps = {
  open: boolean
  categories: FamilyPlaceCategory[]
  selectedCategoryId: string | null
  placeName: string
  onSelect: (categoryId: string | null) => void
  onClose: () => void
}

export default function FamilyPlaceCategoryPicker({
  open,
  categories,
  selectedCategoryId,
  placeName,
  onSelect,
  onClose,
}: FamilyPlaceCategoryPickerProps): React.ReactElement | null {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const panel = (
    <div
      className="bg-[rgba(0,0,0,0.3)]"
      style={{ position: 'fixed', inset: 0, zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="family-place-category-picker-title"
        className="bg-surface-elevated"
        style={{
          width: 'min(420px, 100%)',
          maxHeight: '80vh',
          borderRadius: 16,
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border-faint)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="family-place-category-picker-title" className="text-content" style={{ fontWeight: 600, fontSize: 'calc(14px * var(--fs-scale-body, 1))' }}>
              {t('places.formCategory')}
            </div>
            <div className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-caption, 1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {placeName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="bg-surface-tertiary text-content"
            style={{ border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={14} />
          </button>
        </div>

        <div role="listbox" aria-label={t('places.formCategory')} style={{ overflowY: 'auto', padding: 8 }}>
          {categories.length === 0 && (
            <div className="text-content-faint" style={{ padding: '16px 12px', fontSize: 'calc(13px * var(--fs-scale-body, 1))' }}>
              {t('places.categoryEmptyPalette')}
            </div>
          )}
          {categories.map(category => {
            const active = selectedCategoryId === category.id
            const Icon = getCategoryIcon(category.iconKey)
            return (
              <button
                key={category.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(category.id)}
                className={`text-content ${active ? 'bg-surface-hover' : 'bg-transparent'}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 'calc(13px * var(--fs-scale-body, 1))', textAlign: 'left',
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: category.colorHex || 'var(--bg-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={14} strokeWidth={2} color="#fff" />
                </span>
                <span style={{ flex: 1 }}>{category.name}</span>
                {active && <Check size={14} strokeWidth={2.5} color="var(--accent)" />}
              </button>
            )
          })}
          <button
            type="button"
            role="option"
            aria-selected={selectedCategoryId == null}
            onClick={() => onSelect(null)}
            className={`text-content-muted ${selectedCategoryId == null ? 'bg-surface-hover' : 'bg-transparent'}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 'calc(13px * var(--fs-scale-body, 1))', textAlign: 'left',
              borderTop: '1px solid var(--border-faint)', marginTop: 4,
            }}
          >
            <span className="bg-surface-hover" style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MapPin size={14} strokeWidth={2} color="var(--text-faint)" />
            </span>
            <span style={{ flex: 1 }}>{t('places.noCategory')}</span>
            {selectedCategoryId == null && <Check size={14} strokeWidth={2.5} color="var(--accent)" />}
          </button>
        </div>
      </div>
    </div>
  )

  return ReactDOM.createPortal(panel, document.body)
}

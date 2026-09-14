import React from 'react'
import { Heart } from 'lucide-react'
import { useTranslation } from '../../i18n'

type CatalogSaveHeartButtonProps = {
  isSaved: boolean
  busy?: boolean
  disabled?: boolean
  onToggle: () => void
}

/** Explore P6 heart — 36px circle, optimistic toggle lives in the parent. */
export default function CatalogSaveHeartButton({
  isSaved,
  busy = false,
  disabled = false,
  onToggle,
}: CatalogSaveHeartButtonProps): React.ReactElement {
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const blocked = busy || disabled

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={blocked}
      aria-pressed={isSaved}
      aria-busy={busy}
      aria-label={
        isSaved
          ? tr('trip.explore.save.remove', 'Remove from saved')
          : tr('trip.explore.save.add', 'Save')
      }
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: '1px solid var(--edge-faint, #e2e8f0)',
        background: 'var(--bg-card, #fff)',
        color: isSaved ? 'rgba(220, 38, 38, 0.9)' : 'var(--text-primary, #111)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: blocked ? 'wait' : 'pointer',
        opacity: blocked ? 0.55 : 1,
        flexShrink: 0,
        padding: 0,
      }}
    >
      <Heart size={18} strokeWidth={2.2} fill={isSaved ? 'currentColor' : 'none'} aria-hidden />
    </button>
  )
}

import React from 'react'
import { Bookmark } from 'lucide-react'
import { useTranslation } from '../../i18n'

type CatalogAddToListButtonProps = {
  onAnyList: boolean
  busy?: boolean
  disabled?: boolean
  onClick: () => void
}

/** Explore Add to list — 36px circle, left of the heart. Named lists, not hearts. */
export default function CatalogAddToListButton({
  onAnyList,
  busy = false,
  disabled = false,
  onClick,
}: CatalogAddToListButtonProps): React.ReactElement {
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const blocked = busy || disabled

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-disabled={blocked}
      aria-pressed={onAnyList}
      aria-busy={busy}
      aria-label={
        onAnyList
          ? tr('trip.explore.list.onList', 'On a list')
          : tr('trip.explore.list.add', 'Add to list')
      }
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: '1px solid var(--edge-faint, #e2e8f0)',
        background: 'var(--bg-card, #fff)',
        color: onAnyList ? 'var(--accent, #6366f1)' : 'var(--text-primary, #111)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: busy ? 'wait' : disabled ? 'not-allowed' : 'pointer',
        opacity: blocked ? 0.55 : 1,
        flexShrink: 0,
        padding: 0,
      }}
    >
      <Bookmark size={18} strokeWidth={2.2} fill={onAnyList ? 'currentColor' : 'none'} aria-hidden />
    </button>
  )
}

import { useState } from 'react'
import { Plus, X, Bookmark } from 'lucide-react'
import { Tooltip } from '../shared/Tooltip'

const FAB = 40
const TEAL = '#2DD4BF'

interface Props {
  usesFamilyCatalog: boolean
  onToggleCatalog: () => void
}

/**
 * Leading map speed dial — iOS WorkspaceMapActionDial thin slice (Catalog bookmark only).
 * Frame satellite deferred until web has a workspace frame FAB.
 */
export default function WorkspaceMapActionDial({ usesFamilyCatalog, onToggleCatalog }: Props) {
  const [expanded, setExpanded] = useState(false)

  const surface: React.CSSProperties = {
    width: FAB,
    height: FAB,
    borderRadius: 999,
    boxShadow: '0 3px 8px rgba(0,0,0,0.12)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    pointerEvents: 'auto',
    background: 'var(--sidebar-bg, #fff)',
    color: 'var(--text-primary, #111)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, pointerEvents: 'none' }}>
      {expanded && (
        <Tooltip
          label={usesFamilyCatalog ? 'Turn off Family Catalog' : 'Show Family Catalog picks'}
          placement="right"
        >
          <button
            type="button"
            onClick={() => {
              onToggleCatalog()
              setExpanded(false)
            }}
            aria-label={usesFamilyCatalog ? 'Turn off Family Catalog' : 'Show Family Catalog picks'}
            aria-pressed={usesFamilyCatalog}
            style={{
              ...surface,
              border: usesFamilyCatalog ? 'none' : '1px solid var(--edge-faint, rgba(0,0,0,0.12))',
              background: usesFamilyCatalog ? TEAL : 'var(--sidebar-bg, #fff)',
              color: usesFamilyCatalog ? '#fff' : 'var(--text-primary, #111)',
            }}
          >
            <Bookmark size={15} strokeWidth={2.2} fill={usesFamilyCatalog ? 'currentColor' : 'none'} />
          </button>
        </Tooltip>
      )}

      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-label={expanded ? 'Close map actions' : 'Open map actions'}
        aria-expanded={expanded}
        style={{
          ...surface,
          border: expanded ? 'none' : '1px solid var(--edge-faint, rgba(0,0,0,0.12))',
          background: expanded ? 'var(--accent, #111827)' : 'var(--sidebar-bg, #fff)',
          color: expanded ? '#fff' : 'var(--text-primary, #111)',
          transform: expanded ? 'rotate(90deg)' : undefined,
          transition: 'transform 0.2s ease, background 0.14s, color 0.14s',
        }}
      >
        {expanded ? <X size={16} strokeWidth={2.4} /> : <Plus size={16} strokeWidth={2.4} />}
      </button>
    </div>
  )
}

/** Compact status capsule when Family Catalog mode is on (iOS plan/places chip parity). */
export function FamilyCatalogStatusCapsule() {
  return (
    <span
      role="status"
      style={{
        pointerEvents: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.01em',
        color: '#0f766e',
        background: 'rgba(45, 212, 191, 0.18)',
        border: '1px solid rgba(45, 212, 191, 0.45)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      Family Catalog
    </span>
  )
}

import type { CSSProperties, ReactNode } from 'react'
import TrekMascot, { type TrekMood, type TrekScene } from './TrekMascot'

/**
 * Shared empty surface: the Family TREK mascot plus one title. Optional
 * description/action sit under the title. Maps desktop tokens onto the mascot
 * cutouts so eyes read as holes against the page surface.
 */
export default function EmptyState({
  scene = 'idle',
  mood,
  title,
  size = 104,
  surface = 'var(--bg-card)',
  layout = 'stack',
  className = '',
  description,
  action,
}: {
  scene?: TrekScene
  mood?: TrekMood
  title: string
  size?: number
  surface?: string
  layout?: 'stack' | 'row'
  className?: string
  description?: string
  action?: ReactNode
}) {
  const layoutClasses = layout === 'row'
    ? 'flex flex-row items-center justify-center gap-3 px-6 py-3'
    : 'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center'
  return (
    <div
      className={`${layoutClasses} ${className}`}
      style={{ '--m-ink': 'var(--text-primary)', '--m-bg': surface } as CSSProperties}
    >
      <TrekMascot scene={scene} mood={mood} size={size} />
      <div className={layout === 'row' ? 'min-w-0' : ''}>
        <p className="text-body font-semibold text-content-secondary">{title}</p>
        {description && (
          <p className="mt-1 text-caption text-content-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

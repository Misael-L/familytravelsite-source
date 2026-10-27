/*
 * Family day-rail surfaces. Token mixes follow the user's accent in both themes.
 * Route bars and locked-stop tones are omitted: this rail has no drive or pin model.
 */

/** Resting tint so each day reads as a head band before it is selected. */
export const DAY_HEAD_REST = 'color-mix(in srgb, var(--accent) 6%, transparent)'
/** Hover deepens the same accent mix. Selection still wins. */
export const DAY_HEAD_HOVER = 'color-mix(in srgb, var(--accent) 10%, transparent)'
export const DAY_HEAD_SELECTED = 'color-mix(in srgb, var(--accent) 12%, transparent)'

export const DAY_CARD = 'overflow-hidden rounded-2xl border border-edge-faint bg-surface-card'
export const DAY_INDEX_TILE = 'flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-surface-card text-caption font-bold text-content-muted shadow-sm'
export const DAY_INDEX_TILE_SELECTED = 'flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-accent text-caption font-bold text-accent-text shadow-sm'
export const TIMELINE_ROW = 'flex w-full items-center gap-2 border-b border-edge-faint px-3 py-2 last:border-b-0'
export const ROW_CONTROL = 'grid h-6 w-6 flex-none place-items-center rounded-full bg-surface-card text-content-muted shadow-sm ring-1 ring-edge-faint disabled:cursor-default disabled:opacity-35'

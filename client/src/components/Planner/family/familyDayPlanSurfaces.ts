import { NEUTRAL_TINT } from '../../shared/DialogShell'
import { ROW_ROUND } from '../dayPlanSurfaces'
export { DAY_HEAD_HOVER, DAY_HEAD_SELECTED } from '../dayPlanSurfaces'
/*
 * Family day-rail surfaces. Token mixes follow the user's accent in both themes.
 * Route bars and locked-stop tones are omitted: this rail has no drive or pin model.
 */

/** Resting tint so each day reads as a head band before it is selected. */
export const DAY_HEAD_REST = NEUTRAL_TINT
/** Hover deepens the same accent mix. Selection still wins. */

export const DAY_CARD = 'flex-none overflow-hidden rounded-2xl border border-edge-faint bg-surface-card'
export const DAY_INDEX_TILE = 'flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-surface-card text-caption font-bold text-content-muted shadow-sm'
export const DAY_INDEX_TILE_SELECTED = 'flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-accent text-caption font-bold text-accent-text shadow-sm'
export const TIMELINE_ROW = 'group mb-px flex w-full items-center gap-2.5 rounded-[12px] px-2.5 py-2 outline-none transition-colors hover:bg-surface-hover'
export const ROW_CONTROL = `${ROW_ROUND} h-6 w-6 text-content-muted ring-1 ring-edge-faint disabled:cursor-default disabled:opacity-35`

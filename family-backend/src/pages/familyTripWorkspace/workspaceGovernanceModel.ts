import type {
  TripChangeDraftOpRow,
  TripChangeModule,
  TripChangeOpKind,
  TripChangeRequestRow,
} from '../../data/supabase/tripChangeRequests'

export type WorkspaceItineraryLayer = 'published' | 'myDraft'

export type WorkspaceWriteMode = 'direct' | 'draft' | 'nudge' | 'deny'

export const PHASE1A_CAPABILITY_KEYS = [
  'trip.places.manage',
  'trip.schedule.manage',
  'trip.reservations.manage',
  'trip.costs.manage',
] as const

export type FamilyActionOutcome = 'direct' | 'propose' | 'deny'

export function resolveWorkspaceWriteMode(opts: {
  layer: WorkspaceItineraryLayer
  canMutate: boolean
  canDraft: boolean
}): WorkspaceWriteMode {
  if (opts.layer === 'published' && opts.canMutate) return 'direct'
  if (opts.layer === 'myDraft' && opts.canDraft) return 'draft'
  if (opts.layer === 'published' && opts.canDraft) return 'nudge'
  return 'deny'
}

/** Per-action write chrome. Propose only opens Phase 1A draft modules. */
export function writeModeForCapability(opts: {
  layer: WorkspaceItineraryLayer
  outcome: FamilyActionOutcome
  key: string
  isHof: boolean
}): WorkspaceWriteMode {
  const stageable = (PHASE1A_CAPABILITY_KEYS as readonly string[]).includes(opts.key)
  if (opts.layer === 'published' && opts.outcome === 'direct') return 'direct'
  if (opts.layer === 'myDraft' && stageable && (opts.outcome === 'propose' || (opts.outcome === 'direct' && opts.isHof))) {
    return 'draft'
  }
  if (opts.layer === 'published' && stageable && opts.outcome === 'propose') return 'nudge'
  return 'deny'
}

export function canEditPublished(opts: {
  layer: WorkspaceItineraryLayer
  canMutate: boolean
}): boolean {
  return opts.canMutate && opts.layer === 'published'
}

export function canStageDraft(opts: {
  layer: WorkspaceItineraryLayer
  canDraft: boolean
}): boolean {
  return opts.canDraft && opts.layer === 'myDraft'
}

export function canUseDraftableEditors(mode: WorkspaceWriteMode): boolean {
  return mode === 'direct' || mode === 'draft'
}

export function moduleTitleKey(module: TripChangeModule): string {
  switch (module) {
    case 'plan_item': return 'trip.governance.module.planItem'
    case 'day_note': return 'trip.governance.module.dayNote'
    case 'reservation': return 'trip.governance.module.reservation'
    case 'expense': return 'trip.governance.module.expense'
    case 'trip_place': return 'trip.governance.module.tripPlace'
  }
}

export function opTitleKey(op: TripChangeOpKind): string {
  switch (op) {
    case 'add': return 'trip.governance.op.add'
    case 'update': return 'trip.governance.op.update'
    case 'remove': return 'trip.governance.op.remove'
  }
}

export function requestStatusKey(status: TripChangeRequestRow['status']): string {
  return `trip.governance.status.${status}`
}

export function draftOpLabel(
  op: Pick<TripChangeDraftOpRow, 'module' | 'op' | 'payload'>,
  t: (key: string) => string,
): { title: string; detail: string } {
  const title = `${t(opTitleKey(op.op))} · ${t(moduleTitleKey(op.module))}`
  const p = op.payload
  const detail = p.activity || p.title || p.name || p.body || p.place_id || t('trip.governance.change')
  return { title, detail }
}

export function failedResolveCodes(results: Array<{ errorCode?: string | null; status: string }>): string[] {
  return results
    .map(r => r.errorCode)
    .filter((code): code is string => Boolean(code))
}

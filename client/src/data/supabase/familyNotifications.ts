/**
 * Family notification inbox, push preferences, and Admin defaults (§34).
 * Postgres RPCs are SoR. Do not call Nest notificationsApi / settingsApi / adminApi.
 */

import { getSupabaseBrowserClient } from './client'

export const FAMILY_NOTIFICATION_EVENT_KEYS = [
  'access.request.submitted',
  'proposal.created',
  'proposal.ready_for_decision',
  'proposal.accepted',
  'proposal.rejected',
  'change_request.submitted',
  'change_request.resolved',
] as const

export type FamilyNotificationEventKey = (typeof FAMILY_NOTIFICATION_EVENT_KEYS)[number]
export type NotificationPrefSource = 'member' | 'family' | 'catalog'
export type NotificationDestinationKind = 'access_request' | 'proposal' | 'change_request'

export function isFamilyNotificationEventKey(value: string): value is FamilyNotificationEventKey {
  return (FAMILY_NOTIFICATION_EVENT_KEYS as readonly string[]).includes(value)
}

export type FamilyNotificationDefaultRow = {
  eventKey: FamilyNotificationEventKey
  destinationKind: NotificationDestinationKind
  displayOrder: number
  pushEnabled: boolean
  source: 'family' | 'catalog'
}

export type FamilyNotificationDefaults = {
  familyId: string
  canManage: boolean
  inAppMandatory: true
  defaults: FamilyNotificationDefaultRow[]
  health: { activeIosDevices: number }
}

export type MemberNotificationEventRow = {
  eventKey: FamilyNotificationEventKey
  destinationKind: NotificationDestinationKind
  displayOrder: number
  pushEnabled: boolean
  source: NotificationPrefSource
  familyPushEnabled: boolean
  catalogPushEnabled: boolean
}

export type MemberNotificationPreferences = {
  familyId: string
  personId: string | null
  inAppMandatory: true
  events: MemberNotificationEventRow[]
}

export type FamilyInboxItem = {
  id: string
  familyId: string
  eventKey: string
  destinationKind: NotificationDestinationKind | null
  sourceId: string
  tripId: string | null
  label: string | null
  resolvedStatus: string | null
  readAt: string | null
  dismissedAt: string | null
  createdAt: string
}

export type FamilyInboxPage = {
  items: FamilyInboxItem[]
  nextCursor: { beforeCreatedAt: string; beforeId: string } | null
}

function throwIfError(error: { message?: string } | null): void {
  if (error) throw error
}

function asEventKey(value: unknown): FamilyNotificationEventKey | null {
  return typeof value === 'string' && isFamilyNotificationEventKey(value) ? value : null
}

function asKind(value: unknown): NotificationDestinationKind | null {
  return value === 'access_request' || value === 'proposal' || value === 'change_request' ? value : null
}

function asSource(value: unknown): NotificationPrefSource {
  if (value === 'member' || value === 'family' || value === 'catalog') return value
  return 'catalog'
}

function mapDefaultRow(raw: Record<string, unknown>): FamilyNotificationDefaultRow | null {
  const eventKey = asEventKey(raw.event_key)
  const destinationKind = asKind(raw.destination_kind)
  if (!eventKey || !destinationKind) return null
  return {
    eventKey,
    destinationKind,
    displayOrder: Number(raw.display_order ?? 0),
    pushEnabled: raw.push_enabled !== false,
    source: raw.source === 'family' ? 'family' : 'catalog',
  }
}

function mapMemberRow(raw: Record<string, unknown>): MemberNotificationEventRow | null {
  const eventKey = asEventKey(raw.event_key)
  const destinationKind = asKind(raw.destination_kind)
  if (!eventKey || !destinationKind) return null
  return {
    eventKey,
    destinationKind,
    displayOrder: Number(raw.display_order ?? 0),
    pushEnabled: raw.push_enabled !== false,
    source: asSource(raw.source),
    familyPushEnabled: raw.family_push_enabled !== false,
    catalogPushEnabled: raw.catalog_push_enabled !== false,
  }
}

function mapInboxItem(raw: Record<string, unknown>): FamilyInboxItem | null {
  if (typeof raw.id !== 'string' || typeof raw.event_key !== 'string') return null
  return {
    id: raw.id,
    familyId: String(raw.family_id ?? ''),
    eventKey: raw.event_key,
    destinationKind: asKind(raw.destination_kind),
    sourceId: String(raw.source_id ?? ''),
    tripId: typeof raw.trip_id === 'string' ? raw.trip_id : null,
    label: typeof raw.label === 'string' ? raw.label : null,
    resolvedStatus: typeof raw.resolved_status === 'string' ? raw.resolved_status : null,
    readAt: typeof raw.read_at === 'string' ? raw.read_at : null,
    dismissedAt: typeof raw.dismissed_at === 'string' ? raw.dismissed_at : null,
    createdAt: String(raw.created_at ?? ''),
  }
}

export function familyInboxNavigateTarget(item: Pick<FamilyInboxItem, 'destinationKind' | 'sourceId' | 'tripId'>): string {
  if (item.destinationKind === 'access_request') return '/admin'
  if (item.destinationKind === 'change_request' && item.tripId) return `/trips/${item.tripId}`
  if (item.destinationKind === 'proposal') return '/'
  if (item.tripId) return `/trips/${item.tripId}`
  return '/notifications'
}

export function familyEventTitleKey(eventKey: string): string {
  return `notifications.event.${eventKey}.title`
}

export function familyEventTextKey(eventKey: string): string {
  return `notifications.event.${eventKey}.text`
}

export async function getFamilyNotificationDefaults(familyId: string): Promise<FamilyNotificationDefaults> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('get_family_notification_defaults', { p_family_id: familyId })
  throwIfError(error)
  const row = data as Record<string, unknown> | null
  if (!row) throw new Error('family notification defaults missing')
  const health = (row.health ?? {}) as Record<string, unknown>
  return {
    familyId: String(row.family_id ?? familyId),
    canManage: !!row.can_manage,
    inAppMandatory: true,
    defaults: Array.isArray(row.defaults)
      ? (row.defaults as Record<string, unknown>[]).map(mapDefaultRow).filter((x): x is FamilyNotificationDefaultRow => x != null)
      : [],
    health: { activeIosDevices: Number(health.active_ios_devices ?? 0) },
  }
}

export async function updateFamilyNotificationDefaults(
  familyId: string,
  patch: Record<string, boolean | null>,
): Promise<FamilyNotificationDefaults> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('update_family_notification_defaults', { p_family_id: familyId, p_patch: patch })
  throwIfError(error)
  if (!data) throw new Error('family notification defaults save failed')
  return getFamilyNotificationDefaults(familyId)
}

export async function getMyNotificationPreferences(familyId: string): Promise<MemberNotificationPreferences> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('get_my_notification_preferences', { p_family_id: familyId })
  throwIfError(error)
  const row = data as Record<string, unknown> | null
  if (!row) throw new Error('notification preferences missing')
  return {
    familyId: String(row.family_id ?? familyId),
    personId: typeof row.person_id === 'string' ? row.person_id : null,
    inAppMandatory: true,
    events: Array.isArray(row.events)
      ? (row.events as Record<string, unknown>[]).map(mapMemberRow).filter((x): x is MemberNotificationEventRow => x != null)
      : [],
  }
}

export async function updateMyNotificationPreferences(
  familyId: string,
  patch: Record<string, boolean | null>,
): Promise<MemberNotificationPreferences> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('update_my_notification_preferences', { p_family_id: familyId, p_patch: patch })
  throwIfError(error)
  if (!data) throw new Error('notification preferences save failed')
  return getMyNotificationPreferences(familyId)
}

export async function listMyNotifications(
  familyId: string,
  opts?: { limit?: number; beforeCreatedAt?: string | null; beforeId?: string | null; unreadOnly?: boolean },
): Promise<FamilyInboxPage> {
  const { data, error } = await getSupabaseBrowserClient().rpc('list_my_notifications', {
    p_family_id: familyId,
    p_limit: opts?.limit ?? 30,
    p_before_created_at: opts?.beforeCreatedAt ?? null,
    p_before_id: opts?.beforeId ?? null,
    p_unread_only: opts?.unreadOnly ?? false,
  })
  throwIfError(error)
  const row = (data ?? {}) as Record<string, unknown>
  const cursor = row.next_cursor as Record<string, unknown> | null
  return {
    items: Array.isArray(row.items)
      ? (row.items as Record<string, unknown>[]).map(mapInboxItem).filter((x): x is FamilyInboxItem => x != null)
      : [],
    nextCursor: cursor && typeof cursor.before_created_at === 'string' && typeof cursor.before_id === 'string'
      ? { beforeCreatedAt: cursor.before_created_at, beforeId: cursor.before_id }
      : null,
  }
}

export async function countMyUnreadNotifications(familyId: string): Promise<number> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('count_my_unread_notifications', { p_family_id: familyId })
  throwIfError(error)
  const row = data as { count?: number } | null
  return Number(row?.count ?? 0)
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('mark_notifications_read', { p_ids: ids })
  throwIfError(error)
}

export async function markNotificationsUnread(ids: string[]): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('mark_notifications_unread', { p_ids: ids })
  throwIfError(error)
}

export async function markAllNotificationsRead(familyId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .rpc('mark_all_notifications_read', { p_family_id: familyId })
  throwIfError(error)
}

export async function dismissNotifications(ids: string[]): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('dismiss_notifications', { p_ids: ids })
  throwIfError(error)
}

export async function dismissAllNotifications(familyId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .rpc('dismiss_all_notifications', { p_family_id: familyId })
  throwIfError(error)
}

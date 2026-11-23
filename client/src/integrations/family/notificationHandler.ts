import * as inboxBackend from './legacy/data/supabase/familyNotifications';
import { NOT_HANDLED } from './listHandler';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { scopeFamilyOperations } from './requestContext';
import type { FamilyRequest } from './transport';
type Cursor = { beforeCreatedAt: string; beforeId: string };
const cursors = new WeakMap<FamilyFrontendRepository, Map<string, Cursor | null>>();
type InboxSession = Awaited<ReturnType<FamilyFrontendRepository['session']>>;

function notificationListQuery(request: FamilyRequest) {
  const limit = Math.min(100, Math.max(1, Number(request.query.get('limit')) || 20)),
    offset = Math.max(0, Number(request.query.get('offset')) || 0),
    unreadOnly = request.query.get('unread_only') === 'true';
  if (!Number.isInteger(offset) || offset > 10000)
    throw new FamilyApiError(422, 'invalid_inbox_offset', 'Reload the inbox to continue.');
  return { limit, offset, unreadOnly };
}

function notificationListCursor(repo: FamilyFrontendRepository, s: InboxSession, unreadOnly: boolean, offset: number) {
  const key = `${s.userId}:${unreadOnly}:`,
    map = cursors.get(repo) ?? new Map<string, Cursor | null>();
  cursors.set(repo, map);
  return { key, map, cursor: offset === 0 ? null : map.get(key + offset) };
}

function notificationCollectionRoute(suffix: string, m: string) {
  if (suffix === 'unread-count' && m === 'GET') return 'count';
  if (!suffix && m === 'GET') return 'list';
  if (suffix === 'read-all' && m === 'PUT') return 'read-all';
  if (suffix === 'all' && m === 'DELETE') return 'all';
  return null;
}

export async function handleFamilyNotifications(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const inbox = scopeFamilyOperations(repo, inboxBackend);
  if (!request.pathname.startsWith('/notifications/in-app')) return NOT_HANDLED;
  const s = await repo.session(),
    v = await repo.views(),
    m = request.method;
  const suffix = request.pathname.replace('/notifications/in-app', '').replace(/^\//, '');
  const route = notificationCollectionRoute(suffix, m);
  if (route === 'count') return { count: await inbox.countMyUnreadNotifications(s.familyId) };
  if (route === 'list') {
    const { limit, offset, unreadOnly } = notificationListQuery(request);
    const { key, map, cursor: initialCursor } = notificationListCursor(repo, s, unreadOnly, offset);
    let cursor = initialCursor,
      walked = 0;
    if (offset && cursor === undefined) {
      cursor = null;
      while (walked < offset) {
        const page = await inbox.listMyNotifications(s.familyId, {
          limit: Math.min(100, offset - walked),
          ...cursor,
          unreadOnly,
        });
        walked += page.items.length;
        cursor = page.nextCursor;
        if (!cursor) break;
      }
    }
    if (offset > 0 && cursor === null) {
      const count = await inbox.countMyUnreadNotifications(s.familyId);
      map.set(key + offset, null);
      return { notifications: [], total: offset, unread_count: count, has_more: false };
    }
    const page = await inbox.listMyNotifications(s.familyId, { limit, ...cursor, unreadOnly }),
      count = await inbox.countMyUnreadNotifications(s.familyId);
    map.set(key + (offset + page.items.length), page.nextCursor);
    return {
      notifications: page.items.map((item) => ({
        id: v.ids.register('notification', item.id),
        type: 'navigate',
        scope: item.destinationKind === 'access_request' ? 'admin' : 'trip',
        target: item.tripId ? v.ids.register('trip', item.tripId) : 0,
        sender_id: null,
        sender_username: null,
        sender_avatar: null,
        recipient_id: v.ids.register('person', s.personId),
        title_key: inbox.familyEventTitleKey(item.eventKey),
        title_params: item.label ? { label: item.label } : {},
        text_key: inbox.familyEventTextKey(item.eventKey),
        text_params: item.label ? { label: item.label } : {},
        positive_text_key: null,
        negative_text_key: null,
        response: null,
        navigate_text_key: 'notifications.open',
        navigate_target: inbox.familyInboxNavigateTarget(item),
        is_read: !!item.readAt,
        created_at: item.createdAt,
      })),
      total: offset + page.items.length,
      unread_count: count,
      has_more: page.nextCursor != null,
    };
  }
  if (route === 'read-all') {
    await inbox.markAllNotificationsRead(s.familyId);
    return { success: true };
  }
  if (route === 'all') {
    await inbox.dismissAllNotifications(s.familyId);
    return { success: true };
  }
  const [key, action] = suffix.split('/'),
    id = v.ids.uuid('notification', key);
  if (m === 'PUT' && action === 'read') await inbox.markNotificationsRead([id]);
  else if (m === 'PUT' && action === 'unread') await inbox.markNotificationsUnread([id]);
  else if (m === 'DELETE' && !action) await inbox.dismissNotifications([id]);
  else
    throw new FamilyApiError(
      422,
      'notification_action_unavailable',
      'Open this notification to respond through the Family workflow.'
    );
  return { success: true };
}

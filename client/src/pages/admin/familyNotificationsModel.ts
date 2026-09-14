import { FAMILY_NOTIFICATION_EVENT_KEYS, type FamilyNotificationEventKey } from '../../data/supabase/familyNotifications'

export const FAMILY_EVENT_I18N: Record<FamilyNotificationEventKey, string> = {
  'access.request.submitted': 'admin.familyNotifications.event.access.request.submitted',
  'proposal.created': 'admin.familyNotifications.event.proposal.created',
  'proposal.ready_for_decision': 'admin.familyNotifications.event.proposal.ready_for_decision',
  'proposal.accepted': 'admin.familyNotifications.event.proposal.accepted',
  'proposal.rejected': 'admin.familyNotifications.event.proposal.rejected',
  'change_request.submitted': 'admin.familyNotifications.event.change_request.submitted',
  'change_request.resolved': 'admin.familyNotifications.event.change_request.resolved',
}

export function eventLabelKey(eventKey: string): string {
  if ((FAMILY_NOTIFICATION_EVENT_KEYS as readonly string[]).includes(eventKey)) {
    return FAMILY_EVENT_I18N[eventKey as FamilyNotificationEventKey]
  }
  return eventKey
}

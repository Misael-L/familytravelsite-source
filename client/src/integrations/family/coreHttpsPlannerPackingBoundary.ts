import { FAMILY_AVATAR_BUCKET, SIGNED_URL_EXPIRES_SEC } from '@family/backend/supabase/personAvatars';
import {
  coreHttpsCombinedProfileEnabled,
  coreHttpsPlannerPackingProfileEnabled,
} from './coreHttpsPlannerPackingProfile';
import { primaryCoreMode, type PrimaryCoreMode } from './corePrimaryProfile';
import { FamilyApiError } from './errors';
import { hostedRoadtripToursTripId, isHostedMexicoPreview, routePlanningPreviewTripId } from './routePlanningPreview';
import type { FamilyRequest } from './transport';

const reads = new Set([
  'get_my_auth_bootstrap',
  'get_my_effective_features',
  'get_my_effective_map_settings',
  'get_my_effective_preferences',
  'count_my_unread_notifications',
  'catalog_media_variants_for_assets',
  'get_family_trip_planner_view_v1',
  'get_family_trip_planner_state_v1',
  'get_family_trip_booking_view_v1',
  'get_family_plan_governance_v1',
  'get_family_native_plan_receipt_v1',
  'get_family_native_plan_receipt_v2',
  'get_family_native_arrangement_receipt_v1',
  'get_family_trip_location_v1',
  'list_family_trip_locations_v1',
  'get_family_trip_visit_v1',
  'list_family_trip_visits_v1',
  'get_family_trip_location_form_v1',
  'get_family_trip_visit_form_v1',
  'get_family_trip_location_form_receipt_v1',
  'get_family_trip_visit_form_receipt_v1',
  'get_family_trip_visit_classification_v1',
  'get_family_trip_visit_timing_revision_v1',
  'get_family_trip_tasks_v1',
  'get_family_trip_packing_v1',
  'list_family_trip_packing_trash_v1',
  'get_family_trip_packing_receipt_v1',
  'get_family_trip_packing_group_receipt_v1',
  'get_family_collection_library_v1',
  'get_family_collection_page_v1',
]);
const adminReads = new Set([
  'get_family_preference_defaults',
  'get_family_map_settings',
  'list_family_packing_templates',
  'list_family_place_categories',
  'get_family_identity_assurance',
  'get_family_file_policy',
  'list_family_feature_controls',
  'list_feature_rollout_events',
  'get_family_notification_defaults',
  'list_family_export_jobs',
  'list_family_audit_events',
]);
const commands = new Set([
  'create_family_native_plan_v1',
  'cancel_family_native_plan_v1',
  'create_family_trip_plan_entry_v1',
  'arrange_family_native_visits_v1',
  'mutate_family_trip_location_v1',
  'mutate_family_trip_visit_v1',
  'save_family_trip_location_form_v1',
  'save_family_trip_visit_form_v1',
  'set_family_trip_visit_timing_v1',
  'classify_family_trip_visit_untimed_v1',
  'execute_family_trip_packing_v1',
  'execute_family_trip_packing_group_v1',
]);
const auth = new Set(['/auth/login', '/auth/logout', '/auth/mfa/verify-login']);
const nativeCommands = [
  /^\/trips\/[^/]+\/family\/planner-(?:create|arrange|editor)-command$/,
  /^\/trips\/[^/]+\/family\/plan-entries$/,
  /^\/trips\/[^/]+\/family\/(?:plan-locations|visits)\/[^/]+\/(?:form|trash|restore)$/,
  /^\/trips\/[^/]+\/family\/packing\/(?:commands|group-commands)$/,
];
const nativeTaskCommand = /^\/trips\/[^/]+\/family\/tasks\/commands$/;
const taskReads = new Set(['get_family_trip_task_receipt_v1', 'list_family_trip_task_trash_v1']);
const roadtripToursReads = new Set([
  'get_family_route_preferences_v1',
  'get_family_route_waypoints_v1',
  'get_family_trip_tours_v1',
]);
const mexicoTripReads = new Set([
  'get_family_trip_journal_v1',
  'get_family_trip_collab_notes_v1',
  'get_family_trip_collab_links_v1',
  'get_family_trip_collab_chat_v1',
  'get_family_trip_collab_chat_updates_v2',
  'get_family_trip_collab_polls_v1',
]);

function refused(taskEnabled: boolean, primary?: PrimaryCoreMode): never {
  if (primary === 'read') {
    throw new FamilyApiError(503, 'family_writes_paused', 'Changes are paused. Previously queued work is retained.');
  }
  if (primary === 'blocked') {
    throw new FamilyApiError(503, 'family_release_origin_mismatch', 'This build cannot connect from this website.');
  }
  if (primary === 'write') {
    throw new FamilyApiError(501, 'family_core_scope', 'This release supports New Trip, task, planner and base packing changes.');
  }
  throw new FamilyApiError(
    501,
    taskEnabled ? 'isolated_task_planner_packing_only' : 'isolated_planner_packing_only',
    taskEnabled
      ? 'This isolated HTTPS profile qualifies task, planner and base packing commands only. Other work remains retained.'
      : 'This isolated HTTPS profile qualifies planner and base packing commands only. Other work remains retained.'
  );
}
/** Native transport and installed SDK both refuse unrelated writes before dispatch. */
export function assertCoreHttpsPlannerPackingRequest(request: Pick<FamilyRequest, 'method' | 'pathname'>) {
  const primary = primaryCoreMode();
  if (primary === 'blocked') refused(true, primary);
  if (!coreHttpsPlannerPackingProfileEnabled() || ['GET', 'HEAD'].includes(request.method)) return;
  const taskEnabled = coreHttpsCombinedProfileEnabled();
  if (
    request.method === 'POST' &&
    (auth.has(request.pathname) ||
      (primary !== 'read' &&
        (nativeCommands.some((p) => p.test(request.pathname)) ||
          (taskEnabled && nativeTaskCommand.test(request.pathname)))))
  )
    return;
  refused(taskEnabled, primary);
}
function authWriteAllowed(url: URL): boolean {
  if (url.pathname === '/auth/v1/token') return /^\?grant_type=(?:password|refresh_token)$/.test(url.search);
  if (url.pathname === '/auth/v1/logout') return !url.search || /^\?scope=(?:global|local|others)$/.test(url.search);
  return /^\/auth\/v1\/factors\/[0-9a-f-]+\/(?:challenge|verify)$/.test(url.pathname) && !url.search;
}
function scopedTripReadAllowed(trip: string | null, body: BodyInit | null | undefined): boolean {
  if (!trip || typeof body !== 'string') return false;
  try {
    return JSON.parse(body)?.p_trip_id === trip;
  } catch {
    return false;
  }
}

function allowsRpc(pathname: string, taskEnabled: boolean, primary: PrimaryCoreMode, body: BodyInit | null | undefined) {
  const name = pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1];
  if (!name) return false;
  if (reads.has(name) || (taskEnabled && taskReads.has(name))) return true;
  if ((primary === 'write' || primary === 'read') && adminReads.has(name)) return true;
  if (isHostedMexicoPreview() && name === 'get_my_profile_display_preferences') return true;
  if (roadtripToursReads.has(name)) return scopedTripReadAllowed(hostedRoadtripToursTripId(), body);
  if (mexicoTripReads.has(name))
    return isHostedMexicoPreview() && scopedTripReadAllowed(routePlanningPreviewTripId(), body);
  if (name === 'create_family_trip_proposal_v1') return primary === 'write';
  return primary !== 'read' && (commands.has(name) || (taskEnabled && name === 'execute_family_trip_task_v1'));
}

// The Storage API authorizes each private object even when several are requested.
const avatarUuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const avatarObjectPath = new RegExp(`^${avatarUuid}/people/${avatarUuid}/${avatarUuid}\\.(?:jpe?g|png|gif|webp|avif)$`);

function allowsAvatarSigning(url: URL, body?: BodyInit | null): boolean {
  if (url.search || url.pathname !== `/storage/v1/object/sign/${FAMILY_AVATAR_BUCKET}` || typeof body !== 'string')
    return false;
  try {
    const { expiresIn, paths } = JSON.parse(body) as { expiresIn?: unknown; paths?: unknown };
    return expiresIn === SIGNED_URL_EXPIRES_SEC && Array.isArray(paths) && paths.length > 0
      && paths.every((path: unknown) => typeof path === 'string' && avatarObjectPath.test(path));
  } catch {
    return false;
  }
}

function allowsMexicoMediaSigning(url: URL): boolean {
  return !url.search && /^\/storage\/v1\/object\/sign\/(?:journey-media|trip-files)(?:\/.+)?$/.test(url.pathname) &&
    isHostedMexicoPreview() && routePlanningPreviewTripId() !== null;
}

function allowsNonRpcPost(url: URL, primary: PrimaryCoreMode, body?: BodyInit | null): boolean {
  if (authWriteAllowed(url) || allowsMexicoMediaSigning(url)) return true;
  // Cover search carries its query in the request body.
  if (url.pathname === '/functions/v1/search-unsplash')
    return !url.search && (primary === 'write' || isHostedMexicoPreview());
  return (primary === 'write' || primary === 'read') && allowsAvatarSigning(url, body);
}

function assertSdkRequest(url: URL, method: string, taskEnabled: boolean, primary: PrimaryCoreMode, body?: BodyInit | null): void {
  const readMethod = method === 'GET' || method === 'HEAD';
  if (primary === 'blocked' && (url.origin === import.meta.env.VITE_SUPABASE_URL || !readMethod))
    refused(taskEnabled, primary);
  if (url.origin !== import.meta.env.VITE_SUPABASE_URL) {
    if (!readMethod) refused(taskEnabled, primary);
    return;
  }
  if (url.username || url.password || url.pathname.includes('/render/image/')) refused(taskEnabled, primary);
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    if (method !== 'POST' || url.search || !allowsRpc(url.pathname, taskEnabled, primary, body))
      refused(taskEnabled, primary);
    return;
  }
  if (!readMethod && (method !== 'POST' || !allowsNonRpcPost(url, primary, body))) refused(taskEnabled, primary);
}
export function coreHttpsPlannerPackingFetch(next: typeof fetch): typeof fetch {
  return (input, init) => {
    const primary = primaryCoreMode();
    if (primary || coreHttpsPlannerPackingProfileEnabled()) {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      assertSdkRequest(url, method, primary !== undefined || coreHttpsCombinedProfileEnabled(), primary, init?.body);
    }
    return next(input, init);
  };
}

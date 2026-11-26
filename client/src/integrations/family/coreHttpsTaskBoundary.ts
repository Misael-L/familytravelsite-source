import { coreHttpsTaskProfileEnabled } from './coreHttpsTaskProfile';
import { FamilyApiError } from './errors';
import type { FamilyRequest } from './transport';

const readRpcs = new Set([
  'get_my_auth_bootstrap',
  'get_my_effective_features',
  'get_my_effective_map_settings',
  'get_my_effective_preferences',
  'count_my_unread_notifications',
  'catalog_media_variants_for_assets',
  'get_family_trip_planner_view_v1',
  'get_family_trip_booking_view_v1',
  'get_family_plan_governance_v1',
  'get_family_trip_tasks_v1',
  'get_family_trip_task_receipt_v1',
  'list_family_trip_task_trash_v1',
  'get_family_trip_packing_v1',
  'get_family_collection_library_v1',
  'get_family_collection_page_v1',
]);
const authWrites = new Set(['/auth/login', '/auth/logout', '/auth/mfa/verify-login']);
function refused(): never {
  throw new FamilyApiError(
    501,
    'isolated_task_profile_only',
    'This isolated HTTPS profile qualifies task commands only. Other original work remains retained.'
  );
}
/** Native transport fence, before dispatch. No effect on existing profiles. */
export function assertCoreHttpsTaskRequest(request: Pick<FamilyRequest, 'method' | 'pathname'>) {
  if (!coreHttpsTaskProfileEnabled() || ['GET', 'HEAD'].includes(request.method)) return;
  if (
    request.method === 'POST' &&
    (authWrites.has(request.pathname) || /^\/trips\/[^/]+\/family\/tasks\/commands$/.test(request.pathname))
  )
    return;
  refused();
}
/** The installed SDK resolves global fetch dynamically. Preserve it and refuse unqualified writes before egress. */
export function coreHttpsTaskFetch(next: typeof fetch): typeof fetch {
  return (input, init) => {
    if (coreHttpsTaskProfileEnabled()) {
      const raw = input instanceof Request ? input.url : String(input),
        url = new URL(raw, window.location.origin);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (url.origin !== import.meta.env.VITE_SUPABASE_URL) {
        if (!['GET', 'HEAD'].includes(method)) refused();
      } else {
        if (url.username || url.password || url.pathname.startsWith('/render/image/')) refused();
        if (url.pathname.startsWith('/rest/v1/rpc/')) {
          const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1];
          if (method !== 'POST' || !rpc || url.search || !(readRpcs.has(rpc) || rpc === 'execute_family_trip_task_v1'))
            refused();
        } else if (!['GET', 'HEAD'].includes(method) && !url.pathname.startsWith('/auth/v1/')) refused();
      }
    }
    return next(input, init);
  };
}

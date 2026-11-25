export class ApplicationRoutes {
  constructor(
    private readonly p: string,
    private readonly m: string
  ) {}
  fileOpenId() {
    return this.m === 'GET' ? this.p.match(/^\/family\/files\/([^/]+)\/open$/)?.[1] : undefined;
  }
  appConfig() {
    return this.p === '/auth/app-config';
  }
  config() {
    return this.p === '/config';
  }
  meRead() {
    return this.p === '/auth/me' && this.m === 'GET';
  }
  login() {
    return this.p === '/auth/login' && this.m === 'POST';
  }
  verifyLogin() {
    return this.p === '/auth/mfa/verify-login' && this.m === 'POST';
  }
  logout() {
    return this.p === '/auth/logout' && this.m === 'POST';
  }
  forgotPassword() {
    return this.p === '/auth/forgot-password' && this.m === 'POST';
  }
  resetPassword() {
    return this.p === '/auth/reset-password' && this.m === 'POST';
  }
  travelStats() {
    return this.p === '/auth/travel-stats' && this.m === 'GET';
  }
  notices() {
    return this.p === '/system-notices/active' && this.m === 'GET';
  }
  register() {
    return this.p === '/auth/register';
  }
  mfaSetup() {
    return this.p === '/auth/mfa/setup' && this.m === 'POST';
  }
  mfaEnable() {
    return this.p === '/auth/mfa/enable' && this.m === 'POST';
  }
  mfaDisable() {
    return this.p === '/auth/mfa/disable' && this.m === 'POST';
  }
  password() {
    return this.p === '/auth/me/password' && this.m === 'PUT';
  }
  profile() {
    return this.p === '/auth/me' && this.m === 'PUT';
  }
  avatar() {
    return this.p === '/auth/avatar';
  }
  settings() {
    return this.p === '/auth/me/settings' || this.p === '/settings' || this.p === '/settings/bulk';
  }
  passkeys() {
    return this.p === '/auth/passkey/credentials' && this.m === 'GET';
  }
  llm() {
    return this.p === '/llm/capabilities' && this.m === 'GET';
  }
  mapContributions() {
    return this.m === 'GET' ? this.p.match(/^\/(map-markers|map-layers)\/([^/]+)$/) : null;
  }
  dayContributions() {
    return /^\/(day-schedule|day-tints)\//.test(this.p) && this.m === 'GET';
  }
  weather() {
    return (this.p === '/weather' || this.p === '/weather/detailed') && this.m === 'GET';
  }
  plugins() {
    return this.p === '/plugins' && this.m === 'GET';
  }
  addons() {
    return this.p === '/addons' && this.m === 'GET';
  }
  tags() {
    return this.p === '/tags' && this.m === 'GET';
  }
  health() {
    return this.p === '/health/features';
  }
  viewContributions() {
    return /^\/(view-contributions|trip-warnings|place-details)\//.test(this.p);
  }
  coverSearch() {
    return this.p === '/trips/cover-images/search' && this.m === 'GET';
  }
  activeTrip() {
    return this.p === '/trips/active' && this.m === 'GET';
  }
  upcoming() {
    return this.p === '/reservations/upcoming' && this.m === 'GET';
  }
  atlasStats() {
    return this.p === '/addons/atlas/stats' && this.m === 'GET';
  }
  countryGeo() {
    return this.p === '/addons/atlas/countries/geo' && this.m === 'GET';
  }
  atlasUnavailable() {
    return (
      this.m === 'GET' &&
      (this.p === '/addons/atlas/bucket-list' ||
        this.p.startsWith('/addons/atlas/regions') ||
        this.p === '/atlas-layers' ||
        /^\/addons\/atlas\/country\/[^/]+$/.test(this.p))
    );
  }
}
export class TripApplicationRoutes {
  constructor(
    private readonly suffix: string,
    private readonly m: string,
    private readonly b: Record<string, unknown>
  ) {}
  unsupported() {
    return (
      /^(share-link|invite-link|cover|transfer)$/.test(this.suffix) ||
      (/^(members|guests)(?:\/[^/]+)?$/.test(this.suffix) && !(this.suffix === 'members' && this.m === 'GET')) ||
      (!this.suffix && this.m === 'PUT' && Object.prototype.hasOwnProperty.call(this.b, 'cover_image'))
    );
  }
  bookingImport() {
    return this.suffix === 'reservations/import/booking/async' && this.m === 'POST';
  }
  importStatus() {
    return this.suffix.startsWith('reservations/import/jobs/') && this.m === 'GET';
  }
  duplicate() {
    return (this.suffix === 'copy' || this.suffix === 'duplicate') && this.m === 'POST';
  }
  archive() {
    return !this.suffix && this.m === 'PUT' && Object.keys(this.b).every((key) => key === 'is_archived');
  }
  docsync() {
    return /^docsync\/(providers|connections|links|status)$/.test(this.suffix) && this.m === 'GET';
  }
  staysUnavailable() {
    return this.m === 'GET' && (this.suffix === 'bundle' || this.suffix === 'accommodations');
  }
  tourDraft() {
    return this.m === 'GET' && this.suffix === 'tour-draft';
  }
  tours() {
    return this.m === 'GET' && this.suffix === 'tours';
  }
  dayTitle() {
    return this.m === 'PUT' ? this.suffix.match(/^days\/([^/]+)$/) : null;
  }
  visitTiming() {
    return this.m === 'PUT' ? this.suffix.match(/^assignments\/([^/]+)\/(time|move)$/) : null;
  }
}
import type { ApplicationFileObservation, ApplicationStageProposal, TripDataContext } from './applicationHandler';
export function nativeApplicationAddons(
  f: { isEnabled: (name: 'vacay' | 'journey' | 'collections') => boolean },
  routePlanning = false
) {
  const globalNav: Record<string, string> = {
    vacay: 'CalendarDays',
    journey: 'Compass',
    atlas: 'Globe',
    collections: 'Bookmark',
  };
  const enabled: Record<string, boolean> = {
    packing: true,
    budget: true,
    documents: true,
    vacay: f.isEnabled('vacay'),
    journey: f.isEnabled('journey'),
    atlas: true,
    collections: f.isEnabled('collections'),
    roadtrip: routePlanning,
    tours: false,
    collab: false,
  };
  return {
    addons: Object.entries(enabled)
      .filter(([, on]) => on)
      .map(([id, on]) => ({
        id,
        name: id,
        type: id in globalNav ? 'global' : 'core',
        icon: globalNav[id] ?? '',
        enabled: on,
        config: {},
      })),
  };
}
export function weatherLocation(query: URLSearchParams, detailed: boolean) {
  const lat = query.get('lat'),
    lng = query.get('lng'),
    date = query.get('date') ?? undefined;
  if (!lat?.trim() || !lng?.trim()) return null;
  const latitude = Number(lat),
    longitude = Number(lng);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    (date ? !/^\d{4}-\d{2}-\d{2}$/.test(date) : detailed)
  )
    return null;
  return { lat, lng, date };
}
export function applicationSettingsPatch(
  p: string,
  b: Record<string, unknown>,
  object: (value: unknown) => Record<string, unknown>,
  text: (value: unknown, fallback?: string) => string
) {
  return p.endsWith('/bulk') ? object(b.settings) : p === '/settings' ? { [text(b.key)]: b.value } : b;
}
export function visitUpdateProposal(
  context: TripDataContext,
  locals: {
    rowId: string;
    day: TripDataContext['c']['days'][number];
    draft: Parameters<TripDataContext['changes']['payloadPlanItem']>[0];
  }
): ApplicationStageProposal {
  const { changes } = context;
  const { rowId, day, draft } = locals;
  return {
    module: 'plan_item',
    op: 'update',
    targetId: rowId,
    targetTable: 'schedule_items',
    tripDayId: day!.id,
    civilDate: day!.civilDay,
    payload: changes.payloadPlanItem(draft),
  };
}
export function assignmentRemoveProposal(
  context: TripDataContext,
  locals: { day: TripDataContext['c']['days'][number]; rowId: string; dayId: string }
): Parameters<TripDataContext['repo']['stage']>[0] {
  const { changes, tripId } = context;
  const { day, rowId, dayId } = locals;
  return {
    tripId,
    module: 'plan_item',
    op: 'remove',
    targetTable: 'schedule_items',
    targetId: rowId,
    tripDayId: dayId,
    civilDate: day.civilDay,
    payload: changes.payloadRemoveMarker(),
  };
}
export function assignmentAddProposal(
  context: TripDataContext,
  locals: {
    day: TripDataContext['c']['days'][number];
    draft: Parameters<TripDataContext['changes']['payloadPlanItem']>[0];
    dayId: string;
  }
): ApplicationStageProposal {
  const { changes } = context;
  const { day, draft, dayId } = locals;
  return {
    module: 'plan_item',
    op: 'add',
    payload: changes.payloadPlanItem(draft),
    tripDayId: dayId,
    civilDate: day.civilDay,
    targetTable: changes.targetTableForModule('plan_item'),
  };
}
export function assignmentMoveProposal(
  context: TripDataContext,
  locals: {
    day: TripDataContext['c']['days'][number];
    item: TripDataContext['c']['schedule'][number];
    u: Parameters<TripDataContext['schedule']['updateScheduleSortOrders']>[0][number];
  }
): Parameters<TripDataContext['repo']['stage']>[0] {
  const { changes, tripId } = context;
  const { day, item, u } = locals;
  return {
    tripId,
    module: 'plan_item',
    op: 'update',
    targetTable: changes.targetTableForModule('plan_item'),
    targetId: item.id,
    tripDayId: day.id,
    payload: changes.payloadPlanItem({
      activity: item.activity,
      placeId: item.placeId,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      sortOrder: u.sortOrder,
    }),
  };
}
export function noteRemoveProposal(
  context: TripDataContext,
  locals: { day: TripDataContext['c']['days'][number]; noteId: string | null }
): ApplicationStageProposal {
  const { changes } = context;
  const { day, noteId } = locals;
  return {
    module: 'day_note',
    op: 'remove',
    targetId: noteId,
    targetTable: 'day_notes',
    payload: changes.payloadRemoveMarker(),
    tripDayId: day.id,
    civilDate: day.civilDay,
  };
}
export function noteSaveProposal(
  context: TripDataContext,
  locals: { day: TripDataContext['c']['days'][number]; noteId: string | null; body: string }
): ApplicationStageProposal {
  const { changes } = context;
  const { day, noteId, body } = locals;
  return {
    module: 'day_note',
    op: noteId ? 'update' : 'add',
    targetId: noteId,
    targetTable: 'day_notes',
    payload: changes.payloadDayNote({ body }),
    tripDayId: day.id,
    civilDate: day.civilDay,
  };
}
export function observedFileMime(blob: Blob, observation: ApplicationFileObservation) {
  return blob.type || observation.row.mimeType || 'application/octet-stream';
}

import type { FamilyIdentityRegistry, IdentityKind } from './identity';
import * as recoveryBackend from './journeyRecovery';
import * as journeysBackend from './legacy/data/supabase/journeys';
import type { GalleryPhoto, Journey, JourneyDetail, JourneyEntry, JourneyPhoto } from './legacy/store/journeyStore';
import { NOT_HANDLED } from './listHandler';
import { readPreviewJournal } from './previewJournalReads';
import { handlePreviewJournalPhoto } from './previewJournalPhoto';
import { handlePreviewJournalText } from './previewJournalText';
import type { FamilyFrontendRepository } from './repository';
import { FamilyApiError } from './repository';
import { scopeFamilyOperations } from './requestContext';
import { routePlanningPreviewTripId } from './routePlanningPreview';
import type { FamilyRequest } from './transport';

const entryOwners = new WeakMap<FamilyIdentityRegistry, Map<string, string>>();
function journeyView(row: Journey | JourneyDetail, ids: FamilyIdentityRegistry): Record<string, unknown> {
  if ('entries' in row) {
    const owners = entryOwners.get(ids) ?? new Map<string, string>();
    for (const entry of row.entries) owners.set(String(entry.id), String(row.id));
    entryOwners.set(ids, owners);
  }
  const key = (kind: IdentityKind, value: string | number | null | undefined) =>
    value ? ids.register(kind, String(value)) : null;
  const photo = (p: JourneyPhoto | GalleryPhoto) => ({
    ...p,
    id: key('journeyPhoto', p.id),
    photo_id: key('media', p.photo_id),
    ...('entry_id' in p ? { entry_id: key('journeyEntry', p.entry_id) } : { journey_id: key('journey', p.journey_id) }),
    provider: 'family',
    owner_id: p.owner_id ? key('person', p.owner_id) : null,
  });
  const entry = (e: JourneyEntry) => ({
    ...e,
    id: key('journeyEntry', e.id),
    journey_id: key('journey', e.journey_id),
    author_id: key('person', e.author_id),
    source_trip_id: key('trip', e.source_trip_id),
    source_place_id: key('place', e.source_place_id),
    photos: e.photos.map(photo),
  });
  return {
    ...row,
    id: key('journey', row.id),
    user_id: key('person', row.user_id),
    ...('entries' in row
      ? {
          entries: row.entries.map(entry),
          gallery: row.gallery.map(photo),
          trips: row.trips.map((t) => ({ ...t, trip_id: key('trip', t.trip_id) })),
          contributors: row.contributors.map((c) => ({
            ...c,
            journey_id: key('journey', c.journey_id),
            user_id: key('person', c.user_id),
          })),
        }
      : {}),
  };
}
const bodyObject = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});
async function handleJourney(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const journeys = scopeFamilyOperations(repo, journeysBackend),
    recovery = scopeFamilyOperations(repo, recoveryBackend);
  if (!/^\/journeys(?:\/|$)/.test(request.pathname)) return NOT_HANDLED;
  const s = await repo.session(),
    v = await repo.views(),
    m = request.method;
  const parts = request.pathname.split('/').slice(2),
    b = bodyObject(request.body);
  const context: JourneyHandlerContext = { ...createJourneyContext(v), request, s, v, m, parts, b, journeys, recovery };
  const { uuid, view, array } = context;
  const previewTripId = routePlanningPreviewTripId();
  if (previewTripId) return handlePreviewJourney(repo, context, previewTripId);
  const route = new JourneyRoutes(parts, m);
  if (route.root()) {
    if (m === 'GET') return { journeys: (await journeys.listFamilyJourneys(s.familyId)).map(view) };
    if (m === 'POST')
      return view(
        await journeys.createFamilyJourney({
          familyId: s.familyId,
          title: String(b.title ?? ''),
          subtitle: typeof b.subtitle === 'string' ? b.subtitle : undefined,
          tripIds: array(b.trip_ids).map((id) => uuid('trip', id)),
        })
      );
  }
  if (route.journeyTrash()) {
    const cursor = request.query.get('before_id');
    const beforeDate = request.query.get('before_deleted_at');
    assertJourneyRecoveryCursor(cursor, beforeDate);
    const result = await recovery.journeyTrash(
      s.familyId,
      cursor ? { id: uuid('journey', cursor), deleted_at: beforeDate ?? '' } : undefined
    );
    return {
      ...result,
      journeys: result.journeys.map((j) => ({ ...j, id: v.ids.register('journey', j.id) })),
      next_cursor: result.next_cursor
        ? { ...result.next_cursor, id: v.ids.register('journey', result.next_cursor.id) }
        : null,
    };
  }
  if (route.availableTrips())
    return {
      trips: (await journeys.listFamilyJourneyAvailableTrips(s.familyId)).map((t) => ({
        ...t,
        id: v.ids.register('trip', t.id),
      })),
    };
  if (route.suggestions()) {
    const trips = await journeys.listFamilyJourneyAvailableTrips(s.familyId);
    return { trips: trips.filter((t) => !t.linked).map((t) => ({ ...t, id: v.ids.register('trip', t.id) })) };
  }
  if (route.entries()) return handleJourneyEntry(context, route);
  return handleJourneyRecord(context, route);
}

function handlePreviewJourney(repo: FamilyFrontendRepository, context: JourneyHandlerContext, tripId: string) {
  const { parts, uuid, request, v, view } = context;
  const resource = parts[1];
  if (!/^\d+$/.test(parts[0]) || parts.length > 2 ||
      (parts.length === 2 && !['preview-text', 'preview-photo'].includes(resource)))
    throw new FamilyApiError(404, 'journal_preview_unavailable', 'Only the linked Journal is available in this preview.');
  const id = uuid('journey', parts[0]);
  const preview = repo.captureContext(tripId, { revision: resource !== 'preview-photo' });
  if (resource === 'preview-text') return preview.perform(() => handlePreviewJournalText(request, v.ids, tripId, id));
  if (resource === 'preview-photo')
    return preview.perform(() => handlePreviewJournalPhoto(request, repo, v.ids, tripId, id));
  return preview.perform(async () => {
    const result = await readPreviewJournal(tripId, request, id);
    if (result.link?.journey_id !== id || result.journal?.id !== id)
      throw new FamilyApiError(503, 'journal_read_unavailable', 'The Journal is temporarily unavailable.');
    const detail = await journeysBackend.hydrateDetail(result.journal);
    preview.assertCurrent();
    return view(detail);
  });
}

export async function handleFamilyJourney(repo: FamilyFrontendRepository, request: FamilyRequest) {
  try {
    return await handleJourney(repo, request);
  } catch (error) {
    if (error instanceof FamilyApiError) throw error;
    const failure = error as { code?: string; message?: string };
    const status =
      failure?.code === '42501'
        ? 403
        : failure?.code === '40001' || failure?.code === '23503' || failure?.code === '0A000'
          ? 409
          : failure?.code === '23514' || failure?.code === '22023'
            ? 422
            : null;
    if (status)
      throw new FamilyApiError(
        status,
        'journey_' + failure.code,
        failure.code === '23503'
          ? 'This item is retained for journal recovery and cannot be permanently removed.'
          : (failure.message ?? 'Journal operation failed.')
      );
    throw error;
  }
}

function createJourneyContext(v: Awaited<ReturnType<FamilyFrontendRepository['views']>>) {
  const uuid = (kind: IdentityKind, value: unknown) => {
    try {
      return v.ids.uuid(kind, typeof value === 'number' ? value : String(value));
    } catch {
      throw new FamilyApiError(400, 'invalid_journal_identifier', 'Invalid journal identifier.');
    }
  };
  const view = (row: Journey | JourneyDetail) => journeyView(row, v.ids);
  const array = (value: unknown) => (Array.isArray(value) ? value : []);
  const revision = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
      throw new FamilyApiError(400, 'invalid_revision', 'A positive revision is required.');
    }
    return value;
  };
  const unavailable = (): never => {
    throw new FamilyApiError(
      422,
      'journey_feature_unavailable',
      'This journal feature is not configured in the Family backend.'
    );
  };
  return { uuid, view, array, revision, unavailable };
}
type JourneyHandlerContext = ReturnType<typeof createJourneyContext> & {
  request: FamilyRequest;
  s: Awaited<ReturnType<FamilyFrontendRepository['session']>>;
  v: Awaited<ReturnType<FamilyFrontendRepository['views']>>;
  m: string;
  parts: string[];
  b: Record<string, unknown>;
  journeys: typeof journeysBackend;
  recovery: typeof recoveryBackend;
};
class JourneyRoutes {
  constructor(
    private readonly parts: string[],
    private readonly m: string
  ) {}
  root() {
    return !this.parts[0];
  }
  journeyTrash() {
    return this.parts[0] === 'recovery' && this.parts.length === 1 && this.m === 'GET';
  }
  availableTrips() {
    return this.parts[0] === 'available-trips' && this.m === 'GET';
  }
  suggestions() {
    return this.parts[0] === 'suggestions' && this.m === 'GET';
  }
  entries() {
    return this.parts[0] === 'entries';
  }
  entryHistory() {
    return this.parts.length === 3 && this.parts[2] === 'history' && this.m === 'GET';
  }
  entryRestore() {
    return this.parts.length === 3 && this.parts[2] === 'restore' && this.m === 'POST';
  }
  entryRestoreVersion() {
    return this.parts.length === 3 && this.parts[2] === 'restore-version' && this.m === 'POST';
  }
  entryDelete() {
    return this.parts.length === 2 && this.m === 'DELETE';
  }
  entryPatch() {
    return this.parts.length === 2 && this.m === 'PATCH';
  }
  entryUpload() {
    return this.parts[2] === 'photos' && this.parts.length === 3 && this.m === 'POST';
  }
  linkPhoto() {
    return this.parts[2] === 'link-photo' && this.m === 'POST';
  }
  reorderEntryPhotos() {
    return this.parts[2] === 'photos' && this.parts[3] === 'reorder' && this.m === 'PUT';
  }
  removeEntryPhoto() {
    return this.parts[2] === 'photos' && this.parts[3] && this.m === 'DELETE';
  }
  entryTrash() {
    return this.parts.length === 2 && this.parts[1] === 'recovery' && this.m === 'GET';
  }
  journeyRestore() {
    return this.parts.length === 2 && this.parts[1] === 'restore' && this.m === 'POST';
  }
  journeyDelete() {
    return this.parts.length === 1 && this.m === 'DELETE';
  }
  single() {
    return this.parts.length === 1;
  }
  entryList() {
    return this.parts[1] === 'entries' && this.parts.length === 2;
  }
  reorderEntries() {
    return this.parts[1] === 'entries' && this.parts[2] === 'reorder' && this.m === 'PUT';
  }
  tripLinks() {
    return this.parts[1] === 'trips';
  }
  unlinkTrip() {
    return this.m === 'DELETE' && this.parts[2];
  }
  preferences() {
    return this.parts[1] === 'preferences' && this.m === 'PATCH';
  }
  contributors() {
    return this.parts[1] === 'contributors';
  }
  removeGallery() {
    return this.parts[1] === 'gallery' && this.parts[2] && this.m === 'DELETE';
  }
  shareLink() {
    return this.parts[1] === 'share-link' && this.m === 'GET';
  }
  galleryUpload() {
    return (
      ((this.parts[1] === 'gallery' && this.parts[2] === 'photos') || this.parts[1] === 'cover') && this.m === 'POST'
    );
  }
}
function journeyEntryRestricted(b: Record<string, unknown>) {
  return (b.visibility && b.visibility !== 'family') || b.is_draft === true || b.stats_excluded === true;
}
function journeyEntryPayload(b: Record<string, unknown>, uuid: JourneyHandlerContext['uuid']) {
  return {
    ...b,
    ...(b.source_trip_id ? { source_trip_id: uuid('trip', b.source_trip_id) } : {}),
    ...(b.source_place_id ? { place_id: uuid('place', b.source_place_id) } : {}),
  };
}
function assertJourneyMetadataFields(b: Record<string, unknown>, unavailable: JourneyHandlerContext['unavailable']) {
  if (Object.keys(b).some((key) => !['title', 'subtitle', 'status'].includes(key))) unavailable();
}
function assertJourneyMemberRole(b: Record<string, unknown>, unavailable: JourneyHandlerContext['unavailable']) {
  if (b.role !== 'editor' && b.role !== 'viewer') unavailable();
}
function journeyMemberPerson(parts: string[], b: Record<string, unknown>, uuid: JourneyHandlerContext['uuid']) {
  return uuid('person', parts[2] ?? b.user_id);
}
function assertJourneyRecoveryCursor(cursor: string | null, beforeDate: string | null) {
  if (
    (cursor === null) !== (beforeDate === null) ||
    (beforeDate !== null && !Number.isFinite(Date.parse(beforeDate)))
  ) {
    throw new FamilyApiError(400, 'invalid_recovery_cursor', 'A valid paired recovery cursor is required.');
  }
}
function assertJourneyEntryFields(b: Record<string, unknown>, unavailable: JourneyHandlerContext['unavailable']) {
  if (journeyEntryRestricted(b)) unavailable();
}
function assertJourneyEntryDraftFlags(b: Record<string, unknown>, unavailable: JourneyHandlerContext['unavailable']) {
  if (b.is_draft === true || b.stats_excluded === true) unavailable();
}
function journeyShareResponse(route: JourneyRoutes, unavailable: JourneyHandlerContext['unavailable']) {
  if (route.shareLink()) return { link: null, available: false };
  unavailable();
}
async function handleJourneyEntry(context: JourneyHandlerContext, route: JourneyRoutes) {
  const { request, s, v, parts, b, journeys, recovery, uuid, view, array, revision, unavailable } = context;
  const entryId = uuid('journeyEntry', parts[1]);
  if (route.entryHistory()) {
    const result = await recovery.entryHistory(
      entryId,
      request.query.has('before_revision') ? revision(Number(request.query.get('before_revision'))) : undefined
    );
    return { ...result, entry_id: v.ids.register('journeyEntry', result.entry_id) };
  }
  if (route.entryRestore()) {
    await recovery.restoreEntry(entryId, revision(b.expected_revision));
    return { success: true };
  }
  if (route.entryRestoreVersion()) {
    await recovery.restoreEntryVersion(entryId, revision(b.revision), revision(b.expected_revision));
    return { success: true };
  }
  if (route.entryDelete()) {
    await journeys.deleteFamilyJourneyEntry(entryId);
    return { success: true };
  }
  if (route.entryPatch()) {
    assertJourneyEntryFields(b, unavailable);
    assertJourneyEntryDraftFlags(b, unavailable);
    const owner = entryOwners.get(v.ids)?.get(entryId);
    if (owner) {
      const updated = await journeys.upsertFamilyJourneyEntry(owner, b, entryId);
      return (view(updated).entries as Record<string, unknown>[]).find(
        (entry) => v.ids.uuid('journeyEntry', entry.id as number) === entryId
      );
    }
    throw new FamilyApiError(404, 'entry_unavailable', 'This journal entry is unavailable.');
  }
  if (route.entryUpload() && request.body instanceof FormData) {
    const owner = entryOwners.get(v.ids)?.get(entryId);
    if (!owner) throw new FamilyApiError(404, 'entry_unavailable', 'This entry is unavailable.');
    for (const file of request.body.values())
      if (file instanceof File)
        await journeys.uploadJourneyImage({ familyId: s.familyId, journeyId: owner, entryId, file });
    const updated = journeyView(await journeys.getFamilyJourney(owner), v.ids);
    const entry = (updated.entries as Record<string, unknown>[]).find(
      (entry) => v.ids.uuid('journeyEntry', entry.id as number) === entryId
    );
    return { photos: entry?.photos ?? [] };
  }
  if (route.linkPhoto()) {
    await journeys.attachFamilyJourneyEntryMedia(entryId, uuid('journeyPhoto', b.journey_photo_id));
    return { success: true };
  }
  if (route.reorderEntryPhotos()) {
    await journeys.reorderFamilyJourneyEntryMedia(
      entryId,
      array(b.orderedIds).map((id) => uuid('journeyPhoto', id))
    );
    return { success: true };
  }
  if (route.removeEntryPhoto()) {
    await journeys.detachFamilyJourneyEntryMedia(entryId, uuid('journeyPhoto', parts[3]));
    return { success: true };
  }
  unavailable();
}
async function handleJourneyRecord(context: JourneyHandlerContext, route: JourneyRoutes) {
  const { request, v, parts, b, journeys, recovery, uuid, revision } = context;
  const id = uuid('journey', parts[0]);
  if (route.entryTrash()) {
    const cursor = request.query.get('before_id');
    const beforeDate = request.query.get('before_deleted_at');
    assertJourneyRecoveryCursor(cursor, beforeDate);
    const result = await recovery.entryTrash(
      id,
      cursor ? { id: uuid('journeyEntry', cursor), deleted_at: beforeDate ?? '' } : undefined
    );
    return {
      ...result,
      entries: result.entries.map((entry) => ({ ...entry, id: v.ids.register('journeyEntry', entry.id) })),
      next_cursor: result.next_cursor
        ? { ...result.next_cursor, id: v.ids.register('journeyEntry', result.next_cursor.id) }
        : null,
    };
  }
  if (route.journeyRestore()) {
    await recovery.restoreJourney(id, revision(b.expected_revision));
    return { success: true };
  }
  if (route.journeyDelete()) {
    await journeys.deleteFamilyJourney(id);
    return { success: true };
  }
  const detail = await journeys.getFamilyJourney(id);
  return handleJourneyDetail(context, route, id, detail);
}
async function handleJourneyDetail(
  context: JourneyHandlerContext,
  route: JourneyRoutes,
  id: string,
  detail: JourneyDetail
) {
  const { request, s, v, m, parts, b, journeys, uuid, view, array, unavailable } = context;
  if (route.single()) {
    if (m === 'GET') return view(detail);
    if (m === 'PATCH') {
      assertJourneyMetadataFields(b, unavailable);
      return view(await journeys.updateFamilyJourney(id, b));
    }
  }
  if (route.entryList()) {
    if (m === 'GET') return { entries: view(detail).entries };
    if (m === 'POST') {
      assertJourneyEntryFields(b, unavailable);
      const payload = journeyEntryPayload(b, uuid);
      const updated = await journeys.upsertFamilyJourneyEntry(id, payload);
      const previous = new Set(detail.entries.map((e) => String(e.id)));
      return (view(updated).entries as Record<string, unknown>[]).find(
        (entry) => !previous.has(v.ids.uuid('journeyEntry', entry.id as number))
      );
    }
  }
  if (route.reorderEntries()) {
    await journeys.reorderFamilyJourneyEntries(
      id,
      array(b.orderedIds).map((value) => uuid('journeyEntry', value))
    );
    return { success: true };
  }
  if (route.tripLinks()) {
    if (m === 'POST') return view(await journeys.linkFamilyJourneyTrip(id, uuid('trip', b.trip_id)));
    if (route.unlinkTrip()) return view(await journeys.unlinkFamilyJourneyTrip(id, uuid('trip', parts[2])));
  }
  if (route.preferences()) return view(await journeys.setFamilyJourneyMemberPreferences(id, Boolean(b.hide_skeletons)));
  if (route.contributors()) {
    const personId = journeyMemberPerson(parts, b, uuid);
    if (m === 'DELETE') return view(await journeys.removeFamilyJourneyMember(id, personId));
    assertJourneyMemberRole(b, unavailable);
    return view(await journeys.addFamilyJourneyMember(id, personId, b.role as 'editor' | 'viewer'));
  }
  if (route.removeGallery()) {
    await journeys.deleteFamilyJourneyMedia(uuid('journeyPhoto', parts[2]));
    return { success: true };
  }
  if (route.galleryUpload() && request.body instanceof FormData) {
    const files = [...request.body.values()].filter((value): value is File => value instanceof File);
    for (const file of files) await journeys.uploadJourneyImage({ familyId: s.familyId, journeyId: id, file });
    const updated = await journeys.getFamilyJourney(id);
    if (parts[1] === 'cover') {
      const added = updated.gallery.find((photo) => !detail.gallery.some((before) => before.id === photo.id));
      if (added) return view(await journeys.setFamilyJourneyCover(id, String(added.photo_id)));
    }
    return { photos: view(updated).gallery };
  }
  return journeyShareResponse(route, unavailable);
}

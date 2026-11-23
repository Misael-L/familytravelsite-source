import type { FileLinksResponse } from '@trek/shared';
import type { FamilyIdentityRegistry } from './identity';
import type { FamilyTripFileLink } from './legacy/data/supabase/tripFiles';
import { NOT_HANDLED } from './listHandler';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { scopeFamilyOperations } from './requestContext';
import type { FamilyRequest } from './transport';
type FileViews = Awaited<ReturnType<FamilyFrontendRepository['views']>>;
type FileRows = Awaited<ReturnType<FamilyFrontendRepository['readers']['files']['listTripFiles']>>;

function fileRequestBody(request: FamilyRequest) {
  return request.body instanceof FormData
    ? Object.fromEntries(request.body.entries())
    : request.body && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {};
}

function fileRequestIdentity(parts: string[], v: FileViews) {
  return parts[0] && parts[0] !== 'trash' ? v.ids.uuid('file', parts[0]) : null;
}

function fileRequestTrash(parts: string[], request: FamilyRequest) {
  return (
    parts[1] === 'restore' || parts[1] === 'permanent' || parts[0] === 'trash' || request.query.get('trash') === 'true'
  );
}

function fileRowForId(rows: FileRows, id: string | null) {
  const row = rows.find((r) => r.id === id);
  if (id && !row) throw new FamilyApiError(404, 'file_unavailable', 'This file is unavailable.');
  return row;
}

function fileUploadInput(b: Record<string, unknown>) {
  const upload = b.file;
  if (!(upload instanceof File)) throw new FamilyApiError(422, 'file_required', 'Select a file to upload.');
  if (b.assignment_id || b.budget_item_id)
    throw new FamilyApiError(422, 'file_link_unavailable', 'Family files link to a place, reservation or trip day.');
  return upload;
}

function validateFileMetadata(b: Record<string, unknown>) {
  if (Object.keys(b).some((k) => k !== 'description'))
    throw new FamilyApiError(422, 'file_metadata_unavailable', 'Use the file link controls to change attachments.');
}

function fileCollectionRoute(id: string | null, parts: string[], m: string) {
  if (!id && !parts[0] && m === 'POST') return 'upload';
  if (parts[0] === 'trash' && parts[1] === 'empty' && m === 'DELETE') return 'empty-trash';
  return null;
}

function fileLinkRoute(parts: string[], m: string) {
  if (parts[1] === 'links' && m === 'GET') return 'list';
  if (parts[1] === 'link') {
    if (m === 'POST') return 'add';
    if (m === 'DELETE' && parts[2]) return 'remove';
  }
  return null;
}

function fileRowRoute(parts: string[], m: string) {
  if (m === 'PUT') return 'metadata';
  if (m === 'PATCH' && parts[1] === 'star') return 'star';
  if (m === 'POST' && parts[1] === 'restore') return 'restore';
  if (m === 'DELETE') return 'delete';
  return null;
}

function fileUploadHasLink(b: Record<string, unknown>) {
  return Boolean(b.place_id || b.reservation_id || b.day_id);
}

export async function handleFamilyFile(
  repo: FamilyFrontendRepository,
  request: FamilyRequest,
  tripId: string,
  suffix: string
) {
  if (!/^files(\/|$)/.test(suffix)) return NOT_HANDLED;
  const { method: m } = request;
  const parts = suffix.split('/').slice(1);
  if (m === 'GET' && !parts[0]) return repo.fileList(tripId, request.query.get('trash') === 'true');
  const [v, session] = await Promise.all([repo.views(), repo.session()]);
  const f = scopeFamilyOperations(repo, repo.readers.files);
  const b = fileRequestBody(request);
  const id = fileRequestIdentity(parts, v);
  const rows = await f.listTripFiles(tripId, {
    trash: fileRequestTrash(parts, request),
  });
  const row = fileRowForId(rows, id);
  const write = <T>(key: string, fn: () => Promise<T>) => repo.write(tripId, key, fn);
  const linkView = (link: FamilyTripFileLink) => familyFileLinkView(link, v.ids);
  const addLink = async (fileId: string) => {
    if (b.assignment_id || b.budget_item_id)
      throw new FamilyApiError(422, 'file_link_unavailable', 'Family files link to a place, reservation or trip day.');
    const ref = (kind: import('./identity').IdentityKind, value: unknown) =>
      value ? v.ids.uuid(kind, typeof value === 'number' ? value : String(value)) : null;
    const target = {
      placeId: ref('place', b.place_id),
      reservationId: ref('reservation', b.reservation_id),
      tripDayId: ref('day', b.day_id),
    };
    const c = await repo.core(tripId);
    if (
      (target.placeId && !c.places.some((p) => p.id === target.placeId)) ||
      (target.tripDayId && !c.days.some((d) => d.id === target.tripDayId))
    )
      throw new FamilyApiError(404, 'link_target_unavailable', 'The link target is not part of this trip.');
    if (target.reservationId) {
      const all = await repo.reservationList(tripId);
      if (!all.reservations.some((r) => v.ids.uuid('reservation', r.id) === target.reservationId))
        throw new FamilyApiError(404, 'link_target_unavailable', 'The reservation is not part of this trip.');
    }
    if (Object.values(target).some(Boolean)) await f.addTripFileLink(fileId, target);
  };
  const collectionRoute = fileCollectionRoute(id, parts, m);
  if (collectionRoute === 'upload') {
    const upload = fileUploadInput(b);
    const saved = await write('trip.files.upload', () =>
      f.uploadTripFile({
        familyId: session.familyId,
        tripId,
        file: upload,
        uploadedBy: session.personId,
      })
    );
    if (b.description)
      await write('trip.files.metadata', () => f.patchTripFile(saved, { description: String(b.description) }));
    if (fileUploadHasLink(b)) await write('trip.files.metadata', () => addLink(saved));
    return {
      file: (await repo.fileList(tripId)).files.find((r) => v.ids.uuid('file', r.id) === saved),
    };
  }
  if (collectionRoute === 'empty-trash') {
    await write('trip.files.trash', () => f.emptyTripFileTrash(tripId));
    return { success: true };
  }
  if (row && id) {
    const linkRoute = fileLinkRoute(parts, m);
    if (linkRoute === 'list') return { links: row.links.map(linkView) };
    if (linkRoute === 'add') {
      await write('trip.files.metadata', () => addLink(id));
      return { links: (await f.listTripFileLinks(id)).map(linkView) };
    }
    if (linkRoute === 'remove') {
      const linkId = v.ids.uuid('fileLink', parts[2]);
      if (!row.links.some((l) => l.id === linkId))
        throw new FamilyApiError(404, 'link_unavailable', 'File link unavailable.');
      await write('trip.files.metadata', () => f.removeTripFileLink(linkId));
      return { success: true };
    }
    const rowRoute = fileRowRoute(parts, m);
    if (rowRoute === 'metadata') {
      validateFileMetadata(b);
      await write('trip.files.metadata', () =>
        f.patchTripFile(id, { description: b.description == null ? null : String(b.description) })
      );
    } else if (rowRoute === 'star')
      await write('trip.files.metadata', () => f.patchTripFile(id, { starred: !row.starred }));
    else if (rowRoute === 'restore') await write('trip.files.trash', () => f.restoreTripFile(id));
    else if (rowRoute === 'delete')
      await write('trip.files.trash', () =>
        parts[1] === 'permanent' ? f.permanentlyDeleteTripFile(row) : f.softDeleteTripFile(id)
      );
    else throw new FamilyApiError(422, 'file_action_unavailable', 'File action unavailable.');
    if (m === 'DELETE') return { success: true };
    return {
      file: (await repo.fileList(tripId)).files.find((r) => v.ids.uuid('file', r.id) === id),
    };
  }
  throw new FamilyApiError(422, 'file_action_unavailable', 'File action unavailable.');
}

function familyFileLinkView(
  link: FamilyTripFileLink,
  ids: FamilyIdentityRegistry
): FileLinksResponse['links'][number] & { day_id: number | null } {
  return {
    id: ids.register('fileLink', link.id),
    file_id: ids.register('file', link.fileId),
    place_id: link.placeId ? ids.register('place', link.placeId) : null,
    reservation_id: link.reservationId ? ids.register('reservation', link.reservationId) : null,
    day_id: link.tripDayId ? ids.register('day', link.tripDayId) : null,
    assignment_id: null,
    budget_item_id: null,
    created_at: null,
    reservation_title: null,
  };
}

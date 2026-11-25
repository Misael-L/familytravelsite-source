import { collectionUnavailable } from './collectionCohort';
import { getFamilyCollectionCohort, saveFamilyCollectionEdit } from './collectionRuntime';
import { NOT_HANDLED } from './listHandler';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
const UNCONNECTED_TRANSFERS = new Set([
  '/addons/collections/places',
  '/addons/collections/places/from-trip',
  '/addons/collections/places/from-trip-many',
  '/addons/collections/copy-to-trip',
]);
function removalNeedsRecovery(request: FamilyRequest) {
  const path = request.pathname.replace(/\/+$/, '');
  return (
    (request.method === 'DELETE' && /^\/addons\/collections\/places\/[^/]+$/.test(path)) ||
    (request.method === 'POST' && path === '/addons/collections/places/delete-many')
  );
}
function assertHeldCollectionRoutes(request: FamilyRequest, path: string) {
  if (request.method === 'POST' && UNCONNECTED_TRANSFERS.has(path))
    throw new FamilyApiError(
      422,
      'collection_transfer_unavailable',
      'Saving or copying locations between Trips and Collections is not available yet. Nothing was copied.'
    );
  if (removalNeedsRecovery(request))
    throw new FamilyApiError(
      422,
      'collection_recovery_unavailable',
      'Removing saved Collection items is unavailable until Trash and Restore are connected. Nothing was removed.'
    );
}
export async function handleFamilyCollection(repo: FamilyFrontendRepository, request: FamilyRequest) {
  if (!/^\/addons\/collections(?:\/|$)/.test(request.pathname)) return NOT_HANDLED;
  const requestContext = repo.captureContext(undefined, { revision: false });
  await repo.session();
  requestContext.assertCurrent();
  const path = request.pathname.replace(/\/+$/, ''),
    m = request.method;
  assertHeldCollectionRoutes(request, path);
  if (path === '/addons/collections/membership') {
    let target: unknown;
    try {
      const text = request.query.get('family_identity');
      if (!text || text.length > 2048) throw Error();
      target = JSON.parse(text);
    } catch {
      throw new FamilyApiError(
        400,
        'collection_membership_identity',
        'Use the canonical catalog, saved Trip location or Collection item identity.'
      );
    }
    const cohort = await getFamilyCollectionCohort(repo),
      lease = await cohort.membership(target);
    try {
      return lease.native;
    } finally {
      lease.retire();
    }
  }
  const known =
    (m === 'GET' && (path === '/addons/collections' || /^\/addons\/collections\/\d+$/.test(path))) ||
    (m === 'PATCH' && /^\/addons\/collections\/places\/\d+$/.test(path));
  if (!known) return collectionUnavailable();
  const cohort = await getFamilyCollectionCohort(repo);
  if (path === '/addons/collections' && m === 'GET') {
    const result = await cohort.library();
    return { collections: result.collections.flatMap((r) => (r.native ? [r.native] : [])), incomingInvites: [] };
  }
  const match = path.match(/^\/addons\/collections\/(\d+)$/);
  if (match && m === 'GET') {
    const d = await cohort.detail(Number(match[1]));
    if (d.root.native === null)
      throw new FamilyApiError(
        422,
        'collection_owner_unlinked',
        'This Collection has no linked owner. Its data remains retained.'
      );
    return { collection: d.root.native, places: d.items.map((i) => i.native) };
  }
  const edit = path.match(/^\/addons\/collections\/places\/(\d+)$/);
  if (edit && m === 'PATCH') {
    const result = await saveFamilyCollectionEdit(Number(edit[1]), request.body, repo);
    return result.item?.native ?? null;
  }
  return collectionUnavailable();
}

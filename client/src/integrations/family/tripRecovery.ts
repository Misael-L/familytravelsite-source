import { clearTripData } from '../../db/offlineDb';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import { NOT_HANDLED } from './listHandler';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

export interface TripTrashPage<Id extends string | number = string> {
  trip_recovery_version: number;
  available?: boolean;
  trips: { id: Id; name: string; title?: string; revision: number; deleted_at: string; archived_at: string | null }[];
  has_more: boolean;
  next_cursor: { id: Id; deleted_at: string } | null;
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  if (data == null) throw new Error('The Trip operation returned no saved result.');
  return data as T;
}
async function listTrash(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const session = await repo.session();
  const { ids } = await repo.views();
  const before = request.query.get('before_id');
  const date = request.query.get('before_deleted_at');
  if ((before === null) !== (date === null) || (date !== null && !Number.isFinite(Date.parse(date))))
    throw new FamilyApiError(400, 'invalid_recovery_cursor', 'A valid paired recovery cursor is required.');
  let beforeId: string | undefined;
  if (before !== null) {
    try {
      beforeId = ids.uuid('trip', before);
    } catch {
      throw new FamilyApiError(400, 'invalid_trip_identifier', 'Invalid Trip identifier.');
    }
  }
  let page: TripTrashPage;
  try {
    page = await rpc<TripTrashPage>('list_family_trip_trash', {
      p_family_id: session.familyId,
      ...(beforeId ? { p_before_trip_id: beforeId, p_before_deleted_at: date } : {}),
    });
  } catch (e) {
    const error = e as { code?: string; message?: string };
    if (['PGRST202', '42883'].includes(error.code ?? '') && error.message?.includes('list_family_trip_trash'))
      return { available: false, trip_recovery_version: 0, trips: [], has_more: false, next_cursor: null };
    throw e;
  }
  return {
    ...page,
    trips: page.trips.map((trip) => ({ ...trip, title: trip.name, id: ids.register('trip', trip.id) })),
    next_cursor: page.next_cursor ? { ...page.next_cursor, id: ids.register('trip', page.next_cursor.id) } : null,
  };
}
function raiseFailure(e: unknown): never {
  if (e instanceof FamilyApiError) throw e;
  const error = e as { code?: string; message?: string };
  const status =
    error.code === '42501'
      ? 403
      : ['40001', '0A000'].includes(error.code ?? '')
        ? 409
        : error.code === '22023'
          ? 422
          : null;
  if (status) throw new FamilyApiError(status, 'trip_' + error.code, error.message ?? 'Trip recovery failed.');
  throw e;
}
export async function handleFamilyTripRecovery(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(/^\/trips\/([^/]+)(?:\/(restore))?$/);
  if (
    !match ||
    (!(request.pathname === '/trips/recovery' && request.method === 'GET') &&
      !(request.method === 'DELETE' && !match[2]) &&
      !(request.method === 'POST' && match[2] === 'restore'))
  )
    return NOT_HANDLED;
  const views = await repo.views();
  const uuid = (value: string) => {
    try {
      return views.ids.uuid('trip', value);
    } catch {
      throw new FamilyApiError(400, 'invalid_trip_identifier', 'Invalid Trip identifier.');
    }
  };
  try {
    if (request.pathname === '/trips/recovery') {
      return await listTrash(repo, request);
    }
    await repo.session();
    const tripId = uuid(match[1]);
    if (request.method === 'POST') {
      const body = request.body as { expected_revision?: unknown };
      if (
        typeof body?.expected_revision !== 'number' ||
        !Number.isSafeInteger(body.expected_revision) ||
        body.expected_revision < 1
      )
        throw new FamilyApiError(400, 'invalid_revision', 'A positive Trip revision is required.');
      await rpc('restore_family_trip', { p_trip_id: tripId, p_expected_revision: body.expected_revision });
    } else {
      await rpc('trash_family_trip', { p_trip_id: tripId });
    }
    repo.invalidate(tripId);
    try {
      await clearTripData(views.ids.register('trip', tripId));
    } catch {
      throw new FamilyApiError(
        409,
        'trip_cache_refresh_required',
        'Trip saved. Reload the app to refresh its offline cache.'
      );
    }
    return { success: true };
  } catch (e) {
    raiseFailure(e);
  }
}

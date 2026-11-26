import { z, ZodError } from 'zod';
import { NOT_HANDLED } from './listHandler';
import {
  createLocationRequest,
  locationId,
  locationLifecycleRequest,
  locationReceiptSchema,
  updateLocationRequest,
} from './planLocationContract';
import { getPlanLocation, listPlanLocations, locationRpc, savedLocationResponse } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

const pageQuery = z
  .object({
    state: z.enum(['active', 'trash']).default('active'),
    after_id: locationId.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();
function failure(error: unknown): never {
  if (error instanceof FamilyApiError) throw error;
  if (error instanceof ZodError)
    throw new FamilyApiError(400, 'invalid_saved_location_contract', 'Invalid saved location request.');
  const e = error as { code?: string; message?: string };
  const status =
    e.code === 'invalid_uuid' || e.code === 'unknown_view_key'
      ? 400
      : e.code === '42501'
        ? 403
        : e.code === '40001' || e.code === '0A000'
          ? 409
          : e.code?.startsWith('23')
            ? 422
            : e.code === '22P02' || e.code === '22023'
              ? 400
              : e.code === 'PGRST202' || e.code === '42883'
                ? 503
                : null;
  if (status)
    throw new FamilyApiError(status, 'saved_location_' + e.code, e.message ?? 'Saved location operation failed.');
  throw error;
}
async function currentScope(repo: FamilyFrontendRepository, ids: import('./identity').FamilyIdentityRegistry) {
  if ((await repo.views()).ids !== ids)
    throw new FamilyApiError(
      409,
      'stale_saved_location_session',
      'The Family session changed. Reload saved locations.'
    );
}
/** An explicit versioned domain route; native city/assignment routes stay intact until their joint cutover. */
export async function handleFamilyPlanLocations(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(
    /^\/trips\/([^/]+)\/family\/plan-locations(?:\/([^/]+)(?:\/(trash|restore))?)?$/
  );
  if (!match) return NOT_HANDLED;
  try {
    await repo.session();
    const trip = await repo.tripUuid(match[1]),
      views = await repo.views();
    const id = match[2] ? locationId.parse(match[2]) : null,
      action = match[3];
    if (request.method === 'GET' && !action) {
      if (id) {
        const result = await getPlanLocation(trip, id, views.ids);
        await currentScope(repo, views.ids);
        return result;
      }
      const query = pageQuery.parse(Object.fromEntries(request.query));
      const result = await listPlanLocations(trip, views.ids, {
        state: query.state,
        after: query.after_id ?? null,
        limit: query.limit,
      });
      await currentScope(repo, views.ids);
      return result;
    }
    return await writeLocation(repo, request, { trip, ids: views.ids, id, action });
  } catch (error) {
    failure(error);
  }
}

async function writeLocation(
  repo: FamilyFrontendRepository,
  request: FamilyRequest,
  context: {
    trip: string;
    ids: import('./identity').FamilyIdentityRegistry;
    id: string | null;
    action: string | undefined;
  }
) {
  const { trip, ids, id, action } = context;
  const create = request.method === 'POST' && !id;
  const edit = request.method === 'PUT' && id && !action;
  const lifecycle = request.method === 'POST' && id && action;
  if (!create && !edit && !lifecycle)
    throw new FamilyApiError(405, 'saved_location_method', 'Unsupported saved location method.');
  const body = create
    ? createLocationRequest.parse(request.body)
    : edit
      ? updateLocationRequest.parse(request.body)
      : locationLifecycleRequest.parse(request.body);
  const { operation_id, ...rest } = body;
  const revision = 'expected_revision' in rest ? rest.expected_revision : null;
  const payload = Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'expected_revision'));
  await currentScope(repo, ids);
  const operation = savedLocationResponse(
    locationReceiptSchema,
    await locationRpc('mutate_family_trip_location_v1', {
      p_trip_id: trip,
      p_operation_id: operation_id,
      p_action: create ? 'create' : edit ? 'update' : action,
      p_location_id: id,
      p_expected_revision: revision,
      p_payload: payload,
    })
  );
  await currentScope(repo, ids);
  repo.invalidate(trip);
  const result = await getPlanLocation(trip, operation.id, ids);
  await currentScope(repo, ids);
  return { ...result, operation };
}

import {
  budgetItemSchema,
  categorySchema,
  reservationSchema,
  tagSchema,
  tripFileSchema,
  tripMemberSchema,
} from '@trek/shared';
import { z } from 'zod';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import type { Category, Tag } from '../../types';
import { createCoherentPlannerBundle } from './coherentPlannerBundle';
import { coherentStayQualificationEnabled } from './coherentStayQualification';
import { createPackingCategoryTransport } from './packingCategoryTransport';
import { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import { assertBookingCalendar, createPlannerBookingReader } from './plannerBookings';
import { reconcilePlannerResources } from './plannerCohortRelations';
import { captureCompleteTrip, completeTripCapture, retireRefusedCompleteTrip } from './plannerCompleteCapture';
import { createPlannerPackingReader } from './plannerPacking';
import { guardedPlannerRead, type PlannerReadGuard } from './plannerReadGuard';
import { createPlannerTaskReader } from './plannerTasks';
import type { createPlannerViewReader } from './plannerView';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyHandler } from './transport';

type StayProjection = Pick<import('../../repo/plannerReadPort').PlannerStayRead, 'accommodations' | 'generation'>;
type BundleOptions = {
  source: () => string;
  categoryMetadata?: boolean;
  categoryIdentity?: boolean;
  bagManagement?: boolean;
};
/** Planner pool/days/visits come from one checked view. Ancillary tabs remain separate authenticated reads. */
export function createPlannerBundle(
  repo: FamilyFrontendRepository,
  reader: ReturnType<typeof createPlannerViewReader>,
  app: FamilyHandler,
  disposed: () => boolean,
  sourceOrOptions: (() => string) | BundleOptions
) {
  const options = typeof sourceOrOptions === 'function' ? { source: sourceOrOptions } : sourceOrOptions;
  const source = options.source;
  const coherent = coherentStayQualificationEnabled() ? createCoherentPlannerBundle(repo, disposed, source) : null;
  const bookings = createPlannerBookingReader(repo, disposed, source);
  const tasks = createPlannerTaskReader(repo, disposed, source);
  const packingReader = bundlePackingReader(repo, disposed, options);
  return async (value: number | string, signal?: AbortSignal, inherited?: PlannerReadGuard) => {
    if (coherent) return coherent(value, signal, inherited);
    const privateSession = captureReadSession();
    requireBundleConnection();
    const session = await repo.session(),
      trip = await repo.tripUuid(value),
      ids = (await repo.views()).ids,
      layer = repo.getLayer(trip),
      origin = source();
    return guardedPlannerRead(
      privateSession,
      { uuid: trip, native: ids.register('trip', trip) },
      () => new FamilyApiError(409, 'planner_local_work', 'Trip refresh is held to preserve local work.'),
      async (guard) => {
        let invalidated = false;
        const unsubscribe = repo.subscribe((id) => {
          if (id === trip) invalidated = true;
        });
        const viewTask = reader.read(trip, layer, signal, guard);
        try {
          const get = bundleGet(app, trip, signal);
          const [view, header, packing, todo, budget, reservations, files, members, categories, tags] =
            await Promise.all([
              viewTask,
              repo.readers.trips.fetchTripById(trip),
              packingReader.read(trip, signal, guard),
              tasks.read(trip, signal, guard),
              get('budget'),
              bookings.read(trip, signal),
              get('files'),
              get('members'),
              repo.categories(),
              app({ method: 'GET', pathname: '/tags', query: new URLSearchParams(), body: undefined, signal }),
            ]);
          const fence = async () => {
            await checkBundleContext(
              repo,
              { session, trip, ids, layer, origin },
              {
                disposed,
                source,
                invalidated: () => invalidated,
                signal,
              }
            );
            await todo.fence();
            await packing.fence();
            await reservations.fence();
            await guard.check();
          };
          await fence();
          if (!header || header.id !== trip || header.family_id !== session.familyId)
            throw new FamilyApiError(403, 'planner_bundle_scope', 'Trip header scope is unavailable.');
          await todo.fence();
          await packing.fence();
          assertBookingCalendar(reservations.packet, view.state);
          const related = reconcilePlannerResources(
            {
              packingItems: packing.items,
              todoItems: todo.items, // Already checked and projected from the canonical task packet.
              budgetItems: resource(budget, 'items', budgetItemSchema.passthrough()),
              reservations: resource(reservations, 'reservations', reservationSchema.passthrough()),
              files: fileRows(files),
              members: resource(members, 'members', tripMemberSchema.passthrough()),
              categories: resource(categories, 'categories', categorySchema) as Category[],
              tags: resource(tags, 'tags', tagSchema.passthrough()) as Tag[],
            },
            view.state,
            ids
          );
          const result = {
            familyStayProjection: undefined as StayProjection | undefined,
            familyTaskSnapshot: todo.packet,
            familyPackingSnapshot: packing.packet,
            ...(packing.categoryPacket ? { familyPackingCategorySnapshot: packing.categoryPacket } : {}),
            familyPackingProjection: packingProjection(packing),
            trip: tripCalendarHeader(header, ids, view.state.trip_revision),
            days: view.state.native.days,
            places: view.state.native.places,
            ...related,
          };
          if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 16777216)
            throw new FamilyApiError(502, 'planner_bundle_too_large', 'The full Trip bundle exceeds its bound.');
          await captureCompleteTrip({
            capture: view[completeTripCapture],
            source: origin,
            header,
            tasks: todo.packet,
            packing: packing.packet,
            ...(packing.categoryPacket ? { packingCategories: packing.categoryPacket } : {}),
            booking: reservations.packet,
            tags: related.tags ?? [],
            fence,
          });
          await fence();
          return result;
        } catch (error) {
          await retireRefusedCompleteTrip(viewTask, error);
          throw error;
        } finally {
          unsubscribe();
        }
      },
      inherited
    );
  };
}
function idsTrip(
  header: NonNullable<Awaited<ReturnType<FamilyFrontendRepository['readers']['trips']['fetchTripById']>>>,
  ids: import('./identity').FamilyIdentityRegistry
) {
  // Zero means no native Nest creator; Family permissions remain authoritative.
  return {
    ...header,
    user_id: 0,
    id: ids.register('trip', header.id),
    is_owner: header.is_owner ?? 0,
    family_uuid: header.id,
    hub_members: header.hub_members?.map((m) => ({ ...m, id: ids.register('person', m.personId) })),
  };
}
function resource<T>(value: unknown, key: string, schema: z.ZodType<T>): T[] {
  const parsed = z.object({ [key]: z.array(schema).max(10000) }).safeParse(value);
  if (!parsed.success)
    throw new FamilyApiError(502, 'planner_bundle_resource', 'A required Trip resource returned an invalid response.');
  return parsed.data[key];
}

function fileRows(files: unknown) {
  return resource(files, 'files', tripFileSchema.passthrough()).map((f) => ({
    ...f,
    mime_type: f.mime_type ?? '',
    created_at: f.created_at ?? '',
    starred: f.starred ?? undefined,
    reservation_title: f.reservation_title ?? undefined,
  }));
}

async function checkBundleContext(
  repo: FamilyFrontendRepository,
  original: {
    session: import('./repository').FamilySession;
    trip: string;
    ids: import('./identity').FamilyIdentityRegistry;
    layer: import('./plannerViewContract').PlannerLayer;
    origin: string;
  },
  current: { disposed: () => boolean; source: () => string; invalidated: () => boolean; signal?: AbortSignal }
) {
  const session = await repo.session();
  if (current.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (
    current.disposed() ||
    current.source() !== original.origin ||
    current.invalidated() ||
    original.ids !== (await repo.views()).ids ||
    session.userId !== original.session.userId ||
    session.familyId !== original.session.familyId ||
    session.personId !== original.session.personId ||
    repo.getLayer(original.trip) !== original.layer
  )
    throw new FamilyApiError(
      409,
      'planner_bundle_changed',
      'The original Trip/Family/layer changed before the bundle completed.'
    );
}

function tripCalendarHeader(
  header: Parameters<typeof idsTrip>[0],
  ids: Parameters<typeof idsTrip>[1],
  revision: number
) {
  return {
    ...idsTrip(header, ids),
    family_calendar: {
      trip_revision: revision,
      start_date: header.start_date ?? null,
      end_date: header.end_date ?? null,
    },
  };
}

function requireBundleConnection() {
  if (isEffectivelyOffline())
    throw new FamilyApiError(
      503,
      'planner_full_load_needs_connection',
      'A complete Trip reload needs a connection; scoped planner refresh can use its current cache.'
    );
}

function bundlePackingReader(
  repo: FamilyFrontendRepository,
  disposed: () => boolean,
  options: { source: () => string; categoryMetadata?: boolean; categoryIdentity?: boolean; bagManagement?: boolean }
) {
  return createPlannerPackingReader(
    repo,
    disposed,
    options.source,
    undefined,
    options.categoryIdentity
      ? createPackingCategoryV2Transport()
      : options.categoryMetadata
        ? createPackingCategoryTransport()
        : undefined,
    options.bagManagement
  );
}
function bundleGet(app: FamilyHandler, trip: string, signal?: AbortSignal) {
  return (suffix: string) =>
    app({ method: 'GET', pathname: `/trips/${trip}/${suffix}`, query: new URLSearchParams(), body: undefined, signal });
}

function packingProjection(packing: Awaited<ReturnType<ReturnType<typeof createPlannerPackingReader>['read']>>) {
  return {
    items: packing.items,
    bags: packing.bags,
    assignees: packing.assignees,
    ...(packing.categoryViews ? { categoryViews: packing.categoryViews } : {}),
  };
}

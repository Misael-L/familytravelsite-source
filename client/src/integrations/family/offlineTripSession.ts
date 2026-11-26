import { liveQuery } from 'dexie';
import { currentOfflineDatabase } from '../../db/offlineDb';
import { onPrivateSessionEnd } from '../../db/privateSessionEvents';
import { installReadOnlySession } from '../../db/readOnlySession';
import { installSavedFilePreview } from '../../repo/preparedFilePreview';
import { installSavedPackingReadPort } from '../../repo/savedPackingReadPort';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline, onNetworkModeChange } from '../../sync/networkMode';
import { onFamilyActorChange } from './actorEvents';
import { coherentStayQualificationEnabled } from './coherentStayQualification';
import { projectCompleteTrip } from './completeTripProjection';
import { openCoherentTripRead, openCompleteTripRead } from './completeTripRead';
import type { CompleteTripData } from './completeTripSnapshot';
import { deriveCompleteTripV4 } from './completeTripV4';
import { FamilyApiError } from './errors';
import { NOT_HANDLED } from './listHandler';
import { offlineTripQualificationEnabled, v4PrivateFileSource, v4PublicImageSource } from './offlineTripQualification';
import { inspectCompleteTrip } from './plannerCache';
import { createPublicVariantImages } from './publicVariantImages';
import { createSavedPackingReader } from './savedPackingReader';
import { installSavedPrivateFiles } from './savedPrivateFiles';
import type { FamilyRequest } from './transport';
type SavedTripLease = Awaited<ReturnType<typeof openCompleteTripRead> | ReturnType<typeof openCoherentTripRead>>;

let active: OfflineTripSession | null = null;
export type OfflineTripSession = Awaited<ReturnType<typeof createOfflineTripSession>>;
export const currentOfflineTripSession = () => active;
export async function createOfflineTripSession(trip: string, ended: () => void) {
  if (!offlineTripQualificationEnabled()) throw new Error('Cold Trip reading is disabled outside local qualification.');
  const lease = await (coherentStayQualificationEnabled() ? openCoherentTripRead(trip) : openCompleteTripRead(trip));
  let savedData: CompleteTripData;
  let pendingImages: ReturnType<typeof createPublicVariantImages> | undefined;
  let projection: Awaited<ReturnType<typeof projectCompleteTrip>>;
  let nativeTrip: number;
  try {
    const { envelope } = lease;
    savedData = envelope.format === 'family.offline-trip.v4' ? deriveCompleteTripV4(envelope.data) : envelope.data;
    pendingImages =
      envelope.format === 'family.offline-trip.v4' && !v4PublicImageSource(envelope.source)
        ? { resolve: async () => null, dispose: () => {}, current: lease.current }
        : createPublicVariantImages({ envelope, check: lease.check, current: lease.current });
    projection = await projectCompleteTrip(envelope, lease.check, pendingImages.resolve);
    lease.check();
    nativeTrip = projection.ids.register('trip', trip);
  } catch (error) {
    try {
      pendingImages?.dispose();
    } finally {
      lease.close();
    }
    throw error;
  }
  const images = pendingImages;
  let disposed = false,
    served = false;
  let releasePacking: (() => void) | undefined;
  const assertTrip = (value: number | string) => {
    lease.check();
    if (
      disposed ||
      (served && useTripStore.getState().trip?.id !== nativeTrip) ||
      projection.ids.uuid('trip', value) !== trip
    )
      throw new Error('This saved read belongs to another Trip.');
  };
  const load = async (value: number | string) => {
    assertTrip(value);
    await lease.publish(() => {
      assertTrip(value);
      if (served && useTripStore.getState().trip?.id !== nativeTrip) throw new Error('The visible saved Trip changed.');
      const { days, places, ...other } = savedBundleFields(projection.bundle);
      if (!served) useTripStore.getState().resetTrip();
      served = true;
      if (!releasePacking) releasePacking = installPacking(projection, savedData, assertTrip);
      useTripStore.setState({
        ...other,
        days,
        places,
        assignments: Object.fromEntries(days.map((d) => [String(d.id), d.assignments ?? []])),
        dayNotes: Object.fromEntries(days.map((d) => [String(d.id), d.notes_items ?? []])),
        isLoading: false,
        error: null,
      });
    });
  };
  const handle = createSavedTripHandler(projection, savedData, lease, assertTrip);
  if (active) {
    images.dispose();
    lease.close();
    throw new Error('Another saved Trip session is already active.');
  }
  const releaseWrites = installReadOnlySession();
  let releaseFiles: () => void;
  try {
    releaseFiles = installFiles(lease);
  } catch (error) {
    releaseWrites();
    images.dispose();
    lease.close();
    throw error;
  }
  const stop = () => {
    if (!disposed) {
      dispose();
      ended();
    }
  };
  const tripWatch = useTripStore.subscribe((state) => {
    if (served && state.trip?.id !== nativeTrip) stop();
  });
  const releaseLeaseWatch = observeSavedTripLease(lease, stop);
  function dispose() {
    if (disposed) return;
    disposed = true;
    releasePacking?.();
    tripWatch();
    images.dispose();
    releaseFiles();
    lease.close();
    releaseLeaseWatch();
    releaseWrites();
    if (active === session) active = null;
    if (served && useTripStore.getState().trip?.id === nativeTrip) useTripStore.getState().resetTrip();
  }
  const currentStays = currentStayReader(projection, lease, assertTrip, () => served);
  const session = {
    ...projection,
    trip,
    load,
    handle,
    dispose,
    currentStays,
    current: () => !disposed && lease.current(),
  };
  if (active) {
    dispose();
    throw new Error('Another saved Trip session is already active.');
  }
  active = session;
  return session;
}

function observeSavedTripLease(lease: SavedTripLease, stop: () => void) {
  const expiryWatch = setInterval(() => {
    if (!lease.current()) stop();
  }, 1000);
  const timer = setTimeout(stop, Math.max(0, lease.envelope.expiresAt - Date.now()));
  const actor = onFamilyActorChange(stop),
    privacy = onPrivateSessionEnd(stop),
    network = onNetworkModeChange(() => {
      if (!isEffectivelyOffline()) stop();
    });
  const watch = liveQuery(() =>
    inspectCompleteTrip(lease.envelope.source, lease.envelope.scope, lease.check)
  ).subscribe({
    next: () => {
      // Recheck the original whole observation, including same-id body changes.
      void lease.publish(() => {}).catch(stop);
    },
    error: stop,
  });
  const workWatch = liveQuery(async () => {
    const db = currentOfflineDatabase();
    await db.mutationQueue.toArray();
    await db.importFiles.count();
    await lease.publish(() => {});
    return true;
  }).subscribe({ error: stop });
  return () => {
    clearTimeout(timer);
    clearInterval(expiryWatch);
    actor();
    privacy();
    network();
    watch.unsubscribe();
    workWatch.unsubscribe();
  };
}

export async function offlineTripRequest(request: FamilyRequest) {
  if (
    !offlineTripQualificationEnabled() ||
    !active ||
    /^\/auth(?:\/|$)/.test(request.pathname) ||
    ['/health', '/config'].includes(request.pathname)
  )
    return NOT_HANDLED;
  return active.handle(request);
}

function createSavedTripHandler(
  projection: Awaited<ReturnType<typeof projectCompleteTrip>>,
  savedData: CompleteTripData,
  lease: SavedTripLease,
  assertTrip: (value: number | string) => void
) {
  return async (request: FamilyRequest): Promise<unknown> => {
    if (request.method !== 'GET')
      throw new FamilyApiError(
        503,
        'saved_trip_read_only',
        'Reconnect and validate access before changing this saved Trip.'
      );
    const m = request.pathname.match(/^\/trips\/([^/]+)(?:\/(.*))?$/);
    if (!m) throw new FamilyApiError(503, 'saved_resource_unavailable', 'This resource is not in the saved Trip.');
    assertTrip(m[1]);
    const suffix = m[2] ?? '',
      b = projection.bundle,
      packing = projection.packing;
    if ((suffix === 'accommodations' || suffix === 'reservations') && request.query.size)
      throw new FamilyApiError(400, 'coherent_full_read', 'Only complete paired reads are supported.');
    if (suffix === 'accommodations' && projection.accommodations === undefined)
      throw new FamilyApiError(
        503,
        'saved_stays_unavailable',
        'This saved Trip has no verified lodging view. Reconnect to refresh it.'
      );
    const result: Record<string, unknown> = {
      '': { trip: b.trip },
      bundle: b,
      days: { days: b.days },
      places: { places: b.places },
      todo: { items: b.todoItems },
      packing: {
        items: packing.items,
        bags: packing.bags,
        unassigned_weight_grams: savedData.packing.unassigned_weight_grams,
      },
      'packing/bags': {
        bags: packing.bags,
        unassigned_weight_grams: savedData.packing.unassigned_weight_grams,
      },
      'packing/category-assignees': { assignees: packing.assignees },
      reservations: { reservations: b.reservations },
      ...(projection.accommodations === undefined
        ? {}
        : { accommodations: { accommodations: projection.accommodations } }),
      budget: { items: b.budgetItems },
      files: { files: b.files },
      members: { members: b.members },
    };
    if (!Object.prototype.hasOwnProperty.call(result, suffix))
      throw new FamilyApiError(503, 'saved_resource_unavailable', 'This resource is not in the saved Trip.');
    await lease.publish(() => assertTrip(m[1]));
    return result[suffix];
  };
}

function savedBundleFields(bundle: Awaited<ReturnType<typeof projectCompleteTrip>>['bundle']) {
  const {
    familyTaskSnapshot: _tasks,
    familyPackingSnapshot: _packing,
    familyPackingCategorySnapshot: _categories,
    ...fields
  } = bundle;
  return fields;
}

function installFiles(lease: SavedTripLease) {
  return lease.envelope.format === 'family.offline-trip.v4' && !v4PrivateFileSource(lease.envelope.source)
    ? installSavedFilePreview({
        acquire: async () => {
          lease.check();
          throw new Error('V4 saved file preparation is not connected. Reconnect before opening this file.');
        },
        dispose: () => {},
      })
    : installSavedPrivateFiles({ envelope: lease.envelope, check: lease.check, verify: () => lease.publish(() => {}) });
}

function installPacking(
  projection: Awaited<ReturnType<typeof projectCompleteTrip>>,
  savedData: CompleteTripData,
  assertTrip: (value: number | string) => void
) {
  return installSavedPackingReadPort(
    createSavedPackingReader({
      view: { ...projection.packing, unassigned_weight_grams: savedData.packing.unassigned_weight_grams },
      categories: savedData.packing_categories_v2 ?? savedData.packing_categories ?? null,
      ids: projection.ids,
      check: assertTrip,
    })
  );
}

function currentStayReader(
  projection: Awaited<ReturnType<typeof projectCompleteTrip>>,
  lease: SavedTripLease,
  assertTrip: (value: number | string) => void,
  served: () => boolean
) {
  return (value: number | string) => {
    try {
      assertTrip(value);
      if (
        !served() ||
        !projection.accommodations ||
        useTripStore.getState().reservations !== projection.bundle.reservations
      )
        return undefined;
      return {
        accommodations: projection.accommodations,
        reservations: projection.bundle.reservations,
        generation: lease.envelope.generation,
      };
    } catch {
      return undefined;
    }
  };
}

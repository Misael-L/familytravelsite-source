import { getSupabaseBrowserClient } from '@family/backend/supabase/client';
import { collectionRpc } from '@family/backend/supabase/collectionRpc';
import { getSupabaseUrl } from '@family/backend/supabase/env';
import { useSyncExternalStore } from 'react';
import { collectionsApi } from '../../api/collections';
import { offlineSourceOwner } from '../../db/offlineDb';
import { sourceBinding } from '../../db/sourceDatabase';
import { ALL_SAVED, useCollectionStore, type ActiveCollectionId } from '../../store/collectionStore';
import { captureWriteSession } from '../../sync/writeSession';
import { captureFamilyActor } from './actorContext';
import { CollectionCohort, collectionUnavailable } from './collectionCohort';
import * as c from './collectionContract';
import { coreHttpsPlannerPackingProfileEnabled } from './coreHttpsPlannerPackingProfile';
import { coreHttpsTaskProfileEnabled } from './coreHttpsTaskProfile';
import { FamilyApiError } from './errors';
import { familyFrontend, type FamilyFrontendRepository } from './repository';
import { isFamilyFrontendActive } from './runtime';

const entries = new WeakMap<FamilyFrontendRepository, { task: Promise<CollectionCohort>; retire: () => void }>();
let owner: CollectionCohort | null = null,
  stopOwner: (() => void) | null = null,
  problem: string | null = null,
  serial = 0,
  lifetime = 0;
const listeners = new Set<() => void>();
const notify = () => {
  serial++;
  for (const fn of listeners) fn();
};
function collectionWritesReady() {
  if (!owner || coreHttpsTaskProfileEnabled() || coreHttpsPlannerPackingProfileEnabled()) return false;
  try {
    owner.assertCurrent();
    const context = captureWriteSession();
    context.assertCurrent();
    const source = offlineSourceOwner(),
      scope = owner.owner.scope;
    return Boolean(
      source &&
      source.source === owner.owner.source_url &&
      source.user_id === scope.user_id &&
      source.family_id === scope.family_id &&
      source.person_id === scope.person_id &&
      sourceBinding(context.db.name)?.writable()
    );
  } catch {
    return false;
  }
}
export function useFamilyCollectionUI() {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => serial,
    () => 0
  );
  return {
    family: isFamilyFrontendActive(),
    writeReady: collectionWritesReady(),
    lifetime,
    owner,
    snapshot: owner?.getSnapshot() ?? null,
    libraryReady: owner?.isLibraryReady() ?? false,
    error: problem,
  };
}
export function reportCollectionProblem(error: unknown) {
  problem = error instanceof Error ? error.message : 'Collection contents are unavailable. Reload before continuing.';
  notify();
}
export function retireFamilyCollections(repo: FamilyFrontendRepository = familyFrontend) {
  lifetime++;
  entries.get(repo)?.retire();
  entries.delete(repo);
  if (owner) {
    owner.retire();
    owner = null;
  }
  stopOwner?.();
  stopOwner = null;
  editors.clear();
  problem = null;
  useCollectionStore.setState({
    collections: [],
    places: [],
    members: [],
    labels: [],
    incomingInvites: [],
    activeId: null,
    selectedPlaceId: null,
    selectedIds: [],
    loading: false,
    placesLoading: false,
  });
  notify();
}
function publishOwner(next: CollectionCohort) {
  if (owner === next) return;
  stopOwner?.();
  owner = next;
  problem = null;
  const sync = () => {
    if (owner !== next) return;
    try {
      next.assertCurrent();
      const view = next.getSnapshot();
      useCollectionStore.setState({
        collections: view.roots.flatMap((r) => (r.native ? [r.native] : [])),
        places: view.items.map((i) => i.native),
      });
    } catch {
      useCollectionStore.setState({
        collections: [],
        places: [],
        members: [],
        labels: [],
        incomingInvites: [],
        selectedPlaceId: null,
      });
    }
    notify();
  };
  stopOwner = next.subscribe(sync);
  sync();
}
/** Tests may supply an explicit checked owner; production always captures the real repository/Auth source. */
export function bindCollectionCohort(repo: FamilyFrontendRepository, cohort: CollectionCohort) {
  if (entries.has(repo)) throw Error('Collection owner already installed');
  const entry = { task: Promise.resolve(cohort), retire: () => cohort.retire() };
  entries.set(repo, entry);
  return () => {
    if (entries.get(repo) === entry) retireFamilyCollections(repo);
  };
}
export async function getFamilyCollectionCohort(repo: FamilyFrontendRepository = familyFrontend) {
  let entry = entries.get(repo);
  if (!entry) {
    let retired = false,
      cohort: CollectionCohort | null = null;
    const actor = captureFamilyActor();
    const context = repo.captureContext(undefined, { revision: false });
    const stop = repo.subscribeContext((trip) => {
      if (trip === undefined) {
        retired = true;
        cohort?.retire();
        if (entries.get(repo) === entry) entries.delete(repo);
      }
    });
    const check = () => {
      actor.assertCurrent();
      context.assertCurrent();
      if (retired)
        throw new FamilyApiError(
          409,
          'collection_owner_changed',
          'Reload Collections in the current account. Original work is retained.'
        );
    };
    const task = (async () => {
      const session = await repo.session();
      check();
      const views = await repo.views();
      check();
      const client = getSupabaseBrowserClient(),
        source = getSupabaseUrl();
      const { data, error } = await client.auth.getSession();
      check();
      if (error || !data.session || data.session.user.id !== session.userId)
        throw new FamilyApiError(401, 'collection_session_required', 'Sign in again to open Collections.');
      let sid: string;
      try {
        const token = data.session.access_token;
        if (token.length > 16384) throw Error();
        sid = c.collectionParse(
          c.collectionId,
          JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id
        );
      } catch {
        throw new FamilyApiError(401, 'collection_session_required', 'Sign in again to open Collections.');
      }
      const current = () => {
        check();
        if (client !== getSupabaseBrowserClient() || source !== getSupabaseUrl())
          throw new FamilyApiError(409, 'collection_source_changed', 'Reload Collections in its original source.');
      };
      cohort = new CollectionCohort(
        {
          scope: {
            version: 1,
            user_id: session.userId,
            person_id: session.personId,
            family_id: session.familyId,
            session_id: sid,
          },
          source_url: source,
          ids: views.ids,
          assertCurrent: current,
        },
        collectionRpc
      );
      return cohort;
    })();
    entry = {
      task,
      retire: () => {
        retired = true;
        stop();
        cohort?.retire();
      },
    };
    entries.set(repo, entry);
    const captured = entry;
    void task.catch(() => {
      stop();
      if (entries.get(repo) === captured) entries.delete(repo);
    });
  }
  const result = await entry.task;
  result.assertCurrent();
  return result;
}
const editors = new Map<number, { owner: CollectionCohort; port: Awaited<ReturnType<CollectionCohort['editor']>> }>();
export async function beginFamilyCollectionEdit(id: number, repo: FamilyFrontendRepository = familyFrontend) {
  const cohort = await getFamilyCollectionCohort(repo);
  const port = await cohort.editor(id);
  editors.get(id)?.port.retire();
  editors.set(id, { owner: cohort, port });
  return {
    initial: port.initial,
    retire() {
      port.retire();
      if (editors.get(id)?.port === port) editors.delete(id);
    },
  };
}
export async function saveFamilyCollectionEdit(
  id: number,
  raw: unknown,
  repo: FamilyFrontendRepository = familyFrontend
) {
  const cohort = await getFamilyCollectionCohort(repo),
    entry = editors.get(id);
  if (!entry || entry.owner !== cohort)
    throw new FamilyApiError(409, 'collection_editor_required', 'Reopen this Collection editor before saving.');
  const value = { ...(raw as Record<string, unknown>) };
  for (const key of ['links', 'label_ids']) {
    if (key in value) {
      if (!Array.isArray(value[key]) || (value[key] as unknown[]).length) return collectionUnavailable();
      delete value[key];
    }
  }
  const display = entry.port.initial.native as unknown as Record<string, unknown>;
  for (const key of ['name', 'description', 'notes', 'lat', 'lng', 'address', 'website', 'phone', 'category_id']) {
    if (key in value && Object.is(value[key], display[key] ?? null)) delete value[key];
  }
  if (
    entry.port.initial.canonical.content_mode === 'reference' &&
    Object.keys(value).some((key) => !['name', 'notes'].includes(key))
  )
    throw new FamilyApiError(
      422,
      'collection_snapshot_required',
      'Keep this catalog item as an independent snapshot before changing location details. Its shared catalog data was not changed.'
    );
  // A native no-op still uses the observed server contract; it never invents an acknowledgement.
  if (Object.keys(value).length === 0) value.notes = entry.port.initial.canonical.notes;
  return entry.port.save(value);
}
const excluded = [
  'createCollection',
  'updateCollection',
  'uploadCover',
  'reorderCollections',
  'uploadPlaceImage',
  'ratePlace',
  'copyToTrip',
  'moveToList',
  'duplicateToList',
  'createLabel',
  'updateLabel',
  'deleteLabel',
  'assignLabels',
  'invite',
  'setMemberRole',
  'acceptInvite',
  'declineInvite',
  'cancelInvite',
  'removeMember',
  'leave',
] as const;
type NativeStore = ReturnType<typeof useCollectionStore.getState>;
function restoreCollectionMethods(original: NativeStore, overrides: Partial<NativeStore>) {
  const restore: Partial<NativeStore> = {};
  for (const key of Object.keys(overrides) as (keyof NativeStore)[])
    if (useCollectionStore.getState()[key] === overrides[key])
      (restore as Record<string, unknown>)[key] = original[key];
  useCollectionStore.setState(restore);
}
async function executeCollectionOperation<T>(
  repo: FamilyFrontendRepository,
  assertInstallation: () => void,
  work: (cohort: CollectionCohort) => Promise<T>
) {
  assertInstallation();
  const expectedLifetime = lifetime;
  let cohort: CollectionCohort | null = null;
  try {
    cohort = await getFamilyCollectionCohort(repo);
    cohort.assertCurrent();
    publishOwner(cohort);
    const result = await work(cohort);
    cohort.assertCurrent();
    assertInstallation();
    if (owner !== cohort) throw new FamilyApiError(409, 'collection_owner_changed', 'The Collection owner changed.');
    problem = null;
    notify();
    return result;
  } catch (e) {
    if (cohort === null) {
      if (expectedLifetime === lifetime) reportCollectionProblem(e);
    } else if (owner === cohort) {
      try {
        cohort.assertCurrent();
        if (e instanceof FamilyApiError && [401, 403].includes(e.status)) retireFamilyCollections(repo);
        reportCollectionProblem(e);
      } catch {
        if (owner === cohort)
          useCollectionStore.setState({
            collections: [],
            places: [],
            members: [],
            labels: [],
            selectedPlaceId: null,
          });
      }
    }
    throw e;
  }
}
export function installFamilyCollectionStore(repo: FamilyFrontendRepository = familyFrontend) {
  const original = useCollectionStore.getState();
  let disposed = false,
    activeSequence = 0;
  const checked = <T>(work: (cohort: CollectionCohort) => Promise<T>) =>
    executeCollectionOperation(
      repo,
      () => {
        if (disposed)
          throw new FamilyApiError(409, 'collection_installation_retired', 'Reload Collections before continuing.');
      },
      work
    );
  const load = async (id: ActiveCollectionId, reset: boolean) => {
    const seq = ++activeSequence;
    let cohort: CollectionCohort | null = null;
    useCollectionStore.setState({
      activeId: id,
      placesLoading: true,
      ...(reset ? { places: [], selectedPlaceId: null, selectedIds: [], selectMode: false, labelFilter: [] } : {}),
    });
    try {
      cohort = await getFamilyCollectionCohort(repo);
      cohort.assertCurrent();
      if (seq !== activeSequence || disposed) return;
      publishOwner(cohort);
      if (reset) cohort.select(id);
      if (id === ALL_SAVED) await cohort.union();
      else if (typeof id === 'number') await cohort.detail(id);
      cohort.assertCurrent();
      if (seq === activeSequence && owner === cohort) {
        problem = null;
        notify();
      }
    } catch (e) {
      if (seq === activeSequence && owner === cohort && cohort !== null) {
        try {
          cohort.assertCurrent();
          reportCollectionProblem(e);
        } catch {
          /* An overtaken read cannot publish its error into the newer view. */
        }
      }
    } finally {
      if (seq === activeSequence && owner === cohort && !disposed)
        useCollectionStore.setState({ placesLoading: false });
    }
  };
  const overrides: Partial<typeof original> = {
    loadAll: () =>
      checked(async (cohort) => {
        useCollectionStore.setState({ loading: true });
        try {
          await collectionsApi.list();
          cohort.assertCurrent();
        } finally {
          useCollectionStore.setState({ loading: false });
        }
      }),
    loadCollection: (id) => load(id, false),
    setActive: (id) => load(id, true),
    refreshActive: () => load(useCollectionStore.getState().activeId, false),
    setStatus: (id, status) =>
      checked(async (cohort) => {
        await cohort.status(id, status);
      }),
    updatePlace: (id, body) =>
      checked(async () => {
        const result = await saveFamilyCollectionEdit(id, body, repo);
        if (result.status !== 'committed')
          throw new FamilyApiError(409, 'collection_cancelled', 'The original Collection edit was cancelled.');
      }),
    deletePlace: (id) =>
      checked(async (cohort) => {
        await cohort.trashItem(id);
        useCollectionStore.setState({ selectedPlaceId: null });
      }),
    deleteCollection: (id) =>
      checked(async (cohort) => {
        await cohort.trashRoot(id);
        useCollectionStore.setState({ selectedPlaceId: null });
        await cohort.library();
      }),
    deleteMany: async () => collectionUnavailable(),
  };
  for (const name of excluded) (overrides as Record<string, unknown>)[name] = async () => collectionUnavailable();
  useCollectionStore.setState(overrides);
  const unsubscribe = repo.subscribeContext((trip) => {
    if (trip === undefined) retireFamilyCollections(repo);
  });
  return () => {
    disposed = true;
    activeSequence++;
    unsubscribe();
    retireFamilyCollections(repo);
    restoreCollectionMethods(original, overrides);
  };
}
export function familyCollectionTarget(value: unknown, cohort: CollectionCohort) {
  const row = value as Record<string, unknown>;
  if (row.family_identity) return c.collectionParse(c.collectionMembershipIdentity, row.family_identity);
  if (row.family_collection_id && row.family_collection_item_id)
    return c.collectionParse(c.collectionMembershipIdentity, {
      collection_id: row.family_collection_id,
      item_id: row.family_collection_item_id,
    });
  if (row.family_catalog_kind && row.family_catalog_id)
    return c.collectionParse(c.collectionMembershipIdentity, {
      kind: row.family_catalog_kind,
      id: row.family_catalog_id,
    });
  if (row.family_location_id && row.trip_id)
    return c.collectionParse(c.collectionMembershipIdentity, {
      trip_id: cohort.owner.ids.uuid('trip', String(row.trip_id)),
      location_id: row.family_location_id,
    });
  throw new FamilyApiError(
    422,
    'collection_identity_unavailable',
    'This item has no supported Family save identity. Nothing was matched by name or coordinates.'
  );
}
export async function familyCollectionMembership(value: unknown, check: () => void = () => {}) {
  const cohort = await getFamilyCollectionCohort();
  check();
  const target = familyCollectionTarget(value, cohort);
  const lease = await cohort.membership(target, check);
  check();
  return lease;
}

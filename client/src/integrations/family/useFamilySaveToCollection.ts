import type { Collection, CollectionMembership, CollectionStatus } from '@trek/shared';
import { useEffect, useRef, useState } from 'react';
import { useSaveToCollectionStore, type SaveToCollectionTarget } from '../../store/saveToCollectionStore';
import { collectionUnavailable } from './collectionCohort';
import { familyCollectionMembership, getFamilyCollectionCohort, useFamilyCollectionUI } from './collectionRuntime';
import { FamilyApiError } from './errors';
type Lease = Awaited<ReturnType<typeof familyCollectionMembership>>;
type Resource = {
  target: SaveToCollectionTarget;
  lifetime: number;
  version: number;
  lists: Collection[];
  membership: CollectionMembership | null;
  error: string | null;
  current: () => boolean;
  lease: Lease | null;
  editors: Map<number, Awaited<ReturnType<Lease['editor']>>>;
  writable: Set<number>;
};
const changed = () =>
  new FamilyApiError(409, 'collection_picker_changed', 'Reload this Collection picker. Original work is retained.');
async function readPickerResource({
  target,
  lifetime,
  version,
  editors,
  check,
  current,
  adopt,
}: Pick<Resource, 'target' | 'lifetime' | 'version' | 'editors' | 'current'> & {
  check: () => void;
  adopt: (lease: Lease) => void;
}): Promise<Resource> {
  check();
  const cohort = await getFamilyCollectionCohort();
  check();
  const index = await cohort.library();
  check();
  const lease = await familyCollectionMembership(target, check);
  adopt(lease);
  check();
  for (const entry of lease.canonical.lists.filter((row) => row.can_edit)) {
    const editor = await lease.editor(entry);
    check();
    editors.set(cohort.owner.ids.register('collectionItem', entry.item_id), editor);
  }
  return {
    target,
    lifetime: lifetime,
    version,
    lists: index.collections.flatMap((row) => (row.native ? [row.native] : [])),
    membership: lease.native as CollectionMembership,
    error: null,
    current,
    lease,
    editors,
    writable: new Set(
      index.collections.flatMap((row) => (row.native && row.canonical.can_edit_items ? [row.native.id] : []))
    ),
  };
}
function currentPickerResource(
  resource: Resource | null,
  target: SaveToCollectionTarget | null,
  lifetime: number,
  version: number
) {
  return resource?.target === target && resource?.lifetime === lifetime && resource?.version === version
    ? resource
    : null;
}
function pickerFailure(
  context: Pick<Resource, 'target' | 'lifetime' | 'version' | 'current' | 'editors'>,
  error: unknown
): Resource {
  return {
    ...context,
    lists: [],
    membership: null,
    error: error instanceof Error ? error.message : 'Collection status unavailable.',
    lease: null,
    writable: new Set(),
  };
}
function canTogglePicker(
  state: Resource | null,
  savedByCollection: Map<number, CollectionMembership['lists'][number]>,
  list: Collection
) {
  if (!state || state.error) return false;
  const saved = savedByCollection.get(list.id);
  if (saved) return saved.can_edit;
  return Boolean(state.lease && 'kind' in state.lease.target && state.writable.has(list.id));
}
export function useFamilySaveToCollection(target: SaveToCollectionTarget | null, bump: () => void) {
  const ui = useFamilyCollectionUI(),
    version = useSaveToCollectionStore((s) => s.version),
    [resource, setResource] = useState<Resource | null>(null),
    [busy, setBusy] = useState<{ resource: Resource; id: number } | null>(null),
    flight = useRef<Resource | null>(null);
  useEffect(() => {
    if (!ui.family || !target) return;
    let live = true,
      owned: Lease | null = null;
    const editors = new Map<number, Awaited<ReturnType<Lease['editor']>>>();
    const check = () => {
      target.family_assert_current?.();
      if (!live) throw changed();
    };
    void Promise.resolve()
      .then(async () => {
        const next = await readPickerResource({
          target,
          lifetime: ui.lifetime,
          version,
          editors,
          check,
          current: () => live,
          adopt: (lease) => {
            owned = lease;
            if (!live) lease.retire();
          },
        });
        check();
        setResource(next);
      })
      .catch((e) => {
        if (live)
          setResource(pickerFailure({ target, lifetime: ui.lifetime, version, current: () => live, editors }, e));
      });
    return () => {
      live = false;
      owned?.retire();
      for (const editor of editors.values()) editor.retire();
      editors.clear();
    };
  }, [target, ui.family, ui.lifetime, version]);
  const state = currentPickerResource(resource, target, ui.lifetime, version);
  const run = async (id: number, work: (state: Resource) => Promise<void>) => {
    if (!state || state.error || flight.current === state) return;
    const original = state;
    if (!original.current()) throw changed();
    flight.current = original;
    setBusy({ resource: original, id });
    try {
      await work(original);
      if (original.current()) bump();
    } catch (e) {
      if (original.current())
        setResource({
          ...original,
          error: e instanceof Error ? e.message : 'Collection save unavailable. Original work is retained.',
        });
    } finally {
      if (flight.current === original) flight.current = null;
      setBusy((old) => (old?.resource === original ? null : old));
    }
  };
  const savedByCollection = new Map<number, CollectionMembership['lists'][number]>();
  for (const row of state?.membership?.lists ?? []) savedByCollection.set(row.collection_id, row);
  const handleStatus = (entry: CollectionMembership['lists'][number], status: CollectionStatus) =>
    run(entry.collection_id, async (current) => {
      const editor = current.editors.get(entry.place_id);
      if (!editor) throw changed();
      await editor.setStatus(status);
    });
  const handleToggle = (list: Collection) =>
    run(list.id, async (current) => {
      const entry = savedByCollection.get(list.id),
        cohort = await getFamilyCollectionCohort();
      if (!current.current()) throw changed();
      if (entry) {
        const editor = current.editors.get(entry.place_id);
        if (!editor) throw changed();
        await cohort.trashObserved(editor.initial.canonical, () => {
          if (!current.current()) throw changed();
        });
        return;
      }
      const identity = current.lease?.target;
      if (!identity || !('kind' in identity)) return collectionUnavailable();
      const draft = await cohort.openCreate(list.id, { source: identity });
      try {
        const before = current.lease?.canonical.source_observation;
        if (
          !('source' in draft.context) ||
          !before ||
          !('digest' in before) ||
          draft.context.source.digest !== before.digest
        )
          throw changed();
        await draft.save({ action: 'create_reference', body: { source: identity, notes: null, status: 'idea' } });
      } finally {
        draft.retire();
      }
    });
  const canToggle = (list: Collection) => ui.writeReady && canTogglePicker(state, savedByCollection, list);
  return {
    lists: state?.lists ?? [],
    membership: state?.membership ?? null,
    error: state?.error ?? null,
    loading: !state,
    busyId: busy?.resource === state ? (busy?.id ?? null) : null,
    savedByCollection,
    unvisited: [] as CollectionMembership['lists'],
    canToggle,
    handleStatus,
    handleToggle,
    handleVisitedEverywhere: async () => collectionUnavailable(),
  };
}

import { useEffect, useState } from 'react';
import type { CollectionCohort } from './collectionCohort';
import * as c from './collectionContract';
import { getFamilyCollectionCohort, useFamilyCollectionUI } from './collectionRuntime';
import { FamilyApiError } from './errors';
type Draft = Awaited<ReturnType<CollectionCohort['openCreate']>>;
type Values = {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  category_id: number | null;
  website: string | null;
  phone: string | null;
  links?: unknown[];
  status: unknown;
};
type Resource = {
  target: number;
  picked: Record<string, unknown> | null;
  lifetime: number;
  draft: Draft | null;
  error: string | null;
  current: () => boolean;
};
const changed = () =>
  new FamilyApiError(409, 'collection_create_unobserved', 'Wait for the Collection form to load or reopen it.');
function assertCatalogValues(values: Values, picked: Record<string, unknown>) {
  const pairs = [
    [values.name, picked.name],
    [values.address, typeof picked.address === 'string' ? picked.address : null],
    [values.lat, typeof picked.lat === 'number' ? picked.lat : null],
    [values.lng, typeof picked.lng === 'number' ? picked.lng : null],
  ];
  if (
    pairs.some(([a, b]) => a !== b) ||
    values.category_id !== null ||
    (values.description !== null && values.description !== picked.description)
  )
    throw new FamilyApiError(
      422,
      'collection_source_overrides',
      'Save the catalog item first, then edit its saved details. No shared catalog record will change.'
    );
}
export function useFamilyCollectionCreate(
  open: boolean,
  target: number | null,
  picked: Record<string, unknown> | null
) {
  const ui = useFamilyCollectionUI(),
    [mode, setMode] = useState<'reference' | 'snapshot'>('reference'),
    [resource, setResource] = useState<Resource | null>(null);
  useEffect(() => {
    if (!ui.family || !open || target === null) return;
    let live = true,
      owned: Draft | null = null;
    const current = () => live;
    void Promise.resolve()
      .then(async () => {
        const cohort = await getFamilyCollectionCohort();
        if (!live) return;
        await cohort.library();
        if (!live) return;
        const source = picked
          ? c.collectionParse(c.collectionSource, { kind: picked.family_catalog_kind, id: picked.family_catalog_id })
          : null;
        const draft = await cohort.openCreate(target, source ? { source } : {});
        owned = draft;
        if (!live) {
          draft.retire();
          return;
        }
        setResource({ target, picked, lifetime: ui.lifetime, draft, error: null, current });
      })
      .catch((e) => {
        if (live)
          setResource({
            target,
            picked,
            lifetime: ui.lifetime,
            draft: null,
            error: e instanceof Error ? e.message : 'Collection creation unavailable.',
            current,
          });
      });
    return () => {
      live = false;
      owned?.retire();
    };
  }, [open, target, picked, ui.family, ui.lifetime]);
  const visible = Boolean(
      open && resource?.target === target && resource?.picked === picked && resource?.lifetime === ui.lifetime
    ),
    ready = visible && Boolean(resource?.draft);
  return {
    active: ui.family,
    mode,
    setMode,
    ready: Boolean(ready),
    error: visible ? (resource?.error ?? null) : null,
    pickedCatalog: Boolean(picked?.family_catalog_id),
    async save(values: Values) {
      if (!visible || !resource?.draft || !resource.current()) throw changed();
      const draft = resource.draft;
      if (values.links?.length)
        throw new FamilyApiError(
          422,
          'collection_links_unavailable',
          'Collection links are not connected yet. The form was not saved.'
        );
      let intent: unknown;
      if (picked) {
        assertCatalogValues(values, picked);
        const source = 'source' in draft.selection.target ? draft.selection.target.source : null;
        intent = {
          action: mode === 'snapshot' ? 'create_snapshot' : 'create_reference',
          body: { source, notes: null, status: values.status },
        };
      } else {
        const cohort = await getFamilyCollectionCohort();
        if (!resource.current()) throw changed();
        intent = {
          action: 'create_manual',
          body: {
            content: {
              name: values.name,
              description: values.description,
              latitude: values.lat,
              longitude: values.lng,
              address: values.address,
              website: values.website,
              phone: values.phone,
              family_place_category_id:
                values.category_id === null ? null : cohort.owner.ids.uuid('category', values.category_id),
              cover_media_id: null,
            },
            notes: null,
            status: values.status,
          },
        };
      }
      const result = await draft.save(intent);
      if (!resource.current()) throw changed();
      if (!('view' in result) || !('items' in result.view) || result.status !== 'committed')
        throw new FamilyApiError(409, 'collection_create_cancelled', 'The original Collection save was cancelled.');
      return { duplicate: false };
    },
  };
}

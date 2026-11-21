import { completeTripMedia } from './completeTripMedia';
import type { StoredCompleteTrip } from './completeTripV4';
import { publicImagePreparationSource } from './offlineTripQualification';
import {
  createPublicVariantCache,
  PublicVariantCacheError,
  type PublicVariantDescriptor,
  type PublicVariantReceipt,
} from './publicVariantCache';

export const PUBLIC_IMAGE_PREPARATION_LIMIT = 32;
export type PublicImagePreparationRead = {
  envelope: StoredCompleteTrip;
  check: () => void;
  current: () => boolean;
  verify: () => Promise<void>;
};
type Cache = Pick<ReturnType<typeof createPublicVariantCache>, 'capture' | 'read'>;
type Item = { descriptor: PublicVariantDescriptor } & (
  | { status: 'ready'; receipt: PublicVariantReceipt }
  | { status: 'missing' }
  | { status: 'failed'; reason: PublicVariantCacheError['code'] | 'failure' }
);
export type PublicImagePreparationReceipt = {
  format: 'family.public-image-preparation.v1';
  component: 'public-location-images';
  generation: string;
  snapshotDigest: string;
  source: string;
  scope: StoredCompleteTrip['scope'];
  ownership: StoredCompleteTrip['ownership'];
  observedAt: number;
  status: 'complete' | 'partial' | 'empty';
  counts: {
    assets: number;
    locationsWithoutCover: number;
    eligible: number;
    selected: number;
    deferred: number;
    unavailable: number;
    ready: number;
    failed: number;
    missing: number;
  };
  selection: { offset: number; nextOffset: number | null };
  items: Item[];
};
export class PublicImagePreparationError extends Error {
  constructor(public readonly code: 'intent' | 'busy' | 'scope') {
    super('Public image preparation refused: ' + code);
    this.name = 'PublicImagePreparationError';
  }
}
export function selectPublicPreparationImages(envelope: StoredCompleteTrip) {
  const media = completeTripMedia(envelope),
    locations = media.locations;
  const assets = [...new Set(locations.flatMap((v) => (v.cover_media_id ? [v.cover_media_id] : [])))].sort();
  const variants = new Map(media.variants.map((v) => [v.mediaAssetId, v]));
  const descriptors: PublicVariantDescriptor[] = [];
  let unavailable = 0;
  for (const asset of assets) {
    const variant = variants.get(asset);
    for (const role of ['thumb', 'hero'] as const) {
      const url = role === 'hero' ? variant?.heroUrl : variant?.thumbUrl;
      if (!url || variant?.recipeVersion !== 'v1') {
        unavailable++;
        continue;
      }
      descriptors.push({ source: envelope.source, mediaAssetId: asset, recipe: 'v1', role, url });
    }
  }
  return {
    assets: assets.length,
    locationsWithoutCover: locations.filter((v) => !v.cover_media_id).length,
    unavailable,
    descriptors,
  };
}
export function matchesPublicPreparationImage(receipt: PublicVariantReceipt, descriptor: PublicVariantDescriptor) {
  return (
    receipt.format === 'family.public-variant.v1' &&
    receipt.source === descriptor.source &&
    receipt.mediaAssetId === descriptor.mediaAssetId &&
    receipt.role === descriptor.role &&
    receipt.recipe === descriptor.recipe &&
    descriptor.source + receipt.path === descriptor.url
  );
}
type ImageContext = import('./publicVariantCache').PublicVariantContext;
function failed(descriptor: PublicVariantDescriptor, error: unknown): Item {
  return { descriptor, status: 'failed', reason: error instanceof PublicVariantCacheError ? error.code : 'failure' };
}
async function captureItem(
  bytes: Cache,
  descriptor: PublicVariantDescriptor,
  context: ImageContext,
  verify: () => Promise<void>,
  refresh: boolean
): Promise<Item> {
  await verify();
  try {
    const value = await bytes.capture(descriptor, context, { refresh });
    await verify();
    if (!matchesPublicPreparationImage(value.receipt, descriptor)) throw new PublicVariantCacheError('entry');
    return { descriptor, status: 'ready', receipt: value.receipt };
  } catch (error) {
    await verify();
    return failed(descriptor, error);
  }
}
async function inspectItem(
  bytes: Cache,
  item: Item,
  context: ImageContext,
  verify: () => Promise<void>
): Promise<Item> {
  if (item.status !== 'ready') return item;
  await verify();
  try {
    const value = await bytes.read(item.descriptor, context);
    await verify();
    return value.status === 'ready' && matchesPublicPreparationImage(value.receipt, item.descriptor)
      ? { descriptor: item.descriptor, status: 'ready', receipt: value.receipt }
      : { descriptor: item.descriptor, status: 'missing' };
  } catch (error) {
    await verify();
    return failed(item.descriptor, error);
  }
}
type Batch = {
  e: StoredCompleteTrip;
  selected: ReturnType<typeof selectPublicPreparationImages>;
  offset: number;
  bytes: Cache;
  context: ImageContext;
  verify: () => Promise<void>;
  refresh: boolean;
};
async function runBatch({
  e,
  selected,
  offset,
  bytes,
  context,
  verify,
  refresh,
}: Batch): Promise<PublicImagePreparationReceipt> {
  const items: Item[] = [];
  for (const descriptor of selected.descriptors.slice(offset, offset + PUBLIC_IMAGE_PREPARATION_LIMIT)) {
    items.push(await captureItem(bytes, descriptor, context, verify, refresh));
  }
  for (let i = 0; i < items.length; i++) items[i] = await inspectItem(bytes, items[i], context, verify);
  await verify();
  const counts = {
    assets: selected.assets,
    locationsWithoutCover: selected.locationsWithoutCover,
    eligible: selected.descriptors.length,
    selected: items.length,
    deferred: Math.max(0, selected.descriptors.length - items.length),
    unavailable: selected.unavailable,
    ready: items.filter((v) => v.status === 'ready').length,
    failed: items.filter((v) => v.status === 'failed').length,
    missing: items.filter((v) => v.status === 'missing').length,
  };
  return {
    format: 'family.public-image-preparation.v1',
    component: 'public-location-images',
    generation: e.generation,
    snapshotDigest: e.digest,
    source: e.source,
    scope: { ...e.scope },
    ownership: { ...e.ownership },
    observedAt: Date.now(),
    status:
      !counts.eligible && !counts.unavailable
        ? 'empty'
        : !counts.deferred && !counts.unavailable && !counts.failed && !counts.missing
          ? 'complete'
          : 'partial',
    counts,
    selection: {
      offset,
      nextOffset: offset + items.length < selected.descriptors.length ? offset + items.length : null,
    },
    items,
  };
}

/** An explicit, bounded component observation. Never a whole-Trip readiness or access grant. */
export function createPublicImagePreparation(read: PublicImagePreparationRead, cache?: Cache) {
  read.check();
  const e = read.envelope;
  if (
    !['family.offline-trip.v2', 'family.offline-trip.v3', 'family.offline-trip.v4'].includes(e.format) ||
    e.scope.layer !== 'published' ||
    !publicImagePreparationSource(e.source, e.format)
  )
    throw new PublicImagePreparationError('scope');
  // Freeze the selected facts against accidental caller mutation during a run.
  const identity = JSON.stringify([
    e.generation,
    e.digest,
    e.source,
    e.scope,
    e.ownership,
    e.verifiedAt,
    e.expiresAt,
    e.format,
  ]);
  const selected = selectPublicPreparationImages(e);
  const bytes = cache ?? createPublicVariantCache({ source: e.source });
  const lifetime = new AbortController();
  let disposed = false,
    busy = false;
  function check() {
    read.check();
    if (
      disposed ||
      !read.current() ||
      Date.now() < e.verifiedAt ||
      Date.now() >= e.expiresAt ||
      identity !==
        JSON.stringify([e.generation, e.digest, e.source, e.scope, e.ownership, e.verifiedAt, e.expiresAt, e.format])
    )
      throw new PublicImagePreparationError('scope');
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    clearTimeout(timer);
  }
  const timer = setTimeout(dispose, Math.max(0, e.expiresAt - Date.now()));
  async function prepare(
    intent: 'user-request',
    options: { signal?: AbortSignal; refresh?: boolean; offset?: number } = {}
  ): Promise<PublicImagePreparationReceipt> {
    if (intent !== 'user-request') throw new PublicImagePreparationError('intent');
    const offset = options.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || (offset > 0 && offset >= selected.descriptors.length))
      throw new PublicImagePreparationError('intent');
    check();
    if (busy) throw new PublicImagePreparationError('busy');
    busy = true;
    const signal = options.signal ? AbortSignal.any([options.signal, lifetime.signal]) : lifetime.signal;
    const current = () => {
      try {
        check();
        return !signal.aborted;
      } catch {
        return false;
      }
    };
    const verify = async () => {
      check();
      if (signal.aborted) throw new PublicImagePreparationError('scope');
      await read.verify();
      check();
      if (signal.aborted) throw new PublicImagePreparationError('scope');
    };
    const context = { current, signal };
    try {
      await verify();
      return await runBatch({ e, selected, offset, bytes, context, verify, refresh: options.refresh === true });
    } finally {
      busy = false;
    }
  }
  return { prepare, dispose };
}

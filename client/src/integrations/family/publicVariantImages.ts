import { onPrivateSessionEnd } from '../../db/privateSessionEvents';
import { registerPlaceImageLease } from '../../repo/placeImageLease';
import { isEffectivelyOffline, onNetworkModeChange } from '../../sync/networkMode';
import { onFamilyActorChange } from './actorEvents';
import { completeTripMedia } from './completeTripMedia';
import type { StoredCompleteTrip } from './completeTripV4';
import { createPublicVariantCache, type PublicVariantDescriptor } from './publicVariantCache';

export type PublicVariantDisplay = Omit<PublicVariantDescriptor, 'source'>;
export type PublicVariantResolver = (value: PublicVariantDisplay) => Promise<string | null>;
type SavedRead = { envelope: StoredCompleteTrip; check: () => void; current: () => boolean };
type Dependencies = {
  reader?: Pick<ReturnType<typeof createPublicVariantCache>, 'read'>;
  createURL?: (blob: Blob) => string;
  revokeURL?: (url: string) => void;
};
const key = (value: PublicVariantDisplay) => JSON.stringify([value.mediaAssetId, value.recipe, value.role, value.url]);

/** Display leases for one admitted saved Trip, never persisted or used as source URLs. */
export function createPublicVariantImages(read: SavedRead, deps: Dependencies = {}) {
  read.check();
  const source = read.envelope.source;
  const trip = read.envelope.bindings.find(
    (value) => value.kind === 'trip' && value.uuid === read.envelope.scope.trip_id
  );
  if (!trip) throw new Error('The saved image Trip binding is missing.');
  const reader = deps.reader ?? createPublicVariantCache({ source });
  const createURL = deps.createURL ?? ((blob) => URL.createObjectURL(blob));
  const revokeURL = deps.revokeURL ?? ((url) => URL.revokeObjectURL(url));
  const controller = new AbortController(),
    urls = new Set<string>();
  const allowed = new Set<string>(),
    pending = new Map<string, Promise<string | null>>();
  for (const variant of completeTripMedia(read.envelope).variants) {
    if (variant.recipeVersion !== 'v1') continue;
    for (const role of ['thumb', 'hero'] as const) {
      const url = role === 'hero' ? variant.heroUrl : variant.thumbUrl;
      if (url) allowed.add(key({ mediaAssetId: variant.mediaAssetId, recipe: 'v1', role, url }));
    }
  }
  let disposed = false;
  function check() {
    read.check();
    if (disposed || !read.current() || Date.now() >= read.envelope.expiresAt)
      throw new Error('This saved Trip image view has ended.');
  }
  const current = () => {
    try {
      check();
      return true;
    } catch {
      return false;
    }
  };
  const cleanup: (() => void)[] = [];
  function dispose() {
    if (disposed) return;
    disposed = true;
    controller.abort();
    for (const stop of cleanup) stop();
    for (const url of urls) revokeURL(url);
    urls.clear();
    pending.clear();
  }
  cleanup.push(
    onFamilyActorChange(dispose),
    onPrivateSessionEnd(dispose),
    registerPlaceImageLease(
      (url) => urls.has(url) && current(),
      (place) => place.trip_id === trip.key && current()
    )
  );
  cleanup.push(
    onNetworkModeChange(() => {
      if (!isEffectivelyOffline()) dispose();
    })
  );
  const expiry = setTimeout(dispose, Math.max(0, read.envelope.expiresAt - Date.now()));
  const watch = setInterval(() => {
    if (!current()) dispose();
  }, 1000);
  cleanup.push(
    () => clearTimeout(expiry),
    () => clearInterval(watch)
  );

  async function mint(value: PublicVariantDisplay) {
    check();
    let result: Awaited<ReturnType<typeof reader.read>>;
    try {
      result = await reader.read({ ...value, source }, { current, signal: controller.signal });
    } catch {
      // A missing/denied public cache becomes a placeholder; the Trip fence is still enforced.
      check();
      return null;
    }
    check();
    if (result.status !== 'ready') return null;
    const receipt = result.receipt;
    if (
      receipt.source !== source ||
      receipt.mediaAssetId !== value.mediaAssetId ||
      receipt.recipe !== value.recipe ||
      receipt.role !== value.role ||
      source + receipt.path !== value.url
    )
      return null;
    const url = createURL(result.blob);
    urls.add(url);
    try {
      check();
      if (!url.startsWith('blob:')) throw new Error('The public image display URL is unavailable.');
      return url;
    } catch (error) {
      urls.delete(url);
      revokeURL(url);
      throw error;
    }
  }
  const resolve: PublicVariantResolver = async (value) => {
    check();
    const id = key(value);
    if (!allowed.has(id)) return null;
    let work = pending.get(id);
    if (work === undefined) {
      work = mint(value);
      pending.set(id, work);
    }
    const url = await work;
    check();
    return url;
  };
  return { resolve, dispose, current };
}

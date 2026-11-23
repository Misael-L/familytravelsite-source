import { registerPlaceImageLease } from '../../repo/placeImageLease';
import { FamilyApiError } from './errors';
const marker = Symbol('family.collection.image'),
  allowed = new Map<string, number>();
type ImageScope = { current: () => boolean; thumb: string | null; hero: string | null };
type Tagged = { [marker]?: ImageScope };
// This handler remains after retirement so an old placeholder can never start a provider fallback.
registerPlaceImageLease(
  (url) => (allowed.get(url) ?? 0) > 0,
  (place) => Boolean((place as Tagged)[marker]),
  (place, role) => {
    const scope = (place as Tagged)[marker];
    if (!scope?.current()) return null;
    return role === 'thumb' ? (scope.thumb ?? scope.hero) : scope.hero;
  }
);
export function createCollectionImageLease(source: string, assertCurrent: () => void) {
  let active = true;
  const urls = new Set<string>(),
    origin = new URL(source).origin;
  const current = () => {
    if (!active) return false;
    try {
      assertCurrent();
      return true;
    } catch {
      return false;
    }
  };
  const admit = (url: string | null) => {
    if (url === null) return;
    const parsed = new URL(url);
    if (
      parsed.origin !== origin ||
      parsed.search ||
      parsed.hash ||
      !parsed.pathname.startsWith('/storage/v1/object/public/catalog/variants/v1/')
    )
      throw new FamilyApiError(502, 'collection_image_invalid', 'The stored Collection variant is unavailable.');
    if (!urls.has(url)) {
      urls.add(url);
      allowed.set(url, (allowed.get(url) ?? 0) + 1);
    }
  };
  return {
    tag<T extends { image_url?: string | null }>(
      native: T,
      cover: { thumb_url: string | null; hero_url: string | null }
    ) {
      assertCurrent();
      admit(cover.thumb_url);
      admit(cover.hero_url);
      return Object.freeze({
        ...native,
        [marker]: Object.freeze({ current, thumb: cover.thumb_url, hero: cover.hero_url }),
      });
    },
    retire() {
      if (!active) return;
      active = false;
      for (const url of urls) {
        const count = (allowed.get(url) ?? 1) - 1;
        if (count === 0) allowed.delete(url);
        else allowed.set(url, count);
      }
      urls.clear();
    },
  };
}

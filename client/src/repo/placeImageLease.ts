/** A display-only adapter port. A URL is accepted only while its original view owns it. */
type PlaceImage = { image_url?: string | null; trip_id?: number };
type ImageRole = 'thumb' | 'hero';
type ImageOwner = {
  owns: (url: string) => boolean;
  handles?: (place: PlaceImage) => boolean;
  resolve?: (place: PlaceImage, role: ImageRole) => string | null;
};
const owners = new Set<ImageOwner>();
export function registerPlaceImageLease(
  owns: (url: string) => boolean,
  handles?: (place: PlaceImage) => boolean,
  resolve?: (place: PlaceImage, role: ImageRole) => string | null
): () => void {
  const owner = { owns, handles, resolve };
  owners.add(owner);
  return () => {
    owners.delete(owner);
  };
}
export function isLeasedPlaceImage(url: string): boolean {
  return [...owners].some((owner) => owner.owns(url));
}
/** A handled miss is deliberate: native providers must not replace a saved view's placeholder. */
export function placeImageDisplay(place: PlaceImage, role: ImageRole = 'hero'): { url: string | null } | undefined {
  const owner = [...owners].find((value) => value.handles?.(place));
  if (!owner) return undefined;
  const candidate = owner.resolve ? owner.resolve(place, role) : place.image_url;
  return { url: candidate && owner.owns(candidate) ? candidate : null };
}

/** The compatibility transport for retained legacy lodging readers and publishers. */
const LEGACY_REFRESH_EVENT = 'accommodations:refresh';

/**
 * Request a fresh lodging read, without carrying records or mutation authority.
 * The explicit browser bridge stays synchronous so legacy listeners retain their
 * registration order relative to native subscribers. Retire it only when those
 * readers and publishers have moved too.
 */
export function requestStaysRefresh(): void {
  window.dispatchEvent(new CustomEvent(LEGACY_REFRESH_EVENT));
}

/**
 * Subscribe to an invalidation, not an arbitrary browser event or its payload.
 * Each subscription owns its adapter and disposer, even for a shared callback.
 * Register at subscription time to preserve ordering with legacy listeners;
 * importing this module installs nothing and retains no trip/session data.
 */
export function subscribeStaysRefresh(listener: () => void): () => void {
  const receive = (): void => listener();
  window.addEventListener(LEGACY_REFRESH_EVENT, receive);
  return () => window.removeEventListener(LEGACY_REFRESH_EVENT, receive);
}

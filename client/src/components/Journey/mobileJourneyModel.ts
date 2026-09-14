/** True when an entry has a usable map coordinate, including Null Island (0, 0). */
export function hasJourneyCoordinates(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false)
    || document.documentElement.hasAttribute('data-reduce-motion')
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function listFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(el => (
      el.tabIndex !== -1
      && !el.hasAttribute('disabled')
      && !(el instanceof HTMLInputElement && el.type === 'hidden')
    ))
}

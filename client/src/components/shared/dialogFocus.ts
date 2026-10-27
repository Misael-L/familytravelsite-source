/**
 * Keyboard focus for the booking-editor pilot. The first Tab lands in the active
 * surface, Tab wraps inside it, and a fine pointer focuses the first text field.
 * Comboboxes and fields that open a list on focus are skipped.
 */
const TEXT_FIELD = [
  'input:not([type]),input[type="text"],input[type="search"],input[type="email"],input[type="url"],input[type="tel"],input[type="number"],input[type="password"]',
  'textarea',
].join(',')

const TABBABLE = [
  'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
  '[tabindex]', '[contenteditable="true"]',
].join(',')

export type TabLikeEvent = {
  key: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  defaultPrevented: boolean
  target: EventTarget | null
  preventDefault(): void
}

function usable(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).disabled) return false
  if (el.closest('[hidden],[aria-hidden="true"],[inert]')) return false
  return el.getAttribute('tabindex') !== '-1'
}

export function tabbableItems(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(TABBABLE)).filter(usable)
}

/** The first field a user would type into, or null when the surface has none. */
export function firstTextField(panel: HTMLElement): HTMLElement | null {
  for (const el of panel.querySelectorAll<HTMLElement>(TEXT_FIELD)) {
    if (!usable(el)) continue
    if ((el as HTMLInputElement).readOnly) continue
    if (el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-haspopup') || el.hasAttribute('data-no-autofocus')) continue
    return el
  }
  return null
}

function typingDevice(): boolean {
  if (typeof window.matchMedia !== 'function') return false
  if (!window.matchMedia('(pointer: fine)').matches) return false
  return window.innerWidth >= 768
}

/**
 * Moves focus into a dialog that just opened. A fine pointer lands in the first
 * text field. A coarse pointer or a narrow window lands on the panel so a phone
 * keyboard does not open by itself.
 */
export function focusDialog(panel: HTMLElement): void {
  if (panel.contains(document.activeElement)) return
  const field = typingDevice() ? firstTextField(panel) : null
  ;(field ?? panel).focus({ preventScroll: true })
}

/** Keeps Tab inside `panel`. A key whose target is outside the panel is left alone. */
export function trapTab(event: TabLikeEvent, panel: HTMLElement): void {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
  const target = event.target as Node | null
  if (!target || (target !== panel && !panel.contains(target))) return
  const items = tabbableItems(panel)
  if (items.length === 0) {
    event.preventDefault()
    panel.focus({ preventScroll: true })
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && (target === first || target === panel)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && target === last) {
    event.preventDefault()
    first.focus()
  }
}

/** Wraps Tab inside `panel`, and pulls focus back in when it has fallen outside. */
export function containTab(event: TabLikeEvent, panel: HTMLElement): void {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
  const target = event.target as Node | null
  if (!target || (target !== panel && !panel.contains(target))) {
    event.preventDefault()
    const items = tabbableItems(panel)
    const dest = event.shiftKey ? (items[items.length - 1] ?? panel) : (items[0] ?? panel)
    dest.focus()
    return
  }
  trapTab(event, panel)
}

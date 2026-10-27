import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'

export type OwnedPickerLayer = {
  trigger: HTMLElement | null
  portal: HTMLElement | null
  close: () => void
  /** Backdrop presses dismiss portal layers. Manual date entry opts out. */
  dismissOnBackdrop?: boolean
  /** Uncommitted text that Close, Cancel, and backdrop must not drop. */
  retainsDraft?: () => boolean
}

type OwnedPickerApi = {
  register: (layer: OwnedPickerLayer) => () => void
  top: () => OwnedPickerLayer | null
  retainsDraft: () => boolean
}

const OwnedPickerLayerContext = createContext<OwnedPickerApi | null>(null)

export function useOwnedPickerLayer(): OwnedPickerApi | null {
  return useContext(OwnedPickerLayerContext)
}

/**
 * Registers an open portal while an ancestor provider exists. With no provider
 * the picker keeps its previous keyboard behavior.
 */
export function useRegisterOwnedPicker(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  portalRef: RefObject<HTMLElement | null>,
  close: () => void,
): void {
  const api = useOwnedPickerLayer()
  const closeRef = useRef(close)
  closeRef.current = close
  useLayoutEffect(() => {
    if (!open || !api) return
    return api.register({
      trigger: triggerRef.current,
      portal: portalRef.current,
      close: () => closeRef.current(),
    })
  }, [api, closeRef, open, portalRef, triggerRef])
}

export function createOwnedPickerApi(layers: { current: OwnedPickerLayer[] }): OwnedPickerApi {
  return {
    register(layer) {
      layers.current = [...layers.current, layer]
      return () => {
        layers.current = layers.current.filter(item => item !== layer)
      }
    },
    top() {
      return layers.current[layers.current.length - 1] ?? null
    },
    retainsDraft() {
      return layers.current.some(layer => layer.retainsDraft?.() === true)
    },
  }
}

/** Closes the topmost registered portal and returns focus to its trigger. */
export function dismissTopOwnedPicker(api: OwnedPickerApi): boolean {
  const top = api.top()
  if (!top) return false
  top.close()
  top.trigger?.focus()
  return true
}

/**
 * Provider plus the Escape binding used by picker regressions. The booking
 * frame uses the same dismiss helper and does not mount this root, so the two
 * listeners are never stacked.
 */
export function OwnedPickerLayerRoot({ children }: { children: ReactNode }) {
  const layers = useRef<OwnedPickerLayer[]>([])
  const api = useMemo(() => createOwnedPickerApi(layers), [])
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!dismissTopOwnedPicker(api)) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [api])
  return <OwnedPickerLayerContext.Provider value={api}>{children}</OwnedPickerLayerContext.Provider>
}

export function OwnedPickerLayerProvider({ api, children }: { api: OwnedPickerApi; children: ReactNode }) {
  return <OwnedPickerLayerContext.Provider value={api}>{children}</OwnedPickerLayerContext.Provider>
}

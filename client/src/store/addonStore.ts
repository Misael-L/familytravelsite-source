import { captureReadSession } from '../sync/readSession'
import { create } from 'zustand'
import { addonsApi } from '../api/client'

interface Addon {
  id: string
  name: string
  description?: string
  type: string
  icon: string
  enabled: boolean
  config?: Record<string, unknown>
  fields?: Array<{
    key: string
    label: string
    input_type: string
    placeholder?: string | null
    required: boolean
    secret: boolean
    settings_key?: string | null
    payload_key?: string | null
    sort_order: number
  }>
}

interface AddonState {
  addons: Addon[]
  bagTracking: boolean
  /** Tours is on and the admin allows wanderer under it. */
  toursWanderer: boolean
  /** Tours is on and the admin offers OpenHikingMap in its planner (MAP-01). */
  toursHikingMap: boolean
  /** Tours is on and the admin offers CyclOSM in its planner (BIK-06). */
  toursCycleMap: boolean
  /** The collab chat is on: the admin can switch it off inside the collab addon. */
  collabChat: boolean
  loaded: boolean
  resetAddons: () => void
  loadAddons: () => Promise<void>
  isEnabled: (id: string) => boolean
}

let addonGeneration = 0

export const useAddonStore = create<AddonState>((set, get) => ({
  addons: [],
  bagTracking: false,
  toursWanderer: false,
  toursHikingMap: false,
  toursCycleMap: false,
  collabChat: true,
  loaded: false,

  resetAddons: () => {
    addonGeneration++
    set({ addons: [], bagTracking: false, toursWanderer: false, toursHikingMap: false, toursCycleMap: false, collabChat: true, loaded: false })
  },

  loadAddons: async () => {
    const session = captureReadSession(), generation = ++addonGeneration
    const current = () => session.current() && generation === addonGeneration
    try {
      const data = await addonsApi.enabled()
      if (!current()) return
      set({ addons: data.addons || [], bagTracking: !!data.bagTracking,
        toursWanderer: !!data.toursWanderer,
        toursHikingMap: !!data.toursHikingMap,
        toursCycleMap: !!data.toursCycleMap,
        collabChat: data.collabFeatures?.chat !== false,
        loaded: true,
      })
    } catch {
      if (current()) set({ loaded: true })
    }
  },

  isEnabled: (id: string) => {
    if (id === 'memories') {
      return get().addons.some(a => a.type === 'photo_provider' && a.enabled)
    }
    return get().addons.some(a => a.id === id && a.enabled)
  },
}))

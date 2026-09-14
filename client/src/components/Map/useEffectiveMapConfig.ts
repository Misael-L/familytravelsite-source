import { useMemo } from 'react'
import { isSupabaseDataPlane } from '../../data/supabase/auth'
import { useFamilyMapStore } from '../../store/familyMapStore'
import { useSettingsStore } from '../../store/settingsStore'
import {
  publicMapRender,
  renderFromEffective,
  renderFromNestSettings,
  type EffectiveMapRender,
  type MapRenderVariant,
} from './resolveMapRender'

export function useEffectiveMapConfig(opts?: {
  public?: boolean
  variant?: MapRenderVariant
}): EffectiveMapRender {
  const variant = opts?.variant ?? 'default'
  const publicMode = opts?.public === true
  const supabasePlane = isSupabaseDataPlane()
  const familySettings = useFamilyMapStore(s => s.settings)
  const nestSettings = useSettingsStore(s => s.settings)

  return useMemo(() => {
    if (publicMode) return publicMapRender()
    if (supabasePlane) return renderFromEffective(familySettings, variant)
    return renderFromNestSettings(nestSettings, variant)
  }, [publicMode, supabasePlane, familySettings, nestSettings, variant])
}

import { authApi } from '../api/client'
import { isSupabaseDataPlane } from '../data/supabase/auth'
import { useAuthStore } from '../store/authStore'
import { usePermissionsStore, type PermissionLevel } from '../store/permissionsStore'
import { readLocal, writeLocal } from './safeStorage'

type NestAppConfig = {
  demo_mode?: boolean
  dev_mode?: boolean
  is_prerelease?: boolean
  has_maps_key?: boolean
  version?: string
  timezone?: string
  require_mfa?: boolean
  trip_reminders_enabled?: boolean
  places_photos_enabled?: boolean
  places_autocomplete_enabled?: boolean
  places_details_enabled?: boolean
  permissions?: Record<string, PermissionLevel>
}

export function applySupabaseAppFlags(): void {
  const auth = useAuthStore.getState()
  auth.setDemoMode(false)
  auth.setDevMode(false)
  auth.setIsPrerelease(false)
  auth.setAppVersion('family-travel-web')
  auth.setTripRemindersEnabled(false)
  auth.setPlacesPhotosEnabled(true)
  auth.setPlacesAutocompleteEnabled(true)
  auth.setPlacesDetailsEnabled(true)
}

/**
 * Nest-only app-config + SW version bust. Family plane never calls Nest /api.
 * Returns true if the caller should stop (a reload was triggered).
 */
export async function loadNestAppConfig(): Promise<boolean> {
  try {
    const config = await authApi.getAppConfig() as NestAppConfig
    const auth = useAuthStore.getState()
    auth.setDemoMode(!!config?.demo_mode)
    if (config?.dev_mode) auth.setDevMode(true)
    if (config?.is_prerelease !== undefined) auth.setIsPrerelease(config.is_prerelease)
    if (config?.version) auth.setAppVersion(config.version)
    if (config?.has_maps_key !== undefined) auth.setHasMapsKey(config.has_maps_key)
    if (config?.timezone) auth.setServerTimezone(config.timezone)
    if (config?.require_mfa !== undefined) auth.setAppRequireMfa(!!config.require_mfa)
    if (config?.trip_reminders_enabled !== undefined) auth.setTripRemindersEnabled(config.trip_reminders_enabled)
    if (config?.places_photos_enabled !== undefined) auth.setPlacesPhotosEnabled(config.places_photos_enabled)
    if (config?.places_autocomplete_enabled !== undefined) {
      auth.setPlacesAutocompleteEnabled(config.places_autocomplete_enabled)
    }
    if (config?.places_details_enabled !== undefined) auth.setPlacesDetailsEnabled(config.places_details_enabled)
    if (config?.permissions) usePermissionsStore.getState().setPermissions(config.permissions)

    if (config?.version) {
      const storedVersion = readLocal('trek_app_version')
      if (storedVersion && storedVersion !== config.version) {
        try {
          if ('caches' in window) {
            const names = await caches.keys()
            await Promise.all(names.map(n => caches.delete(n)))
          }
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations()
            await Promise.all(regs.map(r => r.unregister()))
          }
        } catch { /* ignore */ }
        writeLocal('trek_app_version', config.version)
        window.location.reload()
        return true
      }
      writeLocal('trek_app_version', config.version)
    }
  } catch {
    /* Nest config is non-fatal — keep last known flags */
  }
  return false
}

export function isFamilyDataPlane(): boolean {
  return isSupabaseDataPlane()
}

import { resetFamilyRealtimeForTests } from '../../legacy/data/supabase/familyRealtime';
import { resetStartupCoordinatorForTests } from '../../legacy/startup/coordinator';
import { useAddonStore } from '../../legacy/store/addonStore';
import { useAuthStore } from '../../legacy/store/authStore';
import { useFamilyFeatureStore } from '../../legacy/store/familyFeatureStore';
import { resetFamilyMapStoreForTests, useFamilyMapStore } from '../../legacy/store/familyMapStore';
import {
  resetFamilyInboxGenerationForTests,
  useInAppNotificationStore,
} from '../../legacy/store/inAppNotificationStore';
import { usePermissionsStore } from '../../legacy/store/permissionsStore';
import { useSettingsStore } from '../../legacy/store/settingsStore';
import { useTripStore } from '../../legacy/store/tripStore';
// Journey store is reset individually in journey tests to avoid circular import issues

// Capture initial states at import time (before any test modifies them)
const initialAuthState = useAuthStore.getState();
const initialTripState = useTripStore.getState();
const initialSettingsState = useSettingsStore.getState();
const initialAddonState = useAddonStore.getState();
const initialNotifState = useInAppNotificationStore.getState();
const initialPermsState = usePermissionsStore.getState();
const initialFeatureState = useFamilyFeatureStore.getState();
const initialMapState = useFamilyMapStore.getState();
export function resetAllStores(): void {
  useAuthStore.setState(initialAuthState, true);
  useTripStore.setState(initialTripState, true);
  useSettingsStore.setState(initialSettingsState, true);
  useAddonStore.setState(initialAddonState, true);
  useInAppNotificationStore.setState(initialNotifState, true);
  usePermissionsStore.setState(initialPermsState, true);
  useFamilyFeatureStore.getState().reset();
  useFamilyFeatureStore.setState(initialFeatureState, true);
  resetFamilyMapStoreForTests();
  useFamilyMapStore.setState(initialMapState, true);
  resetStartupCoordinatorForTests();
  resetFamilyInboxGenerationForTests();
  resetFamilyRealtimeForTests();
}

/**
 * Tests routinely seed a store with a partially-populated slice of state,
 * including partial nested objects (e.g. only `settings.time_format`). The
 * store's own setState wants the exact field types, so seeding accepts a
 * deep-partial view and casts at the boundary.
 */
type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

export function seedStore<T extends object>(
  store: { setState: (partial: Partial<T>, replace?: boolean) => void },
  state: DeepPartial<T>
): void {
  store.setState(state as Partial<T>);
}

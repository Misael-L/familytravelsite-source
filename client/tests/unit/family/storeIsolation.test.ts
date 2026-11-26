import { describe, expect, it } from 'vitest';
import { useFamilyFeatureStore } from '../../../src/integrations/family/legacy/store/familyFeatureStore';
import { useFamilyMapStore } from '../../../src/integrations/family/legacy/store/familyMapStore';
import { resetAllStores as resetFamilyStores } from '../../../src/integrations/family/tests/helpers/store';
import { resetAllStores as resetTrekStores } from '../../helpers/store';
import { RESET_STORES, UNRESET_STORES } from '../../helpers/storeRegistry';

describe('family store isolation', () => {
  it('lets the Family helper reset its stores and leaves them out of the TREK reset', () => {
    expect(RESET_STORES).not.toHaveProperty('useFamilyFeatureStore');
    expect(RESET_STORES).not.toHaveProperty('useFamilyMapStore');
    expect(UNRESET_STORES.useFamilyFeatureStore).toContain('client/src/integrations/family/tests/helpers/store.ts');
    expect(UNRESET_STORES.useFamilyMapStore).toContain('client/src/integrations/family/tests/helpers/store.ts');

    const feature = {
      familyId: useFamilyFeatureStore.getState().familyId,
      hydrated: useFamilyFeatureStore.getState().hydrated,
    };
    const map = { familyId: useFamilyMapStore.getState().familyId, hydrated: useFamilyMapStore.getState().hydrated };

    useFamilyFeatureStore.setState({ familyId: 'feature-dirty', hydrated: true });
    useFamilyMapStore.setState({ familyId: 'map-dirty', hydrated: true });
    resetTrekStores();
    expect(useFamilyFeatureStore.getState().familyId).toBe('feature-dirty');
    expect(useFamilyMapStore.getState().familyId).toBe('map-dirty');

    resetFamilyStores();
    expect(useFamilyFeatureStore.getState().familyId).toBe(feature.familyId);
    expect(useFamilyFeatureStore.getState().hydrated).toBe(feature.hydrated);
    expect(useFamilyMapStore.getState().familyId).toBe(map.familyId);
    expect(useFamilyMapStore.getState().hydrated).toBe(map.hydrated);

    useFamilyFeatureStore.setState({ familyId: 'feature-again', hydrated: true });
    useFamilyMapStore.setState({ familyId: 'map-again', hydrated: true });
    resetFamilyStores();
    expect(useFamilyFeatureStore.getState().familyId).toBe(feature.familyId);
    expect(useFamilyMapStore.getState().familyId).toBe(map.familyId);
  });
});

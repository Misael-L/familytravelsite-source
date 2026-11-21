import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePlaceFormOpeners } from '../../pages/tripPlanner/usePlaceFormOpeners';
import { useCanDo } from '../../store/permissionsStore';
import { useFamilyUiPermissions, type FamilyPermissionController } from './uiPermissions';
vi.mock('./runtime', () => ({ isFamilyFrontendActive: () => true }));
const trip = { id: 7 };
const hit = {
  name: 'Catalog restaurant',
  osm_id: 'catalog:food:f5000000-0000-4000-8000-000000000009',
  lat: 19.4,
  lng: -99.1,
  address: null,
  website: null,
  phone: null,
};
const controller = (outcome: 'direct' | 'propose' | 'deny', current = true) =>
  ({
    gov: { layer: 'published', actionOutcomes: { 'trip.places.manage': outcome }, canMutate: false },
    isCurrent: () => current,
    supportsAction: (action: string) => action === 'place_edit',
  }) as unknown as FamilyPermissionController;
afterEach(() => useFamilyUiPermissions.setState({ controller: null }));
it('native POI opener retained before hydration sees a current grant and subsequently refuses revocation', () => {
  useFamilyUiPermissions.setState({ controller: null });
  const h = renderHook(() => {
    const can = useCanDo(),
      [open, setShowPlaceForm] = useState(false),
      [prefill, setPrefillCoords] = useState<unknown>(null);
    const options = {
      trip,
      can,
      isMobile: false,
      placeLang: 'en',
      places: [],
      days: [],
      assignments: {},
      tripAccommodations: [],
      roadtripRoutes: { days: [] },
      roadtripCorridor: { day: null },
      roadtripActive: false,
      roadtripFeedActive: false,
      serviceStopForm: false,
      serviceStopKind: null,
      stopDraft: null,
      setShowPlaceForm,
      setPrefillCoords,
      setEditingPlace: () => {},
      setEditingAssignmentId: () => {},
      setPlaceFormDayId: () => {},
      setPlaceFormPosition: () => {},
      setServiceStopForm: () => {},
    } as unknown as Parameters<typeof usePlaceFormOpeners>[0];
    return { ...usePlaceFormOpeners(options), open, prefill, close: () => setShowPlaceForm(false) };
  });
  const original = h.result.current.openAddPlaceFromPoi;
  act(() => original(hit));
  expect(h.result.current.open).toBe(false);
  act(() => useFamilyUiPermissions.setState({ controller: controller('direct') }));
  act(() => original(hit));
  expect(h.result.current.open).toBe(true);
  expect(h.result.current.prefill).toMatchObject({ name: hit.name, osm_id: hit.osm_id, lat: hit.lat, lng: hit.lng });
  act(() => {
    h.result.current.close();
    useFamilyUiPermissions.setState({ controller: controller('deny') });
  });
  act(() => original(hit));
  expect(h.result.current.open).toBe(false);
  for (const next of [controller('propose'), controller('direct', false), null]) {
    act(() => useFamilyUiPermissions.setState({ controller: next }));
    act(() => original(hit));
    expect(h.result.current.open).toBe(false);
  }
  h.unmount();
});

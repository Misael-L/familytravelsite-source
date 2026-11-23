import { FamilyApiError } from './errors';
import { renderFromEffective } from './legacy/components/Map/resolveMapRender';
import { useAuthStore } from './legacy/store/authStore';
import { useFamilyMapStore } from './legacy/store/familyMapStore';
import { isPublicMapIsolatedPath } from './legacy/utils/publicMapRoutes';

const publicMapSettings = {
  map_provider: 'leaflet' as const,
  map_tile_url: '',
  mapbox_style: '',
  maplibre_style: '',
  mapbox_access_token: '',
  carto_api_key: '',
};

export function isNativeFamilyPublicMap() {
  return typeof window !== 'undefined' && isPublicMapIsolatedPath(window.location.pathname);
}

export function nativeFamilyMapSettings(familyId = useAuthStore.getState().familyId, publicMap = false) {
  const actor = useAuthStore.getState();
  const { settings } = useFamilyMapStore.getState();
  if (
    publicMap ||
    !actor.isAuthenticated ||
    actor.authGate !== 'ok' ||
    !settings ||
    !familyId ||
    actor.familyId !== familyId ||
    settings.familyId !== familyId ||
    !actor.personId ||
    settings.personId !== actor.personId
  )
    return publicMapSettings;

  const map = renderFromEffective(settings);
  const styleUrl = map.styleUrl ?? '';
  const maplibreStyle = map.engine === 'maplibre-gl' ? styleUrl : '';
  return {
    map_provider: map.engine,
    map_tile_url: map.option.tileTemplate ?? maplibreStyle,
    mapbox_style: map.engine === 'mapbox-gl' ? styleUrl : '',
    maplibre_style: maplibreStyle,
    mapbox_access_token: map.mapboxToken ?? '',
    carto_api_key: map.option.credential === 'carto' ? (settings.cartoApiKey ?? '') : '',
  };
}

export function subscribeNativeFamilyMapSettings(
  project: (settings: ReturnType<typeof nativeFamilyMapSettings>) => void
) {
  const unsubscribe = useFamilyMapStore.subscribe((state, previous) => {
    if (state.settings !== previous.settings) project(nativeFamilyMapSettings());
  });
  project(nativeFamilyMapSettings());
  return unsubscribe;
}

export function assertFamilyMapSettingsPatch(patch: object) {
  if (Object.keys(publicMapSettings).some((key) => Object.prototype.hasOwnProperty.call(patch, key))) {
    throw new FamilyApiError(
      422,
      'family_map_option_required',
      'Choose one of the maps enabled for your family in Map Settings.'
    );
  }
}

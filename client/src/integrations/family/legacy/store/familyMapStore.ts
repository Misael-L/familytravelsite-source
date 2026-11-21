import { create } from '@family/zustand-v4';
import { captureFamilyActor, observeFamilyActor } from '../../actorContext';
import { onFamilyActorChange } from '../../actorEvents';
import { legacyProviderToOptionId, optionIsUsable } from '../components/Map/mapRegistry';
import {
  builtinEffectiveMapSettings,
  classifyFamilyMapError,
  getMyEffectiveMapSettings,
  updateMyMapPreference,
  type EffectiveMapSettings,
  type FamilyMapErrorKind,
  type FamilyMapOptionId,
} from '../data/supabase/familyMaps';
import {
  clearFamilyMapSnapshot,
  readFamilyMapSnapshot as readLegacyMapSnapshot,
  writeFamilyMapSnapshot as writeLegacyMapSnapshot,
} from '../data/supabase/familyMapSnapshot';
import { readLocal, removeLocal } from '../startup/safeStorage';
import { FEATURE_HYDRATE_TIMEOUT_MS, withTimeout } from '../startup/timeout';
import { clearTileCache } from '../sync/tilePrefetcher';
import { isPublicMapIsolatedPath } from '../utils/publicMapRoutes';
import { useAuthStore } from './authStore';

const LOCAL_MAP_PROVIDER_KEY = 'fta_map_provider';
const LOCAL_MAPBOX_TOKEN_KEY = 'fta_mapbox_access_token';
const LAST_REVISION_PREFIX = 'fta_map_cred_rev:';

type FamilyMapState = {
  familyId: string | null;
  personId: string | null;
  settings: EffectiveMapSettings | null;
  hydrated: boolean;
  error: string | null;
  errorKind: FamilyMapErrorKind | null;
  saving: boolean;
  hydrate: (familyId: string) => Promise<void>;
  selectOption: (optionId: FamilyMapOptionId | null) => Promise<void>;
  applyAdminResult: (next: EffectiveMapSettings) => void;
  reset: () => void;
};

let hydrateGeneration = 0;
const migratedFamilies = new Set<string>();

const ownerKey = (familyId: string, personId: string | null) =>
  `fta_web_map_owner_v1:${familyId}:${personId ?? 'anon'}`;
function readFamilyMapSnapshot(familyId: string, personId: string | null) {
  if (readLocal(ownerKey(familyId, personId)) !== observeFamilyActor()) return null;
  return readLegacyMapSnapshot(familyId, personId);
}
function writeFamilyMapSnapshot(settings: EffectiveMapSettings) {
  // An unscoped legacy snapshot is never adopted as another source/account's current settings.
  writeLegacyMapSnapshot(settings);
  try {
    localStorage.setItem(ownerKey(settings.familyId, settings.personId), observeFamilyActor());
  } catch {
    /* optional cache */
  }
}

function lastRevisionKey(familyId: string): string {
  return `${LAST_REVISION_PREFIX}${familyId}`;
}

function rememberRevision(familyId: string, revision: number): void {
  const previousRaw = readLocal(lastRevisionKey(familyId));
  const previous = previousRaw ? Number(previousRaw) : 0;
  if (revision > previous && previous > 0) {
    void clearTileCache();
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(lastRevisionKey(familyId), String(revision));
    }
  } catch {
    /* private mode */
  }
}

function applySettings(familyId: string, personId: string | null, settings: EffectiveMapSettings) {
  writeFamilyMapSnapshot(settings);
  rememberRevision(familyId, settings.credentialRevision);
  return {
    familyId,
    personId,
    settings,
    hydrated: true,
    error: null,
    errorKind: null,
  };
}

async function maybeMigrateLegacyProvider(
  familyId: string,
  settings: EffectiveMapSettings,
  context: ReturnType<typeof captureFamilyActor>
): Promise<EffectiveMapSettings> {
  if (isPublicMapIsolatedPath(typeof window !== 'undefined' ? window.location.pathname : '')) {
    return settings;
  }
  context.assertCurrent();
  const migrationKey = `${context.key}:${familyId}`;
  if (migratedFamilies.has(migrationKey)) return settings;
  if (settings.selectedOptionId) {
    migratedFamilies.add(migrationKey);
    removeLocal(LOCAL_MAPBOX_TOKEN_KEY);
    return settings;
  }
  const mapped = legacyProviderToOptionId(readLocal(LOCAL_MAP_PROVIDER_KEY));
  if (
    !mapped ||
    !settings.enabledOptionIds.includes(mapped) ||
    !optionIsUsable(mapped, { mapbox: settings.mapboxPublicToken, carto: settings.cartoApiKey })
  ) {
    migratedFamilies.add(migrationKey);
    removeLocal(LOCAL_MAPBOX_TOKEN_KEY);
    return settings;
  }
  try {
    const next = await context.perform(() => updateMyMapPreference(familyId, mapped));
    removeLocal(LOCAL_MAP_PROVIDER_KEY);
    removeLocal(LOCAL_MAPBOX_TOKEN_KEY);
    migratedFamilies.add(migrationKey);
    return next;
  } catch {
    return settings;
  }
}

export function resetFamilyMapStoreForTests(): void {
  migratedFamilies.clear();
  useFamilyMapStore.getState().reset();
}

export const useFamilyMapStore = create<FamilyMapState>((set, get) => ({
  familyId: null,
  personId: null,
  settings: null,
  hydrated: false,
  error: null,
  errorKind: null,
  saving: false,

  hydrate: async (familyId: string) => {
    if (isPublicMapIsolatedPath(typeof window !== 'undefined' ? window.location.pathname : '')) {
      return;
    }
    if (get().saving) return;
    const context = captureFamilyActor();
    const gen = ++hydrateGeneration;
    const personId = useAuthStore.getState().personId ?? null;
    const switching = get().familyId !== familyId || get().personId !== personId;
    const snapshot = readFamilyMapSnapshot(familyId, personId);
    if (switching) {
      set({
        familyId,
        personId,
        hydrated: false,
        error: null,
        errorKind: null,
        settings: snapshot,
      });
    } else {
      set({ familyId, personId, error: null, errorKind: null, settings: get().settings ?? snapshot });
    }
    try {
      let result = await withTimeout(
        getMyEffectiveMapSettings(familyId),
        FEATURE_HYDRATE_TIMEOUT_MS,
        'Could not load family maps'
      );
      if (gen !== hydrateGeneration || !context.current()) return;
      if (useAuthStore.getState().familyId !== familyId) return;
      result = await maybeMigrateLegacyProvider(familyId, result, context);
      if (gen !== hydrateGeneration || !context.current()) return;
      if (useAuthStore.getState().familyId !== familyId) return;
      set(applySettings(familyId, result.personId ?? personId, result));
    } catch (err) {
      if (gen !== hydrateGeneration || !context.current()) return;
      if (useAuthStore.getState().familyId !== familyId) return;
      const fallback = snapshot ?? builtinEffectiveMapSettings(familyId, personId);
      set({
        familyId,
        personId,
        settings: fallback,
        hydrated: true,
        errorKind: classifyFamilyMapError(err),
        error: err instanceof Error ? err.message : 'Could not load family maps',
      });
    }
  },

  selectOption: async (optionId: FamilyMapOptionId | null) => {
    const context = captureFamilyActor();
    const familyId = get().familyId;
    if (!familyId) throw new Error('Family membership is required to save this setting');
    if (get().saving) throw new Error('A map choice is already being saved');
    const generation = ++hydrateGeneration;
    set({ saving: true, error: null, errorKind: null });
    try {
      const next = await context.perform(() => updateMyMapPreference(familyId, optionId));
      if (generation !== hydrateGeneration || get().familyId !== familyId)
        throw new Error('The original Family map settings are no longer active');
      set({
        ...applySettings(familyId, next.personId ?? get().personId, next),
        saving: false,
      });
    } catch (err) {
      context.assertCurrent();
      if (generation !== hydrateGeneration) throw err;
      set({
        saving: false,
        errorKind: 'save',
        error: err instanceof Error ? err.message : 'Could not save map preference',
      });
      throw err;
    }
  },

  applyAdminResult: (next: EffectiveMapSettings) => {
    const familyId = get().familyId;
    if (!familyId || next.familyId !== familyId) return;
    set(applySettings(familyId, next.personId ?? get().personId, next));
  },

  reset: () => {
    hydrateGeneration += 1;
    const familyId = get().familyId;
    const personId = get().personId;
    if (familyId) clearFamilyMapSnapshot(familyId, personId);
    set({
      familyId: null,
      personId: null,
      settings: null,
      hydrated: false,
      error: null,
      errorKind: null,
      saving: false,
    });
  },
}));

onFamilyActorChange(() => {
  hydrateGeneration++;
  // Keep original scoped cache bytes; reset only the active mirror and pending work.
  useFamilyMapStore.setState({
    familyId: null,
    personId: null,
    settings: null,
    hydrated: false,
    error: null,
    errorKind: null,
    saving: false,
  });
});

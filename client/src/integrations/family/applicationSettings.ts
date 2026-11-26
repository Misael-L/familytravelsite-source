import type { captureFamilyActor } from './actorContext';
import { isNativeFamilyPublicMap, nativeFamilyMapSettings } from './familyMapProjection';
import { readProfileDisplaySettings } from './profileDisplaySettings';
import { familySettingsStore } from './repository';

export async function readFamilyApplicationSettings(familyId: string, actor: ReturnType<typeof captureFamilyActor>) {
  const settings = familySettingsStore.getState();
  settings.hydrateSupabasePlaneSettings();
  const [, displaySettings] = await actor.perform(() =>
    Promise.all([settings.hydrateFamilyPreferences(familyId), readProfileDisplaySettings()])
  );
  return {
    settings: {
      ...familySettingsStore.getState().settings,
      ...displaySettings,
      ...nativeFamilyMapSettings(familyId, isNativeFamilyPublicMap()),
    },
  };
}

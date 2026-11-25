import { useSettingsStore } from '../../store/settingsStore';
import { captureReadSession } from '../../sync/readSession';
import type { Settings } from '../../types';
import type { StayActionScope } from '../Planner/stayActionScope';

type Preference = 'assistant_memory' | 'assistant_hints';
let flight: { current: () => boolean; promise: Promise<void> } | null = null;

/** Serialize this tab's preference maps, reading the latest value when each command starts. */
export function writeAssistantPreference<K extends Preference>(
  key: K,
  change: (before: Settings[K]) => Settings[K],
  action: StayActionScope
): Promise<void> {
  const session = captureReadSession();
  const previous = flight?.current() ? flight.promise : Promise.resolve();
  const job = { current: session.current, promise: Promise.resolve() };
  job.promise = Promise.allSettled([previous])
    .then(() =>
      action.perform(async () => {
        if (key === 'assistant_memory' && !useSettingsStore.getState().isLoaded) {
          await action.perform(() => useSettingsStore.getState().loadSettings());
          if (!useSettingsStore.getState().isLoaded) throw new Error('Error saving setting');
        }
        const before = useSettingsStore.getState().settings[key];
        const next = change(before);
        try {
          await action.perform(() => useSettingsStore.getState().updateSetting(key, next));
        } catch (error) {
          action.effect(() => {
            if (useSettingsStore.getState().settings[key] === next)
              useSettingsStore.setState((s) => ({ settings: { ...s.settings, [key]: before } }));
          });
          throw error;
        }
      })
    )
    .finally(() => {
      if (flight === job) flight = null;
    });
  flight = job;
  return job.promise;
}

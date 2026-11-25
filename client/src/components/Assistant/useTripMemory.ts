import { useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { useStayActionScope } from '../Planner/stayActionScope';
import { useToast } from '../shared/Toast';
import { writeAssistantPreference } from './assistantPreferenceWrites';

/** As long as the server reads a trip's notes; more is cut there. */
export const MAX_MEMORY_CHARS = 2_000;

/**
 * What the user keeps for the assistant to mind on one trip ("vegetarian, no
 * museums"): read from and saved to their settings, one entry per trip, so it
 * follows them to every device. Every question on the trip carries it. The
 * same for the window and the phone.
 */
export function useTripMemory(tripId: number) {
  const { t } = useTranslation();
  const toast = useToast();
  const all = useSettingsStore((s) => s.settings.assistant_memory);
  const capture = useStayActionScope(tripId);
  useEffect(() => {
    if (capture().current() && !useSettingsStore.getState().isLoaded) void useSettingsStore.getState().loadSettings();
  }, [capture]);
  const text = all?.[String(tripId)] ?? '';

  /** Saves the notes; empty ones are dropped rather than kept as a blank entry. */
  const save = async (next: string): Promise<boolean> => {
    const trimmed = next.trim().slice(0, MAX_MEMORY_CHARS);
    const action = capture();
    try {
      await writeAssistantPreference(
        'assistant_memory',
        (before) => {
          const rest = { ...(before ?? {}) };
          if (trimmed) rest[String(tripId)] = trimmed;
          else delete rest[String(tripId)];
          return rest;
        },
        action
      );
      action.effect(() => toast.success(t('assistant.memory.saved')));
      return action.current();
    } catch (e: unknown) {
      action.effect(() => toast.error(e instanceof Error ? e.message : t('common.error')));
      return false;
    }
  };

  return { text, has: text.trim().length > 0, save };
}

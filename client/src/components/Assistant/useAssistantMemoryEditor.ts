import { useEffect, useMemo } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useStayActionScope, useStayState } from '../Planner/stayActionScope';
import { useTripMemory } from './useTripMemory';

function saveFlight(capture: ReturnType<typeof useStayActionScope>) {
  let pending = false;
  return {
    start: () => {
      const action = capture();
      if (pending || !action.current()) return null;
      pending = true;
      return action;
    },
    finish: () => {
      pending = false;
    },
  };
}

/** Only the editor that began a save can finish it or close its dialog. */
export function useAssistantMemoryEditor(tripId: number, onClose: () => void) {
  const memory = useTripMemory(tripId);
  const capture = useStayActionScope(tripId);
  const owner = useMemo(() => saveFlight(capture), [capture]);
  const [draft, setValue] = useStayState(capture, memory.text);
  const [dirty, setDirty] = useStayState(capture, false);
  const [saving, setSaving] = useStayState(capture, false);
  useEffect(() => {
    if (!dirty) setValue(memory.text);
  }, [memory.text, dirty, setValue]);
  const setDraft = (next: React.SetStateAction<string>) => {
    setDirty(true);
    setValue(next);
  };
  const save = async () => {
    const action = owner.start();
    if (!action) return;
    setSaving(true);
    let done = false;
    try {
      if (!dirty && !useSettingsStore.getState().isLoaded)
        await action.perform(() => useSettingsStore.getState().loadSettings());
      if (action.current()) {
        const text = dirty ? draft : (useSettingsStore.getState().settings.assistant_memory?.[String(tripId)] ?? '');
        done = await memory.save(text);
      }
    } catch {
      /* A retired editor leaves its successor alone. */
    }
    owner.finish();
    action.effect(() => {
      setSaving(false);
      if (done) onClose();
    });
  };
  return { draft, setDraft, saving, save };
}

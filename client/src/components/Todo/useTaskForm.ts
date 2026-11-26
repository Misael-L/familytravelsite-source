import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { currentPlannerTaskPort } from '../../repo/plannerTaskPort';
import { captureReadSession } from '../../sync/readSession';
import type { TodoItem } from '../../types';
import { blankTaskFields, taskFieldsOf, type TaskFieldValues } from './todoListModel';

/** Native task fields; Family forms retain the exact observation they opened on. */
export function useTaskForm(item: TodoItem | null, category?: string | null, active = true) {
  const [name, setName] = useState(() => item?.name ?? '');
  const [fields, setFields] = useState<TaskFieldValues>(() => (item ? taskFieldsOf(item) : blankTaskFields(category)));
  const [saving, setSaving] = useState(false);
  const [taskOrigin, setTaskOrigin] = useState(() => (active ? currentPlannerTaskPort()?.bind(item) : undefined));
  const binding = useRef({ id: item?.id ?? null, origin: taskOrigin });
  const lifetime = useRef(0),
    mounted = useRef(false);
  const latest = useRef({ item, category });
  const remember = useEffectEvent(() => {
    latest.current = { item, category };
  });
  useEffect(() => {
    remember();
    const token = ++lifetime.current;
    mounted.current = active;
    if (active) {
      const next = latest.current.item,
        origin = currentPlannerTaskPort()?.bind(next);
      binding.current = { id: next?.id ?? null, origin };
      setTaskOrigin(origin);
      setName(next?.name ?? '');
      setFields(next ? taskFieldsOf(next) : blankTaskFields(latest.current.category));
      setSaving(false);
    }
    return () => {
      if (token === lifetime.current) {
        mounted.current = false;
        lifetime.current = token + 1;
        binding.current.origin?.close();
        binding.current = { id: null, origin: undefined };
      }
    };
  }, [active]);
  const patchFields = useCallback((patch: Partial<TaskFieldValues>) => setFields((f) => ({ ...f, ...patch })), []);
  const load = useCallback((next: TodoItem | null, nextCategory?: string | null) => {
    if (binding.current.origin && binding.current.id === (next?.id ?? null)) return;
    binding.current.origin?.close();
    const origin = currentPlannerTaskPort()?.bind(next);
    binding.current = { id: next?.id ?? null, origin };
    setTaskOrigin(origin);
    setName(next?.name ?? '');
    setFields(next ? taskFieldsOf(next) : blankTaskFields(nextCategory));
  }, []);
  const saveWith = async (write: (current: () => boolean) => Promise<unknown>, onError: (error: unknown) => void) => {
    const token = lifetime.current,
      owner = captureReadSession();
    const current = () => mounted.current && token === lifetime.current && owner.current();
    if (!current()) return;
    setSaving(true);
    try {
      await write(current);
    } catch (error) {
      if (current()) onError(error);
    } finally {
      if (current()) setSaving(false);
    }
  };
  return { name, setName, fields, patchFields, saving, load, saveWith, taskOrigin };
}

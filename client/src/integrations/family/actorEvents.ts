/** Dependency-free observer registry: legacy Auth and settings have an existing import cycle. */
const listeners = new Set<() => void>();
export function notifyFamilyActorChange() {
  for (const listener of listeners) listener();
}
export function onFamilyActorChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

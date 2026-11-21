import { primaryCoreMode } from '../integrations/family/corePrimaryProfile';

let owner: object | null = null;
/** A local read lease is never an authorization or a new mutation intent. */
export function installReadOnlySession() {
  if (owner) throw new Error('A read-only session already exists.');
  const captured = {};
  owner = captured;
  return () => {
    if (owner === captured) owner = null;
  };
}
export function hasReadOnlyBuild() {
  const mode = primaryCoreMode();
  return mode === 'read' || mode === 'blocked';
}

export const hasReadOnlySession = () => owner !== null || hasReadOnlyBuild();
export function assertWritableSession() {
  if (hasReadOnlyBuild()) throw new Error('Changes are paused. Previously queued work is retained.');
  if (owner) throw new Error('This saved Trip is read only. Reconnect and validate access before making changes.');
}

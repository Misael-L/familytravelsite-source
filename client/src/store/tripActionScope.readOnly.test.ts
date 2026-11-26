import { afterEach, describe, expect, it, vi } from 'vitest';
import { installReadOnlySession } from '../db/readOnlySession';
import { captureTripAction, captureTripMutation } from './tripActionScope';
import { useTripStore } from './tripStore';
afterEach(() => useTripStore.getState().resetTrip());
describe('native mutation scope during saved reading', () => {
  it('refuses a new mutation before its optimistic state set while allowing a checked read', async () => {
    const release = installReadOnlySession();
    try {
      const before = useTripStore.getState();
      expect(() => captureTripMutation(useTripStore.setState, useTripStore.getState)).toThrow('read only');
      expect(useTripStore.getState()).toBe(before);
      const read = captureTripAction(useTripStore.setState, useTripStore.getState);
      expect(await read.perform(async () => 'checked saved data')).toBe('checked saved data');
      read.set({ error: 'checked read status' });
      expect(useTripStore.getState().error).toBe('checked read status');
    } finally {
      release();
    }
  });
  it('rechecks an earlier mutation before late state, request and effect callbacks', async () => {
    const mutation = captureTripMutation(useTripStore.setState, useTripStore.getState);
    const release = installReadOnlySession(),
      request = vi.fn(),
      effect = vi.fn();
    try {
      expect(() => mutation.set({ error: 'must not apply' })).toThrow('read only');
      await expect(mutation.perform(request)).rejects.toThrow('read only');
      mutation.effect(effect);
      expect(request).not.toHaveBeenCalled();
      expect(effect).not.toHaveBeenCalled();
      expect(useTripStore.getState().error).not.toBe('must not apply');
    } finally {
      release();
    }
  });
});

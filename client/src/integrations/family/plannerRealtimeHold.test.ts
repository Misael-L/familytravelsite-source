import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { notifyFamilyActorChange } from './actorEvents';
import { afterPlannerSave, holdPlannerRealtime } from './plannerRealtimeHold';
beforeEach(() => { notifyFamilyActorChange(); vi.useFakeTimers(); });
afterEach(() => { notifyFamilyActorChange(); vi.useRealTimers(); });
it('runs ordinary live changes immediately when no save is active', () => {
  const change = vi.fn(); afterPlannerSave('trip', change); expect(change).toHaveBeenCalledOnce();
});
it('waits for all save holders and coalesces their echoes to the latest notice', async () => {
  const first = holdPlannerRealtime('trip'), second = holdPlannerRealtime('trip');
  const older = vi.fn(), latest = vi.fn();
  afterPlannerSave('trip', older); afterPlannerSave('trip', latest);
  first(); await vi.runAllTimersAsync(); expect(latest).not.toHaveBeenCalled();
  second(); expect(latest).not.toHaveBeenCalled();
  await vi.runAllTimersAsync(); expect(latest).toHaveBeenCalledOnce(); expect(older).not.toHaveBeenCalled();
});
it('does not deliver an old account notice after the actor changes', async () => {
  const release = holdPlannerRealtime('trip'), change = vi.fn();
  afterPlannerSave('trip', change); release(); notifyFamilyActorChange();
  await vi.runAllTimersAsync(); expect(change).not.toHaveBeenCalled();
});
it('keeps different trips independent and a release idempotent', async () => {
  const release = holdPlannerRealtime('trip-a'), a = vi.fn(), b = vi.fn();
  afterPlannerSave('trip-a', a); afterPlannerSave('trip-b', b);
  expect(b).toHaveBeenCalledOnce(); expect(a).not.toHaveBeenCalled();
  release(); release(); await vi.runAllTimersAsync(); expect(a).toHaveBeenCalledOnce();
});
it('retains the notice if another save starts before the deferred delivery', async () => {
  const first = holdPlannerRealtime('trip'), change = vi.fn();
  afterPlannerSave('trip', change); first(); const next = holdPlannerRealtime('trip');
  await vi.runAllTimersAsync(); expect(change).not.toHaveBeenCalled();
  next(); await vi.runAllTimersAsync(); expect(change).toHaveBeenCalledOnce();
});
